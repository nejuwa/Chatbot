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

Requirements: Node.js 22.12 or later (under 25), npm, and a PostgreSQL database. The instructions below use Neon; a local PostgreSQL server also works.

### 1. Configure and start the backend

In PowerShell:

```powershell
Set-Location .\backend
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

#### Configure Neon PostgreSQL

1. Create a project in [Neon](https://neon.tech/) and choose a region close to your backend hosting region.
2. In the Neon Console, open **Connect** and copy both connection strings:
   - Use the **pooled** URL (the hostname contains `-pooler`) for `DATABASE_URL`, which Prisma Client uses at runtime.
   - Use the **direct/unpooled** URL (no `-pooler` in the hostname) for `DATABASE_URL_UNPOOLED`, which Prisma uses for migrations.
   - Keep `sslmode=require` on both URLs. Add `connect_timeout=15` to `DATABASE_URL` so Prisma allows time for an idle Neon compute to wake (for example, `...?sslmode=require&connect_timeout=15`).
3. Put both URLs in `backend/.env`. Keep them secret: do not commit `.env`, put either URL in the frontend, or share them publicly.

Prisma Client uses `DATABASE_URL`, while the `directUrl` in `backend/prisma/schema.prisma` directs Prisma migration commands to `DATABASE_URL_UNPOOLED`.

Set `JWT_SECRET` to a random secret of at least 32 characters in `backend/.env`. Add `GOOGLE_API_KEY` to enable AI responses. Google OAuth and SMTP settings are optional; see the variable names in `backend/.env.example`. Local development can use the local upload directory; set all three `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` values to test Cloudinary storage. They are required in production.

Then generate the Prisma client, apply the existing migrations to Neon, and start the API:

```powershell
npm run prisma:generate
npm run prisma:deploy
npm run dev
```

Use `npm run prisma:migrate` when developing a new schema change locally; review and commit the generated migration before deploying. `npm run prisma:deploy` applies committed migrations and is the correct command for a new or production database.

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

Database integration tests require `TEST_DATABASE_URL` to point to a separate, disposable PostgreSQL database with migrations applied. Do not use your Neon application database or any database containing data you need; the test creates and deletes accounts and chat sessions.

## Docker

Configure `backend/.env` with `POSTGRES_PASSWORD`, `JWT_SECRET`, and `CORS_ORIGIN`, then run from the repository root:

```powershell
docker compose --env-file backend/.env -f backend/compose.yaml up --build
```

Compose starts a local PostgreSQL container and the backend; it does not use Neon. The frontend remains a separate app; run it locally or deploy it separately, and set `CORS_ORIGIN` to its deployed origin.

## Deploying with Neon and Render

In Render, set the backend service's `DATABASE_URL` to the Neon pooled URL (with `sslmode=require` and `connect_timeout=15`) and `DATABASE_URL_UNPOOLED` to the direct URL (with `sslmode=require`). Keep the `npm run prisma:deploy` pre-deploy command so committed Prisma migrations use the direct URL before the service starts. Set all other required backend variables in Render's Environment settings; never commit their values.

When using the default Vercel and Render hostnames without a custom domain, production auth and CSRF cookies use `SameSite=None; Secure` so credentialed API requests can cross site boundaries. Keep `CORS_ORIGIN` set to the exact Vercel origin; the API also requires the CSRF cookie/header token match on unsafe requests. The Google OAuth state cookie remains `SameSite=Lax`. Some browsers or privacy settings block third-party cookies; if sign-in still fails, check the browser's cookie-blocking message and use a browser configuration that allows cross-site cookies or move to a same-origin hosting setup.

## Security and configuration

Do not commit `.env`, `.env.local`, API keys, passwords, tokens, or populated test data. Browser authentication uses HttpOnly cookies and CSRF protection. Production media is stored in Cloudinary as authenticated assets and is delivered only through authorized API routes. Back up the PostgreSQL database and configure Cloudinary backups/retention. Gemini usage is subject to Google's quotas and data policies.
