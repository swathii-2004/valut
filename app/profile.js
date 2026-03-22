import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, ScrollView, SafeAreaView, Animated,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import apiClient from '../api/client';
import { useTheme } from '../context/ThemeContext';

const BASE_URL = 'https://couplvault.online';

export default function ProfileScreen() {
  const { theme: C } = useTheme();
  const [me, setMe] = useState(null);
  const [partner, setPartner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  // Cache-bust key: increment after each upload so expo-image refetches
  const [avatarVersion, setAvatarVersion] = useState(1);

  // Fade-in animation
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadProfiles();
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const loadProfiles = async () => {
    try {
      const [meRes, partnerRes] = await Promise.all([
        apiClient.get('/api/profile/me'),
        apiClient.get('/api/profile/partner'),
      ]);
      setMe(meRes.data);
      setPartner(partnerRes.data);
      setNewName(meRes.data.display_name || '');
    } catch (e) {
      Alert.alert('Error', 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  const pickAndUploadAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaType ? [ImagePicker.MediaType.Images] : ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      setUploadingAvatar(true);
      const formData = new FormData();
      formData.append('avatar', { uri: asset.uri, name: 'avatar.jpg', type: 'image/jpeg' });
      const uploadRes = await apiClient.put('/api/profile/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Update avatar_url and increment version to force cache-bust
      setMe(prev => ({ ...prev, avatar_url: uploadRes.data.avatar_url }));
      setAvatarVersion(v => v + 1);
      Alert.alert('Done', 'Profile photo updated!');
    } catch (e) {
      Alert.alert('Error', 'Failed to upload photo');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveName = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await apiClient.put('/api/profile/display-name', { display_name: newName.trim() });
      setMe(prev => ({ ...prev, display_name: newName.trim() }));
      setEditingName(false);
    } catch {
      Alert.alert('Error', 'Failed to save name');
    } finally {
      setSaving(false);
    }
  };

  const avatarUrl = me?.avatar_url
    ? `${BASE_URL}${me.avatar_url}?v=${avatarVersion}`
    : null;

  const partnerAvatarUrl = partner?.avatar_url
    ? `${BASE_URL}${partner.avatar_url}?v=1`
    : null;

  if (loading) return (
    <View style={[{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={C.accent} size="large" />
    </View>
  );

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.accent} />
          <Text style={[s.backText, { color: C.accent }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: C.textPrimary }]}>Profile</Text>
        <View style={{ width: 70 }} />
      </View>

      <Animated.ScrollView style={{ opacity: fadeAnim }} contentContainerStyle={{ padding: 20, gap: 16 }}>

        {/* My Profile Card */}
        <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[s.sectionLabel, { color: C.textSec }]}>MY PROFILE</Text>

          {/* Avatar */}
          <TouchableOpacity style={s.avatarWrap} onPress={pickAndUploadAvatar} disabled={uploadingAvatar}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={[s.avatar, { borderColor: C.accentSoft }]}
                contentFit="cover"
                cachePolicy="none"
              />
            ) : (
              <View style={[s.avatarPlaceholder, { backgroundColor: C.accent, borderColor: C.accentSoft }]}>
                <Text style={s.avatarInitial}>{(me?.display_name || me?.email || 'M')[0].toUpperCase()}</Text>
              </View>
            )}
            <View style={[s.avatarEditBadge, { backgroundColor: C.accent, borderColor: C.surface }]}>
              {uploadingAvatar
                ? <ActivityIndicator color="#fff" size="small" />
                : <Ionicons name="camera" size={13} color="#fff" />
              }
            </View>
          </TouchableOpacity>

          {/* Name edit */}
          <View style={[s.nameRow, { width: '100%', alignItems: 'center', marginBottom: 6 }]}>
            {editingName ? (
              <View style={s.nameEditRow}>
                <TextInput
                  style={[s.nameInput, { backgroundColor: C.bg, color: C.textPrimary, borderColor: C.border }]}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Your name"
                  placeholderTextColor={C.textSec}
                  autoFocus
                />
                <TouchableOpacity style={[s.saveBtn, { backgroundColor: C.accent }]} onPress={saveName} disabled={saving}>
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.saveBtnText}>Save</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditingName(false)} style={s.cancelNameBtn}>
                  <Ionicons name="close" size={20} color={C.textSec} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.nameDisplayRow}>
                <Text style={[s.displayName, { color: C.textPrimary }]}>{me?.display_name || 'Set your name'}</Text>
                <TouchableOpacity onPress={() => setEditingName(true)} style={[s.editNameBtn, { backgroundColor: C.accentSoft }]}>
                  <Text style={[s.editNameBtnText, { color: C.accent }]}>Edit</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          <Text style={[s.emailText, { color: C.textSec }]}>{me?.email}</Text>
          <Text style={[s.memberSince, { color: C.textSec, opacity: 0.6 }]}>
            Member since {me?.created_at ? new Date(me.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'}
          </Text>
        </View>

        {/* Partner Profile Card */}
        <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[s.sectionLabel, { color: C.textSec }]}>PARTNER</Text>

          <View style={s.avatarWrap}>
            {partnerAvatarUrl ? (
              <Image
                source={{ uri: partnerAvatarUrl }}
                style={[s.avatar, { borderColor: C.accentSoft }]}
                contentFit="cover"
              />
            ) : (
              <View style={[s.avatarPlaceholder, { backgroundColor: C.accent, opacity: 0.8, borderColor: C.accentSoft }]}>
                <Text style={s.avatarInitial}>{(partner?.display_name || partner?.email || 'P')[0].toUpperCase()}</Text>
              </View>
            )}
          </View>

          <Text style={[s.displayName, { color: C.textPrimary }]}>{partner?.display_name || 'Partner'}</Text>
          <Text style={[s.emailText, { color: C.textSec }]}>{partner?.email}</Text>
          <View style={[s.partnerBadge, { backgroundColor: C.accentSoft }]}>
            <Ionicons name="heart" size={14} color={C.accent} />
            <Text style={[s.partnerBadgeText, { color: C.accent }]}> Your Person</Text>
          </View>
        </View>

        {/* Vault info */}
        <View style={[s.vaultCard, { backgroundColor: C.accent }]}>
          <Ionicons name="shield-checkmark" size={28} color="rgba(255,255,255,0.9)" style={{ marginBottom: 8 }} />
          <Text style={s.vaultTitle}>Couple Vault</Text>
          <Text style={s.vaultSub}>Your messages are end-to-end encrypted with AES-256-GCM. Only you and your partner can read them.</Text>
        </View>

      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 70 },
  backText: { fontSize: 16, fontWeight: '600', marginLeft: 2 },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  card: {
    borderRadius: 20, padding: 20,
    alignItems: 'center', borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, alignSelf: 'flex-start', marginBottom: 16 },

  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3 },
  avatarPlaceholder: {
    width: 90, height: 90, borderRadius: 45,
    justifyContent: 'center', alignItems: 'center', borderWidth: 3,
  },
  avatarInitial: { color: '#fff', fontSize: 36, fontWeight: '700' },
  avatarEditBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', borderWidth: 2,
  },

  nameRow: {},
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  nameInput: {
    flex: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 15, borderWidth: 1,
  },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelNameBtn: { padding: 8 },

  nameDisplayRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  displayName: { fontSize: 20, fontWeight: '700' },
  editNameBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  editNameBtnText: { fontSize: 13, fontWeight: '600' },

  emailText: { fontSize: 14, marginBottom: 4 },
  memberSince: { fontSize: 12, marginTop: 4 },

  partnerBadge: {
    marginTop: 12, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20,
  },
  partnerBadgeText: { fontWeight: '600', fontSize: 13 },

  vaultCard: {
    borderRadius: 20, padding: 20, alignItems: 'center',
  },
  vaultTitle: { color: '#fff', fontWeight: '800', fontSize: 18, marginBottom: 8 },
  vaultSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
