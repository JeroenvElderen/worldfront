FROM node:22-alpine
WORKDIR /app
COPY package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY exploration.mjs ./exploration.mjs
CMD ["node", "exploration.mjs"]
