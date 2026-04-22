FROM node:24-alpine

WORKDIR /app

# Install dependencies first for better cache usage.
COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3002

CMD ["sh", "-c", "npm run dev -- --host 0.0.0.0 --port ${PORT:-3002}"]
