# KubeSword — web mode (any browser)
# The server compiles to a single bundled file, so the runtime image
# needs no node_modules at all: just node + the two build outputs.
FROM node:22-alpine AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/server/dist ./server/dist
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
