require('dotenv').config();

// ── Startup guard: fail fast if MASTER_SECRET is missing ──
if (!process.env.MASTER_SECRET) {
    console.error('[STARTUP] ❌ MASTER_SECRET is not set in .env — refusing to start');
    process.exit(1);
}

const express = require('express');
const http    = require('http');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const jwt     = require('jsonwebtoken');

const authRoutes    = require('./routes/auth');
const fileRoutes    = require('./routes/files');
const messageRoutes = require('./routes/messages');
const profileRoutes = require('./routes/profile');
const datesRoutes   = require('./routes/dates');
const vaultRoutes   = require('./routes/vault');
const adminRoutes   = require('./routes/admin');
const socketState   = require('./socket');
const pool          = require('./db/pool');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3000;

// ── Trust Cloudflare proxy ──
app.set('trust proxy', 1);

// ── Security headers ──
app.use(helmet());

// ── Parse JSON ──
app.use(express.json());

// ── Global rate limiter ──
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max     : 1000,
    message : { error: 'Too many requests' },
}));

// ── Auth rate limiter ──
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max     : 50,
    message : { error: 'Too many auth attempts' },
});

// ── Routes ──
app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/files',    fileRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/profile',  profileRoutes);
app.use('/api/dates',    datesRoutes);
app.use('/api/vault',    vaultRoutes);
app.use('/admin',        adminRoutes);

// ── Health check ──
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ══════════════════════════════════════════════════════
// Socket.io — Real-time chat
// Rooms are now based on vault_id, not user ID pairs.
// ══════════════════════════════════════════════════════

const io = new Server(server, {
    cors      : { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
});

// JWT auth middleware for Socket.io
io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token — authentication required'));
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = payload; // { sub, email, jti }

        // Look up vault membership — attach vault_id to socket
        const result = await pool.query(
            `SELECT vm.vault_id, v.status
             FROM vault_members vm
             JOIN vaults v ON v.id = vm.vault_id
             WHERE vm.user_id = $1`,
            [payload.sub]
        );
        socket.vaultId     = result.rows[0]?.vault_id || null;
        socket.vaultStatus = result.rows[0]?.status    || null;

        console.log(`[SOCKET] ✅ Authenticated: ${payload.email} | vault: ${socket.vaultId}`);
        next();
    } catch (err) {
        console.log(`[SOCKET] ❌ Auth failed: ${err.message}`);
        next(new Error('Invalid token'));
    }
});

io.on('connection', (socket) => {
    const { sub: userId, email } = socket.user;
    console.log(`[SOCKET] 🔌 Connected: ${email} (${socket.id})`);

    // ── join_vault_room ──
    // Each user joins their vault room on connect (if vault exists)
    if (socket.vaultId) {
        const room = `vault:${socket.vaultId}`;
        socket.join(room);
        socket.currentRoom = room;
        console.log(`[SOCKET] 🏠 ${email} joined room: ${room}`);
    }

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

    // ── message_delivered ──
    socket.on('message_delivered', ({ messageId }) => {
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('message_delivered_ack', { messageId });
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

// Share io instance with routes
socketState.setIo(io);

// ── Start server ──
server.listen(PORT, () => {
    console.log(`Vault API + Socket.io running on port ${PORT}`);
});

module.exports = { app, server };