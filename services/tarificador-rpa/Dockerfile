# Worker del tarificador RPA (app Fly `asegura-tarificador`). Se construye desde la RAÍZ del monorepo
# (necesita packages/module-tarificacion): ver README.
# 🚨 La versión de la imagen y la de la dependencia `playwright` de package.json van JUNTAS (1.63.0):
#    la imagen trae los navegadores de ESA versión. Lo vigila test/regression-tarificador-rpa.test.ts.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app
COPY packages/module-tarificacion /app/packages/module-tarificacion
COPY services/tarificador-rpa/package.json services/tarificador-rpa/package-lock.json /app/services/tarificador-rpa/
WORKDIR /app/services/tarificador-rpa
RUN npm ci --omit=dev --no-audit --no-fund
COPY services/tarificador-rpa/tsconfig.json ./
COPY services/tarificador-rpa/src ./src

# Usuario sin privilegios que trae la imagen oficial.
USER pwuser
CMD ["node_modules/.bin/tsx", "src/runner.ts"]
