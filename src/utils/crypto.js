const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getDEK(version) {
    const key = process.env[`ENCRYPTION_KEY_V${version}`];
    if (!key) throw new Error(`DEK version ${version} not found in environment`);
    const buf = Buffer.from(key, 'hex');
    if (buf.length !== 32) throw new Error(`DEK version ${version} must be 32 bytes`);
    return buf;
}

function encrypt(plaintext, keyVersion) {
    const key = getDEK(keyVersion);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        ciphertext,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
    };
}

function decrypt(ciphertext, ivHex, authTagHex, keyVersion) {
    const key = getDEK(keyVersion);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

module.exports = { encrypt, decrypt };