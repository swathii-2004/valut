import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { generateIdentityKeyPair } from '../utils/crypto';
import apiClient from '../api/client';
import Constants from 'expo-constants';
import { Buffer } from 'buffer';

function parseUserIdFromToken(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')).sub || null;
  } catch {
    return null;
  }
}

const AuthContext = createContext(null);

const ACCESS_TOKEN_KEY  = 'cv_access_token';
const REFRESH_TOKEN_KEY = 'cv_refresh_token';
const VAULT_ID_KEY      = 'cv_vault_id';
const VAULT_STATUS_KEY  = 'cv_vault_status';
const IDENTITY_PRIV_KEY = 'cv_identity_priv_key';
const DEVICE_ID_KEY     = 'cv_device_id';
const LAST_COUNTER_KEY  = 'cv_last_counter';
const SIGNING_PRIV_KEY  = 'cv_signing_priv_key';

const API_URL = Constants.expoConfig.extra?.apiUrl || 'http://localhost:3000';

export function AuthProvider({ children }) {
  const [accessToken,  setAccessToken]  = useState(null);
  const [userId,       setUserId]       = useState(null);
  const [vaultId,      setVaultIdState] = useState(null);
  const [vaultStatus,  setVaultStatusState] = useState(null);
  const [identityKey,   setIdentityKey]  = useState(null); // Private Key (Encryption)
  const [signingKey,    setSigningKey]   = useState(null); // Private Key (Signing)
  const [deviceId,      setDeviceId]     = useState(null);
  const [lastCounter,   setLastCounterState] = useState(0);
  const [vaultKeyMap,   setVaultKeyMap]  = useState({});
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [token, vid, vstatus, privKey, signKey, did, cnt] = await Promise.all([
          SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
          SecureStore.getItemAsync(VAULT_ID_KEY),
          SecureStore.getItemAsync(VAULT_STATUS_KEY),
          SecureStore.getItemAsync(IDENTITY_PRIV_KEY),
          SecureStore.getItemAsync(SIGNING_PRIV_KEY),
          SecureStore.getItemAsync(DEVICE_ID_KEY),
          SecureStore.getItemAsync(LAST_COUNTER_KEY),
        ]);
        if (token)   { setAccessToken(token); setUserId(parseUserIdFromToken(token)); }
        if (vid)     setVaultIdState(vid);
        if (vstatus) setVaultStatusState(vstatus);
        if (privKey) setIdentityKey(privKey);
        if (signKey) setSigningKey(signKey);
        if (did)     setDeviceId(did);
        if (cnt)     setLastCounterState(parseInt(cnt, 10));

        // If logged in but no identity, bootstrap it
        if (token && !privKey) {
          bootstrapIdentity(token);
        }
      } catch (e) {
        console.warn('Failed to load auth state:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (tokens) => {
    const accessTok  = tokens.accessToken  || tokens.access_token;
    const refreshTok = tokens.refreshToken || tokens.refresh_token;

    // A new explicit login MUST generate a new device identity
    // (In case the user switched accounts but SecureStore persisted old keys)
    await Promise.all([
      SecureStore.deleteItemAsync(IDENTITY_PRIV_KEY),
      SecureStore.deleteItemAsync(SIGNING_PRIV_KEY),
      SecureStore.deleteItemAsync(DEVICE_ID_KEY),
      SecureStore.deleteItemAsync(VAULT_ID_KEY),
      SecureStore.deleteItemAsync(VAULT_STATUS_KEY)
    ]);
    setIdentityKey(null);
    setSigningKey(null);
    setDeviceId(null);
    setVaultIdState(null);
    setVaultStatusState(null);

    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY,  accessTok);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshTok);
    setAccessToken(accessTok);
    setUserId(parseUserIdFromToken(accessTok));
    
    // Bootstrap E2EE identity after login
    await bootstrapIdentity(accessTok);
  };

  const bootstrapIdentity = async (token) => {
    try {
      let privKey  = await SecureStore.getItemAsync(IDENTITY_PRIV_KEY);
      let signKey  = await SecureStore.getItemAsync(SIGNING_PRIV_KEY);
      let did      = await SecureStore.getItemAsync(DEVICE_ID_KEY);

      // If missing ANY part of the identity, re-bootstrap (or fill gaps)
      if (!privKey || !signKey) {
        console.log('[E2EE] 🔑 Identity incomplete. Bootstrapping security keys...');
        const keys = generateIdentityKeyPair();
        
        // Use existing privKey if we have it, otherwise take the new one
        const finalPrivKey = privKey || keys.privateKey;
        const finalSignKey = signKey || keys.signingPrivateKey;

        // Register/Update device with server
        const resp = await apiClient.post('/api/devices', {
          identity_public_key: keys.publicKey, // This will upsert based on the server logic
          signing_public_key: keys.signingPublicKey,
          device_name: Constants.deviceName || 'Mobile Device'
        });

        did = resp.data.id;
        privKey = finalPrivKey;
        signKey = finalSignKey;

        await Promise.all([
          SecureStore.setItemAsync(IDENTITY_PRIV_KEY, privKey),
          SecureStore.setItemAsync(SIGNING_PRIV_KEY, signKey),
          SecureStore.setItemAsync(DEVICE_ID_KEY, did)
        ]);
      }

      setIdentityKey(privKey);
      setSigningKey(signKey);
      setDeviceId(did);
      console.log('[E2EE] ✅ Zero-Trust Identity Active:', did);
    } catch (err) {
      console.error('[E2EE] ❌ Identity bootstrap failed:', err.message);
    }
  };

  const logout = async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.deleteItemAsync(VAULT_ID_KEY),
      SecureStore.deleteItemAsync(VAULT_STATUS_KEY),
      SecureStore.deleteItemAsync(IDENTITY_PRIV_KEY),
      SecureStore.deleteItemAsync(SIGNING_PRIV_KEY),
      SecureStore.deleteItemAsync(DEVICE_ID_KEY),
      SecureStore.deleteItemAsync(LAST_COUNTER_KEY),
    ]);
    setAccessToken(null);
    setUserId(null);
    setVaultIdState(null);
    setVaultStatusState(null);
    setIdentityKey(null);
    setSigningKey(null);
    setDeviceId(null);
    setLastCounterState(0);
    setVaultKeyMap({});
  };

  const updateLastCounter = async (newVal) => {
    if (newVal > lastCounter) {
      await SecureStore.setItemAsync(LAST_COUNTER_KEY, newVal.toString());
      setLastCounterState(newVal);
    }
  };

  const getRefreshToken = async () => SecureStore.getItemAsync(REFRESH_TOKEN_KEY);

  const updateAccessToken = async (newToken) => {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, newToken);
    setAccessToken(newToken);
    setUserId(parseUserIdFromToken(newToken));
  };

  const setVaultId = async (id) => {
    if (id) await SecureStore.setItemAsync(VAULT_ID_KEY, id);
    else    await SecureStore.deleteItemAsync(VAULT_ID_KEY);
    setVaultIdState(id);
  };

  const setVaultStatus = async (status) => {
    if (status) await SecureStore.setItemAsync(VAULT_STATUS_KEY, status);
    else        await SecureStore.deleteItemAsync(VAULT_STATUS_KEY);
    setVaultStatusState(status);
  };

  return (
    <AuthContext.Provider value={{
      accessToken, userId, loading,
      vaultId, vaultStatus,
      identityKey, signingKey, deviceId,
      lastCounter, updateLastCounter,
      vaultKeyMap, setVaultKeyMap,
      login, logout,
      getRefreshToken, updateAccessToken,
      setVaultId, setVaultStatus,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
