FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/prisma ./prisma
RUN npm run prisma:generate

COPY backend/ ./
RUN npm run build
RUN mkdir -p /app/uploads && chown -R node:node /app

USER node

EXPOSE 4000
CMD ["npm", "start"]
