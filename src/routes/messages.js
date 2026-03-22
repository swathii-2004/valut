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
const { sendPushToUser, getMessagePreview } = require('../utils/pushNotifications');

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
    if ((row.type === 'text' || row.type === 'gif' || row.type === 'thinking_of_you') && row.content && row.content_iv && row.content_tag) {
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
    // Decrypt reply_to text if present
    let replyToContent = null;
    if ((row.rt_type === 'text' || row.rt_type === 'gif') && row.rt_content && row.rt_content_iv && row.rt_content_tag) {
        try {
            replyToContent = decrypt(
                Buffer.from(row.rt_content, 'hex'),
                row.rt_content_iv,
                row.rt_content_tag,
                parseInt(row.rt_key_version || keyVersion, 10)
            ).toString('utf8');
        } catch { replyToContent = '[message]'; }
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
        reply_to_id: row.reply_to_id || null,
        reply_to: row.reply_to_id ? {
            id: row.reply_to_id,
            type: row.rt_type || 'text',
            content: replyToContent,
            file_id: row.rt_file_id || null,
            sender_id: row.rt_sender_id || null,
        } : null,
        view_once: row.view_once || false,
        view_max: row.view_max || 1,
        view_count: row.view_count || 0,
        is_deleted: row.is_deleted,
        is_read: row.is_read,
        read_at: row.read_at,
        created_at: row.created_at,
        reactions: row.reactions || [],
        is_starred: row.is_starred || false,
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
                CASE WHEN m.view_once = TRUE AND m.view_count >= COALESCE(m.view_max,1) AND m.receiver_id = $1
                     THEN NULL ELSE m.file_id END as file_id,
                rt.type        as rt_type,
                rt.sender_id   as rt_sender_id,
                rt.file_id     as rt_file_id,
                rt.content     as rt_content,
                rt.content_iv  as rt_content_iv,
                rt.content_tag as rt_content_tag,
                rt.key_version as rt_key_version,
                COALESCE(
                    json_agg(json_build_object('emoji', mr.emoji, 'user_id', mr.user_id))
                    FILTER (WHERE mr.id IS NOT NULL), '[]'
                ) AS reactions
             FROM messages m
             LEFT JOIN files f ON f.id = m.file_id
             LEFT JOIN messages rt ON rt.id = m.reply_to_id
             LEFT JOIN message_reactions mr ON mr.message_id = m.id
             WHERE ((m.sender_id = $1 AND m.receiver_id = $2)
                 OR (m.sender_id = $2 AND m.receiver_id = $1))
               AND m.is_deleted = FALSE
               AND m.created_at < $3
             GROUP BY m.id, f.mime_type, f.file_size_bytes, f.encrypted_name, f.name_iv, f.name_auth_tag, f.key_version,
                      rt.type, rt.sender_id, rt.file_id, rt.content, rt.content_iv, rt.content_tag, rt.key_version
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
        const { content, reply_to_id, type = 'text' } = req.body;
        if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
        const isGif = type === 'gif';

        const myId = req.user.sub;
        const partnerId = await getPartnerId(myId);
        const keyVersion = await getActiveKeyVersion();

        // Encrypt text content
        const enc = encrypt(Buffer.from(content.trim(), 'utf8'), keyVersion);

        const result = await pool.query(
            `INSERT INTO messages
               (sender_id, receiver_id, type, content, content_iv, content_tag, key_version, reply_to_id) VALUES ($1, $2, $8, $3, $4, $5, $6, $7)
             RETURNING *`,
            [myId, partnerId, enc.ciphertext.toString('hex'), enc.iv, enc.authTag, keyVersion, reply_to_id || null, type]
        );

        const msg = decryptMessage(result.rows[0], keyVersion);

        // Fetch reply_to content so socket payload includes the full quote
        if (reply_to_id) {
            try {
                const rtRes = await pool.query(
                    `SELECT type, sender_id, file_id, content, content_iv, content_tag, key_version FROM messages WHERE id = $1`,
                    [reply_to_id]
                );
                if (rtRes.rows.length > 0) {
                    const rt = rtRes.rows[0];
                    let replyToContent = null;
                    if ((rt.type === 'text' || rt.type === 'gif' || rt.type === 'thinking_of_you') && rt.content && rt.content_iv && rt.content_tag) {
                        try {
                            replyToContent = decrypt(
                                Buffer.from(rt.content, 'hex'),
                                rt.content_iv, rt.content_tag,
                                parseInt(rt.key_version || keyVersion, 10)
                            ).toString('utf8');
                        } catch { replyToContent = '[message]'; }
                    }
                    msg.reply_to = { id: reply_to_id, type: rt.type, content: replyToContent, file_id: rt.file_id, sender_id: rt.sender_id };
                }
            } catch { /* non-fatal */ }
        }

        // Emit real-time event
        const socketState = require('../socket');
        const roomId = [myId, partnerId].sort().join('_');
        socketState.getIo()?.to(roomId).emit('new_message', msg);

        console.log(`[MESSAGES] 📨 Text sent: ${req.user.email} → partner`);

        // Push notification to partner
        const senderRes = await pool.query(`SELECT display_name FROM users WHERE id = $1`, [myId]);
        const senderName = senderRes.rows[0]?.display_name || req.user.email.split('@')[0];

        const previewTitle = type === 'thinking_of_you' ? '💭 Thinking of you' : senderName;
        const previewBody = type === 'thinking_of_you'
            ? `${senderName} is thinking of you ❤️`
            : getMessagePreview(type, content.trim());

        sendPushToUser(partnerId, previewTitle, previewBody, { type: 'message', messageId: msg.id });

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
        const viewOnce = req.body?.view_once === 'true' || req.body?.view_once === true;
        const viewMax = parseInt(req.body?.view_max) || 1;

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

        // Insert into messages table (with view_once support)
        const msgResult = await pool.query(
            `INSERT INTO messages (sender_id, receiver_id, type, file_id, key_version, view_once, view_max)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [myId, partnerId, type, fileId, keyVersion, viewOnce, viewMax]
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

        console.log(`[MESSAGES] 📎 Media sent: ${req.user.email} → partner (${type}${viewOnce ? ' view-once' : ''})`);

        // Push notification to partner
        const senderRes = await pool.query(`SELECT display_name FROM users WHERE id = $1`, [myId]);
        const senderName = senderRes.rows[0]?.display_name || req.user.email.split('@')[0];
        const preview = getMessagePreview(type, msg.file_name);
        sendPushToUser(partnerId, senderName, preview, { type: 'message', messageId: msg.id });

        return res.status(201).json({ message: msg });
    } catch (err) {
        console.error('[MESSAGES] POST /media error:', err.message);
        return res.status(500).json({ error: 'Failed to send media' });
    }
});

// ══════════════════════════════════════════════
// PUT /api/messages/:id/edit — edit unseen text
// Only allowed if: sender = me, type = text/sticker, is_read = FALSE
// ══════════════════════════════════════════════
router.put('/:id/edit', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        const myId = req.user.sub;

        if (!content?.trim()) return res.status(400).json({ error: 'Content required' });

        // Check message exists, belongs to me, is text type, and not yet read
        const check = await pool.query(
            `SELECT id, type, is_read, key_version FROM messages
             WHERE id = $1 AND sender_id = $2 AND is_deleted = FALSE`,
            [id, myId]
        );
        if (!check.rows.length) return res.status(404).json({ error: 'Message not found or not yours' });
        const msg = check.rows[0];
        if (msg.type !== 'text') return res.status(403).json({ error: 'Only text messages can be edited' });
        if (msg.is_read) return res.status(403).json({ error: 'Cannot edit a message that has been read' });

        const keyVersion = await getActiveKeyVersion();
        const enc = encrypt(Buffer.from(content.trim(), 'utf8'), keyVersion);

        await pool.query(
            `UPDATE messages SET content = $1, content_iv = $2, content_tag = $3, key_version = $4
             WHERE id = $5`,
            [enc.ciphertext.toString('hex'), enc.iv, enc.authTag, keyVersion, id]
        );

        const socketState = require('../socket');
        const partnerId = await getPartnerId(myId);
        const roomId = [myId, partnerId].sort().join('_');
        socketState.getIo()?.to(roomId).emit('message_edited', { messageId: id, content: content.trim() });

        console.log(`[MESSAGES] ✏️ Edited: ${id}`);
        return res.json({ ok: true, content: content.trim() });
    } catch (err) {
        console.error('[MESSAGES] PUT /edit error:', err.message);
        return res.status(500).json({ error: 'Failed to edit message' });
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
// POST /api/messages/:id/viewed — view-once tracking
// ══════════════════════════════════════════════
router.post('/:id/viewed', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const myId = req.user.sub;
        // Increment view count and return new count
        const result = await pool.query(
            `UPDATE messages SET view_count = COALESCE(view_count, 0) + 1
             WHERE id = $1 AND receiver_id = $2 AND view_once = TRUE
             RETURNING view_count, view_max`,
            [id, myId]
        );
        if (!result.rows.length) return res.json({ ok: true, already: true });
        const { view_count, view_max } = result.rows[0];
        const exhausted = view_count >= (view_max || 1);

        const socketState = require('../socket');
        const partnerId = await getPartnerId(myId);
        const roomId = [myId, partnerId].sort().join('_');
        socketState.getIo()?.to(roomId).emit('view_once_opened', { messageId: id, viewCount: view_count, exhausted });

        return res.json({ ok: true, view_count, exhausted });
    } catch (err) {
        console.error('[MESSAGES] POST /viewed error:', err.message);
        return res.status(500).json({ error: 'Failed to record view' });
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


// ══════════════════════════════════════════════
// GET /api/messages/starred — fetch starred msg
// ══════════════════════════════════════════════
router.get('/starred', authMiddleware, async (req, res) => {
    try {
        const myId = req.user.sub;
        const partnerId = await getPartnerId(myId);

        const result = await pool.query(
            `SELECT m.*,
                f.mime_type as file_mime_type,
                f.file_size_bytes,
                f.encrypted_name, f.name_iv, f.name_auth_tag,
                f.key_version as file_key_version
             FROM messages m
             LEFT JOIN files f ON f.id = m.file_id
             WHERE ((m.sender_id = $1 AND m.receiver_id = $2)
                 OR (m.sender_id = $2 AND m.receiver_id = $1))
               AND m.is_deleted = FALSE
               AND m.is_starred = TRUE
             ORDER BY m.created_at DESC`,
            [myId, partnerId]
        );

        const keyVersion = await getActiveKeyVersion();
        const messages = result.rows.map(r => decryptMessage(r, keyVersion));

        return res.json({ messages });
    } catch (err) {
        console.error('[MESSAGES] GET /starred error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch starred messages' });
    }
});

// ══════════════════════════════════════════════
// PUT /api/messages/:id/star
// ══════════════════════════════════════════════
router.put('/:id/star', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const myId = req.user.sub;
        const partnerId = await getPartnerId(myId);

        await pool.query(
            `UPDATE messages SET is_starred = TRUE
             WHERE id = $1 AND 
             (sender_id = $2 OR receiver_id = $2)`,
            [id, myId]
        );

        const socketState = require('../socket');
        const roomId = [myId, partnerId].sort().join('_');
        socketState.getIo()?.to(roomId).emit('message_starred', { messageId: id, is_starred: true });

        return res.json({ ok: true });
    } catch (err) {
        console.error('[MESSAGES] PUT /star error:', err.message);
        return res.status(500).json({ error: 'Failed to star message' });
    }
});

// ══════════════════════════════════════════════
// PUT /api/messages/:id/unstar
// ══════════════════════════════════════════════
router.put('/:id/unstar', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const myId = req.user.sub;
        const partnerId = await getPartnerId(myId);

        await pool.query(
            `UPDATE messages SET is_starred = FALSE
             WHERE id = $1 AND 
             (sender_id = $2 OR receiver_id = $2)`,
            [id, myId]
        );

        const socketState = require('../socket');
        const roomId = [myId, partnerId].sort().join('_');
        socketState.getIo()?.to(roomId).emit('message_starred', { messageId: id, is_starred: false });

        return res.json({ ok: true });
    } catch (err) {
        console.error('[MESSAGES] PUT /unstar error:', err.message);
        return res.status(500).json({ error: 'Failed to unstar message' });
    }
});

module.exports = router;


