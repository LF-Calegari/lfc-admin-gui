FROM node:24-alpine

WORKDIR /app

# Install dependencies first for better cache usage.
# Mantemos como root para `npm ci` ter acesso de escrita ao /app, mas
# trocamos para o usuário não-privilegiado `node` antes de iniciar a app.
COPY package*.json ./
RUN npm ci --include=dev \
  && chown -R node:node /app

COPY --chown=node:node . .

# Hardening: roda o dev-server como `node` (uid 1000), evitando processos
# servindo HTTP como root. O usuário `node` já existe na imagem oficial.
USER node

EXPOSE 3002

CMD ["sh", "-c", "npm run dev -- --host 0.0.0.0 --port ${PORT:-3002}"]
