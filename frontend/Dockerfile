# ============================================================
# Stage 1: Builder — compile React/Vite app
# ============================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Accept optional API URL build-arg (defaults to empty → uses relative /api/v1)
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

# Install dependencies first (layer-cache friendly)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ============================================================
# Stage 2: Runtime — serve via nginx
# ============================================================
FROM nginx:1.27-alpine AS runtime

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/tavilo.conf

# Copy compiled assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
