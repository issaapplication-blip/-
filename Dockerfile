FROM oven/bun:1.3.0

WORKDIR /app

# Install server dependencies. Do not use --frozen-lockfile here: package.json
# currently contains dependencies added after the committed lockfile was created.
COPY package.json bun.lock ./
RUN bun install

# The dedicated staging branch includes a restricted test harness; .dockerignore
# excludes local credentials and applicant document folders from the image.
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["bun", "src/index.ts"]
