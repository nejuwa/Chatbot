# Nova Chat

Nova Chat is a full-stack messaging application with AI conversations, real-time direct and group chats, user profiles, contacts, and media sharing. The interface is built with Next.js and the API is powered by Express, PostgreSQL, Prisma, and Socket.IO. AI responses are streamed from Google Gemini.

## Features

- Email/password authentication, optional Google sign-in, and password reset
- AI chats with streamed responses
- Real-time direct and group messaging, typing indicators, presence, and read receipts
- Group creation, member management, and owner-controlled group profiles
- Contacts, saved messages, profile photos, and file, image, video, and voice-message uploads
- Responsive Telegram-inspired interface with light and dark themes

Phone/video calls are currently UI previews; call signaling and media transport are not implemented. Switching saved accounts requires signing in again.

## Project structure

- `frontend/` — Next.js App Router, React, TypeScript, and Tailwind CSS
- `backend/` — Express API, Socket.IO server, Prisma schema, and migrations
- `backend/prisma/` — PostgreSQL schema and migration history
- `backend/uploads/` — Local-development upload storage; production uploads use Cloudinary

## Run locally

Requirements: Node.js 22.12 or later (under 25), npm, and PostgreSQL.

### 1. Configure and start the backend

In PowerShell:

```powershell
Set-Location .\backend
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Set `DATABASE_URL` to your PostgreSQL database and `JWT_SECRET` to a random secret of at least 32 characters in `backend/.env`. Add `GOOGLE_API_KEY` to enable AI responses. Google OAuth and SMTP settings are optional; see the variable names in `backend/.env.example`. Local development can use the local upload directory; set all three `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` values to test Cloudinary storage. They are required in production.

Then generate the Prisma client, apply migrations, and start the API:

```powershell
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

The API runs at `http://localhost:4000`. Its health endpoints are `/health` and `/health/ready`.

### 2. Start the frontend

In a second PowerShell terminal:

```powershell
Set-Location .\frontend
npm install
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

Open `http://localhost:3000`. The frontend defaults to the API at `http://localhost:4000`. Set the backend's `CORS_ORIGIN` to the frontend's actual origin if it differs from `http://localhost:3000`.

## Checks

Run these from their respective directories:

```powershell
# frontend
npm run lint
npm run build

# backend
npm test
npm run build
```

Database integration tests require `TEST_DATABASE_URL` to point to a separate, disposable PostgreSQL database with migrations applied. Do not use a database containing data you need; the test creates and deletes accounts and chat sessions.

## Docker

Configure `backend/.env` with `POSTGRES_PASSWORD`, `JWT_SECRET`, and `CORS_ORIGIN`, then run from the repository root:

```powershell
docker compose --env-file backend/.env -f backend/compose.yaml up --build
```

Compose starts PostgreSQL and the backend. The frontend remains a separate app; run it locally or deploy it separately, and set `CORS_ORIGIN` to its deployed origin.

## Security and configuration

Do not commit `.env`, `.env.local`, API keys, passwords, tokens, or populated test data. Browser authentication uses HttpOnly cookies and CSRF protection. Production media is stored in Cloudinary as authenticated assets and is delivered only through authorized API routes. Back up the PostgreSQL database and configure Cloudinary backups/retention. Gemini usage is subject to Google's quotas and data policies.
