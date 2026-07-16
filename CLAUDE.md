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
- **`apps/almacen`** — gestión de almacén de eventos/catering para el cliente **Joaquín Jaén** (Fase 1: maestro
  por familias/materiales; orquestación de evento completa en curso). Compone `@central/module-materiales`
  (dep `workspace:*`, no `file:`). BD compartida (rol propio pendiente de confirmar). Desplegada 15/07/2026
  (Vercel `almacen`, tenant DEMO poblado; tenant real de Joaquín aún sin sembrar). **Aún sin `apps/almacen/CLAUDE.md`
  propio** — ver `docs/CONTEXTO-SESIONES.md` (entrada 15/07/2026) y `docs/ALMACEN-JJ-reunion-y-auditoria.md`
  mientras tanto.

## Módulos compartidos (`packages/*`, fuente TS pura, portables)
> **Scope npm = `@central/*`** (renombrado desde `@iarest/*` el 11/06/2026, antes de tener clientes).
- `@central/core-ai`, `@central/core-fiscal`, `@central/core-push`, `@central/core-storage`, `@central/core-email`, `@central/core-identity`, `@central/core-telegram`.
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
Al terminar, actualiza `docs/CONTEXTO-SESIONES.md` (entrada nueva arriba). El hook `Stop`
(`.claude/hooks/persist-memoria.sh`) lo commitea y empuja.

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
