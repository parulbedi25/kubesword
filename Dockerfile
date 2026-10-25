# KubeSword — web mode (any browser)
FROM node:22-alpine AS client-build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm install --workspace=@kubesword/client --no-audit --no-fund || npm install --prefix client --no-audit --no-fund
COPY client/ ./client/
RUN npm run build --workspace=@kubesword/client

FROM node:22-alpine AS server
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY server/package.json ./server/
RUN npm install --prefix server --omit=dev --no-audit --no-fund
COPY server/src ./server/dist-tmp
RUN mkdir -p server/dist && cp -r server/dist-tmp/* server/dist/ && rm -rf server/dist-tmp
COPY --from=client-build /app/client/dist ./client/dist
EXPOSE 3000
ENV PORT=3000 HOST=0.0.0.0
CMD ["node", "server/dist/index.js"]
