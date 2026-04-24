// src/utils/auditLog.js
// Tamper-evident audit log with SHA-256 hash chaining.
// Each row stores prev_hash = SHA-256(previous row's id|action|user_id|created_at|prev_hash).
// First row uses "GENESIS" as the previous input.
// To verify integrity: GET /admin/audit/verify
'use strict';

const crypto = require('crypto');
const pool   = require('../db/pool');

/**
 * Compute the hash for a given log row object.
 * Input: JSON.stringify({ id, action, user_id, created_at, prev_hash })
 * @param {object} row
 * @returns {string} hex SHA-256 digest
 */
function computeRowHash(row) {
    const payload = JSON.stringify({
        id        : row.id,
        action    : row.action,
        user_id   : row.user_id,
        created_at: row.created_at,
        prev_hash : row.prev_hash,
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Write a tamper-evident audit log entry.
 *
 * @param {object} params
 * @param {string|null}  params.userId
 * @param {string}       params.action    — must match access_logs CHECK constraint
 * @param {string|null}  params.fileId
 * @param {string|null}  params.ip
 * @param {string|null}  params.userAgent
 * @param {boolean}      params.success
 * @param {object|null}  params.metadata
 */
async function writeAuditLog({ userId, action, fileId = null, ip = null, userAgent = null, success = true, metadata = null }) {
    try {
        // 1. Fetch the most recent log entry to chain from
        const lastRes = await pool.query(
            `SELECT id, action, user_id, created_at, prev_hash
             FROM access_logs
             ORDER BY created_at DESC, id DESC
             LIMIT 1`
        );

        // 2. Compute previous hash
        let prevHash;
        if (lastRes.rows.length === 0) {
            // Genesis block
            prevHash = crypto.createHash('sha256').update('GENESIS').digest('hex');
        } else {
            prevHash = computeRowHash(lastRes.rows[0]);
        }

        // 3. Insert the new log row with prev_hash
        await pool.query(
            `INSERT INTO access_logs
               (user_id, action, file_id, ip_address, user_agent, success, metadata, prev_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                userId    || null,
                action,
                fileId    || null,
                ip        || null,
                userAgent || null,
                success,
                metadata  ? JSON.stringify(metadata) : null,
                prevHash,
            ]
        );
    } catch (err) {
        // Audit log failure must never crash the main request
        console.error('[AUDIT] writeAuditLog error:', err.message);
    }
}

/**
 * Verify the entire audit log chain.
 * Returns { valid: true } if the chain is intact,
 * or { valid: false, brokenAt: <row_id> } at the first tampered row.
 */
async function verifyAuditChain() {
    const result = await pool.query(
        `SELECT id, action, user_id, created_at, prev_hash
         FROM access_logs
         ORDER BY created_at ASC, id ASC`
    );

    const rows = result.rows;
    if (rows.length === 0) return { valid: true, rows: 0 };

    // Verify first row — its prev_hash must equal hash of "GENESIS"
    const genesisHash = crypto.createHash('sha256').update('GENESIS').digest('hex');
    const expectedFirst = genesisHash;
    if (rows[0].prev_hash !== expectedFirst) {
        return { valid: false, brokenAt: rows[0].id, reason: 'First row prev_hash does not match GENESIS' };
    }

    // Verify every subsequent row
    for (let i = 1; i < rows.length; i++) {
        const expected = computeRowHash(rows[i - 1]);
        if (rows[i].prev_hash !== expected) {
            return { valid: false, brokenAt: rows[i].id, reason: `Hash mismatch at index ${i}` };
        }
    }

    return { valid: true, rows: rows.length };
}

module.exports = { writeAuditLog, verifyAuditChain };
