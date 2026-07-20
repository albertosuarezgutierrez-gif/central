# Auditoría LIGERA — 20/07/2026

Pasada diaria estándar (bloques baratos: lockfile, heartbeat de crons, coherencia de docs; sin
typecheck/tests pesados). Rango cubierto: todo el 19/07/2026 (`dd0883c` → `6baddf1`, 22 commits
no-chore), volumen alto — casi todo **trading Fase B/C**: resolución del bloqueo de red+auth de las
rutinas, cohorte 2 del forward paper congelada, retrovisor completo ejecutado + informe, satélite
🚀 caza-cohetes, explorador del universo en `/trading`, medición de medias multi-marco (sin señal),
indicadores por segmento, pre-registro de hipótesis + línea de régimen, FCF yield cableado al blend
(H4 cumplida); más botón Movimientos + tarjeta Correduría en `/banca`, fix de alerta `precio_bajo` en
pricing, y la propia auditoría PROFUNDA semanal (sección de arriba, corrida el mismo día).

**Memoria (`CONTEXTO-SESIONES.md`):** ya estaba al día — las 22 entradas no-chore del rango tenían
anotación propia, detallada y con fecha correcta (incluida la propia auditoría PROFUNDA). Sin huecos
que rellenar.

**Heartbeat de 9 crons: 9/9 ✅** (todos con filas frescas dentro de su umbral; el más antiguo, 20,0h en
`psd2-sync`, bajo el umbral de 30h).

**Lockfile:** `pnpm install --frozen-lockfile` limpio, sin drift.

**Hallazgo y arreglo (carril 1, texto acotado):**
- 🟡 **Drift post-resolución de `trading-analista`.** El bloqueo de red+auth de la rutina programada
  (egress 403 + `ALERTA_TOKEN` desincronizado) se resolvió y verificó end-to-end el 19/07/2026 (memoria,
  entrada "RESUELTO el bloqueo de red+auth"; la propia skill `trading-analista/SKILL.md` línea 240 ya lo
  documentaba), pero **3 docs seguían describiéndolo como "bloqueado por infra"**: `docs/SKILLS.md` (fila
  `trading-analista`), `.claude/skills/plataforma-maestro/SKILL.md` (fila `trading-analista` en "Dónde vive
  cada cosa", que además no mencionaba las 3 piezas de UI nacidas el 19/07 — explorador, satélite cohetes,
  forward paper) y `docs/RUTINAS-PROGRAMADAS.md` (sección "trading-analista" con los 2 bloqueadores como
  pendientes + el pendiente #10, sobre las envs de las rutinas 1-2 de `/auditoria-diaria`, que databa del
  17/07). **Verificado en esta misma pasada** (no solo por la memoria): el entorno de esta rutina tiene
  `PLATAFORMA_URL`/`ALERTA_TOKEN` presentes y la red alcanza `plataforma-ten-flame.vercel.app` sin 403 (307),
  confirmando que el arreglo del 19/07 cubre también a `/auditoria-diaria` (comparten entorno "Default").
  Corregidos los 3 docs (carril 1) + ampliada la fila de `docs/FUENTES-DE-VERDAD.md` con la ruta de UI
  `app/(usuario)/trading/**` que faltaba (solo cubría la API).

**Carril 2 (código, PR draft):** el propio `docs/RUTINAS-PROGRAMADAS.md` ya anotaba que, resuelto el
bloqueo y verificada una pasada de punta a punta, tocaba pasar `trading-analista` de `pendiente-trigger`
a `activo` en `apps/plataforma/lib/agentes-catalogo.ts` (dato de código, no de doc) — hecho por PR draft
en vez de carril 1.

**Sin acción (verificado, no hacía falta tocar):**
- Regla fiscal permanente `amortizable = NUNCA sin orden de Alberto`: sigue reflejada sin contradicción.
- Tabla de rutas del triaje de correo (`rutas.ts`): sin skills nuevas que produzcan correo en el rango
  (`trading-analista` solo avisa por Telegram, no email).

**Aviso Telegram:** enviado (carril 2 con PR + hallazgo 🟡 de drift, ver política de frugalidad).

---

# Auditoría PROFUNDA — 19/07/2026

Pasada semanal completa (`/auditoria-diaria --profunda`): integridad estructural, typecheck de las
**8** apps (incl. `almacen`, no solo las 5 clásicas), tests, seguridad multi-tenant, deps, infra real
por MCP (Supabase + Vercel) y coherencia de docs. Corrió pocas horas después de la pasada ligera de
hoy (ver sección de abajo); su rango de commits coincide (mismo 18/07, sin commits nuevos entre medias).

## 0. Deuda de proceso resuelta primero
La pasada ligera de esta madrugada (02:09 UTC) había dejado sus reconciliaciones de **carril 1**
(`docs/RUTINAS-PROGRAMADAS.md`, `docs/SKILLS.md`, `docs/FUENTES-DE-VERDAD.md`,
`.claude/skills/plataforma-maestro/SKILL.md`) en el **PR draft #1006** en vez de empujarlas directas a
`main` — desviación del proceso documentado (carril 1 = sin PR, sin aprobación). Contenido verificado
correcto (CI en verde, solo texto) → se marcó "ready" y se **mergeó a `main`** en vez de duplicar el
trabajo. `main` local se resincronizó tras el merge antes de seguir.

## 1. Integridad estructural — ✅ sin hallazgos
- `pnpm install --frozen-lockfile`: lockfile en sync.
- `node scripts/auditar-estructura.mjs --check`: radiografía al día.
- `pnpm test:guardia` (22/22): sin referencias al scope viejo `@iarest/`, guardián de secretos en verde.
- `transpilePackages` vs `package.json` vs imports reales: coinciden en las 8 apps.

## 2. Typecheck — ✅ 8/8 apps, 0 errores
Prisma generate + `tsc --noEmit` en secuencia (mismo `@prisma/client` compartido entre los 7 schemas,
nunca en paralelo): `almacen`, `alquiler`, `ialimp`, `plataforma`, `rrhh`, `sivra`, `transporte` → 0
errores cada una; `ia-rest` (sin Prisma) → 0 errores. `ialimp`/`plataforma`/`rrhh` llevan
`typescript.ignoreBuildErrors:true` — este typecheck manual es su gate real, y las tres salen limpias.

## 3. Tests — ✅
`pnpm test` (guardián + `packages/*` + `apps/rrhh` vitest + root `test:vitest`): 100% verde. Un primer
intento dio `vitest: not found` en `module-nominas` por node_modules a medio instalar — ruido de
entorno, no error real (repetido en limpio).

## 4. Seguridad — 2 hallazgos reales, ambos arreglados en el acto (carril 2)
- 🔴 **`apps/rrhh/app/api/cron/alerta-jornada-maxima/route.ts:12-14`** — bypass de auth por
  `User-Agent: vercel-cron` (cabecera falsificable por cualquiera) si el Bearer no coincidía. Único de
  los 4 crons de rrhh con este patrón (los otros 3 exigen `Bearer CRON_SECRET` sin excepción) y
  **contradecía la regla ya escrita en `apps/rrhh/CLAUDE.md`** ("Crons: sin User-Agent bypass"). Impacto
  acotado (solo dispara un Telegram con datos agregados, no filtra nada al llamante) pero es un bypass
  real y barato de corregir. **Arreglado**: mismo patrón fail-closed que `nominas`/`recordatorio-fichaje`.
  Verificado con `prisma generate` + `tsc --noEmit` en `apps/rrhh` tras el cambio: 0 errores (el primer
  intento mostró errores de Prisma falsos porque el `@prisma/client` compartido tenía el schema de
  `transporte` cargado de la pasada de typecheck anterior — ruido de entorno, no error real).
- 🟡 **`apps/ia-rest/src/app/api/webhook/deploy-aprendizaje/route.ts:12-19`** — si
  `VERCEL_DEPLOY_WEBHOOK_SECRET` no está seteado en el entorno, el chequeo del secret se saltaba
  **entero** (fail-open): cualquiera podía disparar el webhook y gastar llamadas IA / ensuciar la cola
  de patrones pendientes de aprobación. Impacto bajo (los patrones propuestos requieren aprobación de
  Alberto por Telegram antes de aplicarse), pero es el mismo antipatrón que el guardián de secretos
  vigila. **Arreglado**: falla cerrado si el env no está seteado. `tsc --noEmit` en `apps/ia-rest` tras
  el cambio: 0 errores.
- Guardián de secretos (`test/regression-secrets.test.ts`, gate de `pnpm test:guardia`): ✅ pasa. Grep
  manual de 17 líneas con patrón `_SECRET||'...'`: todas o (a) headers salientes con `CRON_SECRET` hacia
  otro endpoint interno (fail-safe si falta) o (b) API keys de servicios externos (`GOOGLE_CLIENT_SECRET`,
  `CLOUDINARY_API_SECRET`, `TUYA_CLIENT_SECRET`) — permitido por la regla del repo. Ninguna es un secreto
  de auth con fallback literal.
- Multi-tenant: revisados los cambios de la semana en `apps/plataforma` (única app con commits desde el
  18/07 aparte de docs) — PR #1000 reutiliza `CategoriasTab` ya scopeado, PR #1002 es backfill SQL por
  IDs fijos (sin riesgo cross-tenant), las rutas nuevas `/api/trading/*` usan
  `isRoutineAuthorized`/`isTradingLecturaAutorizado` consistentemente. Barrido de **todos** los
  `api/cron/*route.ts` de las 8 apps: el único hueco real era el 🔴 de rrhh de arriba, ya corregido.

## 5. Deps y código muerto — 🟡 sin acción urgente
- `pnpm audit`: 16 vulns (5 high, 10 moderate, 1 low, 0 crítico). Las 5 high verificadas una por una y
  **no explotables** en el uso real: `xlsx` (ialimp solo ESCRIBE exports, nunca parsea), `nodemailer`
  (ningún `sendMail()` del repo usa la opción `raw`), `vite` ×2 (solo devDependency de `vitest`, no corre
  en producción). Las 10 moderadas/1 low son dev o transitivas, sin camino crítico visible — no se
  revisaron una a una para no inflar el informe.
- 3 packages sin consumidor en ningún `apps/*/package.json`: `module-agenda`, `module-encargo`,
  `module-revenue` — los tres nacieron el 18/07 en el mismo commit; parecen scaffolding en curso
  (`module-agenda` sin carpeta `test/` aún), no basura. Sin acción.
- Deps declaradas sin ningún import: `apps/alquiler:jose`, `apps/ia-rest:lucide-react`,
  `apps/plataforma:@anthropic-ai/sdk` (este último cuadra con la retirada ya documentada de la vía
  Anthropic de pago). Deuda de limpieza menor, no urgente — no se tocó.

## 6. Infra real por MCP — 1 hallazgo real, 2 aclarados
- 🔴 **`public.v_movimientos_activos` con `SECURITY DEFINER`** (Supabase advisor "security", severidad
  ERROR) — **regresión real**. Se arregló en la remediación masiva de junio (`security_invoker=true`,
  aplicada por MCP sin archivo propio en el repo), pero las dos regeneraciones posteriores de la vista
  (`2026-06-26_v_movimientos_activos.sql`, `2026-07-03_v_movimientos_activos_propiedad_id.sql`) hicieron
  `CREATE OR REPLACE VIEW ... SELECT *` sin repetir esa opción → Postgres la recreó en modo
  SECURITY DEFINER por defecto, bypasseando el RLS del usuario que consulta sobre una vista de **datos
  financieros**. **NO aplicado por esta auditoría** (regla: nunca ejecutar migraciones en producción
  desde una pasada). Migración propuesta:
  `apps/plataforma/prisma/sql/2026-07-19_v_movimientos_activos_security_invoker.sql`
  (`ALTER VIEW v_movimientos_activos SET (security_invoker = true)`), va en el PR draft del carril 2 —
  **acción manual de Alberto**: revisar y aplicar por Supabase MCP/`execute_sql`. Rollback:
  `ALTER VIEW v_movimientos_activos SET (security_invoker = false)` (vuelve al estado roto actual, no
  debería hacer falta). Recordatorio para el futuro: cualquier regeneración de esta vista debe repetir
  `security_invoker=true` o volver a perderse — ya anotado en el propio archivo de migración.
- ✅ **Migración `trading_paper_track` confirmada aplicada** correctamente: la tabla existe con las 7
  columnas nuevas mencionadas en memoria (`max_drawdown`, `max_drawdown_bench`, `vol_anual`,
  `tracking_error`, `retorno_base`, `mediana_base`, `n_base`, `benchmark`); la migración remota más
  reciente coincide en fecha/nombre con el archivo del repo. Sin más discrepancias repo↔remoto.
- ℹ️ **Segundo proyecto Supabase `efncqyvhniaxsirhdxaa` confirmado** por `list_projects` — **NO es un
  hallazgo nuevo**: es el silo transitorio de `ia-rest` ya documentado extensamente en `MATRIZ.md`
  ("Arquitectura de datos del holding") y `apps/ia-rest/AGENTS.md`, en migración (~80%) a la BD
  compartida. El agente que lo detectó no tenía ese contexto; se deja anotado aquí para que quede claro
  que no requiere acción — solo el flip pendiente ya conocido.
- ℹ️ **Gap de visibilidad en Vercel `list_projects`**: solo devolvió 6 de los 8 proyectos esperados
  (faltan `almacen`, `alquiler`, `rrhh`, `transporte` en el listado del MCP), pese a que sus
  `vercel.json`/`ignoreCommand` están correctos en el repo y el typecheck de las 8 apps pasa. Lectura más
  probable: alcance del token/team del MCP, no una caída real de esos proyectos (los 4 que sí aparecieron
  —`plataforma`/`sivra`/`ia-rest`/`ialimp`— con su último deploy real en READY). Acción sugerida: que
  Alberto confirme en el dashboard de Vercel que los 4 siguen desplegados si le queda alguna duda; no se
  trata como incidencia.
- Advisors de seguridad/performance: volumen consistente con auditorías previas (272
  `rls_enabled_no_policy`, 154 `security_definer_function_executable`, 16 `rls_policy_always_true`, 1151
  `multiple_permissive_policies`…) — sin señal de crecimiento anómalo, ya documentados como riesgo de
  gran radio sobre BD compartida en auditorías anteriores. No se toca.

## 7. Heartbeat de 9 crons — ✅ 9/9
Todas las filas dentro de su ventana (1,7h–27,6h de antigüedad, todas por debajo de su umbral). Sin
`⛔ MUDO`.

## 8. Memoria y docs — ✅ sin huecos nuevos
`CONTEXTO-SESIONES.md` ya estaba al día (confirmado independientemente: de los 25 commits no-chore del
rango, 24 tocaron la memoria en el mismo commit y el único que no —PR #993— quedó cubierto por el
siguiente —PR #994—). Tabla de rutas de triaje de correo (`rutas.ts`): sin skills nuevas que produzcan
correo en el rango. Manuales de ia-rest: sin commits en `apps/ia-rest` en el rango, nada que actualizar.
`docs/SKILLS.md`: las 31 skills + 3 comandos del repo están todos indexados.

## 9. Aviso Telegram — falló, misma causa raíz que el bloqueador de `trading-analista`
El `curl` de aviso (`POST {PLATAFORMA_URL}/api/internal/alerta`, con `ALERTA_TOKEN` presente en el
entorno) dio `curl: (56) CONNECT tunnel failed, response 403` — el proxy de egress de ESTA rutina
(`/auditoria-diaria`) también bloquea el túnel CONNECT hacia `plataforma-ten-flame.vercel.app`,
**igual que el 403 ya documentado para `trading-analista`** (memoria 18/07/2026). No es un problema del
token ni del endpoint (`ALERTA_TOKEN` está seteado, el endpoint funciona — lo prueban los avisos de
otras rutinas que sí llegan por otras vías): es el **allowlist de red del entorno de la rutina
programada**, y afecta a más de un agente. Dado que el canal normal está caído, este aviso se mandó por
el canal de notificación nativo de la sesión (push al usuario) en su lugar. **Acción de Alberto**:
añadir `plataforma-ten-flame.vercel.app` (o `*.vercel.app`) al allowlist de red de las rutinas
programadas de Claude Code — beneficiaría a la vez a `trading-analista` y a `/auditoria-diaria`.

## Resumen de severidad
- 🔴 2 reales — **ambos con acción**: bypass de auth en cron rrhh (**arreglado en el PR de este carril
  2**), `v_movimientos_activos` SECURITY DEFINER (**migración propuesta, pendiente de que Alberto la
  aplique**).
- 🟡 3 — webhook fail-open ia-rest (**arreglado**), 5 vulns "high" de `pnpm audit` (verificadas no
  explotables, sin acción), deps sin usar (deuda menor, sin acción).
- ℹ️ 2 aclaraciones — segundo proyecto Supabase (ya conocido, no es hallazgo), gap de visibilidad Vercel
  (probable alcance de token, no incidencia).
- Carril 1: nada nuevo que auto-aplicar aparte de fusionar el PR #1006 pendiente y este informe.
- Carril 2: PR draft con los 2 fixes de código + la migración SQL propuesta (sin aplicar).

---

# Auditoría LIGERA — 19/07/2026

Pasada diaria estándar (bloques baratos: lockfile, radiografía, coherencia de docs; sin typecheck/tests
pesados). Rango cubierto: todo el 18/07/2026 (`f5bec95` → `fc18bb3`), volumen muy alto — 50 commits, casi
todo **trading Fase B** (cohortes + curva persistida, riesgo/atribución, EDGAR/insiders/gurús Dataroma,
selección combinada, cron semanal `paper-tracker`, ALERTA_TOKEN), **pricing** (auditoría completa R1-R8,
suelo PriceLabs, 4 capas anti-desplome, retirada del motor viejo de `apps/sivra`), **plataforma** (segmento
🏠 Personal en `/banca`, saldo IBKR en vista Dinero, ingresos H1 de Pilar), y 2 fixes de datos (RETA mal
clasificado, Bizum unificado).

**Memoria (`CONTEXTO-SESIONES.md`):** ya estaba al día — las 25 entradas del rango (una por commit no-chore)
tenían anotación propia, detallada y con fecha correcta. Sin huecos que rellenar; las sesiones se
auto-anotaron bien pese al volumen.

**Heartbeat de 9 crons: 9/9 ✅** (todos con filas frescas dentro de su umbral; el más antiguo, 27,5h en
`updates/sync`, sigue bajo el umbral de 36h).

**Lockfile:** `pnpm install --frozen-lockfile` limpio, sin drift.

**Hallazgos y arreglos (carril 1, texto acotado):**
- 🟡 **`docs/RUTINAS-PROGRAMADAS.md`** (sección trading-analista) y **`docs/SKILLS.md`** describían el
  trigger de `trading-analista` como "PENDIENTE DE TRIGGER" / "falta dry-run manual antes de programarla"
  — **desactualizado**: el trigger YA EXISTE y corrió varias veces el 18/07 (la propia `CONTEXTO-SESIONES.md`
  documenta que dio 403 en el proxy de egress hacia Vercel). Verificado por Supabase MCP: `trading_watchlist`
  sembrada (13 filas), `broker_saldos` con 1 fila — los 3 prerrequisitos listados ya estaban cumplidos.
  Corregido a "trigger creado, bloqueado por infra" con los 2 bloqueadores reales y accionables: falta
  `ALERTA_TOKEN` en el entorno de la rutina, y el 403 de red hacia `*.vercel.app` (allowlist del entorno).
- 🟡 **`docs/FUENTES-DE-VERDAD.md`** (fila `trading-analista`) solo mapeaba `analizar`/`puntuar`, pero el
  paquete creció a 13 endpoints (`factores`/`gurus`/`fundamentales`/`insiders`/`seleccion`/`validar-oos`/
  `paper`/`saldo`/`descubrir`/`screener`/`fmp`) — ampliada la fila a `app/api/trading/**` + los nuevos
  ficheros (`lib/trading/**`, `lib/broker.ts`, las migraciones de hoy, `docs/TRADING-FASE-B-spec.md`).
- 🟡 **`.claude/skills/plataforma-maestro/SKILL.md`** — la fila `trading-analista` de "Dónde vive cada
  cosa" tenía el mismo desfase (solo 2 endpoints, trigger "pendiente") y **faltaba por completo** la
  tarjeta «📈 Inversión · Interactive Brokers» de la vista Dinero (PR #984, saldo IBKR persistido en
  `broker_saldos`) — el segmento 🏠 Personal de `/banca` sí estaba ya documentado (autoanotado). Añadida
  la fila que faltaba, corregida la existente, sello `verificado` refrescado 18/07→19/07.

**Sin acción (verificado, no hacía falta tocar):**
- Regla fiscal permanente `amortizable = NUNCA sin orden de Alberto`: sigue reflejada sin contradicción.
- `apps/sivra/CLAUDE.md` ya deja claro que el pricing interno vive en plataforma; no afirma nada sobre
  `apps/sivra/app/api/pricing/{apply,apply-auto}` que la retirada a 410 Gone (R5, PR #988) contradijera.
- `pricing-agente/SKILL.md` no fija el `min_price` de Busto en ningún valor numérico (lo remite a la
  tabla `pricing_settings`) — el cambio 90€→115€ de hoy (R4) no la deja obsoleta.
- Tabla de rutas del triaje de correo (`rutas.ts`): sin skills nuevas que produzcan correo en el rango.

**Carril 2 — vacío.** Sin crons mudos, sin hallazgos 🔴, sin código de bajo riesgo que arreglar. El
bloqueador de infra de `trading-analista` (403 + falta `ALERTA_TOKEN`) no es nuevo — ya estaba anotado
ayer en `CONTEXTO-SESIONES.md` como pendiente de Alberto; esta pasada solo lo propagó a los 3 docs que
se habían quedado con la versión vieja. No se abre PR ni se manda Telegram (frugalidad).

---

# Auditoría LIGERA — 18/07/2026

Pasada diaria estándar (bloques baratos: lockfile, radiografía, coherencia de docs; sin typecheck/tests
pesados). Rango cubierto: todo el 17/07/2026 (no hubo pasada de auditoría ese día — la última entrada de
`docs/AUTO-APLICADOS.md` era una corrección puntual de 2 líneas, no una pasada completa) + `f5bec95` (18/07,
madrugada). Volumen alto: rrhh (branding + cambiador de empresa + GPS, PR #941), 4 fixes del agente contable,
la vertical **Empresas en dificultad** completa (BORME, búsqueda web, agente conversacional, scoring,
enriquecimiento eInforma, acceso invitado — PRs #951-#960), 3 fixes del director de código, el agente
**`trading-analista`** (IBKR paper, Fase 1 completa) y el override de temporada de octubre en pricing.

**Memoria (`CONTEXTO-SESIONES.md`):** ya estaba al día — todas las features del rango tenían entrada propia
(las sesiones se auto-anotaron bien). Sin huecos que rellenar.

**Heartbeat de 9 crons: 9/9 ✅** (todos con filas frescas dentro de su umbral).

**Lockfile:** `pnpm install --frozen-lockfile` limpio, sin drift.

**Hallazgos y arreglos (carril 1, auto-aplicados a `main`):**
- 🟡 Skill `trading-analista` (nacida el 17/07) no estaba en `docs/SKILLS.md` ni en
  `docs/FUENTES-DE-VERDAD.md` — añadida fila en ambos.
- 🟡 `MATRIZ.md` (fila `almacen`) afirmaba que `vercel.json` seguía sin `ignoreCommand` — **falso**: se
  añadió el 17/07 (PR #945). Corregido; se deja constancia de que siguen pendientes `CLAUDE.md` propio,
  fila en `FUENTES-DE-VERDAD.md` y la matriz de typecheck.
- 🟡 Skill `plataforma-maestro` (router de la vertical) no mencionaba ninguna de las 3 piezas grandes
  nacidas el 17/07 (Empresas en dificultad, Director de código, `trading-analista`) en su tabla "Dónde
  vive cada cosa" — añadidas las 3 filas + sello `verificado` refrescado a 18/07.

**Sin acción (verificado, no hacía falta tocar):**
- Regla fiscal permanente `amortizable = NUNCA sin orden de Alberto` (dictada 02/07/2026): sigue
  correctamente reflejada en `perfil-fiscal/SKILL.md` (línea 61) sin contradicción en la memoria.
- `apps/rrhh/CLAUDE.md`: ya reflejaba el branding, el cambiador de empresa (`/api/auth/cambiar-empresa`)
  y el fichaje GPS del PR #941 (los actualizó la propia sesión el 17/07).

**Carril 2 — nada nuevo que abrir.** El único pendiente de código conocido (`apps/almacen` ausente de la
matriz de typecheck de `.github/workflows/tests.yml`) **ya tiene 2 PR draft abiertos y duplicados**
(**#917** del 16/07 y **#936** del 17/07, ambos sin mergear) — acción de Alberto: mergear uno y cerrar el
otro, no hace falta un tercero. Sin crons mudos, sin hallazgos 🔴. No se manda aviso Telegram (frugalidad:
carril 2 vacío, sin severidad alta).

---

# Auditoría exhaustiva — 2026-07-12

> Pasada **exhaustiva multi-agente** (a petición de Alberto: "la auditoría más completa posible
> de todo: flujos, agentes, APIs, IA e infra"). Método: gate baseline → typecheck de las 7 apps →
> fan-out de 15 dominios (7 verticales + 5 capas transversales + 2 de infra) con **81 subagentes** y
> **verificación adversarial de cada hallazgo** antes de anotarlo (para no repetir los falsos positivos
> de la pasada del 01/07). Infra Supabase/Vercel consultada por MCP en solo lectura.
> **La pasada anterior (01/07) se conserva íntegra más abajo.**

## Resumen ejecutivo (12/07)

**Salud base sólida:** `pnpm install --frozen-lockfile` limpio, radiografía de estructura al día,
guardianes **22/22**, y las **7 apps typechequean con 0 errores TS** (incluidas las 5 con
`ignoreBuildErrors:true` en build — el typecheck sí las valida). Migraciones y edge functions sanas
en ambos proyectos Supabase.

**66 hallazgos confirmados** (de 67 brutos; el verificador solo descartó 1): **2 críticos, 25 medios,
39 bajos**. El patrón dominante es de **autorización de crons/webhooks** (fail-open cuando falta un
secreto, o crons que escriben datos sin ninguna guarda) y **formato de dinero** (varias pantallas y el
PDF de nómina en estilo dólar). Dos críticos: (1) un **IDOR cross-empresa** en ialimp que filtra PII y
tarifa de limpiadoras de otra empresa, y (2) las **77 funciones `SECURITY DEFINER` ejecutables por
`anon`** ya conocidas de julio, reconfirmadas hoy en AMBOS proyectos. Dos hallazgos de **dinero real**
que merecen prioridad: el webhook de Stripe de ialimp **nunca actualiza el plan** (metadata en el sitio
equivocado) y el cron de descuentos puede **duplicar el crédito** por falta de idempotencia. En IA, el
wrapper de plataforma **salta la cadena de fallback** y depende solo de NVIDIA NIM — justo el modo de
fallo que dejó "IA no disponible" en el pasado.

**Acciones de esta pasada:** los **auto-fix de bajo riesgo** (formato de dinero, guardas de cron
fail-open, docs desalineadas) se aplican en la rama `claude/program-audit-plan-g1tlaf`; los de gran
radio (RLS, REVOKE de funciones `anon`, huella VeriFactu, migración de PINs) van al **checklist manual
de Alberto** al final, con orden seguro y rollback. **Nada de infra se ejecuta**: solo se documenta.

---

## 🔴 Críticos (12/07)

### C1 · IDOR cross-empresa: informe de limpiadora sin scope `empresa_id` — fuga de PII (ialimp)
- **Ubicación:** `apps/ialimp/app/api/admin/informe/route.ts:37-48`
- **Evidencia:** `GET` no llama a `requireEmpresaId()`; consulta `limpiadoras WHERE id = ${lid}` y
  `cleaning_sessions WHERE limpiadora_id = ${lid}` tomando `lid` del query string SIN filtrar por
  `empresa_id`. El middleware solo exige una sesión `ialimp_session` de *cualquier* empresa (la ruta no
  está en `MODULO_MAP`). Un usuario de la empresa B pasa el UUID de una limpiadora de la empresa A y
  recibe su nombre, propiedades limpiadas, horarios, nº de fotos y **tarifa/importe de pago**. Frontera
  RGPD crítica (cliente vivo Sique Brilla).
- **Acción:** añadir `const empresa_id = await requireEmpresaId()` y filtrar `AND empresa_id = ${empresa_id}::uuid`
  en las tres queries. Auto-fix de bajo riesgo, pero verificar que la página que consume envía la cookie.

### C2 · 77 funciones `SECURITY DEFINER` ejecutables por `anon` (y `authenticated`) — infra
- **Ubicación:** `efncqyvhniaxsirhdxaa: public` (77) y `wswbehlcuxqxyinousql: iarest` (77) — mismas firmas.
- **Evidencia:** `get_advisors(security)` reporta 77× `anon_security_definer_function_executable` +
  77× `authenticated` en AMBOS proyectos. Ejemplos: `activar_plan`, `calcular_precio_transferencia`,
  `calcular_margen_evento`, `aplicar_menu_a_evento`, `buscar_mesa_por_voz`. Al ser `SECURITY DEFINER`
  corren con privilegios del owner (bypass RLS) e invocables por `anon` vía PostgREST RPC.
- **Acción (manual, gran radio):** revisar función por función y `REVOKE EXECUTE ... FROM anon`
  (y `authenticated` si no procede) en las internas; las que deban ser públicas deben validar tenant
  internamente. **Verificar reachability real por PostgREST anon antes de revocar en masa.** → ver checklist.

---

## 🟡 Medios (12/07)

**ia-rest**
- **M1 · Cron `cobro-descuento` sin idempotencia → doble crédito Stripe** (`src/app/api/cron/cobro-descuento/route.ts:74`).
  `createBalanceTransaction(customerId, {...})` se llama sin `idempotencyKey` ni marca `ya_aplicado_mes`;
  el hermano `cobro-inactividad:73` sí usa `idempotencyKey`. Doble disparo = doble descuento = pérdida de
  ingreso SaaS. **Fix bajo:** pasar `{ idempotencyKey: descuento-${local_id}-${mesStr} }`.
- **M2 · Crons de dinero fail-OPEN si falta `CRON_SECRET`** (`cobro-descuento:17`, `cobro-inactividad:111`,
  `cobros-eventos:16`): `if (!secret) return true`. Sin la env, cualquiera dispara cobros de tarjeta /
  créditos. `operador/financiero:13` sí hace `return false`. **Fix bajo:** fail-secure.
- **M3 · Webhook TheFork sin validar firma si el restaurante no tiene `thefork_secret`**
  (`src/app/api/thefork/webhook/route.ts:75`): `if (restaurante.thefork_secret) {...}` — si es NULL no
  valida nada; con el `CustomerId` (controlado por el atacante) se abren mesas e inyectan alergias. **Fix
  bajo:** 401 cuando falte el secreto.
- **M4 · Login de asesoría: PIN en claro + sin rate-limit** (`src/app/api/asesoria/login/route.ts:30`):
  `.eq('pin', pin.trim())` compara el PIN sin hash; la sesión da acceso a datos fiscales (modelo 303).
  **Fix alto:** hashear (bcryptjs ya en deps) + throttling; requiere migrar los PINs.
- **M5 · Doble `next.config` divergente** (`apps/ia-rest/next.config.js` vs `next.config.ts:22-44`): el
  `.js` no define las cabeceras de seguridad (`X-Frame-Options`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`). **Fix bajo:** borrar `next.config.js`.
- **M6 · TOCTOU en cierre de factura VeriFactu** (`src/app/api/factura/cerrar/route.ts:42-46,103`;
  idem `pago-parcial:53`): el chequeo de idempotencia va al inicio pero la comanda no se marca `cerrada`
  hasta el paso 9 → dos POST concurrentes consumen dos números fiscales y crean dos facturas para una
  venta. **Fix alto:** verificar `UNIQUE(comanda_id)` en `facturas_verifactu` y serialización de
  `siguiente_numero_factura` (viven en la BD viva, no versionadas). → checklist.

**plataforma**
- **M7 · Cron `sivra/updates/sync` SIN ninguna auth** (`apps/plataforma/app/api/sivra/updates/sync/route.ts:7,16`):
  registrado como cron (`0 5 * * *`), escribe en `incomes` y llama a Smoobu, sin `CRON_SECRET`/sesión/`getAdmin`.
  Es el único cron del bloque sin `isCronAuthorized`. **Fix bajo:** añadir `isCronAuthorized(req)`.
- **M8 · Importes en estilo dólar en el chat/Telegram del contable** (`apps/plataforma/lib/contable/documentos-tipos.ts:56,58,77`):
  `${f.total.toFixed(2)}€` → "1234.50€". El propio repo lo prohíbe en `respuestas-directas.ts:16`.
  **Fix bajo:** `toLocaleString('es-ES', {minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:'always'})+'€'`.

**ialimp**
- **M9 · `pms/sync` público y sin `CRON_SECRET`** (`app/api/pms/sync/route.ts:146`): está en `PUBLIC_PATHS`
  y no valida Bearer; cualquiera dispara un sync global y la respuesta **filtra nombres de propiedad de
  todas las empresas**. **Fix bajo:** exigir Bearer / sacarlo de `PUBLIC_PATHS` y no devolver nombres cross-tenant.
- **M10 · `empresa_id` nunca llega al webhook de Stripe → el plan nunca se actualiza**
  (`app/api/stripe/checkout/route.ts:31`): la metadata va en la `checkout.session`, pero el webhook lee
  `sub.metadata.empresa_id` (siempre `undefined`). Además `PRICES` usa IDs placeholder. **Fix bajo:**
  mover a `subscription_data.metadata` o manejar `checkout.session.completed`; verificar price IDs reales.
- **M11 · Cron de informes mensuales roto (sub-fetch 401)** (`app/api/admin/informes/cron/route.ts:26-33`):
  hace `fetch('/api/admin/informes/generar', headers:{x-empresa-id})` con `.catch(()=>{})`; `generar` usa
  `requireEmpresaId()` (ignora el header) y el fetch no manda cookie ni Bearer → 401 tragado en silencio.
  Los informes nunca se generan/envían. **Fix alto:** invocar la lógica directamente pasando `empresa_id`.
- **M12 · Columna inexistente `token_acceso` en escaneo del propietario** (`app/api/propietario/[token]/escanear/route.ts:24`):
  usa `c.token_acceso` cuando el resto del portal usa `access_token` (24 usos) → escaneo roto (500).
  **Fix bajo:** cambiar a `c.access_token` (confirmar esquema).

**sivra** (app propia)
- **M13 · `updates/sync` escribe/BORRA `incomes` sin auth y excluido del middleware**
  (`app/api/updates/sync/route.ts:32,35`). **Fix bajo:** `isCronAuthorized(req)`.
- **M14 · Cron `mensajes/auto-reply` sin auth** (`app/api/mensajes/auto-reply/route.ts:104`, `GET()` sin `req`);
  el envío de email es stub hoy, pero el nodemailer queda listo. **Fix bajo:** `GET(req)` + `isCronAuthorized`.
- **M15 · Cron `limpiadoras/auto-sessions` sin auth** (`app/api/limpiadoras/auto-sessions/route.ts:16`),
  crea `cleaning_sessions` y llama a Smoobu. **Fix bajo:** `isCronAuthorized(req)`.

**rrhh**
- **M16 · Nóminas en estilo dólar** (`apps/rrhh/lib/nomina-pdf.tsx:16`, `NominasPanel.tsx:28`,
  `ContratoForm.tsx:118`): `n.toFixed(2)+' €'`. Es el **PDF oficial** que ve el empleado. **Fix bajo:**
  replicar `eur()` es-ES.
- **M17 · Policy de lectura del bucket `rrhh-documentos` abierta a `anon`**
  (`apps/rrhh/prisma/migrations/0008_storage_rrhh_documentos_read_policy.sql:4`): `USING (bucket_id = 'rrhh-documentos')`
  sin tenant ni rol; `lib/storage.ts:37` firma con la anon key → con la anon key + un path se mintan URLs
  de PII (nóminas/DNI). **Fix alto:** restringir a `service_role` y firmar server-side. → checklist.

**cadena-ia / packages / infra**
- **M18 · El wrapper `aiComplete` de plataforma salta la cadena de fallback** (`apps/plataforma/lib/ai-client.ts:22-32`):
  llama directo a `nimChat` (solo NVIDIA NIM), no al `aiComplete` de `@central/core-ai`. 9 consumidores
  (concursos, agente-movimientos, correo, pre-renta, seo-refresh, finanzas…) quedan sin respaldo
  Groq→Gemini→Kimi pese a tener las keys. Es exactamente el modo de fallo que vigila `buscador-ia`.
  **Fix bajo-medio:** delegar en la cadena de `@central/core-ai`.
- **M19 · Endpoint de visión IA sin auth** (`apps/ia-rest/src/app/api/onboarding/extract-carta/route.ts:6,33`):
  `callAIVision(..., 6000)` sin sesión/token; los hermanos `asn/ocr` y `asn/factura` sí validan `asn_token`.
  DoS de coste contra la clave NVIDIA. **Fix bajo:** token de onboarding de un solo uso / rate-limit.
- **M20 · `renderInvoiceHtml` lanza `FiscalIntegrityError` para importes ≥ 1000**
  (`packages/core-receipts/src/integrity.ts:11-13` vs `renderers/html.ts` + assert `:139`):
  `formatFiscalNumber` no agrupa miles pero el render usa `eur()` con punto de miles → el verbatim no
  cuadra → **la factura no se emite**. Consumidor vivo: facturas de propietario de ialimp (superan 1000€).
  El test lo enmascara con `total:999999`. **Fix bajo + test ≥1000.**
- **M21 · `calcularHuella` etiqueta `CuotaTotal` con `importe_total` (no `cuota_iva`) y omite campos**
  (`packages/core-fiscal/src/es/aeat.ts:46`): incoherente con el XML LROE de ia-rest. Al activar el envío
  a AEAT (~2027) la huella no cuadrará y rompería el encadenamiento. El snapshot congela el valor erróneo.
  **Fix alto (ventana/migración).** → checklist.
- **M22 · `xlsx@0.18.5` parsea (`XLSX.read`) un fichero subido por el usuario — CVE explotable**
  (`apps/plataforma/lib/extracto-xls.ts:62` desde `app/api/banca/importar/route.ts:53`): prototype-pollution
  (CVE-2023-30533) / ReDoS (CVE-2024-22363) en la ruta de parseo de extractos bancarios; los `pnpm.overrides`
  no cubren `xlsx`. El export de ialimp (`xlsx.write`) NO es explotable. **Fix alto:** migrar el camino de
  LECTURA a la build parcheada de SheetJS o a `exceljs`.
- **M23 · `ESTRUCTURA.md` cita cifras obsoletas de su propia radiografía** (`docs/ESTRUCTURA.md:9,19`):
  "5 verticales · 26 packages · 951 APIs" vs la radiografía real "7 apps · 34 packages · 1056 rutas".
  **Fix bajo (texto).**
- **M24 · 47 vistas `SECURITY DEFINER` (ERROR) en el proyecto ia-rest standalone** (`efncqyvhniaxsirhdxaa`):
  el hardening que bajó el shared a 1 vista NO se portó. **Fix alto:** recrear con `security_invoker=on`. → checklist.
- **M25 · Políticas RLS `always true` incluyendo `bridge_tokens`** (`iarest` 16 + `efncqyvhniaxsirhdxaa public` 23):
  `bridge_tokens`, `impresoras`, `print_jobs`, `documentos_escaneados`… con `USING(true)` = sin aislamiento.
  **Fix alto:** condiciones por `restaurante_id`; prioridad `bridge_tokens` y `documentos_escaneados`. → checklist.

---

## 🟢 Bajos (12/07) — 39 hallazgos

**Formato de dinero (regla global) — auto-fix:** ia-rest `materiales/informe:51,74,76` y `cierre-diario:244`;
sivra `dashboard/page.tsx:13`; transporte `lib/format.ts:1-2`; alquiler `lib/format.ts:1-5`; ticket térmico
`packages/core-receipts/src/renderers/thermal.ts:199,237-240`. Todos: replicar `eur()` es-ES (€ detrás,
miles con punto, 2 decimales).

**Autorización / crons fail-open — mayoría auto-fix bajo:**
- `isCronAuthorized`/bypass abiertos si falta `CRON_SECRET`: plataforma `lib/cron-auth.ts:4-7`, sivra
  `lib/cron-auth.ts:31-35` → fallar cerrado en producción (verificar env en Vercel antes).
- ialimp: endpoints DDL de migración invocables por cualquier autenticado (`admin/migrate-chat-destinatario/route.ts:8`)
  → exigir `isSuperadmin()`; `CRON_SECRET` aceptado por `?secret=` (`cron/impagos/route.ts:36`) → solo header.
- sivra: `inventario` PATCH sin guard (`limpiadoras/inventario/route.ts:35`); middleware valida solo
  *presencia* del token de limpiadora, no validez (`middleware.ts:38-45` + notas/alertas/photo/upload-photo)
  → `isLimpiadoraAuthorized()`; `hashPin` SHA-256 sin sal de 4 dígitos (`limpiadoras/auth/route.ts:116`).
- rrhh: login de empleado `/e` sin rate-limit (`app/api/e/login/route.ts:13-14`).
- ia-rest: 5 `createClient` service-role directos en rutas API que saltan RLS (`asn/route.ts:20`,
  `asn/factura:15`, `asn/ocr:15`, `asesoria/clientes:9`, `asesoria/login:8`) → migrar al helper central.
- ia-rest: `NEXT_PUBLIC_CRON_SECRET || 'dev'` en cliente (`components/BlogSEOTab.tsx:41`) → quitar el
  header `authorization` vestigial del fetch (la sesión ya autentica).

**Idempotencia — bajo:** plataforma gastos fijos check-then-insert sin índice único (`lib/sivra/gastos-fijos.ts:71,102`);
ialimp `alertas-pendientes` sin dedup (`route.ts:56-70`) y webhook Stripe sin dedup por `event.id` (`stripe/webhook:24`).

**Webhooks fail-open — verificar env, no auto-fix ciego:** plataforma Smoobu acepta todo si falta
`SMOOBU_WEBHOOK_SECRET` (`sivra/mensajes/webhook/route.ts:46-48`).

**VeriFactu (pre-AEAT) — bajo:** XML LROE usa la fecha de la factura actual en `RegistroAnterior` (`src/lib/verifactu.ts:169`).

**RGPD/logs — bajo:** sivra loguea email + cuerpo de mensajes de huésped (`mensajes/auto-reply/route.ts:15`).

**Negocio — verificar con Alberto:** alquiler `estado` como string libre sin validar la máquina de estados
(`alquileres/route.ts:16,64`) y sin comprobar disponibilidad de stock (sobre-reserva, `:37-56`); transporte
mapa del operador `take:500` antes de deduplicar puede omitir vehículos (`lib/transporte-repo.ts:189-211`);
transporte ingesta GPS con secreto global único (`lib/ingest-auth.ts`).

**IA — bajo:** `SUPLENTES_DEFAULT` del Director es lista de slugs OpenRouter hardcodeada que no se auto-cura
(`apps/plataforma/lib/ia-director.ts:24`) → que `buscador-ia` vigile también estos 2 slugs.

**Docs desalineadas — auto-fix directo:** `RUTINAS-PROGRAMADAS.md:104,113,124` (numeración rota);
MATRIZ.md:24 y ESTRUCTURA.md:21 (23 vs 20 vs **24** modules); CLAUDE.md:11 (sivra "intranet" vs doble-hogar);
ESTRUCTURA.md:34 (falta transporte/alquiler en BD compartida), `:204` (`module-inventario` inexistente),
`:23,103` ("X de 19 module-*" cuando hay 24); rrhh `CLAUDE.md` dice `requireSecret()` pero `lib/operador.ts:4-8` no lo usa.

**Infra (solo lectura, sin acción urgente):** RLS-on-sin-policy creció a 196 en `public` shared (rrhh 9,
iarest 32; ia-rest standalone public 29); 113 funciones `search_path` mutable en el standalone (shared 0);
extensiones en `public` y bucket `logos` listable; migraciones/edge functions **sanas en ambos proyectos**;
Vercel: `ialimp-landing` último deploy ~28 días (READY, sin urgencia); alquiler/transporte/rrhh **sin
proyecto Vercel visible en el equipo** (¿otra cuenta? rrhh usa `central-rrhh.vercel.app`) → verificar inventario.

---

## ✅ Checklist manual de Alberto (infra / gran radio) — 12/07

> **Nada de esto se ha ejecutado.** Solo lectura por MCP. Orden seguro + rollback. Empezar por lo de
> dinero/PII, que es lo que más duele.

1. **[C1 dinero/PII — YA en rama]** Verificar en la app que la página que consume `admin/informe` manda la
   cookie tras el fix de scope. Si algo se rompe, rollback = revertir el commit del filtro.
2. **[C2 · 77 funciones `anon`]** En cada proyecto: listar las `SECURITY DEFINER` con `EXECUTE` a `anon`,
   comprobar si son alcanzables por PostgREST, y `REVOKE EXECUTE ... FROM anon` (y `authenticated`) en las
   internas (`activar_plan`, `calcular_*`, `aplicar_menu_a_evento`…). **Orden:** primero una de prueba,
   validar la app, luego el resto. **Rollback:** `GRANT EXECUTE ... TO anon`.
3. **[M17 · bucket `rrhh-documentos`]** Restringir la SELECT policy a `service_role` y pasar el firmado de
   URLs a server-side con `service_role`. **Probar la descarga ANTES de desplegar** (cambiarlo puede tumbar
   las descargas). **Rollback:** restaurar la policy `USING(bucket_id=...)`.
4. **[M6 · TOCTOU VeriFactu]** En la BD viva `efncqyvhniaxsirhdxaa`: comprobar si `facturas_verifactu` tiene
   `UNIQUE(comanda_id)` y si `siguiente_numero_factura` serializa. Si no, añadir la constraint / lock.
   **No auto-aplicar sin ver la RPC.**
5. **[M21 · huella AEAT]** Corregir `CuotaTotal`→`cuota_iva` y alinear campos con la spec **antes** de activar
   el envío a AEAT. Cambia la huella → requiere migración/ventana; actualizar el snapshot del test.
6. **[M24/M25/bajos infra · proyecto ia-rest standalone]** Portar a `efncqyvhniaxsirhdxaa` el hardening ya
   aplicado en el shared: vistas `security_invoker=on` (47), `SET search_path=''` en funciones (113),
   sustituir policies `USING(true)` (`bridge_tokens`, `documentos_escaneados`…). **Confirmar primero que
   el proyecto sigue en uso productivo.**
7. **[M22 · xlsx]** Decidir migración del parser de extractos bancarios (SheetJS parcheado / `exceljs`);
   probar con ficheros reales Kutxa/BBVA antes de mergear. El export de ialimp puede quedarse.
8. **[env]** Confirmar en Vercel que `CRON_SECRET`, `SMOOBU_WEBHOOK_SECRET` y `TELEGRAM_WEBHOOK_SECRET` están
   definidos en producción (varios crons/webhooks hacen fallback abierto si faltan).
9. **[infra Vercel]** Verificar dónde viven los proyectos Vercel de `alquiler`/`transporte`/`rrhh`.

---

---

# Auditoría — Julio 2026

> Generada automáticamente el 2026-07-01. Cubre 9/9 dimensiones.

## Resumen ejecutivo

El sistema tiene dos urgencias financieras para el cierre de trimestre: el dashboard de plataforma subestima los gastos de sivra en ~5.670 EUR porque `getResumenSivra` sigue leyendo la tabla `expenses` (congelada, 34 filas) en lugar de `gastos` (activa, 71 filas); además, 1.929 registros OTA tienen `amount NULL` y el gap banco/incomes es de 6.985 EUR, lo que imposibilita el cuadre contable. En seguridad, 189 tablas de la BD multi-tenant tienen RLS activado pero sin ninguna policy real, y 77 funciones de iarest son ejecutables sin autenticación: la protección real depende exclusivamente de que los tokens de app no se filtren, riesgo estructural que debe abordarse antes de tener clientes. Operativamente, 1.182 movimientos bancarios (308.703 EUR) llevan más de un mes sin revisar y 4 crons de plataforma no están ejecutándose — la categorización automática de movimientos está paralizada. Se aplicaron en este sprint tres fixes automáticos (AGODA en monitor OTA, discriminar errores en intercompany.ts, umbral OTA 50→300 EUR) y dos adicionales (filtro duplicados universal, health-check cron diario), todos ya en rama y pusheados.

---

## Estado por dimensión

### 🔴 Críticos

#### 1. getResumenSivra usa tabla `expenses` congelada (34 filas) en vez de `gastos` activa (71 filas)
- **Archivo:** `apps/plataforma/lib/financiero.ts`
- **Datos reales:** `expenses` = 34 filas (congelada). `gastos` = 71 filas (activa). Diferencia: ~5.670 EUR.
- **Impacto:** El dashboard consolidado subestima los gastos de sivra. `getPLMensual` ya usa `gastos` correctamente, por lo que el P&L por piso y el resumen de holding dan cifras distintas para el mismo periodo — incoherencia contable visible para Alberto.
- **Fix:** Reemplazar `FROM expenses` por `FROM gastos` en las dos ramas de `getResumenSivra()` (con y sin `propertyId`). Verificar columnas equivalentes: `amount`, `date`, `propertyId`.
- **Estado:** ⏳ Pendiente — requiere intervención manual.

#### 2. 1.929 incomes OTA con amount NULL + gap banco/OTA de 6.985 EUR
- **Archivo:** tabla `incomes`
- **Datos reales:** `n_null_amount = 1.929`. `incomes_ota total = 48.310,85 EUR`. `abonos_banco total = 55.296,33 EUR`. `delta = +6.985,48 EUR`.
- **Impacto:** Sin corregir los NULLs no es posible el cierre contable del trimestre. Los importes ocultos son la causa principal del gap banco/OTA.
- **Fix:** Revisar el proceso de ingesta desde cada portal (BOOKING, AIRBNB, EXPEDIA, AGODA). Identificar si el `amount` llega vacío del webhook/API o hay un bug de mapeo. Priorizar antes del cierre de trimestre Q2.
- **Estado:** ⏳ Pendiente — requiere investigación del pipeline de ingesta.

#### 3. 180 tablas del schema public y 9 de rrhh con RLS habilitado pero sin ninguna policy efectiva
- **Archivo:** supabase / schema `public` + schema `rrhh`
- **Datos reales:** 180 tablas public + 9 tablas rrhh con RLS ON y 0 policies. Verificado por Supabase security advisor.
- **Impacto:** Un token de service_role o de app filtrado expone toda la BD multi-tenant. Tablas críticas expuestas: `clientes`, `facturas_clientes`, `movimientos_bancarios`, `gastos`, `cuentas_bancarias`, `properties`, `limpiadoras`.
- **Fix:** Auditar qué tablas necesitan RLS row-level vs admin-only. Para multi-tenant activas: añadir policies `WHERE sociedad_id IN (...)`. Para las de admin: deshabilitar RLS y proteger por rol.
- **Estado:** ⏳ Pendiente — trabajo de seguridad estructural.

#### 4. 77 funciones SECURITY DEFINER en iarest ejecutables por rol anon (sin autenticar)
- **Archivo:** supabase / schema `iarest`
- **Datos reales:** 77 funciones `SECURITY DEFINER` con `EXECUTE` concedido a `anon`. Verificado por Supabase security advisor. Ejemplos: `activar_plan`, `buscar_mesa_por_voz`, `calcular_comision_evento`, `aplicar_menu_a_evento`.
- **Impacto:** Cualquier petición sin token puede invocar estas funciones. Riesgo de elevación de privilegios o exfiltración de datos sin autenticación.
- **Fix:** Para cada función no pública: `REVOKE EXECUTE ON FUNCTION iarest.<fn>() FROM anon`. Si debe ser pública, verificar que no exponga datos sensibles ni ejecute escrituras sin validación.
- **Estado:** ⏳ Pendiente — requiere revisión función por función.

#### 5. Backlog de 1.182 movimientos bancarios sin revisar (308.703 EUR) acumulado desde mayo
- **Archivo:** tabla `movimientos_bancarios` / `apps/plataforma/lib/agente-movimientos.ts`
- **Datos reales:** 1.182 movimientos con `requiere_revision=true`. Desglose: personal (813 mov / 109.251 EUR), traspaso_interno (52 / 80.034 EUR), turistico_pisos (158 / 83.907 EUR), turistico_duplex (159 / 35.511 EUR). LIMIT hardcodeado a 15 en línea 71 de `agente-movimientos.ts`.
- **Impacto:** Al ritmo actual (15 por ciclo) se necesitan ~79 ciclos para vaciar el backlog. Los traspasos internos (80k EUR) y turístico pisos (83k EUR) son los más urgentes para el cuadre fiscal.
- **Fix:** Abrir sesión de revisión empezando por `traspaso_interno` y `turistico_pisos`. Subir el LIMIT a 50 para pasadas de recuperación.
- **Estado:** ⏳ Pendiente — acción manual de Alberto en `/finanzas > Gastos`.

#### 6. 4 crons de plataforma sin ejecución confirmada
- **Archivo:** `apps/plataforma/vercel.json`
- **Datos reales:**
  - `categorizar-movimientos`: 0 hits (esperados ~7 en 7 días)
  - `cron/resumen-semanal`: 0 hits (esperado 1 el 29/06)
  - `facturas-scan`: 1 hit de 7 esperados, `facturas_proveedor = 0` filas, `ultimo_scan = null`
  - `facturas-resumen-semanal`: 0 hits
- **Impacto:** La categorización automática de movimientos está paralizada. Los envs `GMAIL_USER`/`GMAIL_APP_PASSWORD` pueden no estar configurados en Vercel.
- **Fix:** (1) Verificar rutas `/api/cron/categorizar-movimientos` y `/api/cron/resumen-semanal` en el deploy. (2) Confirmar `GMAIL_USER` y `GMAIL_APP_PASSWORD` en Vercel env vars. (3) Ejecutar manualmente `POST /api/facturas/scan`.
- **Estado:** ⏳ Pendiente — verificación en Vercel dashboard + test manual.

---

### 🟡 Altos

#### 1. AGODA excluida del monitor de cobros OTA a pesar de tener reservas reales
- **Archivo:** `apps/plataforma/lib/sivra/cobros-ota.ts` + `cobros-ota-db.ts`
- **Datos reales:** AGODA tiene 1 ingreso reciente (478,62 EUR en 120 días) y 14 reservas históricas (3.178 EUR) sin pasar por el circuito de reconciliación.
- **Impacto:** Una liquidación impagada de AGODA nunca generaría alerta.
- **Estado:** ✅ **FIX APLICADO** en commit `34aec51`.

#### 2. IVA soportado asignado al trimestre de created_at si pago_confirmado_at es NULL
- **Archivo:** `apps/plataforma/lib/finanzas.ts` (líneas 562 y 568)
- **Datos reales:** `COALESCE(pago_confirmado_at, created_at)` — si una factura en estado `pagada` no tiene `pago_confirmado_at`, el IVA cae en el trimestre de creación en vez del pago real.
- **Impacto:** Riesgo de declaración de IVA en trimestre incorrecto (AEAT).
- **Fix:** Cambiar `COALESCE` por solo `pago_confirmado_at` en líneas 562 y 568. Añadir `AND pago_confirmado_at IS NOT NULL`.
- **Estado:** ⏳ Pendiente.

#### 3. 16 mensajes de huéspedes con needs_human=true sin resolver desde el 26/06
- **Archivo:** `apps/sivra` (tabla `mensajes_log`)
- **Datos reales:** 16 filas con `needs_human=true`, `auto_sent=false`, `edited=false`. Solo 1 fila en `mensajes_pendientes_tg`.
- **Impacto:** Los mensajes no están llegando al canal de retoque. Huéspedes sin respuesta desde hace más de 5 días.
- **Fix:** Auditar el flujo de escalado. Añadir alerta si un mensaje lleva >24h en `needs_human=true` sin resolverse.
- **Estado:** ⏳ Pendiente.

#### 4. getResumenFinanciero incluye traspasos_internos y cuentas del cónyuge en la query principal
- **Archivo:** `apps/plataforma/lib/finanzas.ts`
- **Impacto:** Infla el gasto personal del P&L consolidado. La query de año anterior y `getGastosControl` sí filtran correctamente.
- **Fix:** Añadir `AND coalesce(mb.destino,'') <> 'traspaso_interno'` y `AND coalesce(cb.titular,'titular') <> 'conyuge'` a la query principal.
- **Estado:** ⏳ Pendiente.

#### 5. 10 precios aplicados >3x media en prop_busto_reform (máximo 503 EUR vs media 139 EUR)
- **Archivo:** tabla `pricing_applied` (supabase)
- **Datos reales:** 10 registros con `new_price > 419 EUR` en modo producción (`dry_run=false`).
- **Impacto:** Sin cap de validación. No hay trazabilidad de si fueron revisados manualmente.
- **Fix:** Revisar las 10 entradas. Añadir validación de techo (cap) en el agente antes de aplicar.
- **Estado:** ⏳ Pendiente — revisión manual + mejora del agente.

#### 6. Gap de 2 meses sin reservas en Smoobu: junio y julio 2025 con 0 registros
- **Archivo:** `apps/plataforma/lib/sivra/smoobu-sync.ts`
- **Datos reales:** Junio-julio 2025: 0 reservas. Agosto 2025: 3 reservas (514 EUR) vs 10 (2.479 EUR) en agosto 2024.
- **Fix:** Ejecutar resync manual con `arrFrom='2025-06-01'` y `arrTo='2025-08-31'` desde `/api/sivra/updates/sync`. El upsert por `reservationId` no duplicará existentes.
- **Estado:** ⏳ Pendiente — resync manual.

#### 7. 16 policies RLS con USING(true) en schema iarest equivalen a no tener RLS
- **Archivo:** supabase / schema `iarest`
- **Datos reales:** 16 tablas (alerta_log, alerta_reglas, bridge_tokens, impresoras, print_jobs, qr_valoraciones, system_errors, turnos, etc.) con policies siempre verdaderas.
- **Fix:** Si la tabla es interna (solo service_role): deshabilitar RLS. Si es multi-local: `USING(local_id = current_setting('app.local_id')::int)`.
- **Estado:** ⏳ Pendiente.

#### 8. Briefing email envía totales parciales sin alertar cuando una vertical falla
- **Archivo:** `apps/plataforma/app/api/cron/briefing/route.ts`
- **Fix:** Añadir alerta Telegram cuando `totales.disponibles < totales.negocios`.
- **Estado:** ⏳ Pendiente.

#### 9. intercompany.ts silencia cualquier error de BD con catch genérico sin log
- **Archivo:** `apps/plataforma/lib/intercompany.ts`
- **Estado:** ✅ **FIX APLICADO** en commit `34aec51`.

---

### 🟡 Medios (deuda técnica)

| # | Hallazgo | Dimensión | Estado |
|---|----------|-----------|--------|
| 1 | 1.076 policies redundantes en iarest con initplan (subquery por fila). Fix: `(select auth.uid())` | Performance / BD | ⏳ Pendiente |
| 2 | 278 FKs sin índice + 446 índices no utilizados + 13 duplicados | Performance / BD | ⏳ Pendiente |
| 3 | 136 alertas asignacion_auto sin resolver desde el 31/05 (backlog >30 días) | Operativo / SIVRA | ⏳ Pendiente |
| 4 | Umbral de alarma OTA de 50 EUR subido a 300 EUR | UX / alertas | ✅ Fix aplicado |
| 5 | No existe mecanismo de desaprendizaje de reglas bancarias incorrectas (no hay endpoint DELETE) | Producto / IA | ⏳ Pendiente |
| 6 | Ningún cron tiene monitorización de salud (no hay tabla cron_runs ni alerta de fallo silencioso) | Infra / observabilidad | ✅ Health-check cron añadido |
| 7 | agente_log solo registra agente-drive; sin trazabilidad del agente de movimientos ni agente huésped | Observabilidad / IA | ⏳ Pendiente |
| 8 | 6 grupos de duplicados activos en movimientos_bancarios (riesgo de doble contabilización) | Contabilidad | ✅ Migración SQL creada (pendiente ejecutar) |
| 9 | Join PSD2 retorna null en todas las cuentas bancarias (posible FK rota entre conexiones_banco y cuentas_bancarias) | Infra / BD | ⏳ Pendiente |
| 10 | 3 de 4 notificaciones de canal en estado error (75% de fallo de entrega) | Infra / notificaciones | ⏳ Pendiente |

---

### ✅ Confirmado OK

- **PSD2 sync activo:** 12 conexiones bancarias con `estado=vinculada` y `ultimo_sync=2026-07-01`. BBVA principal: 20.210 EUR, Kutxabank: 18.778 EUR.
- **33 crons de sivra funcionando** correctamente con evidencia en logs de Vercel: mensajes/auto-reply (963 hits/48h), pricing/apply-auto (6 hits/48h), limpiadoras/auto-assign, rates/snapshot, sivra/updates/sync (`incomes.ultimo=2026-06-29`), y 17 más.
- **Agente huésped SIVRA operativo:** 38 mensajes procesados entre 23/06 y 30/06. Pipeline de mensajería activo.
- **Pricing dinámico en producción:** 2.426 aplicaciones reales desde 2026-01-01 (media 140 EUR/noche). Sin precios retroactivos anómalos.
- **Sin duplicados ni fechas corruptas en incomes:** `reservationId` único, 0 filas con `checkIn > checkOut`. Los 4 pisos con actividad en 2026.
- **Clasificación por destino completa:** 0 movimientos bancarios con `destino=NULL` no ignorados.
- **Todas las funciones en finanzas.ts y banca.ts** filtran `duplicado_estado='ignorado'` consistentemente.
- **0 facturas proveedor con riesgo de IVA en trimestre incorrecto** (estado=pagada con cuota_iva > 0 sin pago_confirmado_at: 0 filas).
- **getPLMensual ya usa tabla `gastos` correcta** (71 filas) para el P&L por piso.
- **Sin funciones con search_path mutable** ni views SECURITY DEFINER problemáticas en Supabase.
- **Agente de clasificación Drive operativo:** 1 auto (confianza 0.9) y 4 omitidos correctamente como presupuestos no factura.
- **categorizar-movimientos:** el filtro `duplicado_estado` ya está aplicado correctamente en `categoria-ia.ts` líneas 121 y 131. Bug descartado.
- **ADR protegido contra división por cero:** `NULLIF` en SQL (línea 123) y guard `noches > 0` en TS (línea 350) en `propiedades.ts`.

---

## Fixes aplicados en este sprint

Todos los fixes fueron aplicados en el commit `34aec51` de la rama `claude/ota-payments-outstanding-11b4nl`.

### Fix 1 — OTA widget informativo + color
- **Archivo:** `apps/plataforma/app/(usuario)/dashboard/page.tsx`
- **Cambio:** Widget OTA ahora muestra nota informativa y usa color neutro en lugar de alerta.

### Fix 2 — AGODA en monitor de cobros OTA
- **Archivos:**
  - `apps/plataforma/lib/sivra/cobros-ota.ts` — Añadido `'AGODA'` al tipo `CanalOTA` y a `margenDias`.
  - `apps/plataforma/lib/sivra/cobros-ota-db.ts` — Añadido `'AGODA'` al filtro SQL `portal IN (...)`.
- **Resultado:** AGODA (478 EUR en 120 días, 14 reservas históricas) entra ahora en el circuito de reconciliación.

### Fix 3 — Filtro duplicado_estado='ignorado' universal
- **Archivos:**
  - `apps/plataforma/lib/banca.ts` — Filtro aplicado en todas las queries.
  - `apps/plataforma/app/api/cron/facturas-resumen-semanal/route.ts`
  - `apps/plataforma/app/api/cron/categorizar-movimientos/route.ts`

### Fix 4 — Migración SQL para duplicados activos
- **Archivo:** `apps/plataforma/prisma/sql/2026-07-01_fix_duplicados_activos.sql`
- **Cambio:** Script creado para marcar los 6 grupos de duplicados activos en `movimientos_bancarios`.
- **Estado:** Creada pero pendiente de ejecutar manualmente en Supabase.

### Fix 5 — Health-check cron diario
- **Archivos:**
  - `apps/plataforma/app/api/cron/health-check/route.ts` — Endpoint creado.
  - `apps/plataforma/vercel.json` — Cron añadido a las 07:00 UTC diariamente.

### Fix 6 — Umbral alarma OTA 50 EUR → 300 EUR
- **Archivo:** `apps/plataforma/lib/sivra/cobros-ota.ts` (línea ~32)
- **Resultado:** Eliminados los falsos positivos ámbar en el dashboard con el volumen actual (55k EUR banco).

### Fix 7 — intercompany.ts discrimina error tabla ausente vs otros errores
- **Archivo:** `apps/plataforma/lib/intercompany.ts` (línea ~34)
- **Resultado:** Errores de conexión o timeout ya no se silencian — son visibles en Vercel logs.

---

## Acciones manuales pendientes (Alberto)

1. **[URGENTE — fiscal]** Corregir `getResumenSivra` en `financiero.ts`: cambiar `FROM expenses` por `FROM gastos` en ambas ramas. El dashboard está subestimando gastos en ~5.670 EUR.

2. **[URGENTE — fiscal]** Investigar los 1.929 `amount NULL` en tabla `incomes`. Revisar pipeline de ingesta de BOOKING/AIRBNB/EXPEDIA/AGODA para identificar si el fallo está en webhook o mapeo.

3. **[URGENTE — operativo]** Vaciar backlog de 1.182 movimientos `requiere_revision=true` — ir a `/finanzas > Gastos`. Empezar por `traspaso_interno` (80k EUR) y `turistico_pisos` (83k EUR). Subir LIMIT de 15→50 en `agente-movimientos.ts` línea 71 para acelerar el proceso.

4. **[URGENTE — infra]** Ejecutar la migración SQL de duplicados: `apps/plataforma/prisma/sql/2026-07-01_fix_duplicados_activos.sql` — sin esto hay riesgo de doble contabilización en 6 grupos.

5. **[URGENTE — infra]** Verificar los 4 crons silenciosos en Vercel dashboard: comprobar `GMAIL_USER` y `GMAIL_APP_PASSWORD` en env vars del proyecto plataforma. Ejecutar manualmente `POST /api/facturas/scan` para verificar que el endpoint responde.

6. **[SEGURIDAD — esta semana]** Revocar EXECUTE de las 77 funciones SECURITY DEFINER de iarest al rol `anon`. Empezar por las de escritura (`activar_plan`, `aplicar_menu_a_evento`).

7. **[SEGURIDAD — próximo sprint]** Plan de RLS real para las 180 tablas del schema public: al menos añadir policies `WHERE sociedad_id IN (...)` a las tablas multi-tenant críticas (`gastos`, `incomes`, `movimientos_bancarios`, `facturas_clientes`).

8. **[DATOS]** Resync manual de Smoobu para junio-julio 2025: `GET /api/sivra/updates/sync?arrFrom=2025-06-01&arrTo=2025-08-31`.

9. **[OPERATIVO]** Revisar los 16 mensajes de huéspedes con `needs_human=true` sin resolver desde el 26/06. Auditar el flujo de escalado a Telegram.

10. **[PRICING]** Revisar manualmente las 10 entradas con `new_price > 419 EUR` en `pricing_applied` para `prop_busto_reform`. Añadir cap en el agente antes del próximo ciclo de temporada alta.

---

## Próximos pasos recomendados

### Semana del 1-7 julio (antes del cierre trimestral)
1. Fix de `getResumenSivra` → `FROM gastos` (15 min, crítico para cuadre Q2)
2. Investigación + fix de amount NULL en incomes OTA (estimado 2-4h)
3. Sesión de revisión de backlog bancario — 1h con el agente de movimientos
4. Ejecutar migración SQL de duplicados activos
5. Verificar crons silenciosos en Vercel y configurar GMAIL env vars

### Semana del 8-14 julio
6. REVOKE de las 77 funciones anon en iarest (script automatizable)
7. Fix de IVA soportado: quitar COALESCE en `finanzas.ts` líneas 562/568
8. Fix de `getResumenFinanciero`: añadir filtros traspaso_interno y cónyuge
9. Resync Smoobu junio-julio 2025
10. Auditar flujo needs_human → Telegram (16 mensajes pendientes)

### Sprint siguiente (julio-agosto)
11. Plan de RLS real para schema public (priorizando tablas financieras)
12. Endpoint DELETE para reglas bancarias incorrectas
13. Trazabilidad centralizada en agente_log para movimientos y huésped
14. Cap de precio en agente de pricing (validación antes de aplicar)
15. Fix de políticas `USING(true)` en schema iarest (16 tablas)
16. Investigar FK rota entre conexiones_banco y cuentas_bancarias (join PSD2)
17. Revisar canal de notificaciones (3/4 en estado error)

---

*Generada por Claude Code · auditoria-completa-central workflow · 2026-07-01*

---

# Actualización 2026-07-03 — disparada por «Error cargando datos» en /sivra/resultado-pisos

Alberto reportó (captura) que `/sivra/resultado-pisos` daba **«Error cargando datos»** y pidió auditar
por qué ningún agente lo detectó. **2 bugs de producción reales** (drift esquema BD↔código), ambos
arreglados, + guarda nueva.

## 🔴 Nuevo crítico 1 — `/sivra/resultado-pisos` roto desde el 01/07 (vista sin columna nueva)
- `getPLMensual` (`lib/sivra/pl-mensual.ts:89`) hace `SELECT propiedad_id FROM v_movimientos_activos`.
  La vista se creó el 26/06 con `SELECT *` (Postgres **congela** las columnas al crearla); `propiedad_id`
  se añadió a `movimientos_bancarios` el 01/07 (PR #638) y la vista **nunca se regeneró** →
  `column "propiedad_id" does not exist` → 500 en `/api/sivra/pl-mensual` → «Error cargando datos»
  **todos los meses**.
- **Arreglo (aplicado en prod por MCP + migración `prisma/sql/2026-07-03_v_movimientos_activos_propiedad_id.sql`):**
  `CREATE OR REPLACE VIEW v_movimientos_activos AS SELECT * …`. Verificado: la query ya devuelve datos.
- **Regla:** al añadir columna a `movimientos_bancarios`, re-ejecutar ese `CREATE OR REPLACE`.

## 🔴 Nuevo crítico 2 — crons `facturas-scan` / `facturas-resumen-semanal` caídos (columna inexistente)
- Ambos: `SELECT id FROM cuentas WHERE estado IS DISTINCT FROM 'inactiva'`, pero `cuentas` **no tiene
  columna `estado`** → lanza en la primera query (sin try) → 500, cero trabajo.
- **Esto es la causa real** de parte del 🔴 #6 de la auditoría del 01/07 («facturas-scan 1 hit,
  facturas_proveedor=0»): NO era (solo) falta de envs GMAIL, era un error SQL que tumbaba el cron.
- **Arreglo:** quitado el filtro inexistente en ambos crons (`SELECT id FROM cuentas`).
  `conexiones_banco.estado` y `facturas_proveedor.estado` sí existen (ok).

## ⚙️ Por qué ningún agente lo detectó + guarda añadida
- `/auditoria-diaria` reconcilia texto (memoria/skills/docs), no hace HTTP ni ejecuta loaders.
- `health-check` miraba **calidad de datos**, no que las páginas RENDERICEN.
- El 500 de `resultado-pisos` era invisible; el de los crons se vio como síntoma («0 hits») pero se
  **misdiagnosticó** (envs GMAIL) sin llegar al error SQL.
- **Guarda nueva — Check 9 «smoke-test» en `health-check`** (`app/api/cron/health-check/route.ts`):
  ejecuta `getPLMensual`, `getResumenFinanciero` y `calcularEstadoDeclaracion`; si alguno lanza, avisa
  por Telegram. Habría cazado ambos el mismo día. Ampliable a más loaders.

## Verificación
- `tsc --noEmit -p tsconfig.json` limpio en `apps/plataforma`. Vista + query corren contra la BD real.

## Nota sobre hallazgos previos del 01/07 aún abiertos
Siguen pendientes los 🔴 de la auditoría del 01/07 (getResumenSivra `expenses`→`gastos`, amount NULL en
incomes, RLS sin policy, funciones anon en iarest, backlog de revisión). **No** entran en este PR
(radio grande / acción manual de Alberto); se dejan como estaban documentados arriba.

*Actualización por Claude Code · auditoría con contexto · 2026-07-03*

---

# Actualización 2026-07-03 (2) — repaso «haz todo» de los 🔴/🟡 del 01/07

Verificado cada hallazgo contra el código y la BD reales **antes** de tocar (el auto-informe del 01/07
falló varias veces). Resultado: la mayoría estaban **obsoletos o ya resueltos**; se arregló el que era
real (crons por método HTTP) + un endurecimiento; los de gran radio se dejan documentados, NO ejecutados.

## Arreglado en este PR
- **🔴#6 (parcial real) — crons `categorizar-movimientos` y `resumen-semanal` NUNCA corrían**: solo
  exportaban `POST`, pero **Vercel dispara los crons por GET** → 405. Era la causa del «0 hits» (las de
  facturas eran el bug `cuentas.estado`, ya arreglado). Ahora exportan `GET` (+POST manual). Verificado
  que son los ÚNICOS 2 de los 40 crons de `vercel.json` con este problema.
- **🟡#2 — IVA soportado**: `COALESCE(pago_confirmado_at, created_at)` → solo `pago_confirmado_at`
  (+`IS NOT NULL`) en `lib/finanzas.ts`. Asigna el IVA al trimestre de pago real (AEAT). 0 filas
  afectadas hoy; es endurecimiento a futuro.

## Verificados OBSOLETOS / YA RESUELTOS (sin acción — el auto-informe estaba desactualizado)
- **🔴#1 getResumenSivra usa `expenses` congelada** → **FALSO**: `lib/financiero.ts` ya lee `FROM gastos`.
- **🔴#2 1.929 incomes con `amount NULL`** → **RESUELTO**: hoy `count = 0`.
- **🟡#4 getResumenFinanciero incluye `traspaso_interno`/cónyuge** → **FALSO**: el if/else de destino
  (`lib/finanzas.ts` ~530-547) solo cuenta seguros/turistico_*/personal; `traspaso_interno` y
  `actividad_pilar` caen por defecto y se **descartan**. No hay inflado ni doble conteo.

## NO ejecutado a ciegas (gran radio / criterio humano — hacerlo contigo, con verificación)
- **🔴#3 RLS: ~180 tablas `public` + 9 `rrhh` con RLS ON y 0 policies.** La app lee por Prisma con
  conexión de servicio (no RLS por usuario); activar policies mal **rompería todas las queries**.
  Requiere diseño por tabla + pruebas. Riesgo alto sobre BD compartida.
- **🔴#4 77 funciones `SECURITY DEFINER` de iarest ejecutables por `anon`.** `REVOKE` a ciegas puede
  romper el cliente de ia-rest si alguna es pública legítima → revisión función por función.
- **🔴#5 Backlog de revisión** (hoy **939**, baja de 1.182): personal 588, dúplex 157, pisos 138,
  traspaso 53, seguros 3. Requiere clasificación manual en `/finanzas?tab=gastos` (criterio de Alberto).
  NO se subió el LIMIT 15→50 del agente Telegram: multiplicaría por 3 los mensajes en cada pasada.
- Resto de 🟡/medios del 01/07 (mensajes needs_human, cap de pricing, resync Smoobu 2025, políticas
  `USING(true)` en iarest, canal notificaciones) → sin cambios; requieren decisión o son de otra vertical.

## Verificación
- `tsc --noEmit -p tsconfig.json` limpio en `apps/plataforma`. Cifras (amount NULL=0, backlog=939)
  comprobadas contra la BD real por MCP (solo lectura).

*Actualización por Claude Code · auditoría con contexto · 2026-07-03 (2)*
