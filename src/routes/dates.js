// src/routes/dates.js
// All queries scoped to req.vaultId (injected by verifyVaultMember).
// getPartnerId() removed — partner is found via vault_members.
'use strict';

const express  = require('express');
const router   = express.Router();
const pool     = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const { verifyVaultMember, verifyVaultActive } = require('../middleware/vault');

const protect = [authMiddleware, verifyVaultMember, verifyVaultActive];

// ══════════════════════════════════════════════
// GET /api/dates — get all shared dates for vault
// ══════════════════════════════════════════════
router.get('/', protect, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM special_dates
             WHERE vault_id = $1
             ORDER BY date ASC`,
            [req.vaultId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('[DATES] GET error:', err.message);
        res.status(500).json({ error: 'Failed to fetch dates' });
    }
});

// ══════════════════════════════════════════════
// POST /api/dates — add a new date
// ══════════════════════════════════════════════
router.post('/', protect, async (req, res) => {
    try {
        const { title, date, is_recurring } = req.body;
        if (!title || !date) return res.status(400).json({ error: 'Title and date required' });

        const result = await pool.query(
            `INSERT INTO special_dates (vault_id, user_id, title, date, is_recurring)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.vaultId, req.user.sub, title.trim(), date, !!is_recurring]
        );

        // Notify partner via vault-scoped socket room
        const socketState = require('../socket');
        socketState.getIo()?.to(`vault:${req.vaultId}`).emit('new_date', result.rows[0]);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('[DATES] POST error:', err.message);
        res.status(500).json({ error: 'Failed to add date' });
    }
});

// ══════════════════════════════════════════════
// DELETE /api/dates/:id
// Both vault members can delete a shared date.
// ══════════════════════════════════════════════
router.delete('/:id', protect, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify the date belongs to this vault before deleting
        const result = await pool.query(
            `DELETE FROM special_dates
             WHERE id = $1 AND vault_id = $2
             RETURNING id`,
            [id, req.vaultId]
        );

        if (!result.rows.length) {
            return res.status(404).json({ error: 'Date not found or unauthorized' });
        }

        const socketState = require('../socket');
        socketState.getIo()?.to(`vault:${req.vaultId}`).emit('deleted_date', { id });

        res.json({ success: true });
    } catch (err) {
        console.error('[DATES] DELETE error:', err.message);
        res.status(500).json({ error: 'Failed to delete date' });
    }
});

module.exports = router;
