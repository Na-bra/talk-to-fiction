# Two stages so npm's cache and any dev dependencies stay out of the image
# that actually ships. The app has no build step — it runs the source directly.
FROM node:22-alpine AS deps
WORKDIR /app/server
# Copy manifests alone first: this layer is cached until a dependency changes,
# so editing source does not trigger a reinstall.
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/server

COPY --from=deps /app/server/node_modules ./node_modules
COPY server/ ./

# Drop root. The node user ships with the image and only needs read access.
USER node

EXPOSE 4000

# Hits the app's own health route. Uses node rather than wget or curl: node is
# the one binary this image is guaranteed to have, whatever the base changes to.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "src/index.js"]
