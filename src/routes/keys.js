// src/routes/keys.js
// Phase 9.1 & 9.2: Key Management for E2EE
'use strict';

const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const authMiddleware = require('../middleware/auth');

/**
 * PUT /api/keys/identity
 * Allows a user to upload or update their long-term identity public key.
 */
router.put('/identity', authMiddleware, async (req, res) => {
    const { public_key, key_type = 'X25519' } = req.body;
    const userId = req.user.sub;

    if (!public_key) {
        return res.status(400).json({ error: 'public_key is required' });
    }

    try {
        await pool.query(
            `UPDATE users 
             SET identity_public_key = $1, identity_key_type = $2 
             WHERE id = $3`,
            [public_key, key_type, userId]
        );

        console.log(`[KEYS] ✅ Identity key updated for user: ${userId} (${key_type})`);
        return res.json({ success: true });
    } catch (err) {
        console.error('[KEYS] PUT /identity error:', err.message);
        return res.status(500).json({ error: 'Failed to update identity key' });
    }
});

/**
 * GET /api/keys/identity/:userId
 * Fetches the public key of a specific user.
 */
router.get('/identity/:userId', authMiddleware, async (req, res) => {
    const targetUserId = req.params.userId;

    try {
        const result = await pool.query(
            `SELECT identity_public_key, identity_key_type, signing_public_key 
             FROM users 
             WHERE id = $1`,
            [targetUserId]
        );

        if (!result.rows.length) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { identity_public_key, identity_key_type, signing_public_key } = result.rows[0];

        if (!identity_public_key) {
            return res.status(404).json({ error: 'User has not generated an identity key yet' });
        }

        return res.json({
            user_id: targetUserId,
            public_key: identity_public_key,
            key_type: identity_key_type,
            signing_public_key: signing_public_key
        });
    } catch (err) {
        console.error('[KEYS] GET /identity/:userId error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch identity key' });
    }
});

/**
 * POST /api/keys/vault
 * Stores an encrypted vault key for a specific user and device.
 * Body: { vault_id: uuid, target_user_id: uuid, target_device_id: uuid, encrypted_key: string, key_version: number }
 */
router.post('/vault', authMiddleware, async (req, res) => {
    const { vault_id, target_user_id, target_device_id, encrypted_key, ephemeral_public_key, key_version = 1 } = req.body;
    const userId = req.user.sub;

    if (!vault_id || !target_user_id || !target_device_id || !encrypted_key || !ephemeral_public_key) {
        return res.status(400).json({ error: 'vault_id, target_user_id, target_device_id, encrypted_key, and ephemeral_public_key are required' });
    }

    try {
        // 1. Verify membership
        const membership = await pool.query(
            `SELECT vault_id FROM vault_members WHERE vault_id = $1 AND user_id = $2`,
            [vault_id, userId]
        );
        if (!membership.rows.length) return res.status(403).json({ error: 'Vault membership required' });

        // 2. Verify target device belongs to a vault member and is VERIFIED
        const deviceCheck = await pool.query(
            `SELECT d.id, d.is_verified FROM devices d
             JOIN vault_members vm ON vm.user_id = d.user_id
             WHERE d.id = $1 AND d.user_id = $2 AND vm.vault_id = $3`,
            [target_device_id, target_user_id, vault_id]
        );
        if (!deviceCheck.rows.length) {
            return res.status(403).json({ error: 'Target device not found or not in vault' });
        }

        // For key rotations (version > 1), require the target device to be verified.
        // The initial key exchange (version 1) is always allowed so the vault can be used.
        if (key_version > 1 && !deviceCheck.rows[0].is_verified && target_user_id !== userId) {
            return res.status(403).json({
                error: 'SECURITY_ENFORCEMENT: Target device must be verified before receiving rotated Vault Keys.'
            });
        }

        // 3. Store the encrypted vault key
        await pool.query(
            `INSERT INTO vault_keys (vault_id, user_id, device_id, encrypted_vault_key, ephemeral_public_key, key_version)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (vault_id, user_id, device_id, key_version)
             DO UPDATE SET encrypted_vault_key = EXCLUDED.encrypted_vault_key,
                           ephemeral_public_key = EXCLUDED.ephemeral_public_key`,
            [vault_id, target_user_id, target_device_id, encrypted_key, ephemeral_public_key, key_version]
        );

        console.log(`[KEYS] 🔐 Vault key stored for device: ${target_device_id}`);
        return res.json({ success: true });
    } catch (err) {
        console.error('[KEYS] POST /vault error:', err.message);
        return res.status(500).json({ error: 'Failed to store vault key' });
    }
});

/**
 * GET /api/keys/vault/:vaultId
 * Fetches all encrypted vault keys for the calling user's devices.
 * Optional query: ?device_id=UUID to filter.
 */
router.get('/vault/:vaultId', authMiddleware, async (req, res) => {
    const vaultId = req.params.vaultId;
    const userId  = req.user.sub;
    const { device_id } = req.query;

    try {
        let query = `SELECT encrypted_vault_key, ephemeral_public_key, key_version, device_id
                     FROM vault_keys
                     WHERE vault_id = $1 AND user_id = $2`;
        const params = [vaultId, userId];

        if (device_id) {
            query += ` AND device_id = $3`;
            params.push(device_id);
        }

        query += ` ORDER BY key_version DESC`;

        const result = await pool.query(query, params);

        return res.json({
            vault_id: vaultId,
            keys: result.rows.map(r => ({
                device_id:           r.device_id,
                encrypted_key:       r.encrypted_vault_key,
                ephemeral_public_key: r.ephemeral_public_key,
                key_version:         r.key_version
            }))
        });
    } catch (err) {
        console.error('[KEYS] GET /vault/:vaultId error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch vault keys' });
    }
});

module.exports = router;
