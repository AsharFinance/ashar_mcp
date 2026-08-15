# Ashar MCP Server — modo HTTP (multi-tenant)
#
# Roda UMA instância compartilhada por todos os usuários. Cada tool recebe a
# `api_key` do usuário por chamada (injetada pelo orchestrator), então NÃO há
# ASHAR_API_KEY global; ASHAR_SKIP_HEALTH=true pula o healthcheck de startup
# (que usaria uma chave global inexistente).

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

ENV ASHAR_TRANSPORT=http
ENV ASHAR_SKIP_HEALTH=true
ENV PORT=3000

EXPOSE 3000
CMD ["node", "dist/index.js"]
