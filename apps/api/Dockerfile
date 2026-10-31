# Build context: repository root (see docker-compose.yml).
FROM node:24-alpine AS build
ENV HUSKY=0
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @gavel/api... --filter gavel \
 && pnpm -F @gavel/api build \
 && pnpm deploy --filter @gavel/api --prod --legacy /out \
 && cp -r packages/proto/gen /out/node_modules/@gavel/proto/

FROM node:24-alpine
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
WORKDIR /app
COPY --from=build /out .
EXPOSE 8080
USER node
CMD ["node", "dist/main.js"]
