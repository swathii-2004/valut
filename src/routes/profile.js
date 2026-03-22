// src/routes/profile.js — avatar upload & partner profile
'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');

const AVATAR_DIR = path.resolve(
    process.env.AVATAR_PATH ||
    path.join(process.env.STORAGE_PATH || './storage', 'avatars')
);

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });
            cb(null, AVATAR_DIR);
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname) || '.jpg';
            cb(null, `avatar_${req.user.sub}${ext}`);
        },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Images only'));
    },
});

// GET /api/profile/me — get own profile
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, email, display_name, avatar_filename, created_at FROM users WHERE id = $1`,
            [req.user.sub]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
        const user = result.rows[0];
        return res.json({
            id: user.id,
            email: user.email,
            display_name: user.display_name || user.email.split('@')[0],
            avatar_url: user.avatar_filename ? `/api/profile/avatar/${user.id}` : null,
        });
    } catch (err) {
        console.error('[PROFILE] GET /me error:', err.message);
        return res.status(500).json({ error: 'Failed to get profile' });
    }
});

// GET /api/profile/partner — get partner profile
router.get('/partner', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, email, display_name, avatar_filename FROM users WHERE id != $1 LIMIT 1`,
            [req.user.sub]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'No partner' });
        const user = result.rows[0];
        return res.json({
            id: user.id,
            email: user.email,
            display_name: user.display_name || user.email.split('@')[0],
            avatar_url: user.avatar_filename ? `/api/profile/avatar/${user.id}` : null,
        });
    } catch (err) {
        console.error('[PROFILE] GET /partner error:', err.message);
        return res.status(500).json({ error: 'Failed to get partner profile' });
    }
});

// GET /api/profile/avatar/:userId — serve avatar image (no auth needed for display)
router.get('/avatar/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(`SELECT avatar_filename FROM users WHERE id = $1`, [userId]);
        if (!result.rows.length || !result.rows[0].avatar_filename) {
            return res.status(404).json({ error: 'No avatar' });
        }
        const filePath = path.resolve(path.join(AVATAR_DIR, result.rows[0].avatar_filename));
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
        res.set('Cache-Control', 'no-store');
        res.sendFile(filePath);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to serve avatar' });
    }
});

// PUT /api/profile/avatar — upload own avatar
router.put('/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image provided' });
        await pool.query(
            `UPDATE users SET avatar_filename = $1 WHERE id = $2`,
            [req.file.filename, req.user.sub]
        );
        console.log(`[PROFILE] Avatar updated for ${req.user.email}`);
        return res.json({
            avatar_url: `/api/profile/avatar/${req.user.sub}`,
            avatar_filename: req.file.filename,
        });
    } catch (err) {
        console.error('[PROFILE] PUT /avatar error:', err.message);
        return res.status(500).json({ error: 'Failed to upload avatar' });
    }
});

// PUT /api/profile/display-name — update display name
router.put('/display-name', authMiddleware, async (req, res) => {
    try {
        const { display_name } = req.body;
        if (!display_name?.trim()) return res.status(400).json({ error: 'Name required' });
        await pool.query(
            `UPDATE users SET display_name = $1 WHERE id = $2`,
            [display_name.trim(), req.user.sub]
        );
        return res.json({ display_name: display_name.trim() });
    } catch (err) {
        console.error('[PROFILE] PUT /display-name error:', err.message);
        return res.status(500).json({ error: 'Failed to update name' });
    }
});

// POST /api/profile/push-token — save Expo push token
router.post('/push-token', authMiddleware, async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ error: 'Token required' });
        await pool.query(
            `UPDATE users SET push_token = $1 WHERE id = $2`,
            [token, req.user.sub]
        );
        console.log(`[PROFILE] Push token saved for ${req.user.email}`);
        return res.json({ success: true });
    } catch (err) {
        console.error('[PROFILE] POST /push-token error:', err.message);
        return res.status(500).json({ error: 'Failed to save push token' });
    }
});

module.exports = router;
