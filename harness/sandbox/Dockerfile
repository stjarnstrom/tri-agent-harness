# Optional jail for HARNESS_ISOLATION=docker / ./harness.sh --sandbox.
# Playwright browsers + OS deps so Evaluator/e2e can talk to localhost.
FROM mcr.microsoft.com/playwright:v1.55.0-noble

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    ca-certificates \
    unzip \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN npm install -g @anthropic-ai/claude-code

WORKDIR /workspace
