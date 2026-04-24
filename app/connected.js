// app/connected.js
// Celebration screen shown to both partners after vault is activated.
// Shows both partners' display names, then navigates to chat.
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, Animated,
} from 'react-native';
import { router } from 'expo-router';
import apiClient from '../api/client';

export default function ConnectedScreen() {
  const [myName,      setMyName]      = useState('');
  const [partnerName, setPartnerName] = useState('');
  const scaleAnim  = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fetch both profiles
    Promise.all([
      apiClient.get('/api/profile/me'),
      apiClient.get('/api/profile/partner'),
    ]).then(([meRes, partnerRes]) => {
      setMyName(meRes.data.display_name || 'You');
      setPartnerName(partnerRes.data.display_name || 'Partner');
    }).catch(() => {});

    // Pop-in animation
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 6 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Animated hearts burst */}
        <Animated.Text style={[styles.burst, { transform: [{ scale: scaleAnim }] }]}>
          💞
        </Animated.Text>

        <Text style={styles.title}>You're Connected!</Text>

        {/* Partner names */}
        <Animated.View style={[styles.namesRow, { opacity: opacityAnim }]}>
          <View style={styles.nameChip}>
            <Text style={styles.nameText}>{myName || '…'}</Text>
          </View>
          <Text style={styles.heart}>❤️</Text>
          <View style={styles.nameChip}>
            <Text style={styles.nameText}>{partnerName || '…'}</Text>
          </View>
        </Animated.View>

        <Text style={styles.sub}>
          Your vault is sealed and ready.{'\n'}Everything inside is encrypted — just for you two.
        </Text>

        <TouchableOpacity
          style={styles.btn}
          onPress={() => router.replace('/chat')}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>Start Chatting 💬</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const PINK = '#E4387A';

const styles = StyleSheet.create({
  safe      : { flex: 1, backgroundColor: '#0D0D0D' },
  container : {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 28, gap: 24,
  },
  burst     : { fontSize: 96 },
  title     : { fontSize: 30, fontWeight: '800', color: '#fff', textAlign: 'center' },
  namesRow  : { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nameChip  : {
    backgroundColor: '#1A1A1A', borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 10,
    borderWidth: 1, borderColor: PINK,
  },
  nameText  : { fontSize: 16, fontWeight: '700', color: '#fff' },
  heart     : { fontSize: 24 },
  sub       : { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22 },
  btn       : {
    width: '100%', paddingVertical: 17,
    backgroundColor: PINK, borderRadius: 14, alignItems: 'center',
  },
  btnText   : { fontSize: 17, fontWeight: '700', color: '#fff' },
});
