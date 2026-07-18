# Image de production — console admin (users/rôles/clients OAuth2), extraite
# d'auth_global le 2026-07-18 (Projects/app-admin/plan-phase-2-extraction-repo.md).
# Aucune BDD locale : proxy HTTP pur vers le serveur OAuth2 (auth_global).

# Stage 1 : build du front (Vite → dist/, cf. admin/front/vite.config.ts outDir).
FROM node:22-slim AS front-build
WORKDIR /app/admin/front
COPY admin/front/package.json ./
RUN npm install
COPY admin/front/ ./
RUN npm run build

# Stage 2 : dépendances composer (séparé du reste pour le cache Docker).
FROM composer:2 AS composer-build
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --no-interaction
COPY src/ ./src/
RUN composer dump-autoload --optimize --no-dev

FROM php:8.2-cli

RUN apt-get update && apt-get install -y --no-install-recommends libcurl4-openssl-dev \
    && docker-php-ext-install curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY admin/ ./admin/
COPY docker/ ./docker/
COPY keys/ ./keys/
COPY --from=composer-build /app/vendor ./vendor
COPY src/ ./src/
COPY --from=front-build /app/dist ./dist

EXPOSE 8015

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
    CMD php -r "exit(@file_get_contents('http://127.0.0.1:8015/') === false ? 1 : 0);"

CMD ["php", "-S", "0.0.0.0:8015", "docker/router.php"]
