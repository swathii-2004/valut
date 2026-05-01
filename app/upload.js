import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { encryptMessage } from '../utils/crypto';
import * as FileSystem from 'expo-file-system';
import { Buffer } from 'buffer';
import crypto from 'react-native-quick-crypto';

export default function UploadScreen() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const { vaultId, identityKey, accessToken } = useAuth();
  
  const myId = accessToken ? JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString()).sub : null;
  // We'll fetch the vault key from a context or state in a real app,
  // but for now, we'll fetch it from the server and decrypt it here or use a helper.
  // Actually, I'll add a helper to useAuth or just fetch it here.

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.length > 0) {
        setSelectedFile(result.assets[0]);
      }
    } catch (err) {
      Alert.alert('Error', 'Could not open document picker.');
    }
  };

  const pickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your media library.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 1,
      });
      if (!result.canceled && result.assets?.length > 0) {
        const asset = result.assets[0];
        setSelectedFile({
          uri: asset.uri,
          name: asset.fileName || `photo_${Date.now()}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
          size: asset.fileSize,
        });
      }
    } catch (err) {
      Alert.alert('Error', 'Could not open gallery.');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      Alert.alert('No file selected', 'Please pick a file first.');
      return;
    }
    setUploading(true);
    try {
      // 1. Fetch & Decrypt Vault Key (if not already in memory)
      const keysRes = await apiClient.get(`/api/keys/vault/${vaultId}`);
      const myKeyObj = keysRes.data.keys.find(k => k.key_version === 1); // Simplification
      const { decryptVaultKey } = require('../utils/crypto');
      const vKey = decryptVaultKey(myKeyObj.encrypted_key, myKeyObj.ephemeral_public_key, identityKey);

      // 2. Read File and Encrypt with AAD
      console.log('[E2EE] 🔒 Encrypting file with AAD...');
      const fileBase64 = await FileSystem.readAsStringAsync(selectedFile.uri, { encoding: 'base64' });
      const fileBuffer = Buffer.from(fileBase64, 'base64');
      
      const aad = { v: vaultId, s: myId }; // Use real UUID for consistency
      const fileEnc = encryptMessage(fileBuffer.toString('hex'), vKey, 0, aad); // Files use counter 0
      
      // Extract IV (12 bytes), Tag (16 bytes), and Ciphertext from the envelope hex
      const envelopeBuf = Buffer.from(fileEnc.blob, 'hex');
      const iv = envelopeBuf.subarray(0, 12).toString('hex');
      const tag = envelopeBuf.subarray(12, 28).toString('hex');
      
      const nameEnc = encryptMessage(selectedFile.name, vKey, 0, aad);
      const nameEnv = Buffer.from(nameEnc.blob, 'hex');
      const nameIv = nameEnv.subarray(0, 12).toString('hex');
      const nameTag = nameEnv.subarray(12, 28).toString('hex');
      const nameCipher = nameEnv.subarray(28).toString('hex');

      // 3. Prepare Multipart Upload
      const formData = new FormData();
      formData.append('file', {
        uri: `data:application/octet-stream;base64,${envelopeBuf.subarray(28).toString('base64')}`,
        name: 'encrypted_file',
        type: 'application/octet-stream',
      });
      formData.append('is_e2ee', 'true');
      formData.append('iv', iv);
      formData.append('auth_tag', tag);
      formData.append('encrypted_name', nameCipher);
      formData.append('name_iv', nameIv);
      formData.append('name_auth_tag', nameTag);

      await apiClient.post('/api/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      Alert.alert('✅ Upload Successful', `"${selectedFile.name}" has been saved to your vault.`, [
        { text: 'Back to Vault', onPress: () => router.replace('/home') },
      ]);
      setSelectedFile(null);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Upload failed.';
      Alert.alert('Upload Failed', msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Upload File</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.sectionLabel}>Choose source</Text>

        {/* Picker buttons */}
        <TouchableOpacity style={styles.optionCard} onPress={pickDocument} activeOpacity={0.75}>
          <Text style={styles.optionEmoji}>📂</Text>
          <View>
            <Text style={styles.optionTitle}>Browse Files</Text>
            <Text style={styles.optionSub}>Documents, PDFs, audio, any file</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.optionCard} onPress={pickFromGallery} activeOpacity={0.75}>
          <Text style={styles.optionEmoji}>🖼️</Text>
          <View>
            <Text style={styles.optionTitle}>Gallery</Text>
            <Text style={styles.optionSub}>Photos and videos</Text>
          </View>
        </TouchableOpacity>

        {/* Selected file preview */}
        {selectedFile && (
          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>Selected</Text>
            <Text style={styles.previewName} numberOfLines={2}>{selectedFile.name}</Text>
            {selectedFile.size ? (
              <Text style={styles.previewSize}>
                {(selectedFile.size / 1024).toFixed(1)} KB
              </Text>
            ) : null}
            <TouchableOpacity onPress={() => setSelectedFile(null)}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Upload button */}
        <TouchableOpacity
          style={[styles.uploadBtn, !selectedFile && styles.uploadBtnDisabled]}
          onPress={handleUpload}
          disabled={uploading || !selectedFile}
          activeOpacity={0.8}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.uploadBtnText}>🔒  Upload to Vault</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footer}>Files are encrypted before storage</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d0d' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#1e1e1e',
  },
  backBtn: { width: 60 },
  backText: { color: '#e040fb', fontSize: 18, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  container: { padding: 20, paddingBottom: 60 },
  sectionLabel: { color: '#777', fontSize: 13, marginBottom: 12, marginTop: 8 },
  optionCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 14,
    padding: 18, marginBottom: 12,
    borderWidth: 1, borderColor: '#242424',
    gap: 16,
  },
  optionEmoji: { fontSize: 32 },
  optionTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  optionSub: { color: '#666', fontSize: 12, marginTop: 2 },
  previewCard: {
    backgroundColor: '#151515', borderRadius: 14,
    padding: 16, marginTop: 16,
    borderWidth: 1, borderColor: '#e040fb44',
  },
  previewLabel: { color: '#e040fb', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  previewName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  previewSize: { color: '#777', fontSize: 12, marginTop: 4 },
  removeText: { color: '#ff5252', fontSize: 13, marginTop: 10, fontWeight: '600' },
  uploadBtn: {
    marginTop: 28, backgroundColor: '#e040fb',
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#e040fb', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  uploadBtnDisabled: { backgroundColor: '#333', shadowOpacity: 0 },
  uploadBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  footer: { textAlign: 'center', color: '#444', marginTop: 20, fontSize: 12 },
});
