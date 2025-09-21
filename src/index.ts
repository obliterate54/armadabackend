import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { connectMongo } from './config/mongo.js';
import { errorHandler } from './middleware/errors.js';

// Routes
import auth from './routes/auth.js';
import me from './routes/me.js';
import users from './routes/users.js';
import friends from './routes/friends.js';
import threads from './routes/threads.js';
import convoys from './routes/convoys.js';
import media from './routes/media.js';
import notifications from './routes/notifications.js';
import devices from './routes/devicetokens.js';

const app = express();
const server = createServer(app);

// CORS configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error('CORS blocked'), false);
  },
  credentials: true // Allow cookies for refresh tokens
}));

app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.ENABLE_PINO_HTTP === 'true') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pinoHttp = require('pino-http');
  app.use(pinoHttp());
}

// Rate limiting
app.use(rateLimit({ 
  windowMs: 60_000, 
  max: 120,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later'
    }
  }
}));

// Health checks
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
app.get('/ready', (_req, res) => res.status(200).json({ status: 'ready' }));

// Routes
app.use('/auth', auth);
app.use('/me', me);
app.use('/users', users);
app.use('/friends', friends);
app.use('/threads', threads);
app.use('/convoys', convoys);
app.use('/media', media);
app.use('/notifications', notifications);
app.use('/devices', devices);

// Socket.IO setup
const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true
  }
});

// Socket.IO namespaces
const presenceNamespace = io.of('/presence');
const chatNamespace = io.of('/chat');

// Socket.IO middleware for authentication
const socketAuthMiddleware = async (socket: any, next: any) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    // TODO: Verify JWT token
    // const payload = await authService.verifyAccessToken(token);
    // socket.userId = payload.userId;
    
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
};

presenceNamespace.use(socketAuthMiddleware);
chatNamespace.use(socketAuthMiddleware);

// Presence namespace events
presenceNamespace.on('connection', (socket) => {
  console.log(`User connected to presence: ${socket.id}`);
  
  socket.on('location:update', (data) => {
    // Broadcast location to convoy members
    socket.broadcast.emit('location:update', {
      userId: (socket as any).userId,
      ...data
    });
  });

  socket.on('convoy:join', (convoyId) => {
    socket.join(`convoy:${convoyId}`);
  });

  socket.on('convoy:leave', (convoyId) => {
    socket.leave(`convoy:${convoyId}`);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected from presence: ${socket.id}`);
  });
});

// Chat namespace events
chatNamespace.on('connection', (socket) => {
  console.log(`User connected to chat: ${socket.id}`);
  
  socket.on('thread:join', (threadId) => {
    socket.join(`thread:${threadId}`);
  });

  socket.on('thread:leave', (threadId) => {
    socket.leave(`thread:${threadId}`);
  });

  socket.on('thread:typing', (data) => {
    socket.to(`thread:${data.threadId}`).emit('thread:typing', {
      userId: (socket as any).userId,
      ...data
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected from chat: ${socket.id}`);
  });
});

// Error handling middleware
app.use(errorHandler);

const PORT = Number(process.env.PORT || 8080);

// Start server
connectMongo(process.env.MONGO_URI || '')
  .then(() => {
    server.listen(PORT, () => {
      console.log(`[mongo] connected`);
      console.log(`[api] server running on port ${PORT}`);
      console.log(`[socket] io server ready`);
    });
  })
  .catch((err) => {
    console.error("Mongo connection failed", err);
    // Still start server even if Mongo fails
    server.listen(PORT, () => {
      console.log(`[api] server running on port ${PORT} (without Mongo)`);
    });
  });

// Minimal OpenAPI description
app.get('/openapi.json', (_req, res) => {
  res.json({
    openapi: '3.0.0',
    info: { title: 'Convoy API', version: '1.0.0' },
    paths: {
      '/healthz': { get: { responses: { '200': { description: 'ok' } } } },
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

