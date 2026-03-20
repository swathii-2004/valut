import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  Dimensions, Modal, Pressable, ScrollView, SafeAreaView,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';

const BASE_URL = 'https://couplvault.online';
const GIPHY_KEY = 'dc6zaTOxFJmzC'; // Giphy public beta key
const { width: SCREEN_W } = Dimensions.get('window');
const BUBBLE_MAX = SCREEN_W * 0.72;
const GIF_COL = (SCREEN_W - 24) / 2;

// ── Pink Theme ────────────────────────────────────────────
const C = {
  bg: '#FFF0F6',
  surface: '#FFFFFF',
  accent: '#E4387A',
  accentSoft: '#FFDAEB',
  bubbleSent: '#E4387A',
  bubbleReceived: '#FFFFFF',
  textPrimary: '#1a0a14',
  textSec: '#9a6080',
  border: '#F5C6DE',
  inputBg: '#FFFFFF',
  time: '#C8A0B4',
  timeSent: 'rgba(255,255,255,0.7)',
  header: '#FFFFFF',
  headerText: '#1a0a14',
};

// ── Sticker packs ─────────────────────────────────────────
const STICKER_PACKS = {
  '🥰 Love':    ['❤️','💕','💗','💓','💞','💝','💘','💖','🥰','😘','💋','🫶','💑','💏','❣️','💟'],
  '😊 Smileys': ['😀','😂','🥰','😍','😎','🥺','😭','😤','😅','🤣','😊','😌','🤗','😜','😝','🙈'],
  '🐶 Animals': ['🐶','🐱','🐰','🐹','🐻','🐼','🦊','🐯','🦁','🐮','🐸','🐧','🦋','🐝','🦄','🐨'],
  '🌸 Nature':  ['🌸','🌺','🌻','🌹','🌷','🌈','⭐','🌙','☀️','🌊','🔥','💫','✨','🍀','🌿','🦚'],
  '🎉 Fun':     ['🎉','🎊','🎈','🎁','🎮','🎵','🎬','🎨','📚','💻','🌮','🍕','🍩','🍦','🍓','🧁'],
};

// ── Helpers ──
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
function MessageBubble({ msg, myId, token, onLongPress, onImagePress }) {
  const isMine = msg.sender_id === myId;
  const reactions = msg.reactions?.filter(r => r.emoji) || [];

  return (
    <View style={[s.bubbleWrap, isMine ? s.bubbleWrapRight : s.bubbleWrapLeft]}>
      {msg.reply_to && (
        <View style={[s.replyQuote, isMine ? s.replyQuoteRight : s.replyQuoteLeft]}>
          <Text style={s.replyQuoteText} numberOfLines={1}>{msg.reply_to.content || 'Media'}</Text>
        </View>
      )}
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => onLongPress?.(msg)}
        style={[s.bubble, isMine ? s.bubbleSent : s.bubbleReceived]}
      >
        {msg.type === 'text' && !msg.is_deleted && (
          <Text style={[s.bubbleText, isMine && s.bubbleTextSent]}>{msg.content}</Text>
        )}
        {msg.is_deleted && <Text style={s.deletedText}>Message deleted</Text>}

        {msg.type === 'image' && msg.file_id && (
          <TouchableOpacity onPress={() => onImagePress?.(msg)}>
            <Image
              source={{ uri: `${BASE_URL}/api/files/${msg.file_id}/view`, headers: { Authorization: `Bearer ${token}` } }}
              style={s.imageThumb}
              contentFit="cover"
            />
          </TouchableOpacity>
        )}
        {msg.type === 'video' && (
          <TouchableOpacity style={s.mediaRow} onPress={() => onImagePress?.(msg)}>
            <View style={s.mediaIconBox}><Text style={s.mediaIconText}>▶</Text></View>
            <Text style={[s.bubbleText, isMine && s.bubbleTextSent]} numberOfLines={1}>{msg.file_name || 'Video'}</Text>
          </TouchableOpacity>
        )}
        {msg.type === 'audio' && (
          <TouchableOpacity style={s.mediaRow} onPress={() => onImagePress?.(msg)}>
            <View style={s.mediaIconBox}><Text style={s.mediaIconText}>♪</Text></View>
            <Text style={[s.bubbleText, isMine && s.bubbleTextSent]} numberOfLines={1}>
              {msg.file_name || 'Audio'}{msg.file_size ? `  ${formatBytes(msg.file_size)}` : ''}
            </Text>
          </TouchableOpacity>
        )}
        {msg.type === 'file' && (
          <View style={s.mediaRow}>
            <View style={s.mediaIconBox}><Text style={s.mediaIconText}>↓</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.bubbleText, isMine && s.bubbleTextSent]} numberOfLines={1}>{msg.file_name || 'File'}</Text>
              {msg.file_size ? <Text style={s.fileSizeText}>{formatBytes(msg.file_size)}</Text> : null}
            </View>
          </View>
        )}
        <View style={s.bubbleMeta}>
          <Text style={[s.timeText, isMine && s.timeTextSent]}>{formatTime(msg.created_at)}</Text>
          {isMine && <Text style={[s.readTick, msg.is_read && s.readTickDone]}>{msg.is_read ? ' ✓✓' : ' ✓'}</Text>}
        </View>
      </TouchableOpacity>
      {reactions.length > 0 && (
        <View style={[s.reactionsRow, isMine ? s.reactRight : s.reactLeft]}>
          {reactions.map((r, i) => <Text key={i} style={s.reactionEmoji}>{r.emoji}</Text>)}
        </View>
      )}
    </View>
  );
}

const EMOJI_REACT = ['❤️', '😂', '😮', '😢', '😡', '👍', '🔥', '💜'];

// ══════════════════════════════════════════════════════════
export default function ChatScreen() {
  const { accessToken, logout } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [myId, setMyId] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [partnerProfile, setPartnerProfile] = useState(null);
  const [partnerId, setPartnerId] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [showActions, setShowActions] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [stickerPack, setStickerPack] = useState('🥰 Love');
  const [showMenu, setShowMenu] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingMedia, setPendingMedia] = useState(null);
  const [showGif, setShowGif] = useState(false);
  const [gifQuery, setGifQuery] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);

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

  // Load profiles
  useEffect(() => {
    if (!myId) return;
    apiClient.get('/api/profile/me').then(r => setMyProfile(r.data)).catch(() => {});
    apiClient.get('/api/profile/partner').then(r => {
      setPartnerProfile(r.data);
    }).catch(() => {});
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
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaType ? [ImagePicker.MediaType.Images, ImagePicker.MediaType.Videos] : ImagePicker.MediaTypeOptions.All, quality: 1 });
        if (res.canceled || !res.assets?.length) return;
        const a = res.assets[0];
        file = { uri: a.uri, name: a.fileName || `media_${Date.now()}`, mimeType: a.mimeType || 'image/jpeg', isImage: a.mimeType?.startsWith('image/') };
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
    try {
      const formData = new FormData();
      formData.append('file', { uri: file.uri, name: file.name, type: file.mimeType });
      const res = await apiClient.post('/api/messages/media', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const newMsg = res.data.message;
      if (newMsg) setMessages(prev => prev.find(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
    } catch { Alert.alert('Error', 'Failed to send file'); }
  };

  const searchGifs = async (q) => {
    if (!q.trim()) return;
    setGifLoading(true);
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=20&rating=g`);
      const data = await res.json();
      setGifResults(data.data || []);
    } catch { Alert.alert('Error', 'GIF search failed'); }
    finally { setGifLoading(false); }
  };

  const sendGif = async (gifUrl, previewUrl) => {
    setShowGif(false);
    try {
      const name = `gif_${Date.now()}.gif`;
      const dest = FileSystem.cacheDirectory + name;
      const result = await FileSystem.downloadAsync(gifUrl, dest);
      const formData = new FormData();
      formData.append('file', { uri: result.uri, name, type: 'image/gif' });
      const res = await apiClient.post('/api/messages/media', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const newMsg = res.data.message;
      if (newMsg) setMessages(prev => prev.find(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
    } catch (e) { Alert.alert('Error', 'Failed to send GIF: ' + e.message); }
  };

  const handleLongPress = (msg) => { setSelectedMsg(msg); setShowActions(true); };
  const doReaction = async (emoji) => {
    setShowEmoji(false); setShowActions(false);
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

  // Build list data
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
  const partnerInitial = partnerName[0]?.toUpperCase() || 'P';

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.headerAvatarWrap} onPress={() => router.push('/profile')}>
          {partnerAvatarUrl ? (
            <Image source={{ uri: partnerAvatarUrl }} style={s.headerAvatarImg} contentFit="cover" />
          ) : (
            <View style={s.headerAvatarPlaceholder}>
              <Text style={s.headerAvatarText}>{partnerInitial}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={s.headerInfo} onPress={() => router.push('/profile')}>
          <Text style={s.headerName}>{partnerName}</Text>
          <Text style={s.headerStatus}>{partnerTyping ? 'typing...' : 'end-to-end encrypted'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowMenu(true)} style={s.menuBtn}>
          <Text style={s.menuBtnText}>⋮</Text>
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
              <View style={s.dateSeparator}><Text style={s.dateSeparatorText}>{item.label}</Text></View>
            );
            if (item.itemType === 'typing') return (
              <View style={s.typingBubble}>
                <View style={s.typingDot} />
                <View style={[s.typingDot, { opacity: 0.6 }]} />
                <View style={[s.typingDot, { opacity: 0.3 }]} />
              </View>
            );
            return (
              <MessageBubble
                msg={item} myId={myId} token={accessToken}
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
              <Text style={s.emptyText}>Send your first message</Text>
              <Text style={s.emptySub}>Encrypted, private, just for two</Text>
            </View>
          }
          contentContainerStyle={listData.length === 0 ? { flex: 1 } : { padding: 12, paddingBottom: 8 }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Reply bar */}
      {replyTo && (
        <View style={s.replyBar}>
          <View style={s.replyBarAccent} />
          <View style={{ flex: 1 }}>
            <Text style={s.replyBarLabel}>Replying</Text>
            <Text style={s.replyBarText} numberOfLines={1}>{replyTo.content || 'Media'}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={{ padding: 6 }}>
            <Text style={s.replyBarClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Input bar ── */}
      <View style={s.inputBar}>
        <TouchableOpacity style={s.iconBtn} onPress={() => setShowAttach(true)}>
          <Text style={s.iconBtnText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.iconBtn} onPress={() => setShowStickers(true)}>
          <Text style={[s.iconBtnText, { fontSize: 18 }]}>🙂</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.iconBtn} onPress={() => { setShowGif(true); setGifQuery(''); setGifResults([]); }}>
          <Text style={[s.iconBtnText, { fontSize: 11, fontWeight: '800', color: C.accent }]}>GIF</Text>
        </TouchableOpacity>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={handleTextChange}
          placeholder="Message..."
          placeholderTextColor="#C0A0B0"
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[s.sendBtn, !text.trim() && s.sendBtnOff]}
          onPress={() => sendText()}
          disabled={!text.trim() || sending}
        >
          {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.sendIcon}>↑</Text>}
        </TouchableOpacity>
      </View>

      {/* ═══════════════ MODALS ═══════════════ */}

      {/* Menu */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={s.menuOverlay} onPress={() => setShowMenu(false)}>
          <View style={s.menuBox}>
            <TouchableOpacity style={s.menuItem} onPress={() => { setShowMenu(false); router.push('/profile'); }}>
              <Text style={s.menuItemText}>View Profile</Text>
            </TouchableOpacity>
            <View style={s.menuDivider} />
            <TouchableOpacity style={s.menuItem} onPress={handleLogout}>
              <Text style={[s.menuItemText, { color: '#E4387A' }]}>Logout</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Attach sheet */}
      <Modal visible={showAttach} transparent animationType="slide" onRequestClose={() => setShowAttach(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setShowAttach(false)}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Send</Text>
            <View style={s.attachGrid}>
              {[
                { label: 'Camera', key: 'camera', icon: '📷', bg: '#FFF0F6' },
                { label: 'Gallery', key: 'gallery', icon: '🖼', bg: '#F0F6FF' },
                { label: 'File', key: 'file', icon: '📄', bg: '#F0FFF4' },
              ].map(item => (
                <TouchableOpacity key={item.key} style={s.attachCard} onPress={() => pickMedia(item.key)}>
                  <View style={[s.attachIconBox, { backgroundColor: item.bg }]}>
                    <Text style={{ fontSize: 26 }}>{item.icon}</Text>
                  </View>
                  <Text style={s.attachLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowAttach(false)}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Preview modal */}
      <Modal visible={!!pendingMedia} transparent={false} animationType="slide">
        <SafeAreaView style={s.previewRoot}>
          <View style={s.previewHeader}>
            <TouchableOpacity onPress={() => setPendingMedia(null)}><Text style={s.previewClose}>✕</Text></TouchableOpacity>
            <Text style={s.previewTitle}>Preview</Text>
            <TouchableOpacity style={s.previewSendBtn} onPress={confirmSendMedia}>
              <Text style={s.previewSendText}>Send ↑</Text>
            </TouchableOpacity>
          </View>
          <View style={s.previewContent}>
            {pendingMedia?.isImage ? (
              <Image source={{ uri: pendingMedia?.uri }} style={s.previewImage} contentFit="contain" />
            ) : (
              <View style={s.previewFile}>
                <Text style={{ fontSize: 64 }}>📄</Text>
                <Text style={s.previewFileName}>{pendingMedia?.name}</Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* GIF Picker */}
      <Modal visible={showGif} transparent={false} animationType="slide">
        <SafeAreaView style={s.gifRoot}>
          <View style={s.gifHeader}>
            <TouchableOpacity onPress={() => setShowGif(false)}>
              <Text style={s.previewClose}>✕</Text>
            </TouchableOpacity>
            <TextInput
              style={s.gifInput}
              value={gifQuery}
              onChangeText={setGifQuery}
              placeholder="Search GIFs..."
              placeholderTextColor="#C0A0B0"
              returnKeyType="search"
              onSubmitEditing={() => searchGifs(gifQuery)}
              autoFocus
            />
            <TouchableOpacity onPress={() => searchGifs(gifQuery)} style={s.gifSearchBtn}>
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
                const gifUrl = item.images?.original?.url;
                const previewUrl = item.images?.fixed_width?.url || gifUrl;
                if (!gifUrl) return null;
                return (
                  <TouchableOpacity onPress={() => sendGif(gifUrl, previewUrl)} style={s.gifItem}>
                    <Image source={{ uri: previewUrl }} style={s.gifImage} contentFit="cover" />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<View style={s.emptyWrap}><Text style={s.emptySub}>Search above to find GIFs</Text></View>}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Sticker Panel */}
      <Modal visible={showStickers} transparent animationType="slide" onRequestClose={() => setShowStickers(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setShowStickers(false)}>
          <View style={[s.sheet, { paddingBottom: 12 }]}>
            <View style={s.sheetHandle} />
            {/* Pack tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.packTabs} contentContainerStyle={{ paddingHorizontal: 4, gap: 8 }}>
              {Object.keys(STICKER_PACKS).map(pack => (
                <TouchableOpacity
                  key={pack}
                  onPress={() => setStickerPack(pack)}
                  style={[s.packTab, stickerPack === pack && s.packTabActive]}
                >
                  <Text style={[s.packTabText, stickerPack === pack && s.packTabTextActive]}>{pack}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {/* Stickers grid */}
            <View style={s.stickerGrid}>
              {(STICKER_PACKS[stickerPack] || []).map((emoji, i) => (
                <TouchableOpacity key={i} onPress={() => sendSticker(emoji)} style={s.stickerBtn}>
                  <Text style={s.stickerEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Action Sheet */}
      <Modal visible={showActions} transparent animationType="fade" onRequestClose={() => setShowActions(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setShowActions(false)}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <TouchableOpacity style={s.actionBtn} onPress={() => { setShowActions(false); setShowEmoji(true); }}>
              <Text style={s.actionText}>React</Text>
            </TouchableOpacity>
            <View style={s.divider} />
            <TouchableOpacity style={s.actionBtn} onPress={doReply}>
              <Text style={s.actionText}>Reply</Text>
            </TouchableOpacity>
            {selectedMsg?.sender_id === myId && (
              <>
                <View style={s.divider} />
                <TouchableOpacity style={s.actionBtn} onPress={doDelete}>
                  <Text style={[s.actionText, { color: '#E4387A' }]}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={[s.cancelBtn, { marginTop: 12 }]} onPress={() => setShowActions(false)}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Emoji react */}
      <Modal visible={showEmoji} transparent animationType="fade" onRequestClose={() => setShowEmoji(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setShowEmoji(false)}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <View style={s.emojiRow}>
              {EMOJI_REACT.map(e => (
                <TouchableOpacity key={e} onPress={() => doReaction(e)} style={s.emojiBtn}>
                  <Text style={s.emojiText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingTop: 50, paddingBottom: 12,
    backgroundColor: C.header,
    borderBottomWidth: 1, borderBottomColor: C.border,
    shadowColor: '#E4387A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 4,
  },
  headerAvatarWrap: { marginRight: 10 },
  headerAvatarImg: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: C.accentSoft },
  headerAvatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: C.accentSoft,
  },
  headerAvatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  headerInfo: { flex: 1 },
  headerName: { color: C.headerText, fontWeight: '700', fontSize: 16 },
  headerStatus: { color: C.textSec, fontSize: 11, marginTop: 1 },
  menuBtn: { padding: 8 },
  menuBtnText: { color: C.textSec, fontSize: 22, fontWeight: '700' },

  // Messages
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: C.textSec, fontSize: 18, fontWeight: '600' },
  emptySub: { color: '#D4A0BC', fontSize: 12, marginTop: 4 },
  dateSeparator: { alignItems: 'center', marginVertical: 14 },
  dateSeparatorText: {
    color: C.textSec, fontSize: 11,
    backgroundColor: '#FFE8F3', paddingHorizontal: 12, paddingVertical: 3, borderRadius: 12,
  },
  typingBubble: {
    flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 16, paddingVertical: 14, marginLeft: 12, marginBottom: 4, gap: 5,
  },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.accent },

  // Bubbles
  bubbleWrap: { marginBottom: 4 },
  bubbleWrapRight: { alignSelf: 'flex-end', alignItems: 'flex-end', maxWidth: BUBBLE_MAX },
  bubbleWrapLeft: { alignSelf: 'flex-start', alignItems: 'flex-start', maxWidth: BUBBLE_MAX },
  bubble: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  bubbleSent: { backgroundColor: C.bubbleSent, borderBottomRightRadius: 5 },
  bubbleReceived: { backgroundColor: C.bubbleReceived, borderBottomLeftRadius: 5, borderWidth: 1, borderColor: C.border },
  bubbleText: { color: C.textPrimary, fontSize: 15, lineHeight: 22 },
  bubbleTextSent: { color: '#fff' },
  deletedText: { color: '#D4A0BC', fontStyle: 'italic', fontSize: 13 },
  imageThumb: { width: 200, height: 160, borderRadius: 12 },
  mediaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mediaIconBox: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center' },
  mediaIconText: { color: '#fff', fontSize: 14 },
  fileSizeText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, alignSelf: 'flex-end' },
  timeText: { color: C.time, fontSize: 10 },
  timeTextSent: { color: C.timeSent },
  readTick: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  readTickDone: { color: '#FFD0E8' },
  reactionsRow: {
    flexDirection: 'row', gap: 2, marginTop: 3,
    backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: C.border,
  },
  reactRight: { alignSelf: 'flex-end' },
  reactLeft: { alignSelf: 'flex-start' },
  reactionEmoji: { fontSize: 16 },
  replyQuote: { paddingHorizontal: 10, paddingVertical: 5, marginBottom: 4, borderRadius: 10 },
  replyQuoteRight: { backgroundColor: 'rgba(255,255,255,0.2)', borderLeftWidth: 3, borderLeftColor: '#fff' },
  replyQuoteLeft: { backgroundColor: C.accentSoft, borderLeftWidth: 3, borderLeftColor: C.accent },
  replyQuoteText: { color: C.textSec, fontSize: 12 },

  // Reply bar
  replyBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, paddingHorizontal: 14, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  replyBarAccent: { width: 3, height: '100%', backgroundColor: C.accent, borderRadius: 2, marginRight: 8 },
  replyBarLabel: { color: C.accent, fontSize: 11, fontWeight: '700', marginBottom: 1 },
  replyBarText: { color: C.textSec, fontSize: 13 },
  replyBarClose: { color: '#C0A0B0', fontSize: 16 },

  // Input
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: C.surface, paddingHorizontal: 8, paddingVertical: 8, paddingBottom: 24,
    borderTopWidth: 1, borderTopColor: C.border, gap: 6,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.accentSoft, justifyContent: 'center', alignItems: 'center',
  },
  iconBtnText: { color: C.textSec, fontSize: 18, lineHeight: 22 },
  input: {
    flex: 1, backgroundColor: C.bg, borderRadius: 22,
    paddingHorizontal: 14, paddingVertical: 9,
    color: C.textPrimary, fontSize: 15, maxHeight: 120,
    borderWidth: 1, borderColor: C.border,
  },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center' },
  sendBtnOff: { backgroundColor: C.accentSoft },
  sendIcon: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Menu dropdown
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)' },
  menuBox: {
    position: 'absolute', top: 90, right: 14,
    backgroundColor: C.surface, borderRadius: 14, overflow: 'hidden',
    shadowColor: '#E4387A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
    borderWidth: 1, borderColor: C.border, minWidth: 150,
  },
  menuItem: { paddingVertical: 14, paddingHorizontal: 20 },
  menuItemText: { color: C.textPrimary, fontSize: 15, fontWeight: '500' },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border },

  // Modals shared
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 20, paddingBottom: 34,
  },
  sheetHandle: { width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { color: C.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textAlign: 'center', marginBottom: 20, textTransform: 'uppercase' },
  cancelBtn: { paddingVertical: 14, borderRadius: 14, backgroundColor: C.bg, alignItems: 'center', marginTop: 4 },
  cancelText: { color: C.textSec, fontSize: 15, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border },

  // Attach
  attachGrid: { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 16 },
  attachCard: { alignItems: 'center', gap: 8 },
  attachIconBox: { width: 64, height: 64, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  attachLabel: { color: C.textSec, fontSize: 12 },

  // Preview
  previewRoot: { flex: 1, backgroundColor: C.bg },
  previewHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  previewClose: { color: C.textSec, fontSize: 22, paddingHorizontal: 4 },
  previewTitle: { color: C.textPrimary, fontWeight: '700', fontSize: 16 },
  previewSendBtn: { backgroundColor: C.accent, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  previewSendText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  previewContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  previewImage: { width: SCREEN_W, height: SCREEN_W },
  previewFile: { alignItems: 'center', padding: 40 },
  previewFileName: { color: C.textPrimary, fontSize: 15, fontWeight: '600', textAlign: 'center', marginTop: 12 },

  // GIF
  gifRoot: { flex: 1, backgroundColor: C.bg },
  gifHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, gap: 8,
  },
  gifInput: {
    flex: 1, backgroundColor: C.bg, borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 9,
    color: C.textPrimary, fontSize: 15, borderWidth: 1, borderColor: C.border,
  },
  gifSearchBtn: { backgroundColor: C.accent, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  gifSearchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  gifItem: { width: GIF_COL, height: GIF_COL * 0.75, borderRadius: 12, overflow: 'hidden', backgroundColor: C.border },
  gifImage: { width: '100%', height: '100%' },

  // Stickers
  packTabs: { marginBottom: 12 },
  packTab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
  packTabActive: { backgroundColor: C.accent, borderColor: C.accent },
  packTabText: { color: C.textSec, fontSize: 12, fontWeight: '600' },
  packTabTextActive: { color: '#fff' },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 },
  stickerBtn: { padding: 8 },
  stickerEmoji: { fontSize: 32 },

  // Action / Emoji
  actionBtn: { paddingVertical: 14 },
  actionText: { color: C.textPrimary, fontSize: 16, fontWeight: '500' },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8 },
  emojiBtn: { padding: 8 },
  emojiText: { fontSize: 30 },
});
