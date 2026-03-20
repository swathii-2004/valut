import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

const AuthContext = createContext(null);

const ACCESS_TOKEN_KEY = 'cv_access_token';
const REFRESH_TOKEN_KEY = 'cv_refresh_token';

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load token from secure storage on app start
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
        if (token) setAccessToken(token);
      } catch (e) {
        console.warn('Failed to load token:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (tokens) => {
    // API returns snake_case (access_token) — support both formats
    const accessTok = tokens.accessToken || tokens.access_token;
    const refreshTok = tokens.refreshToken || tokens.refresh_token;
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessTok);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshTok);
    setAccessToken(accessTok);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    setAccessToken(null);
  };

  const getRefreshToken = async () => {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  };

  const updateAccessToken = async (newToken) => {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, newToken);
    setAccessToken(newToken);
  };

  return (
    <AuthContext.Provider value={{ accessToken, loading, login, logout, getRefreshToken, updateAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
