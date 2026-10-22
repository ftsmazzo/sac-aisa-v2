FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Todo workspace precisa estar aqui: o `next build` confere os tipos do repositório
# inteiro, inclusive a API, e as dependências dela só entram se o package.json existir.
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/importacao/package.json ./packages/importacao/package.json
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# O Next confere os tipos do repositório inteiro, e a API e a importação usam o
# Prisma. Aqui só os tipos importam, então o cliente é gerado sem o motor.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate --no-engine
RUN mkdir -p public && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
