// src/routes/devices.js
// Phase 13.6: Device Management for Multi-Device E2EE
'use strict';

const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const authMiddleware = require('../middleware/auth');

/**
 * POST /api/devices
 * Register a new device for the authenticated user.
 * Body: { identity_public_key: string, device_name: string, push_token: string }
 */
router.post('/', authMiddleware, async (req, res) => {
    const { identity_public_key, device_name, push_token } = req.body;
    const userId = req.user.sub;

    if (!identity_public_key) {
        return res.status(400).json({ error: 'identity_public_key is required' });
    }

    try {
        // UPSERT: Insert new device or update if the same identity key is used
        const result = await pool.query(
            `INSERT INTO devices (user_id, identity_public_key, signing_public_key, device_name, push_token)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (identity_public_key) 
             DO UPDATE SET 
                signing_public_key = EXCLUDED.signing_public_key,
                device_name = EXCLUDED.device_name,
                push_token = COALESCE(EXCLUDED.push_token, devices.push_token),
                last_seen_at = NOW()
             RETURNING id, identity_public_key, signing_public_key, device_name, created_at`,
            [userId, identity_public_key, req.body.signing_public_key || null, device_name || 'Generic Device', push_token || null]
        );

        console.log(`[DEVICES] 📱 Registered: ${result.rows[0].id} for user: ${userId}`);
        return res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('[DEVICES] POST / error:', err.message);
        return res.status(500).json({ error: 'Failed to register device' });
    }
});

/**
 * GET /api/devices
 * List all devices for the current user.
 */
router.get('/', authMiddleware, async (req, res) => {
    const userId = req.user.sub;

    try {
        const result = await pool.query(
            `SELECT id, identity_public_key, signing_public_key, device_name, push_token, last_seen_at, created_at, is_verified 
             FROM devices 
             WHERE user_id = $1 
             ORDER BY last_seen_at DESC`,
            [userId]
        );
        return res.json({ devices: result.rows });
    } catch (err) {
        console.error('[DEVICES] GET / error:', err.message);
        return res.status(500).json({ error: 'Failed to list devices' });
    }
});

/**
 * GET /api/devices/partner
 * List all devices for the calling user's partner.
 */
router.get('/partner', authMiddleware, async (req, res) => {
    const userId = req.user.sub;

    try {
        // 1. Find partner ID
        const partnerRes = await pool.query(
            `SELECT user_id FROM vault_members 
             WHERE vault_id IN (SELECT vault_id FROM vault_members WHERE user_id = $1)
             AND user_id != $1`,
            [userId]
        );
        
        if (!partnerRes.rows.length) return res.json({ devices: [] });
        const partnerId = partnerRes.rows[0].user_id;

        // 2. Fetch partner devices
        const result = await pool.query(
            `SELECT id, identity_public_key, signing_public_key, device_name, last_seen_at, is_verified 
             FROM devices 
             WHERE user_id = $1 
             ORDER BY last_seen_at DESC`,
            [partnerId]
        );
        return res.json({ devices: result.rows });
    } catch (err) {
        console.error('[DEVICES] GET /partner error:', err.message);
        return res.status(500).json({ error: 'Failed to list partner devices' });
    }
});

/**
 * POST /api/devices/verify
 * Mark a partner's device as verified.
 * Body: { device_id: uuid, signature: string }
 */
router.post('/verify', authMiddleware, async (req, res) => {
    const { device_id, signature } = req.body;
    const userId = req.user.sub;

    try {
        // 1. Verify that the device belongs to the partner
        const checkRes = await pool.query(
            `SELECT d.id FROM devices d
             JOIN vault_members vm ON vm.user_id = d.user_id
             WHERE d.id = $1 AND vm.vault_id IN (SELECT vault_id FROM vault_members WHERE user_id = $2)
             AND d.user_id != $2`,
            [device_id, userId]
        );

        if (!checkRes.rows.length) {
            return res.status(404).json({ error: 'Partner device not found' });
        }

        // 2. Update status
        await pool.query(
            `UPDATE devices 
             SET is_verified = TRUE, verification_proof = $1, verified_by_user_id = $2, verified_at = NOW()
             WHERE id = $3`,
            [signature, userId, device_id]
        );

        console.log(`[DEVICES] ✅ Device ${device_id} verified by ${userId}`);
        return res.json({ success: true });
    } catch (err) {
        console.error('[DEVICES] POST /verify error:', err.message);
        return res.status(500).json({ error: 'Failed to verify device' });
    }
});

/**
 * DELETE /api/devices/:id
 * Unregister/Revoke a specific device.
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    const deviceId = req.params.id;
    const userId   = req.user.sub;

    try {
        const result = await pool.query(
            `DELETE FROM devices WHERE id = $1 AND user_id = $2 RETURNING id`,
            [deviceId, userId]
        );
        if (!result.rows.length) {
            return res.status(404).json({ error: 'Device not found or not yours' });
        }
        console.log(`[DEVICES] 🗑️ Revoked: ${deviceId} for user: ${userId}`);
        return res.json({ success: true });
    } catch (err) {
        console.error('[DEVICES] DELETE /:id error:', err.message);
        return res.status(500).json({ error: 'Failed to revoke device' });
    }
});

module.exports = router;
