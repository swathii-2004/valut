// src/routes/vault.js
// Vault management: create, join, status, regenerate, mine
// All vault_id values are derived server-side — never from client input.
'use strict';

const express      = require('express');
const router       = express.Router();
const crypto       = require('crypto');
const pool         = require('../db/pool');
const authMiddleware                         = require('../middleware/auth');
const { verifyVaultMember, verifyVaultActive } = require('../middleware/vault');
const { generateVaultKey, encryptKeyWithMaster } = require('../utils/vaultCrypto');
const { writeAuditLog }                      = require('../utils/auditLog');
const rateLimit    = require('express-rate-limit');

// ── Rate limiter for join attempts (5 per IP per 15 min) ──
const joinLimiter = rateLimit({
    windowMs       : 15 * 60 * 1000,
    max            : 5,
    message        : {},   // 429 with empty body — no detail leaked
    standardHeaders: true,
    legacyHeaders  : false,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a cryptographically random 8-char uppercase alphanumeric code. */
function generateInviteCode() {
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = crypto.randomBytes(16);
    let code    = '';
    for (const b of bytes) {
        if (code.length >= 8) break;
        const idx = b % CHARS.length;
        code += CHARS[idx];
    }
    return code;
}

/** SHA-256 hash of the plain invite code for storage. */
function hashInviteCode(code) {
    return crypto.createHash('sha256').update(code).digest('hex');
}

// ═══════════════════════════════════════════════════════════════════
// POST /api/vault/create
// Partner A creates a new vault and receives the one-time invite code.
// ═══════════════════════════════════════════════════════════════════
router.post('/create', authMiddleware, async (req, res) => {
    const userId = req.user.sub;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Check user has no existing vault
        const existing = await client.query(
            `SELECT vault_id FROM vault_members WHERE user_id = $1`,
            [userId]
        );
        if (existing.rows.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'You are already a member of a vault' });
        }

        // 2. Generate and encrypt vault key
        const plainVaultKey  = generateVaultKey();
        const { encryptedKey, iv: keyIv, tag: keyTag } = encryptKeyWithMaster(plainVaultKey);

        // 3. Generate invite code
        const plainCode  = generateInviteCode();
        const codeHash   = hashInviteCode(plainCode);
        const expiresAt  = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // 4. Insert vault (status: 'pending')
        const vaultRes = await client.query(
            `INSERT INTO vaults (encrypted_key, key_iv, key_tag, invite_code_hash, invite_expires_at, status)
             VALUES ($1, $2, $3, $4, $5, 'pending')
             RETURNING id, status, created_at`,
            [encryptedKey, keyIv, keyTag, codeHash, expiresAt]
        );
        const vault = vaultRes.rows[0];

        // 5. Add Partner A to vault_members
        await client.query(
            `INSERT INTO vault_members (vault_id, user_id) VALUES ($1, $2)`,
            [vault.id, userId]
        );

        await client.query('COMMIT');

        // Zero-out plain key from memory ASAP
        plainVaultKey.fill(0);

        await writeAuditLog({
            userId,
            action   : 'vault_created',
            ip       : req.ip,
            userAgent: req.headers['user-agent'],
            success  : true,
            metadata : { vault_id: vault.id },
        });

        console.log(`[VAULT] 🔒 Created: ${vault.id} by ${req.user.email}`);

        // Return plain code once — never stored, never logged
        return res.status(201).json({
            vault_id   : vault.id,
            invite_code: plainCode,       // shown to user exactly once
            expires_at : expiresAt,
            status     : vault.status,
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[VAULT] POST /create error:', err.message);
        return res.status(500).json({ error: 'Failed to create vault' });
    } finally {
        client.release();
    }
});


// ═══════════════════════════════════════════════════════════════════
// POST /api/vault/join
// Partner B joins using the 8-char invite code.
// Max 2 members enforced inside a DB transaction to handle race conditions.
// ═══════════════════════════════════════════════════════════════════
router.post('/join', authMiddleware, joinLimiter, async (req, res) => {
    const { invite_code } = req.body;
    if (!invite_code?.trim()) return res.status(400).json({ error: 'invite_code required' });

    const userId    = req.user.sub;
    const codeHash  = hashInviteCode(invite_code.trim().toUpperCase());
    const client    = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Check user has no existing vault
        const existing = await client.query(
            `SELECT vault_id FROM vault_members WHERE user_id = $1`,
            [userId]
        );
        if (existing.rows.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'You are already a member of a vault' });
        }

        // 2. Look up vault by hashed code — lock the row to prevent race condition
        const vaultRes = await client.query(
            `SELECT id, status, invite_expires_at
             FROM vaults
             WHERE invite_code_hash = $1
             FOR UPDATE`,           // row-level lock
            [codeHash]
        );

        if (!vaultRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(403).json({});  // No detail — code wrong or expired
        }

        const vault = vaultRes.rows[0];

        // 3. Validate: not expired
        if (!vault.invite_expires_at || new Date(vault.invite_expires_at) < new Date()) {
            await client.query('ROLLBACK');
            return res.status(403).json({});
        }

        // 4. Validate: vault is still pending
        if (vault.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(403).json({});
        }

        // 5. Validate: member count < 2 (race-condition safe — row is locked)
        const countRes = await client.query(
            `SELECT COUNT(*) FROM vault_members WHERE vault_id = $1`,
            [vault.id]
        );
        if (parseInt(countRes.rows[0].count) >= 2) {
            await client.query('ROLLBACK');
            return res.status(403).json({});
        }

        // 6. Add Partner B
        await client.query(
            `INSERT INTO vault_members (vault_id, user_id) VALUES ($1, $2)`,
            [vault.id, userId]
        );

        // 7. Activate vault + invalidate invite code atomically
        await client.query(
            `UPDATE vaults
             SET status = 'active',
                 invite_code_hash  = NULL,
                 invite_expires_at = NOW() - INTERVAL '1 second'
             WHERE id = $1`,
            [vault.id]
        );

        await client.query('COMMIT');

        // 8. Notify Partner A via Socket.io
        const socketState = require('../socket');
        socketState.getIo()?.to(`vault:${vault.id}`).emit('vault_activated', {
            vault_id: vault.id,
            joined_by: userId,
        });

        await writeAuditLog({
            userId,
            action   : 'vault_joined',
            ip       : req.ip,
            userAgent: req.headers['user-agent'],
            success  : true,
            metadata : { vault_id: vault.id },
        });

        console.log(`[VAULT] ✅ Joined: ${vault.id} by ${req.user.email}`);

        return res.json({ vault_id: vault.id, status: 'active' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[VAULT] POST /join error:', err.message);
        return res.status(500).json({ error: 'Failed to join vault' });
    } finally {
        client.release();
    }
});


// ═══════════════════════════════════════════════════════════════════
// GET /api/vault/status
// Partner A polls this while waiting for Partner B to join.
// ═══════════════════════════════════════════════════════════════════
router.get('/status', authMiddleware, verifyVaultMember, async (req, res) => {
    try {
        const vaultId = req.vaultId;

        const result = await pool.query(
            `SELECT v.status, v.invite_expires_at,
                    u.id as partner_id, u.display_name as partner_name,
                    u.email as partner_email
             FROM vaults v
             LEFT JOIN vault_members vm ON vm.vault_id = v.id AND vm.user_id != $1
             LEFT JOIN users u ON u.id = vm.user_id
             WHERE v.id = $2`,
            [req.user.sub, vaultId]
        );

        if (!result.rows.length) return res.status(404).json({ error: 'Vault not found' });

        const row = result.rows[0];

        return res.json({
            vault_id         : vaultId,
            status           : row.status,
            invite_expires_at: row.invite_expires_at,
            partner: row.partner_id ? {
                id          : row.partner_id,
                display_name: row.partner_name || row.partner_email?.split('@')[0],
            } : null,
        });

    } catch (err) {
        console.error('[VAULT] GET /status error:', err.message);
        return res.status(500).json({ error: 'Failed to get vault status' });
    }
});


// ═══════════════════════════════════════════════════════════════════
// POST /api/vault/regenerate
// Partner A regenerates the invite code (only if vault is still 'pending').
// ═══════════════════════════════════════════════════════════════════
router.post('/regenerate', authMiddleware, verifyVaultMember, async (req, res) => {
    try {
        if (req.vaultStatus !== 'pending') {
            return res.status(403).json({ error: 'Vault is no longer pending' });
        }

        const plainCode = generateInviteCode();
        const codeHash  = hashInviteCode(plainCode);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await pool.query(
            `UPDATE vaults
             SET invite_code_hash = $1, invite_expires_at = $2
             WHERE id = $3`,
            [codeHash, expiresAt, req.vaultId]
        );

        console.log(`[VAULT] 🔄 Code regenerated: ${req.vaultId}`);

        return res.json({
            invite_code: plainCode,
            expires_at : expiresAt,
        });

    } catch (err) {
        console.error('[VAULT] POST /regenerate error:', err.message);
        return res.status(500).json({ error: 'Failed to regenerate code' });
    }
});


// ═══════════════════════════════════════════════════════════════════
// GET /api/vault/mine
// Returns vault info + partner details.
// Returns { vault: null } if user has no vault yet (used by _layout.js).
// ═══════════════════════════════════════════════════════════════════
router.get('/mine', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.sub;

        const result = await pool.query(
            `SELECT v.id, v.status, v.invite_expires_at,
                    u.id as partner_id, u.display_name as partner_name,
                    u.email as partner_email, u.avatar_filename as partner_avatar
             FROM vault_members vm
             JOIN vaults v ON v.id = vm.vault_id
             LEFT JOIN vault_members vm2 ON vm2.vault_id = v.id AND vm2.user_id != $1
             LEFT JOIN users u ON u.id = vm2.user_id
             WHERE vm.user_id = $1`,
            [userId]
        );

        if (!result.rows.length) {
            return res.json({ vault: null });
        }

        const row = result.rows[0];

        return res.json({
            vault: {
                id               : row.id,
                status           : row.status,
                invite_expires_at: row.invite_expires_at,
                partner: row.partner_id ? {
                    id          : row.partner_id,
                    display_name: row.partner_name || row.partner_email?.split('@')[0],
                    avatar_url  : row.partner_avatar ? `/api/profile/avatar/${row.partner_id}` : null,
                } : null,
            },
        });

    } catch (err) {
        console.error('[VAULT] GET /mine error:', err.message);
        return res.status(500).json({ error: 'Failed to get vault info' });
    }
});

module.exports = router;
