FROM node:24.14.0-bookworm-slim

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates git python3 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@11.16.0 \
    && npm cache clean --force \
    && mkdir -p /workspace/node_modules /home/node/.local/share/pnpm/store \
    && chown -R node:node /workspace /home/node/.local/share/pnpm

WORKDIR /workspace
USER node
