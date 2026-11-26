FROM node:20-alpine

RUN apk add --no-cache python3 make g++ cairo-dev pango-dev jpeg-dev giflib-dev

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .

RUN mkdir -p logs

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
