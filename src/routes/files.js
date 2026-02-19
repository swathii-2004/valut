// src/routes/files.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { encrypt, decrypt } = require('../utils/crypto');
const authMiddleware = require('../middleware/auth');

// ── Storage: memory only, never touch disk unencrypted ──
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

// ── Allowed MIME types ──
const ALLOWED_MIME = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
    'video/mp4', 'video/quicktime', 'video/x-msvideo',
    'audio/mpeg', 'audio/mp4', 'audio/wav',
    'application/pdf',
]);

// ── Magic byte signatures ──
const MAGIC = [
    { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
    { mime: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47] },
    { mime: 'image/gif', bytes: [0x47, 0x49, 0x46] },
    { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
    { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
];

function checkMagicBytes(buffer, mime) {
    const sig = MAGIC.find(m => m.mime === mime);
    if (!sig) return true;
    return sig.bytes.every((b, i) => buffer[i] === b);
}

// ══════════════════════════════════════════════
// POST /api/files/upload
// ══════════════════════════════════════════════
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file provided' });

        const { mimetype, originalname, buffer } = req.file;

        // 1. MIME whitelist
        if (!ALLOWED_MIME.has(mimetype)) {
            return res.status(415).json({ error: 'File type not allowed' });
        }

        // 2. Magic byte check
        if (!checkMagicBytes(buffer, mimetype)) {
            return res.status(415).json({ error: 'File content does not match declared type' });
        }

        // 3. Get active key version from DB
        const keyRes = await pool.query(
            `SELECT version FROM encryption_keys WHERE status = 'active' ORDER BY version DESC LIMIT 1`
        );
        if (keyRes.rows.length === 0) return res.status(500).json({ error: 'No active encryption key' });
        const keyVersion = parseInt(keyRes.rows[0].version, 10); // ← FIXED

        // 4. Encrypt file content
        const encryptedFile = encrypt(buffer, keyVersion); // ← FIXED

        // 5. Encrypt original filename
        const encryptedName = encrypt(Buffer.from(originalname, 'utf8'), keyVersion); // ← FIXED

        // 6. Generate stored filename (UUID, no extension)
        const storedFilename = uuidv4();

        // 7. Write encrypted bytes to vault/
        const storagePath = process.env.STORAGE_PATH;
        if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });
        fs.writeFileSync(path.join(storagePath, storedFilename), encryptedFile.ciphertext);

        // 8. Insert metadata to DB
        const insertRes = await pool.query(
            `INSERT INTO files
               (owner_id, stored_filename, iv, auth_tag, key_version,
                encrypted_name, name_iv, name_auth_tag, mime_type, file_size_bytes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING id, created_at`,
            [
                req.user.sub,
                storedFilename,
                encryptedFile.iv,
                encryptedFile.authTag,
                keyVersion,
                encryptedName.ciphertext.toString('hex'),
                encryptedName.iv,
                encryptedName.authTag,
                mimetype,
                buffer.length,
            ]
        );

        // 9. Log action
        await pool.query(
            `INSERT INTO access_logs (user_id, action, file_id, ip_address, success)
             VALUES ($1, 'file_upload', $2, $3, true)`,
            [req.user.sub, insertRes.rows[0].id, req.ip]
        );

        return res.status(201).json({
            message: 'File uploaded successfully',
            file_id: insertRes.rows[0].id,
            created_at: insertRes.rows[0].created_at,
        });

    } catch (err) {
        console.error('Upload error:', err);
        return res.status(500).json({ error: 'Upload failed' });
    }
});

// ══════════════════════════════════════════════
// GET /api/files  — list files (decrypted names)
// ══════════════════════════════════════════════
router.get('/', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, encrypted_name, name_iv, name_auth_tag,
                    mime_type, file_size_bytes, key_version, created_at
             FROM files
             WHERE is_deleted = FALSE
             ORDER BY created_at DESC`
        );

        const files = result.rows.map(row => {
            try {
                const nameBuffer = decrypt(
                    Buffer.from(row.encrypted_name, 'hex'),
                    row.name_iv,
                    row.name_auth_tag,
                    parseInt(row.key_version, 10) // ← FIXED
                );
                return {
                    id: row.id,
                    name: nameBuffer.toString('utf8'),
                    mime_type: row.mime_type,
                    size_bytes: row.file_size_bytes,
                    created_at: row.created_at,
                };
            } catch {
                return {
                    id: row.id,
                    name: '[encrypted]',
                    mime_type: row.mime_type,
                    size_bytes: row.file_size_bytes,
                    created_at: row.created_at,
                };
            }
        });

        await pool.query(
            `INSERT INTO access_logs (user_id, action, ip_address, success)
             VALUES ($1, 'file_view', $2, true)`,
            [req.user.sub, req.ip]
        );

        return res.json({ files });

    } catch (err) {
        console.error('List error:', err);
        return res.status(500).json({ error: 'Could not retrieve files' });
    }
});

// ══════════════════════════════════════════════
// GET /api/files/:id/view  — decrypt & stream
// ══════════════════════════════════════════════
router.get('/:id/view', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT * FROM files WHERE id = $1 AND is_deleted = FALSE`,
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });

        const file = result.rows[0];
        const filePath = path.join(process.env.STORAGE_PATH, file.stored_filename);

        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing from storage' });

        const encryptedBytes = fs.readFileSync(filePath);
        const decrypted = decrypt(
            encryptedBytes,
            file.iv,
            file.auth_tag,
            parseInt(file.key_version, 10) // ← FIXED
        );

        res.set({
            'Content-Type': file.mime_type,
            'Content-Length': decrypted.length,
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Pragma': 'no-cache',
            'X-Content-Type-Options': 'nosniff',
        });

        await pool.query(
            `INSERT INTO access_logs (user_id, action, file_id, ip_address, success)
             VALUES ($1, 'file_view', $2, $3, true)`,
            [req.user.sub, id, req.ip]
        );

        return res.send(decrypted);

    } catch (err) {
        console.error('View error:', err);
        return res.status(500).json({ error: 'Could not decrypt file' });
    }
});

module.exports = router;
