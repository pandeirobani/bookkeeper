# 開発用のフロントエンド。ソースは docker-compose.yml で /app にマウントする
FROM node:24-bookworm-slim

WORKDIR /app

# node_modules はイメージ内の Linux 用のものを使う（docker-compose.yml で匿名ボリュームにする）
COPY package.json package-lock.json ./
RUN npm ci

EXPOSE 5173

# コンテナの外（ホストのブラウザ）から開けるよう、すべてのアドレスで待ち受ける
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
