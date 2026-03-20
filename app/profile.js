import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, ScrollView, SafeAreaView,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import apiClient from '../api/client';

const BASE_URL = 'https://couplvault.online';

const C = {
  bg: '#FFF0F6',
  surface: '#FFFFFF',
  accent: '#E4387A',
  accentSoft: '#FFDAEB',
  border: '#F5C6DE',
  textPrimary: '#1a0a14',
  textSec: '#9a6080',
};

export default function ProfileScreen() {
  const [me, setMe] = useState(null);
  const [partner, setPartner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    loadProfiles();
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
      setMe(prev => ({ ...prev, avatar_url: uploadRes.data.avatar_url }));
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

  if (loading) return (
    <View style={[s.root, s.center]}>
      <ActivityIndicator color={C.accent} size="large" />
    </View>
  );

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Profiles</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>

        {/* My Profile Card */}
        <View style={s.card}>
          <Text style={s.sectionLabel}>My Profile</Text>

          {/* Avatar */}
          <TouchableOpacity style={s.avatarWrap} onPress={pickAndUploadAvatar} disabled={uploadingAvatar}>
            {me?.avatar_url ? (
              <Image
                source={{ uri: `${BASE_URL}${me.avatar_url}?t=${Date.now()}` }}
                style={s.avatar}
                contentFit="cover"
              />
            ) : (
              <View style={s.avatarPlaceholder}>
                <Text style={s.avatarInitial}>{(me?.display_name || me?.email || 'M')[0].toUpperCase()}</Text>
              </View>
            )}
            <View style={s.avatarEditBadge}>
              {uploadingAvatar ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.avatarEditIcon}>✎</Text>
              )}
            </View>
          </TouchableOpacity>

          {/* Name edit */}
          <View style={s.nameRow}>
            {editingName ? (
              <View style={s.nameEditRow}>
                <TextInput
                  style={s.nameInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Your name"
                  placeholderTextColor={C.textSec}
                  autoFocus
                />
                <TouchableOpacity style={s.saveBtn} onPress={saveName} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Save</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditingName(false)} style={s.cancelNameBtn}>
                  <Text style={s.cancelNameText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.nameDisplayRow}>
                <Text style={s.displayName}>{me?.display_name || 'Set your name'}</Text>
                <TouchableOpacity onPress={() => setEditingName(true)} style={s.editNameBtn}>
                  <Text style={s.editNameBtnText}>Edit</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          <Text style={s.emailText}>{me?.email}</Text>
          <Text style={s.memberSince}>Member since {me?.created_at ? new Date(me.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'}</Text>
        </View>

        {/* Partner Profile Card */}
        <View style={s.card}>
          <Text style={s.sectionLabel}>Partner</Text>

          <View style={s.avatarWrap}>
            {partner?.avatar_url ? (
              <Image
                source={{ uri: `${BASE_URL}${partner.avatar_url}` }}
                style={s.avatar}
                contentFit="cover"
              />
            ) : (
              <View style={[s.avatarPlaceholder, { backgroundColor: '#B5407A' }]}>
                <Text style={s.avatarInitial}>{(partner?.display_name || partner?.email || 'P')[0].toUpperCase()}</Text>
              </View>
            )}
          </View>

          <Text style={s.displayName}>{partner?.display_name || 'Partner'}</Text>
          <Text style={s.emailText}>{partner?.email}</Text>
          <View style={s.partnerBadge}>
            <Text style={s.partnerBadgeText}>💑 Your Person</Text>
          </View>
        </View>

        {/* Vault info */}
        <View style={s.vaultCard}>
          <Text style={s.vaultTitle}>Couple Vault</Text>
          <Text style={s.vaultSub}>Your messages are end-to-end encrypted with AES-256-GCM. Only you and your partner can read them.</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: { width: 60 },
  backText: { color: C.accent, fontSize: 18, fontWeight: '600' },
  headerTitle: { color: C.textPrimary, fontSize: 17, fontWeight: '700' },

  card: {
    backgroundColor: C.surface, borderRadius: 20, padding: 20,
    alignItems: 'center', borderWidth: 1, borderColor: C.border,
    shadowColor: '#E4387A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  sectionLabel: { color: C.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', alignSelf: 'flex-start', marginBottom: 16 },

  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: C.accentSoft },
  avatarPlaceholder: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: C.accentSoft,
  },
  avatarInitial: { color: '#fff', fontSize: 36, fontWeight: '700' },
  avatarEditBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: C.surface,
  },
  avatarEditIcon: { color: '#fff', fontSize: 12, fontWeight: '700' },

  nameRow: { width: '100%', alignItems: 'center', marginBottom: 6 },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  nameInput: {
    flex: 1, backgroundColor: C.bg, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
    color: C.textPrimary, fontSize: 15, borderWidth: 1, borderColor: C.border,
  },
  saveBtn: { backgroundColor: C.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelNameBtn: { padding: 8 },
  cancelNameText: { color: C.textSec, fontSize: 18 },

  nameDisplayRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  displayName: { color: C.textPrimary, fontSize: 20, fontWeight: '700' },
  editNameBtn: { backgroundColor: C.accentSoft, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  editNameBtnText: { color: C.accent, fontSize: 13, fontWeight: '600' },

  emailText: { color: C.textSec, fontSize: 14, marginBottom: 4 },
  memberSince: { color: '#D4A0BC', fontSize: 12, marginTop: 4 },

  partnerBadge: {
    marginTop: 12, backgroundColor: C.accentSoft,
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20,
  },
  partnerBadgeText: { color: C.accent, fontWeight: '600', fontSize: 13 },

  vaultCard: {
    backgroundColor: C.accent, borderRadius: 20, padding: 20, alignItems: 'center',
  },
  vaultTitle: { color: '#fff', fontWeight: '800', fontSize: 18, marginBottom: 8 },
  vaultSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
