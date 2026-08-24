# CLAUDE.md — Central (casa de marcas)

> **Este repo se llama provisionalmente `central`** (repo GitHub aún `ia.rest` hasta renombrar).
> Es la RAÍZ del monorepo, no una vertical. No contiene lógica de producto.
> Lee **`MATRIZ.md`** para la estructura (raíz = central, `packages/*` = módulos compartidos,
> `apps/*` = verticales) y `docs/CONTEXTO-SESIONES.md` para el estado vivo del proyecto.

## Verticales (cada una con su propio CLAUDE.md/AGENTS.md y proyecto Vercel)
- **`apps/ia-rest`** — Voice POS / hostelería (`iarest.es`). Consume `packages/core-ai` y
  `packages/core-fiscal` vía `file:` deps. Ver `apps/ia-rest/CLAUDE.md`.
- **`apps/sivra`** — web pública de pisos turísticos (`housesevillana.es`). La gestión interna
  (finanzas, pricing, mensajería) vive en `apps/plataforma` (`/sivra/*`); NO borrar la app. Ver `apps/sivra/CLAUDE.md`.
- **`apps/ialimp`** — SaaS de limpiezas (`app.ialimp.es`). Ver `apps/ialimp/CLAUDE.md`.
- **`apps/plataforma`** — cuadro de mando consolidado (HITO 2). Jerarquía `Cuenta → Sociedad → Negocio`.
  BD compartida con sivra+ialimp. Ver `apps/plataforma/CLAUDE.md`.
- **`apps/rrhh`** — **iarrhh**, Portal del Empleado (RR.HH. multi-tenant; `central-rrhh.vercel.app`). Schema
  `rrhh` en la Supabase compartida (rol `rrhh_app`, BYPASSRLS). Alta de empresas desde el god-panel de
  plataforma por puerto HTTP (`/api/operador/empresas`, Bearer `RRHH_OPERADOR_SECRET`).
- **`apps/transporte`** — Flota/transporte como negocio (camiones, portes a clientes). Compone
  `@central/module-flota` + `@central/module-transporte`. BD compartida (rol `prisma_transporte`).
  GPS en vivo (`module-geo`), ingesta hardware (OsmAnd/Traccar/genérico). Ver `apps/transporte/CLAUDE.md`.
- **`apps/alquiler`** — Alquiler de materiales/menaje (interno al grupo + a terceros). Compone
  `@central/module-alquiler`. BD compartida (rol `prisma_alquiler`). Desplegada y probada. Ver `apps/alquiler/CLAUDE.md`.
- **`apps/housesevillana`** — **landing pública** de House Sevillana (`housesevillana.es`; 6 dorm/12 personas,
  parking, centro de Sevilla). **Dirección: Calle Socorro 24, 41003 Sevilla, barrio de San Julián**
  (distrito Casco Antiguo; la calle va de la Plaza de San Román a la de San Marcos). ⚠️ **NO confundir
  con Bustos Tavera 22**, que son OTROS dos pisos del grupo (Luxury Busto y Busto Reform, bajo dcha/izda,
  alquilados a Gutiérrez Alcalá). La skill sincronizada `seo-house-sevillana` tiene esa confusión en su
  ficha y en sus JSON-LD; vive FUERA del repo, así que la corrección es de Alberto (confirmado 19/08/2026). Next.js mínimo servido por rutas `edge` (`app/route.ts` devuelve el HTML entero); **`/en` y `/it` se DERIVAN de ese mismo HTML por diccionario de cadenas exactas**, así que tocar un texto español rompe su traducción — ver `apps/housesevillana/CLAUDE.md`.
  **Unificada en el monorepo el 12/08/2026** desde el repo suelto `house-sevillana-landing` — vivía fuera y por eso
  era invisible al leer `apps/sivra`, lo que llevó a afirmar por error que «no había web» (PR #1387→#1388). Se
  importó **SIN su historia git a propósito**: esa historia contenía una `service_role` de Supabase (ver
  `docs/CONTEXTO-SESIONES.md`, 12/08/2026). La reescribe sola el agente SEO de `apps/sivra` (`/api/seo-refresh`,
  lunes) por la GitHub Contents API — ver `apps/sivra/lib/seo-landing.ts`. Es **el canal directo**: motor de
  reservas, WhatsApp de grupos y teléfono.
- **`apps/almacen`** — gestión de almacén de eventos/catering para el cliente **Joaquín Jaén** (Fase 1: maestro
  por familias/materiales; orquestación de evento completa en curso). Compone `@central/module-materiales`
  (dep `workspace:*`, no `file:`). BD compartida (rol propio pendiente de confirmar). Desplegada 15/07/2026
  (Vercel `almacen`, tenant DEMO poblado; tenant real de Joaquín aún sin sembrar). **Aún sin `apps/almacen/CLAUDE.md`
  propio** — ver `docs/CONTEXTO-SESIONES.md` (entrada 15/07/2026) y `docs/ALMACEN-JJ-reunion-y-auditoria.md`
  mientras tanto.
- **`apps/mariscos`** — **Mariscos González**: trazabilidad pesquera + etiquetado por peso (mayorista/pescadería
  de marisco; Fase 1, PR #1055, 11/08/2026). Recepción de partidas (albarán, lote de origen), envasado que
  CONSERVA el lote, etiqueta por canal (con/sin lote). Compone `@central/module-pesca`. BD compartida (auth
  propio, cookie `mariscos_session`). Ver `apps/mariscos/CLAUDE.md`. **Pendiente para darla por viva:** proyecto
  Vercel, ejecutar su SQL en Supabase (preview→prod), sembrar cuenta real de Mariscos González.

## Módulos compartidos (`packages/*`, fuente TS pura, portables)
> **Scope npm = `@central/*`** (renombrado desde `@iarest/*` el 11/06/2026, antes de tener clientes).
- `@central/core-ai`, `@central/core-fiscal`, `@central/core-push`, `@central/core-storage`, `@central/core-email`, `@central/core-identity`, `@central/core-telegram`.
- `@central/brand` — **capa de marca por cliente/tenant** (casa de marcas). Contrato `Marca { paleta, tipografia, logos, radio }`
  + `emitirRootCss(marca)` que la app inyecta en el `<head>` para sobreescribir los tokens de `globals.css` sin reescribir CSS
  (`--brand` = color dominante/identidad, `--accent` = decorativo). Cada cliente = un `src/marcas/<cliente>.ts` con sus hex/fuentes/logo
  EXACTOS. Piloto vivo: `apps/almacen` con `MARCA_JOAQUIN_JAEN`. Para dar de alta una marca nueva usa la skill **`marca-cliente`**
  (extrae paleta del propio logo, tipografía por Adobe Fonts, verifica con Playwright). No pongas colores a ojo si el logo los da exactos.
  - `core-push` (Web Push, envoltura pura sobre `web-push`) es el **primer núcleo con
    dependencia npm propia** — funciona porque pnpm symlinkea las deps de cada paquete
    (el enfoque `file:` deps no las resolvía en Vercel). Lo consumen `ia-rest` e `ialimp`.
  - `core-telegram` (bot único del monorepo — `tgSend`/`tgSendButtons`/`tgEditMessage`/
    `tgAnswerCallback`/`tgAskForReply`/`parseCallback`/`verifyTelegramWebhook`). Un solo
    bot para todas las verticales; el enrutado es por prefijo de `callback_data`
    (`hsp_` = agente huéspedes SIVRA). Envs: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
    `TELEGRAM_WEBHOOK_SECRET`. Consumido por `apps/plataforma`.

## Memoria entre sesiones (entorno efímero)
El contenedor cloud se borra al acabar la sesión: lo único que persiste es lo commiteado.
Al terminar, actualiza `docs/CONTEXTO-SESIONES.md` (entrada nueva arriba, **máx ~8 líneas**,
fecha `(dd/mm/aaaa)` en la primera línea — el detalle vive en el PR, no aquí). El hook `Stop`
(`.claude/hooks/persist-memoria.sh`) lo commitea y empuja. El archivo vivo solo guarda el mes
corriente; los meses cerrados se rotan a `docs/memoria/AAAA-MM.md` (`scripts/rotar-memoria.mjs`,
lo dispara la auditoría a primeros de mes). Historia antigua → leer `docs/memoria/`.

Salvaguardas para no perder información:
- **Guardián de cierre** (`persist-memoria.sh`): si la sesión hizo commits que tocan algo
  distinto de la memoria pero NO anotó `CONTEXTO-SESIONES.md`, el hook `Stop` bloquea UNA
  vez y pide anotarlo antes de cerrar. (Se apoya en el SHA base que graba
  `.claude/hooks/memoria-record-base.sh` al arrancar.)
- **Hook `PreCompact`** (`.claude/hooks/memoria-precompact.sh`): en sesiones largas,
  recuerda volcar el estado clave a la memoria ANTES de compactar (el resumen pierde detalle).
- **Auditoría programada** (`/auditoria-diaria`): red de seguridad nocturna que reconcilia
  memoria/skills/docs contra el código real. **Dos carriles:** los arreglos de texto se
  **auto-aplican a `main`** (bitácora en `docs/AUTO-APLICADOS.md`); lo "raro" (código/infra/
  crons mudos) → **PR draft + aviso Telegram** con link al PR. Mapa doc→código para la frescura
  en `docs/FUENTES-DE-VERDAD.md`. Cadencias y setup del trigger en `docs/RUTINAS-PROGRAMADAS.md`.
  Índice de skills en `docs/SKILLS.md`.
- **Entrenador de agentes** (`/agentes-entrenador`, semanal): mejora los prompts de los
  agentes programados por **rendimiento** (auto-informes en `docs/AGENTES-BITACORA.md`,
  feedback de Alberto en `docs/FEEDBACK-AGENTES.md`, PRs de la semana, BD) y calidad
  transversal. Cambios de comportamiento SIEMPRE por PR draft + Telegram; **nunca se
  auto-modifica**. La frescura factual sigue siendo de la auditoría.
- **Límite conocido:** una sesión de **solo charla** (decisión importante pero sin commit)
  no dispara el guardián — no hay "trabajo" detectable. Si una conversación produce una
  decisión, anótala a mano en `CONTEXTO-SESIONES.md`.

## Estilo de respuesta — regla global permanente
**Responde de forma sintética y directa.** Ve al grano: da el resultado o la respuesta primero, sin resúmenes largos, sin repetir el contexto que Alberto ya conoce, sin recapitular lo que acabas de hacer. Nada de listas exhaustivas de opciones que no vas a seguir ni de narrar cada paso. Si hace falta explicar un porqué, hazlo en una o dos frases. Extiéndete SOLO cuando Alberto lo pida explícitamente ("dame el detalle", "explícame", etc.). Esto NO aplica al código, comentarios ni mensajes de commit/PR (esos siguen sus propias reglas).

## Comunicaciones salientes — regla global permanente
**NUNCA enviar correos, mensajes ni ninguna comunicación a terceros (email a la asesoría, a clientes,
a quien sea) sin autorización explícita de Alberto para ESE envío concreto.** Que Alberto pida que un
tercero "vea" o "sepa" algo NO autoriza a enviárselo: por defecto se prepara un **borrador** o se le
presenta a Alberto el texto/análisis y decide él si se envía. (Dictado 15/08/2026, tras enviarse un
email a Asecon sin permiso.) No afecta a los avisos automáticos ya existentes dirigidos al propio
Alberto (Telegram del monorepo, crons).

## Dato que NO hay ≠ dato que NO se ha mirado — regla global permanente
**Nunca afirmes una ausencia con un dato que todavía no se ha comprobado.** En este monorepo casi
todas las pantallas viven sobre columnas de **enriquecimiento asíncrono** (las rellena un cron, un
agente o un servicio externo: Catastro, BOE, Gmail, Drive, Smoobu, banca PSD2, IA, portales
inmobiliarios…). En esas columnas **`NULL` significa «todavía no se sabe»**, y el corpus SIEMPRE es
más viejo que la columna: el día que se añade, TODAS las filas la tienen a NULL.

Colapsar ese NULL con `?? []`, `?? 0`, `|| 0`, `?? false` o `COALESCE(x,0)` y luego pintarlo como
«sin documentos adjuntos», «no hay facturas pendientes», «0 €», «sin incidencias» o un semáforo 🟢
convierte un «no lo sé» en una afirmación falsa — y son justo las afirmaciones sobre las que Alberto
decide. Caso fundacional (30/07/2026, PR #1180): la ficha de una subasta decía «sin documentos
adjuntos» mientras el BOE publicaba su edicto Y su certificación de cargas; 8 de las 11 subastas
vivas mentían igual.

Qué hacer:
- **Tres estados, no dos:** `null` = «sin revisar / pendiente» · `[]`/`0` = «revisado, no hay» ·
  con contenido = el dato. La UI debe poder decir las tres cosas, y el estado «pendiente» dice al
  usuario dónde mirar mientras tanto (la ficha oficial, el portal del banco…).
- **Ante la duda, el estado conservador**, nunca el que tranquiliza: un semáforo se pone 🟠/«no
  publicado» cuando falta el dato, jamás 🟢. `cargasConocidas: f.cargas_conocidas ?? false` de
  `lib/subastas-radar.ts` es el patrón correcto (NULL → «cargas no publicadas», que pide la
  certificación).
- **Si la fuente NUNCA va a traer ese dato** (p. ej. los lotes de la Junta no tienen ficha con
  adjuntos), dilo como ausencia definitiva y no como «pendiente»: prometer una pasada que no va a
  llegar es la otra forma de mentir. Patrón: el flag `publicaAdjuntos` de `lib/subastas/resumen-docs.ts`.
- **Un `catch` que devuelve `[]`/`{total:0}` no autoriza a afirmar que no hay nada** aguas abajo:
  un fallo de red o de sincronización debe degradar visiblemente, no aparecer como «todo en orden».
  Vale doble para health-checks, alertas y avisos de Telegram: un check que se pone verde porque la
  consulta no devolvió nada es el fallo más caro que hay.
- La lógica del titular va en un **helper puro y testeado** (referencia:
  `apps/plataforma/lib/subastas/resumen-docs.ts` + su `.test.ts`), no incrustada en el JSX.

**Hermano de esta regla: el dato que SÍ está pero se lee mal.** Un `NULL` colapsado a 0 y un dato
leído del año o de la divisa equivocados producen la misma mentira, y el segundo es peor porque **no
hay hueco que delate el fallo**: sale un número plausible. Caso fundacional (31/07/2026, PR #1189):
el radar de trading daba a ORCL un flujo de caja libre de **+3,49%** cuando la empresa quemaba
**−23.700 M$ (−6,99%)** — los campos `fy`/`fp` de la SEC identifican el INFORME, no el periodo del
dato, y encima se mezclaban divisas (yenes contra una capitalización en dólares). Al parsear una
fuente externa: **la clave de un dato es su periodo y su unidad, no la etiqueta del documento que lo
publica**; ante varias unidades/monedas, elige UNA explícitamente y propágala; y valida el parser
**contra un documento real de la fuente**, no solo contra fixtures — los fixtures se escriben con la
misma suposición equivocada que el código y por eso los tests pasaban.

**Tercer hermano: el «no lo sé» DISFRAZADO DE VALOR.** `NULL` al menos se ve; un valor centinela
—`'otro'`, `'desconocido'`, `'N/A'`, `'sin clasificar'`— es un «no lo he sabido leer» vestido de dato,
y por eso **se cuela por todas las guardas basadas en NULL** (`COALESCE`, `IS NULL`, `??`). Caso
fundacional (05/08/2026, PRs #1266→#1268): al re-derivar `subastas.tipo_bien` de la descripción, las
fichas cuyo texto persistido es un marcador («DESCRIPCIÓN QUE CONSTA EN LA CERTIFICACIÓN DE CARGAS…»)
devolvían `'otro'`, y ese `'otro'` **pisó** el `'vivienda'` que venía de una fuente mejor. El
`COALESCE(nuevo, viejo)` no protegía nada porque el nuevo no era NULL: era basura con forma de dato.
Qué hacer: cuando un extractor tenga un valor de «cajón», **anúlalo explícitamente antes de escribir**
(`COALESCE(NULLIF(nuevo,'otro'), viejo)`) y trátalo como NULL en toda guarda. Y la lección de método
que lo destapó: antes de decidir que una columna **se puede re-derivar**, no basta con buscar *quién la
escribe* — hay que mirar **de dónde sale el valor en cada escritura**; aquí la fuente rica vivía en un
campo intermedio (`s.datos` de la ingesta) que aguas abajo ya no existía.

Al añadir una columna de enriquecimiento nueva, esto es parte del PR, no un apaño posterior. Si un
cambio toca una pantalla que ya viola la regla, corrígela en el mismo PR.

## Responsive — regla global permanente
**Toda UI nueva o modificada en CUALQUIER vertical o app del monorepo DEBE funcionar en móvil.** Revisar en pantallas ≥320 px antes de dar un cambio por hecho. Tablas → scroll horizontal o cards apiladas; sidebars → colapsables o drawer; modales → ancho al 95 vw; botones → mínimo 44 px táctil. No basta con que "quepa" — tiene que ser usable. Si un cambio toca un componente con problemas responsive conocidos, aprovecha para corregirlos en el mismo PR.

## Rendimiento UI — regla global permanente
**Ninguna página monta cientos/miles de filas de golpe.** Las listas largas (movimientos bancarios, reservas, logs…) usan: desplegables **cerrados por defecto con montaje perezoso** (el contenido solo se renderiza al abrir — OJO: un `<details>` cerrado igualmente crea todo su DOM), **paginación client-side** (~50 filas + «Ver más»), y auto-apertura cuando hay filtros activos. Las recargas tras una acción mantienen la lista visible (atenuada), sin loader a pantalla completa que desmonte todo. Patrón de referencia: `apps/plataforma/app/(usuario)/finanzas/GastosTab.tsx` (PR #666). Si un cambio toca una página que viola esta regla, aprovecha para corregirla en el mismo PR.

## Formato de dinero — regla global permanente
**Todo importe en euros se muestra en formato ESPAÑOL: `2.162,49€`** — separador de miles con punto (también
en 4 cifras: `2.000,12€`), decimales con coma, y el **€ DETRÁS** del número. NUNCA estilo dólar (`€2162.49`,
`$2,162.49`). En `apps/plataforma` usa el helper `eur()` de `apps/plataforma/lib/dinero.ts`
(`n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })` + `€`);
aplica igual en pantalla, Telegram y emails. Nada de `€${x.toFixed(2)}` suelto. Las verticales sin ese helper
replican la misma convención. Si un cambio toca una pantalla con importes mal formateados, corrígelos en el mismo PR.

## Reglas de la matriz
- Toda **vertical nueva** entra como `apps/<app>` con su `package.json`/`vercel.json` y un
  proyecto Vercel con **Root Directory `apps/<app>`** + install
  `npx --yes pnpm@10.33.0 install --no-frozen-lockfile` (todas las apps ya usan este comando,
  ver `apps/*/vercel.json`).
- **🚨 OBLIGATORIO en CADA `apps/<app>/vercel.json` (nuevo o existente): la clave
  `"ignoreCommand": "node ../../scripts/vercel-ignore-build.mjs apps/<app>"`.** Sin ella, como todos
  los proyectos Vercel cuelgan del MISMO repo, **cada push reconstruye TODOS los proyectos** aunque el
  commit no toque esa app → la factura de Build CPU Minutes se dispara (incidente 15/07/2026: ~600 US$
  en un mes, PR #904). El script (`scripts/vercel-ignore-build.mjs`) salta el build salvo que el commit
  toque `apps/<app>/`, **un `packages/*` que ESA app declare** (cierre transitivo de sus deps
  `@central/*`, desde 13/08/2026 — antes bastaba con tocar cualquier `packages/*` y eso reconstruía
  las ~10 apps aunque no lo consumieran) o los manifiestos raíz; los commits con marcador de salto de CI en
  el asunto nunca construyen; fail-open ante dudas. **Al crear una app nueva, añade esta clave y punto**
  (y también su alerta de gasto ya está puesta a nivel de equipo Vercel: Spend Management $50, solo aviso).
  - **`--sin-previews` (desde 24/08/2026): todas las apps SALVO ialimp lo llevan en su `ignoreCommand`** —
    los builds de preview de las ramas de PR eran ~la mitad de los Build CPU Minutes que quedaban
    (factura 14 jul–13 ago: 32.708 min ≈ 92,51 US$ de 117 US$) y no los mira nadie: los agentes verifican
    con tsc/tests y mergean en minutos. Con el flag solo construye `main` (producción). Para forzar una
    preview concreta (verificar UI en Vercel antes de mergear), pon **`[preview]` en el ASUNTO del commit**.
    ialimp NO lo lleva a propósito: cliente vivo (Sique Brilla) → ahí sigue la regla «preview verde antes de main».
- **NUNCA** poner `apps/` en el `.vercelignore` de la raíz (se aplica a todos los proyectos del
  repo y borraría la carpeta del build por-app → el proyecto caería a construir la raíz).
- Los módulos compartidos viven en `packages/*` (portables, sin acoplarse a una vertical); las
  apps los consumen con `file:` deps (build aislado por Root Directory, sin pnpm/turbo).
- **Secretos de auth (que FIRMAN o VALIDAN sesiones/tokens): NUNCA fallback a un literal.** El
  patrón `process.env.X_SECRET || 'algo'` deja una credencial usable en el repo. Usa
  `requireSecret()` de `@central/core-identity` (o la guarda `env || (NODE_ENV==='production' ? throw : 'dev')`).
  Lo obliga el guardián `test/regression-secrets.test.ts` (gate en `pnpm test:guardia`). Las API keys
  de servicios externos pueden caer a `|| ''` (un valor inválido solo hace fallar la llamada saliente).

## ⏳ Principio: los cambios que ROMPEN se hacen AHORA (sin clientes)
Renombrados de scope, reestructuras de BD, cortes de infraestructura y demás cambios de gran radio
**se ejecutan mientras NO hay clientes en producción.** Con clientes vivos estos cambios pasan de ser
"un PR mecánico" a ser un riesgo serio (downtime, migraciones de datos, ventanas de mantenimiento).
Decisión de Alberto (11/06/2026), aplicada al rename `@iarest/*`→`@central/*`. Si un cambio así está
pendiente y el árbol está limpio-ish, es mejor hacerlo ya que diferirlo.
