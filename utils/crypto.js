/**
 * 🛡️ Couple Vault: E2EE Mobile Crypto Engine
 * 
 * Handles:
 * - Identity Key Generation (X25519 + Ed25519)
 * - Message Signing (Ed25519)
 * - Vault Key Handshake (Key Wrapping)
 * - Message Encryption/Decryption (AES-256-GCM)
 * - Replay Protection (Sequence Counters)
 */

import 'react-native-get-random-values';
import crypto from 'react-native-quick-crypto';
import { Buffer } from 'buffer';

/**
 * 1. Generate Identity Key Pair (X25519)
 */
export const generateIdentityKeyPair = () => {
  // X25519 for Encryption (Key Exchange)
  const x25519 = crypto.generateKeyPairSync('x25519');
  // Ed25519 for Identity (Signing)
  const ed25519 = crypto.generateKeyPairSync('ed25519');
  
  return {
    publicKey: x25519.publicKey.toString('hex'),
    privateKey: x25519.privateKey.toString('hex'),
    signingPublicKey: ed25519.publicKey.toString('hex'),
    signingPrivateKey: ed25519.privateKey.toString('hex'),
  };
};

/**
 * 1.1 Sign Message (Ed25519)
 */
export const signMessage = (data, privateKeyHex) => {
  const privateKey = Buffer.from(privateKeyHex, 'hex');
  const signature = crypto.sign(null, Buffer.from(data), privateKey);
  return signature.toString('hex');
};

/**
 * 1.2 Verify Signature (Ed25519)
 */
export const verifySignature = (data, signatureHex, publicKeyHex) => {
  const publicKey = Buffer.from(publicKeyHex, 'hex');
  const signature = Buffer.from(signatureHex, 'hex');
  return crypto.verify(null, Buffer.from(data), publicKey, signature);
};

/**
 * 2. Fingerprint Generation (Anti-MITM)
 */
export const getFingerprint = (publicKeyHex) => {
  return crypto.createHash('sha256')
    .update(Buffer.from(publicKeyHex, 'hex'))
    .digest('hex')
    .toUpperCase()
    .match(/.{1,4}/g)
    .join('-');
};

/**
 * 3. Encrypt Vault Key for Partner (Handshake)
 */
export const encryptVaultKey = (vaultKeyHex, partnerPublicKeyHex) => {
  const vaultKey = Buffer.from(vaultKeyHex, 'hex');
  const partnerPubKey = Buffer.from(partnerPublicKeyHex, 'hex');
  
  const { publicKey: ephemeralPubKey, privateKey: ephemeralPrivKey } = crypto.generateKeyPairSync('x25519');
  
  const sharedSecret = crypto.diffieHellman({
    privateKey: ephemeralPrivKey,
    publicKey: partnerPubKey,
  });

  const derivedKey = crypto.hkdfSync('sha256', sharedSecret, '', 'vault-key-wrap', 32);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  
  const encryptedVaultKey = Buffer.concat([cipher.update(vaultKey), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const envelope = Buffer.concat([iv, authTag, encryptedVaultKey]);

  return {
    ephemeralPublicKey: ephemeralPubKey.toString('hex'),
    encryptedKey: envelope.toString('hex'),
  };
};

/**
 * 4. Decrypt Vault Key (Handshake)
 */
export const decryptVaultKey = (encryptedEnvelopeHex, ephemeralPublicKeyHex, myPrivateKeyHex) => {
  const envelope = Buffer.from(encryptedEnvelopeHex, 'hex');
  const ephemeralPubKey = Buffer.from(ephemeralPublicKeyHex, 'hex');
  const myPrivKey = Buffer.from(myPrivateKeyHex, 'hex');

  const sharedSecret = crypto.diffieHellman({
    privateKey: myPrivKey,
    publicKey: ephemeralPubKey,
  });

  const derivedKey = crypto.hkdfSync('sha256', sharedSecret, '', 'vault-key-wrap', 32);

  const iv = envelope.subarray(0, 12);
  const tag = envelope.subarray(12, 28);
  const ciphertext = envelope.subarray(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
  decipher.setAuthTag(tag);

  const decryptedKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decryptedKey.toString('hex');
};

/**
 * 5. Message Encryption (HKDF Per-Message Keys + AAD Binding)
 */
export const encryptMessage = (plaintext, vaultKeyHex, counter, aadObj = {}) => {
  const masterKey = Buffer.from(vaultKeyHex, 'hex');
  const iv = crypto.randomBytes(12);

  // AAD Binding: Tie the message to its context (Vault, Sender, Counter)
  const aad = Buffer.from(JSON.stringify({ ...aadObj, c: counter }));

  // HKDF: Derive a unique key for THIS message using the counter as part of the salt/info
  const messageKey = crypto.hkdfSync(
    'sha256',
    masterKey,
    Buffer.from(`salt-${counter}`),
    'message-encryption-v1',
    32
  );

  // 2. Padding (Metadata Protection)
  // Hide message length by padding to a multiple of 128 or 256 bytes.
  const BLOCK_SIZE = 256;
  const rawPayload = JSON.stringify({
    m: plaintext,
    c: counter,
    t: Date.now()
  });
  
  const padLength = BLOCK_SIZE - (Buffer.byteLength(rawPayload) % BLOCK_SIZE);
  const paddedPayload = rawPayload + ' '.repeat(padLength);

  const cipher = crypto.createCipheriv('aes-256-gcm', messageKey, iv);
  cipher.setAAD(aad); 

  const ciphertext = Buffer.concat([cipher.update(paddedPayload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope = Buffer.concat([iv, tag, ciphertext]);

  // Sign the entire envelope + metadata for identity proof
  const signature = signMessage(envelope.toString('hex') + JSON.stringify(aadObj), aadObj.signingPrivateKey);

  return {
    blob: envelope.toString('hex'),
    signature: signature,
    counter: counter
  };
};

/**
 * 6. Message Decryption (HKDF + AAD Verification + Replay Shield + Digital Signature)
 */
export const decryptMessage = (envelopeHex, vaultKeyHex, lastSeenCounter, aadObj = {}) => {
  const masterKey = Buffer.from(vaultKeyHex, 'hex');
  const envelope = Buffer.from(envelopeHex, 'hex');

  // 1. Digital Signature Verification (Identity Proof)
  if (aadObj.partnerSigningPublicKey && aadObj.signature) {
    const dataToVerify = envelopeHex + JSON.stringify(aadObj.metadata); // metadata should match aadObj passed to encrypt
    const isValid = verifySignature(dataToVerify, aadObj.signature, aadObj.partnerSigningPublicKey);
    if (!isValid) {
      throw new Error('IDENTITY_PROOF_FAILED: Message signature is invalid.');
    }
  }

  const iv = envelope.subarray(0, 12);
  const tag = envelope.subarray(12, 28);
  const ciphertext = envelope.subarray(28);

  const counter = aadObj.c; 

  const messageKey = crypto.hkdfSync(
    'sha256',
    masterKey,
    Buffer.from(`salt-${counter}`),
    'message-encryption-v1',
    32
  );

  const aad = Buffer.from(JSON.stringify(aadObj.metadata || {}));

  const decipher = crypto.createDecipheriv('aes-256-gcm', messageKey, iv);
  decipher.setAAD(aad); 
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const payload = JSON.parse(decrypted.toString('utf8').trim());

  if (payload.c <= lastSeenCounter) {
    throw new Error('REPLAY_DETECTED');
  }

  return {
    text: payload.m,
    counter: payload.c,
    timestamp: payload.t
  };
};

/**
 * 7. Key Rotation Helper
 * Generates a new vault key and prepares encryption payloads for target devices.
 */
export const rotateVaultKey = async (vaultId, myIdentityKey, trustedDevices, nextVersion) => {
  const newKey = crypto.randomBytes(32).toString('hex');
  const payloads = [];

  for (const device of trustedDevices) {
    const { wrapVaultKey } = require('./crypto');
    // If it's our own device, we wrap for our own public key (derived or passed)
    // For simplicity, we assume 'device.identity_public_key' is always present in the trustedDevices list
    const wrapped = wrapVaultKey(newKey, device.identity_public_key, myIdentityKey);
    
    payloads.push({
      vault_id: vaultId,
      target_user_id: device.user_id,
      target_device_id: device.id,
      encrypted_key: wrapped.encryptedKey,
      ephemeral_public_key: wrapped.ephemeralPublicKey,
      key_version: nextVersion
    });
  }

  return { newKey, payloads };
};
