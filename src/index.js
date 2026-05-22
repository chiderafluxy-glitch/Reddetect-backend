require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const stripeRoutes = require('./routes/stripe');
const reportsRoutes = require('./routes/reports');
const workspacesRoutes = require('./routes/workspaces');
const postsRoutes = require('./routes/posts');
const vaultRoutes = require('./routes/vault');

const app = express();

// CORS - allow frontend origin
app.use(cors({
  origin: [process.env.FRONTEND_URL, 'http://localhost:3000'],
  credentials: true
}));

// Stripe webhook needs raw body BEFORE express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// JSON body parser for all other routes
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', app: 'Reddetect API' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/workspaces', workspacesRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/vault', vaultRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Reddetect API running on port ${PORT}`);
});
