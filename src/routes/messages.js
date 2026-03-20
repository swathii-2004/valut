// src/routes/messages.js
'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { encrypt, decrypt } = require('../utils/crypto');
const authMiddleware = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// Helper — get active key version
async function getActiveKeyVersion() {
    const res = await pool.query(`SELECT version FROM encryption_keys WHERE status = 'active' ORDER BY version DESC LIMIT 1`);
    if (!res.rows.length) throw new Error('No active encryption key');
    return parseInt(res.rows[0].version, 10);
}

// Helper — get partner's user ID (the other user)
async function getPartnerId(myId) {
    const res = await pool.query(`SELECT id FROM users WHERE id != $1 LIMIT 1`, [myId]);
    if (!res.rows.length) throw new Error('No partner found');
    return res.rows[0].id;
}

// Helper — decrypt a message row into safe shape
function decryptMessage(row, keyVersion) {
    let content = null;
    if (row.type === 'text' && row.content && row.content_iv && row.content_tag) {
        try {
            content = decrypt(
                Buffer.from(row.content, 'hex'),
                row.content_iv,
                row.content_tag,
                parseInt(row.key_version || keyVersion, 10)
            ).toString('utf8');
        } catch { content = '[encrypted]'; }
    }
    // Decrypt file name if present
    let fileName = null;
    if (row.encrypted_name && row.name_iv && row.name_auth_tag) {
        try {
            fileName = decrypt(
                Buffer.from(row.encrypted_name, 'hex'),
                row.name_iv,
                row.name_auth_tag,
                parseInt(row.file_key_version || keyVersion, 10)
            ).toString('utf8');
        } catch { fileName = 'File'; }
    }
    return {
        id: row.id,
        sender_id: row.sender_id,
        receiver_id: row.receiver_id,
        type: row.type,
        content,
        file_id: row.file_id,
        file_name: fileName,
        file_size: row.file_size_bytes || null,
        mime_type: row.file_mime_type || null,
        reply_to_id: row.reply_to_id,
        is_deleted: row.is_deleted,
        is_read: row.is_read,
        read_at: row.read_at,
        created_at: row.created_at,
        reactions: row.reactions || [],
    };
}

// ══════════════════════════════════════════════
// GET /api/messages?before=<ISO>&limit=50
// Fetch paginated message history
// ══════════════════════════════════════════════
router.get('/', authMiddleware, async (req, res) => {
    try {
        const myId = req.user.sub;
        const partnerId = await getPartnerId(myId);
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const before = req.query.before ? new Date(req.query.before) : new Date();

        const result = await pool.query(
            `SELECT m.*,
                f.mime_type as file_mime_type,
                f.file_size_bytes,
                f.encrypted_name, f.name_iv, f.name_auth_tag,
                f.key_version as file_key_version,
                COALESCE(
                    json_agg(json_build_object('emoji', mr.emoji, 'user_id', mr.user_id))
                    FILTER (WHERE mr.id IS NOT NULL), '[]'
                ) AS reactions
             FROM messages m
             LEFT JOIN files f ON f.id = m.file_id
             LEFT JOIN message_reactions mr ON mr.message_id = m.id
             WHERE ((m.sender_id = $1 AND m.receiver_id = $2)
                 OR (m.sender_id = $2 AND m.receiver_id = $1))
               AND m.is_deleted = FALSE
               AND m.created_at < $3
             GROUP BY m.id, f.mime_type, f.file_size_bytes, f.encrypted_name, f.name_iv, f.name_auth_tag, f.key_version
             ORDER BY m.created_at DESC
             LIMIT $4`,
            [myId, partnerId, before, limit]
        );

        const keyVersion = await getActiveKeyVersion();
        const messages = result.rows.map(r => decryptMessage(r, keyVersion)).reverse();

        return res.json({ messages, has_more: result.rows.length === limit, partner_id: partnerId });
    } catch (err) {
        console.error('[MESSAGES] GET error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// ══════════════════════════════════════════════
// POST /api/messages — send encrypted text
// ══════════════════════════════════════════════
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { content, reply_to_id } = req.body;
        if (!content?.trim()) return res.status(400).json({ error: 'Content required' });

        const myId = req.user.sub;
        const partnerId = await getPartnerId(myId);
        const keyVersion = await getActiveKeyVersion();

        // Encrypt text content
        const enc = encrypt(Buffer.from(content.trim(), 'utf8'), keyVersion);

        const result = await pool.query(
            `INSERT INTO messages
               (sender_id, receiver_id, type, content, content_iv, content_tag, key_version, reply_to_id) VALUES ($1, $2, 'text', $3, $4, $5, $6, $7)
             RETURNING *`,
            [myId, partnerId, enc.ciphertext.toString('hex'), enc.iv, enc.authTag, keyVersion, reply_to_id || null]
        );

        const msg = decryptMessage(result.rows[0], keyVersion);

        // Emit real-time event
        const socketState = require('../socket');
        const roomId = [myId, partnerId].sort().join('_');
        socketState.getIo()?.to(roomId).emit('new_message', msg);

        console.log(`[MESSAGES] 📨 Text sent: ${req.user.email} → partner`);
        return res.status(201).json({ message: msg });
    } catch (err) {
        console.error('[MESSAGES] POST error:', err.message);
        return res.status(500).json({ error: 'Failed to send message' });
    }
});

// ══════════════════════════════════════════════
// POST /api/messages/media — send media file
// Reuses existing file encryption system
// ══════════════════════════════════════════════
router.post('/media', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file provided' });

        const { mimetype, originalname, buffer } = req.file;
        const myId = req.user.sub;
        const partnerId = await getPartnerId(myId);
        const keyVersion = await getActiveKeyVersion();

        // Determine message type
        let type = 'file';
        if (mimetype.startsWith('image/')) type = 'image';
        else if (mimetype.startsWith('video/')) type = 'video';
        else if (mimetype.startsWith('audio/')) type = 'audio';

        // Encrypt file
        const encFile = encrypt(buffer, keyVersion);
        const encName = encrypt(Buffer.from(originalname, 'utf8'), keyVersion);
        const storedFilename = uuidv4();

        const storagePath = process.env.STORAGE_PATH;
        if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });
        fs.writeFileSync(path.join(storagePath, storedFilename), encFile.ciphertext);

        // Insert into files table
        const fileResult = await pool.query(
            `INSERT INTO files
               (owner_id, stored_filename, iv, auth_tag, key_version,
                encrypted_name, name_iv, name_auth_tag, mime_type, file_size_bytes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [myId, storedFilename, encFile.iv, encFile.authTag, keyVersion,
             encName.ciphertext.toString('hex'), encName.iv, encName.authTag, mimetype, buffer.length]
        );
        const fileId = fileResult.rows[0].id;

        // Insert into messages table
        const msgResult = await pool.query(
            `INSERT INTO messages (sender_id, receiver_id, type, file_id, key_version)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [myId, partnerId, type, fileId, keyVersion]
        );

        const msg = {
            ...decryptMessage(msgResult.rows[0], keyVersion),
            file_name: originalname,
            file_size: buffer.length,
            mime_type: mimetype,
        };

        const socketState = require('../socket');
        const roomId = [myId, partnerId].sort().join('_');
        socketState.getIo()?.to(roomId).emit('new_message', msg);

        console.log(`[MESSAGES] 📎 Media sent: ${req.user.email} → partner (${type})`);
        return res.status(201).json({ message: msg });
    } catch (err) {
        console.error('[MESSAGES] POST /media error:', err.message);
        return res.status(500).json({ error: 'Failed to send media' });
    }
});

// ══════════════════════════════════════════════
// DELETE /api/messages/:id — soft delete
// ══════════════════════════════════════════════
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const myId = req.user.sub;

        const result = await pool.query(
            `UPDATE messages SET is_deleted = TRUE
             WHERE id = $1 AND sender_id = $2 AND is_deleted = FALSE
             RETURNING id`,
            [id, myId]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Message not found or not yours' });

        const socketState = require('../socket');
        const partnerId = await getPartnerId(myId);
        const roomId = [myId, partnerId].sort().join('_');
        socketState.getIo()?.to(roomId).emit('message_deleted', { messageId: id });

        return res.json({ message: 'Deleted' });
    } catch (err) {
        console.error('[MESSAGES] DELETE error:', err.message);
        return res.status(500).json({ error: 'Failed to delete message' });
    }
});

// ══════════════════════════════════════════════
// PUT /api/messages/:id/read — mark as read
// ══════════════════════════════════════════════
router.put('/:id/read', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const myId = req.user.sub;

        await pool.query(
            `UPDATE messages SET is_read = TRUE, read_at = NOW()
             WHERE id = $1 AND receiver_id = $2 AND is_read = FALSE`,
            [id, myId]
        );

        const socketState = require('../socket');
        const partnerId = await getPartnerId(myId);
        const roomId = [myId, partnerId].sort().join('_');
        socketState.getIo()?.to(roomId).emit('message_read_ack', { messageId: id, readBy: myId });

        return res.json({ ok: true });
    } catch (err) {
        console.error('[MESSAGES] PUT /read error:', err.message);
        return res.status(500).json({ error: 'Failed to mark read' });
    }
});

// ══════════════════════════════════════════════
// POST /api/messages/:id/react — add reaction
// ══════════════════════════════════════════════
router.post('/:id/react', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { emoji } = req.body;
        const myId = req.user.sub;
        if (!emoji) return res.status(400).json({ error: 'Emoji required' });

        await pool.query(
            `INSERT INTO message_reactions (message_id, user_id, emoji)
             VALUES ($1, $2, $3)
             ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = $3`,
            [id, myId, emoji]
        );

        const socketState = require('../socket');
        const partnerId = await getPartnerId(myId);
        const roomId = [myId, partnerId].sort().join('_');
        socketState.getIo()?.to(roomId).emit('reaction_update', { messageId: id, userId: myId, emoji });

        return res.json({ ok: true });
    } catch (err) {
        console.error('[MESSAGES] POST /react error:', err.message);
        return res.status(500).json({ error: 'Failed to add reaction' });
    }
});

// ══════════════════════════════════════════════
// DELETE /api/messages/:id/react — remove reaction
// ══════════════════════════════════════════════
router.delete('/:id/react', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const myId = req.user.sub;

        await pool.query(
            `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2`,
            [id, myId]
        );

        const socketState = require('../socket');
        const partnerId = await getPartnerId(myId);
        const roomId = [myId, partnerId].sort().join('_');
        socketState.getIo()?.to(roomId).emit('reaction_update', { messageId: id, userId: myId, emoji: null });

        return res.json({ ok: true });
    } catch (err) {
        console.error('[MESSAGES] DELETE /react error:', err.message);
        return res.status(500).json({ error: 'Failed to remove reaction' });
    }
});

// ══════════════════════════════════════════════
// GET /api/messages/search?q= — search messages
// ══════════════════════════════════════════════
router.get('/search', authMiddleware, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q?.trim()) return res.status(400).json({ error: 'Query required' });

        const myId = req.user.sub;
        const partnerId = await getPartnerId(myId);
        const keyVersion = await getActiveKeyVersion();

        const result = await pool.query(
            `SELECT * FROM messages
             WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
               AND type = 'text' AND is_deleted = FALSE
             ORDER BY created_at DESC LIMIT 200`,
            [myId, partnerId]
        );

        // Decrypt and filter client-side (encrypted in DB)
        const query = q.trim().toLowerCase();
        const matches = result.rows
            .map(r => decryptMessage(r, keyVersion))
            .filter(m => m.content && m.content.toLowerCase().includes(query));

        return res.json({ messages: matches });
    } catch (err) {
        console.error('[MESSAGES] GET /search error:', err.message);
        return res.status(500).json({ error: 'Search failed' });
    }
});

module.exports = router;

