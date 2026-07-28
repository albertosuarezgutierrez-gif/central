# Bitácora de auto-aplicados — `central`

> **Para qué (idea G).** El **carril 1** de la auditoría diaria empuja los arreglos de texto
> (memoria/skills/docs/manuales) **directos a `main` sin que nadie los revise**. Esta bitácora
> es la transparencia de ese "se aplica solo": cada cambio auto-aplicado deja una línea aquí
> para que Alberto lo ojee de un vistazo y, si algo no le cuadra, lo revierta (queda en git).
>
> **Cómo se mantiene.** La propia auditoría añade entradas arriba del todo, en el mismo commit
> del cambio auto-aplicado. Formato por entrada: **fecha · archivo(s) · qué cambió · por qué ·
> SHA**. Lo que va por **carril 2 (PR draft + aviso)** NO entra aquí (ya tiene su PR como rastro).

---

## Registro (lo más reciente arriba)

- **2026-07-28 (ligera)** · sin archivos de reconciliación (nada que auto-aplicar) · rango desde la
  última auditoría (26/07 08:42, profunda) trae 25 commits, pero **todos** los que tocaban código
  (token de rutina en BD #1106, fix 401 en silencio #1104, pricing raíles a plataforma #1101, exime
  rutas del gate #1102, auto-envío cortesía #1096 — este del rango de la profunda anterior) ya
  reconciliaron memoria/skill en su propio commit el mismo día; el resto son `docs(memoria)`/
  `chore(auditoría)` de las propias sesiones. Verificado: `docs/SKILLS.md` cuadra con `.claude/skills/`
  (31) + `.claude/commands/` (3); regla «amortizable NUNCA de oficio» (dictado 02/07/2026) consistente
  en las 3 skills que la citan (`perfil-fiscal`, `facturas-correo`, `plataforma-maestro`), sin
  contradicción. Heartbeat de crons: 2 `⛔ MUDO` brutos, ambos falso positivo confirmado por Vercel
  MCP — `limpiadoras/auto-sessions` (`GET .../auto-sessions` 200 a las 05:00 UTC de hoy, patrón
  idempotente ya documentado el 02/07) y `updates/sync` (`GET .../updates/sync` 200 a las 05:00 UTC de
  hoy; el histórico de `incomes.createdAt` muestra huecos de 1–3 días como norma — 62h sin fila nueva
  no es anómalo con solo 4 pisos). **Hallazgo nuevo, carril 2:** `apps/plataforma/lib/banca.ts:537`
  (`getSerieCobrosPisos`) sigue con `make_interval(months => ${meses - 1})` **sin** el cast `::int` ya
  aplicado en las líneas 821/924 del mismo archivo — mismo landmine que causó el bug de
  `ia_director_aprendizaje` cerrado el 26/07 (PR #1094). Función actualmente **sin consumidor** (nota
  ya en `plataforma-maestro`), así que no rompe nada en producción hoy, pero explotaría en cuanto
  alguien la reenganche. PR draft `claude/auditoria-diaria-2026-07-28` con el fix de una línea.
- **2026-07-27 (ligera)** · `docs/FUENTES-DE-VERDAD.md` · fila de skill `sivra-maestro` corregida:
  decía solo `apps/sivra/**`, pero la gestión interna que la skill documenta (agente huésped,
  pricing, mensajería) vive en `apps/plataforma/lib/sivra/**` + `apps/plataforma/app/api/sivra/**`
  (ver `CLAUDE.md` raíz: "la gestión interna vive en `apps/plataforma` (`/sivra/*`)") · sin la fila
  correcta, un cambio en el agente huésped (como el de ayer, PR #1096) no dispara el chequeo de
  frescura de `sivra-maestro` en esta misma auditoría · commit de esta auditoría.
  Resto de la pasada sin drift: rango desde la última auditoría (26/07 08:42) trae solo 2 commits
  de código, ambos ya con memoria/skill reconciliadas en el mismo commit (PR #1096, auto-envío de
  cortesía). `docs/SKILLS.md` cuadra con `.claude/skills/`+`.claude/commands/` (31 skills, 3
  comandos). Heartbeat de crons: 3 `⛔ MUDO` brutos, los 3 investigados sin acción — `trading_paper_track`
  e `ia_director_aprendizaje` (Monday-only crons de 10:00/05:00 UTC) aún no habían corrido hoy en el
  momento de la pasada (~02:00 UTC), su diagnóstico y logging ya quedaron cerrados el 26/07;
  `limpiadoras/auto-sessions` y `updates/sync` confirmados como falso positivo por Vercel MCP (ambos
  `GET .../auto-sessions` y `.../updates/sync` devolvieron 200 a las 05:00 UTC del 26/07, simplemente
  sin filas nuevas que insertar ese día — mismo patrón idempotente ya documentado el 02/07/2026).
  Sin hallazgos de carril 2 → sin PR, sin Telegram.

- **2026-07-26 (2, profunda)** · `docs/CONTEXTO-SESIONES.md`, `MATRIZ.md` · entrada nueva para el fix
  de build de ia-rest sin anotar (`/restaurantes` timeout, PR #1076, 23/07 — fuera del rango de la
  pasada ligera de hoy, lo cazó la profunda al mirar desde el 23/07) y corregido el conteo de
  `MATRIZ.md:24` ("24 modules total" → "37 packages total: 25 module-* + 12 core-*/brand/legal-templates",
  verificado con `ls packages/`) · pasada **PROFUNDA** semanal (`--profunda`): integridad estructural +
  typecheck/tests 8 apps + seguridad multi-tenant + infra MCP, ejecutada en paralelo a la pasada ligera
  de esta misma madrugada (sesión distinta) — se evitó duplicar su hallazgo de `ia_director_aprendizaje`
  (ya diagnosticado y con PR #1089 abierto) y en su lugar se AÑADIERON hallazgos propios de esta pasada
  (seguridad RLS/grants, doc `file:`/`workspace:` de ia-rest) al mismo PR de hoy en vez de abrir uno
  duplicado · commit de esta auditoría

- **2026-07-26** · `docs/CONTEXTO-SESIONES.md` · entrada nueva resumiendo la auditoría ligera de
  hoy: checks estructurales OK (sin drift); `ia_director_aprendizaje` seguía ⛔ MUDO desde el 21/07
  sin diagnóstico real ("pendiente de diagnosticar igual que el paper-tracker") — hoy se investigó a
  fondo (índice/grants/query fuente OK, causa exacta no aislada por falta de logging) → carril 2
  (logging + PR + Telegram); `trading_paper_track` reconfirma el diagnóstico ya cerrado el 21/07
  (prematuro, no roto, resuelve el 27/07); `trading_cohetes_track` en 0 es el mismo patrón esperado
  (primer rebalanceo aún no corre) · commit de esta auditoría

- **2026-07-23** · `docs/CONTEXTO-SESIONES.md` · añadida entrada que faltaba para el fix responsive
  «Ingresos por revisar» (PR #1070, commit `3196d2a`, 22/07 23:29) · era el único commit del rango sin
  reconciliar: el resto (EMASESA #1071, consejo fiscal #1072, universo trading 550→800 #1069, EDGAR
  IFRS #1061, monitor pricing por-piso #1064, guardián de precios #1065) ya se auto-documentó en su
  propio commit · pasada ligera diaria, rango 18 commits desde `ecf8265` (última auditoría, 22/07) hasta
  `a93c794` · heartbeat de crons: 3 ⛔ MUDO — `ia_director_aprendizaje` y `trading_paper_track` ya
  diagnosticados y en seguimiento desde el 21/07 (esperados vacíos hasta el 27/07); `updates/sync`
  (`incomes`, 53h) investigado y **falso positivo**: logs de Vercel confirman `GET /api/sivra/updates/sync
  200` a las 05:00 UTC tanto el 21/07 como el 22/07 — el cron corre bien, simplemente Smoobu no tuvo
  reservas nuevas/modificadas en esa ventana de 2 días (mismo patrón que `limpiadoras/auto-sessions`
  documentado el 03/07). Estructura: `ignoreCommand` presente en las 8 apps, ningún `vercel.json` falta,
  lockfile limpio, `apps/` fuera de `.vercelignore` raíz, sin cambios de dependencias en el rango.
  `docs/SKILLS.md`/`FUENTES-DE-VERDAD.md` sin drift (ninguna skill nueva; los 3 skills tocados en el rango
  ya se actualizaron en su propio commit). Sin cambios en `apps/ia-rest` en el rango → manuales n/a.
  Carril 2 vacío; sin Telegram (frugalidad) · commit de esta auditoría

- **2026-07-22** · `docs/RUTINAS-PROGRAMADAS.md`, `docs/FUENTES-DE-VERDAD.md` · añadida ficha "12.
  Monitorización — watchdog trading + latidos de agentes" (crons Vercel `trading-watchdog` +
  `agentes-latido`, `lib/monitoring/latidos.ts`) a la tabla de rutinas + resumen de cadencias, y su
  fila en el mapa de frescura · el PR #1058 (21/07) los introdujo y ya los documentó dentro de
  `.claude/commands/auditoria-diaria.md` (paso 2-bis) pero `RUTINAS-PROGRAMADAS.md`/
  `FUENTES-DE-VERDAD.md` se quedaron sin la ficha correspondiente · pasada ligera diaria, rango 54
  commits desde `c29315c` (20/07) hasta `ecf8265` (21/07) · resto del rango ya bien reconciliado
  (memoria/skills-fiscal ya actualizadas en los propios commits de sesión: `fb575f4` Socorro SL 2025,
  `25f7343` guardería Estrella Polar); heartbeat de crons sin novedades (`trading_paper_track` e
  `ia_director_aprendizaje` siguen ⛔ MUDO pero ya diagnosticadas/tracked desde el 21/07, próxima
  revisión real 27/07); estructura/lockfile/`ignoreCommand` de las 8 apps OK; tests nuevos de
  `latidos`/`watchdog` verificados 10/10 · commit de esta auditoría

- **2026-07-20** · `docs/SKILLS.md`, `.claude/skills/plataforma-maestro/SKILL.md`,
  `docs/RUTINAS-PROGRAMADAS.md`, `docs/FUENTES-DE-VERDAD.md` · corregidos los 3 docs que aún
  describían `trading-analista` como "bloqueado por infra" (el egress 403 + `ALERTA_TOKEN`
  desincronizado se resolvieron y verificaron end-to-end el 19/07/2026, pero el drift de texto
  quedó sin propagar); pendiente #10 de `RUTINAS-PROGRAMADAS.md` (envs de las rutinas 1-2 de
  `/auditoria-diaria`) marcado resuelto — verificado hoy que el entorno de esta misma rutina ya
  tiene `PLATAFORMA_URL`/`ALERTA_TOKEN` y alcanza Vercel sin 403; añadida la ruta de UI
  `app/(usuario)/trading/**` que faltaba en `FUENTES-DE-VERDAD.md` · pasada ligera diaria, rango 22
  commits desde `dd0883c` (19/07) hasta `6baddf1` · commit de esta auditoría

- **2026-07-19 (2)** · `docs/AUDITORIA-2026-07.md` (+ merge del PR #1006 pendiente) · pasada
  **PROFUNDA** semanal (`--profunda`): integridad + typecheck 8/8 apps + tests + seguridad + deps +
  infra real MCP + docs, todo en verde salvo 2 hallazgos 🔴 reales. **Deuda de proceso resuelta primero**:
  la pasada ligera de esta madrugada había dejado sus reconciliaciones de carril 1 en el PR draft #1006
  en vez de `main` (desviación); verificado correcto (CI verde, solo texto) → mergeado en vez de duplicar
  el trabajo. Hallazgos: 🔴 bypass de auth por User-Agent en `apps/rrhh/.../alerta-jornada-maxima`
  (contradecía la regla ya escrita en `apps/rrhh/CLAUDE.md`) — **arreglado** (carril 2, va en el PR de
  hoy). 🔴 `v_movimientos_activos` recreada sin `security_invoker=true` en 2 migraciones de junio/julio,
  perdiendo el fix de la remediación de junio — **NO aplicado** (regla: nunca migraciones en producción
  desde la auditoría), migración propuesta en el PR. 🟡 webhook `deploy-aprendizaje` de ia-rest fail-open
  si falta el secret — **arreglado**. Resto (audit de deps, segundo proyecto Supabase ya conocido, gap de
  visibilidad Vercel) documentado sin acción. Informe completo: `docs/AUDITORIA-2026-07.md` (sección
  "Auditoría PROFUNDA — 19/07/2026"). Carril 2: PR draft con los 2 fixes + la migración propuesta +
  aviso Telegram.

- **2026-07-19** · `docs/RUTINAS-PROGRAMADAS.md`, `docs/SKILLS.md`, `docs/FUENTES-DE-VERDAD.md`,
  `.claude/skills/plataforma-maestro/SKILL.md`, `docs/AUDITORIA-2026-07.md` · pasada **ligera** diaria,
  rango: todo el 18/07 (50 commits, `f5bec95`→`fc18bb3`, sobre todo trading Fase B + pricing R1-R8 +
  plataforma). Reconciliado: (1) el trigger de `trading-analista` YA EXISTE y corrió el 18/07 (dio 403 de
  red hacia Vercel, según la propia memoria) pero `RUTINAS-PROGRAMADAS.md`/`SKILLS.md` lo seguían
  describiendo como "pendiente de crear" — corregido a "creado, bloqueado por infra" con los 2
  bloqueadores reales (falta `ALERTA_TOKEN` en su entorno + allowlist de red); verificados por Supabase
  MCP los 3 prerrequisitos (watchlist 13 filas, `broker_saldos` sembrado) — ya cumplidos, no pendientes.
  (2) `FUENTES-DE-VERDAD.md` ampliada: la fila `trading-analista` solo mapeaba 2 endpoints, el paquete
  creció a 13. (3) `plataforma-maestro/SKILL.md`: fila trading-analista con el mismo desfase + faltaba la
  tarjeta de saldo IBKR en la vista Dinero (PR #984) — añadida, sello `verificado` refrescado a 19/07.
  (4) Informe en `docs/AUDITORIA-2026-07.md` (sección "Auditoría LIGERA — 19/07/2026"). Heartbeat 9/9 ✅,
  lockfile limpio, memoria (`CONTEXTO-SESIONES.md`) ya al día (autoanotada pese al volumen). Carril 2
  vacío; sin Telegram (frugalidad).

- **2026-07-18** · `docs/SKILLS.md`, `docs/FUENTES-DE-VERDAD.md`, `MATRIZ.md`,
  `.claude/skills/plataforma-maestro/SKILL.md`, `docs/AUDITORIA-2026-07.md` · pasada **ligera** diaria,
  rango: todo el 17/07 (sin pasada previa completa) + `f5bec95` (18/07). Reconciliado: (1) skill
  `trading-analista` (nacida 17/07) añadida a `SKILLS.md` y `FUENTES-DE-VERDAD.md` — no estaba en
  ninguno. (2) `MATRIZ.md` corregida: la fila `almacen` decía que `vercel.json` seguía sin
  `ignoreCommand` — falso, se añadió el 17/07 (PR #945); se deja nota de los 2 PR draft duplicados
  (#917/#936) que ya cubren el hueco de la matriz de typecheck. (3) `plataforma-maestro/SKILL.md`: su
  tabla "Dónde vive cada cosa" no mencionaba ninguna de las 3 piezas grandes nacidas el 17/07 (Empresas
  en dificultad/BORME, Director de código, `trading-analista`) — añadidas las 3 filas, sello
  `verificado` refrescado 16/07→18/07. (4) Informe de la pasada en `docs/AUDITORIA-2026-07.md`
  (sección "Auditoría LIGERA — 18/07/2026"). Heartbeat 9/9 ✅, lockfile limpio, memoria
  (`CONTEXTO-SESIONES.md`) ya estaba al día — sin huecos. Regla fiscal `amortizable=NUNCA` verificada
  sin contradicción. Carril 2 vacío (nada de código que arreglar); sin Telegram (frugalidad).

- **2026-07-17 (2)** · `.claude/commands/auditoria-diaria.md`, `docs/RUTINAS-PROGRAMADAS.md` ·
  **causa raíz de por qué esta pasada no pudo avisar por Telegram:** el comando seguía
  documentando el mecanismo VIEJO (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` directos, curl a la
  Bot API) que el pendiente de seguridad #9 de `RUTINAS-PROGRAMADAS.md` sustituyó hace días por
  `PLATAFORMA_URL`+`ALERTA_TOKEN` → `POST /api/internal/alerta` (token de bajo privilegio,
  precisamente para NO tener el bot token maestro en claro en el prompt de una rutina). Nadie
  actualizó el comando cuando se hizo el cambio → seguía pidiendo unas envs que, bajo la
  arquitectura correcta, nunca debían estar ahí. Corregidas las 3 menciones del comando + las
  filas de envs de las rutinas 1 y 2 en `RUTINAS-PROGRAMADAS.md`; añadido pendiente #10 (Alberto
  tiene que añadir `PLATAFORMA_URL`/`ALERTA_TOKEN` al campo "Instrucciones" de ambas rutinas en
  la UI — sin eso el aviso seguirá omitiéndose con gracia, ahora por la razón correcta).

- **2026-07-17** · `docs/CONTEXTO-SESIONES.md`, `apps/rrhh/CLAUDE.md`, `apps/rrhh/public/manual.html`,
  `docs/SKILLS.md`, `docs/FUENTES-DE-VERDAD.md`, `.claude/skills/plataforma-maestro/SKILL.md`,
  `apps/plataforma/CLAUDE.md` · pasada **ligera** diaria, rango `6078089..HEAD` (30 commits, 16/07).
  Reconciliado: (1) 2 entradas de memoria que faltaban — rrhh calendario de fichaje + alerta
  Telegram + recordatorio push (PR #933) y fix responsive del libro de movimientos en `/banca`
  (PR #932), ninguna había tocado `CONTEXTO-SESIONES.md`. (2) `apps/rrhh/CLAUDE.md`: añadidos
  `@central/core-telegram` (nuevo, PR #933) y `@central/module-nominas` (ya en `next.config.ts`
  pero ausente del doc desde antes de este rango) a "Packages consumidos"; nueva sección "Crons"
  con los 2 crons nuevos + el de nóminas ya existente. (3) `apps/rrhh/public/manual.html` §11:
  añadido el calendario visual del portal del empleado y los avisos automáticos (push al
  trabajador, Telegram al responsable) — no estaban documentados. (4) Skill `delegar-codigo`
  (nacida el 16/07, PR #922) no estaba en `docs/SKILLS.md` — añadida fila en "Desarrollo"; y su
  fila en `docs/FUENTES-DE-VERDAD.md` (compartida con `code-map`) ampliada con los paths de la
  Fase 1.5/2 (`scripts/ai-ejecutar.mjs`, `scripts/ai-programar.mjs`, `api/ai/{ejecutar,programar}`,
  `lib/programador.ts`, `ai-programar.yml`). (5) **Referencia obsoleta a `TabsDineroNegocios.tsx`**
  (borrado en el PR #928, sustituido por `SegTabs.tsx`) sobrevivía en el primer párrafo de la
  sección de fusión Resumen+Banca de `apps/plataforma/CLAUDE.md` y de `plataforma-maestro/SKILL.md`
  — el propio PR #928 había corregido un párrafo más abajo pero dejó el primero contradiciéndose;
  corregidas ambas menciones. (6) Sello `verificado: 2026-07-03` de `plataforma-maestro/SKILL.md`
  refrescado a `2026-07-16` (el doc SÍ se editó ese día en los PRs #927/#928, solo faltaba bump
  del sello). Heartbeat de 9 crons: **9/9 ✅**. Tests de packages/guardián: verdes (`pnpm test`
  tras `pnpm install` limpio; `pnpm-lock.yaml` revertido, la instalación solo reordenó metadata
  de resolución de peer-deps sin cambiar versiones). **Carril 2** (código, no aquí): `apps/almacen`
  seguía fuera de la matriz de typecheck de `.github/workflows/tests.yml` (ya flagged el 16/07,
  sin arreglar); verificado ahora con install completo que `tsc --noEmit` da 0 errores en
  `apps/almacen` → añadido a la matriz en el PR draft, con esa verificación como evidencia de que
  no rompe el gate bloqueante. `apps/almacen/CLAUDE.md` sigue sin existir (deuda ya conocida,
  no acotada para carril 1).

- **2026-07-16** · `CLAUDE.md` (raíz), `MATRIZ.md`, `docs/CONTEXTO-SESIONES.md`,
  `docs/ROADMAP-rrhh.md`, `apps/rrhh/CLAUDE.md`, `docs/FUENTES-DE-VERDAD.md` · pasada **ligera**
  diaria, rango `697a321..ff267bf` (11 commits, 15/07). Reconciliado: (1) **`apps/almacen`
  faltaba por completo** de la lista de "Verticales" del `CLAUDE.md` raíz y de la tabla/árbol de
  `MATRIZ.md` pese a estar desplegada desde el 15/07 (PR #902 + #914-#916) — añadida, con nota de
  que aún no tiene `CLAUDE.md` propio. (2) El **módulo PRL de `apps/rrhh`** (PRs #908/#912/#913:
  autorización de maquinaria, EPIs, riesgos art.18, confidencialidad RGPD, descarga con
  certificado eIDAS) no estaba anotado en la memoria ni en `apps/rrhh/CLAUDE.md` (rutas
  `/admin/prl`, endpoints, `lib/plantillas-prl.tsx`/`lib/certificado-firma.tsx`) → añadido en
  ambos; `docs/ROADMAP-rrhh.md` marca "hecho" el ítem 🔴 "PRL + entrega de EPIs" (el ítem distinto
  "encargo de tratamiento art.28" sigue abierto). (3) La entrada de memoria de la infraventa Karol
  G (15/07) describía la regla anti-hundimiento de precio como "candidata" cuando **ya se
  implementó el mismo día** (PR #911) → corregida. (4) Fila nueva en `docs/FUENTES-DE-VERDAD.md`
  para `docs/ROADMAP-rrhh.md`. Heartbeat de 9 crons: **9/9 ✅**. `pnpm-lock.yaml` incluye
  `apps/almacen` (íntegro). **Carril 2** (código, no aquí): `apps/almacen/vercel.json` sin
  `ignoreCommand` (el mismo problema que causó la factura de 754 US$ de Vercel — PR #904 lo
  arregló en 7 apps pero `almacen` se creó después y quedó fuera) + `apps/almacen` ausente de la
  matriz de typecheck de `.github/workflows/tests.yml` (mismo blind-spot que motivó añadir `rrhh`
  a esa matriz) → PR draft + aviso.
- **2026-07-15** · `.claude/skills/plataforma-maestro/SKILL.md` · pasada **ligera** diaria, rango
  `36ac08a..1e6b8b5` (5 commits, 14/07). La memoria (`CONTEXTO-SESIONES.md`) ya tenía anotados
  los 5 commits del rango (tickets de súper F5a #894, fix multi-tenant de `facturas-scan` #896,
  auditoría contable #897, memoria Luxury #898, fix crash `/banca` + unificación con Radiografía
  #900) pero la skill `plataforma-maestro` seguía diciendo "módulo 🛒 tickets de súper queda para
  F5" (ya entregado) y no mencionaba la redirección `/finanzas/radiografia`→`/banca` ni el
  landmine de `periodoLabel` (función exportada de un módulo `'use client'` llamada desde un
  server component, no la cazan `tsc`/`next build`) → línea actualizada con lo real + ambos
  añadidos. Heartbeat de 9 crons: **9/9 ✅**. `pnpm install --frozen-lockfile` limpio. Tabla
  `tickets_compra`/`tickets_lineas` sigue **sin aplicar** en Supabase (ya lo tenía anotado la
  memoria como pendiente de Alberto; el endpoint degrada mientras tanto). Sin hallazgos de
  carril 2 (nada raro, ningún cron mudo) → sin PR, sin Telegram.
- **2026-07-14** · `apps/plataforma/CLAUDE.md`, `.claude/skills/plataforma-maestro/SKILL.md`,
  `docs/SKILLS.md` · pasada **ligera** diaria, rango `534e792..221cce6` (21 commits, 13/07). La
  memoria (`CONTEXTO-SESIONES.md`) ya tenía anotada toda la arquitectura de la "banca unificada"
  Fase 4 (9 PRs #882/#886-893: `/banca` period-driven + 6 extras de IA GRATIS — cazador de
  deducciones, mini-chat, sugerir por fila, benchmark entre pisos, fugas en recurrentes,
  antifraude determinista, cierre de mes narrado) pero **ni el `CLAUDE.md` de plataforma ni la
  skill `plataforma-maestro` la mencionaban** → añadida una entrada consolidada en cada uno,
  mismo tono que las entradas vecinas. Además, `docs/SKILLS.md` no listaba la skill
  `adobe-diseno` (añadida el 12/07 en `84bf925` junto al enrutado en `central-maestro`, que sí
  la referencia) → fila nueva en sección "Diseño". Heartbeat de 9 crons: **9/9 ✅**. `pnpm install
  --frozen-lockfile` limpio. Sin hallazgos de carril 2 (nada raro, ningún cron mudo) → sin PR,
  sin Telegram.
- **2026-07-13** · `docs/CONTEXTO-SESIONES.md`, `.claude/skills/perfil-fiscal/SKILL.md` · pasada
  **ligera** diaria, rango `b25d557..a1382a4` (26 commits, 12/07). 3 PRs del 12/07 se habían mergeado
  sin anotar en memoria (#841 traspasos internos fuera de "Ingresos por revisar", #843 prestación de
  paternidad EXENTA de IRPF, #844 conocimiento de dominio en el prompt contable + de-duplicar bandejas)
  → entrada nueva consolidada arriba del todo. `perfil-fiscal`: la regla de exención (Art. 7.h LIRPF,
  `subcategoria='exento'`) resuelve el pendiente "Sueldo −1.440€ por la baja" que llevaba abierto desde
  antes → sustituido por la regla real + sello `verificado: 2026-07-13`. Heartbeat de 9 crons: todo ✅
  (sin cron mudo). Resto del rango (23 commits) ya estaba bien reflejado en memoria por las propias
  sesiones. · commit de esta auditoría

- **2026-07-12** · `docs/CONTEXTO-SESIONES.md`, `.claude/skills/plataforma-maestro/SKILL.md`,
  `MATRIZ.md`, `.claude/skills/auditoria-central/SKILL.md` · auditoría **profunda** semanal (domingo).
  Memoria: 2 "PENDIENTE: merge del PR" obsoletos corregidos a MERGEADO (PR #824/`a091102` agente
  contable concepto∩negocio; PR #823/`9eb220c` alertas limpiezas) — ambos ya en `main`. Skill
  `plataforma-maestro`: fila "Pasarela de IA central" no reflejaba los fixes de fiabilidad de
  OpenRouter del 11/07 (PRs #828/#829: suplentes de pago, `:floor` opt-in, reintento con modelo
  seguro) — añadido. `MATRIZ.md`: la regla "las apps consumen `packages/*` con `file: deps`" ya no
  es cierta para 6 de 7 apps (migraron a `workspace:*`; solo `rrhh` sigue en `file:`) — corregida.
  Skill `auditoria-central`: el checklist decía "3 schemas Prisma" (obsoleto, ahora son 6: ialimp,
  sivra, plataforma, rrhh, transporte, alquiler — confirmado por el agente de typecheck de esta
  auditoría, que encontró falsos positivos en sivra por no regenerar su client). Heartbeat de crons:
  2 falsos ⛔ (`updates/sync`, `limpiadoras/auto-sessions`, ambos a las 05:00 UTC) verificados como
  ✅ reales vía logs Vercel (200 OK) — el "MUDO" era por ausencia de actividad nueva ese día, no por
  fallo del cron. Hallazgos de código/infra (seguridad Supabase, proyecto `efncqyvhniaxsirhdxaa` vs
  `wswbehlcuxqxyinousql` para ia-rest, Vercel) van al PR draft de carril 2 + aviso — no se auto-aplica
  nada de eso. Rango: commits desde `f5e5a6c` (07/07, última auditoría profunda registrada) hasta
  `b9fb1fb` (11/07) · commit de esta auditoría

- **2026-07-09** · `docs/CONTEXTO-SESIONES.md`, `.claude/skills/plataforma-maestro/SKILL.md`,
  `docs/FUENTES-DE-VERDAD.md` · añadida entrada de memoria para 2 fixes sin anotar (#795 Director
  limpia fences JSON + test `apellidos` roto desde #793; #786 typecheck `eur()` null en concursos);
  actualizada la fila "Pasarela de IA central" del skill `plataforma-maestro` (describía la pasarela
  pre-OpenRouter — el PR #794 la reescribió entera: OpenRouter primario, Agente Director, presupuesto
  por cliente, caché semántica — y el propio `apps/plataforma/CLAUDE.md` ya lo tenía pero el router
  maestro no); añadida fila `buscador-ia`→`packages/core-ai` al mapa (faltaba pese a ser justo su
  objeto de vigilancia) · pasada ligera diaria, rango 20 commits desde `d6bfb17` (07/07 07:04, última
  auditoría) hasta `0f2b115` (09/07 11:17); heartbeat de crons 9/9 ✅ · commit de esta auditoría

- **2026-07-07** · `docs/CONTEXTO-SESIONES.md` · 3 entradas de memoria reconciliadas sin anotar: fix
  'Cargando…' infinito en Categorías modo Año fiscal (PR #759), extracción de facturas Groq→NIM con
  respaldo + aviso PDF ilegible + ventana `?horas` (PR #760), y ampliación del follow-up del
  auto-clasificar (PR #764: keywords de comercios locales de Sevilla + timeout/presupuesto reducidos
  para no dar 504) · commits del 06/07 sin anotar (el resto del rango 03/07→07/07 ya estaba cubierto);
  heartbeat de los 9 crons vigilados (Supabase, `wswbehlcuxqxyinousql`) todo ✅, sin crons mudos ·
  pasada ligera diaria, rango desde `992d517` (05/07 02:06, última auditoría) hasta `ac74696` (06/07
  23:56) · commit de esta auditoría

- **2026-07-05** · `docs/CONTEXTO-SESIONES.md`, `.claude/skills/correo-triaje/SKILL.md`,
  `apps/plataforma/CLAUDE.md` · corregida la entrada 🔴 "cron `correo-triaje` MUDO" (04/07) a
  RESUELTO (heartbeat Supabase: actividad hace 3,4h, sin huecos) + documentados los 3 fixes del
  clasificador sin anotar (PRs #743/#744/#745: normalización de categoría, cap 10 correos/pasada,
  cambio a Groq como IA primaria) + corregida la descripción del clasificador en la skill y en el
  CLAUDE.md de plataforma (decían `aiComplete`/NIM, el código ya usa Groq primero) · drift entre
  memoria/skills y el código real detectado por la auditoría diaria · commit de esta auditoría

- **2026-07-04** · `docs/CONTEXTO-SESIONES.md` · 5 entradas nuevas: rrhh `centro_trabajo` libre +
  reconocimiento médico (`073c5bc`), domótica Tuya ventilador Socorro (PR #714), eliminación tracker
  Modelo 179 (PR #698), agente de triaje de correo (PR #718) y fix ialimp mailing frío leads
  contactados a mano (PR #717) · commits del 03/07 tarde/noche que no se habían anotado en la memoria
  · pasada ligera diaria, rango desde `4aace5c` (03/07 17:17, última auditoría) hasta `e4fd0d0` (03/07
  23:27) · commit de esta auditoría
- **2026-07-04** · `apps/plataforma/CLAUDE.md` · corregida la fecha de eliminación del tracker Modelo
  179 ("02/07/2026" → "03/07/2026", PR #698 se mergeó el 03/07) + nueva entrada "Domótica Tuya —
  ventilador de techo Socorro" (PR #714) que no estaba documentada en ningún sitio · commit de esta
  auditoría
- **2026-07-04** · `.claude/skills/plataforma-maestro/SKILL.md` · quitada la mención residual a
  "Modelo 179" en la ficha de `/finanzas/fiscal` (tracker eliminado el 03/07, PR #698) + 2 filas
  nuevas en la tabla "Dónde vive cada cosa": agente de triaje de correo (PR #718) y domótica Tuya
  (PR #714), ninguna de las dos estaba reflejada en el skill · commit de esta auditoría

<!-- NOTA: el hallazgo 🔴 del cron `correo-triaje` MUDO va por CARRIL 2 (PR draft + Telegram,
docs/AUDITORIA-2026-07.md), no aquí — esta bitácora es solo carril 1 (texto auto-aplicado). -->

- **2026-07-03** · `.claude/skills/plataforma-maestro/SKILL.md` · reescrita la sección "Home
  `/dashboard`" (describía los widgets del PR #523 — Correduría, Apartamentos, Pendiente OTA,
  Top gastos, `CobrosPisosChart.tsx`/`EvolucionChart.tsx` — TODOS eliminados el 02/07 al reducir
  la home a resumen puro); nueva sección "Sistema de diseño 'paquete moderno'" (`dashboard/ui.tsx`,
  Inter, tokens semánticos, modo oscuro con `ThemeToggle`, veto al oscurecimiento forzado —
  no estaba documentado en ningún sitio); nota en "Sidebar Finanzas" sobre el desmantelamiento
  de `FinanzasClient` (Fase 1 des-duplicación) a solo tabs Ingresos/Categorías · el código del
  02/07 (PRs #693/#697/#701/#703/#704, commits `949f450`…`f18ebe1`) dejó el skill describiendo
  una home que ya no existe · sello `verificado: 2026-07-03` añadido · heartbeat de crons (paso
  2-bis) verificado: `limpiadoras/auto-sessions` salió ⛔ MUDO (82,5h sin fila en
  `cleaning_sessions`) pero es **falso positivo** — Vercel confirma el cron corriendo 200 OK a
  diario (05:00 UTC, 07-01 y 07-02) y Supabase confirma que no hay ningún checkout en los 4 pisos
  entre 07-01 y 07-06 (próximo: 06/07 Luxury Busto): sin checkout no hay limpieza que crear, el
  cron no tiene nada que insertar. Sin acción de Alberto ni PR — anotado aquí para que quede
  el rastro de la investigación · pasada ligera diaria, rango 04 commits desde `4aae7d4`
  (02/07 17:12) hasta `f18ebe1` (02/07 22:51; el resto del día ya venía reconciliado por las
  propias sesiones en `CONTEXTO-SESIONES.md`) · commit de esta auditoría

<!-- La auditoría inserta aquí. Ejemplo de formato:
- **2026-06-27** · `docs/SKILLS.md` · añadida fila del comando `/foo` que faltaba · el comando
  existe en `.claude/commands/foo.md` desde el rango · `abc1234`
-->

- **2026-07-02** · `docs/CONTEXTO-SESIONES.md` · añadida entrada que faltaba (merchant analytics +
  Análisis IA en `CategoriasTab`, commit `8777c6d`) y corregidos 3 estados stale ("PR en curso" /
  "pendiente merge" en las entradas de dedupe cross-cuenta #640, finanzas #646 y rrhh Global2 #645)
  a "mergeado a main" — los 3 commits ya estaban en `main` · pasada ligera diaria, rango 15 commits
  desde `f7d4711` (última auditoría, 01/07 15:13) · commit de esta auditoría
- **2026-07-02** · `.claude/skills/plataforma-maestro/SKILL.md` · nueva sección "Sidebar Finanzas —
  Gastos/Fiscal/Proyección" (rutas nuevas + merchant analytics) y corregida la mención de
  `/correduria` ("sidebar Mi negocio" → ya no está en el sidebar desde el 01/07) · el PR #646 quitó
  Correduría/Apartamentos/Finanzas del menú y el doc seguía describiendo el sidebar viejo · commit
  de esta auditoría
- **2026-07-02** · `apps/rrhh/CLAUDE.md` · añadidas rutas `/admin/fichajes`, `/admin/obras`,
  `/api/e/fichaje`, `/api/auth/seleccionar-empresa`, packages `@central/module-geo`/`module-horario`
  y modelos `usuario_empresas`/`empresa_documentos`/`obras`/`fichajes` · el PR #645 (fichaje GPS +
  multi-empresa) no se había reflejado en el doc · commit de esta auditoría
- **2026-07-02** · `apps/rrhh/public/manual.html` · nuevas secciones 11 "Fichaje y obras" y 12
  "Documentación de empresa" + nota de selector multi-empresa en la sección 1 · el manual de Pilar
  no mencionaba ninguna de las features del PR #645 (fichaje GPS, obras, documentación empresa,
  selector multi-empresa) · commit de esta auditoría
- **2026-07-02** · `CLAUDE.md` (raíz) · corregido el install command de "Reglas de la matriz"
  (`npm install --legacy-peer-deps` → `npx --yes pnpm@10.33.0 install --no-frozen-lockfile`) · las
  7 apps ya usan pnpm en su `vercel.json`, el doc describía un comando que ninguna usa (ya detectado
  en `docs/AUDITORIA-2026-06.md` pero nunca corregido en `CLAUDE.md`) · commit de esta auditoría
- **2026-07-02** · heartbeat de crons (Supabase, 8 crons) · 7/8 ✅; `limpiadoras/auto-sessions`
  salió `⛔ MUDO` por umbral (58,6h sin INSERT nuevo en `cleaning_sessions`) pero **verificado falso
  positivo**: logs de Vercel confirman `GET /api/sivra/limpiadoras/auto-sessions 200` a las 05:00
  UTC tanto el 30/06 como el 01/07 — el cron corre bien, simplemente es idempotente (solo inserta
  cuando hay una salida nueva en los próximos 14 días sin sesión ya creada) y puede pasar varios
  días sin filas nuevas de forma legítima (ver histórico: huecos de 4-9 días son la norma). No
  requiere acción ni PR — anotado aquí para que la próxima auditoría no lo re-investigue desde cero.

- **2026-07-01** · `docs/FUENTES-DE-VERDAD.md`, `docs/AUDITORIA-2026-06.md` · quitado el hedge
  "(si existe)" de la fila de `apps/rrhh/CLAUDE.md` (el archivo existe desde hace semanas);
  añadida sección "Auditoría LIGERA — 01/07/2026" cerrando 2 carry-forwards (`concursos_radar_criterios`
  en BD, 4 buckets Storage privados) confirmados por Supabase MCP · pasada ligera diaria, rango 6
  commits desde `11affec` · `56e7036`
- **2026-06-30** · `CLAUDE.md` (raíz) · añadidas verticales `apps/transporte` y `apps/alquiler` a la sección "Verticales" · faltaban desde su creación (27-28/06/2026) · 3f9b6d6 (commit de esta auditoría)
- **2026-06-30** · `MATRIZ.md` · count "17 modules total" → "23 modules total"; descripción `module-flota` corregida ("sin consumo aún" → "consumido por `apps/transporte`"); `transporte` y `alquiler` añadidos al árbol de `apps/` · count y árbol de apps estaban desactualizados · 3f9b6d6
- **2026-06-30** · `docs/FUENTES-DE-VERDAD.md` · 4 entries nuevas: `apps/transporte/CLAUDE.md`, `apps/alquiler/CLAUDE.md`, skill `transporte-maestro`, skill `alquiler-maestro` · las dos verticales nuevas de junio 2026 no tenían entradas en el mapa · 3f9b6d6
- **2026-06-30** · `docs/CONTEXTO-SESIONES.md` · 2 entradas añadidas: commit `c710153`/PR#598 (archivos huérfanos ia-rest + module-nominas) y commit `fe6162f` (contador 7 apps + salud arquitectura) · se habían mergeado el 29/06 sin anotarse en la memoria · 3f9b6d6
- **2026-06-30** · `docs/AUDITORIA-2026-06.md` · sección "Auditoría LIGERA 30/06/2026" añadida · informe de esta pasada · 3f9b6d6
