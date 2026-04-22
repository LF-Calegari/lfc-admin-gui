FROM node:24-alpine

WORKDIR /app

# Install dependencies first for better cache usage.
COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
