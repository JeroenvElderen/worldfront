FROM node:22-alpine
WORKDIR /app
COPY worker/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY worker/exploration.mjs ./exploration.mjs
CMD ["node", "exploration.mjs"]
