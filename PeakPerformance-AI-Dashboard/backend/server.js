require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDb = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const gymRoutes = require('./routes/gym.routes');
const reportRoutes = require('./routes/report.routes');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'dashboard-backend' }));
app.use('/api/auth', authRoutes);
app.use('/api/gym', gymRoutes);
app.use('/api/report', reportRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 5100;
connectDb()
  .then(() => app.listen(PORT, () => console.log(`[dashboard-backend] listening on ${PORT}`)))
  .catch(err => { console.error('DB connection failed:', err.message); process.exit(1); });

module.exports = app;
