# convoy-api

Express + TypeScript + MongoDB + Firebase Admin.

Env vars:

- PORT
- MONGO_URI
- FIREBASE_PROJECT_ID
- FIREBASE_CLIENT_EMAIL
- FIREBASE_PRIVATE_KEY (supports literal \n)
- ENABLE_PINO_HTTP (optional, set to 'true' to enable)

Health: GET /healthz → { status: "ok" }

Auth: Firebase ID token via Authorization: Bearer <token>

Routes: see monorepo README for full list.

# armadabackend
