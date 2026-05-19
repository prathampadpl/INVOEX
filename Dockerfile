# Stage 1: Build the application
FROM node:20-slim AS builder
WORKDIR /app

# Copy package descriptors and install all dependencies
COPY package*.json ./
RUN npm ci

# Copy all files (ignoring those in .dockerignore)
COPY . .

# Run prebuild, vite build, and esbuild server
RUN npm run build

# Stage 2: Serve the application
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

# Copy package descriptors and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled frontend and server bundles
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/firebase-applet-config.json ./

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"]
