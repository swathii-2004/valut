import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import { Image } from 'expo-image';
import * as legacyFS from 'expo-file-system/legacy';

export default function StarredScreen() {
    const { theme: C } = useTheme();
    const { accessToken } = useAuth();
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStarred();
    }, [accessToken]);

    const loadStarred = async () => {
        try {
            const res = await apiClient.get('/api/messages/starred');
            setMessages(res.data.messages);
        } catch (e) {
            console.log('Failed to load starred messages:', e.message);
        } finally {
            setLoading(false);
        }
    };

    const unstar = async (id) => {
        try {
            setMessages(prev => prev.filter(m => m.id !== id));
            await apiClient.put(`/api/messages/${id}/unstar`);
        } catch (e) {
            console.log('Failed to unstar');
            loadStarred();
        }
    };

    const formatTime = (d) => {
        const dt = new Date(d);
        return dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const mediaUrl = (fileId) => `https://couplvault.online/api/files/${fileId}?token=${accessToken}`;

    const renderItem = ({ item }) => {
        return (
            <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
                {/* Star header */}
                <View style={s.cardHeader}>
                    <Text style={[s.time, { color: C.textSec }]}>{formatTime(item.created_at)}</Text>
                    <TouchableOpacity onPress={() => unstar(item.id)}>
                        <Ionicons name="star" size={20} color="#F18F01" />
                    </TouchableOpacity>
                </View>

                {/* Content */}
                {item.type === 'image' && item.file_id ? (
                    <Image source={{ uri: mediaUrl(item.file_id) }} style={s.mediaImage} contentFit="cover" />
                ) : item.type === 'video' || item.type === 'file' || item.type === 'audio' ? (
                    <View style={[s.mediaBox, { backgroundColor: C.bg }]}>
                        <Ionicons name={item.type === 'video' ? 'videocam' : item.type === 'audio' ? 'mic' : 'document'} size={24} color={C.accent} />
                        <Text style={[s.mediaText, { color: C.textPrimary }]} numberOfLines={1}>{item.file_name || 'Media File'}</Text>
                    </View>
                ) : item.type === 'thinking_of_you' ? (
                    <Text style={[s.text, { color: '#E4387A', fontSize: 18, fontWeight: 'bold' }]}>💭 Thinking of you ❤️</Text>
                ) : (
                    <Text style={[s.text, { color: C.textPrimary }]}>{item.content}</Text>
                )}
            </View>
        );
    };

    return (
        <View style={[s.root, { backgroundColor: C.bg }]}>
            {/* Header */}
            <View style={[s.header, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                    <Ionicons name="chevron-back" size={22} color={C.accent} />
                    <Text style={[s.backText, { color: C.accent }]}>Back</Text>
                </TouchableOpacity>
                <Text style={[s.headerTitle, { color: C.textPrimary }]}>Starred ⭐</Text>
                <View style={{ width: 70 }} />
            </View>

            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator size="large" color={C.accent} />
                </View>
            ) : messages.length === 0 ? (
                <View style={s.center}>
                    <Ionicons name="star-outline" size={60} color={C.accentSoft} />
                    <Text style={[s.emptyText, { color: C.textSec }]}>No starred messages yet.</Text>
                    <Text style={[s.emptySub, { color: C.textSec }]}>
                        Long press any message in chat and tap ⭐ to save it here.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={messages}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={s.list}
                />
            )}
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1 },
    header: {
        height: 56, flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', borderBottomWidth: 1, paddingHorizontal: 16,
        paddingTop: 44, // roughly status bar size
    },
    backBtn: { flexDirection: 'row', alignItems: 'center', width: 70 },
    backText: { fontSize: 16, fontWeight: '500', marginLeft: 2 },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
    emptyText: { fontSize: 18, fontWeight: 'bold', marginTop: 16, textAlign: 'center' },
    emptySub: { fontSize: 14, textAlign: 'center', marginTop: 8 },
    list: { padding: 16, gap: 12 },
    card: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    time: { fontSize: 12 },
    text: { fontSize: 16, lineHeight: 22 },
    mediaImage: { width: '100%', height: 200, borderRadius: 8 },
    mediaBox: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8 },
    mediaText: { marginLeft: 10, fontSize: 15, flex: 1 },
});
