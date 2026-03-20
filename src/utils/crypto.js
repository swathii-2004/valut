// src/utils/crypto.js
'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV — recommended for GCM
const TAG_LENGTH = 16;   // 128-bit auth tag

/**
 * Resolve the encryption key for the given version from env.
 * Expects:  ENCRYPTION_KEY_V1, ENCRYPTION_KEY_V2, …
 * Value must be a 64-char hex string (32 bytes).
 * @param {number} version
 * @returns {Buffer} 32-byte key
 */
function getKey(version) {
  const raw = process.env[`ENCRYPTION_KEY_V${version}`];
  if (!raw) throw new Error(`Missing ENCRYPTION_KEY_V${version} in environment`);
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32)
    throw new Error(`ENCRYPTION_KEY_V${version} must be 64 hex chars (32 bytes)`);
  return key;
}

/**
 * Encrypt a Buffer using AES-256-GCM.
 * @param {Buffer} plaintext
 * @param {number} keyVersion
 * @returns {{ ciphertext: Buffer, iv: string, authTag: string }}
 */
function encrypt(plaintext, keyVersion) {
  const key = getKey(keyVersion);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    ciphertext,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

/**
 * Decrypt a Buffer using AES-256-GCM.
 * @param {Buffer} ciphertext
 * @param {string} iv       — hex-encoded
 * @param {string} authTag  — hex-encoded
 * @param {number} keyVersion
 * @returns {Buffer} plaintext
 */
function decrypt(ciphertext, iv, authTag, keyVersion) {
  const key = getKey(keyVersion);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'), {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

module.exports = { encrypt, decrypt };