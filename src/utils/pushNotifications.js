// src/utils/pushNotifications.js — Expo Push Notification sender
'use strict';

const { Expo } = require('expo-server-sdk');
const pool = require('../db/pool');

const expo = new Expo();

/**
 * Send a push notification to a specific user by their userId.
 * Looks up their push_token from the DB.
 */
async function sendPushToUser(userId, title, body, data = {}) {
    try {
        const result = await pool.query(
            `SELECT push_token FROM users WHERE id = $1`,
            [userId]
        );
        const token = result.rows[0]?.push_token;
        if (!token || !Expo.isExpoPushToken(token)) {
            return; // No valid token — silently skip
        }

        const messages = [{
            to: token,
            sound: 'default',
            title,
            body,
            data,
            priority: 'high',
            channelId: 'messages',
        }];

        const chunks = expo.chunkPushNotifications(messages);
        for (const chunk of chunks) {
            try {
                const receipts = await expo.sendPushNotificationsAsync(chunk);
                console.log('[PUSH] Sent:', JSON.stringify(receipts));
            } catch (err) {
                console.error('[PUSH] Chunk send error:', err.message);
            }
        }
    } catch (err) {
        console.error('[PUSH] sendPushToUser error:', err.message);
    }
}

/**
 * Get a human-readable preview for a message type.
 */
function getMessagePreview(type, content) {
    if (type === 'image') return '📷 Photo';
    if (type === 'video') return '🎥 Video';
    if (type === 'audio') return '🎤 Voice message';
    if (type === 'file') return '📄 File';
    // Check if text content is a GIF URL
    if (type === 'text' && content?.startsWith('http') &&
        (content.includes('tenor.com') || content.includes('giphy.com') || content.endsWith('.gif'))) {
        return 'GIF 🎬';
    }
    // Regular text — truncate
    if (content && content.length > 60) return content.slice(0, 60) + '…';
    return content || 'New message';
}

module.exports = { sendPushToUser, getMessagePreview };
