# One image for the whole site: the backend serves the built React app, the API and WebSockets
# from a single domain (so the login cookie and live updates work without extra setup).
# Works on Railway and Render; both detect this Dockerfile automatically.

# ---- 1. Build the frontend
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. Python backend
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FRONTEND_DIST=/app/frontend/dist \
    UPLOAD_DIR=/data/uploads
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY --from=web /web/dist /app/frontend/dist
RUN mkdir -p /data/uploads

EXPOSE 8000
# Exactly one worker: live chat/SOS/cafe updates and the event scheduler live in process memory.
# --proxy-headers: trust the platform's HTTPS proxy so login throttling sees each user's real IP.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --proxy-headers --forwarded-allow-ips="*"
