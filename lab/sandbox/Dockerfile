# Payments sandbox image. Build context: lab/ (for the workspace uv.lock).
# Base images are pinned by digest (ADR 003 as amended by ADR 011).
FROM ghcr.io/astral-sh/uv:0.12.3@sha256:2d890623d310b57771ce840f0da5eed5fc6d657da05ffaa45d82797b53fa3abc AS uv

FROM python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df
COPY --from=uv /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH

WORKDIR /lab
COPY pyproject.toml uv.lock .python-version ./
COPY sandbox/pyproject.toml sandbox/
# Dependencies first, from the lockfile only, so code changes don't reinstall them. The dev group
# stays in so the same image runs the tests.
RUN cd sandbox && uv sync --locked

COPY sandbox/ sandbox/
WORKDIR /lab/sandbox
RUN SANDBOX_DATABASE_URL=postgres://x@127.0.0.1/x python manage.py collectstatic --noinput -v 0 \
    && useradd --system --no-create-home sandbox
USER sandbox
EXPOSE 8000
ENTRYPOINT ["/lab/sandbox/docker-entrypoint.sh"]
CMD ["serve"]
