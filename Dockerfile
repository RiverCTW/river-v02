FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 8792
CMD ["pnpm", "start"]
