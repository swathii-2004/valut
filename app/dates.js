import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
    Alert, TextInput, FlatList, Modal, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons }
import { useSafeAreaInsets } from 'react-native-safe-area-context'; from '@expo/vector-icons';
import { router } from 'expo-router';
import apiClient from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { io } from 'socket.io-client';

export default function DatesScreen() {
    const insets = useSafeAreaInsets();
    const { theme: C } = useTheme();
    const { accessToken } = useAuth();
    const [dates, setDates] = useState([]);
    const [loading, setLoading] = useState(true);

    const [showAdd, setShowAdd] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDateStr, setNewDateStr] = useState(''); // YYYY-MM-DD

    useEffect(() => {
        loadDates();

        // Listen for socket events
        const BASE_URL = 'https://couplvault.online';
        const socket = io(BASE_URL, {
            auth: { token: accessToken },
            transports: ['websocket'],
        });

        socket.on('new_date', (dt) => {
            setDates(prev => {
                const filtered = prev.filter(d => d.id !== dt.id);
                const added = [...filtered, dt];
                return added.sort((a, b) => new Date(a.date) - new Date(b.date));
            });
        });

        socket.on('deleted_date', ({ id }) => {
            setDates(prev => prev.filter(d => d.id !== id));
        });

        return () => {
            socket.disconnect();
        };
    }, [accessToken]);

    const loadDates = async () => {
        try {
            const res = await apiClient.get('/api/dates');
            setDates(res.data);
        } catch (e) {
            Alert.alert('Error', 'Failed to load dates');
        } finally {
            setLoading(false);
        }
    };

    const saveDate = async () => {
        if (!newTitle.trim()) {
            Alert.alert('Error', 'Please enter a title');
            return;
        }
        // Validate YYYY-MM-DD
        const regex = /^\d{4}-\d{2}-\d{2}$/;
        if (!regex.test(newDateStr)) {
            Alert.alert('Invalid format', 'Please use YYYY-MM-DD format (e.g., 2024-12-25)');
            return;
        }
        const parsed = new Date(newDateStr);
        if (isNaN(parsed.getTime())) {
            Alert.alert('Invalid date', 'The date you entered is not valid.');
            return;
        }

        try {
            const payload = { title: newTitle.trim(), date: newDateStr, is_recurring: true };
            // Optimistic update
            const tempId = 'temp_' + Date.now();
            const newD = { id: tempId, ...payload };

            setDates(prev => {
                const added = [...prev, newD];
                return added.sort((a, b) => new Date(a.date) - new Date(b.date));
            });
            setShowAdd(false);
            setNewTitle('');
            setNewDateStr('');

            const res = await apiClient.post('/api/dates', payload);
            setDates(prev => prev.map(d => d.id === tempId ? res.data : d));
        } catch (e) {
            Alert.alert('Error', 'Failed to save date');
            loadDates(); // revert
        }
    };

    const deleteDate = async (id) => {
        Alert.alert('Delete Date?', 'Are you sure you want to remove this special date?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    try {
                        setDates(prev => prev.filter(d => d.id !== id));
                        await apiClient.delete(`/api/dates/${id}`);
                    } catch (e) {
                        Alert.alert('Error', 'Failed to delete');
                        loadDates();
                    }
                }
            }
        ]);
    };

    // Helper to get days remaining
    const getDaysInfo = (dateString) => {
        const target = new Date(dateString);
        const today = new Date();

        // Since it's recurring, calculate next occurrence
        target.setFullYear(today.getFullYear());

        // If it already passed this year, set to next year
        today.setHours(0, 0, 0, 0);
        if (target < today) {
            target.setFullYear(today.getFullYear() + 1);
        }

        const diffTime = target.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return { label: 'Today!', color: '#E4387A' };
        if (diffDays === 1) return { label: 'Tomorrow', color: '#E4387A' };
        if (diffDays <= 7) return { label: `In ${diffDays} days`, color: '#F18F01' };
        if (diffDays <= 30) return { label: `In ${diffDays} days`, color: '#048A81' };
        return { label: `In ${diffDays} days`, color: '#888' };
    };

    const renderItem = ({ item }) => {
        const rawDate = new Date(item.date);
        const displayStr = rawDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const info = getDaysInfo(item.date);

        return (
            <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
                <View style={s.cardLeft}>
                    <Text style={[s.cardTitle, { color: C.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[s.cardDate, { color: C.textSec }]}>{displayStr}</Text>
                </View>
                <View style={s.cardRight}>
                    <View style={[s.badge, { backgroundColor: info.color + '20' }]}>
                        <Text style={[s.badgeText, { color: info.color }]}>{info.label}</Text>
                    </View>
                    <TouchableOpacity onPress={() => deleteDate(item.id)} style={{ padding: 8 }}>
                        <Ionicons name="trash-outline" size={20} color={C.textSec} />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <View style={[s.root, { backgroundColor: C.bg, paddingTop: Math.max(insets.top, 20) }]}>
            {/* Header */}
            <View style={[s.header, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                    <Ionicons name="chevron-back" size={22} color={C.accent} />
                    <Text style={[s.backText, { color: C.accent }]}>Back</Text>
                </TouchableOpacity>
                <Text style={[s.headerTitle, { color: C.textPrimary }]}>Special Dates 📅</Text>
                <View style={{ width: 70 }} />
            </View>

            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator color={C.accent} size="large" />
                </View>
            ) : dates.length === 0 ? (
                <View style={s.center}>
                    <Ionicons name="calendar-outline" size={60} color={C.accentSoft} />
                    <Text style={[s.emptyText, { color: C.textSec }]}>No special dates yet.</Text>
                    <Text style={[s.emptySub, { color: C.textSec }]}>Add birthdays, anniversaries, and milestones to celebrate together!</Text>
                </View>
            ) : (
                <FlatList
                    data={dates}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 16 }}
                />
            )}

            <TouchableOpacity style={[s.fab, { backgroundColor: C.accent }]} onPress={() => setShowAdd(true)}>
                <Ionicons name="add" size={32} color="#fff" />
            </TouchableOpacity>

            {/* Add Modal */}
            <Modal visible={showAdd} transparent animationType="slide">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : null} style={s.modalOverlay}>
                    <View style={[s.modalContent, { backgroundColor: C.surface }]}>
                        <Text style={[s.modalTitle, { color: C.textPrimary }]}>Add Special Date</Text>

                        <View style={[s.inputWrap, { backgroundColor: C.bg, borderColor: C.border }]}>
                            <Ionicons name="heart-outline" size={20} color={C.textSec} style={{ marginRight: 8 }} />
                            <TextInput
                                style={[s.input, { color: C.textPrimary }]}
                                placeholder="Title (e.g. Our Anniversary)"
                                placeholderTextColor={C.textSec}
                                value={newTitle}
                                onChangeText={setNewTitle}
                            />
                        </View>

                        <View style={[s.inputWrap, { backgroundColor: C.bg, borderColor: C.border }]}>
                            <Ionicons name="calendar-outline" size={20} color={C.textSec} style={{ marginRight: 8 }} />
                            <TextInput
                                style={[s.input, { color: C.textPrimary }]}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor={C.textSec}
                                value={newDateStr}
                                onChangeText={setNewDateStr}
                                keyboardType="numeric"
                            />
                        </View>
                        <Text style={{ color: C.textSec, fontSize: 12, marginBottom: 20 }}>
                            Use format YYYY-MM-DD (e.g., 2024-12-25)
                        </Text>

                        <View style={s.modalActions}>
                            <TouchableOpacity style={s.modalCancel} onPress={() => setShowAdd(false)}>
                                <Text style={{ color: C.textSec, fontWeight: '600' }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.modalSave, { backgroundColor: C.accent }]} onPress={saveDate}>
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1 },
    header: {
        height: 56, flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', borderBottomWidth: 1, paddingHorizontal: 16,
    },
    backBtn: { flexDirection: 'row', alignItems: 'center', width: 70 },
    backText: { fontSize: 16, fontWeight: '500', marginLeft: 2 },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
    emptyText: { fontSize: 18, fontWeight: 'bold', marginTop: 16, textAlign: 'center' },
    emptySub: { fontSize: 14, textAlign: 'center', marginTop: 8 },
    fab: {
        position: 'absolute', right: 20, bottom: 20, width: 60, height: 60,
        borderRadius: 30, justifyContent: 'center', alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 6
    },

    card: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1,
    },
    cardLeft: { flex: 1 },
    cardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    cardDate: { fontSize: 14 },
    cardRight: { flexDirection: 'row', alignItems: 'center' },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 12 },
    badgeText: { fontSize: 12, fontWeight: 'bold' },

    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center', padding: 20
    },
    modalContent: {
        padding: 24, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 10
    },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    inputWrap: {
        flexDirection: 'row', alignItems: 'center',
        borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 50, marginBottom: 12
    },
    input: { flex: 1, fontSize: 16 },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
    modalCancel: { paddingHorizontal: 20, paddingVertical: 12, justifyContent: 'center' },
    modalSave: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, justifyContent: 'center' }
});
