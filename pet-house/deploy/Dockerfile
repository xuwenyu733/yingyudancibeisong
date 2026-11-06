FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node backend/server ./server
COPY --chown=node:node backend/database.html backend/mysql.docker.json ./
COPY --chown=node:node source-connected /app/source-connected
USER node
EXPOSE 8899
CMD ["sh", "-c", "node server/seed.mjs && exec node server/server.mjs"]
