FROM node:22-alpine

# tzdata lets the TZ env var (set in docker-compose) resolve to a real zone so
# period-window math matches the dashboard; Alpine ships no zone data otherwise.
RUN apk add --no-cache tzdata

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./

EXPOSE 9876

CMD ["node", "server.js"]
