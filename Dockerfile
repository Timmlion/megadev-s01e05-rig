# The agents that wake alone run here: one container, no durable state.
FROM node:22-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY . .

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

CMD ["pnpm", "start"]
