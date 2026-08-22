# Vigía OSS — estado entre ejecuciones de `github-vigia`

> Lo mantiene la skill `github-vigia` (rutina mensual, día 15). Es su memoria: lista
> curada de repos vigilados con la última versión vista, y bitácora de hallazgos.
> Si añades un repo a mano, di POR QUÉ nos importa — sin eso la skill no puede juzgar relevancia.

## Repos vigilados

| Repo | Por qué nos importa | Vertical / pendiente | Última versión vista | Revisado |
|---|---|---|---|---|
| `VROOM-Project/vroom` | Motor de optimización de rutas (VRP): es el candidato para el «planificador automático» pendiente | transporte | v1.15.0 | 2026-07-02 |
| `Project-OSRM/osrm-backend` | Rutas por carretera sobre OSM: ETA real (hoy `etaMin` es línea recta), map-matching para km reales, geometría para el mapa Leaflet | transporte / module-geo | v26.7.1 (versionado CalVer nuevo; release 01/07/2026) | 2026-07-02 |
| `GIScience/openrouteservice` | API hosteada gratis (rutas + optimización VROOM + geocoding) — opción sin infra para validar ETA real y geocoding de paradas | transporte | v9.9.0 | 2026-07-02 |
| `Leaflet/Leaflet` | El mapa de `/(usuario)/mapa` (transporte) y el consolidado de plataforma cargan Leaflet por CDN | transporte / plataforma | 1.9.4 (npm) | 2026-07-02 |
| `traccar/traccar` | Nuestro endpoint de ingesta habla su protocolo (`osmand`/`traccar`); cambios de protocolo nos afectan | transporte / module-geo | v6.14.5 | 2026-07-02 |
| `web-push-libs/web-push` | Única dependencia npm propia de un core (`core-push`); CVEs o cambios VAPID nos tocan directo | core-push (ia-rest, ialimp) | 3.6.7 (npm) | 2026-07-02 |
| `dgunning/edgartools` | **MIT** y Python. Normaliza XBRL de EDGAR: mapea conceptos entre empresas, series por periodo y unidades. Es EXACTAMENTE el problema que nos mintió en el PR #1189 (ORCL: +3,49% de FCF yield contra −6,99% real). No se integra (somos TS en Vercel): se lee su tabla de alias/conceptos como REFERENCIA para `lib/trading/edgar.ts`. Mantenido por una sola persona | trading | — | 2026-08-22 |
| `OpenBB-finance/OpenBB` | Agregador Python de fuentes financieras. 🚫 **AGPLv3: copiar su código a nuestro SaaS privado obligaría a publicar el nuestro** — solo lectura, nunca copia-pega. Además no trae dataset propio (sigue haciendo falta nuestra API key de cada proveedor) y no tiene cliente JS/TS. Vale como catálogo de qué proveedor cubre qué | trading (referencia) | — | 2026-08-22 |
| `zarpilla/verifactu-node-lib` | Librería JS/TS para VeriFactu (MIT). HOY inmadura (10 commits, sin releases, no firma ni envía a AEAT) — vigilar por si madura; referencia útil para `core-fiscal` | core-fiscal (ia-rest) | — (sin releases) | 2026-07-02 |

## Bitácora de hallazgos (lo más reciente arriba)

- **2026-07-02 — PRIMERA PASADA de la skill (baseline de versiones fijada).**
  - **🔴 npm audit (--prod): 3 high + 5 moderate.** Ninguno tiene bump "pequeño y seguro"
    (todos cruzan major o requieren migración) → decisión de Alberto:
    - **`xlsx` ^0.18.5 (ialimp)** — 2 high ([proto pollution](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6), [ReDoS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)). SheetJS **abandonó npm**: no hay versión parcheada en el registro; el fix es migrar a su dist de `cdn.sheetjs.com` (≥0.20.2) o a `exceljs`. Riesgo real moderado (los Excel los sube la propia empresa, no terceros hostiles).
    - **`nodemailer` ^8.0.7 (rrhh)** — high ([SSRF/lectura de ficheros vía opción `raw`](https://github.com/advisories/GHSA-p6gq-j5cr-w38f)); parche solo en **9.0.1** (major 8→9). Explotable solo si un atacante controla las opciones del mensaje — en rrhh los correos los compone la app. Bump 8→9 probablemente trivial, pero es major → revisar changelog al hacerlo.
    - **`fast-xml-parser` ^4.5.0 (plataforma)** — moderate ([inyección](https://github.com/advisories/GHSA-gh4j-gqv2-49f6)); parche en **5.7.0** (major 4→5). Lo usa `lib/concursos-radar.ts` para parsear XML **externo** de PLACSP — superficie real aunque la fuente sea oficial. Candidato preferente cuando se toque concursos.
    - `uuid` moderate ×2, transitiva (vía `node-ical` en ialimp y `googleapis` en sivra) — se arregla solo al subir esas deps; sin prisa.
  - **Majors informativos sin CVE** (decisión de Alberto, sin urgencia): Next 15→16, Prisma 5→7, zod 3→4, TypeScript 5→6, jose 5→6, vitest 3→4, recharts 2→3, pdf-parse 1→2, jimp 0.22→1, node-ical 0.19→0.26.
  - **Descubrimiento — VeriFactu JS/TS**: [`zarpilla/verifactu-node-lib`](https://github.com/zarpilla/verifactu-node-lib) (MIT, temprano; genera factura+QR+encadenado pero NO firma ni envía) añadido a vigilados como referencia para `core-fiscal`; el maduro del ecosistema es [`mdiago/VeriFactu`](https://github.com/mdiago/VeriFactu) (C#, no nos sirve directo). Contexto: **VeriFactu es obligatorio para autónomos desde el 01/07/2026**.
  - **Descubrimiento — sin candidatos** en channel managers OSS de pisos turísticos (solo repos muertos; lo comercial ya lo cubrimos con Smoobu/iCal) ni en nóminas España OSS (solo calculadoras de referencia, nada de motor de nóminas production-ready).
  - **Releases**: VROOM sigue en v1.15.0 (sin cambios desde la línea base del 02/07). OSRM publicó v26.7.1 el 01/07 (cambio a versionado tipo CalVer; release de mantenimiento). Resto: baseline inicial, nada relevante para pendientes.
  - **⚠️ Landmine operativo aprendido**: en el entorno de rutinas, `api.github.com` está
    interceptado por el proxy (403 fuera del repo `central`) — consultar releases por la
    **página web** `github.com/<owner>/<repo>/releases/latest` (WebFetch) y versiones npm por
    `registry.npmjs.org/<pkg>/latest` (curl). Corregido en la skill en esta misma pasada.

- **2026-07-02** — (sesión manual, previa a la skill) Identificados VROOM / OSRM /
  openrouteservice como candidatos para el planificador automático y el ETA real de
  transporte. Recomendación vigente: empezar por openrouteservice u OSRM demo para
  ETA + geocoding (poco esfuerzo, mejora visible); VROOM autohospedado cuando el
  planificador sea producto con volumen.
