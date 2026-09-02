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
  alquilados a Gutiérrez Alcalá). La skill `seo-house-sevillana` arrastraba esa confusión
  en su ficha y en sus dos JSON-LD; **se trajo al repo el 26/08/2026** (`.claude/skills/seo-house-sevillana/`,
  que tiene precedencia sobre la copia sincronizada del mismo nombre) ya corregida, y la protege
  `test/regression-house-sevillana-direccion.test.ts` (confirmado 19/08/2026). Next.js mínimo servido por rutas `edge` (`app/route.ts` devuelve el HTML entero); **`/en` y `/it` se DERIVAN de ese mismo HTML por diccionario de cadenas exactas**, así que tocar un texto español rompe su traducción — ver `apps/housesevillana/CLAUDE.md`.
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
- **`apps/asegura`** — **Grupo Asegura**: correduría de seguros (nombre comercial de Alberto).
  🖥️ **NO es una pantalla: es la trastienda.** Alberto trabaja la correduría desde
  `apps/plataforma` → `/correduria` (su única pantalla, con todos sus negocios); asegura tiene la BD de
  la cartera, la sirve por el puerto `/api/operador/*` y es la única que gasta dinero al retarificar.
  Una pantalla nueva de la correduría se monta en `plataforma`, no aquí (dictado 01/09/2026).
  **Esqueleto desde el 26/08/2026** — auth propia (cookie `asegura_session` + `jose` contra `public.cuentas`), layout y
  manifiestos; schema **propio `seguros`** + rol `prisma_seguros` (creado, `BYPASSRLS`, **sin contraseña**).
  🚨 **Y OJO CON LA CIFRA (medido 01/09/2026): 32.600 fichas ≠ 32.600 clientes.** La **cartera VIVA son
  ~80 clientes / 109 pólizas** — las que entran por CIMA, identificables por `polizas.import_ref IS NULL`.
  Las otras 28.729 pólizas son **volcado histórico** (`import_ref` `intranet:` y `asegura_app:`, cargado en
  jun/2026, vencimientos 2013-2018) y **ninguna** tiene vencimiento en los últimos 18 meses. Regla de Alberto:
  **lo que entra por CIMA es cliente actual; el resto son leads** (32.520). Detalle en
  `docs/superpowers/specs/2026-09-01-asegura-portal-clientes-empresas-design.md`.
  ✅ **La cartera YA ESTÁ EN CASA (traspaso cerrado el 02/09/2026, PRs #2002 → #2007):** las 32.600
  fichas / 28.843 pólizas / 54 tablas viven en el schema `seguros` de la Supabase compartida, y
  `apps/asegura` las lee de ahí por defecto (`ASEGURA_FUENTE=origen` es el único camino de vuelta al
  Supabase de Manuel, `uijsgeocgdaxkhvwtjqs`, que queda como foto congelada). El CRM de Manuel (repo
  `asegura` + Vercel `asegura`, ya en la cuenta de Alberto) **apunta también a central** con el rol
  `crm_seguros` y queda **solo como motor de ingesta de CIMA** (cron Actions 05:30/11:30 UTC → CRM → adaptador
  Java en Fly → TIREA → `seguros`). **Su web NO se usa ni se migra su login** (decisión de Alberto 02/09):
  las pantallas de la correduría se montan en `plataforma` → `/correduria`. La Auth de Supabase (9 usuarios,
  MFA) está copiada a central por si acaso, pero sin uso. ⏸️ **Único cabo suelto: el adaptador Java corre en
  la cuenta de Fly de Manuel** (`asegura-app-cima-adapter`); si él lo apaga, CIMA deja de entrar SIN error y
  solo se nota por los heartbeats `cima_pull_*` que vigila la auditoría. Traspaso de esa app a una cuenta
  de Alberto pendiente (borrador de mensaje v8 en `docs/TRASPASO-CORREDURIA.md`, no se envía sin su OK);
  el port de `cima-pull` a `apps/asegura` está APARCADO a propósito (inventario en
  `docs/ASEGURA-CIMA-INGESTA-INVENTARIO.md`). ⚠️ Las **86 políticas RLS** del CRM se resolvían por
  `auth.uid()`; en central el aislamiento es cosa del código (con BYPASSRLS el fallo sería «se ve todo sin
  fallar»). Ver `apps/asegura/CLAUDE.md`.
- **`apps/asegura-portal`** — **portal del CLIENTE** de Grupo Asegura (Fase 1, 01/09/2026). App aparte
  de `apps/asegura` a propósito: aquella es el panel del CORREDOR, esta la ve el asegurado, y por eso
  usa **rol propio `prisma_asegura_portal` SIN BYPASSRLS** y su propio secreto de sesión
  (`ASEGURA_PORTAL_SESSION_SECRET`). Compone `@central/module-seguros-portal`. Identidad por código
  de un solo uso sobre un **puerto de canal** (email y consola hoy; WhatsApp cuando exista la WABA):
  `canal_no_disponible` (503) NO es «el envío falló» (502). Tablas `portal_*` en el schema `seguros`.
  El aislamiento **no lo da RLS sino el código**, y lo vigila `test/regression-portal-aislamiento.test.ts`.

## Módulos compartidos (`packages/*`, fuente TS pura, portables)
> **Scope npm = `@central/*`** (renombrado desde `@iarest/*` el 11/06/2026, antes de tener clientes).
- `@central/core-ai`, `@central/core-fiscal`, `@central/core-push`, `@central/core-storage`, `@central/core-email`, `@central/core-identity`, `@central/core-telegram`.
- `@central/core-catastro` (02/09/2026) — Catastro (servicios libres): parseo puro + dirección→referencia + adaptador HTTP con cerrojo anti-corte + `precalificarHogar()`. Nació en `module-subastas` (que ahora lo re-exporta) y lo comparte la correduría para hogar.
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

## 🧹 Quién mira qué pantalla — regla global permanente
**Antes de dar por avisada a una persona, comprueba en qué pantalla trabaja.** Un aviso que sale por
un canal que esa persona no abre es un aviso que no existe, y desde el código se ve idéntico a uno
entregado.

- **Vanesa = Vanessa Cruz = Sique Brilla SL.** Es la limpieza de los 4 pisos y era la clienta piloto
  de ialimp: **una sola persona**, aunque medio repo las nombrara como dos actores distintos.
- **Desde el 01/09/2026 su ÚNICO acceso es `/invitado/limpieza`** (intranet de plataforma, enlace con
  token, tabla `limpieza_tareas`). Se le retiró el de ialimp, que **se queda tal cual** como producto
  que Alberto quiere vender — no como la herramienta de nadie hoy.
- Por tanto: **lo que ella tiene que hacer aparece ahí o no se ha pedido.** El email a
  `limpiezascruzz@gmail.com` sirve de refuerzo; la ficha de `/sivra/mensajes` es la pantalla de
  Alberto, no la suya.
- Caso fundacional (01/09/2026): la cuna de la reserva 152490601 se pidió por email, se registró en
  `sivra_ordenes_limpieza` y se pintó en `/sivra/mensajes` — y **no salía en la única pantalla que
  ella abre**. Lo cierra `sivra_ordenes_limpieza.tarea_id`: con uuid la orden se ve en su intranet;
  **NULL significa que NO la ve**, y eso se declara en la UI y por Telegram en vez de suponerse.

Al construir cualquier aviso a un tercero (limpieza, gestoría, huésped, conductor), la pregunta no es
«¿lo he mandado?» sino **«¿en qué pantalla lo va a ver, y tengo cómo saber que está ahí?»**.

## Estilo de respuesta — regla global permanente
**Responde de forma sintética y directa.** Ve al grano: da el resultado o la respuesta primero, sin resúmenes largos, sin repetir el contexto que Alberto ya conoce, sin recapitular lo que acabas de hacer. Nada de listas exhaustivas de opciones que no vas a seguir ni de narrar cada paso. Si hace falta explicar un porqué, hazlo en una o dos frases. Extiéndete SOLO cuando Alberto lo pida explícitamente ("dame el detalle", "explícame", etc.). Esto NO aplica al código, comentarios ni mensajes de commit/PR (esos siguen sus propias reglas).

## 🤖 Trabajo mecánico → SIEMPRE a un agente — regla global permanente
**Todo lo MECÁNICO se delega a un subagente (`Task`), nunca se hace en la sesión principal.** Cada archivo
que lee la sesión principal se queda en su contexto para siempre; un agente lo lee, hace el trabajo y
devuelve solo el informe. Dictado por Alberto (02/09/2026): «todo lo mecánico que hagamos SIEMPRE usas
agente, ahorrar token».

**Es mecánico** (→ agente): renombrados masivos · el mismo patrón aplicado a N archivos · barridos de
sustitución (hex→tokens, imports, rutas) · boilerplate · migraciones planas · rastrear en qué archivos
aparece algo · leer un directorio entero para responder una pregunta acotada.

**NO es mecánico** (→ lo hace la sesión): el diseño de la pieza central, la decisión de arquitectura, lo
que exige criterio o negociar con Alberto, y los cambios de 1-2 archivos que ya se tienen delante
(delegarlos cuesta más de lo que ahorra).

**Cómo repartir sin que se pisen:** reparto **por archivos**, y en el prompt de cada agente va la lista
EXPLÍCITA de lo que puede tocar y de lo que NO (incluidos los archivos que edita la sesión principal en
paralelo). Dos agentes sobre el mismo archivo es un conflicto silencioso: el segundo pisa al primero y
nada falla. Los archivos compartidos por varios (`globals.css`, un `index.ts` de barril) los toca UNO
solo — normalmente la sesión principal.

**Todo agente verifica antes de informar:** typecheck de su app y los tests que toque su cambio, con la
salida pegada en el informe. Un agente que dice «hecho» sin haber visto un comando en verde es la forma
más cara de este patrón. Y **ningún agente commitea ni empuja**: eso lo hace la sesión, que es la que ve
el conjunto.

Complementa a `delegar-codigo` (que delega la ESCRITURA a un coder barato por `/api/ai/ejecutar`) y a
`code-map` (que acota QUÉ leer antes de leer). Esta regla es sobre a QUIÉN se le da el trabajo.

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

## 🤖 CI: por qué un PR de Claude se queda con los checks «Expected» (26/08/2026)

**Los pushes hechos con el token de la App de Claude NO disparan los workflows de Actions.** Es una
limitación de GitHub, no un fallo del repo. Consecuencia: un PR abierto y empujado por un agente puede
quedarse con **los 12 checks requeridos en «Expected — waiting for status to be reported»** para
siempre, y el merge lo rechaza la regla con `12 of 12 required status checks are expected`.

🚨 **«Expected» NO es «Failing».** Antes de tocar nada, mira si algún check está en ROJO: si los 12
están en Expected y ninguno rojo, no hay nada roto — es que **no han arrancado**.

🔴 **`workflow_dispatch` NO desbloquea el merge. Comprobado, no supuesto (26/08/2026).** Se lanzaron
los tres workflows sobre la rama, los **12 jobs requeridos acabaron en `success` sobre el head exacto
del PR** — y el merge siguió devolviendo `12 of 12 required status checks are expected`. Se repitió
sobre **dos heads distintos** (`a1c5b23e` y `4134a64c`) con idéntico resultado. **El ruleset no cuenta
los check runs que vienen de un `workflow_dispatch`**, aunque el nombre del job y el sha coincidan.
No pierdas la tarde por ahí: sirve para SABER si el código está sano, no para desbloquear.

⚠️ Y si aun así lo lanzas para verificar: los check runs aterrizan en el **head del momento**. Si
luego empujas otro commit, se quedan huérfanos en el sha viejo. Lánzalo después del último push.

✅ **SÍ hay forma de que el agente lo resuelva solo: SACAR EL PR DE DRAFT (27/08/2026).** Medido de
punta a punta en el PR #1763, sin que Alberto tocara nada:

| hora (UTC) | qué hizo el agente | qué pasó |
|---|---|---|
| 26/08 23:08 | push de la rama + PR abierto **en draft** (token de App) | **0 runs**; los 12 requeridos en «Expected» |
| 27/08 ~02:15 | intento de merge | `405 — 12 of 12 required status checks have not succeeded` |
| 27/08 ~06:11 | 2º push a la rama (mismo token de App) | (ver nota de abajo) |
| 27/08 06:12:18 | **PR marcado «ready for review»** (`draft:false` por la API) | **arrancan los 3 workflows** sobre `4efa129f`, evento `pull_request` |
| 27/08 06:15 | los 12 jobs requeridos en `success` (~3,5 min) | ✅ |
| 27/08 06:16 | merge (squash) | **`merged: true`** → `ba6ca86b` |
| 27/08 06:19 | PR #1768: rama nueva, PR en draft, des-draft **sin 2º push** | runs otra vez → mergeado |

**Confirmado con un SEGUNDO PR el mismo día (#1768).** Rama empujada, PR abierto en draft y sacado de
draft acto seguido — **sin ningún 2º push**: los runs arrancaron igual (`06:19:25`, evento
`pull_request`). Eso mata la explicación alternativa: el `synchronize` de un push **no** era lo que
disparaba nada en #1763, porque aquí no hubo ninguno.

**Y el tercer dato lo cierra:** un push posterior a #1768, con el PR **ya fuera de draft**, disparó los
runs otra vez (`06:21:48`). O sea, el `synchronize` SÍ funciona… cuando el PR no es draft.

🚨 **Conclusión: es el estado DRAFT lo que silencia los workflows.** Un PR en draft no produce runs ni
al abrirlo ni al empujarle commits; en cuanto se saca de draft, los dispara — y a partir de ahí cada
push vuelve a dispararlos con normalidad. Encaja con las cinco observaciones (dos `opened` en draft
mudos · el push a #1763 en draft, mudo · los dos des-drafteos que dispararon · el push a #1768 ya sin
draft, que disparó). Único fleco teórico: `ready_for_review` no está en los `types` por defecto de
`on: pull_request` y el `event` del run no distingue la acción, así que el mecanismo interno de GitHub
no se ha visto — pero el comportamiento está medido cinco veces y es reproducible.

✅ **El procedimiento, que es lo que importa:** abre el PR en draft (como siempre), y cuando esté listo
**quítale el draft**. Los 12 requeridos arrancan solos y en ~3,5 min está mergeable. **Ya no hace
falta que Alberto toque nada.**

⚠️ Lo que sigue siendo cierto: **el `workflow_dispatch` no vale** (ver arriba) y **el ruleset no se
toca**.

🔬 **Matiz medido el 27/08/2026 (PR #1777): un draft NO siempre es mudo — lo que manda es la
IDENTIDAD que abre el PR.** Ese PR se abrió **en draft** con la herramienta MCP de GitHub y los 12
requeridos arrancaron **al instante**, sin des-draftear: verdes en ~3 min y mergeado sin que Alberto
tocara nada. El run lo dice: `event: pull_request`, `actor: albertosuarezgutierrez-gif` — o sea, el
PR lo abre **tu cuenta de usuario**, no la App, y por eso el evento sí dispara. La regla útil es
entonces: **abrir el PR por la herramienta MCP** (o des-draftear, que también funciona), y lo que no
dispara es el **token de la App**. No des por hecho ninguna de las dos versiones sin mirar el
`actor` del run.

🚨 **TERCER dato, el mismo día (PR #1789): ni el draft ni la identidad lo explican del todo.** Los
tres PRs de esta tanda salieron de la MISMA rama, con la MISMA identidad (`actor` = la cuenta de
Alberto, PR abierto por la herramienta MCP) y los tres **en draft**. Los dos primeros (#1777,
#1779) dispararon los 12 requeridos al instante; el tercero **no disparó ninguno**: sobre su head
solo corrió `rutinas-automerge`, que es `pull_request_target` — o sea, el evento
**`pull_request` no llegó a los workflows requeridos**. Y **sacarlo de draft tampoco lo rescató**
(se probó: volvió a disparar solo el `pull_request_target`). No fue una caída de Actions: otro PR
del repo tuvo su run de `tests.yml` **diez segundos antes**.

Lo único que distinguía a #1789 es que el PR se abrió **~2 segundos después del push** de la rama.
Es una hipótesis de carrera, no una causa medida — **no la des por buena sin comprobarla**.

🚫 **Y las tres palancas que se probaron sobre #1789 fallaron las TRES.** Medido, en este orden:
abrir el PR → 0 runs · **des-draftear** → 0 runs · **push posterior con contenido real**
(`synchronize`) → 0 runs. En las tres, lo único que corrió sobre el head fue `rutinas-automerge`,
que es `pull_request_target`: o sea, **el evento `pull_request` no llegó ni una sola vez**, mientras
otros PRs del repo recibían el suyo con normalidad. Comprobado con `list_workflow_runs` filtrando
por rama: **cero runs de `tests.yml` en esa rama después de las 11:25**.

⚠️ Esto **corrige la frase que se escribió media hora antes en este mismo apartado** («el push
posterior lo desatasca»): es lo que había funcionado hasta ahora, pero en #1789 tampoco. **Causa
desconocida.** Lo que queda documentado no es un remedio, es qué NO gastar tiempo probando la
próxima vez.

✅ **CUARTA palanca, y ESTA SÍ funcionó (27/08/2026, 13:55 UTC, mismo PR #1789): MERGEAR `main` EN
LA RAMA.** Tres horas después de los tres intentos fallidos, `main` había avanzado dos commits y el
PR pasó a `mergeable_state: "dirty"` (conflicto en `CLAUDE.md` y en la memoria). Se resolvió el
conflicto y se empujó el commit de merge → **los 12 requeridos arrancaron a los pocos segundos**,
evento `pull_request`, sobre el head `b93d472e`. O sea: **el agente sí pudo desatascarlo solo**, y la
frase que había aquí —«hace falta mano de Alberto»— era falsa.

⚠️ **Lo que NO se sabe: por qué.** Dos pushes con contenido real (12:57 y 12:59 UTC) no habían
disparado nada. Entre el último mudo y el que funcionó cambiaron dos cosas a la vez —pasaron 56
minutos y el PR entró en conflicto— así que **no está aislado** si lo que desatasca es el merge de la
base, el que la mergeability se recalcule, o simplemente el tiempo. No lo des por causa medida.

**Orden a seguir cuando un PR no arranca los checks:** (1) mira si hay conflicto con `main`, y si lo
hay resuélvelo —es trabajo obligatorio de todas formas y encima puede desatascar; (2) si no lo hay,
**mergea `main` en la rama igualmente** (es un push con contenido real y no ensucia el historial como
un commit vacío); (3) solo si eso tampoco funciona, hace falta mano de Alberto: un push desde su
máquina, o cerrar y reabrir el PR desde la web, o abrir el PR de nuevo desde una rama con OTRO
nombre. **El agente no crea ramas nuevas por su cuenta** (solo empuja a la rama designada) y el
commit vacío sigue prohibido.

✅ **QUINTA medición (01/09/2026, PR #1938): el orden de arriba FUNCIONÓ tal cual está escrito, y
la secuencia completa se midió paso a paso.** Sin conflicto con `main` (paso 1 no aplicaba), se
ejecutó el paso 2 y arrancaron los 12 requeridos a los pocos segundos:

| paso | qué se hizo | runs de los requeridos |
|---|---|---|
| 1 | push de la rama (token de App) | **0** |
| 2 | PR abierto **en draft** por la herramienta MCP | **0** (solo `rutinas-automerge`, que es `pull_request_target`) |
| 3 | des-draftear (`draft:false` por la API) | **0** (ídem) |
| 4 | **merge de `main` en la rama + push** | ✅ **12/12**, `event: pull_request`, `actor: albertosuarezgutierrez-gif`, verdes en ~2,5 min |

🔀 **Y el PR de seguimiento del mismo día (#1940) volvió a romper el patrón: abierto IGUAL —MCP, en
draft, misma identidad— y disparó los 12 al instante** (`event: pull_request`, sin des-draftear ni
tocar nada). Dos PRs consecutivos, mismo método, resultados opuestos. Así que **el draft NO es la
causa**, o no es la única: sigue sin explicación, exactamente como quedó tras #1789. Lo único
accionable sigue siendo el orden de abajo.

Encaja con la hipótesis del draft del 27/08 **con un matiz que conviene recordar**: sacar de draft
por sí solo no disparó nada (como en #1789), pero dejó la rama armada para que **el push siguiente
sí** lo hiciera — el push inicial, con el PR aún en draft, había sido mudo con el mismo token. ⚠️ No
está aislado si lo que desatasca es el des-draft, el merge de la base o los dos juntos: aquí también
cambiaron dos cosas antes del push que funcionó. Lo que sí queda medido cinco veces es que **el orden
de abajo resuelve**, así que síguelo sin gastar tiempo en diagnosticar la causa.

🎯 **SEXTA medición (01/09/2026, PR #1962) — y ESTA SÍ trae una CAUSA MEDIDA, no otra hipótesis: el
objeto PR de GitHub se queda ATRASADO respecto a la rama.** Dos pushes seguidos con contenido real
(código y docs) sobre un PR **ya fuera de draft** salieron **mudos**: cero runs de los requeridos, solo
`rutinas-automerge` (que es `pull_request_target`). Idéntico a #1789. Pero esta vez se miró **el objeto
PR**, no solo los runs, y ahí estaba:

```
git ls-remote origin <rama>   →  5a732a51   ← la rama SÍ tenía el push
PR #1962: head.sha            →  d0d23c65   ← GitHub seguía en el head viejo
PR #1962: commits             →  2          ← de 5
PR #1962: mergeable_state     →  "dirty"    ← contra una base que ya no era la de main
```

O sea: **GitHub no había procesado el `synchronize`.** No hay `event` que mirar porque el evento no
existió. Y no era un fallo permanente — **a los ~2 minutos GitHub se puso al día solo** (head correcto,
5 commits, `mergeable_state: "blocked"`) y **los 12 requeridos arrancaron en ese mismo instante**
(`14:38:58`), sin tocar nada: sin des-draftear, sin mergear `main`, sin push nuevo. Verdes y mergeado.

🚨 **Lo que esto CORRIGE de todo lo de arriba:** en #1789 se probaron tres palancas (abrir PR,
des-draftear, push nuevo) y se declaró «causa desconocida»; en #1938 lo que «desatascó» fue un merge de
`main`… **que es un push más, y por tanto también un par de minutos más de espera**. La explicación
simple que encaja con las seis mediciones es el **lag**, no el draft ni la identidad: cada vez que algo
«funcionó» había pasado tiempo, y cada vez que «no funcionó» se miró demasiado pronto.

✅ **Procedimiento nuevo, y ahorra la tarde entera:** si tras un push los requeridos no arrancan,
**compara `git ls-remote origin <rama>` con el `head.sha` del PR ANTES de tocar nada.** Si no coinciden,
GitHub va con retraso: **espera 2-3 minutos y vuelve a mirar.** No des-draftees, no mergees `main`, no
empujes otro commit — cada palanca añade un head nuevo, reinicia la espera y confunde el diagnóstico
(fue exactamente lo que pasó aquí: el segundo push «mudo» no lo era, solo llegó mientras el primero
seguía sin procesarse).

⚠️ El orden de abajo sigue valiendo como respaldo si tras esperar el `head.sha` YA coincide y aun así no
hay runs — pero prueba primero lo barato, que es no hacer nada.

**Regla de método: mira siempre el `event` y el `actor` de los runs antes de dar por buena cualquiera
de las versiones de esta sección.** Llevamos tres modelos en dos días y los tres se han quedado
cortos.

**Los 12 requeridos son nombres de JOB, no de workflow** (por eso no basta con mirar si el workflow
salió verde):

| Workflow | Jobs que aportan checks requeridos |
|---|---|
| `qa.yml` | `Análisis estático · Patrones conocidos` |
| `ci.yml` | `Lint · TypeCheck · Build` |
| `tests.yml` | `Tests (packages + guardián)` + **9** × `Typecheck · <app>` (almacen, alquiler, ia-rest, ialimp, mariscos, plataforma, rrhh, sivra, transporte) |

Los `Vercel – *` y `Vercel Preview Comments` **no están entre los requeridos**: que estén verdes no
desbloquea nada.

⚠️ **La matriz de `tests.yml` ya NO son 9 apps: son 12** — verificado leyendo el `app:` del
workflow el 02/09/2026: `ia-rest, ialimp, sivra, plataforma, rrhh, transporte, alquiler, almacen,
mariscos, asegura, asegura-portal, housesevillana` (se añadió `asegura` el 26/08, `housesevillana`
el 27/08 y **`asegura-portal`** después). Los 9 de la tabla son los que el **ruleset exige**; los
tres nuevos **corren pero no consta que sean requeridos** (el ruleset no se lee desde aquí, así que
no se afirma). Cuenta los nombres del workflow antes de citar esta cifra: se ha quedado corta dos
veces ya. `housesevillana` llevaba desde el 12/08 en el monorepo **fuera de la matriz**, y por eso
sus 5 errores `TS5097` vivieron 15 días sin que nadie los viera: una app que no está en la matriz
no la typechequea nadie. **Al crear una app nueva, añadirla a la matriz es parte del alta**, igual
que el `ignoreCommand`.

✅ **Y los 12 se pueden correr EN LOCAL, en el contenedor de la sesión (27/08/2026).** Media sección de
aquí arriba da por hecho que el `workflow_dispatch` es la única forma de «SABER si el código está sano».
No lo es: con `npx --yes pnpm@10.33.0 install --no-frozen-lockfile` (≈20 s, el contenedor arranca **sin
`node_modules`**) se reproducen los tres workflows enteros, gratis y sin depender de que Actions dispare:

| Check requerido | Comando local | Desde |
|---|---|---|
| `Tests (packages + guardián)` | `pnpm test` | raíz |
| `Typecheck · <app>` (×11) | `pnpm exec prisma generate` (si hay `prisma/schema.prisma`) + `pnpm exec tsc --noEmit -p tsconfig.json` | `apps/<app>` |

⚠️ **`apps/asegura` tiene DOS schemas de Prisma** (`prisma/schema.prisma` y `prisma/asegura.prisma`, este
último con `output = ../lib/generated/asegura-client`). Generar solo el primero deja su typecheck en rojo
con `TS2307: Cannot find module './generated/asegura-client'` **en local mientras el CI está verde** — el
workflow usa el script de la app, que genera los dos. El comando completo es el de su `package.json`:
`prisma generate && prisma generate --schema prisma/asegura.prisma`. (Medido 01/09/2026.)
| `Análisis estático · Patrones conocidos` | `pnpm exec tsx scripts/qa-check.ts` | **`apps/ia-rest`** (el workflow lleva `working-directory`) |
| `Lint · TypeCheck · Build` | `pnpm run lint` · `pnpm exec tsc --noEmit` · `pnpm run build` | **`apps/ia-rest`** (idem) |

Medido entero el 27/08: `pnpm test` = **3.149 tests `node --test` + 107 vitest, 0 fallos**; los 11
typechecks en verde; QA «817 archivos, sin problemas»; lint **0 errores** (1.225 *warnings*, que no
bloquean) y build OK. ⚠️ Los dos últimos corren **desde `apps/ia-rest`**, no desde la raíz — desde la
raíz `qa-check.ts` ni existe y te crees que el check está roto. Esto NO sustituye al CI (el merge sigue
exigiendo los check runs), pero convierte «no sé si está sano» en algo comprobable en 3 minutos.

⚠️ **Un fallo local que NO es un fallo:** sin `pnpm install`, `node --test` sobre un test que importa un
`@central/*` peta con `ERR_MODULE_NOT_FOUND` (le pasó a `lib/fmp.test.ts` → `@central/module-trading`).
Es el symlink del workspace que no existe, no el código. Instala antes de diagnosticar nada.

📌 **Consecuencia estructural — REVISADA el 27/08/2026.** La conclusión del 26/08 («ningún PR abierto
por el agente puede mergearse sin que Alberto intervenga a mano») **resultó ser falsa**: el PR #1763 se
mergeó entero sin intervención humana. Se mantiene abierta la decisión de fondo —dar a la App permiso
para disparar workflows, sacar de «required» los checks que no puede satisfacer, o la *Bypass list*—
pero ya **no es un bloqueo operativo**, así que hay menos prisa. **Ninguno de esos caminos se toma
sobre la marcha para desatascar un PR**: es configuración del repo.

> ✍️ Alberto, 26/08/2026: visto y pendiente de decidir. No tocar el ruleset por ahora.
>
> 🔎 27/08/2026: sigue sin tocarse el ruleset. Lo que cambió es que se encontró la salida por dentro
> (sacar el PR de draft), no que se cambiara ninguna configuración.

🚫 **Lo que NO se hace:**
- **Bypass del ruleset.** La regla es un **Ruleset**, no una Branch protection clásica: **no hay
  override implícito de Owner** y el botón «merge without waiting» sencillamente no se renderiza.
  Concedérselo exige meter la cuenta en la *Bypass list* del ruleset — una puerta que se queda
  abierta para siempre por un PR de tres `.md`. No compensa.
- **Commit vacío para «despertar» el CI.** Prohibido: ensucia el historial y esconde el problema.
  Si hace falta un push que dispare workflows, que sea un commit **con contenido real** hecho desde
  una cuenta de persona (el token de App no vale).

🚨 **VERDE NO DICE QUE EL DIFF SEA EL TUYO (27/08/2026, PR #1787).** `git push origin <rama>` empuja
la **rama nombrada, no HEAD**. Si commiteas estando en `main` y luego empujas la rama por su nombre,
se manda la rama tal cual estaba —sin tu commit— y git responde `* [new branch]`, que se lee como
éxito. El PR se abre con el head viejo y **los 12 checks salen verdes sobre él**: validan lo que hay
en el head, no tu intención. Lo previene el hook `scripts/guardian-rama.mjs` (`PreToolUse`, con
guardián en `test/regression-guardian-rama.test.ts`), que bloquea el push cruzado y el abrir/mergear
un PR con commits que no están en ningún remoto.

⚠️ **Y para MIRAR un diff usa TRES puntos, no dos.** `git diff origin/main..HEAD` (dos) pinta como
**borrados** todos los commits que `main` tiene y tu rama no; es un artefacto de la forma del diff,
no un borrado. Lo que GitHub muestra y el merge aplica es `origin/main...HEAD` (tres). Ese mismo día
se dio por bueno un «este PR borra el botón 👁 y la regeneración de #1786» que era **falso**: el diff
de tres puntos eran 34 inserciones y 0 borrados, y el merge simulado salía vacío. Antes de anunciar
que un PR borra algo, simula el merge (`git merge` en un `git worktree`) y míralo.

**Dos trampas de diagnóstico, las dos vistas el 26/08/2026:**
- Un run en `completed failure` puede ser **11 jobs `cancelled`** por `concurrency:
  cancel-in-progress` (llegó un push nuevo mientras corría). **Mira los jobs antes de diagnosticar un
  fallo**: `list_workflow_jobs` lo dice en un segundo.
- Los eventos `check_suite.completed` que llegan a la sesión son **de Vercel**. Leerlos como «CI
  verde» es afirmar algo que no se ha mirado — el fallo que `CLAUDE.md` marca como el más caro.
  Para el estado real: `get_status` (statuses) **y** `get_check_runs` (jobs de Actions), que son
  cosas distintas.

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
