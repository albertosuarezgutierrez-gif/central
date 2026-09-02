# Inventario de la ingesta de CIMA del CRM (repo `asegura`) — referencia para el port APARCADO

> Medido el 02/09/2026 sobre el repo `albertosuarezgutierrez-gif/asegura` (el CRM de Manuel, ya de Alberto).
> **Decisión de Alberto ese mismo día: el port a `apps/asegura` queda APARCADO** («fly es barato y ya está
> hecho, hay otras prioridades»). Este documento existe para que, el día que toque, no haya que volver a
> leer el repo entero. Contexto y plan en `docs/TRASPASO-CORREDURIA.md` («INGESTA DE CIMA EN CASA»).

## Cadena (lo que hay hoy, funcionando)

```
GitHub Actions (cron 05:30 y 11:30 UTC, repo asegura)
  → GET https://app.grupoasegura.com/api/crons/cima-pull   Bearer CRON_SECRET
    → POST asegura-app-cima-adapter.fly.dev/wse/recibir-ficheros-pendientes   (x-internal-token)
    → POST …/wse/confirmar-descarga                                            (solo tras commit)
      → JAR oficial de TIREA (SOAP WSE 2.17, WS-Security AES-256-GCM) → compañías
  → escribe en `seguros` de central (rol crm_seguros, search_path=seguros)
```

El adaptador Java hace base64-decode + unzip + XML→JSON. **La app TS no parsea XML** ni zip: recibe un
árbol JSON EIAC por fichero (`datos`) más `rawXml` (base del sha256 de dedupe) y `zipEntryCount`.

## Tamaño del código a portar (sin tests)

| Bloque | Líneas |
|---|---|
| `src/lib/integrations/cima/` (21 archivos) | 7.367 |
| Soporte fuera de esa carpeta (`crons/auth`, `pii-key-gate`, `safe-log`, `analytics/*`, `polizas/labels`, `clientes/pii`, `clientes/blind-index`, `crypto/field-encryption`, `db/index`) | 1.022 |
| `src/app/api/crons/cima-pull/route.ts` | 428 |
| **Subtotal portable** | **8.817** |
| `src/lib/ops/events.ts` (solo se usa un tipo) | 1.238 |
| `src/db/schema.ts` (Drizzle completo; ~14 tablas relevantes) | 3.262 |

Tests que cubren el grafo: **26 archivos, ~7.190 líneas**, runner `node:test` (portan tal cual). Los
mayores: `ingest-pipeline.test.ts` (1.368), `eiac-pol-mapper.test.ts` (1.016), `pull-persist.test.ts` (508).

## Qué es PURO y qué toca DB/red (para repartir el port)

- **Puros (portan sin tocar):** `wse-schemas.ts` (Zod v4, `z.looseObject`), `ingest-pipeline.ts` (1.522,
  orquestador por inyección de dependencias), los cuatro mappers EIAC (`eiac-pol/sin/rec/cef-mapper.ts`),
  los cuatro matchers (`poliza/siniestro/recibo/cef-matching.ts`), `ingest-flag.ts`, `pull-config.ts`,
  `pii-sanitizer.ts`, `config.ts`, `crons/auth.ts`, `pii-key-gate.ts`, cripto (`field-encryption`,
  `blind-index`, `clientes/pii`).
- **Red:** `client.ts` (fetch al adaptador, timeout por AbortController, sin retries), `posthog-server.ts`.
- **DB (Drizzle):** `pull-deps.ts` (685), `pull-persist.ts` (793), `persist-siniestro.ts`,
  `persist-recibo.ts`, `persist-cef.ts`, `pull-audit.ts`. Es la parte que habría que reescribir sobre
  Prisma (`lib/generated/asegura-client`) o traer Drizzle a `apps/asegura`.

## Tablas que escribe (todas en `db.transaction`, con `operational_events` en la MISMA tx)

`cima_ficheros` (ledger, dedupe por `nombre_fichero` y `xml_hash`), `clientes` (PII cifrada + blind index),
`polizas`, `poliza_coberturas` (delete+insert), `poliza_intervinientes` (delete+insert), `poliza_recibos`,
`siniestros` + `siniestro_contrarios/testigos/lesionados`, `cuenta_efectivo`, `liquidaciones` (delete+insert),
`liquidacion_movimientos`, `operational_events`.

## Variables de entorno (Vercel `asegura`)

`CIMA_ADAPTER_URL`, `CIMA_ADAPTER_INTERNAL_TOKEN`, `CIMA_ADAPTER_TIMEOUT_MS` (200.000 por defecto),
`CIMA_CODIGO_PLATAFORMA`, `CIMA_INGESTA_ENABLED` / `_SIN_ENABLED` / `_REC_ENABLED` / `_CEF_ENABLED`,
`CIMA_INGESTA_CORREDURIA_ID`, `CIMA_INGESTA_CODIGOS_ENTIDAD` (allowlist), `CIMA_PULL_BATCH_SIZE` (1-50),
`CRON_SECRET`, `PII_ENCRYPTION_KEY`, `PII_LOOKUP_KEY` (fail-closed: sin ellas → 503), `DATABASE_URL`,
`NEXT_PUBLIC_POSTHOG_KEY/HOST`. En GitHub Actions: `APP_BASE_URL`, `CRON_SECRET`, `SLACK_CIMA_ALERTS_WEBHOOK_URL`
(aviso Slack solo si está configurado; hoy no lo está).

## Contrato con el adaptador (lo único que un port tiene que respetar)

- Header `x-internal-token: <CIMA_ADAPTER_INTERNAL_TOKEN>` en todo.
- `POST /wse/recibir-ficheros-pendientes` `{codigoPlataforma, pagina}` → `{ok, parsed, raw}`; `parsed` =
  `{codigoRespuesta ("CIMA-200"), estadoProceso ("FN"), pagina, totalPaginas, totalResultados, ficheros[]}`;
  cada fichero: `nombreFicheroComprimido`, `codigoEntidad`, `tipoObjeto` (POL|SIN|REC|CEF|LIQ), `datos`,
  `rawXml`, `zipEntryCount`. **No consume la cola.**
- `POST /wse/confirmar-descarga` `{codigoPlataforma, codigoEntidad, nombreFicheroComprimido}` — los tres
  obligatorios (sin `codigoEntidad` el adaptador devuelve 400 y TIREA re-entrega). **Consume** el fichero;
  se llama solo tras el commit. Semántica en `docs/decisions/ADR-024-…` del repo `asegura`.
- `GET /health` sin auth.

## El adaptador Java (NO vive en ningún repo nuestro)

- App Fly `asegura-app-cima-adapter` (cuenta de Manuel; scale-to-zero). Repo **privado** de Manuel:
  `github.com/manuelsuarez/asegura-app-cima-adapter`. Dockerfile multi-stage con **JDK 8 sidecar** (Xerces
  en JDK 17 rompe validando las respuestas SOAP). Secrets de Fly: `INTERNAL_TOKEN`, `WSE_ENDPOINT`
  (`https://ws.cimaseg.es/wsEstandar/`), `WSE_USER`, `WSE_PASSWORD`, `WSE_PLATAFORMA`.
- Por qué Java y no TS: `docs/decisions/ADR-007-cima-adapter-java-sidecar.md` del repo `asegura`
  (WS-Security atípico, AES-256-GCM derivado del password; node-soap no lo soporta). **No reescribir.**
- Runbooks allí: `docs/runbooks/cima-adapter-fly-deploy.md`, `cima-tirea.md`, `cima-confirmar-descarga.md`.

## Si algún día se hace el port, el orden barato

1. Traer los PUROS y sus tests a `apps/asegura/lib/cima/` (o `packages/module-cima`): 0 riesgo, tests verdes.
2. Reescribir las 6 piezas de DB sobre Prisma contra `seguros` (es donde está el trabajo real, ~2.800 líneas).
3. Cron: endpoint en `apps/asegura` + `vercel.json` cron o el mismo workflow de Actions apuntando a central.
4. Apagar el CRM de Vercel y su workflow cuando un pull real escriba en `seguros` desde central.
