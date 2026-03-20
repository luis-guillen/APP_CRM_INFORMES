FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner

WORKDIR /app

# Asegurar entorno de producción
ENV NODE_ENV=production
ENV PORT=5001

# Copiar dependencias de producción
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Copiar el core de la aplicación
COPY src/ ./src/
COPY public/ ./public/

# Crear estructuras base para directorios con permisos para usuario 'node'
RUN mkdir -p data uploads/documentos uploads/fotografias reports tmp && \
    chown -R node:node /app

# Cambiar a usuario no-root por seguridad
USER node

# Healthcheck interno del ecosistema backend
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5001/ || exit 1

EXPOSE 5001
CMD ["npm", "start"]
