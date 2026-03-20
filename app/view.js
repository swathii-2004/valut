import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '../context/AuthContext';

const { width, height } = Dimensions.get('window');
const BASE_URL = 'https://couplvault.online';

export default function ViewScreen() {
  const { id, name, mime } = useLocalSearchParams();
  const { accessToken } = useAuth();
  const [localUri, setLocalUri] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const fileUrl = `${BASE_URL}/api/files/${id}/view`;
  const isImage = mime?.startsWith('image/');
  const isVideo = mime?.startsWith('video/');
  const isAudio = mime?.startsWith('audio/');
  const isPdf = mime === 'application/pdf';

  // Download video/audio to cache with Authorization header, then play locally
  useEffect(() => {
    if (!(isVideo || isAudio) || !accessToken || !id) return;
    const ext = isVideo ? '.mp4' : '.mp3';
    const dest = FileSystem.cacheDirectory + `vault_${id}${ext}`;
    (async () => {
      try {
        setDownloading(true);
        const info = await FileSystem.getInfoAsync(dest);
        if (info.exists) { setLocalUri(dest); return; }
        const dl = FileSystem.createDownloadResumable(
          fileUrl, dest, { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const result = await dl.downloadAsync();
        setLocalUri(result.uri);
      } catch (e) {
        setError('Failed to load. ' + e.message);
      } finally {
        setDownloading(false);
      }
    })();
  }, [id, accessToken]);

  // expo-video player (only active when localUri is ready)
  const player = useVideoPlayer(localUri || '', p => {
    if (localUri) p.play();
  });

  const renderContent = () => {
    if (!accessToken) return <ActivityIndicator color="#8B5CF6" />;

    // Image
    if (isImage) {
      return (
        <Image
          source={{ uri: fileUrl, headers: { Authorization: `Bearer ${accessToken}` } }}
          style={styles.image}
          contentFit="contain"
        />
      );
    }

    // Video
    if (isVideo) {
      if (downloading) return (
        <View style={styles.center}>
          <ActivityIndicator color="#8B5CF6" size="large" />
          <Text style={styles.loadingText}>Loading video…</Text>
        </View>
      );
      if (error) return <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>;
      if (!localUri) return <View style={styles.center}><ActivityIndicator color="#8B5CF6" /></View>;
      return (
        <VideoView
          player={player}
          style={styles.video}
          allowsFullscreen
          allowsPictureInPicture
          contentFit="contain"
        />
      );
    }

    // Audio
    if (isAudio) {
      if (downloading) return (
        <View style={styles.center}>
          <ActivityIndicator color="#8B5CF6" size="large" />
          <Text style={styles.loadingText}>Loading audio…</Text>
        </View>
      );
      if (error) return <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>;
      if (!localUri) return null;
      return (
        <View style={styles.center}>
          <Text style={styles.audioName} numberOfLines={2}>{name}</Text>
          <VideoView player={player} style={styles.audio} />
        </View>
      );
    }

    // PDF via WebView
    if (isPdf) {
      const html = `<html><body style="margin:0;padding:0">
        <iframe src="${fileUrl}" style="width:100%;height:100vh;border:none"></iframe>
      </body></html>`;
      return <WebView source={{ html }} style={{ flex: 1 }} originWhitelist={['*']} />;
    }

    return (
      <View style={styles.center}>
        <Text style={styles.unknownTitle}>Preview not available</Text>
        <Text style={styles.unknownSub}>{mime || 'Unknown type'}</Text>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.fileName} numberOfLines={1}>{name}</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.content}>{renderContent()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1e1e1e',
  },
  backBtn: { width: 60 },
  backText: { color: '#8B5CF6', fontSize: 18, fontWeight: '600' },
  fileName: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  content: { flex: 1 },
  image: { width, height: height - 120, backgroundColor: '#000' },
  video: { width, height: height - 120, backgroundColor: '#000' },
  audio: { width: width - 40, height: 80 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText: { color: '#555', marginTop: 14, fontSize: 14 },
  errorText: { color: '#ef4444', fontSize: 14, textAlign: 'center' },
  audioName: { color: '#aaa', fontSize: 16, marginBottom: 32, textAlign: 'center', paddingHorizontal: 20 },
  unknownTitle: { color: '#555', fontSize: 18, fontWeight: '600' },
  unknownSub: { color: '#333', fontSize: 12, marginTop: 6 },
});
