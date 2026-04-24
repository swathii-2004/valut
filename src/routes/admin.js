// src/routes/admin.js
// Admin-only endpoints:
//   POST /admin/keys/rotate  — live vault key rotation in background batches
//   GET  /admin/audit/verify — SHA-256 chain integrity check
// Protected by a static ADMIN_SECRET header (set ADMIN_SECRET in .env).
'use strict';

const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { verifyAuditChain } = require('../utils/auditLog');
const {
    decryptKeyWithMaster,
    encryptKeyWithMaster,
    generateVaultKey,
} = require('../utils/vaultCrypto');
const { encrypt: encryptLegacy, decrypt: decryptLegacy } = require('../utils/crypto');

// ── Admin auth guard ──────────────────────────────────────────────
function adminGuard(req, res, next) {
    const secret = req.headers['x-admin-secret'];
    if (!secret || secret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({});
    }
    next();
}

// ═══════════════════════════════════════════════════════════════════
// POST /admin/keys/rotate
// Rotates the vault key for a specific vault.
// Body: { vault_id: "<uuid>" }
//
// Flow:
//   1. Generate new vault key
//   2. Insert new encryption_keys row (status: 'active')
//   3. Set old key_version rows to 'retiring'
//   4. Re-encrypt all files in batches of 50 using OLD and NEW vault keys
//   5. Mark old key_version as 'retired'
//
// For legacy vaults (encrypted_key = 'LEGACY') this uses the global ENCRYPTION_KEY_Vn env vars.
// ═══════════════════════════════════════════════════════════════════
router.post('/keys/rotate', adminGuard, async (req, res) => {
    const { vault_id } = req.body;
    if (!vault_id) return res.status(400).json({ error: 'vault_id required' });

    try {
        // 1. Fetch vault + current key info
        const vaultRes = await pool.query(
            `SELECT id, encrypted_key, key_iv, key_tag FROM vaults WHERE id = $1`,
            [vault_id]
        );
        if (!vaultRes.rows.length) return res.status(404).json({ error: 'Vault not found' });
        const vault = vaultRes.rows[0];

        const isLegacy = vault.encrypted_key === 'LEGACY';

        // 2. Determine current active key version for this vault's files
        const currentKeyRes = await pool.query(
            `SELECT DISTINCT key_version FROM files WHERE vault_id = $1 AND is_deleted = FALSE ORDER BY key_version DESC LIMIT 1`,
            [vault_id]
        );
        const oldKeyVersion = currentKeyRes.rows[0]?.key_version;
        if (!oldKeyVersion) {
            return res.json({ ok: true, message: 'No files to rotate' });
        }

        // 3. Insert new encryption_keys entry
        const newKeyVersionRes = await pool.query(
            `INSERT INTO encryption_keys (version, status)
             VALUES ((SELECT COALESCE(MAX(version), 0) + 1 FROM encryption_keys), 'active')
             RETURNING version`
        );
        const newKeyVersion = parseInt(newKeyVersionRes.rows[0].version, 10);

        // 4. Set old key to 'retiring'
        await pool.query(
            `UPDATE encryption_keys SET status = 'retiring' WHERE version = $1`,
            [oldKeyVersion]
        );

        // Acknowledge immediately — rotation runs in background
        res.json({
            ok             : true,
            old_key_version: oldKeyVersion,
            new_key_version: newKeyVersion,
            message        : 'Key rotation started in background',
        });

        // 5. Background rotation
        ;(async () => {
            const storagePath = process.env.STORAGE_PATH;
            const fs   = require('fs');
            const path = require('path');
            const { encryptWithVaultKey, decryptWithVaultKey } = require('../utils/vaultCrypto');

            // Resolve keys
            let oldVaultKey = null;
            let newVaultKey = null;

            if (!isLegacy) {
                oldVaultKey = decryptKeyWithMaster(vault.encrypted_key, vault.key_iv, vault.key_tag);
            }

            // Generate new vault key and store it
            newVaultKey = generateVaultKey();
            const { encryptedKey, iv: keyIv, tag: keyTag } = encryptKeyWithMaster(newVaultKey);
            await pool.query(
                `UPDATE vaults SET encrypted_key = $1, key_iv = $2, key_tag = $3 WHERE id = $4`,
                [encryptedKey, keyIv, keyTag, vault_id]
            );

            const BATCH = 50;
            let offset  = 0;
            let migrated = 0;

            while (true) {
                const batch = await pool.query(
                    `SELECT id, stored_filename, iv, auth_tag, name_iv, name_auth_tag,
                            encrypted_name, key_version
                     FROM files
                     WHERE vault_id = $1 AND is_deleted = FALSE AND key_version = $2
                     ORDER BY created_at ASC
                     LIMIT $3 OFFSET $4`,
                    [vault_id, oldKeyVersion, BATCH, offset]
                );

                if (!batch.rows.length) break;

                for (const file of batch.rows) {
                    try {
                        const filePath = path.join(storagePath, vault_id, file.stored_filename);
                        if (!fs.existsSync(filePath)) continue;

                        const encBytes = fs.readFileSync(filePath);

                        // Decrypt with old key
                        const plainBytes = isLegacy
                            ? decryptLegacy(encBytes, file.iv, file.auth_tag, parseInt(file.key_version, 10))
                            : decryptWithVaultKey(encBytes, file.iv, file.auth_tag, oldVaultKey);

                        // Decrypt filename with old key
                        const encName = Buffer.from(file.encrypted_name, 'hex');
                        const plainName = isLegacy
                            ? decryptLegacy(encName, file.name_iv, file.name_auth_tag, parseInt(file.key_version, 10))
                            : decryptWithVaultKey(encName, file.name_iv, file.name_auth_tag, oldVaultKey);

                        // Re-encrypt with new vault key
                        const newEncFile = encryptWithVaultKey(plainBytes, newVaultKey);
                        const newEncName = encryptWithVaultKey(plainName, newVaultKey);

                        // Write new file
                        fs.writeFileSync(filePath, newEncFile.ciphertext);

                        // Update DB row
                        await pool.query(
                            `UPDATE files
                             SET iv = $1, auth_tag = $2, key_version = $3,
                                 encrypted_name = $4, name_iv = $5, name_auth_tag = $6
                             WHERE id = $7`,
                            [
                                newEncFile.iv, newEncFile.authTag, newKeyVersion,
                                newEncName.ciphertext.toString('hex'), newEncName.iv, newEncName.authTag,
                                file.id,
                            ]
                        );

                        migrated++;
                    } catch (fileErr) {
                        console.error(`[ROTATE] ❌ File ${file.id} error:`, fileErr.message);
                    }
                }

                offset += BATCH;
            }

            // Zero keys from memory
            if (oldVaultKey) oldVaultKey.fill(0);
            newVaultKey.fill(0);

            // Mark old key as retired
            await pool.query(
                `UPDATE encryption_keys SET status = 'retired', retired_at = NOW() WHERE version = $1`,
                [oldKeyVersion]
            );

            console.log(`[ROTATE] ✅ Vault ${vault_id}: rotated ${migrated} files. Old v${oldKeyVersion} → New v${newKeyVersion}`);
        })().catch(err => console.error('[ROTATE] Background rotation error:', err.message));

    } catch (err) {
        console.error('[ADMIN] POST /keys/rotate error:', err.message);
        // Response already sent; log only
    }
});


// ═══════════════════════════════════════════════════════════════════
// GET /admin/audit/verify
// Walks the entire access_logs chain and verifies SHA-256 integrity.
// Returns { valid: true, rows: N } or { valid: false, brokenAt: <id> }
// ═══════════════════════════════════════════════════════════════════
router.get('/audit/verify', adminGuard, async (req, res) => {
    try {
        const result = await verifyAuditChain();
        return res.json(result);
    } catch (err) {
        console.error('[ADMIN] GET /audit/verify error:', err.message);
        return res.status(500).json({ error: 'Verification failed' });
    }
});

module.exports = router;
