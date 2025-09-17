import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
// import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import { connectMongo } from './config/mongo.js';
import { errorHandler } from './middleware/errors.js';

import me from './routes/me.js';
import threads from './routes/threads.js';
import friends from './routes/friends.js';
import devices from './routes/devicetokens.js';

const app = express();

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
// import pinoHttp from 'pino-http'; // Remove this line
// app.use(pinoHttp()); // Use the pino-http middleware
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

app.get('/healthz', (_req,res)=>res.send('ok'));

app.use(me);
app.use(threads);
app.use(friends);
app.use(devices);

app.use(errorHandler);

const port = Number(process.env.PORT || 8080);

const PORT = process.env.PORT || 8080;

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

