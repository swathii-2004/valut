const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
require('dotenv').config();

const router = express.Router();

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_EXP = '15m';
const REFRESH_TOKEN_EXP = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
const MAX_ATTEMPTS = 10;
const LOCKOUT_MINUTES = 30;

function generateAccessToken(user) {
    return jwt.sign(
        { sub: user.id, email: user.email, jti: uuidv4() },
        process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_EXP }
    );
}

function generateRefreshToken() {
    return crypto.randomBytes(64).toString('hex');
}

async function logAccess(userId, action, req, extra = {}) {
    try {
        await pool.query(
            `INSERT INTO access_logs (user_id, action, ip_address, user_agent, success, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, action, req.ip, req.headers['user-agent'], extra.success ?? true, JSON.stringify(extra)]
        );
    } catch (e) {
        console.error('Log error:', e.message);
    }
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { email, password, display_name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 12) return res.status(400).json({ error: 'Password must be at least 12 characters' });

    try {
        const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
        if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });

        const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const result = await pool.query(
            `INSERT INTO users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, 'member') RETURNING id, email`,
            [email.toLowerCase(), password_hash, display_name || null]
        );

        res.status(201).json({ message: 'Account created', user_id: result.rows[0].id });
    } catch (err) {
        console.error('Register error:', err.message);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    try {
        const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
        const user = result.rows[0];

        // Same error for wrong email or wrong password — prevent user enumeration
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        // Check lockout
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            await logAccess(user.id, 'login_failure', req, { success: false });
            return res.status(423).json({ error: 'Account temporarily locked', retry_after: user.locked_until });
        }

        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            const newCount = user.failed_attempts + 1;
            const lockout = newCount >= MAX_ATTEMPTS
                ? new Date(Date.now() + LOCKOUT_MINUTES * 60000)
                : null;

            await pool.query(
                'UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE id = $3',
                [newCount, lockout, user.id]
            );
            await logAccess(user.id, 'login_failure', req, { success: false });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Reset failed attempts
        await pool.query(
            'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1',
            [user.id]
        );

        // Generate tokens
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken();
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const familyId = uuidv4();
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXP);

        await pool.query(
            `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, device_hint)
       VALUES ($1, $2, $3, $4, $5)`,
            [user.id, tokenHash, familyId, expiresAt, req.headers['x-device-hint'] || null]
        );

        await logAccess(user.id, 'login_success', req, { success: true });

        res.json({ access_token: accessToken, refresh_token: refreshToken });
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: 'Login failed' });
    }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'Refresh token required' });

    try {
        const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
        const result = await pool.query(
            `SELECT * FROM refresh_tokens WHERE token_hash = $1 AND is_revoked = FALSE AND expires_at > NOW()`,
            [tokenHash]
        );

        if (!result.rows.length) {
            // Possible token reuse attack — revoke entire family
            const stolen = await pool.query('SELECT * FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
            if (stolen.rows.length) {
                await pool.query('UPDATE refresh_tokens SET is_revoked = TRUE WHERE family_id = $1', [stolen.rows[0].family_id]);
            }
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        const oldToken = result.rows[0];

        // Revoke old token
        await pool.query('UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW() WHERE id = $1', [oldToken.id]);

        // Get user
        const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [oldToken.user_id]);
        const user = userResult.rows[0];

        // Issue new tokens
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken();
        const newHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXP);

        await pool.query(
            `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, device_hint)
       VALUES ($1, $2, $3, $4, $5)`,
            [user.id, newHash, oldToken.family_id, expiresAt, oldToken.device_hint]
        );

        await logAccess(user.id, 'token_refresh', req, { success: true });

        res.json({ access_token: accessToken, refresh_token: refreshToken });
    } catch (err) {
        console.error('Refresh error:', err.message);
        res.status(500).json({ error: 'Token refresh failed' });
    }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
    const { refresh_token } = req.body;

    try {
        if (refresh_token) {
            const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
            await pool.query(
                'UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW() WHERE token_hash = $1',
                [tokenHash]
            );
        }

        if (req.user) await logAccess(req.user.sub, 'logout', req, { success: true });

        res.json({ message: 'Logged out successfully' });
    } catch (err) {
        console.error('Logout error:', err.message);
        res.status(500).json({ error: 'Logout failed' });
    }
});

module.exports = router;