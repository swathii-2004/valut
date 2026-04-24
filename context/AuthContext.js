import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

const AuthContext = createContext(null);

const ACCESS_TOKEN_KEY  = 'cv_access_token';
const REFRESH_TOKEN_KEY = 'cv_refresh_token';
const VAULT_ID_KEY      = 'cv_vault_id';
const VAULT_STATUS_KEY  = 'cv_vault_status';

export function AuthProvider({ children }) {
  const [accessToken,  setAccessToken]  = useState(null);
  const [vaultId,      setVaultIdState] = useState(null);
  const [vaultStatus,  setVaultStatusState] = useState(null);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [token, vid, vstatus] = await Promise.all([
          SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
          SecureStore.getItemAsync(VAULT_ID_KEY),
          SecureStore.getItemAsync(VAULT_STATUS_KEY),
        ]);
        if (token)   setAccessToken(token);
        if (vid)     setVaultIdState(vid);
        if (vstatus) setVaultStatusState(vstatus);
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
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY,  accessTok);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshTok);
    setAccessToken(accessTok);
  };

  const logout = async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.deleteItemAsync(VAULT_ID_KEY),
      SecureStore.deleteItemAsync(VAULT_STATUS_KEY),
    ]);
    setAccessToken(null);
    setVaultIdState(null);
    setVaultStatusState(null);
  };

  const getRefreshToken = async () => SecureStore.getItemAsync(REFRESH_TOKEN_KEY);

  const updateAccessToken = async (newToken) => {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, newToken);
    setAccessToken(newToken);
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
      accessToken, loading,
      vaultId, vaultStatus,
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
