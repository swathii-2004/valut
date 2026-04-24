// src/routes/files.js
// All queries scoped to vault_id (injected by verifyVaultMember middleware).
// Files are stored at vault/{vault_id}/{uuid} — per-vault isolation.
// Encryption uses per-vault keys (req.vaultKey) with legacy fallback.
const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const fs       = require('fs');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');
const pool     = require('../db/pool');
const { encrypt: encryptLegacy, decrypt: decryptLegacy } = require('../utils/crypto');
const { encryptWithVaultKey, decryptWithVaultKey }       = require('../utils/vaultCrypto');
const authMiddleware = require('../middleware/auth');
const { verifyVaultMember, verifyVaultActive } = require('../middleware/vault');
const { writeAuditLog } = require('../utils/auditLog');

// ── Storage: memory only, never touch disk unencrypted ──
const upload = multer({
    storage: multer.memoryStorage(),
    limits : { fileSize: 100 * 1024 * 1024 }, // 100 MB
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
    { mime: 'image/png',  bytes: [0x89, 0x50, 0x4E, 0x47] },
    { mime: 'image/gif',  bytes: [0x47, 0x49, 0x46] },
    { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
    { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
];

function checkMagicBytes(buffer, mime) {
    const sig = MAGIC.find(m => m.mime === mime);
    if (!sig) return true;
    return sig.bytes.every((b, i) => buffer[i] === b);
}

// ── Per-vault encrypt / decrypt wrappers ────────────────────────────────────
function encryptData(plaintext, vaultKey, keyVersion) {
    if (vaultKey) return encryptWithVaultKey(plaintext, vaultKey);
    return encryptLegacy(plaintext, keyVersion);
}

function decryptData(ciphertext, iv, authTag, vaultKey, keyVersion) {
    if (vaultKey) return decryptWithVaultKey(ciphertext, iv, authTag, vaultKey);
    return decryptLegacy(ciphertext, iv, authTag, parseInt(keyVersion, 10));
}

// ── Helper: resolve per-vault storage path ───────────────────────────────────
function vaultStoragePath(vaultId) {
    return path.join(process.env.STORAGE_PATH, vaultId);
}

// Shorthand middleware stack
const protect = [authMiddleware, verifyVaultMember, verifyVaultActive];

// ══════════════════════════════════════════════
// POST /api/files/upload
// ══════════════════════════════════════════════
router.post('/upload', protect, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file provided' });

        const { mimetype, originalname, buffer } = req.file;
        const vaultId = req.vaultId;

        // 1. MIME whitelist
        if (!ALLOWED_MIME.has(mimetype)) {
            return res.status(415).json({ error: 'File type not allowed' });
        }

        // 2. Magic byte check
        if (!checkMagicBytes(buffer, mimetype)) {
            return res.status(415).json({ error: 'File content does not match declared type' });
        }

        // 3. Get active key version
        const keyRes = await pool.query(
            `SELECT version FROM encryption_keys WHERE status = 'active' ORDER BY version DESC LIMIT 1`
        );
        if (!keyRes.rows.length) return res.status(500).json({ error: 'No active encryption key' });
        const keyVersion = parseInt(keyRes.rows[0].version, 10);

        // 4. Encrypt file and filename
        const encryptedFile = encryptData(buffer, req.vaultKey, keyVersion);
        const encryptedName = encryptData(Buffer.from(originalname, 'utf8'), req.vaultKey, keyVersion);

        // 5. Write to vault/{vault_id}/
        const storedFilename = uuidv4();
        const storagePath    = vaultStoragePath(vaultId);
        if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });
        fs.writeFileSync(path.join(storagePath, storedFilename), encryptedFile.ciphertext);

        // 6. Insert metadata
        const insertRes = await pool.query(
            `INSERT INTO files
               (vault_id, owner_id, stored_filename, iv, auth_tag, key_version,
                encrypted_name, name_iv, name_auth_tag, mime_type, file_size_bytes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING id, created_at`,
            [
                vaultId,
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

        // 7. Tamper-evident audit log
        await writeAuditLog({
            userId   : req.user.sub,
            action   : 'file_upload',
            fileId   : insertRes.rows[0].id,
            ip       : req.ip,
            userAgent: req.headers['user-agent'],
            success  : true,
            metadata : { vault_id: vaultId },
        });

        return res.status(201).json({
            message   : 'File uploaded successfully',
            file_id   : insertRes.rows[0].id,
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
router.get('/', protect, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, encrypted_name, name_iv, name_auth_tag,
                    mime_type, file_size_bytes, key_version, created_at
             FROM files
             WHERE vault_id = $1 AND is_deleted = FALSE
             ORDER BY created_at DESC`,
            [req.vaultId]
        );

        const files = result.rows.map(row => {
            try {
                const nameBuffer = decryptData(
                    Buffer.from(row.encrypted_name, 'hex'),
                    row.name_iv,
                    row.name_auth_tag,
                    req.vaultKey,
                    row.key_version
                );
                return {
                    id        : row.id,
                    name      : nameBuffer.toString('utf8'),
                    mime_type : row.mime_type,
                    size_bytes: row.file_size_bytes,
                    created_at: row.created_at,
                };
            } catch {
                return {
                    id        : row.id,
                    name      : '[encrypted]',
                    mime_type : row.mime_type,
                    size_bytes: row.file_size_bytes,
                    created_at: row.created_at,
                };
            }
        });

        await writeAuditLog({
            userId : req.user.sub,
            action : 'file_view',
            ip     : req.ip,
            success: true,
            metadata: { vault_id: req.vaultId },
        });

        return res.json({ files });

    } catch (err) {
        console.error('List error:', err);
        return res.status(500).json({ error: 'Could not retrieve files' });
    }
});

// ══════════════════════════════════════════════
// GET /api/files/:id/view  — decrypt & stream
// ══════════════════════════════════════════════
router.get('/:id/view', protect, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT * FROM files WHERE id = $1 AND vault_id = $2 AND is_deleted = FALSE`,
            [id, req.vaultId]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'File not found' });

        const file     = result.rows[0];
        const filePath = path.join(vaultStoragePath(req.vaultId), file.stored_filename);

        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing from storage' });

        const encryptedBytes = fs.readFileSync(filePath);
        const decrypted = decryptData(
            encryptedBytes,
            file.iv,
            file.auth_tag,
            req.vaultKey,
            file.key_version
        );

        res.set({
            'Content-Type'           : file.mime_type,
            'Content-Length'         : decrypted.length,
            'Cache-Control'          : 'no-store, no-cache, must-revalidate, private',
            'Pragma'                 : 'no-cache',
            'X-Content-Type-Options' : 'nosniff',
        });

        await writeAuditLog({
            userId : req.user.sub,
            action : 'file_view',
            fileId : id,
            ip     : req.ip,
            success: true,
            metadata: { vault_id: req.vaultId },
        });

        return res.send(decrypted);

    } catch (err) {
        console.error('View error:', err);
        return res.status(500).json({ error: 'Could not decrypt file' });
    }
});

module.exports = router;
