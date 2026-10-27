# Production image for Google Cloud Run.
#
#   Stage 1 (build): converts the WordPress export (documents/*.xml) to JSON and
#                    prerenders every page of the Angular app to static HTML.
#   Stage 2 (runtime): unprivileged nginx serving the static site on $PORT (8080).
#
# docker build -t women-parliament --build-arg SITE_URL=https://womenparliament.org .
# docker run --rm -p 8080:8080 women-parliament

ARG NODE_VERSION=24
ARG NGINX_VERSION=1.30

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS build

WORKDIR /app
ENV CI=true \
    NG_CLI_ANALYTICS=false \
    NG_FORCE_TTY=false \
    npm_config_fund=false \
    npm_config_audit=false

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Public base URL (canonical links, sitemap) and the optional contact form endpoint
ARG SITE_URL=https://womenparliament.org
ARG CONTACT_FORM_ENDPOINT=
ENV SITE_URL=${SITE_URL} \
    CONTACT_FORM_ENDPOINT=${CONTACT_FORM_ENDPOINT}

RUN npm run build \
 && find dist/women-parliament/browser -type f \
      \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.json' -o -name '*.xml' -o -name '*.txt' -o -name '*.svg' \) \
      -size +1k -exec gzip -9 -k -n {} +

# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}-alpine AS runtime

LABEL org.opencontainers.image.title="women-parliament" \
      org.opencontainers.image.description="פרלמנט נשים - Angular static site served by nginx"

# Cloud Run sends traffic to $PORT; the nginx entrypoint renders templates with envsubst
ENV PORT=8080 \
    NGINX_ENVSUBST_FILTER=^PORT$

COPY docker/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/docker/nginx/wp-redirects.conf /etc/nginx/conf.d/wp-redirects.conf
COPY --from=build /app/dist/women-parliament/browser /usr/share/nginx/html

USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/health" || exit 1
