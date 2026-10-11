FROM oven/bun:1.3.0

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

# The production site and public assets are intentionally included.
# .dockerignore removes local secrets, applicant files, archives, and uploads.
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV RAFIQ_AGENT_PROVIDER=gemini
ENV RAFIQ_GEMINI_MODEL=gemini-3.6-flash

# Safe default channel policy: inbound WhatsApp only; manager replies manually.
ENV KAPSO_ENABLED=false
ENV WHATSAPP_SENDING_ENABLED=false
ENV RAFIQ_WHATSAPP_AUTO_REPLY=false
ENV RAFIQ_WHATSAPP_TO_TELEGRAM_FORWARDING=true
ENV TELEGRAM_BROADCAST_ON_START=false

EXPOSE 3000
CMD ["bun", "src/index.ts"]
