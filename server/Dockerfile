FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV PORT=4173
ENV SPOKUM_DB=/data/spokum.db

EXPOSE 4173

CMD ["node", "src/index.js"]
