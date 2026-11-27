FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install only what the server needs. The MediaPipe runtime and pose model are
# already committed under client/, so the postinstall download is skipped.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

COPY server ./server
COPY client ./client

# Listen on all interfaces inside the container (127.0.0.1 would be unreachable).
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
