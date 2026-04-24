// src/utils/vaultCrypto.js
// Per-vault AES-256-GCM key management.
// The raw vault key NEVER leaves memory — only its encrypted form is persisted.
'use strict';

const crypto = require('crypto');

const ALGORITHM  = 'aes-256-gcm';
const IV_LENGTH  = 12; // 96-bit IV — recommended for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Load and validate the MASTER_SECRET from environment.
 * Returns a 32-byte Buffer.
 * Throws if missing or wrong length.
 */
function getMasterKey() {
    const raw = process.env.MASTER_SECRET;
    if (!raw) throw new Error('MASTER_SECRET is not set in environment');
    const key = Buffer.from(raw, 'hex');
    if (key.length !== 32) throw new Error('MASTER_SECRET must be a 64-char hex string (32 bytes)');
    return key;
}

/**
 * Generate a new 32-byte random vault key.
 * @returns {Buffer} 32-byte key — never store this plaintext
 */
function generateVaultKey() {
    return crypto.randomBytes(32);
}

/**
 * Encrypt a vault key with the global MASTER_SECRET using AES-256-GCM.
 * @param {Buffer} vaultKey — plain 32-byte vault key
 * @returns {{ encryptedKey: string, iv: string, tag: string }} — all hex strings
 */
function encryptKeyWithMaster(vaultKey) {
    const master = getMasterKey();
    const iv     = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, master, iv, { authTagLength: TAG_LENGTH });

    const encrypted = Buffer.concat([cipher.update(vaultKey), cipher.final()]);

    return {
        encryptedKey: encrypted.toString('hex'),
        iv          : iv.toString('hex'),
        tag         : cipher.getAuthTag().toString('hex'),
    };
}

/**
 * Decrypt a vault key that was encrypted with the MASTER_SECRET.
 * @param {string} encryptedKey — hex string
 * @param {string} iv           — hex string
 * @param {string} tag          — hex string
 * @returns {Buffer} — plain 32-byte vault key (zeroize after use)
 */
function decryptKeyWithMaster(encryptedKey, iv, tag) {
    const master   = getMasterKey();
    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        master,
        Buffer.from(iv, 'hex'),
        { authTagLength: TAG_LENGTH }
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    return Buffer.concat([
        decipher.update(Buffer.from(encryptedKey, 'hex')),
        decipher.final(),
    ]);
}

/**
 * Encrypt arbitrary plaintext with a caller-supplied vault key.
 * Used for per-vault message and file encryption.
 * @param {Buffer} plaintext
 * @param {Buffer} vaultKey — 32-byte Buffer from decryptKeyWithMaster
 * @returns {{ ciphertext: Buffer, iv: string, authTag: string }}
 */
function encryptWithVaultKey(plaintext, vaultKey) {
    const iv     = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, vaultKey, iv, { authTagLength: TAG_LENGTH });

    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    return {
        ciphertext,
        iv     : iv.toString('hex'),
        authTag: cipher.getAuthTag().toString('hex'),
    };
}

/**
 * Decrypt ciphertext with a caller-supplied vault key.
 * @param {Buffer} ciphertext
 * @param {string} iv      — hex string
 * @param {string} authTag — hex string
 * @param {Buffer} vaultKey — 32-byte Buffer from decryptKeyWithMaster
 * @returns {Buffer} plaintext
 */
function decryptWithVaultKey(ciphertext, iv, authTag, vaultKey) {
    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        vaultKey,
        Buffer.from(iv, 'hex'),
        { authTagLength: TAG_LENGTH }
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

module.exports = {
    generateVaultKey,
    encryptKeyWithMaster,
    decryptKeyWithMaster,
    encryptWithVaultKey,
    decryptWithVaultKey,
};
