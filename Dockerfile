FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8780
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor/langboard-app-panel-0.2.3.tgz vendor/langboard-app-server-0.1.6.tgz ./vendor/
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY server.mjs archive.mjs signals.mjs ./
COPY public ./public
USER node
EXPOSE 8780
CMD ["node", "server.mjs", "--publish-signals"]
