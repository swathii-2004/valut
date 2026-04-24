// src/middleware/vault.js
// Vault-scoped middleware — runs AFTER authMiddleware (JWT verification).
// Attaches req.vaultId, req.vaultStatus, and req.vaultKey to every protected request.
// vault_id is ALWAYS derived server-side — never trusted from the client.
// All 403 responses return {} — no error detail leaked.
'use strict';

const pool = require('../db/pool');
const { decryptKeyWithMaster } = require('../utils/vaultCrypto');

/**
 * verifyVaultMember
 * Looks up the vault that the authenticated user belongs to.
 * Attaches to req:
 *   - req.vaultId      {string}  — UUID of the vault
 *   - req.vaultStatus  {string}  — 'pending' | 'active' | 'suspended'
 *   - req.vaultKey     {Buffer}  — decrypted 32-byte vault key (in-memory only)
 *
 * Legacy vaults (encrypted_key = 'LEGACY') skip key decryption — they rely on ENCRYPTION_KEY_V1.
 */
async function verifyVaultMember(req, res, next) {
    try {
        const userId = req.user.sub;

        const result = await pool.query(
            `SELECT vm.vault_id, v.status, v.encrypted_key, v.key_iv, v.key_tag
             FROM vault_members vm
             JOIN vaults v ON v.id = vm.vault_id
             WHERE vm.user_id = $1`,
            [userId]
        );

        if (!result.rows.length) return res.status(403).json({});

        const { vault_id, status, encrypted_key, key_iv, key_tag } = result.rows[0];

        req.vaultId     = vault_id;
        req.vaultStatus = status;

        // Decrypt vault key — legacy vaults use global env key (handled by routes)
        if (encrypted_key === 'LEGACY') {
            req.vaultKey = null; // routes check for null and fall back to crypto.js getKey()
        } else {
            req.vaultKey = decryptKeyWithMaster(encrypted_key, key_iv, key_tag);
        }

        next();
    } catch (err) {
        console.error('[VAULT MW] verifyVaultMember error:', err.message);
        return res.status(403).json({});
    }
}

/**
 * verifyVaultActive
 * Rejects the request with 403 {} if the vault is not in 'active' state.
 * Must run AFTER verifyVaultMember.
 */
function verifyVaultActive(req, res, next) {
    if (req.vaultStatus !== 'active') return res.status(403).json({});
    next();
}

module.exports = { verifyVaultMember, verifyVaultActive };
