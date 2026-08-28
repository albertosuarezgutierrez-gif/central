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
| `pvilas/hospedajes` | 🚫 **GPLv3 + Python + muerto (may-2023, 1 mantenedor)** — NO se integra. Vale solo por sus `esquemas/3.0.0/` (7 XSD + WSDL del Ministerio), cuyos namespaces casan con nuestro `module-ses/src/soap.ts`. Sin sandbox SES (pre-ses da 502), validar contra XSD en local es el único preflight antes de apagar Chekin. ⚠️ Espejo de 2023, anterior al RD 933/2021 en vigor: pedir los vigentes al Ministerio | sivra / module-ses (referencia) | — (sin releases; último commit 12/05/2023) | 2026-08-28 |
| `zarpilla/verifactu-node-lib` | Librería JS/TS para VeriFactu (MIT). HOY inmadura (10 commits, sin releases, no firma ni envía a AEAT) — vigilar por si madura; referencia útil para `core-fiscal` | core-fiscal (ia-rest) | — (sin releases) | 2026-07-02 |

## Bitácora de hallazgos (lo más reciente arriba)

- **2026-08-28 (2ª pasada del día) — Paso 2 a mano, a petición de Alberto. 3 búsquedas, 1 hallazgo.**
  - 🔴 **`pvilas/hospedajes` — NO integrable, pero trae los ESQUEMAS OFICIALES que no tenemos.**
    ([repo](https://github.com/pvilas/hospedajes)) Criba: **GPLv3** (→ nunca copia-pega en nuestro SaaS
    privado) · **Python** (→ no corre en Vercel) · y **muerto**: último commit **12/05/2023**, 6 commits,
    **1 solo mantenedor**. Falla los dos filtros. **Lo que sí vale es su `soporte/esquemas/3.0.0/`**:
    los 7 `.xsd` + el `comunicacion.wsdl` del Ministerio, y sus `targetNamespace` **coinciden exactamente**
    con los que genera nuestro `packages/module-ses/src/soap.ts`
    (`soap.servicios.hospedajes.mir.es/comunicacion`, `neg.hospedajes.mir.es/*`) — o sea, misma generación
    de interfaz. Hoy **no tenemos NI UN `.xsd` ni `.wsdl` en el repo** (`git ls-files | grep xsd` → vacío).
    **Por qué importa ahora:** el pendiente vivo es apagar Chekin y emitir partes propios, y
    **no hay sandbox** (`hospedajes.pre-ses.mir.es` da 502 a todo). Validar nuestro XML contra el XSD en
    local es el ÚNICO preflight posible antes de disparar contra producción.
    **Vía de entrada: 4 (solo referencia)** — y ni siquiera del código: del esquema.
    ⚠️ **No copiar los XSD de este repo como fuente de verdad.** Son un espejo de 2023, anterior a la
    entrada en vigor del RD 933/2021 (dic-2024): usar un esquema viejo para validar es justo el fallo de
    «dato leído mal» de `CLAUDE.md` — daría verde sobre la especificación equivocada. Hay que **pedir los
    XSD vigentes al Ministerio** y usar este repo solo para saber qué ficheros pedir y cómo encajan.
    Sus CSV de municipios INE / códigos postales son de **2023** y valen lo mismo: pista, no dato.
    → **añadido a vigilados** como referencia (no como dep).
  - **Sin candidatos** en las otras dos búsquedas, y las dos son ausencia con fondo, no falta de mirar:
    - **EIAC/CIMA (seguros, `apps/asegura`)**: cero OSS. El estándar es de **TIREA** y se distribuye por
      su portal con alta previa; no hay parser público. Consecuencia para el traspaso de la correduría:
      **el parser de EIAC hay que escribirlo**, no hay atajo — contar con ello.
    - **Pricing dinámico de alquiler vacacional**: todo el ecosistema es **comercial** (PriceLabs, Beyond,
      Wheelhouse). Nada OSS que ataque el serrucho de SIVRA. Se resuelve en casa o no se resuelve.

- **2026-08-28 — La skill YA TIENE TRIGGER, y alcanza más de lo que creía.**
  - **Trigger creado** (`trig_017pe2NS4pzKXYhGPM6St7aZ`): mensual **día 15 ~07:04 CEST**
    (`0 5 15 * *` UTC), sesión nueva por disparo. Llevaba desde el 02/07 escrita pero
    **sin disparar nunca** — verificado contra la lista real de triggers (139 vivos, cero
    de `github-vigia`). O sea: sus dos únicas pasadas fueron a mano.
  - **Corregido el alcance sobre repos externos.** El aviso decía «usa la web y npm» dando
    por hecho que no había más. Medido hoy: **`git clone --depth 1` de un repo público ajeno
    FUNCIONA**, y `raw.githubusercontent.com` da 200. Sigue en 403 `curl` a `github.com` (usa
    WebFetch) y `api.github.com`. Consecuencia práctica: el Paso 2 puede **leerse el código**
    de un candidato para juzgar madurez (tests, nº de mantenedores, último commit) en vez de
    fiarse de la ficha y de las estrellas.
  - **Paso 2 reescrito con criba en dos filtros**: licencia+lenguaje ANTES que nada (AGPL →
    solo lectura; no-TS → servicio externo o referencia), y madurez leída del clon. Y cada
    candidato debe proponer **por cuál de las 4 vías entra** (dep npm · envoltorio en
    `packages/*` · servicio externo · solo referencia), no quedarse en «nos puede servir».
  - ⚠️ **El canal Telegram del trigger nace mudo**: el prompt lleva `PLATAFORMA_URL` pero
    `ALERTA_TOKEN` es un placeholder pendiente de que Alberto lo pegue (pendiente manual #3
    de `RUTINAS-PROGRAMADAS.md`). Hasta entonces la pasada corre igual y degrada por el push
    nativo + bitácora, según `docs/AVISOS-AGENTES.md`.

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
