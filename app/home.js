import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fileIcon(mimeType) {
  if (!mimeType) return '📄';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType === 'application/pdf') return '📑';
  return '📄';
}

export default function HomeScreen() {
  const { logout } = useAuth();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/files');
      setFiles(res.data.files || []);
    } catch (err) {
      Alert.alert('Error', 'Failed to load files. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const handleLogout = async () => {
    try { await apiClient.post('/api/auth/logout'); } catch (_) {}
    await logout();
    router.replace('/login');
  };

  const handleRefresh = () => { setRefreshing(true); fetchFiles(); };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.fileCard}
      activeOpacity={0.75}
      onPress={() => router.push({ pathname: '/view', params: { id: item.id, name: item.original_name, mime: item.mime_type } })}
    >
      <Text style={styles.fileIcon}>{fileIcon(item.mime_type)}</Text>
      <View style={styles.fileMeta}>
        <Text style={styles.fileName} numberOfLines={1}>{item.original_name}</Text>
        <Text style={styles.fileInfo}>{formatBytes(item.size_bytes)} · {formatDate(item.created_at)}</Text>
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Couple Vault 🔐</Text>
          <Text style={styles.headerSub}>{files.length} file{files.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#e040fb" />
          <Text style={styles.loadingText}>Loading your vault…</Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={files.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#e040fb" />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyEmoji}>🗂️</Text>
              <Text style={styles.emptyText}>Your vault is empty</Text>
              <Text style={styles.emptySub}>Tap Upload to add your first file</Text>
            </View>
          }
        />
      )}

      {/* Upload FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => router.push('/upload')} activeOpacity={0.85}>
        <Text style={styles.fabText}>＋  Upload</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d0d' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#1e1e1e',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 13, color: '#777', marginTop: 2 },
  logoutBtn: { backgroundColor: '#1e1e1e', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  logoutText: { color: '#e040fb', fontWeight: '700', fontSize: 13 },
  list: { padding: 16, paddingBottom: 100 },
  emptyContainer: { flex: 1 },
  fileCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 14,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#242424',
  },
  fileIcon: { fontSize: 30, marginRight: 14 },
  fileMeta: { flex: 1 },
  fileName: { color: '#fff', fontWeight: '600', fontSize: 15 },
  fileInfo: { color: '#666', fontSize: 12, marginTop: 3 },
  arrow: { color: '#555', fontSize: 22, marginLeft: 8 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#555', marginTop: 12 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 120 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptySub: { color: '#555', fontSize: 14, marginTop: 6 },
  fab: {
    position: 'absolute', bottom: 32, right: 24, left: 24,
    backgroundColor: '#e040fb', borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: '#e040fb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12,
    elevation: 8,
  },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
});
