import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // SQLite database
  database: {
    path: process.env.DATABASE_PATH || path.join(__dirname, '../../data/pixazo.db'),
  },

  // Pixazo Tracks API (cloud)
  pixazo: {
    apiUrl: process.env.PIXAZO_API_URL || 'https://gateway.pixazo.ai',
    subscriptionKey: process.env.PIXAZO_SUBSCRIPTION_KEY || '',
  },

  // Kept for training routes backward compat
  acestep: {
    apiUrl: process.env.ACESTEP_API_URL || 'http://localhost:8001',
  },

  // Pexels (optional - for video backgrounds)
  pexels: {
    apiKey: process.env.PEXELS_API_KEY || '',
  },

  // Frontend URL
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Storage (local only)
  storage: {
    provider: 'local' as const,
    audioDir: process.env.AUDIO_DIR || path.join(__dirname, '../../public/audio'),
  },

  // Training datasets
  datasets: {
    dir: process.env.DATASETS_DIR || path.join(__dirname, '../../../datasets'),
    uploadsDir: process.env.DATASETS_UPLOADS_DIR || path.join(__dirname, '../../../datasets/uploads'),
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'pixazo-local-secret',
    expiresIn: '365d',
  },
};
