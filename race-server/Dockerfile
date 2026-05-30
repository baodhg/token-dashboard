FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

# Data directory for users.json persistence
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3001

ENV PORT=3001
ENV ALLOWED_ORIGINS=*
ENV DATA_DIR=/app/data

CMD ["node", "server.js"]
