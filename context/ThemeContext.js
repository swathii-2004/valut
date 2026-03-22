// context/ThemeContext.js — 5 chat themes with AsyncStorage persistence
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEMES = {
  rose: {
    name: 'Rose',
    icon: '🌹',
    bg: '#FFF0F6',
    surface: '#FFFFFF',
    accent: '#E4387A',
    accentSoft: '#FFDAEB',
    bubbleSent: '#E4387A',
    bubbleReceived: '#FFFFFF',
    textPrimary: '#1a0a14',
    textSec: '#9a6080',
    border: '#F5C6DE',
    header: '#FFFFFF',
    inputBg: '#FFFFFF',
    time: '#C8A0B4',
    timeSent: 'rgba(255,255,255,0.7)',
    datePill: '#FFE8F3',
  },
  lavender: {
    name: 'Lavender',
    icon: '💜',
    bg: '#F3F0FF',
    surface: '#FFFFFF',
    accent: '#7C3AED',
    accentSoft: '#EDE9FE',
    bubbleSent: '#7C3AED',
    bubbleReceived: '#FFFFFF',
    textPrimary: '#1a0a2e',
    textSec: '#7C6A9A',
    border: '#DDD6FE',
    header: '#FFFFFF',
    inputBg: '#FFFFFF',
    time: '#A89CC0',
    timeSent: 'rgba(255,255,255,0.7)',
    datePill: '#EDE9FE',
  },
  midnight: {
    name: 'Midnight',
    icon: '🌙',
    bg: '#0D0D1A',
    surface: '#171728',
    accent: '#818CF8',
    accentSoft: '#1E1E3F',
    bubbleSent: '#3730A3',
    bubbleReceived: '#1E1E35',
    textPrimary: '#E0E0FF',
    textSec: '#7878AA',
    border: '#2D2D50',
    header: '#171728',
    inputBg: '#0D0D1A',
    time: '#5555AA',
    timeSent: 'rgba(200,200,255,0.5)',
    datePill: '#1E1E42',
  },
  ocean: {
    name: 'Ocean',
    icon: '🌊',
    bg: '#F0F8FF',
    surface: '#FFFFFF',
    accent: '#0284C7',
    accentSoft: '#E0F2FE',
    bubbleSent: '#0284C7',
    bubbleReceived: '#FFFFFF',
    textPrimary: '#0C1A2E',
    textSec: '#5A8AAA',
    border: '#BAE6FD',
    header: '#FFFFFF',
    inputBg: '#FFFFFF',
    time: '#85BBCC',
    timeSent: 'rgba(255,255,255,0.7)',
    datePill: '#E0F2FE',
  },
  forest: {
    name: 'Forest',
    icon: '💚',
    bg: '#F0FDF4',
    surface: '#FFFFFF',
    accent: '#16A34A',
    accentSoft: '#DCFCE7',
    bubbleSent: '#16A34A',
    bubbleReceived: '#FFFFFF',
    textPrimary: '#052E16',
    textSec: '#4A7A5A',
    border: '#BBF7D0',
    header: '#FFFFFF',
    inputBg: '#FFFFFF',
    time: '#70AA80',
    timeSent: 'rgba(255,255,255,0.7)',
    datePill: '#DCFCE7',
  },
  vault: {
    name: 'Vault',
    icon: '💜',
    bg: '#1A0035',
    surface: '#2A0050',
    accent: '#C47DFF',
    accentSoft: '#3D0078',
    bubbleSent: '#8B2FC9',
    bubbleReceived: '#2D0060',
    textPrimary: '#F0E6FF',
    textSec: '#A07ACC',
    border: '#4A0090',
    header: '#200045',
    inputBg: '#1A0035',
    time: '#7A55AA',
    timeSent: 'rgba(240,230,255,0.55)',
    datePill: '#3D0070',
  },
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeKey, setThemeKey] = useState('rose');

  useEffect(() => {
    AsyncStorage.getItem('chat_theme').then(saved => {
      if (saved && THEMES[saved]) setThemeKey(saved);
    }).catch(() => { });
  }, []);

  const switchTheme = async (key) => {
    if (!THEMES[key]) return;
    setThemeKey(key);
    try { await AsyncStorage.setItem('chat_theme', key); } catch { }
  };

  return (
    <ThemeContext.Provider value={{ theme: THEMES[themeKey], themeKey, switchTheme, THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
}

export { THEMES };
