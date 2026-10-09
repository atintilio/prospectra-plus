FROM node:22-alpine
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY gateway.mjs ./
CMD ["node", "gateway.mjs"]
