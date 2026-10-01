# Smart Medication Reminder - Production Backend Dockerfile
# Base Image: Python 3.12 Slim (Debian Bookworm)
FROM python:3.12-slim

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=5050 \
    DATABASE_PATH=/app/data/medremind.db \
    DEMO_MODE=false \
    PYTHONPATH=/app/backend:/app

# Install system dependencies (curl for container healthcheck)
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Create application directory
WORKDIR /app

# Create non-root user and group
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/bash -m appuser

# Install Python dependencies
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy backend source code
COPY backend /app/backend

# Create persistent data volume directory for SQLite database
RUN mkdir -p /app/data && \
    chown -R appuser:appgroup /app

# Declare mounted volume for SQLite persistence
VOLUME ["/app/data"]

# Switch to unprivileged non-root user
USER appuser

# Expose backend port
EXPOSE 5050

# Container healthcheck querying /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5050/api/health || exit 1

# Production WSGI server (Gunicorn with 2 workers and 2 threads)
CMD ["gunicorn", "--bind", "0.0.0.0:5050", "--workers", "2", "--threads", "2", "app:app"]
