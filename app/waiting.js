// app/waiting.js
// Partner A waits here while polling GET /api/vault/status every 3 seconds.
// When vault status flips to 'active', navigates to connected.js.
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView,
  ActivityIndicator, TouchableOpacity, Alert,
} from 'react-native';
import { router } from 'expo-router';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';

const POLL_INTERVAL_MS = 3000;

export default function WaitingScreen() {
  const { setVaultStatus } = useAuth();
  const [dots, setDots]   = useState('');
  const intervalRef = useRef(null);
  const dotRef      = useRef(null);

  useEffect(() => {
    // Animated dots
    dotRef.current = setInterval(() => {
      setDots(d => (d.length >= 3 ? '' : d + '.'));
    }, 500);

    // Poll vault status
    intervalRef.current = setInterval(async () => {
      try {
        const res = await apiClient.get('/api/vault/status');
        if (res.data?.status === 'active') {
          clearInterval(intervalRef.current);
          clearInterval(dotRef.current);
          setVaultStatus('active');
          router.replace('/connected');
        }
      } catch {
        // Silently retry — network blip is expected
      }
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalRef.current);
      clearInterval(dotRef.current);
    };
  }, []);

  async function handleRegenerate() {
    try {
      const res = await apiClient.post('/api/vault/regenerate');
      const { invite_code, expires_at } = res.data;
      router.replace({ pathname: '/create-vault', params: { invite_code, expires_at } });
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.error || 'Could not regenerate code.');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.emoji}>💑</Text>
        <Text style={styles.title}>Waiting for your partner{dots}</Text>
        <Text style={styles.sub}>
          Ask them to open Couple Vault and enter your code.{'\n'}
          This screen updates automatically.
        </Text>

        <ActivityIndicator size="large" color="#E4387A" style={{ marginVertical: 32 }} />

        <TouchableOpacity style={styles.regenBtn} onPress={handleRegenerate} activeOpacity={0.8}>
          <Text style={styles.regenText}>🔄  Generate a new code</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe      : { flex: 1, backgroundColor: '#0D0D0D' },
  container : { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emoji     : { fontSize: 72, marginBottom: 20 },
  title     : { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center', minHeight: 30 },
  sub       : { fontSize: 14, color: '#777', textAlign: 'center', lineHeight: 22, marginTop: 12 },
  regenBtn  : { marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  regenText : { fontSize: 14, color: '#888' },
});
