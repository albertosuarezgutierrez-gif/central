# Especificación OpenAPI de Codeoscopic / Avant2

- **Origen:** `https://portal.api-int.codeoscopic.io/static/15e136e2.yaml` (OpenAPI 3.0.3, 110 paths, 130 operaciones,
  397 schemas). El hash del nombre cambia en cada despliegue del portal. Entorno INT (documentación, no producción).
- **Fecha:** 04/11/2026. Texto del overview: `overview-2026-11-04.md` (`/refs/overview.md` del portal).
- **Cómo se descargó:** el portal es una SPA; `curl` de `/` da el HTML con `<script src="/static/a30e6ccc.js">`, y ese
  bundle contiene la ruta `"/static/15e136e2.yaml"`. Se baja con `curl -sS` (sin credenciales; es documentación pública).
- **Regenerar:** `curl -sS https://portal.api-int.codeoscopic.io/ | grep -o 'src="/static/[^"]*\.js"'`, bajar ese .js,
  `grep -o '/static/[0-9a-f]*\.yaml'`, bajar el yaml y `/refs/overview.md`. Comparar con `diff` contra este fichero.
- **Saneado:** se sustituyeron dos datos personales de un ejemplo de `/sales-agents` (email, NIF, nombre y teléfonos) por
  `agente@example.com` y `00000000T`. El resto son ejemplos del fabricante (incluido un `token` de ejemplo de
  `/app-auth-tokens`, ficticio). No contiene credenciales nuestras.
- NUNCA llamar a los endpoints de la API desde el portal ni desde aquí: facturan. Análisis en
  `docs/CODEOSCOPIC-API-PORTAL.md` y `docs/AVANT2-CONFIGURACION.md`.
- Nota: el token de ejemplo de `AppAuthToken_V1` se sustituyó por `EJEMPLO_TOKEN_REDACTADO` (era un ejemplo público de la doc; evita falsos positivos de secret scanning).
