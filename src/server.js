require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(helmet());

// Parse JSON
app.use(express.json());

// Global rate limiter
app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    message: { error: 'Too many requests' },
}));

// Auth specific rate limiter
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many auth attempts' },
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Start server
app.listen(PORT, () => {
    console.log(`Vault API running on port ${PORT}`);
});

module.exports = app;