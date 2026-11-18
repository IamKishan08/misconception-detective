# Build stage: install all deps from the lockfile and build frontend + server.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.server.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

# Runtime stage: production deps only, non-root, no reliance on container disk.
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/server/server/index.js"]
