const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');

async function getPartnerId(myId) {
    const res = await pool.query(`SELECT id FROM users WHERE id != $1 LIMIT 1`, [myId]);
    if (!res.rows.length) throw new Error('No partner found');
    return res.rows[0].id;
}

// GET /api/dates — get all shared dates
router.get('/', authMiddleware, async (req, res) => {
    try {
        const myId = req.user.sub;
        const partnerId = await getPartnerId(myId);

        const result = await pool.query(
            `SELECT * FROM special_dates 
             WHERE user_id = $1 OR user_id = $2
             ORDER BY date ASC`,
            [myId, partnerId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('[DATES] GET error:', err.message);
        res.status(500).json({ error: 'Failed to fetch dates' });
    }
});

// POST /api/dates — add a new date
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { title, date, is_recurring } = req.body;
        if (!title || !date) return res.status(400).json({ error: 'Title and date required' });

        const myId = req.user.sub;

        const result = await pool.query(
            `INSERT INTO special_dates (user_id, title, date, is_recurring)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [myId, title.trim(), date, !!is_recurring]
        );

        // Notify partner via sockets if connected
        const partnerId = await getPartnerId(myId);
        const socketState = require('../socket');
        const roomId = [myId, partnerId].sort().join('_');
        socketState.getIo()?.to(roomId).emit('new_date', result.rows[0]);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('[DATES] POST error:', err.message);
        res.status(500).json({ error: 'Failed to add date' });
    }
});

// DELETE /api/dates/:id
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const myId = req.user.sub;

        // Only allow deleting if they own it, or maybe allow partner to delete too?
        // Let's allow the owner or partner to delete it for now since it's a shared vault.
        const partnerId = await getPartnerId(myId);

        const result = await pool.query(
            `DELETE FROM special_dates WHERE id = $1 AND (user_id = $2 OR user_id = $3) RETURNING id`,
            [id, myId, partnerId]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Date not found or unauthorized' });

        // Notify partner via sockets
        const socketState = require('../socket');
        const roomId = [myId, partnerId].sort().join('_');
        socketState.getIo()?.to(roomId).emit('deleted_date', { id });

        res.json({ success: true });
    } catch (err) {
        console.error('[DATES] DELETE error:', err.message);
        res.status(500).json({ error: 'Failed to delete date' });
    }
});

module.exports = router;
