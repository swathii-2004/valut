import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  Dimensions, Modal, Pressable, ScrollView, SafeAreaView, PanResponder,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { EMOJI_CATEGORIES, searchEmojis } from '../data/emojis';
import apiClient from '../api/client';

const BASE_URL = 'https://couplvault.online';
const TENOR_KEY = 'AIzaSyC0oPH0y72GDnDqHR0cJUFLBvpCi4n2XWw'; // Tenor API key
const TENOR_URL = 'https://tenor.googleapis.com/v2';
const { width: SCREEN_W } = Dimensions.get('window');
const BUBBLE_MAX = SCREEN_W * 0.72;
const GIF_COL = (SCREEN_W - 24) / 2;

function formatTime(d) {
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function formatDateLabel(d) {
  const date = new Date(d), today = new Date(), yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yest.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function sameDay(a, b) { return new Date(a).toDateString() === new Date(b).toDateString(); }
function formatBytes(b) {
  if (!b) return '';
  return b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
}

// ── Message Bubble ────────────────────────────────────────
function MessageBubble({ msg, myId, token, C, onLongPress, onImagePress }) {
  const isMine = msg.sender_id === myId;
  const reactions = msg.reactions?.filter(r => r.emoji) || [];

  // View-once: if it's a view-once media message not yet seen by recipient and not mine
  const isViewOnce = msg.view_once && !isMine && msg.file_id;
  const isViewOnceExhausted = msg.view_once && !isMine && !msg.file_id;

  const handleViewOnce = async () => {
    // Navigate to view, then mark as viewed
    onImagePress?.(msg);
    try { await apiClient.post(`/api/messages/${msg.id}/viewed`); } catch {}
  };
  return (
    <View style={[bs.bubbleWrap, isMine ? bs.bubbleWrapRight : bs.bubbleWrapLeft]}>
      {msg.reply_to && (
        <View style={[bs.replyQuote, {
          backgroundColor: isMine ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.07)',
          borderLeftColor: isMine ? 'rgba(255,255,255,0.85)' : C.accent,
        }]}>
          <Text style={[bs.replyQuoteLabel, { color: isMine ? 'rgba(255,255,255,0.7)' : C.accent }]}>
            {msg.reply_to.type === 'text' ? '↩ Reply' : '↩ Media'}
          </Text>
          <Text style={[bs.replyQuoteText, { color: isMine ? 'rgba(255,255,255,0.9)' : C.textPrimary }]} numberOfLines={2}>
            {msg.reply_to.content || (msg.reply_to.type === 'image' ? '📷 Photo' : msg.reply_to.type === 'video' ? '🎬 Video' : '📄 File')}
          </Text>
        </View>
      )}
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => onLongPress?.(msg)}
        style={[bs.bubble,
          { backgroundColor: isMine ? C.bubbleSent : C.bubbleReceived },
          !isMine && { borderWidth: 1, borderColor: C.border },
          isMine ? bs.bubbleSentRadius : bs.bubbleRecvRadius,
        ]}
      >
        {/* View-once exhausted */}
        {isViewOnceExhausted && (
          <View style={bs.viewOnceOpened}>
            <Text style={[bs.viewOnceText, { color: isMine ? 'rgba(255,255,255,0.6)' : C.textSec }]}>👁 Opened</Text>
          </View>
        )}
        {/* View-once not yet opened */}
        {isViewOnce && (
          <TouchableOpacity style={[bs.viewOnceBubble, { backgroundColor: isMine ? 'rgba(255,255,255,0.15)' : C.accentSoft }]} onPress={handleViewOnce}>
            <Text style={{ fontSize: 28 }}>👁</Text>
            <Text style={[bs.viewOnceLabel, { color: isMine ? '#fff' : C.accent }]}>
              {msg.view_max === 2 ? 'Tap to view (×2)' : 'Tap to view once'}
            </Text>
          </TouchableOpacity>
        )}
        {msg.type === 'text' && !msg.is_deleted && !isViewOnce && !isViewOnceExhausted && (
          <Text style={[bs.bubbleText, { color: isMine ? '#fff' : C.textPrimary }]}>{msg.content}</Text>
        )}
        {msg.is_deleted && <Text style={bs.deletedText}>Message deleted</Text>}

        {msg.type === 'image' && msg.file_id && !msg.view_once && (
          <TouchableOpacity onPress={() => onImagePress?.(msg)}>
            <Image
              source={{ uri: `${BASE_URL}/api/files/${msg.file_id}/view`, headers: { Authorization: `Bearer ${token}` } }}
              style={bs.imageThumb}
              contentFit="cover"
            />
          </TouchableOpacity>
        )}
        {msg.type === 'video' && !msg.view_once && (
          <TouchableOpacity style={bs.mediaRow} onPress={() => onImagePress?.(msg)}>
            <View style={[bs.mediaIconBox, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
              <Text style={bs.mediaIconText}>▶</Text>
            </View>
            <Text style={[bs.bubbleText, { color: isMine ? '#fff' : C.textPrimary }]} numberOfLines={1}>{msg.file_name || 'Video'}</Text>
          </TouchableOpacity>
        )}
        {msg.type === 'audio' && msg.file_id && (
          <VoiceBubble msg={msg} myId={myId} token={token} C={C} />
        )}
        {msg.type === 'file' && (
          <View style={bs.mediaRow}>
            <View style={[bs.mediaIconBox, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
              <Text style={bs.mediaIconText}>↓</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[bs.bubbleText, { color: isMine ? '#fff' : C.textPrimary }]} numberOfLines={1}>{msg.file_name || 'File'}</Text>
              {msg.file_size ? <Text style={[bs.fileSizeText, { color: isMine ? 'rgba(255,255,255,0.5)' : C.textSec }]}>{formatBytes(msg.file_size)}</Text> : null}
            </View>
          </View>
        )}
        <View style={bs.bubbleMeta}>
          <Text style={[bs.timeText, { color: isMine ? C.timeSent : C.time }]}>{formatTime(msg.created_at)}</Text>
          {isMine && <Text style={[bs.readTick, { color: msg.is_read ? C.accentSoft : 'rgba(255,255,255,0.4)' }]}>{msg.is_read ? ' ✓✓' : ' ✓'}</Text>}
        </View>
      </TouchableOpacity>
      {reactions.length > 0 && (
        <View style={[bs.reactionsRow, { backgroundColor: C.surface, borderColor: C.border }, isMine ? bs.reactRight : bs.reactLeft]}>
          {reactions.map((r, i) => <Text key={i} style={bs.reactionEmoji}>{r.emoji}</Text>)}
        </View>
      )}
    </View>
  );
}

const bs = StyleSheet.create({
  bubbleWrap: { marginBottom: 4 },
  bubbleWrapRight: { alignSelf: 'flex-end', alignItems: 'flex-end', maxWidth: BUBBLE_MAX },
  bubbleWrapLeft: { alignSelf: 'flex-start', alignItems: 'flex-start', maxWidth: BUBBLE_MAX },
  bubble: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  bubbleSentRadius: { borderBottomRightRadius: 5 },
  bubbleRecvRadius: { borderBottomLeftRadius: 5 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  deletedText: { color: '#aaa', fontStyle: 'italic', fontSize: 13 },
  imageThumb: { width: 200, height: 160, borderRadius: 12 },
  mediaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mediaIconBox: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  mediaIconText: { color: '#fff', fontSize: 14 },
  fileSizeText: { fontSize: 11, marginTop: 2 },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, alignSelf: 'flex-end' },
  timeText: { fontSize: 10 },
  readTick: { fontSize: 11 },
  replyQuote: { paddingHorizontal: 10, paddingVertical: 6, marginBottom: 5, borderRadius: 8, borderLeftWidth: 3 },
  replyQuoteLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3, marginBottom: 2 },
  replyQuoteText: { fontSize: 12, lineHeight: 17 },
  reactionsRow: {
    flexDirection: 'row', gap: 2, marginTop: 3,
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1,
  },
  reactRight: { alignSelf: 'flex-end' },
  reactLeft: { alignSelf: 'flex-start' },
  reactionEmoji: { fontSize: 16 },
});

// ── Inline Audio Player for voice bubbles ─────────────
function VoiceBubble({ msg, myId, token, C }) {
  const isMine = msg.sender_id === myId;
  const soundRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  const load = async () => {
    if (soundRef.current) return;
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync(
      { uri: `${BASE_URL}/api/files/${msg.file_id}/view`, headers: { Authorization: `Bearer ${token}` } },
      { shouldPlay: false }
    );
    sound.setOnPlaybackStatusUpdate(st => {
      if (st.isLoaded) {
        setPos(st.positionMillis); setDur(st.durationMillis || 0);
        setPlaying(st.isPlaying);
        if (st.didJustFinish) { sound.setPositionAsync(0); setPlaying(false); }
      }
    });
    soundRef.current = sound;
  };

  const togglePlay = async () => {
    await load();
    const s = soundRef.current;
    if (!s) return;
    if (playing) await s.pauseAsync();
    else await s.playAsync();
  };

  useEffect(() => () => { soundRef.current?.unloadAsync(); }, []);

  const progress = dur > 0 ? pos / dur : 0;
  const fmt = ms => { const t = Math.floor(ms/1000); return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`; };
  const textColor = isMine ? '#fff' : C.textPrimary;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 180 }}>
      <TouchableOpacity onPress={togglePlay} style={[vb.btn, { backgroundColor: isMine ? 'rgba(255,255,255,0.25)' : C.accentSoft }]}>
        <Text style={{ fontSize: 16 }}>{playing ? '⏸' : '▶'}</Text>
      </TouchableOpacity>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={[vb.track, { backgroundColor: isMine ? 'rgba(255,255,255,0.2)' : C.border }]}>
          <View style={[vb.fill, { width: `${progress * 100}%`, backgroundColor: isMine ? '#fff' : C.accent }]} />
        </View>
        <Text style={{ fontSize: 10, color: isMine ? 'rgba(255,255,255,0.6)' : C.textSec }}>{fmt(pos)} / {fmt(dur)}</Text>
      </View>
      <Text style={{ fontSize: 16 }}>🎤</Text>
    </View>
  );
}
const vb = StyleSheet.create({
  btn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  track: { height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});

// ── Reaction emojis (for long-press) ─────────────────────
const REACT_EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '👍', '🔥', '💜'];

// ══════════════════════════════════════════════════════════
export default function ChatScreen() {
  const { accessToken, logout } = useAuth();
  const { theme: C, themeKey, switchTheme, THEMES } = useTheme();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [myId, setMyId] = useState(null);
  const [partnerProfile, setPartnerProfile] = useState(null);
  const [partnerId, setPartnerId] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [showActions, setShowActions] = useState(false);
  const [showAttach, setShowAttach] = useState(false);

  const [showStickers, setShowStickers] = useState(false);
  const [stickerPack, setStickerPack] = useState(Object.keys(EMOJI_CATEGORIES)[0]);
  const [stickerSearch, setStickerSearch] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingMedia, setPendingMedia] = useState(null);
  const [showGif, setShowGif] = useState(false);
  const [gifQuery, setGifQuery] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  // Voice recording
  const [recording, setRecording] = useState(null);
  const [recordingSecs, setRecordingSecs] = useState(0);
  const [pendingAudio, setPendingAudio] = useState(null); // {uri, duration}
  // View-once
  const [viewMode, setViewMode] = useState('normal'); // 'normal' | 'once' | 'twice'
  const recordingTimer = useRef(null);
  const recordingRef = useRef(null);


  const flatListRef = useRef(null);
  const socketRef = useRef(null);
  const typingTimer = useRef(null);
  const typingRef = useRef(false);

  useEffect(() => {
    if (!accessToken) return;
    try {
      const p = JSON.parse(atob(accessToken.split('.')[1]));
      setMyId(p.sub);
    } catch { logout(); }
  }, [accessToken]);

  useEffect(() => {
    if (!myId) return;
    apiClient.get('/api/profile/partner').then(r => setPartnerProfile(r.data)).catch(() => {});
  }, [myId]);

  const fetchMessages = useCallback(async (before = null) => {
    try {
      const url = before ? `/api/messages?before=${before}&limit=50` : '/api/messages?limit=50';
      const res = await apiClient.get(url);
      const msgs = res.data.messages || [];
      setHasMore(res.data.has_more);
      if (res.data.partner_id) setPartnerId(res.data.partner_id);
      if (before) setMessages(prev => [...msgs, ...prev]);
      else setMessages(msgs);
    } catch { Alert.alert('Error', 'Failed to load messages'); }
    finally { setLoading(false); setLoadingMore(false); }
  }, []);

  useEffect(() => { if (myId) fetchMessages(); }, [myId]);

  // Socket
  useEffect(() => {
    if (!accessToken || !myId) return;
    const socket = io(BASE_URL, { auth: { token: accessToken }, transports: ['websocket'], reconnection: true });
    socketRef.current = socket;
    socket.on('connect', () => { if (partnerId) socket.emit('join_room', { partnerId }); });
    socket.on('new_message', (msg) => {
      setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
      if (msg.sender_id !== myId) apiClient.put(`/api/messages/${msg.id}/read`).catch(() => {});
    });
    socket.on('partner_typing', () => setPartnerTyping(true));
    socket.on('partner_stop_typing', () => setPartnerTyping(false));
    socket.on('partner_offline', () => setPartnerTyping(false));
    socket.on('message_read_ack', ({ messageId }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_read: true } : m));
    });
    socket.on('reaction_update', ({ messageId, userId, emoji }) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const reactions = (m.reactions || []).filter(r => r.user_id !== userId);
        if (emoji) reactions.push({ user_id: userId, emoji });
        return { ...m, reactions };
      }));
    });
    socket.on('message_deleted', ({ messageId }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: true } : m));
    });
    socket.on('view_once_opened', ({ messageId, viewCount, exhausted }) => {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, view_count: viewCount, file_id: exhausted ? null : m.file_id } : m
      ));
    });
    return () => socket.disconnect();
  }, [accessToken, myId, partnerId]);

  useEffect(() => {
    if (socketRef.current?.connected && partnerId) socketRef.current.emit('join_room', { partnerId });
  }, [partnerId]);

  const handleTextChange = (val) => {
    setText(val);
    if (!socketRef.current) return;
    if (!typingRef.current) { typingRef.current = true; socketRef.current.emit('typing'); }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      typingRef.current = false;
      socketRef.current?.emit('stop_typing');
    }, 1500);
  };

  const sendText = async (content) => {
    const trimmed = (content || text).trim();
    if (!trimmed || sending) return;
    setSending(true);
    const savedReplyTo = replyTo;
    setText(''); setReplyTo(null);
    typingRef.current = false;
    socketRef.current?.emit('stop_typing');
    try {
      const res = await apiClient.post('/api/messages', { content: trimmed, reply_to_id: savedReplyTo?.id || null });
      const newMsg = res.data.message;
      if (newMsg) setMessages(prev => prev.find(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
    } catch { Alert.alert('Error', 'Failed to send'); }
    finally { setSending(false); }
  };

  const sendSticker = (emoji) => {
    setShowStickers(false);
    sendText(emoji);
  };

  const pickMedia = async (source) => {
    setShowAttach(false);
    try {
      let file = null;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed'); return; }
        const res = await ImagePicker.launchCameraAsync({ quality: 0.9 });
        if (res.canceled || !res.assets?.length) return;
        const a = res.assets[0];
        file = { uri: a.uri, name: `photo_${Date.now()}.jpg`, mimeType: 'image/jpeg', isImage: true };
      } else if (source === 'gallery') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed'); return; }
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaType ? [ImagePicker.MediaType.Images, ImagePicker.MediaType.Videos] : ImagePicker.MediaTypeOptions.All,
          quality: 1,
        });
        if (res.canceled || !res.assets?.length) return;
        const a = res.assets[0];
        file = { uri: a.uri, name: a.fileName || `media_${Date.now()}`, mimeType: a.mimeType || 'image/jpeg', isImage: a.mimeType?.startsWith('image/') !== false };
      } else {
        const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
        if (res.canceled || !res.assets?.length) return;
        const a = res.assets[0];
        file = { uri: a.uri, name: a.name, mimeType: a.mimeType || 'application/octet-stream', isImage: false };
      }
      if (file) setPendingMedia(file);
    } catch { Alert.alert('Error', 'Could not pick file'); }
  };

  const confirmSendMedia = async () => {
    if (!pendingMedia) return;
    const file = pendingMedia;
    setPendingMedia(null);
    const isViewOnce = viewMode === 'once' || viewMode === 'twice';
    const vMax = viewMode === 'twice' ? 2 : 1;
    setViewMode('normal');
    try {
      const formData = new FormData();
      formData.append('file', { uri: file.uri, name: file.name, type: file.mimeType });
      if (isViewOnce) {
        formData.append('view_once', 'true');
        formData.append('view_max', String(vMax));
      }
      const res = await apiClient.post('/api/messages/media', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const newMsg = res.data.message;
      if (newMsg) setMessages(prev => prev.find(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
    } catch { Alert.alert('Error', 'Failed to send file'); }
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Microphone access required'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setRecording(rec);
      setRecordingSecs(0);
      recordingTimer.current = setInterval(() => setRecordingSecs(s => s + 1), 1000);
    } catch (e) { Alert.alert('Error', 'Could not start recording'); }
  };

  const stopRecording = async () => {
    clearInterval(recordingTimer.current);
    const rec = recordingRef.current;
    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      const secs = recordingSecs;
      setRecording(null); recordingRef.current = null; setRecordingSecs(0);
      setPendingAudio({ uri, duration: secs });
    } catch (e) { setRecording(null); recordingRef.current = null; }
  };

  const sendAudio = async () => {
    if (!pendingAudio) return;
    const { uri } = pendingAudio;
    setPendingAudio(null);
    try {
      const name = `voice_${Date.now()}.m4a`;
      const formData = new FormData();
      formData.append('file', { uri, name, type: 'audio/mp4' });
      const res = await apiClient.post('/api/messages/media', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const newMsg = res.data.message;
      if (newMsg) setMessages(prev => prev.find(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
    } catch { Alert.alert('Error', 'Failed to send voice message'); }
  };

  // ── GIF search via Tenor v2 ───────────────────────────
  const searchGifs = async (q) => {
    if (!q?.trim()) return;
    setGifLoading(true);
    setGifResults([]);
    try {
      // Use Tenor v1 with public demo key (most reliable, no auth needed)
      const url = `https://g.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=LIVDSRZULELA&limit=20&media_filter=minimal&contentfilter=low`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGifResults(data.results || []);
    } catch (e) {
      console.log('[GIF ERROR]', e.message);
      Alert.alert('GIF Error', e.message);
    } finally {
      setGifLoading(false);
    }
  };

  const sendGif = async (gifUrl) => {
    setShowGif(false);
    try {
      const name = `gif_${Date.now()}.gif`;
      const dest = FileSystem.cacheDirectory + name;
      const dl = await FileSystem.downloadAsync(gifUrl, dest);
      const formData = new FormData();
      formData.append('file', { uri: dl.uri, name, type: 'image/gif' });
      const res = await apiClient.post('/api/messages/media', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const newMsg = res.data.message;
      if (newMsg) setMessages(prev => prev.find(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
    } catch (e) { Alert.alert('Error', 'Failed to send GIF'); }
  };

  // ── Actions ──────────────────────────────────────────
  const handleLongPress = (msg) => { setSelectedMsg(msg); setShowActions(true); };

  const doReaction = async (emoji) => {
    setShowActions(false);
    if (!selectedMsg) return;
    // optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id !== selectedMsg.id) return m;
      const reactions = (m.reactions || []).filter(r => r.user_id !== myId);
      reactions.push({ user_id: myId, emoji });
      return { ...m, reactions };
    }));
    try { await apiClient.post(`/api/messages/${selectedMsg.id}/react`, { emoji }); }
    catch { Alert.alert('Error', 'Reaction failed'); }
  };
  const doReply = () => { setReplyTo(selectedMsg); setShowActions(false); };
  const doDelete = async () => {
    setShowActions(false);
    if (selectedMsg?.sender_id !== myId) { Alert.alert('', 'You can only delete your own messages'); return; }
    try { await apiClient.delete(`/api/messages/${selectedMsg.id}`); }
    catch { Alert.alert('Error', 'Delete failed'); }
  };

  const loadMore = async () => {
    if (!hasMore || loadingMore || !messages.length) return;
    setLoadingMore(true);
    await fetchMessages(messages[0].created_at);
  };

  const handleLogout = async () => {
    setShowMenu(false);
    try { await apiClient.post('/api/auth/logout'); } catch {}
    await logout(); router.replace('/login');
  };

  // ── Sticker display ───────────────────────────────────
  const stickerEmojis = stickerSearch.trim()
    ? searchEmojis(stickerSearch)
    : (EMOJI_CATEGORIES[stickerPack] || []);

  // ── List data ─────────────────────────────────────────
  const listData = [];
  messages.forEach((msg, i) => {
    if (i === 0 || !sameDay(messages[i - 1].created_at, msg.created_at)) {
      listData.push({ itemType: 'date', id: `date_${msg.id || i}`, label: formatDateLabel(msg.created_at) });
    }
    listData.push({ itemType: 'msg', ...msg });
  });
  if (partnerTyping) listData.push({ itemType: 'typing', id: 'typing' });

  const partnerName = partnerProfile?.display_name || 'Partner';
  const partnerAvatarUrl = partnerProfile?.avatar_url ? `${BASE_URL}${partnerProfile.avatar_url}` : null;

  return (
    <KeyboardAvoidingView style={[s.root, { backgroundColor: C.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: C.header, borderBottomColor: C.border }]}>
        <TouchableOpacity style={s.headerLeft} onPress={() => router.push('/profile')}>
          {partnerAvatarUrl ? (
            <Image source={{ uri: partnerAvatarUrl }} style={[s.headerAvatarImg, { borderColor: C.accentSoft }]} contentFit="cover" />
          ) : (
            <View style={[s.headerAvatarPlaceholder, { backgroundColor: C.accent }]}>
              <Text style={s.headerAvatarText}>{partnerName[0]?.toUpperCase() || 'P'}</Text>
            </View>
          )}
          <View style={s.headerInfo}>
            <Text style={[s.headerName, { color: C.headerText || C.textPrimary }]}>{partnerName}</Text>
            <Text style={[s.headerStatus, { color: C.textSec }]}>{partnerTyping ? 'typing...' : 'end-to-end encrypted'}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowMenu(true)} style={s.menuBtn}>
          <Text style={[s.menuBtnText, { color: C.textSec }]}>⋮</Text>
        </TouchableOpacity>
      </View>

      {/* ── Messages ── */}
      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.accent} size="large" /></View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={listData}
          keyExtractor={(item) => item.id || item.created_at || Math.random().toString()}
          renderItem={({ item }) => {
            if (item.itemType === 'date') return (
              <View style={s.dateSeparator}>
                <Text style={[s.dateSeparatorText, { color: C.textSec, backgroundColor: C.datePill || C.accentSoft }]}>{item.label}</Text>
              </View>
            );
            if (item.itemType === 'typing') return (
              <View style={[s.typingBubble, { backgroundColor: C.surface, borderColor: C.border }]}>
                <View style={[s.typingDot, { backgroundColor: C.accent }]} />
                <View style={[s.typingDot, { backgroundColor: C.accent, opacity: 0.6 }]} />
                <View style={[s.typingDot, { backgroundColor: C.accent, opacity: 0.3 }]} />
              </View>
            );
            return (
              <MessageBubble
                msg={item} myId={myId} token={accessToken} C={C}
                onLongPress={handleLongPress}
                onImagePress={(m) => router.push({
                  pathname: '/view',
                  params: { id: m.file_id, name: m.file_name || 'File', mime: m.mime_type || 'image/jpeg' },
                })}
              />
            );
          }}
          onEndReachedThreshold={0.1} onEndReached={loadMore}
          ListHeaderComponent={loadingMore ? <ActivityIndicator color={C.accent} style={{ margin: 16 }} /> : null}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Text style={s.emptyEmoji}>💌</Text>
              <Text style={[s.emptyText, { color: C.textSec }]}>Send your first message</Text>
              <Text style={[s.emptySub, { color: C.textSec, opacity: 0.5 }]}>Private & encrypted</Text>
            </View>
          }
          contentContainerStyle={listData.length === 0 ? { flex: 1 } : { padding: 12, paddingBottom: 8 }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Recording bar */}
      {recording && (
        <View style={[s.recordingBar, { backgroundColor: C.surface, borderTopColor: C.border }]}>
          <Text style={{ fontSize: 20 }}>⏺</Text>
          <Text style={[s.recordingText, { color: C.accent }]}>
            Recording... {Math.floor(recordingSecs/60)}:{String(recordingSecs%60).padStart(2,'0')}
          </Text>
          <TouchableOpacity onPress={stopRecording} style={[s.stopRecBtn, { backgroundColor: C.accent }]}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pending audio preview */}
      {pendingAudio && !recording && (
        <View style={[s.pendingAudioBar, { backgroundColor: C.surface, borderTopColor: C.border }]}>
          <Text style={{ fontSize: 20 }}>🎤</Text>
          <Text style={[s.pendingAudioText, { color: C.textPrimary }]}>
            Voice ({Math.floor(pendingAudio.duration/60)}:{String(pendingAudio.duration%60).padStart(2,'0')})
          </Text>
          <TouchableOpacity onPress={() => setPendingAudio(null)} style={{ padding: 6 }}>
            <Text style={{ color: C.textSec, fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={sendAudio} style={[s.sendAudioBtn, { backgroundColor: C.accent }]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>↑ Send</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Reply bar */}
      {replyTo && (
        <View style={[s.replyBar, { backgroundColor: C.surface, borderTopColor: C.border }]}>
          <View style={[s.replyBarAccent, { backgroundColor: C.accent }]} />
          <View style={{ flex: 1 }}>
            <Text style={[s.replyBarLabel, { color: C.accent }]}>Replying</Text>
            <Text style={[s.replyBarText, { color: C.textSec }]} numberOfLines={1}>{replyTo.content || 'Media'}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={{ padding: 6 }}>
            <Text style={[s.replyBarClose, { color: C.textSec }]}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Input bar ── */}
      <View style={[s.inputBar, { backgroundColor: C.surface, borderTopColor: C.border }]}>
        <TouchableOpacity style={[s.iconBtn, { backgroundColor: C.accentSoft }]} onPress={() => setShowAttach(true)}>
          <Text style={[s.iconBtnText, { color: C.textSec }]}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.iconBtn, { backgroundColor: C.accentSoft }]} onPress={() => { setShowStickers(true); setStickerSearch(''); }}>
          <Text style={[s.iconBtnText, { fontSize: 18 }]}>🙂</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.iconBtn, { backgroundColor: C.accentSoft }]} onPress={() => { setShowGif(true); setGifQuery(''); setGifResults([]); }}>
          <Text style={[s.iconBtnText, { fontSize: 11, fontWeight: '800', color: C.accent }]}>GIF</Text>
        </TouchableOpacity>
        <TextInput
          style={[s.input, { backgroundColor: C.bg, color: C.textPrimary, borderColor: C.border }]}
          value={text}
          onChangeText={handleTextChange}
          placeholder="Message..."
          placeholderTextColor={C.textSec + '88'}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[s.sendBtn, { backgroundColor: text.trim() ? C.accent : C.accentSoft }]}
          onPress={() => sendText()}
          disabled={!text.trim() || sending}
        >
          {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[s.sendIcon, { color: text.trim() ? '#fff' : C.textSec }]}>↑</Text>}
        </TouchableOpacity>
        {!text.trim() && !sending && (
          <TouchableOpacity
            style={[s.iconBtn, { backgroundColor: recording ? C.accent : C.accentSoft, marginLeft: 4 }]}
            onPressIn={startRecording}
            onPressOut={stopRecording}
          >
            <Text style={{ fontSize: 16 }}>{recording ? '⏹' : '🎤'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ════════════════════ MODALS ════════════════════ */}

      {/* Menu dropdown */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={s.menuOverlay} onPress={() => setShowMenu(false)}>
          <View style={[s.menuBox, { backgroundColor: C.surface, borderColor: C.border }]}>
            <TouchableOpacity style={s.menuItem} onPress={() => { setShowMenu(false); router.push('/profile'); }}>
              <Text style={[s.menuItemText, { color: C.textPrimary }]}>View Profile</Text>
            </TouchableOpacity>
            <View style={[s.menuDivider, { backgroundColor: C.border }]} />
            <TouchableOpacity style={s.menuItem} onPress={() => { setShowMenu(false); setShowThemes(true); }}>
              <Text style={[s.menuItemText, { color: C.textPrimary }]}>Change Theme</Text>
            </TouchableOpacity>
            <View style={[s.menuDivider, { backgroundColor: C.border }]} />
            <TouchableOpacity style={s.menuItem} onPress={handleLogout}>
              <Text style={[s.menuItemText, { color: C.accent }]}>Logout</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Theme Switcher */}
      <Modal visible={showThemes} transparent animationType="slide" onRequestClose={() => setShowThemes(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setShowThemes(false)}>
          <View style={[s.sheet, { backgroundColor: C.surface }]}>
            <View style={[s.sheetHandle, { backgroundColor: C.border }]} />
            <Text style={[s.sheetTitle, { color: C.textSec }]}>Choose Theme</Text>
            <View style={s.themeGrid}>
              {Object.entries(THEMES).map(([key, t]) => (
                <TouchableOpacity
                  key={key}
                  style={[s.themeCard, { backgroundColor: t.bg, borderColor: t.accent, borderWidth: themeKey === key ? 2.5 : 1 }]}
                  onPress={() => { switchTheme(key); setShowThemes(false); }}
                >
                  <View style={[s.themeAccentDot, { backgroundColor: t.accent }]} />
                  <Text style={{ fontSize: 22 }}>{t.icon}</Text>
                  <Text style={[s.themeCardName, { color: t.textPrimary }]}>{t.name}</Text>
                  {themeKey === key && <Text style={[s.themeCheck, { color: t.accent }]}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Attach sheet */}
      <Modal visible={showAttach} transparent animationType="slide" onRequestClose={() => setShowAttach(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setShowAttach(false)}>
          <View style={[s.sheet, { backgroundColor: C.surface }]}>
            <View style={[s.sheetHandle, { backgroundColor: C.border }]} />
            <Text style={[s.sheetTitle, { color: C.textSec }]}>SEND</Text>
            <View style={s.attachGrid}>
              {[
                { label: 'Camera', key: 'camera', icon: '📷', bg: C.accentSoft },
                { label: 'Gallery', key: 'gallery', icon: '🖼', bg: C.accentSoft },
                { label: 'File', key: 'file', icon: '📄', bg: C.accentSoft },
              ].map(item => (
                <TouchableOpacity key={item.key} style={s.attachCard} onPress={() => pickMedia(item.key)}>
                  <View style={[s.attachIconBox, { backgroundColor: item.bg, borderColor: C.border }]}>
                    <Text style={{ fontSize: 26 }}>{item.icon}</Text>
                  </View>
                  <Text style={[s.attachLabel, { color: C.textSec }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[s.cancelBtn, { backgroundColor: C.bg }]} onPress={() => setShowAttach(false)}>
              <Text style={[s.cancelText, { color: C.textSec }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Preview modal */}
      <Modal visible={!!pendingMedia} transparent={false} animationType="slide">
        <SafeAreaView style={[s.previewRoot, { backgroundColor: C.bg }]}>
          <View style={[s.previewHeader, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
            <TouchableOpacity onPress={() => setPendingMedia(null)}>
              <Text style={[s.previewClose, { color: C.textSec }]}>✕</Text>
            </TouchableOpacity>
            <Text style={[s.previewTitle, { color: C.textPrimary }]}>Preview</Text>
            <TouchableOpacity style={[s.previewSendBtn, { backgroundColor: C.accent }]} onPress={confirmSendMedia}>
              <Text style={s.previewSendText}>Send ↑</Text>
            </TouchableOpacity>
          </View>
          <View style={s.previewContent}>
            {pendingMedia?.isImage ? (
              <Image source={{ uri: pendingMedia?.uri }} style={s.previewImage} contentFit="contain" />
            ) : (
              <View style={s.previewFile}>
                <Text style={{ fontSize: 64 }}>📄</Text>
                <Text style={[s.previewFileName, { color: C.textPrimary }]}>{pendingMedia?.name}</Text>
              </View>
            )}
            {/* View-once selector — only for images/videos */}
            {(pendingMedia?.isImage || pendingMedia?.mimeType?.startsWith('video/')) && (
              <View style={[s.viewModeRow, { backgroundColor: C.surface }]}>
                {[['normal','📤 Normal'],['once','👁 Once'],['twice','👁👁 Twice']].map(([mode, label]) => (
                  <TouchableOpacity
                    key={mode}
                    style={[s.viewModeBtn, { backgroundColor: viewMode === mode ? C.accent : C.bg, borderColor: C.border }]}
                    onPress={() => setViewMode(mode)}
                  >
                    <Text style={{ fontSize: 12, color: viewMode === mode ? '#fff' : C.textSec, fontWeight: '600' }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* GIF Picker */}
      <Modal visible={showGif} transparent={false} animationType="slide">
        <SafeAreaView style={[s.gifRoot, { backgroundColor: C.bg }]}>
          <View style={[s.gifHeader, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
            <TouchableOpacity onPress={() => setShowGif(false)}>
              <Text style={[s.previewClose, { color: C.textSec }]}>✕</Text>
            </TouchableOpacity>
            <TextInput
              style={[s.gifInput, { backgroundColor: C.bg, color: C.textPrimary, borderColor: C.border }]}
              value={gifQuery}
              onChangeText={setGifQuery}
              placeholder="Search GIFs..."
              placeholderTextColor={C.textSec + '88'}
              returnKeyType="search"
              onSubmitEditing={() => searchGifs(gifQuery)}
              autoFocus
            />
            <TouchableOpacity onPress={() => searchGifs(gifQuery)} style={[s.gifSearchBtn, { backgroundColor: C.accent }]}>
              <Text style={s.gifSearchBtnText}>Go</Text>
            </TouchableOpacity>
          </View>
          {gifLoading ? (
            <View style={s.center}><ActivityIndicator color={C.accent} size="large" /></View>
          ) : (
            <FlatList
              data={gifResults}
              keyExtractor={item => item.id}
              numColumns={2}
              contentContainerStyle={{ padding: 6, gap: 6 }}
              columnWrapperStyle={{ gap: 6 }}
              renderItem={({ item }) => {
                // Tenor v1 response: item.media[0].gif.url or item.media[0].tinygif.url
                const media = item.media?.[0];
                const gifUrl = media?.gif?.url || media?.mediumgif?.url || media?.tinygif?.url;
                const previewUrl = media?.tinygif?.url || media?.gif?.url;
                if (!gifUrl) return null;
                return (
                  <TouchableOpacity onPress={() => sendGif(gifUrl)} style={s.gifItem}>
                    <Image source={{ uri: previewUrl || gifUrl }} style={s.gifImage} contentFit="cover" />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={s.emptyWrap}>
                  <Text style={[s.emptySub, { color: C.textSec }]}>Search above to find GIFs ✨</Text>
                </View>
              }
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* ── Sticker / Emoji Panel ── */}
      <Modal visible={showStickers} transparent animationType="slide" onRequestClose={() => setShowStickers(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setShowStickers(false)}>
          <View style={[s.sheet, { backgroundColor: C.surface, paddingBottom: 12, maxHeight: '70%' }]}>
            <View style={[s.sheetHandle, { backgroundColor: C.border }]} />

            {/* Search bar */}
            <View style={[s.stickerSearchBar, { backgroundColor: C.bg, borderColor: C.border }]}>
              <Text style={{ fontSize: 14, marginRight: 6 }}>🔍</Text>
              <TextInput
                style={[s.stickerSearchInput, { color: C.textPrimary }]}
                value={stickerSearch}
                onChangeText={setStickerSearch}
                placeholder="Search stickers & emoji..."
                placeholderTextColor={C.textSec + '88'}
              />
              {stickerSearch.length > 0 && (
                <TouchableOpacity onPress={() => setStickerSearch('')}>
                  <Text style={{ color: C.textSec, fontSize: 16, paddingLeft: 6 }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Category tabs — hidden during search */}
            {!stickerSearch && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.packTabs} contentContainerStyle={{ paddingHorizontal: 4, gap: 6 }}>
                {Object.keys(EMOJI_CATEGORIES).map(pack => (
                  <TouchableOpacity
                    key={pack}
                    onPress={() => setStickerPack(pack)}
                    style={[s.packTab, { backgroundColor: stickerPack === pack ? C.accent : C.bg, borderColor: C.border }]}
                  >
                    <Text style={[s.packTabText, { color: stickerPack === pack ? '#fff' : C.textSec }]}>{pack}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Emoji grid */}
            <ScrollView>
              <View style={s.stickerGrid}>
                {stickerEmojis.map((emoji, i) => (
                  <TouchableOpacity key={i} onPress={() => sendSticker(emoji)} style={s.stickerBtn}>
                    <Text style={s.stickerEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
                {stickerEmojis.length === 0 && stickerSearch.length > 0 && (
                  <Text style={[s.emptySub, { color: C.textSec, padding: 20 }]}>No results for "{stickerSearch}"</Text>
                )}
              </View>
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* ── WhatsApp-style Long Press Overlay ── */}
      <Modal visible={showActions} transparent animationType="fade" onRequestClose={() => setShowActions(false)}>
        <Pressable style={s.waOverlay} onPress={() => setShowActions(false)}>
          {/* Selected message preview */}
          {selectedMsg && (
            <View style={[
              s.waMsgPreview,
              selectedMsg.sender_id === myId ? s.waMsgRight : s.waMsgLeft,
              { backgroundColor: selectedMsg.sender_id === myId ? C.bubbleSent : C.bubbleReceived,
                borderColor: C.border },
            ]}>
              {selectedMsg.reply_to && (
                <View style={[s.waQuoteBar, { borderLeftColor: selectedMsg.sender_id === myId ? 'rgba(255,255,255,0.6)' : C.accent, backgroundColor: 'rgba(0,0,0,0.08)' }]}>
                  <Text style={{ color: selectedMsg.sender_id === myId ? 'rgba(255,255,255,0.7)' : C.textSec, fontSize: 11 }} numberOfLines={1}>
                    {selectedMsg.reply_to.content || 'Media'}
                  </Text>
                </View>
              )}
              <Text style={{ color: selectedMsg.sender_id === myId ? '#fff' : C.textPrimary, fontSize: 14, lineHeight: 20 }} numberOfLines={3}>
                {selectedMsg.content ||
                  (selectedMsg.type === 'image' ? '📷 Photo' :
                   selectedMsg.type === 'video' ? '🎬 Video' :
                   selectedMsg.type === 'audio' ? '🎵 Audio' : '📄 File')}
              </Text>
            </View>
          )}

          {/* Emoji react bar */}
          <View style={[s.waEmojiBar, { backgroundColor: C.surface }]}>
            {REACT_EMOJIS.map(e => (
              <TouchableOpacity key={e} onPress={() => doReaction(e)} style={s.waEmojiBtn}>
                <Text style={s.waEmojiText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Action rows */}
          <View style={[s.waActionsBox, { backgroundColor: C.surface }]}>
            <TouchableOpacity style={s.waActionRow} onPress={doReply}>
              <Text style={s.waActionIcon}>↩</Text>
              <Text style={[s.waActionText, { color: C.textPrimary }]}>Reply</Text>
            </TouchableOpacity>
            {selectedMsg?.sender_id === myId && (
              <TouchableOpacity style={[s.waActionRow, s.waActionRowTop, { borderTopColor: C.border }]} onPress={doDelete}>
                <Text style={s.waActionIcon}>🗑</Text>
                <Text style={[s.waActionText, { color: C.accent }]}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingTop: 50, paddingBottom: 12,
    borderBottomWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 4,
  },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerAvatarImg: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, marginRight: 10 },
  headerAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  headerAvatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  headerInfo: { flex: 1 },
  headerName: { fontWeight: '700', fontSize: 16 },
  headerStatus: { fontSize: 11, marginTop: 1 },
  menuBtn: { padding: 8 },
  menuBtnText: { fontSize: 22, fontWeight: '700' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '600' },
  emptySub: { fontSize: 12, marginTop: 4 },

  dateSeparator: { alignItems: 'center', marginVertical: 14 },
  dateSeparatorText: { fontSize: 11, paddingHorizontal: 12, paddingVertical: 3, borderRadius: 12 },

  typingBubble: {
    flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center',
    borderRadius: 18, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 14, marginLeft: 12, marginBottom: 4, gap: 5,
  },
  typingDot: { width: 7, height: 7, borderRadius: 3.5 },

  replyBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    borderTopWidth: 1,
  },
  replyBarAccent: { width: 3, height: '100%', borderRadius: 2, marginRight: 8 },
  replyBarLabel: { fontSize: 11, fontWeight: '700', marginBottom: 1 },
  replyBarText: { fontSize: 13 },
  replyBarClose: { fontSize: 16 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 8, paddingVertical: 8, paddingBottom: 24,
    borderTopWidth: 1, gap: 6,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  iconBtnText: { fontSize: 18, lineHeight: 22 },
  input: {
    flex: 1, borderRadius: 22,
    paddingHorizontal: 14, paddingVertical: 9,
    fontSize: 15, maxHeight: 120, borderWidth: 1,
  },
  sendBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  sendIcon: { fontSize: 16, fontWeight: '700' },

  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)' },
  menuBox: {
    position: 'absolute', top: 90, right: 14,
    borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
    borderWidth: 1, minWidth: 160,
  },
  menuItem: { paddingVertical: 14, paddingHorizontal: 20 },
  menuItemText: { fontSize: 15, fontWeight: '500' },
  menuDivider: { height: StyleSheet.hairlineWidth },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 34 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textAlign: 'center', marginBottom: 16, textTransform: 'uppercase' },
  cancelBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 4 },
  cancelText: { fontSize: 15, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth },

  attachGrid: { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 16 },
  attachCard: { alignItems: 'center', gap: 8 },
  attachIconBox: { width: 64, height: 64, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  attachLabel: { fontSize: 12 },

  previewRoot: { flex: 1 },
  previewHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  previewClose: { fontSize: 22, paddingHorizontal: 4 },
  previewTitle: { fontWeight: '700', fontSize: 16 },
  previewSendBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  previewSendText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  previewContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  previewImage: { width: SCREEN_W, height: SCREEN_W },
  previewFile: { alignItems: 'center', padding: 40 },
  previewFileName: { fontSize: 15, fontWeight: '600', textAlign: 'center', marginTop: 12 },

  gifRoot: { flex: 1 },
  gifHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, gap: 8,
  },
  gifInput: { flex: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, fontSize: 15, borderWidth: 1 },
  gifSearchBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  gifSearchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  gifItem: { width: GIF_COL, height: GIF_COL * 0.75, borderRadius: 12, overflow: 'hidden' },
  gifImage: { width: '100%', height: '100%' },

  stickerSearchBar: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 10, borderWidth: 1,
  },
  stickerSearchInput: { flex: 1, fontSize: 14, paddingVertical: 2 },
  packTabs: { marginBottom: 10 },
  packTab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  packTabText: { fontSize: 12, fontWeight: '600' },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 2 },
  stickerBtn: { padding: 6 },
  stickerEmoji: { fontSize: 30 },

  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', paddingVertical: 8 },
  themeCard: {
    width: (SCREEN_W - 80) / 2, borderRadius: 16, padding: 16,
    alignItems: 'center', gap: 6, position: 'relative',
  },
  themeAccentDot: { width: 8, height: 8, borderRadius: 4, position: 'absolute', top: 10, right: 10 },
  themeCardName: { fontSize: 13, fontWeight: '600' },
  themeCheck: { fontSize: 16, fontWeight: '800' },

  waOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 20, gap: 12,
  },
  waMsgPreview: {
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10,
    maxWidth: BUBBLE_MAX + 20, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8,
  },
  waMsgRight: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  waMsgLeft: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  waQuoteBar: {
    borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 2,
    marginBottom: 6, borderRadius: 4,
  },
  waEmojiBar: {
    flexDirection: 'row', borderRadius: 36,
    paddingHorizontal: 6, paddingVertical: 8, gap: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 6,
  },
  waEmojiBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 20 },
  waEmojiText: { fontSize: 26 },
  waActionsBox: {
    borderRadius: 16, overflow: 'hidden', width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 5,
  },
  waActionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, gap: 14 },
  waActionRowTop: { borderTopWidth: StyleSheet.hairlineWidth },
  waActionIcon: { fontSize: 18 },
  waActionText: { fontSize: 16, fontWeight: '500' },
  actionBtn: { paddingVertical: 14 },
  actionText: { fontSize: 16, fontWeight: '500' },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8 },
  emojiBtn: { padding: 8 },
  emojiText: { fontSize: 30 },

  // View-once
  viewOnceBubble: { borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14, alignItems: 'center', gap: 6 },
  viewOnceLabel: { fontSize: 13, fontWeight: '600' },
  viewOnceOpened: { paddingHorizontal: 10, paddingVertical: 6 },
  viewOnceText: { fontSize: 12, fontStyle: 'italic' },

  // Recording / pending audio
  recordingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1,
  },
  recordingText: { flex: 1, fontSize: 14, fontWeight: '600' },
  stopRecBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  pendingAudioBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1,
  },
  pendingAudioText: { flex: 1, fontSize: 14 },
  sendAudioBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },

  // View-once selector in preview modal
  viewModeRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 16, marginTop: 16,
  },
  viewModeBtn: { flex: 1, paddingVertical: 10, borderRadius: 20, alignItems: 'center', borderWidth: 1 },
});
