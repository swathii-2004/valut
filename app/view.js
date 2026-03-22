import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as ScreenCapture from 'expo-screen-capture';
import { useAuth } from '../context/AuthContext';

const { width, height } = Dimensions.get('window');
const BASE_URL = 'https://couplvault.online';

// Map mime to file extension
function mimeToExt(mime) {
  const m = {
    'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
    'video/3gpp': '.3gp', 'video/x-matroska': '.mkv',
    'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/aac': '.aac',
    'audio/ogg': '.ogg', 'audio/wav': '.wav', 'audio/webm': '.webm',
    'audio/x-m4a': '.m4a',
  };
  return m[mime] || (mime?.startsWith('video/') ? '.mp4' : '.mp3');
}

// ── Audio Player Component ─────────────────────────────
function AudioPlayer({ uri, name }) {
  const soundRef = useRef(null);
  const [status, setStatus] = useState({ isPlaying: false, positionMs: 0, durationMs: 0, isLoaded: false });

  useEffect(() => {
    let s;
    (async () => {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      s = new Audio.Sound();
      try {
        await s.loadAsync({ uri }, {}, true);
        s.setOnPlaybackStatusUpdate(st => {
          if (st.isLoaded) {
            setStatus({ isPlaying: st.isPlaying, positionMs: st.positionMillis, durationMs: st.durationMillis || 0, isLoaded: true });
            if (st.didJustFinish) { s.setPositionAsync(0); }
          }
        });
        soundRef.current = s;
      } catch (e) { console.log('[AUDIO] load error', e.message); }
    })();
    return () => { s?.unloadAsync(); };
  }, [uri]);

  const togglePlay = async () => {
    const s = soundRef.current;
    if (!s) return;
    try {
      if (status.isPlaying) await s.pauseAsync();
      else await s.playAsync();
    } catch { }
  };

  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const progress = status.durationMs > 0 ? status.positionMs / status.durationMs : 0;

  return (
    <View style={ap.wrap}>
      <Text style={ap.name} numberOfLines={2}>{name || 'Voice Message'}</Text>
      <View style={ap.row}>
        <TouchableOpacity onPress={togglePlay} style={ap.playBtn} disabled={!status.isLoaded}>
          <Text style={ap.playIcon}>{status.isPlaying ? '⏸' : '▶'}</Text>
        </TouchableOpacity>
        <View style={ap.progressWrap}>
          <View style={[ap.progressBar, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={ap.time}>{fmt(status.positionMs)} / {fmt(status.durationMs)}</Text>
      </View>
      {!status.isLoaded && <ActivityIndicator color="#E4387A" size="small" style={{ marginTop: 8 }} />}
    </View>
  );
}

const ap = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 32, width: '100%' },
  name: { color: '#ddd', fontSize: 15, textAlign: 'center', marginBottom: 24, paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' },
  playBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#E4387A', justifyContent: 'center', alignItems: 'center' },
  playIcon: { color: '#fff', fontSize: 20 },
  progressWrap: { flex: 1, height: 4, backgroundColor: '#333', borderRadius: 2, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#E4387A' },
  time: { color: '#888', fontSize: 12, minWidth: 80, textAlign: 'right' },
});

// ── Main View Screen ───────────────────────────────────
export default function ViewScreen() {
  const { id, name, mime } = useLocalSearchParams();
  const { accessToken } = useAuth();

  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync();
    return () => {
      ScreenCapture.allowScreenCaptureAsync();
    };
  }, []);
  const [localUri, setLocalUri] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const fileUrl = `${BASE_URL}/api/files/${id}/view`;
  const isImage = mime?.startsWith('image/');
  const isVideo = mime?.startsWith('video/');
  const isAudio = mime?.startsWith('audio/');
  const isPdf = mime === 'application/pdf';

  // Download video/audio to cache
  useEffect(() => {
    if (!(isVideo || isAudio) || !accessToken || !id) return;
    const ext = mimeToExt(mime);
    const dest = FileSystem.cacheDirectory + `vault_${id}${ext}`;
    (async () => {
      try {
        setDownloading(true);
        const info = await FileSystem.getInfoAsync(dest);
        if (info.exists) { setLocalUri(dest); return; }
        const dl = FileSystem.createDownloadResumable(
          `${fileUrl}?token=${accessToken}`, dest
        );
        const result = await dl.downloadAsync();
        if (result?.uri) setLocalUri(result.uri);
        else throw new Error('Download returned no URI');
      } catch (e) {
        setError('Failed to load: ' + e.message);
      } finally {
        setDownloading(false);
      }
    })();
  }, [id, accessToken]);

  // Video player — only init when URI is ready
  const player = useVideoPlayer(localUri || null, p => {
    if (localUri && p) {
      p.loop = false;
      p.play();
    }
  });

  const renderContent = () => {
    if (!accessToken) return <ActivityIndicator color="#E4387A" />;

    if (isImage) {
      const imageUrl = `${fileUrl}?token=${accessToken}`;
      return (
        <Image
          source={{ uri: imageUrl }}
          style={s.image}
          contentFit="contain"
          cachePolicy="none"
        />
      );
    }

    if (isVideo) {
      if (downloading) return (
        <View style={s.center}>
          <ActivityIndicator color="#E4387A" size="large" />
          <Text style={s.loadingText}>Loading video…</Text>
        </View>
      );
      if (error) return <View style={s.center}><Text style={s.errorText}>{error}</Text></View>;
      if (!localUri) return <View style={s.center}><ActivityIndicator color="#E4387A" /></View>;
      return (
        <VideoView
          player={player}
          style={s.video}
          allowsFullscreen
          allowsPictureInPicture
          contentFit="contain"
          nativeControls
        />
      );
    }

    if (isAudio) {
      if (downloading) return (
        <View style={s.center}>
          <ActivityIndicator color="#E4387A" size="large" />
          <Text style={s.loadingText}>Loading audio…</Text>
        </View>
      );
      if (error) return <View style={s.center}><Text style={s.errorText}>{error}</Text></View>;
      if (!localUri) return null;
      return (
        <View style={s.center}>
          <Text style={{ fontSize: 56, marginBottom: 24 }}>🎵</Text>
          <AudioPlayer uri={localUri} name={name} />
        </View>
      );
    }

    if (isPdf) {
      return <WebView source={{ uri: fileUrl, headers: { Authorization: `Bearer ${accessToken}` } }} style={{ flex: 1 }} />;
    }

    return (
      <View style={s.center}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>📄</Text>
        <Text style={s.unknownTitle}>{name || 'File'}</Text>
        <Text style={s.unknownSub}>{mime || 'Unknown type'}</Text>
      </View>
    );
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.fileName} numberOfLines={1}>{name || 'Media'}</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={s.content}>{renderContent()}</View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1e1e1e',
  },
  backBtn: { width: 60 },
  backText: { color: '#E4387A', fontSize: 18, fontWeight: '600' },
  fileName: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  content: { flex: 1 },
  image: { width, height: height - 120, backgroundColor: '#000' },
  video: { width, height: height - 120, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText: { color: '#777', marginTop: 14, fontSize: 14 },
  errorText: { color: '#ef4444', fontSize: 14, textAlign: 'center' },
  unknownTitle: { color: '#888', fontSize: 18, fontWeight: '600' },
  unknownSub: { color: '#555', fontSize: 12, marginTop: 6 },
});
