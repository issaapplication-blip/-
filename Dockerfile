FROM oven/bun:1.3.10-slim

WORKDIR /app

# Copy the manifest and lockfile together so Docker installs the exact locked dependencies.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY . .

ENV PORT=7860
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV RAFIQ_TELEGRAM_AUTO_REGISTER_WEBHOOK=false
ENV TELEGRAM_MARKETING_ENABLED=false
ENV TELEGRAM_BROADCAST_ON_START=false

EXPOSE 7860

CMD ["bun", "run", "src/index.ts"]
