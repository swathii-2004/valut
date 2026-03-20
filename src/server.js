require('dotenv').config();
const express = require('express');
const http = require('http');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const messageRoutes = require('./routes/messages');
const profileRoutes = require('./routes/profile');
const socketState = require('./socket');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ── Trust Cloudflare proxy ──
app.set('trust proxy', 1);

// ── Security headers ──
app.use(helmet());

// ── Parse JSON ──
app.use(express.json());

// ── Global rate limiter ──
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Too many requests' },
}));

// ── Auth rate limiter ──
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many auth attempts' },
});

// ── Routes ──
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/profile', profileRoutes);

// ── Health check ──
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ══════════════════════════════════════════════════════
// Socket.io — Real-time chat
// ══════════════════════════════════════════════════════

const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
});

// JWT auth middleware for Socket.io
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token — authentication required'));
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = payload; // { sub, email, jti }
        console.log(`[SOCKET] ✅ Authenticated: ${payload.email}`);
        next();
    } catch (err) {
        console.log(`[SOCKET] ❌ Auth failed: ${err.message}`);
        next(new Error('Invalid token'));
    }
});

// Deterministic private room ID (same for both users regardless of order)
function getRoomId(idA, idB) {
    return [idA, idB].sort().join('_');
}

io.on('connection', (socket) => {
    const { sub: userId, email } = socket.user;
    console.log(`[SOCKET] 🔌 Connected: ${email} (${socket.id})`);

    // ── join_room ──
    socket.on('join_room', ({ partnerId }) => {
        const room = getRoomId(userId, partnerId);
        socket.join(room);
        socket.currentRoom = room;
        socket.partnerId = partnerId;
        console.log(`[SOCKET] 🏠 ${email} joined room: ${room}`);
    });

    // ── typing ──
    socket.on('typing', () => {
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('partner_typing', { userId });
        }
    });

    // ── stop_typing ──
    socket.on('stop_typing', () => {
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('partner_stop_typing', { userId });
        }
    });

    // ── message_read ──
    socket.on('message_read', ({ messageId }) => {
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('message_read_ack', { messageId, readBy: userId });
        }
    });

    // ── message_reaction ──
    socket.on('message_reaction', ({ messageId, emoji }) => {
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('reaction_update', { messageId, userId, emoji });
        }
    });

    // ── delete_message ──
    socket.on('delete_message', ({ messageId }) => {
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('message_deleted', { messageId });
        }
    });

    // ── disconnect ──
    socket.on('disconnect', () => {
        console.log(`[SOCKET] 🔌 Disconnected: ${email}`);
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('partner_offline', { userId });
        }
    });
});

// Share io instance with routes (no circular dependency)
socketState.setIo(io);

// ── Start server ──
server.listen(PORT, () => {
    console.log(`Vault API + Socket.io running on port ${PORT}`);
});

module.exports = { app, server };