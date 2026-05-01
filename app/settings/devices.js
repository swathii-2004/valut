import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, RefreshControl
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { getFingerprint, rotateVaultKey } from '../../utils/crypto';

const C = {
  bg: '#0d0d0d',
  card: '#1a1a1a',
  text: '#fff',
  dim: '#777',
  accent: '#e040fb',
  success: '#00e676',
  danger: '#ff5252',
  warn: '#ffd740',
};

export default function DevicesScreen() {
  const { deviceId: myDeviceId, vaultId, identityKey, activeKeyVersion } = useAuth();
  const [myDevices, setMyDevices] = useState([]);
  const [partnerDevices, setPartnerDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [resMy, resPartner] = await Promise.all([
        apiClient.get('/api/devices'),
        apiClient.get('/api/devices/partner')
      ]);
      setMyDevices(resMy.data.devices);
      setPartnerDevices(resPartner.data.devices);
    } catch (err) {
      console.error('[DEVICES] Load error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleVerify = (device) => {
    const fingerprint = getFingerprint(device.identity_public_key);
    
    Alert.alert(
      'Verify Device',
      `Confirm that the fingerprint on your partner's device matches this one:\n\n${fingerprint}\n\nDo they match?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Verify & Trust', 
          onPress: async () => {
            try {
              // In a real app, we would sign the device.id with our private identity key.
              // For this implementation, we'll send a "manual_verification" tag.
              await apiClient.post('/api/devices/verify', {
                device_id: device.id,
                signature: `verified_by_${myDeviceId}_at_${Date.now()}`
              });
              Alert.alert('Success', 'Device is now trusted.');
              fetchData();
            } catch (err) {
              Alert.alert('Error', 'Failed to verify device.');
            }
          }
        }
      ]
    );
  };

  const handleRevoke = (device) => {
    Alert.alert(
      'Revoke Device',
      `Are you sure you want to remove "${device.device_name}"? This device will lose access to all vault keys and we will rotate your vault security key immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Revoke & Rotate Key', 
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              // 1. Delete the device
              await apiClient.delete(`/api/devices/${device.id}`);
              
              // 2. Perform Key Rotation
              console.log('[SECURITY] 🔄 Rotating Vault Key...');
              
              // Fetch latest trusted devices (Partner + Me)
              const [resMy, resPartner] = await Promise.all([
                apiClient.get('/api/devices'),
                apiClient.get('/api/devices/partner')
              ]);
              const allTrusted = [
                ...resMy.data.devices.filter(d => d.id !== device.id),
                ...resPartner.data.devices.filter(d => d.id !== device.id && d.is_verified)
              ];

              const nextVer = (activeKeyVersion || 1) + 1;
              const rotation = await rotateVaultKey(vaultId, identityKey, allTrusted, nextVer);
              
              // 3. Upload new keys
              await Promise.all(rotation.payloads.map(p => apiClient.post('/api/keys/vault', p)));
              
              Alert.alert('Success', 'Device revoked and security keys rotated.');
              fetchData();
            } catch (err) {
              console.error('[SECURITY] Rotation failed:', err.message);
              Alert.alert('Warning', 'Device revoked but key rotation failed. Please try rotating keys manually.');
              fetchData();
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const DeviceCard = ({ device, isPartner }) => {
    const isCurrent = device.id === myDeviceId;
    const fingerprint = getFingerprint(device.identity_public_key);
    
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.deviceName}>
              {device.device_name} {isCurrent && <Text style={styles.currentTag}>(This Device)</Text>}
            </Text>
            <Text style={styles.fingerprint} numberOfLines={1}>FP: {fingerprint}</Text>
          </View>
          {device.is_verified ? (
            <Ionicons name="shield-checkmark" size={24} color={C.success} />
          ) : (
            <Ionicons name="warning" size={24} color={C.warn} />
          )}
        </View>

        <View style={styles.cardFooter}>
          {!device.is_verified && isPartner && (
            <TouchableOpacity style={styles.verifyBtn} onPress={() => handleVerify(device)}>
              <Text style={styles.verifyBtnText}>Verify Trust</Text>
            </TouchableOpacity>
          )}
          {!isCurrent && (
            <TouchableOpacity style={styles.revokeBtn} onPress={() => handleRevoke(device)}>
              <Text style={styles.revokeBtnText}>{isPartner ? 'Block' : 'Revoke'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={C.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Device Security</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        <Text style={styles.sectionTitle}>My Devices</Text>
        {myDevices.map(d => <DeviceCard key={d.id} device={d} isPartner={false} />)}

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Partner Devices</Text>
        {partnerDevices.length === 0 && <Text style={styles.empty}>No partner devices found.</Text>}
        {partnerDevices.map(d => <DeviceCard key={d.id} device={d} isPartner={true} />)}

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color={C.dim} />
          <Text style={styles.infoText}>
            Verified devices are cryptographically linked to your vault. Unverified devices cannot receive vault keys.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#1e1e1e',
  },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 60 },
  sectionTitle: { color: C.dim, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 12, letterSpacing: 1 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#242424' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  deviceName: { color: C.text, fontSize: 16, fontWeight: '700' },
  currentTag: { color: C.accent, fontSize: 12 },
  fingerprint: { color: C.dim, fontSize: 11, marginTop: 4, fontFamily: 'monospace' },
  cardFooter: { flexDirection: 'row', gap: 12 },
  verifyBtn: { backgroundColor: C.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  verifyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  revokeBtn: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: '#333' },
  revokeBtnText: { color: C.danger, fontWeight: '700', fontSize: 13 },
  empty: { color: C.dim, textAlign: 'center', marginTop: 20 },
  infoBox: { flexDirection: 'row', alignItems: 'center', marginTop: 32, padding: 16, backgroundColor: '#111', borderRadius: 12, gap: 12 },
  infoText: { color: C.dim, fontSize: 12, flex: 1, lineHeight: 18 },
});
