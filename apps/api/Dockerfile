# API do SAC AISA (NestJS). O contexto do build é a raiz do repositório.
# No EasyPanel: build por Dockerfile, arquivo apps/api/Dockerfile.

FROM node:22-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
# Todo workspace precisa estar aqui, senão as dependências dele não entram.
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/importacao/package.json ./packages/importacao/package.json
COPY packages/gestor-tools/package.json ./packages/gestor-tools/package.json
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci

FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate
RUN npm run build -w @sac-aisa/api

FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=3001
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/importacao/dados ./dados
COPY apps/api/entrypoint.sh ./entrypoint.sh
RUN sed -i 's/\r$//' entrypoint.sh \
  && chmod +x entrypoint.sh \
  && addgroup -S nodejs \
  && adduser -S api -G nodejs \
  && chown -R api:nodejs /app
USER api
EXPOSE 3001
CMD ["./entrypoint.sh"]
