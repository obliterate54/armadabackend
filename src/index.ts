import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { connectMongo } from './config/mongo.js';
import { errorHandler } from './middleware/errors.js';

import usersPublic from './routes/users.public.js';
import auth from './routes/auth.js';
import me from './routes/me.js';
import threads from './routes/threads.js';
import friends from './routes/friends.js';
import devices from './routes/devicetokens.js';
import users from './routes/users.js';
import { requireAuth } from './middleware/auth.js';

const app = express();

// Trust proxy for Render/Proxies: needed for correct req.ip
app.set('trust proxy', 1);

const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'), false);
  }
}));
app.use(helmet());
app.use(compression());
app.use(express.json());
if (process.env.ENABLE_PINO_HTTP === 'true') {
  // Lazy import to avoid dependency issues if optional
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pinoHttp = require('pino-http');
  app.use(pinoHttp());
}
const limiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || 'unknown',
});

app.use(limiter);

app.get('/healthz', (_req,res)=>res.status(200).json({ status: 'ok' }));

// Public routes (no auth required)
app.use(usersPublic);
app.use('/auth', auth);

// Protected routes (require auth)
app.use(requireAuth);
app.use('/me', me);
app.use('/threads', threads);
app.use('/friends', friends);
app.use('/devices', devices);
app.use('/users', users);

app.use(errorHandler);

const PORT = Number(process.env.PORT || 8080);

// make sure Mongo connects before starting
connectMongo(process.env.MONGO_URI || '')
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[mongo] connected`);
      console.log(`api on :${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Mongo connection failed", err);
    // optional: still start server even if Mongo fails
    app.listen(PORT, () => {
      console.log(`api running without Mongo on :${PORT}`);
    });
  });

// error handling middleware should go after routes
app.use(errorHandler);

// Minimal OpenAPI description
app.get('/openapi.json', (_req, res) => {
  res.json({
    openapi: '3.0.0',
    info: { title: 'Convoy API', version: '1.0.0' },
    paths: {
      '/healthz': { get: { responses: { '200': { description: 'ok' } } } },
      '/auth/register': { post: { responses: { '201': { description: 'created' }, '409': { description: 'email/username taken' } } } },
      '/auth/login': { post: { responses: { '200': { description: 'success' }, '401': { description: 'invalid credentials' } } } },
      '/auth/me': { get: { security: [{ bearerAuth: [] }], responses: { '200': { description: 'user' } } } },
      '/me': {
        get: { security: [{ bearerAuth: [] }], responses: { '200': { description: 'me' } } },
        post: { security: [{ bearerAuth: [] }], responses: { '200': { description: 'updated' }, '409': { description: 'username taken' } } }
      },
      '/users/by-username/{username}': {
        get: { security: [{ bearerAuth: [] }], parameters: [{ name: 'username', in: 'path', required: true }], responses: { '200': { description: 'resolved' }, '404': { description: 'not found' } } }
      },
      '/friends/requests': { get: { security: [{ bearerAuth: [] }], responses: { '200': { description: 'list' } } } },
      '/friends/request': { post: { security: [{ bearerAuth: [] }], responses: { '201': { description: 'created' }, '404': { description: 'not found' }, '409': { description: 'duplicate' } } } },
      '/friends/respond': { post: { security: [{ bearerAuth: [] }], responses: { '200': { description: 'ok' } } } },
      '/threads': {
        get: { security: [{ bearerAuth: [] }], responses: { '200': { description: 'list' } } },
        post: { security: [{ bearerAuth: [] }], responses: { '201': { description: 'created' } } }
      },
      '/threads/{id}': { delete: { security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true }], responses: { '200': { description: 'deleted' }, '403': { description: 'forbidden' }, '404': { description: 'not found' } } } }
    },
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } }
  });
});

