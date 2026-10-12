ARG NODE_IMAGE=public.ecr.aws/docker/library/node@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
FROM ${NODE_IMAGE}
USER root
RUN apt-get update && apt-get install -y --no-install-recommends git ripgrep && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/jetree-code
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force
COPY gateway.mjs engine.mjs ./
# OpenCode's dynamic provider installer uses its cache. Ship the pinned provider
# there so inference never needs npm/network access from the sandbox.
RUN mkdir -p /home/node/.cache/opencode/bin /home/node/.cache/opencode/packages/@ai-sdk/openai-compatible@3.0.67 && cp package.json package-lock.json /home/node/.cache/opencode/packages/@ai-sdk/openai-compatible@3.0.67/ && cp -a node_modules /home/node/.cache/opencode/packages/@ai-sdk/openai-compatible@3.0.67/ && chown -R node:node /home/node/.cache
ENV PATH=/opt/jetree-code/node_modules/.bin:$PATH
ENV OPENCODE_DISABLE_AUTOUPDATE=true OPENCODE_DISABLE_LSP_DOWNLOAD=true
USER node
WORKDIR /workspace
CMD ["node", "/opt/jetree-code/engine.mjs"]
