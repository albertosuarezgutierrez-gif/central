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
  (Vercel `almacen`, tenant DEMO poblado; tenant real de Joaquín aún sin sembrar). **Tiene `CLAUDE.md`
  propio desde el 02/09/2026** — manda él; el contexto de la reunión y la auditoría siguen en
  `docs/ALMACEN-JJ-reunion-y-auditoria.md`.
- **`apps/mariscos`** — **Mariscos González**: trazabilidad pesquera + etiquetado por peso (mayorista/pescadería
  de marisco; Fase 1, PR #1055, 11/08/2026). Recepción de partidas (albarán, lote de origen), envasado que
  CONSERVA el lote, etiqueta por canal (con/sin lote). Compone `@central/module-pesca`. BD compartida (auth
  propio, cookie `mariscos_session`). Ver `apps/mariscos/CLAUDE.md`. **Pendiente para darla por viva:** proyecto
  Vercel, ejecutar su SQL en Supabase (preview→prod), sembrar cuenta real de Mariscos González.
- **`apps/asegura`** — **Grupo ASegura**: correduría de seguros (nombre comercial de Alberto).
  ✍️ **Se escribe «Grupo ASegura», con A y S mayúsculas** (04/09/2026): el monograma «AS» del logo
  ES el nombre (A de Alberto, S de Suárez), así que escribirlo con la ese minúscula no es una
  errata de estilo: se come la marca. Es el valor de `seguros.corredurias.nombre` en BD y lo protege
  en todo el repo `test/regression-nombre-comercial-asegura.test.ts` (gate en `pnpm test:guardia`).
  🖥️ **NO es una pantalla: es la trastienda.** Alberto trabaja la correduría desde
  `apps/plataforma` → `/correduria` (su única pantalla, con todos sus negocios); asegura tiene la BD de
  la cartera, la sirve por el puerto `/api/operador/*` y es la única que gasta dinero al retarificar.
  Una pantalla nueva de la correduría se monta en `plataforma`, no aquí (dictado 01/09/2026).
  **Esqueleto desde el 26/08/2026** — auth propia (cookie `asegura_session` + `jose` contra `public.cuentas`), layout y
  manifiestos; schema **propio `seguros`** + rol `prisma_seguros` (creado, `BYPASSRLS`, **sin contraseña**).
  🚨 **Y OJO CON LA CIFRA (medido 01/09/2026): 32.600 fichas ≠ 32.600 clientes.** La **cartera VIVA son
  80 clientes / 110 pólizas** (03/09/2026) — las que entran o mantiene CIMA. Qué cuenta como viva lo
  decide una fuente única, `esCarteraViva()` de `@central/module-seguros`
  (`packages/module-seguros/src/cartera-viva.ts`): **`import_ref IS NULL` O `eiac_xml_hash IS NOT NULL`**.
  El segundo brazo tapa un agujero medido el 03/09/2026 — cuando CIMA trae una póliza que YA estaba en el
  volcado no crea fila nueva: actualiza la vieja y le deja su `import_ref`, así que una póliza que CIMA
  mantiene al día contaba como lead (hoy afecta a **1** fila: la `3021700291186` de Reale C0613, auto,
  vence 19/09/2027, que dejaba a Reale con «0 pólizas vivas»).
  Las otras 28.728 pólizas son **volcado histórico** (`import_ref` `intranet:` y `asegura_app:`, cargado en
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
  `docs/ASEGURA-CIMA-INGESTA-INVENTARIO.md`). 🔑 **Rotar la contraseña de un rol de BD SIN actualizar el `DATABASE_URL` de su proyecto Vercel deja la
  app muerta en silencio (02/09/2026).** `prisma_seguros` se rotó tres veces ese día y `central-asegura` se
  quedó con la vieja: toda la cartera —y con ella el libro de comisiones— moría en `password authentication
  failed`, y ese texto **solo existía en los logs del pooler de Supabase**. Lo cazó el clasificador de causas
  del puerto (`apps/asegura/lib/error-cartera.ts`). **La rotación y el env se hacen en el mismo paso.**
  ⚠️ Las **86 políticas RLS** del CRM se resolvían por
  `auth.uid()`; en central el aislamiento es cosa del código (con BYPASSRLS el fallo sería «se ve todo sin
  fallar»). Ver `apps/asegura/CLAUDE.md`.
- **`apps/asegura-portal`** — **portal del CLIENTE** de Grupo ASegura (Fase 1, 01/09/2026). App aparte
  de `apps/asegura` a propósito: aquella es el panel del CORREDOR, esta la ve el asegurado, y por eso
  usa **rol propio `prisma_asegura_portal` SIN BYPASSRLS** y su propio secreto de sesión
  (`ASEGURA_PORTAL_SESSION_SECRET`). Compone `@central/module-seguros-portal`. Identidad por código
  de un solo uso sobre un **puerto de canal** (email y consola hoy; WhatsApp cuando exista la WABA):
  `canal_no_disponible` (503) NO es «el envío falló» (502). Tablas `portal_*` en el schema `seguros`.
  El aislamiento **no lo da RLS sino el código**, y lo vigila `test/regression-portal-aislamiento.test.ts`.
  Tiene `CLAUDE.md` propio desde el 02/09/2026 — ver `apps/asegura-portal/CLAUDE.md`.
- **`apps/asegura-web`** — **web pública de marketing** de Grupo ASegura (04/09/2026). **Sirve en el
  apex `grupoasegura.es` + `www` desde el 05/09/2026** (proyecto Vercel `asegura-web`, atado por Alberto
  con Claude en Chrome); `app.grupoasegura.com` sirve el CRM de Manuel y no se toca. ⚠️ El `.com`
  NO es suyo: su apex apunta a un parking de IONOS (`217.160.0.254`), y hasta ese día la app lo
  llevaba como `SITIO_URL` por defecto — canonical y sitemap hacia un dominio vacío. Ahora el
  defecto es el `.es` (`lib/sitio.ts`). Tercera app de la correduría y la única que ve alguien que aún no es cliente
  (`asegura` = corredor, `asegura-portal` = asegurado, `asegura-web` = quien todavía no lo es).
  ⚠️ **El apex cambió de manos DOS VECES el 05/09/2026 — mira quién lo sirve HOY antes de tocar nada.**
  Por la mañana `grupoasegura.es` (el `.es`, no el `.com`) pasó a servir la web del repo **`asegura`** de
  Manuel (`NEXT_PUBLIC_SITE_URL=https://grupoasegura.es`, con su `/siniestro` y las 301 del WordPress
  viejo, PR asegura#817). Por la tarde se le quitó: medido a las 14:04 UTC, los dominios del proyecto
  Vercel `asegura` son **solo** `app.grupoasegura.com` + los `*.vercel.app`. **`asegura-web` SÍ está
  desplegada**: proyecto Vercel `asegura-web` (`prj_MnuAvshNZg6vmRsfTkSmiX4RyCj9`, root
  `apps/asegura-web`), y es quien sirve el apex desde esa tarde. 🚨 **Ojo con la herramienta:
  `list_projects`/`get_project` del MCP de Vercel NO devuelven ese proyecto** (404 por id, y la lista
  se queda en 12 sin él ni `alquiler`) — sí aparece en el comentario del bot de Vercel en los PRs. Con
  esa lista incompleta se afirmó aquí que el proyecto «no existe»: **una lista que no lo trae no
  demuestra que no esté.**
  🔁 **Y el MISMO error otra vez el 07/09/2026, en otro campo — `get_project.domains` NO es la lista
  de dominios del proyecto.** Sobre `asegura-portal`, la herramienta devolvió solo
  `asegura-portal-pisos-turisticos-projects.vercel.app` y su `-git-main`, o sea los **alias
  automáticos del equipo**. Con eso se afirmó aquí que `clientes.grupoasegura.es` «no estaba atado»
  (y de paso que el botón «Área de clientes» de la web llevaba a un 404). Alberto miró el panel:
  los dominios del proyecto eran **`clientes.grupoasegura.es`** (Valid Configuration) y
  **`asegura-portal.vercel.app`**, y el portal cargaba con su título correcto. Las dos afirmaciones
  eran falsas y ninguna se había medido contra el panel.
  **La regla, que ya vale para las dos herramientas:** un campo o una lista del MCP de Vercel prueba
  lo que SÍ trae, nunca lo que no. Para decir que un dominio no está atado hace falta el panel o un
  `curl` al host, no la ausencia en un JSON.
  💣 **La lección cara (misma tarde): un dominio que se mueve se lleva por delante las rutas de servicio,
  no solo las páginas.** Los seis workflows de crons de `asegura` se repuntaron a `grupoasegura.es`
  (asegura#818) dando por hecho —sin medirlo— que la canonicalización LOO-670 rompía el host viejo. No lo
  rompía: el run de `cima-pull` de las 09:12 UTC contra `app.grupoasegura.com` había salido en verde. El
  primer run tras el merge murió con `curl: (22) ... error: 404`, y con `cima-pull` cae `cima-health-alert`,
  que es el vigilante que avisaría de que la ingesta se ha parado. Revertido y verificado en asegura#819. La regla:
  **antes de mover un host en un cron, mira el código de respuesta del endpoint en los dos hosts**
  (404 = otra app; 401 = la ruta existe y te rechaza por credencial, que es lo que quieres ver).
  🚨 **NO tiene base de datos a propósito**: sin Prisma, sin rol, sin secreto de sesión. El
  formulario sale por `POST /api/lead`, que **reenvía desde el servidor** al canal que ya existe
  (`/api/publico/correduria/lead` de plataforma → puerto de asegura → Telegram). Propaga
  `x-forwarded-for` con la IP real del visitante **porque si no el límite de 6/hora por IP de
  plataforma pasaría a ser global** y el séptimo lead legítimo de la hora se rechazaría solo.
  Mediador desde `MEDIADOR` (`@central/module-seguros`) y colores desde `MARCA_ASEGURA`
  (`@central/brand`): ni la clave DGSFP ni un hex se escriben aquí. Dos guardianes propios:
  `lib/ramos.test.ts` (el copy no puede prometer ahorros ni superlativos de precio — eso lo
  convertiría en asesoramiento y arrastraría análisis objetivo e IPID, RDL 3/2020) y
  `lib/contrato-lead.test.ts` (lee el fuente de plataforma y compara la lista de ramos: si
  divergen, el visitante elegiría uno que plataforma rechaza con 422 y el lead se pierde en
  silencio). `HORARIO` y el teléfono están **ausentes a propósito** mientras no se confirmen.
  📊 **Analítica CON consentimiento, y fail-CLOSED a propósito (05/09/2026).** PostHog detrás de
  Cookiebot: la regla vive en una función pura, `puedeMedir()` de `lib/analitica.ts`, y **sin
  `NEXT_PUBLIC_COOKIEBOT_ID` no se mide nada**. Es la decisión CONTRARIA a la web de Manuel, donde
  `posthog-browser.ts` hace *fail-open* — sin esa env no pinta banner y arranca igual (medido en el
  HTML vivo el 04/09: 0 apariciones de Cookiebot, PostHog corriendo; art. 22.2 LSSI). PostHog **no
  viaja en el bundle**: el script se baja de su CDN solo tras aceptar, así que lo que no se ha
  descargado no lo puede disparar un `if` mal escrito. Host por defecto **EU** (`eu.i.posthog.com`),
  `disable_session_recording` (el formulario pide nombre, teléfono y correo) y `person_profiles:
  identified_only`. Retirar el consentimiento **apaga** (`opt_out_capturing` + `reset(true)`), no solo
  deja de arrancar. Página `/legal/cookies` con la declaración que publica Cookiebot y botón de
  renovar (art. 7.3 RGPD). Lo vigila `lib/analitica.test.ts` (12 cepos, lee el fuente). ⚠️ **El CBID
  tiene que tener `grupoasegura.es` dado de alta en el panel de Cookiebot**: un CBID atado solo a
  `app.grupoasegura.com` no pinta banner aquí, y entonces esta app no mide — que es lo correcto, pero
  silencioso.
  🔘 **Un solo acceso, y es el del CLIENTE (05/09/2026).** Botón «Área de clientes» en la cabecera y
  «Ya soy cliente · Mis seguros» junto al CTA de venta, los dos a `PORTAL_URL` (`lib/sitio.ts`, env
  `NEXT_PUBLIC_PORTAL_URL`; por defecto `asegura-portal.vercel.app`, que es donde el portal sirve HOY —
  cuando `clientes.grupoasegura.es` esté repuntado a Vercel, se cambia la env y listo). **NO hay «acceso
  corredor» a propósito**: Alberto entra por plataforma. Lo vigila `lib/portal.test.ts`, que lee el
  fuente: el botón montado, y ningún `href` ni texto hacia `app.grupoasegura.com`, `/correduria`,
  `/operador`, `/login`, «Acceso correduría», «Únete gratis» o «Ya tengo cuenta» (el vocabulario de la
  web de Manuel). Cabecera en DOS filas a todo ancho (marca + botón / nav), medida con Playwright a
  320-360-1024: sin desbordar y sin pisar la marca.
  🏷️ **El muro de compañías eran NOMBRES en gris, no logos (07/09/2026).** Alberto: «no salen los
  logos» — y no salían porque **no había ninguno**: `page.tsx` pintaba `<li>{c}</li>` y `globals.css`
  lo estilaba como texto; ni un `<img>` ni una carpeta de imágenes en todo el repo. Ahora la lista
  vive en `lib/companias.ts` con su logo, y los cinco SVG (`public/logos/`) vienen **del propio repo
  `asegura` de Alberto** (`public/logos/insurers/`), no descargados de la web de cada compañía. Se
  sirven como `<img src>` y **NO en línea**: cada uno trae su `<style>` con clases `.st0`/`.cls-2` y
  juntos en el mismo documento se repintarían entre sí. La altura es común y el ajuste ÓPTICO va por
  `escala` (las relaciones de aspecto van de 1,23 —Generali, escudo— a 5,42 —Occident, casi todo
  palabra—). ⚠️ **Fidelidade y Asisa se quedan como wordmark de texto: no tenemos su logo**, y no se
  dibuja uno parecido. ⚠️ **Y el SVG de Occident es el de «Catalana Occidente», la marca ANTERIOR** —
  se sirve tal cual porque es el que hay; sustituirlo pide el archivo nuevo, no un retoque. Lo vigila
  `lib/companias.test.ts`, que lee el disco: un `<img>` a un fichero que no está **no rompe nada**,
  pinta el icono de imagen rota y de eso solo se entera quien abre la página.
  🔵 **Y la pestaña NO tenía icono (07/09/2026).** Ni `icon.*`, ni `favicon.ico`, ni `metadata.icons`:
  salía el globo por defecto de Chrome, y el «AS» NEGRO que se veía en una pestaña era el de
  `app.grupoasegura.com` (el CRM de Manuel), no el de esta web. Alberto: «me gusta más en azul, se ve
  más». `app/icon.tsx` pinta el monograma en `primario` sobre `acentoSuave` — el mismo gesto que
  `.marca-tile`/`.marca-mono` de la cabecera — y **lee el dibujo de `public/brand/marca-asegura.svg`**
  en vez de copiar el `path`. 🚨 Ese SVG trae `fill="currentColor"` a propósito, y dentro de un `<img>`
  eso resuelve a **negro**: `icon.tsx` lo sustituye por el azul antes de embeberlo, así que **si alguien
  le pone un color fijo al SVG la sustitución pasa a ser un no-op y vuelve el icono viejo sin que falle
  nada**. Lo vigila `lib/icono.test.ts` (y que ningún hex se escriba a mano ahí: satori no entiende
  `oklch`, así que solo valen `primario` y `acentoSuave`).
  🕰️ **Hasta la tarde del 05/09 lo que Alberto veía en `grupoasegura.es` era el CRM de Manuel**, no
  esta app: el apex `.es` y `www` estaban atados al proyecto `asegura` y esta app no tenía dominio. Se
  arregló en paneles, no en código: `.es`+`www` → `asegura-web`; `clientes.grupoasegura.es` →
  `asegura-portal` (DNS en IONOS pendiente de repuntar); `app.grupoasegura.com` sigue en `asegura`
  (ingesta de CIMA). ⚠️ `clientes` tiene **MX de IONOS**: un CNAME lo mataría, así que ahí va un
  registro **A** a Vercel (el mismo `216.150.1.1` del apex), no el CNAME que sugiere el panel.
  Plan y diagnóstico en `docs/ASEGURA-MARKETING-PLAN.md`.

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

## 🗺️ Grafo de código PROPIO — Graphify queda solo para memoria (12/09/2026, ampliado el mismo día)
**La cuota gratis de Graphify se agota, y a los tres días de hacerlo obligatorio nadie había medido
cuánto ahorraba.** Decisión de Alberto (12/09/2026): grafo propio + medir el uso de cada herramienta.
- **Callers, callees, impacto, vecinos, tests que cubren un archivo, buscar símbolo, camino entre
  archivos, referencias, imports/exports, ficha de nodo Y búsqueda semántica → grafo propio**
  (`grafo_nodos`/`grafo_aristas`/`grafo_embeddings` en la Supabase compartida; funciones
  `grafo_callers/callees/impacto/vecinos/tests_de/find/camino/referencias/imports_exports/nodo/
  buscar/rank_files`, por `mcp__Supabase__execute_sql`). Recetas en la skill **`code-map`**. La parte
  estructural la genera `scripts/grafo-codigo.mjs` (regex, Node puro, 1,8 s) en cada push a `main`
  (`scripts/grafo-codigo-inyectar.mjs` → `/api/internal/grafo-codigo`); la semántica corre
  `grafo_embed_lote` sobre OpenRouter (`/api/internal/grafo-codigo/embeddings`, mismo workflow).
  ⚠️ Un push a `main` con token de App NO dispara el workflow (ver sección CI): si el `sha` de
  `grafo_nodos` va por detrás de `origin/main`, dispara `auditoria.yml` a mano (`workflow_dispatch`).
- **Medición de paridad (12/09/2026, `docs/USO-HERRAMIENTAS.md`):** las 12 categorías de herramienta
  de Graphify probadas contra un símbolo REAL y ambiguo (`isCronAuthorized`, duplicado en 3 apps) —
  en 10 de 12 categorías el grafo propio igualó o superó a Graphify, y en 2 lo superó con
  datos objetivamente mejores: **callers/referencias** (Graphify resuelve nombres duplicados entre
  apps a UNA declaración arbitraria y calla el resto — 1 caller contra los 80 reales; el grafo propio
  agrega las 6 declaraciones homónimas) y **búsqueda semántica** (`query_graph` confundió «autorización
  de cron» con «autorización de cliente de seguros» por la palabra compartida; `grafo_buscar` acertó
  el archivo correcto). Detalle completo, tabla por tabla, en `docs/USO-HERRAMIENTAS.md`.
- **Medición de paridad de MEMORIA (12/09/2026, `docs/USO-HERRAMIENTAS.md`):** `memoria_buscar()`
  (embeddings sobre `docs/CONTEXTO-SESIONES.md`+`docs/memoria/*.md`, PR #2848) probado contra
  `recall`/`memories_about` de Graphify en 4 preguntas reales sobre decisiones/gotchas documentados
  (Serper, pantalla de Vanesa, incidente Smoobu 401, capitalización «Grupo ASegura»): **4 de 4**
  `memoria_buscar` igualó o superó a Graphify, nunca al revés — en 3 Graphify no encontró nada
  relevante, y en el caso Smoobu SÍ era relevante pero **desfasado** (congelado en un estado
  intermedio ya resuelto), mientras `memoria_buscar` devolvió la línea de tiempo completa y vigente.
  **Ya NO se usan** `graphify_find/node/callers/callees/file_neighbors/tests_for/impact/trace/
  shortest_path/references/imports_exports/rank_files/render_subgraph` ni `query_graph` para código
  (sustituidos por `grafo_*`), **ni `remember`/`recall`/`memories_about`** (sustituidos por
  `memoria_buscar` + el hábito ya existente de anotar `docs/CONTEXTO-SESIONES.md` al cerrar sesión).
  Con esto se cumple la condición de Alberto («que lo creado sea 100% igual») sobre las 4 preguntas
  medidas — muestra pequeña, no exhaustiva, pero consistente y sin ningún caso peor. Decisión de
  cancelar Graphify: de Alberto.
- **📏 Todo uso de herramienta se MIDE solo** (hook `PostToolUse` → `scripts/uso-herramientas.mjs`, un
  JSON por sesión en `docs/uso-herramientas/AAAA-MM/`; en vivo se escribe en `.git/uso-herramientas/` y
  el `Stop` hook lo copia y commitea solo con la memoria o cada 30 min — persistirlo en cada `Stop` era
  un push por turno = CI + 12 deployments de Vercel por turno, medido el 12/09/2026). Agregado con
  `node scripts/ahorro-herramientas.mjs --md docs/USO-HERRAMIENTAS.md`. Mide llamadas, tokens pagados
  y **cota superior** del ahorro (archivos citados); **no mide utilidad** — eso sigue en
  `docs/AGENTE-MECANICO-BITACORA.md`. Antes de declarar obligatoria (o retirar) una herramienta, mira
  esa tabla: es la regla «mide el ahorro, no lo supongas» con denominador de verdad.

El MCP de **Graphify** sigue instalado (pendiente de que Alberto decida darlo de baja — ver medición
de paridad de memoria arriba) pero ya no tiene uso exclusivo: no uses ninguna de sus herramientas,
código o memoria, salvo para volver a medir paridad. Workspace
`grupo-asegura`; `repository_id` principal **`albertosuarezgutierrez-gif/central`** — el workspace
también tiene indexados como repos SUELTOS `asegura`, `sivra`, `ialimp`, `house-sevillana-landing`
(restos de cuando esas apps vivían fuera, o el CRM externo de Manuel): **pasa siempre `repository_id:
"albertosuarezgutierrez-gif/central"` explícito** en toda consulta — el nombre corto sin
`repository_id` puede resolver al repo suelto viejo en vez de a `apps/sivra`/`apps/ialimp`
dentro de central.

**Principio (vale igual para el grafo propio):** el grafo responde «¿dónde está algo y qué está
relacionado con ello?». El código fuente responde «¿qué hace realmente?». **Nunca sustituyas la
lectura del código por una suposición del grafo** — el grafo localiza y traza relaciones, no
sustituye leer la implementación antes de tocarla. `grafo_nodo`/`grafo_buscar` dan línea y tipo, no
el cuerpo, precisamente para que este paso no se salte.

Flujo antes de modificar código compartido (función, componente, servicio, API, modelo):
`GRAFO PROPIO (localizar) → ANALIZAR IMPACTO → LEER CÓDIGO → PLANIFICAR → MODIFICAR → VERIFICAR`.

**Memoria durable** (`memories_about`, `recall`, `remember`, únicos usos que quedan de Graphify):
decisiones técnicas permanentes, convenciones del proyecto, gotchas y restricciones importantes —
NO detalles temporales de una tarea concreta ni información obvia que ya está en el código.
Complementa a `docs/CONTEXTO-SESIONES.md`, no lo sustituye.

**Navegación:** no hagas exploraciones masivas con `Grep`/`Glob`/lectura indiscriminada.
Pregunta primero al grafo propio (dónde vive la funcionalidad, quién la consume, qué depende de
ella, qué archivos están relacionados, cuál es el camino de ejecución) y lee después
SOLO el código necesario — ni carpetas completas ni archivos enteros cuando basta una función.

**Antes de crear algo nuevo**, busca en el grafo propio (`grafo_find`/`grafo_buscar`) componentes
similares, patrones existentes, servicios reutilizables o integraciones ya montadas: no dupliques
un patrón que ya existe en el monorepo.

**Frescura:** antes de confiar en el grafo propio para una decisión importante, compara su `sha`
contra el HEAD real de la rama (`SELECT sha, max(updated_at) FROM grafo_nodos GROUP BY 1` vs
`git rev-parse origin/main`). Si no coincide, el grafo va con retraso: avísalo, no asumas que las
relaciones que devuelve siguen vigentes.

**Después de cambios que afecten arquitectura**, vuelve a consultar el grafo propio (`grafo_impacto`/
`grafo_vecinos`) para validar el impacto real, además de la verificación normal (tests, typecheck,
lint, build) que ya exige este documento.

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
**No narres el trabajo: solo el resultado.** Durante una tarea no expliques lo que vas a hacer ni vayas relatando cada paso — trabaja y, al terminar, da UN resumen final sintético (qué se hizo, archivos, y solo si aplica: tests/pendiente). Sin resúmenes largos, sin repetir el contexto que Alberto ya conoce, sin recapitular. Nada de listas exhaustivas de opciones que no vas a seguir. Si hace falta explicar un porqué, hazlo en una o dos frases dentro de ese resumen final. Extiéndete SOLO cuando Alberto lo pida explícitamente ("dame el detalle", "explícame", etc.). Esto NO aplica al código, comentarios ni mensajes de commit/PR (esos siguen sus propias reglas).

## 👀 Mira los PRs ABIERTOS antes de empezar — regla global permanente
**Varias sesiones trabajan en este repo a la vez y no se ven entre sí.** Todas empujan con la
cuenta de Alberto, así que un PR abierto por otra sesión es indistinguible de uno tuyo, y nadie te
avisa de que el trabajo que vas a hacer ya está hecho y esperando.

Antes de ponerte con algo que no sea trivial: **lista los PRs abiertos** (`list_pull_requests`,
`state: open`) y mira si alguno toca lo mismo. Cuesta una llamada.

Caso fundacional (06/09/2026): el PR #2319, abierto desde el 05/09, ya corregía «la matriz son 12
apps» → 13 en `CLAUDE.md`. Sin mirarlo, esta sesión volvió a encontrar el mismo fallo y abrió el
#2434 con la misma corrección — trabajo duplicado y, de propina, un conflicto textual metido en el
PR ajeno. Lo caro no fue el rato perdido: fue dejar peor un PR que ya estaba bien.

Corolario para los PRs de otras sesiones: **mirarlos no es mergearlos.** Lo que solo cuenta lo que
pasó (`docs/**` de registro) se mergea; lo que le dice a un agente qué hacer o toca código, no —
es la misma línea que ya traza `.github/workflows/rutinas-automerge.yml`.

## 🪤 Un cepo no está terminado hasta que se le ha visto FALLAR — regla global permanente
**Escribir el test y verlo verde no prueba nada: prueba que pasa, no que vigila.** Un guardián que
mira al sitio equivocado es verde el 100 % de las veces, y por eso es indistinguible de uno que
funciona hasta el día que hacía falta. Es el mismo fallo que `CLAUDE.md` ya prohíbe aguas arriba
(«un check que se pone verde porque la consulta no devolvió nada es el fallo más caro que hay»),
un piso más abajo.

Por eso: **rompe a propósito lo que el cepo dice proteger, comprueba que se pone rojo, y restaura.**
Un brazo por aserción, no uno por fichero. Y pega la salida del rojo en el PR: es la única prueba
de que el cepo existe.

Tres casos el mismo día (06/09/2026), todos verdes mirando donde no era:
- La comprobación de responsive midió `scrollWidth` y dijo «no desborda». Cierto e inútil: lo que
  tapaba el texto era un elemento `position: fixed`, que **no desborda, se pone encima** (PR #2428).
- `regression-matriz-typecheck` buscaba cada nombre de app en TODO `CLAUDE.md` y pasaba con
  `asegura-web` borrado de la lista, porque la app tiene su propio apartado más arriba. Se acotó a
  la lista que declara ese párrafo (PR #2434).
- Tres PRs de registro parecían tocar código en `get_files`: era el `base.sha` viejo que GitHub
  guarda para el PR, no el diff real. El de tres puntos contra `main` decía otra cosa.

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

**Umbral objetivo, para no decidir a ojo cada vez (11/09/2026):** delega si se cumple CUALQUIERA de —
mismo patrón en ≥3 archivos · boilerplate/renombrado sin decisión de negocio · generación >~80 líneas
sin lógica que exija criterio. No delegues nunca si toca auth/pagos/RLS/multi-tenant/migraciones (eso
es `agente-architect`, no mecánico) o si son 1-2 archivos que la sesión ya tiene abiertos. Sin agente
director: la sesión principal aplica esta tabla directamente en el mismo turno — meter un agente
intermedio solo para decidir a quién delegar cuesta más (otra llamada, otro contexto) que la propia
decisión, que es una tabla fija.

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

**Con qué MODELO (09/09/2026):** para lo mecánico de esta regla, invoca `.claude/agents/agente-mecanico.md`
(modelo económico) en vez de un agente genérico — mismo tool `Task`/`Agent`, pero más barato. Para lo
que SÍ requiere razonamiento fuerte (arquitectura, seguridad, bugs que han resistido varios intentos,
revisión de un cambio de alto riesgo), usa `.claude/agents/agente-architect.md` (Opus) — con moderación,
no por defecto. Programación normal (endpoints, CRUD, Server Actions, bugs normales) la sigue haciendo
la sesión principal, sin delegar.

**Mide el ahorro, no lo supongas (09/09/2026, corregido 11/09/2026):** anotar solo los fallos (como
decía esta regla hasta ahora) sesga la medición — sin el total de usos, un fallo cada diez pasadas y
un fallo cada dos son indistinguibles en la bitácora. Corrección: **cada invocación de
`agente-mecanico` o `delegar-codigo`, salga bien o mal, se anota en `docs/AGENTE-MECANICO-BITACORA.md`**
(una línea: tarea, cuál de los dos, resultado — `ok` o `fallo: qué falló`). Solo con numerador Y
denominador se puede saber si el modelo económico ahorra tokens de verdad o si el re-trabajo se come
el ahorro.

**Revisión obligatoria antes de pedir merge (09/09/2026):** el gate que BLOQUEA el merge ya existe
(CI + `Claude Approvals`, ver sección de CI) — no se monta un agente nuevo para eso. Lo que faltaba
es que nadie exigía una pasada de calidad/correctness ANTES de llegar a ese gate: `code-review` y
`agente-architect` eran opt-in. Ahora es paso obligatorio: **antes de sacar un PR de draft**, la
sesión corre la skill `code-review` sobre el diff (o delega en `agente-architect` si el cambio es de
alto riesgo — auth, pagos, RLS, multi-tenant, migraciones). Si hay hallazgos bloqueantes, se
corrigen o se documenta en el PR por qué no, antes de continuar — igual que exige `code-review` con
PRs ajenos. No sustituye a `Claude Approvals` ni a los tests: es la pasada que ninguno de los dos
hace (bugs de lógica, simplificación, reuso).

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

## 👥 Agrupar personas: por IDENTIDAD, nunca por la etiqueta — regla global permanente
**Cuando juntes filas que hablan de «la misma persona», agrupa por su identificador, no por su
nombre.** El nombre es la etiqueta, no la identidad, y falla en las DOS direcciones:

- **Partir a una en dos**: la misma persona escrita distinto («JUAN PEREZ LOPEZ» / «Juan Perez»), o
  enlazada a su ficha en un sitio y suelta en otro, sale duplicada. Se ve, y molesta.
- **Fundir a dos en una**: dos homónimos —un padre y un hijo en la póliza del mismo coche, dos
  huéspedes con el mismo nombre, dos empleados— colapsan en una fila **con los teléfonos, correos y
  papeles mezclados**. Esta es la cara CARA: duplicar se nota, mezclar no, y encima el resultado es
  plausible. Es el mismo fallo que el «dato leído mal» de la regla anterior.

Qué hacer: orden **identificador (DNI/NIF/CIF, id externo) → enlace a su ficha → nombre**, cayendo al
nombre SOLO cuando no hay ninguno de los dos primeros, y **dos identificadores distintos no se funden
jamás**, coincida lo que coincida el resto. Si el identificador es un dato personal, no lo saques del
backend para agrupar: emite una etiqueta opaca por respuesta (`p1`, `p2`…). Cuando la identidad acabe
siendo el nombre, dilo en la pantalla —de qué póliza/reserva sale cada cosa— y no afirmes nada más.
Caso fundacional (02/09/2026, PR #2145): «ojo con duplicar», de Alberto, sobre las personas de las
pólizas de GLOBAL 2 — tres furgonetas, tres conductores distintos.

## Responsive — regla global permanente
**Toda UI nueva o modificada en CUALQUIER vertical o app del monorepo DEBE funcionar en móvil.** Revisar en pantallas ≥320 px antes de dar un cambio por hecho. Tablas → scroll horizontal o cards apiladas; sidebars → colapsables o drawer; modales → ancho al 95 vw; botones → mínimo 44 px táctil. No basta con que "quepa" — tiene que ser usable. Si un cambio toca un componente con problemas responsive conocidos, aprovecha para corregirlos en el mismo PR.

## 📱 Medir el responsive: el `body` MIENTE en plataforma — regla global permanente
**Antes de dar por bueno que una pantalla no desborda, comprueba QUÉ elemento estás midiendo.** En
`apps/plataforma`, `LayoutShell` declara `overflowY:'auto'` sin `overflowX`; por la regla de CSS Overflow
(si un eje deja de ser `visible`, el otro computa a `auto`), **el scroller horizontal es LayoutShell, no
`<body>`**. Consecuencia medida el 02/09/2026: `document.body.scrollWidth` era 390 —igual al viewport—
mientras el contenido desbordaba a 910 px. Con esa medición se declaró «no desborda» un fallo que el
usuario estaba viendo en su móvil. Se mide sobre el scroller y sus descendientes:
`sc.scrollWidth > sc.clientWidth`, y luego los hijos cuyo `getBoundingClientRect().right` se sale.

**Y la causa más común, que además se disfraza de arreglada:** un `display:grid` sin `gridTemplateColumns`
dimensiona su pista implícita con el contenido más ancho. Una tabla con `minWidth` dentro arrastra la
página entera **y anula su propio `overflowX:'auto'`** — cuando este actúa, su contenedor ya creció. El
arreglo es `gridTemplateColumns: 'minmax(0, 1fr)'` en el grid contenedor. Pero **no siempre basta**: si lo
que no cabe es un flex cuyo min-content ya supera la pantalla (una gráfica de 12 columnas mensuales, p. ej.),
el scroll hay que ponerlo en ese elemento, no en su contenedor.

## Rendimiento UI — regla global permanente
**Ninguna página monta cientos/miles de filas de golpe.** Las listas largas (movimientos bancarios, reservas, logs…) usan: desplegables **cerrados por defecto con montaje perezoso** (el contenido solo se renderiza al abrir — OJO: un `<details>` cerrado igualmente crea todo su DOM), **paginación client-side** (~50 filas + «Ver más»), y auto-apertura cuando hay filtros activos. Las recargas tras una acción mantienen la lista visible (atenuada), sin loader a pantalla completa que desmonte todo. Patrón de referencia: `apps/plataforma/app/(usuario)/finanzas/GastosTab.tsx` (PR #666). Si un cambio toca una página que viola esta regla, aprovecha para corregirla en el mismo PR.

## Formato de dinero — regla global permanente
**Todo importe en euros se muestra en formato ESPAÑOL: `2.162,49€`** — separador de miles con punto (también
en 4 cifras: `2.000,12€`), decimales con coma, y el **€ DETRÁS** del número. NUNCA estilo dólar (`€2162.49`,
`$2,162.49`). En `apps/plataforma` usa el helper `eur()` de `apps/plataforma/lib/dinero.ts`
(`n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })` + `€`);
aplica igual en pantalla, Telegram y emails. Nada de `€${x.toFixed(2)}` suelto. Las verticales sin ese helper
replican la misma convención. Si un cambio toca una pantalla con importes mal formateados, corrígelos en el mismo PR.

## 🤖 CI: por qué un PR de Claude se queda con los checks «Expected»

**Los pushes hechos con el token de la App de Claude NO disparan los workflows de Actions** (limitación de GitHub, no un fallo del repo). Consecuencia: un PR abierto/empujado por un agente puede quedarse con los 12 checks requeridos en «Expected» para siempre.

🚨 **«Expected» NO es «Failing».** Antes de tocar nada, mira si algún check está en ROJO: si los 12 están en Expected y ninguno rojo, no hay nada roto — es que no han arrancado.

> 📚 Historial completo de las 16 mediciones que llevaron a este procedimiento (draft vs no-draft, lag de GitHub, `workflow_dispatch` no cuenta, etc.): `docs/ci-troubleshooting.md`. No hace falta leerlo salvo que el orden de abajo no resuelva.

🎯 **ORDEN DEFINITIVO, y ahorra la tarde:**
0. **Antes de nada: ¿los runs EXISTEN?** `list_workflow_runs` filtrando por rama. Si existen y están
   `completed`/`success` sobre ese head, no hay nada que desatascar — es reporte retrasado
   (DECIMOCUARTA): **reintenta el merge sin tocar nada**, aunque el `405` te jure que un check sigue
   corriendo. Los pasos 1-4 son para cuando el run NO existe.
   ⚠️ Y si el run existe pero **`list_workflow_jobs` da `total_count: 0`, eso NO prueba que esté
   muerto**: un run en cola da lo mismo (DECIMOSEXTA). Espera unos minutos antes de fabricar un head
   nuevo — esperar es gratis y el head nuevo borra la evidencia.
1. **¿`git ls-remote origin <rama>` ≠ `head.sha` del PR?** → es lag: espera 2-3 min y no toques nada (#1962).
   ⚠️ Que **coincidan no descarta el lag**, solo descarta el head viejo (#2341): si acabas de empujar, espera igual antes de tocar palancas.
2. **¿Coinciden y el PR está en DRAFT?** → sácalo de draft **y empuja algo con contenido real después**
   (el merge de `main` sirve, y encima es trabajo obligatorio si hay conflicto). Des-draftear a secas no basta.
3. **¿Coinciden, ya no es draft y sigue mudo?** → mergea `main` igualmente (es un push con contenido real).
4. Solo si eso tampoco, hace falta mano de Alberto. **Sigue prohibido**: commit vacío, cerrar y reabrir,
   rama nueva por iniciativa del agente, y tocar el ruleset.

**Regla de método: mira siempre el `event` y el `actor` de los runs antes de dar por buena cualquiera
de las versiones de esta sección.** Llevamos diez mediciones y cada modelo que ha pasado por aquí ha
escrito su explicación y la ha visto caer con el PR siguiente. Añade la medición; no reescribas las
anteriores para que encajen.

**Los 12 requeridos son nombres de JOB, no de workflow** (por eso no basta con mirar si el workflow
salió verde):

| Workflow | Jobs que aportan checks requeridos |
|---|---|
| `qa.yml` | `Análisis estático · Patrones conocidos` |
| `ci.yml` | `Lint · TypeCheck · Build` |
| `tests.yml` | `Tests (packages + guardián)` + **9** × `Typecheck · <app>` (almacen, alquiler, ia-rest, ialimp, mariscos, plataforma, rrhh, sivra, transporte) |

Los `Vercel – *` y `Vercel Preview Comments` **no están entre los requeridos**: que estén verdes no
desbloquea nada.

⚠️ **La matriz de `tests.yml` ya NO son 9 apps: son 13** — verificado leyendo el `app:` del
workflow (`.github/workflows/tests.yml:62`) el 06/09/2026: `ia-rest, ialimp, sivra, plataforma, rrhh,
transporte, alquiler, almacen, mariscos, asegura, asegura-portal, asegura-web, housesevillana` (se
añadió `asegura` el 26/08, `housesevillana` el 27/08, `asegura-portal` después y **`asegura-web`**
al crearla el 04/09). Los 9 de la tabla son los que el **ruleset exige**; los cuatro nuevos **corren
pero no consta que sean requeridos** (el ruleset no se lee desde aquí, así que no se afirma). Cuenta
los nombres del workflow antes de citar esta cifra: **se ha quedado corta TRES veces ya** — la
última, este mismo apartado diciéndose «son 12» mientras el workflow ya corría 13. `housesevillana` llevaba desde el 12/08 en el monorepo **fuera de la matriz**, y por eso
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

🚨 **Y OJO CON GENERAR DOS APPS A LA VEZ: el cliente por defecto de Prisma es UNO
SOLO para todo el monorepo** (`node_modules/.pnpm/@prisma+client@…/@prisma/client`).
Cada `prisma generate` de una app lo **sobrescribe**, así que generar plataforma
deja el typecheck de asegura en rojo con errores que parecen de código —
`Property 'companiaDgs' does not exist on type 'PrismaClient'`, enums a los que
«les faltan» valores— en ficheros que nadie ha tocado. Medido el 02/09/2026 con
dos agentes trabajando en paralelo: **`main` estaba sana y el rojo era local.**
En CI no pasa porque cada `Typecheck · <app>` corre en su propio job. Antes de
diagnosticar un typecheck rojo en local, **regenera el cliente de ESA app y
repite** — y si estás corriendo trabajos en paralelo sobre dos apps, no te fíes
del typecheck de la que no generaste la última.
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
    🚨 **Pero el marcador NO basta por sí solo: hacen falta DOS condiciones a la vez**, y saltarse
    cualquiera deja el build saltado sin que nada falle. Medido el 02/09/2026 fallando las dos, una detrás
    de otra (PR #2054):
    1. **Tiene que ir en el asunto del ÚLTIMO commit del push.** El script lee `VERCEL_GIT_COMMIT_MESSAGE`
       (`scripts/vercel-ignore-build.mjs:42`), que es el asunto del commit del deployment, o sea el HEAD
       empujado. *Primer fallo:* se marcó el commit de la migración y después se hicieron dos commits más
       (memoria y un merge de `main`); el deployment tomó el asunto del merge, que no lo llevaba.
    2. **Ese mismo commit tiene que TOCAR la app**, o un `packages/*` que ella declare, o un manifiesto
       raíz (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`). `[preview]` solo levanta el veto de
       `--sin-previews` (paso 1b del script); **el paso 3 salta igual si el commit no afecta a esa app**.
       *Segundo fallo:* se repitió el marcador en un commit que solo tocaba este `CLAUDE.md` de la raíz —que
       NO está entre los manifiestos— y `Vercel – plataforma` volvió a salir `Canceled by Ignored Build Step`.
    En los dos casos la consecuencia era la misma: **43 pantallas con el aspecto cambiado camino de
    producción sin haberse visto nunca**, que es justo lo que el `[preview]` pretendía evitar. Y en los dos
    el síntoma es idéntico a un build legítimamente ignorado, así que **compruébalo en el status de Vercel
    del PR en vez de darlo por hecho**.
    ialimp NO lo lleva a propósito: cliente vivo (Sique Brilla) → ahí sigue la regla «preview verde antes de main».
    🔥 **Y LA TRAMPA CARA, medida el 04/09/2026 (PR #2281): `[preview]` NO es por app — es un
    interruptor GLOBAL, y en un commit de MERGE construye las once.** El marcador levanta el veto
    de `--sin-previews` en **todos** los proyectos a la vez (paso 1b del script mira solo el asunto,
    no qué app es), así que lo único que después decide es el paso 3: «¿el commit toca esta app?».
    Y el diff de un **commit de merge** contra su primer padre **es todo lo que traía `main`** —
    incluidos `pnpm-lock.yaml` y el `package.json` raíz, que están en la lista de manifiestos. O sea:
    marcar con `[preview]` un merge de `main` = **once builds de preview de golpe**, por un cambio
    que solo tocaba una app. Medido: los 11 `Vercel – *` salieron `Deployment has completed`, **cero
    `Canceled by Ignored Build Step`**. Es la misma familia que el incidente de los ~600 US$ (PR #904),
    disparada por el mecanismo puesto para ahorrar.
    **Cómo se pide una preview sin pagar diez:** el `[preview]` va en un commit **normal que toque solo
    esa app**, y ese commit tiene que ser el **último** del push (el script lee el asunto del HEAD).
    Si además hay que mergear `main`, mergea PRIMERO —sin marcador— y deja el commit marcado encima;
    al revés, el merge se come el asunto y de paso construye todo. Y si el último commit acaba siendo
    un merge, **quítale el `[preview]`** y renuncia a la preview antes que pagar once.
  - 🟡 **Y el falso positivo al revés (02/09/2026): «Building» NO significa que se vaya a construir.** Al
    empujar, el comentario de Vercel del PR pinta los proyectos en **Building** durante unos segundos y
    LUEGO pasan a `Ignored`: el `ignoreCommand` corre DENTRO del deployment, así que el estado intermedio
    existe siempre. Ese día se estuvo a punto de dar la alarma de «se están construyendo los once
    proyectos, como en el incidente de los 600 US$» **dos veces**, leyendo esos comentarios intermedios.
    El estado que vale es el FINAL: `get_status` sobre el head del PR, donde cada `Vercel – *` dice
    `Canceled by Ignored Build Step`. No diagnostiques gasto desde un comentario que se reescribe solo.
  - 🚦 **Y `Ignored` NO ES GRATIS DEL TODO: hay una SEGUNDA cuota, y esa sí la agota un agente
    (04/09/2026).** El `ignoreCommand` corta el **build**, no la **creación del deployment**: Vercel
    crea los once igualmente y solo después decide no construirlos. Y el límite
    `api-deployments-paid-per-hour` (**450/h, de cuenta, no de proyecto**) cuenta **deployments
    creados**. Medido: siete pushes seguidos a una rama de PR × 11 proyectos, más el tráfico del
    automerge del repo, y la cuenta entera se quedó en `Resource is limited - try again in 60
    minutes` — con **los despliegues de PRODUCCIÓN de `ia-rest`, `almacen`, `transporte` y
    `house-sevillana-landing` fallando** por una rama que no tocaba ninguno de ellos.
    🚨 Lo que esto CORRIGE: durante esa hora se informó tres veces de «0 gasto, todos `Ignored`».
    Era cierto sobre los Build CPU Minutes y **falso sobre la cuota de deployments** — o sea, la
    frase «Ignored = no cuesta nada» de este apartado vale para la factura y no para el límite. La
    regla operativa es de RITMO, no de configuración: **empujar a una rama de PR cuesta 11
    deployments cada vez**, así que se verifica en local (typecheck + tests, ver más abajo) y se
    empuja UNA vez; encadenar pushes «a ver si arranca el CI» es justo lo que revienta la cuota.
    Mergear un PR no crea previews. Y si aparece ese error, no es un fallo del repo: se espera.
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
