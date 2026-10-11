FROM oven/bun:1.3.0

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

# .dockerignore removes production pages, local uploads, archives, and secrets.
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV RAFIQ_AGENT_PROVIDER=gemini
ENV RAFIQ_GEMINI_MODEL=gemini-3.6-flash

EXPOSE 3000
CMD ["bun", "src/index.ts"]
