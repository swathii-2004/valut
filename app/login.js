import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  Dimensions, StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const BASE_URL = 'https://couplvault.online';
const { width: W, height: H } = Dimensions.get('window');

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [focusEmail, setFocusEmail] = useState(false);
  const [focusPass, setFocusPass] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/api/auth/login`, { email: email.trim(), password });
      await login(res.data);
      router.replace('/chat');
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Login failed. Check your credentials.';
      Alert.alert('Login Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF0F6" />

      {/* Decorative circles */}
      <View style={[s.blob, s.blobTop]} />
      <View style={[s.blob, s.blobBottom]} />

      <View style={s.content}>
        {/* Logo */}
        <View style={s.logoWrap}>
          <View style={s.logoCircle}>
            <Text style={s.logoHeart}>💕</Text>
          </View>
          <Text style={s.appName}>Couple Vault</Text>
          <Text style={s.appTagline}>Your private, encrypted space</Text>
        </View>

        {/* Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Welcome back</Text>
          <Text style={s.cardSub}>Sign in to your vault</Text>

          {/* Email */}
          <View style={[s.inputWrap, focusEmail && s.inputWrapFocus]}>
            <Text style={s.inputIcon}>✉</Text>
            <TextInput
              style={s.input}
              placeholder="Email address"
              placeholderTextColor="#C0A0B0"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setFocusEmail(true)}
              onBlur={() => setFocusEmail(false)}
            />
          </View>

          {/* Password */}
          <View style={[s.inputWrap, focusPass && s.inputWrapFocus]}>
            <Text style={s.inputIcon}>🔑</Text>
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="Password"
              placeholderTextColor="#C0A0B0"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              onFocus={() => setFocusPass(true)}
              onBlur={() => setFocusPass(false)}
            />
            <TouchableOpacity onPress={() => setShowPass(p => !p)} style={s.eyeBtn}>
              <Text style={s.eyeText}>{showPass ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>

          {/* Sign In Button */}
          <TouchableOpacity
            style={[s.btn, loading && s.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnText}>Sign In  →</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <View style={s.lockRow}>
            <Text style={s.lockIcon}>🔒</Text>
            <Text style={s.footerText}>End-to-end encrypted · AES-256-GCM</Text>
          </View>
          <Text style={s.footerSub}>Only you and your partner can read your messages</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF0F6' },

  // Blobs
  blob: {
    position: 'absolute', borderRadius: 999,
    backgroundColor: '#F9C8E0', opacity: 0.5,
  },
  blobTop: { width: W * 0.8, height: W * 0.8, top: -W * 0.25, right: -W * 0.2 },
  blobBottom: { width: W * 0.7, height: W * 0.7, bottom: -W * 0.2, left: -W * 0.2, backgroundColor: '#F5C6DE', opacity: 0.4 },

  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },

  // Logo
  logoWrap: { alignItems: 'center', marginBottom: 36 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#E4387A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8,
    marginBottom: 14,
  },
  logoHeart: { fontSize: 36 },
  appName: { fontSize: 30, fontWeight: '800', color: '#1a0a14', letterSpacing: 0.5 },
  appTagline: { fontSize: 13, color: '#9a6080', marginTop: 4 },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24, padding: 24,
    shadowColor: '#E4387A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 24, elevation: 8,
    borderWidth: 1, borderColor: '#F5C6DE',
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: '#1a0a14', marginBottom: 4 },
  cardSub: { fontSize: 13, color: '#9a6080', marginBottom: 22 },

  // Input
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF0F6', borderRadius: 14,
    paddingHorizontal: 14, marginBottom: 14,
    borderWidth: 1.5, borderColor: '#F5C6DE',
  },
  inputWrapFocus: { borderColor: '#E4387A', backgroundColor: '#FFFFFF' },
  inputIcon: { fontSize: 16, marginRight: 10 },
  input: { flex: 1, color: '#1a0a14', fontSize: 15, paddingVertical: 14 },
  eyeBtn: { padding: 4 },
  eyeText: { fontSize: 16 },

  // Button
  btn: {
    marginTop: 8, backgroundColor: '#E4387A',
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#E4387A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },

  // Footer
  footer: { alignItems: 'center', marginTop: 32 },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  lockIcon: { fontSize: 14 },
  footerText: { color: '#9a6080', fontSize: 12, fontWeight: '600' },
  footerSub: { color: '#D4A0BC', fontSize: 11 },
});
