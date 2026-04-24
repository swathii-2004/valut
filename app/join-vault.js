// app/join-vault.js
// Partner B enters the 8-char invite code in OTP-style individual boxes.
// Calls POST /api/vault/join on submit.
import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';

const CODE_LENGTH = 8;

export default function JoinVaultScreen() {
  const { setVaultId, setVaultStatus } = useAuth();
  const [chars, setChars]   = useState(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const inputs = useRef([]);

  function handleChange(text, index) {
    const char = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1);
    const next  = [...chars];
    next[index] = char;
    setChars(next);
    if (char && index < CODE_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  }

  function handleKeyPress(e, index) {
    if (e.nativeEvent.key === 'Backspace' && !chars[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  async function handleJoin() {
    const code = chars.join('');
    if (code.length < CODE_LENGTH) {
      Alert.alert('Incomplete', 'Please enter all 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.post('/api/vault/join', { invite_code: code });
      setVaultId(res.data.vault_id);
      setVaultStatus('active');
      router.replace('/connected');
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429) {
        Alert.alert('Too many attempts', 'Please wait 15 minutes and try again.');
      } else {
        Alert.alert('Invalid Code', 'That code is wrong, expired, or already used.');
      }
      setChars(Array(CODE_LENGTH).fill(''));
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = chars.every(c => c !== '') && !loading;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.emoji}>🔑</Text>
        <Text style={styles.title}>Enter Invite Code</Text>
        <Text style={styles.sub}>Your partner's 8-character vault code</Text>

        {/* OTP boxes */}
        <View style={styles.codeRow}>
          {chars.map((char, i) => (
            <TextInput
              key={i}
              ref={el => (inputs.current[i] = el)}
              style={[styles.box, char ? styles.boxFilled : null]}
              value={char}
              onChangeText={t => handleChange(t, i)}
              onKeyPress={e => handleKeyPress(e, i)}
              maxLength={2}
              autoCapitalize="characters"
              autoCorrect={false}
              keyboardType="default"
              returnKeyType="next"
              selectionColor="#E4387A"
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.btn, !canSubmit && styles.btnDisabled]}
          onPress={handleJoin}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Connect 🔐</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const PINK = '#E4387A';

const styles = StyleSheet.create({
  safe       : { flex: 1, backgroundColor: '#0D0D0D' },
  container  : { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 20 },
  emoji      : { fontSize: 64 },
  title      : { fontSize: 26, fontWeight: '800', color: '#fff' },
  sub        : { fontSize: 14, color: '#777' },
  codeRow    : { flexDirection: 'row', gap: 8 },
  box        : {
    width: 40, height: 52, borderRadius: 10,
    backgroundColor: '#1A1A1A', borderWidth: 1.5, borderColor: '#333',
    color: '#fff', fontSize: 20, fontWeight: '800',
    textAlign: 'center',
  },
  boxFilled  : { borderColor: PINK },
  btn        : {
    width: '100%', paddingVertical: 16,
    backgroundColor: PINK, borderRadius: 14, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  btnText    : { fontSize: 17, fontWeight: '700', color: '#fff' },
  backLink   : { marginTop: 4 },
  backText   : { fontSize: 14, color: '#555' },
});
