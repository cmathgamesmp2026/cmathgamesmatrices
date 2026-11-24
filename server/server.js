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
import {
  DEFAULT_GEMINI_MODEL,
  SUPPORTED_GEMINI_MODELS,
  getConfiguredModels,
  modelQuota
} from './services/gemini.js';
import {
  checkPoolTableExists,
  isPoolAvailable,
  getPoolCounts
} from './services/questionPool.js';

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
    model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    models: getConfiguredModels(),
    supportedModels: SUPPORTED_GEMINI_MODELS,
    dbHost: process.env.DB_HOST || 'localhost'
  });
});

// Pool & model quota status endpoint
app.get('/api/pool-status', async (req, res) => {
  const models = getConfiguredModels();
  const quotaStatus = modelQuota.getStatus(models);
  let counts = null;

  if (isPoolAvailable()) {
    try {
      counts = await getPoolCounts();
    } catch (err) {
      console.warn('[API /pool-status] DB error:', err.message);
    }
  }

  res.json({
    success: true,
    poolAvailable: isPoolAvailable(),
    counts,
    models: quotaStatus.models,
    exhaustedModels: quotaStatus.exhausted,
    allModelsExhausted: quotaStatus.allExhausted
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

app.listen(PORT, async () => {
  console.log(`[Server] Express server running at http://localhost:${PORT}`);
  console.log(`[Server] Gemini Model configured: ${process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL}`);
  const poolOk = await checkPoolTableExists();
  if (poolOk) {
    console.log('[Server] Question pool table (cmathgames.question_pool) verified.');
  }
});
