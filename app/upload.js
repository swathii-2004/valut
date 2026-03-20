import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import apiClient from '../api/client';

export default function UploadScreen() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);

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
      const formData = new FormData();
      formData.append('file', {
        uri: selectedFile.uri,
        name: selectedFile.name || 'upload',
        type: selectedFile.mimeType || 'application/octet-stream',
      });

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
