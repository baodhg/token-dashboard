FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

EXPOSE 3001

ENV PORT=3001
ENV ALLOWED_ORIGINS=*

CMD ["node", "server.js"]
