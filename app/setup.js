// app/setup.js
// Onboarding screen — first screen after login if user has no vault.
// Two choices: Create a new vault OR join with an invite code.
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function SetupScreen() {
  const { setVaultId, setVaultStatus } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleCreateVault() {
    setLoading(true);
    try {
      const res = await apiClient.post('/api/vault/create');
      const { vault_id, invite_code, expires_at } = res.data;
      setVaultId(vault_id);
      setVaultStatus('pending');
      // Navigate to create-vault screen, passing code as param
      router.push({ pathname: '/create-vault', params: { invite_code, expires_at, vault_id } });
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to create vault. Try again.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }

  function handleJoinVault() {
    router.push('/join-vault');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Logo / Hero */}
        <View style={styles.hero}>
          <Text style={styles.lock}>🔐</Text>
          <Text style={styles.title}>Couple Vault</Text>
          <Text style={styles.subtitle}>
            Your private space, sealed together.{'\n'}Create a vault or join your partner's.
          </Text>
        </View>

        {/* Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={handleCreateVault}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.btnIcon}>✨</Text>
                <Text style={styles.btnPrimaryText}>Create a Vault</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary]}
            onPress={handleJoinVault}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.btnIcon}>🔑</Text>
            <Text style={styles.btnSecondaryText}>I Have a Code</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Each vault is sealed with a unique encryption key.{'\n'}Only you and your partner can read its contents.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const PINK = '#E4387A';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D0D0D' },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
    paddingVertical: 48,
  },
  hero: { alignItems: 'center', marginTop: 32 },
  lock: { fontSize: 72, marginBottom: 16 },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#9A9A9A',
    textAlign: 'center',
    lineHeight: 24,
  },
  actions: { gap: 16 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 10,
  },
  btnPrimary: { backgroundColor: PINK },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: PINK,
  },
  btnIcon: { fontSize: 20 },
  btnPrimaryText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  btnSecondaryText: { fontSize: 17, fontWeight: '700', color: PINK },
  hint: {
    fontSize: 12,
    color: '#555',
    textAlign: 'center',
    lineHeight: 18,
  },
});
