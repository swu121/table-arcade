FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
# seed.js, staff-add.js and admin-hash.js all run over `fly ssh console`, and
# a venue's first staff account is only reachable that way.
COPY scripts ./scripts
COPY docs/venues.example.json ./docs/venues.example.json
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "server/index.js"]
