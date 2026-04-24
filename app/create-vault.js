// app/create-vault.js
// Partner A sees their 8-char invite code with Share / Copy buttons and a live expiry countdown.
// Auto-navigates to waiting.js after user taps "Share & Wait".
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, Share, Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';

function formatCountdown(expiresAt) {
  const diff = new Date(expiresAt) - new Date();
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

export default function CreateVaultScreen() {
  const { invite_code, expires_at } = useLocalSearchParams();
  const [countdown, setCountdown] = useState(formatCountdown(expires_at));
  const [copied, setCopied]       = useState(false);

  // Live countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      const label = formatCountdown(expires_at);
      setCountdown(label);
      if (label === 'Expired') clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [expires_at]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `Join my Couple Vault! Enter this code: ${invite_code}\nValid for 24 hours. One-time use only.`,
      });
      router.replace('/waiting');
    } catch (err) {
      Alert.alert('Share failed', err.message);
    }
  }, [invite_code]);

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [invite_code]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.heading}>Your Vault Code</Text>
        <Text style={styles.sub}>Share this with your partner. It works once, for 24 hours.</Text>

        {/* OTP-style code display */}
        <View style={styles.codeRow}>
          {invite_code?.split('').map((char, i) => (
            <View key={i} style={styles.codeBox}>
              <Text style={styles.codeChar}>{char}</Text>
            </View>
          ))}
        </View>

        {/* Countdown */}
        <View style={styles.timerRow}>
          <Text style={styles.timerLabel}>⏳ Expires in </Text>
          <Text style={[styles.timerValue, countdown === 'Expired' && styles.timerExpired]}>
            {countdown}
          </Text>
        </View>

        {/* Actions */}
        <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleShare} activeOpacity={0.85}>
          <Text style={styles.btnText}>📤  Share Code & Wait</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={handleCopy} activeOpacity={0.85}>
          <Text style={styles.btnSecText}>{copied ? '✅  Copied!' : '📋  Copy Code'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.waitLink} onPress={() => router.replace('/waiting')}>
          <Text style={styles.waitLinkText}>Already shared → Go to waiting screen</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const PINK = '#E4387A';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D0D0D' },
  container: {
    flex: 1, paddingHorizontal: 28,
    alignItems: 'center', justifyContent: 'center', gap: 20,
  },
  heading: { fontSize: 28, fontWeight: '800', color: '#fff', textAlign: 'center' },
  sub: { fontSize: 14, color: '#777', textAlign: 'center', lineHeight: 20 },
  codeRow: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  codeBox: {
    width: 42, height: 52, borderRadius: 10,
    backgroundColor: '#1A1A1A', borderWidth: 1.5, borderColor: PINK,
    alignItems: 'center', justifyContent: 'center',
  },
  codeChar: { fontSize: 22, fontWeight: '800', color: PINK, letterSpacing: 1 },
  timerRow: { flexDirection: 'row', alignItems: 'center' },
  timerLabel: { fontSize: 14, color: '#888' },
  timerValue: { fontSize: 14, fontWeight: '700', color: '#fff' },
  timerExpired: { color: '#E44' },
  btn: {
    width: '100%', paddingVertical: 16,
    borderRadius: 14, alignItems: 'center',
  },
  btnPrimary: { backgroundColor: PINK },
  btnSecondary: { backgroundColor: '#1A1A1A', borderWidth: 1.5, borderColor: '#333' },
  btnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  btnSecText: { fontSize: 16, fontWeight: '700', color: '#ccc' },
  waitLink: { marginTop: 8 },
  waitLinkText: { fontSize: 13, color: '#555', textDecorationLine: 'underline' },
});
