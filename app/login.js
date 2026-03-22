import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  Dimensions, StatusBar, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

  // Animations
  const heartScale = useRef(new Animated.Value(1)).current;
  const slideUp = useRef(new Animated.Value(40)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideUp, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
    ]).start();

    // Heartbeat pulse loop
    const pulse = () => {
      Animated.sequence([
        Animated.spring(heartScale, { toValue: 1.18, tension: 80, friction: 4, useNativeDriver: true }),
        Animated.spring(heartScale, { toValue: 1, tension: 80, friction: 4, useNativeDriver: true }),
      ]).start(() => setTimeout(pulse, 2200));
    };
    const t = setTimeout(pulse, 800);
    return () => clearTimeout(t);
  }, []);

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
      <StatusBar barStyle="light-content" backgroundColor="#2D0060" />

      {/* Purple gradient blobs */}
      <View style={s.blobTopLeft} />
      <View style={s.blobBottomRight} />
      <View style={s.blobCenter} />

      <Animated.View style={[s.content, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>

        {/* Logo */}
        <View style={s.logoWrap}>
          <Animated.View style={[s.logoCircle, { transform: [{ scale: heartScale }] }]}>
            <Ionicons name="heart" size={40} color="#8B2FC9" />
          </Animated.View>
          <Text style={s.appName}>Couple Vault</Text>
          <Text style={s.appTagline}>Your private, encrypted space 💜</Text>
        </View>

        {/* Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Welcome back</Text>
          <Text style={s.cardSub}>Sign in to your vault</Text>

          {/* Email */}
          <View style={[s.inputWrap, focusEmail && s.inputWrapFocus]}>
            <Ionicons name="mail-outline" size={18} color={focusEmail ? '#8B2FC9' : '#A78EC0'} style={s.inputIcon} />
            <TextInput
              style={s.input}
              placeholder="Email address"
              placeholderTextColor="#B09CC8"
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
            <Ionicons name="lock-closed-outline" size={18} color={focusPass ? '#8B2FC9' : '#A78EC0'} style={s.inputIcon} />
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="Password"
              placeholderTextColor="#B09CC8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              onFocus={() => setFocusPass(true)}
              onBlur={() => setFocusPass(false)}
            />
            <TouchableOpacity onPress={() => setShowPass(p => !p)} style={s.eyeBtn}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color="#A78EC0" />
            </TouchableOpacity>
          </View>

          {/* Sign In Button */}
          <TouchableOpacity
            style={[s.btn, loading && s.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.82}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={s.btnInner}>
                <Text style={s.btnText}>Sign In</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Ionicons name="shield-checkmark-outline" size={14} color="rgba(255,255,255,0.6)" />
          <Text style={s.footerText}>  End-to-end encrypted · AES-256-GCM</Text>
        </View>
        <Text style={s.footerSub}>Only you and your partner can read your messages</Text>

      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const PURPLE_DARK = '#1A0035';
const PURPLE_MID = '#3D0078';
const PURPLE_ACCENT = '#8B2FC9';
const PURPLE_LIGHT = '#C47DFF';

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: PURPLE_DARK },

  // Background blobs
  blobTopLeft: {
    position: 'absolute', width: W * 0.9, height: W * 0.9,
    borderRadius: W * 0.45, backgroundColor: PURPLE_MID,
    opacity: 0.55, top: -W * 0.3, left: -W * 0.25,
  },
  blobBottomRight: {
    position: 'absolute', width: W * 0.7, height: W * 0.7,
    borderRadius: W * 0.35, backgroundColor: '#5B0099',
    opacity: 0.45, bottom: -W * 0.2, right: -W * 0.2,
  },
  blobCenter: {
    position: 'absolute', width: W * 0.5, height: W * 0.5,
    borderRadius: W * 0.25, backgroundColor: PURPLE_ACCENT,
    opacity: 0.12, top: H * 0.3, left: W * 0.25,
  },

  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },

  // Logo
  logoWrap: { alignItems: 'center', marginBottom: 40 },
  logoCircle: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: PURPLE_ACCENT, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
    marginBottom: 16,
  },
  appName: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  appTagline: { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginTop: 5 },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 28, padding: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 32, elevation: 16,
  },
  cardTitle: { fontSize: 24, fontWeight: '800', color: '#1A0035', marginBottom: 4 },
  cardSub: { fontSize: 14, color: '#A78EC0', marginBottom: 24 },

  // Input
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F5EEFF', borderRadius: 16,
    paddingHorizontal: 14, marginBottom: 14,
    borderWidth: 1.5, borderColor: '#DDC5F5',
  },
  inputWrapFocus: { borderColor: PURPLE_ACCENT, backgroundColor: '#fff' },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: '#1A0035', fontSize: 15, paddingVertical: 14 },
  eyeBtn: { padding: 4 },

  // Button
  btn: {
    marginTop: 10, backgroundColor: PURPLE_ACCENT,
    borderRadius: 16, paddingVertical: 16, alignItems: 'center',
    shadowColor: PURPLE_ACCENT, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 14, elevation: 8,
  },
  btnDisabled: { opacity: 0.7 },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },

  // Footer
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 28, marginBottom: 6 },
  footerText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' },
  footerSub: { color: 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center' },
});
