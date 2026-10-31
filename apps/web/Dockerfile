# Build context: repository root (see docker-compose.yml).
FROM node:24-alpine AS build
ENV HUSKY=0
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @gavel/web... --filter gavel \
 && pnpm -F @gavel/web build

FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 4200
