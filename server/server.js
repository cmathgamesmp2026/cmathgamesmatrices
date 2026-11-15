import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables on backend ONLY
dotenv.config();

import questionRoutes from './routes/questions.js';
import leaderboardRoutes from './routes/leaderboard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/question', questionRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'),
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    dbHost: process.env.DB_HOST || 'localhost'
  });
});

// Serve frontend static build in production
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA Fallback for client-side routing
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

app.listen(PORT, () => {
  console.log(`[Server] Express server running at http://localhost:${PORT}`);
  console.log(`[Server] Gemini Model configured: ${process.env.GEMINI_MODEL || 'gemini-2.5-flash'}`);
});
