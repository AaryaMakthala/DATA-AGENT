# ============================================================
# Stage 1 — dependency builder
# Install all Python packages into an isolated venv so the
# runtime stage only copies what it needs (no build tools, no
# pip cache, smaller final image).
# ============================================================
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build deps for packages that compile C extensions
# (numpy/pandas/scikit-learn). Kept in the builder stage only.
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN python -m venv /venv \
    && /venv/bin/pip install --upgrade pip \
    && /venv/bin/pip install --no-cache-dir -r requirements.txt


# ============================================================
# Stage 2 — runtime image
# Lean image: only the venv, app code, and a non-root user.
# No compiler, no pip, no build caches.
# ============================================================
FROM python:3.11-slim AS runtime

# Create a non-root user so the process can't write outside
# its own working directories even if it is compromised.
RUN groupadd --system appgroup \
    && useradd --system --gid appgroup --no-create-home appuser

WORKDIR /app

# Pull the pre-built venv from the builder stage.
COPY --from=builder /venv /venv

# Copy application source (respects .dockerignore -- see that file
# to verify venv/, __pycache__/, *.env, uploads/, outputs/ are excluded).
COPY --chown=appuser:appgroup . .

# Persistent data directories. In production these MUST be backed
# by a mounted volume (see DEPLOYMENT.md) -- without one, uploads
# and analysis outputs are lost on every container restart.
# TODO: mount /app/uploads and /app/outputs as named volumes or
# bind-mounts to your chosen persistent storage (S3 fuse, NFS, etc).
RUN mkdir -p uploads outputs/cleaned_files outputs/charts outputs/reports \
    && chown -R appuser:appgroup uploads outputs

USER appuser

# Activate the venv for all subsequent RUN/CMD instructions.
ENV PATH="/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

EXPOSE 8000

# Production start command:
#   --workers 2          two worker processes (tune to 2*CPU+1 in production)
#   --no-access-log      access logs are emitted by the app layer; avoid doubles
#   --proxy-headers      trust X-Forwarded-For / X-Forwarded-Proto from a
#                        fronting reverse proxy (Nginx, Caddy, Railway, Render)
# NOTE: --reload is intentionally ABSENT. Never use it outside local dev.
CMD ["/venv/bin/uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2", \
     "--no-access-log", \
     "--proxy-headers"]
