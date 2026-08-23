# Auditoría diaria — agosto 2026

# Actualización 2026-08-23 — auditoría PROFUNDA (semanal)

Rango: 22 commits desde la última auditoría (2026-08-21 02:01 UTC, `a953b05..HEAD`). Incluye: trading
(screener saneado + contraste de cifras + splits/divisa, PR #1579), coordinador patrimonial (`/patrimonio`
+ skills `radar-espana`/`patrimonio-cfo`, PR #1591), vigía de conectores MCP (PR #1581), swap del modelo
NIM por defecto (PR #1583), dos fixes de `pricing-canal.ts` en sivra (PRs #1582/#1586), rescate de 22 Edge
Functions huérfanas (PR #1517), SES.HOSPEDAJES (PR #1555), fix de ruido en psd2 (PR #1575), cierre/coherencia
del agente-huésped (PR #1568).

## 🔴 Heartbeat de crons y agentes — 3 hallazgos reales, causa probable común
**a) `agente_latidos`:**
- ⛔ `sivra_mercado_sweep` — 47,1h sin pasada buena (umbral 30h). Detalle: 70 fallos "Serper 400" en
  la última pasada — degradación técnica del buscador, no falta de mercado.
- ⛔ `sivra_mercado_booking` — `ok=true` pero 46,5h desde el último latido (umbral 30h; es rutina de
  sesión Claude, no cron Vercel). Última pasada viernes 21/08 03:40 — no corrió el fin de semana.
  **Consecuencia visible:** `sivra_canal` (18,4h, ok) reporta "4 pisos · 4 sin ventanas nuevas" — los
  4 pisos frenados por falta de mercado fresco, correlación directa con lo anterior.
- 🟡 `ses_transporte` — `ok=false`, nunca tuvo pasada buena. Detalle: "no hay ningún establecimiento
  dado de alta en /sivra/partes/establecimientos" — coincide con el pendiente ya conocido de Alberto
  (PR #1555: dar de alta los 4 pisos), no es una avería nueva.
- 🟡 `trading_operaciones` — declarado en `AGENTES_VIGILADOS` (umbral 80h) pero **cero filas** en
  `agente_latidos`: nunca ha latido. La tabla se creó el 19/08 con una carga manual única (455
  operaciones); no hay indicio de que la rutina diaria la esté disparando todavía.

**b) Tablas de dominio:**
- ⛔ **`psd2-sync`** — `movimientos_bancarios` sin fila nueva desde hace **68,2h** (umbral 54h, ya
  ampliado para cubrir fin de semana). Sin huella propia en `agente_latidos`; el guardián dedicado
  `psd2-health-check` solo corre los miércoles, así que si el corte empezó el viernes nadie lo habría
  cazado hasta la próxima pasada semanal.
- ⛔ `AGENTE mercado-booking (diario)` — mismo hallazgo que en (a), 46,5h.

**c) Auto-reparaciones (`agente_reparaciones`):** ✅ sin intentos en 7 días, nada que coordinar.

**Cobertura:** 🟡 `radar-espana` (nuevo, PR #1591) está en `docs/RUTINAS-PROGRAMADAS.md` pero sin huella
en `AGENTES_VIGILADOS` ni en la query de tablas de dominio; su próxima pasada natural es el 01/09, así
que un fallo silencioso no lo cazaría nadie hasta entonces. `patrimonio-cfo` ya consta "pendiente de
trigger" en su propio doc — no es hallazgo nuevo.

**Causa probable común (a)+(b):** la rutina de sesión `mercado-booking` no corrió el fin de semana
(21→23/08), lo que arrastra `sivra_canal` sin corregir y puede explicar también el corte de `psd2-sync`
si comparten el mismo patrón de disparo de fin de semana en el trigger de Rutinas de claude.ai. **Acción
recomendada:** Alberto revisa si el trigger de las rutinas de sesión (mercado-booking, psd2-health-check,
y por extensión radar-espana/patrimonio-cfo cuando se creen) está configurado para disparar también en
sábado/domingo.

## 🟡 Backlog de PRs de rutinas — automerge sano, 2 PRs en revisión
`rutinas-automerge.yml`: 🟢 corre cada hora, última ejecución 23/08 02:04 UTC exitosa. Sin PRs de
solo-registro atascados >24h.

| # | Título | Estado | Severidad |
|---|---|---|---|
| [#1594](https://github.com/albertosuarezgutierrez-gif/central/pull/1594) | fix(sivra): pasada de mercado sin comps deja piso sin tarifar | `mergeable_state: dirty` — conflicto de inserción pura en `docs/CONTEXTO-SESIONES.md` (único archivo en conflicto; el resto son ficheros nuevos sin solape) | 🟡 fácil de resolver |
| [#1514](https://github.com/albertosuarezgutierrez-gif/central/pull/1514) | fix(plataforma): paper-tracker sin vigilante en agentes-latido | `mergeable_state: clean`, 3 días sin actividad (bajo el umbral de 7 días) | 🟢 esperando revisión |

## 🟢 Auditoría técnica profunda — sin regresiones, 2 hallazgos menores
- **Integridad/typecheck/tests:** `pnpm install --frozen-lockfile` limpio, radiografía al día,
  typecheck 0 errores en las 9 apps, `pnpm test` 0 fallos (guardián raíz + vitest de ialimp/rrhh/packages).
- **Seguridad multi-tenant:** sin hallazgos en el código tocado en las últimas 48h; guardián de
  secretos de auth en verde; `ses_establecimientos` sin filtro de tenant es intencional y ya declarado
  con fecha de caducidad en su propio SQL (no es hallazgo nuevo).
- **Supabase advisors:** sin ninguna tabla con RLS deshabilitado; 0 errores de seguridad; volumen de
  warnings preexistente y sistémico (no accionable como "nuevo").
- 🟡 **`pdfjs-dist` desactualizado en `apps/ialimp`** — CVE de ejecución JS arbitraria al abrir un PDF
  malicioso; la app procesa PDFs de nóminas/firmas (`lib/nomina-pdf.ts`, `lib/firma-limpiadora.ts`).
  Sin explotación conocida en curso, pero vale la pena priorizar el bump a `>=6.2.108`.
- 🟡 **Vercel `ia-rest`/`transporte`/`central-rrhh`:** 20/20 últimos deploys visibles en estado
  `CANCELED` (0 `READY` en la ventana), probablemente por la cadencia alta de pushes a `main` (Vercel
  cancela el build anterior al llegar uno nuevo antes de que termine) y no por un build roto —
  `plataforma` en la misma ventana sí tiene varios `READY`. **Acción recomendada:** comprobación puntual
  de que `iarest.es` y el dominio de `transporte` sirven el commit actual de `main`.
- Nota de metodología (no accionable para Alberto): correr los typechecks Prisma de las 8 apps en
  paralelo sin regenerar el cliente por-app da ~180 falsos positivos (pnpm hoistea `@prisma/client` a
  una única carpeta compartida). No afecta a Vercel (build aislado por Root Directory).

## ✅ Reconciliación de memoria/skills/docs (carril 1, aplicado)
- `docs/CONTEXTO-SESIONES.md`: los 9 commits sustantivos del rango ya tenían entrada propia — sin huecos.
  Sin contenido de un mes cerrado pendiente de rotar.
- `docs/SKILLS.md`: `patrimonio-cfo`, `radar-espana` y `conectores-vigia` correctamente listadas.
- **`plataforma-maestro` sin fila para el coordinador patrimonial** (PR #1591) — añadida fila en
  `.claude/skills/plataforma-maestro/references/mapa-gate-infra.md` tras la de Subastas.
- **`docs/HUECOS-ABIERTOS.md` desfasado:** H2 (screener de pago) seguía como hueco vivo pese a que
  Alberto recargó el saldo el 21/08 y `screenerMercado.ts` (PR #1579) ya lo usa saneado — movido a
  "huecos cerrados". Mismo desfase en `docs/VIGIA-CONECTORES.md` ("Datos financieros… SIN SALDO") —
  actualizado a "conectado y con saldo".
- Sin contradicciones en reglas fiscales/negocio dictadas (rango no las toca).
- `apps/plataforma/lib/correo/rutas.ts`: ninguna skill nueva del rango produce correo — sin hallazgos.
- Manuales de usuario ia-rest: el rango solo tocó el swap mecánico de modelo NIM (`ai-client.ts`,
  `brain.ts`, 4 edge functions) — nada de `app/**` funcional ni `public/**`, sin hallazgos.

## Acciones manuales de Alberto (orden sugerido)
1. **Revisar el trigger de las rutinas de sesión** (mercado-booking, psd2-health-check) — parece no
   disparar en fin de semana; causa raíz probable de los 3 crons mudos de arriba.
2. Resolver/mergear PR #1594 (conflicto trivial de inserción) y decidir sobre PR #1514.
3. Bump de `pdfjs-dist` en `apps/ialimp` a `>=6.2.108`.
4. Verificar que `iarest.es` y el dominio de `transporte` sirven el commit actual de `main`.

<!-- verificado: 2026-08-23 -->

---

# Actualización 2026-08-19 — auditoría diaria (ligera)

Rango: 12 commits desde la última auditoría (2026-08-18, `04c3b62..128702c`). Casi todos
autodocumentados PR-a-PR (curva de evolución de cartera trading #1476/#1477, compra VWCE
verificada, verificación post-cron PSD2, pasada mercado-booking). Carril 2 vacío hoy.

## ✅ Heartbeat de crons y agentes (24 huellas) — 24/24 ✅
- **a) Latidos `agente_latidos` (12):** todos `ok=true`, dentro de cadencia.
- **b) Tablas de dominio (12):** todas ✅, la más antigua `ia-director-refresh` a 45,0h (umbral 192h).
- Sin ningún ⛔. Sin causa que investigar.

## ✅ Backlog de PRs de rutinas + salud del automerge — sin nada que vigilar
1 PR abierto (**#1478**, draft, `claude/reserva-diciembre-socorro-w7c3z4`, fix pricing Navidad
SIVRA) — no es de "solo registro" (toca código) y tiene <24h, fuera del alcance del automerge y
sin envejecer. `rutinas-automerge.yml` con runs cada hora, el último 19/08 01:56 UTC ✅ (success) —
vigilante vivo.

## ✅ Integridad estructural — sin hallazgos
`pnpm install --frozen-lockfile` OK, radiografía de estructura al día, guardián `pnpm test:guardia`
32/32 ✅ (incluye regresión de scope y de secretos). Los 10 `apps/*/vercel.json` llevan el
`ignoreCommand` correcto. `@central/*` deps ⊆ `transpilePackages` en las 10 apps, sin huecos.

## ✅ Coherencia de docs/skills — sin drift nuevo
Sigue habiendo 32 skills en `.claude/skills/` (ninguna nueva desde ayer) — `docs/SKILLS.md` sigue
al día. Sin contradicciones de "regla permanente" entre memoria y skills.

## ✅ Reconciliación de memoria — nada que anotar de nuevo, un glitch de formato corregido
Los 12 commits del rango llevan su propio commit de memoria emparejado (curva de trading, compra
VWCE, verificación PSD2 — todos ya reflejados en `docs/CONTEXTO-SESIONES.md`). El bloque «Estado
vivo» (actualizado 18/08) sigue vigente, sin pendientes nuevos que cerrar. Único hallazgo: en
`docs/AUTO-APLICADOS.md` las 2 entradas del 18/08 habían quedado insertadas en medio del párrafo
de intro (antes de que terminara de redactarse) en vez de bajo `## Registro` — corregido (sin
pérdida de información, solo reordenado).

## ✅ Manuales de usuario — nada que tocar
Ningún cambio del rango toca `apps/ia-rest/src/app/**` ni `apps/ia-rest/public/**`; la única
feature de UI del rango (curva de evolución en `/trading`) es de `apps/plataforma`, fuera del
alcance de ese check.

---

# Actualización 2026-08-18 — auditoría diaria (ligera)

Rango: 39 commits desde la última auditoría (2026-08-16 PROFUNDA), `27225d8..7f006ec` en `main`.
Nota: no hubo pasada el 17/08 (día de actividad intensísima — 39 commits, casi todos ya
autodocumentados PR-a-PR en `docs/CONTEXTO-SESIONES.md`). Rango revisado por completo sin hallazgos
de código/infra; carril 2 vacío hoy.

## ✅ Heartbeat de crons y agentes (23 huellas) — 23/23 ✅
- **a) Latidos `agente_latidos` (12):** todos `ok=true`, dentro de cadencia. `trading_watchdog`
  con 67,6h sin OK — esperado (cron mar-sáb, hoy es martes y aún no ha corrido; el hueco cubre el
  fin de semana sin actividad, no es mudo).
- **b) Tablas de dominio (11):** todas ✅, la más antigua `ia-director-refresh` a 21,1h (umbral 192h).
- Sin ningún ⛔. Sin causa que investigar.

## ✅ Backlog de PRs de rutinas + salud del automerge — sin nada que vigilar
`gh pr list --state open` → **0 PRs abiertos** (los 3 del 16/08 — #1436/#1437/#1441 — ya mergeados
según la memoria). Sin backlog, no hace falta comprobar la cadencia del workflow hoy.

## ✅ Integridad estructural — sin hallazgos
Lockfile (`pnpm-lock.yaml`) presente. Los 10 `apps/*/vercel.json` (incluida `housesevillana`) llevan
`ignoreCommand: node ../../scripts/vercel-ignore-build.mjs apps/<app>`.

## ✅ Coherencia de docs/skills — sin drift nuevo
`docs/SKILLS.md` reconciliado contra las 32 skills reales de `.claude/skills/`: todas están
documentadas, sin huérfanos. `docs/FUENTES-DE-VERDAD.md` tiene fila para `apps/mariscos`;
`apps/almacen` sigue sin `CLAUDE.md` propio ni fila — es un pendiente YA declarado correctamente
en `MATRIZ.md` (no es información falsa, es un hueco conocido), no se traduce en un hallazgo nuevo.

## ✅ Reconciliación de memoria — 2 pendientes de «Estado vivo» cerrados con su desenlace
De los 39 commits del rango, prácticamente todos llevaban su propio commit `docs(...)` de memoria
emparejado — hueco de reconciliación PR-a-PR: ninguno. El único drift real estaba en el bloque
**«Estado vivo»** (sin tocar desde el 16/08, con dos pendientes ya resueltos por commits
posteriores):
- **Pricing SIVRA — canal Booking:** el pendiente «que Alberto revise el nivel Genius y el
  descuento móvil» (15/08) ya se ejecutó el 16/08 en la extranet (Genius→No, NR −10%, oferta 8%) y
  se verificó el `channel_markup=1.20` en los 4 pisos (17/08, PR #1449). Bullet actualizado con el
  desenlace y el siguiente hito real (medición Fase 4, 30/08).
- **Trading — PASO 0 del trigger:** el pendiente «el PASO 0 no distingue una recuperación
  backdateada» (15/08) se cerró con el trigger reprogramado + estreno real el 17/08 (#1471): el
  disparo primario volvió a fallar (2/2) pero la repesca lo cubrió sin duplicar datos. Bullet
  actualizado; queda a vigilar si el disparo primario falla una 3ª vez (umbral de Alberto para
  abrir ticket a soporte, ya anotado).
- Cabecera del bloque re-fechada a 18/08/2026.

## ✅ Manuales de usuario — nada que tocar
Ningún cambio del rango toca `apps/ia-rest/src/app/**` ni `apps/ia-rest/public/**` con una feature
visible para camarero/cocina/owner (los cambios de UI del rango — botón PSD2 en `/banca`, sección
«Cartera real» en `/trading` — son de `apps/plataforma`, fuera del alcance de este check).

---

# Actualización 2026-08-16 — auditoría diaria (PROFUNDA)

Rango: mismo que la pasada ligera de hoy (49 commits desde el 14/08, `716c8d6..24e8ced`). **Nota de
coordinación:** hay una pasada ligera CONCURRENTE de hoy sin mergear (**PR #1436**, rama
`claude/bold-edison-hwkt9u`) que ya cubrió: `apps/mariscos` ausente de `CLAUDE.md`/`MATRIZ.md`/
`docs/FUENTES-DE-VERDAD.md` y de la matriz de typecheck de `tests.yml`, y la reconciliación del bloque
«Estado vivo» (3 pendientes del 15/08). Esta pasada profunda **no duplica** ese trabajo — se remite a
él y recomienda mergearlo primero. Esta pasada añade lo que solo la profunda cubre: typecheck+tests+
seguridad+deps de las 8 apps y una revisión de infra por MCP más a fondo.

## 🔴 `psd2-sync` — ESCALADO a hallazgo real (6 días sin movimientos, 2 pasadas seguidas igual)
La pasada ligera de hoy (y la del 14/08) ya vieron `psd2-sync` sobre el umbral de huella y lo dejaron
como «verificado, no mudo» (el cron corre a diario, `200`, `conexiones_banco.ultimo_sync` se actualiza
cada día) — el mismo diagnóstico que `updates/sync`/`auto-sessions` (tablas que dependen de actividad
de negocio, no de salud del cron). Esta pasada invoca el guardián dedicado **`psd2-health-check`** con
su consulta oficial (`WHERE origen='psd2'`, obligatoria para no mezclar con las cargas manuales) y da
**🚨 ANOMALÍA CRÍTICA**: último movimiento **10/08/2026**, hoy 16/08 → **6 días, 144h** (umbral 48h).
`mov_30d=61` vs `mov_30d_prev=72` (sin caída de volumen — descarta que sea solo temporada baja).

Por qué esto ya NO es el mismo patrón que `updates/sync`: son **2 cuentas bancarias activas** (BBVA
negocio + Kutxa familiar) con un histórico de ~1-6 movimientos/día casi todos los días de los últimos
20 (`fecha_operacion` con huecos de máximo 1-2 días hasta el 08/08). Un apagón total de **4 días
laborables seguidos** (11,12,13,14/08, más el finde 15-16) en dos cuentas reales no encaja con
inactividad orgánica — encaja con el escenario que la propia skill documenta como riesgo: *"el cron
seguirá ejecutándose sin errores HTTP visibles pero devolviendo 0 movimientos"* (tier gratuito de
Enable Banking / consentimiento con problemas). El consentimiento se creó el 14/06 y caduca a ~90
días (~12/09) — no ha caducado, pero eso no descarta otro fallo silencioso de la sesión vinculada.

**Verificado antes de escalar** (Vercel MCP, proyecto `plataforma`): sin runtime errors en
`/api/cron/psd2-sync` en los últimos 7 días; el log del 15/08 06:00:01 confirma `200`. El fallo, si lo
hay, está DENTRO del handler (en el `.catch(() => [] as MovEB[])` de `getMovimientos`, que traga
cualquier error de la sesión EB sin dejar rastro) — Vercel no lo ve como error porque la función no
lanza.

**Acción recomendada para Alberto:** revisar el consentimiento PSD2 en el panel de Enable Banking (o
disparar `GET /api/cron/psd2-sync?since=2026-08-10` a mano y mirar la respuesta completa, no solo el
`200`) — si la sesión está realmente caducada/revocada del lado del banco, hay que re-vincular desde
`/banca/conectar`. **Aviso Telegram ya enviado** (preflight `200` OK) con este diagnóstico.

## 🟡 Seguridad Supabase (bloque 4/6 — `get_advisors`, ambos proyectos, solo lectura)
- **Proyecto compartido `wswbehlcuxqxyinousql`:** 1 único **ERROR** (`security_definer_view`):
  `public.v_facturas_sin_cargo` (creada 11/08/2026, `prisma/sql/2026-08-11_facturas_drive_movimiento_fk.sql`)
  tiene la propiedad SECURITY DEFINER **y** grants por defecto de `anon`/`authenticated` (SELECT +
  incluso INSERT/UPDATE/DELETE) sin el `REVOKE` explícito que sí se aplicó a `mapa_arquitectura`
  (10/07). La vista expone proveedor/importe/nombre de archivo/URL de Drive de las facturas
  personales de Alberto. 157 WARN (77+77 funciones `security_definer` ejecutables por
  anon/authenticated, 1 función con `search_path` mutable, 2 extensiones —`pg_net`/`vector`— en
  `public`) y 303 INFO (`rls_enabled_no_policy`) son un **patrón sistémico YA presente en todo el
  proyecto** (244 tablas con grant `anon` de base, coherente con la arquitectura BYPASSRLS
  documentada en `CLAUDE.md`) — no nuevo de este rango, no se re-audita entero aquí.
- **Proyecto standalone ia-rest `efncqyvhniaxsirhdxaa`:** 47 vistas `security_definer` + 247 WARN —
  mismo patrón sistémico (POS con muchas vistas de reporting), tampoco nuevo.
- **Acción de bajo riesgo, NO aplicada** (regla: nunca ejecutar migraciones desde la auditoría) —
  propuesta en `apps/plataforma/prisma/sql/2026-08-16_revoke_anon_v_facturas_sin_cargo.sql` de este
  PR: `REVOKE ALL ON v_facturas_sin_cargo FROM anon, authenticated` + `ALTER VIEW ... SET
  (security_invoker = true)`, mismo patrón que `mapa_arquitectura`. Revisar y aplicar por Supabase
  MCP si Alberto lo confirma.

## 🟢 Vercel — deploy + runtime
Último deploy `production` de `plataforma` en `READY` (commit del registro de actividad ialimp,
PR #1433). Sin runtime errors en `/api/cron/psd2-sync` en los últimos 7 días (ver hallazgo de arriba).

## 🟢 Backlog de PRs de rutinas + salud del automerge
2 PRs abiertos de ramas `claude/*`: **#1435** (trading copiloto de órdenes, draft, <24h, sin acción) y
**#1436** (esta auditoría ligera de hoy, draft, código+texto — recomendado mergear pronto ya que las
dos ramas de auditoría de hoy parten del mismo `main`). `rutinas-automerge.yml` con ejecuciones
recientes (última hace minutos, éxito) — el vigilante está vivo.

## ✅ Reconciliación memoria/skills
`docs/SKILLS.md` íntegro contra `.claude/skills/` (32) y `.claude/commands/` (3) — sin huérfanos ni
faltantes. `lib/correo/rutas.ts` sin drift (9 categorías; ninguna skill nueva del rango produce correo
sin categoría propia). `docs/FUENTES-DE-VERDAD.md`: los cambios del rango caen dentro de filas ya
existentes (ialimp/plataforma CLAUDE.md, fiscal-novedades). Sin rotación de memoria pendiente (todas
las entradas del vivo son de agosto). El hueco de `apps/mariscos` y los 3 pendientes de «Estado vivo»
del 15/08 ya los cubre el PR #1436 (no se duplican aquí).

## ✅ Manuales de usuario — nada que tocar
Ningún archivo de `apps/ia-rest/src/app/**`, `apps/ia-rest/src/components/**` ni
`apps/ia-rest/public/**` cambió en el rango.

## 🟢 Bloque técnico — integridad, typecheck, tests
- **Integridad estructural:** lockfile en sync (872 paquetes). `pnpm test:guardia` 32/32 OK. **10 apps
  en el repo** (no 8: `housesevillana` y `mariscos` también cuentan) — las 10 llevan el `ignoreCommand`
  obligatorio en su `vercel.json` y `transpilePackages` cuadra exactamente con sus imports `@central/*`
  reales en ambos sentidos. Radiografía de estructura desfasada por timestamp (drift normal entre
  pushes, se autorregenera) — ya regenerada en el commit anterior de este PR.
- **Typecheck de las 8 apps con Prisma+ia-rest** (`tsc --noEmit`, client regenerado antes de cada
  una): **0 errores en las 8**.
- **`pnpm test`** (raíz): guardián + todos los `packages/*` + tests de apps (ialimp 22, plataforma
  &gt;900 subtests, rrhh 47 vitest + 7 suites de packages) — **0 fallos reales**.
- **Seguridad/multi-tenant** (125 archivos de `apps/*/app/api/**` tocados en 30 días): todas las
  queries multi-tenant revisadas (rrhh admin, almacen, mariscos, ialimp agente-cotizador/leads,
  plataforma operador) llevan scope explícito por `empresa_id`/`cuenta_id`/sesión. Sin hallazgos.
- **Documentación:** confirma independientemente lo que ya cubre PR #1436 — `apps/mariscos` sin
  entrada en `CLAUDE.md` (sección Verticales) ni en `apps/plataforma/lib/estructura.ts`. No se duplica
  aquí.

## 🔴 `next` desactualizado en `housesevillana` (producción pública) — CORREGIDO en este PR
`pnpm audit` marcaba `next@15.5.15` en `apps/housesevillana` con **16 CVEs** (varios *high*: DoS,
SSRF en Server Actions, bypass de middleware/proxy), varias con fix ya publicado. `housesevillana` es
la landing pública de producción (`housesevillana.es`, canal directo de reservas) — no es tooling
interno, así que se corrige en el acto (bajo riesgo, mecánico): bump a **`next@15.5.21`** (última
del mismo major 15.5.x, sin saltar a la 16 para no arriesgar breaking changes sin revisar).
Verificado tras el bump: `pnpm install` sin conflictos, `next build` compila y genera las 10 páginas
sin error, `node --test` 47/47 OK. Los errores de `tsc --noEmit` en los ficheros `*.test.ts` (imports
con extensión `.ts` explícita, patrón de `node --test` de este repo) son preexistentes y no los
introduce este cambio.

## 🟡 Deps de bajo riesgo, sin acción en este PR (documentadas para Alberto)
- **`jimp`/`file-type`** (vía `apps/ialimp/app/api/admin/ia/comparar-foto/route.ts`, comparación de
  foto de limpiadora): vuln de DoS (bucle infinito con input malformado) en una ruta que sí procesa
  binario subido por usuarios con sesión de limpiadora. Riesgo moderado, no RCE. Recomendado: migrar
  de `jimp` (sin mantenimiento activo) a `sharp` (ya fijado a `&gt;=0.35.0` en `pnpm.overrides` de la
  raíz y usado en el resto del monorepo) — cambio de librería, no un bump mecánico, se deja para un
  PR propio.
- **`xlsx`** en ialimp: no explotable (solo escribe, nunca parsea un xlsx subido) — sin acción, ya
  documentado como excepción aceptada.
- **`pdfjs-dist`** en `apps/ialimp/package.json`: dependencia **muerta** (0 imports reales; ialimp usa
  la versión correcta y no vulnerable vía `apps/rrhh`) — candidato a retirar del `package.json` y de
  `serverExternalPackages`, sin urgencia de seguridad.
- Resto de advisories (`esbuild`/`vite`/`launch-editor` vía vitest, `brace-expansion`/`js-yaml` vía
  eslint, `nanoid` vía postcss): solo dev-time/build-time, no viajan a producción.
- **Packages sin consumidor** (`module-agenda`, `module-encargo`, `module-revenue`): reconfirmado
  el estado ya triado — infraestructura a la espera de vertical, no código muerto por descuido.

---

# Actualización 2026-08-16 — auditoría diaria (ligera)

Rango: 49 commits desde la pasada del 14/08 (`716c8d6..24e8ced`) — casi todo autodocumentado PR a
PR (registro accesos ialimp #1433, ayudas conciliación #1432, suelo PL reconstruido #1427/#1430,
trading: reintento aplicado #1428/#1429, pasada duplicada #1431, claridad+apagado #1424, runtime
errors #1426, 2 merges de conflicto de registro #1425/#1434). SALTA typecheck/tests pesados
(pasada profunda).

## 🟢 Heartbeat de crons/agentes
`agente_latidos` (11 filas) — todo `ok=true`, todas dentro de cadencia (más vieja: `paper-tracker`
semanal, 136h de ~192h). Tablas de dominio (12 huellas): 11/12 ✅, **`psd2-sync` ⛔ por umbral**
(140h sin fila nueva en `movimientos_bancarios`, umbral 54h) — **investigado, no es un cron mudo**:
Vercel runtime logs confirman `GET /api/cron/psd2-sync 200` a las 06:00 UTC; simplemente no ha
habido movimientos bancarios nuevos desde el 10/08 (mismo patrón documentado desde 02/07). Supera
el umbral de 48h del guardián dedicado (`psd2-health-check`, miércoles) — se deja anotado para su
próxima pasada.

## 🟢 Backlog de PRs de rutinas + salud del automerge
`rutinas-automerge.yml`: última ejecución hace <5min, en verde (948 runs históricos, cadencia
horaria). Un único PR abierto (#1435, copiloto de órdenes trading), draft, <12h — sin acción.

## 🔴→✅ (carril 1) `apps/mariscos` invisible en 3 docs raíz desde su alta (11/08, PR #1055, 5 días)
El vertical **Mariscos González** (trazabilidad pesquera) tiene `CLAUDE.md` propio y viene en la
memoria (`CONTEXTO-SESIONES.md`), pero **no aparecía en ninguno de los 3 mapas raíz** que listan
verticales: `CLAUDE.md` (sección "Verticales"), `MATRIZ.md` (árbol + tabla) ni
`docs/FUENTES-DE-VERDAD.md`. Corregido en los tres (este commit).

## 🟡→✅ (carril 2) `apps/mariscos` sin typecheck en CI desde su alta — 5 días sin red de seguridad de tipos
La matriz `typecheck` de `.github/workflows/tests.yml` (bloqueante, 8 apps) no incluía `mariscos` —
lleva `typescript.ignoreBuildErrors` como el resto de verticales, así que un tipo roto se habría
colado sin que nada lo cazara. Verificado antes de tocar la matriz: `pnpm exec tsc --noEmit` en
`apps/mariscos` da **0 errores** y los 8 tests de `@central/module-pesca` pasan. Añadida `mariscos`
a la matriz (PR de esta auditoría, revisión de código — no carril 1).

## 🟡 (recomendación, sin aplicar) Falta skill `mariscos-maestro`
Es el único vertical con `CLAUDE.md` propio sin su router `*-maestro` en `.claude/skills/` (todas
las demás verticales de negocio lo tienen: ia-rest/sivra/ialimp/plataforma/transporte/alquiler). No
creada en esta pasada — crear una skill nueva es más que un fix de texto acotado (guardarraíl B).
Propuesta para Alberto: crearla siguiendo el patrón de `alquiler-maestro`/`transporte-maestro`.

## ✅ Reconciliación memoria — 0 huecos de commit, bloque «Estado vivo» actualizado
Todos los commits del rango ya estaban autodocumentados en `CONTEXTO-SESIONES.md` (patrón PR+docs
funcionando). El bloque «Estado vivo» (sin refrescar desde 14/08) tenía 3 pendientes nuevos del
15/08 sin reflejar: respuesta de Asecon sobre ayudas de conciliación (plazo 15/09, #1432), revisión
de Alberto del nivel Genius/descuento móvil en la extranet de Booking (#1432), y el PASO 0 del
trigger de trading que no distingue una recuperación con fecha backdateada (#1431). Añadidos.
Sin drift en `docs/SKILLS.md` (comandos/skills reales = los listados) ni en `lib/correo/rutas.ts`
(sin categorías nuevas de correo en el rango). Reglas fiscales dictadas consistentes (`perfil-fiscal`
sigue con «amortizable = nunca sin orden expresa»).

## ✅ Integridad estructural — sin hallazgos nuevos
Lockfile presente y al día. `ignoreCommand` obligatorio verificado en las 10 apps (incluida
`mariscos`, que ya lo traía). `transpilePackages` de `mariscos` coincide con sus deps `@central/*`
declaradas.

## ✅ Manuales de usuario — nada que tocar
Ningún archivo de `apps/ia-rest/src/app/**` ni `apps/ia-rest/public/**` cambió en el rango (los
cambios visibles del rango son de `apps/ialimp` y `apps/plataforma`, ya autodocumentados en sus
propios PRs — `apps/ialimp/public/manual.html` se actualizó en el propio PR #1432).

## Checklist de acciones manuales de Alberto (esta pasada)
- Ninguna urgente. Opcional: revisar nivel Genius/descuento móvil en la extranet de Booking
  (fuga de canal en la reserva Luxury 22-25/10, ver memoria 15/08).
- Cuando tengas un rato: decidir si quieres la skill `mariscos-maestro` (recomendación arriba).

---
# Actualización 2026-08-14 — auditoría diaria (ligera)

Rango: 18 commits desde la pasada del 13/08 (`d76db8c..716c8d6`) — 6 regeneraciones automáticas de
radiografía (`[skip ci]`), 3 bitácoras de agentes (mercado-booking #1401, facturas-correo #1402,
memoria #1407), y 7 PRs de código: housesevillana fix botón Reservar (#1399), sivra cancelaciones
Smoobu (#1397), trading re-verificado veredicto de inversión (#1404) y tesis huérfanas confirmadas
(#1403), pricing democión de jornada de liga (#1405), subastas Surus como 6ª fuente (#1406) y su fix
de ingesta IMAP (#1408), sivra guarda «evento a ciegas» (#1409). SALTA typecheck/tests pesados
(pasada profunda).

## 🟡 Heartbeat de crons/agentes
`agente_latidos` (11 filas) — todo `ok=true`, todas dentro de cadencia (la más vieja, `paper-tracker`
semanal, a 88h de un umbral ~192h). Tablas de dominio (12 huellas): 11/12 ✅, **1 `psd2-sync` ⛔ MUDO**
(92h sin fila nueva en `movimientos_bancarios`, umbral 54h). Investigado por Vercel runtime logs antes
de escalar: `GET /api/cron/psd2-sync 200` confirmado a las ~06:00 UTC los días 11, 12 y 13/08 — el
cron corre bien, es idempotente y simplemente no ha habido movimientos bancarios nuevos desde el
10/08 (mismo patrón que `updates/sync`/`auto-sessions`, documentado desde 02/07). No es un cron mudo;
sin acción. Dado que supera el umbral de 48h del guardián dedicado (`psd2-health-check`), se deja
anotado para que esa skill lo confirme en su próxima pasada semanal.

## 🟢 Backlog de PRs de rutinas + salud del automerge
0 PRs abiertos de ramas `claude/*` — backlog vacío, sin conflictos ni drafts envejeciendo.

## ✅ Reconciliación memoria — 1 hueco + poda de Estado vivo
Único hueco de commit: **PR #1405** (pricing: democión por nombre de jornada de liga a la curva
plana, evita que un partido de liga regular entre a factor x2.2). Añadido a `docs/CONTEXTO-SESIONES.md`.
De paso, el bloque «Estado vivo» (sin refrescar desde 12/08) tenía 2 pendientes ya resueltos: PR #1370
(contraste diferido) llevaba mergeado desde el 12/08 y seguía como «en draft, pendiente de revisión»;
el «repaso programado 12/08 HOY» de subastas ya había pasado. Podados y sustituidos por los pendientes
reales vigentes (retorno_medio en cero de `trading_estrategia_stats`; correo real de Surus aún sin
contrastar). Sin skills/comandos nuevos en el rango (`docs/SKILLS.md` sin drift) ni cambios en
`lib/correo/rutas.ts` (sin drift en la tabla de rutas del triaje). Integridad estructural: lockfile
presente, `ignoreCommand` obligatorio verificado en las 8 apps.

## ✅ Manuales de usuario — nada que tocar
Ningún archivo de `apps/*/src/app/**`, `apps/*/app/**` ni `apps/*/public/**` cambió en el rango (los
cambios del día son de lógica interna: pricing, subastas, trading).

---

# Actualización 2026-08-13 — auditoría diaria (ligera)

Rango: 5 commits desde la pasada del 11/08 (`e362168..b3ca200`) — 2× regeneración automática de
radiografía (`[skip ci]`), CI gitleaks (reintento de descarga, #1396), RLS de las 2 últimas tablas
de trading (#1395, ya autodocumentado en memoria por su propio commit) y el fix de lockfile de
`housesevillana` (#1398). SALTA typecheck/tests pesados (pasada profunda).

## 🟢 Heartbeat de crons/agentes
`agente_latidos` (10 filas) — todo `ok=true`, todas dentro de cadencia (la más vieja, `paper-tracker`
semanal, a 64h de un umbral ~192h). Sin mudos.

## 🟢 Backlog de PRs de rutinas + salud del automerge
`rutinas-automerge.yml`: última ejecución hace <4h, en verde, cadencia horaria confirmada (708 runs
históricos). Dos PRs abiertos de código (#1399, #1397), ambos draft, ambos <24h — normal, sin acción.

## ✅ Reconciliación memoria — 1 hueco
Único hueco del rango: PR #1398 (`housesevillana`: `pnpm-lock.yaml` desactualizado desde el import
#1390, build no arrancaba). Añadido a `docs/CONTEXTO-SESIONES.md`. Nada más que reconciliar — sin
skills/docs nuevos en el rango, sin drift en `docs/SKILLS.md` ni en la tabla de rutas del triaje.

## ✅ Manuales de usuario — nada que tocar
Ningún archivo de `apps/ia-rest/src/app/**` ni `apps/ia-rest/public/**` cambió en el rango.

---

# Actualización 2026-08-12 — auditoría diaria (ligera)

Rango: desde la profunda del 09/08 hasta ahora — 32+ commits, casi todos autodocumentados PR a PR
(la PR #1365 del 11/08, aún abierta, ya había hecho la primera pasada del tramo 09→11/08). SALTA
typecheck/tests pesados (son de la pasada profunda).

## 🟢 Heartbeat de crons/agentes
`agente_latidos` (10 filas) — todo `ok=true`, todas dentro de su cadencia (la más vieja a 45,1h de
un umbral semanal ~192h). Tablas de dominio (12 huellas) — todas ✅, la más vieja a 45,1h de un
umbral de 36-192h según cadencia. Sin mudos.

## 🟢 Backlog de PRs de rutinas + salud del automerge
`rutinas-automerge.yml`: última ejecución hace <1h, en verde — vigilante vivo (554 runs históricos,
cadencia horaria respetada). Dos PRs de carril 2 abiertos, ninguno atascado: **#1365** (informe
11/08, 1 día) y **#1370** (trading: contraste diferido, 1 día) — ambos por debajo del umbral de
7 días sin actividad. Sin PRs de registro atascados >24h ni en conflicto.

## 🟡 Reconciliación de memoria/skills (carril 1 → PR #1379, registro)
- El bloque «Estado vivo» de `CONTEXTO-SESIONES.md` listaba pendientes ya resueltos entre el 09 y
  el 11/08 y nunca podados: Jaime Salas (278,30€, conciliado #1372/#1376), PriceLabs (explicado por
  FX, no descuadre), y no reflejaba los hallazgos nuevos de trading (auditoría del laboratorio
  11/08) ni de subastas (lente 🌊/Matalascañas, rediseño Oportunidades). Podado y actualizado.
- `docs/SKILLS.md`: el comando `/facturas-correo` (existe en `.claude/commands/`) no estaba
  listado junto a la skill homónima. Corregido en **este PR** (toca `docs/SKILLS.md`, que el
  guardarraíl del auto-merge excluye a propósito).
- Sin drift en `lib/correo/rutas.ts` (categorías del triaje) ni contradicciones en reglas fiscales
  dictadas (`perfil-fiscal` sigue consistente: amortizable = nunca sin orden expresa de Alberto).

## Sin acciones manuales pendientes de esta pasada.

---

# Actualización 2026-08-11 — auditoría diaria (ligera)

Rango: desde la profunda del 09/08 13:34 (PR #1329) hasta ahora — 32 commits, todos autodocumentados
PR a PR salvo uno. SALTA typecheck/tests pesados (son de la pasada profunda).

## 🟢 Heartbeat de crons/agentes
`agente_latidos` (10 filas) — todo `ok=true`, todas dentro de su cadencia (máx. 23h de un umbral
diario ~30h). Tablas de dominio (12 huellas, incl. `pricing_decisiones`/`market_rates booking_mcp`
como huella del AGENTE de pricing) — todas ✅, la más vieja a 21h de un umbral de 36-192h según
cadencia. Sin muflos.

## 🟢 Backlog de PRs de rutinas + salud del automerge
`rutinas-automerge.yml`: última ejecución hace ~2h, en verde — vigilante vivo. Sin PRs de registro
atascados >24h ni en conflicto. Dos PRs abiertos ajenos a las rutinas y en conflicto desde hace
semanas (**#1055** «mariscos», 21/07; **#755** «banca CSV», 05/07) — no son de registro ni draft de
carril 2, quedan fuera del alcance de esta auditoría; FYI para que Alberto decida rebasar o cerrar.
`#1363` (trading, draft) tiene solo ~5h de vida — no está atascado.

## 🟡 Reconciliación de memoria/skills (carril 1)
- **PR #1361** (pricing: `pricing_applied.demanda_fuente`/`demanda_gateada`, mergeado 10/08) no
  tenía entrada de memoria — añadida en `docs/CONTEXTO-SESIONES.md` (PR #1364, registro) y en
  `pricing-agente/references/estado-y-protocolo.md` (este PR, va aparte por tocar `.claude/**`).
- El bloque «Estado vivo» de `CONTEXTO-SESIONES.md` seguía listando dos pendientes ya resueltos el
  09/08 y nunca podados: **#1323** «a rehacer» (se rehizo y mergeó ese mismo día — ver su entrada del
  09/08) y el SQL `channel_markup_sin_recargo` «por aplicar» (ya aplicado, confirmado en la entrada
  del 09/08). Podados en el mismo PR #1364.
- `docs/SKILLS.md` sin drift (todas las skills/comandos reales están listados). Sin cambios visibles
  en `apps/ia-rest` en el rango → manuales de usuario final sin acción.

## Sin acciones manuales pendientes de esta pasada.

---

# Actualización 2026-08-09 — auditoría PROFUNDA (semanal)

Pasada completa `auditoria-central` (checklist entero: integridad, typecheck de las 8 apps, tests,
seguridad/multi-tenant, deps, infra real por MCP) + heartbeat de crons/agentes + backlog de PRs de
rutinas. Rango: desde la auditoría ligera de hoy 02:05 UTC (PR #1328, sin commits nuevos en `main`
desde entonces) — foco en la cobertura profunda que la ligera se salta.

## 🟢 Integridad estructural
`pnpm install --frozen-lockfile` en sync. `auditar-estructura.mjs --check` al día. Grep `@iarest/`
en código real: 0 (única mención es el propio guardián `test/regression-scope.test.ts`, esperado).
Los 8 `apps/*/vercel.json` llevan el `ignoreCommand` obligatorio.

## 🟢 Typecheck de las 8 apps
`prisma generate` + `tsc --noEmit` en las 8 (ialimp, sivra, plataforma, rrhh, transporte, alquiler,
almacen, ia-rest): **0 errores**.

## 🟢 Tests
`pnpm test` exit 0 — guardián raíz (26, incluye `regression-secrets`/`regression-scope`) + todos los
`packages/*` y apps en verde (module-subastas 443, plataforma 1054, module-trading 112, rrhh 47,
ialimp 22…). Cero fallos en todo el log.

## 🟢 Seguridad + multi-tenant
Sin secretos de auth con fallback a literal (los `|| ''` que aparecen son de API keys externas —
Cloudinary, Google OAuth, Tuya, `CRON_SECRET` en headers salientes — no de firma/validación de
sesión). Pasada ligera sobre queries sin `where` de tenant: los únicos candidatos (`property.findMany()`
de sivra, módulo trading) son de apps de tenant único (los propios pisos/cartera de Alberto), no de
las SaaS multi-cliente — sin fugas cross-tenant evidentes en ialimp/rrhh/transporte/alquiler/almacen/
plataforma. Supabase advisors (compartida `wswbehlcuxqxyinousql`): **0 ERROR** en seguridad y
rendimiento (solo WARN ya conocidos, mayoría `security_definer` de siempre).

## 🟡 Deps (sin acción — documentado, no explotable)
`pnpm audit`: 21 vulns (1 low/6 moderate/14 high), ninguna explotable en el uso real del repo:
- `xlsx` (ialimp) — prototype pollution/ReDoS: solo **exporta** (nunca parsea entrada externa),
  patrón ya documentado en `docs/AUDITORIA-2026-06-29.md`.
- `pdfjs-dist` (ialimp) — riesgo es "JS arbitrario al abrir PDF malicioso" con `enableScripting=true`
  y contexto navegador; aquí es transitiva de `pdf-parse`, extracción de texto server-side en Node,
  sin DOM. Riesgo teórico bajo, no verificado a fondo — si se quiere cerrar del todo, subir a
  `pdfjs-dist>=6.2.108`.
- `vite`/`brace-expansion`/`js-yaml`/`nanoid` — todas en devDependencies (vitest/eslint/postcss) o
  build-time, no en runtime servido.

Packages sin consumidor en ningún `apps/*/package.json`: `@central/module-agenda`,
`@central/module-encargo`, `@central/module-revenue` — se autodescriben como infraestructura
transversal a la espera de que una vertical los enchufe, no código muerto por descuido
(`module-agenda` ni tiene `test/` todavía). Sin acción.

## 🟢 Heartbeat de crons/agentes (Supabase MCP)
Los 12 agentes de `agente_latidos` + los vigilados sin fila propia (`ialimp_pms`, computado sobre
`pms_connections.last_sync_at`, 0,0h) + las 12 huellas de dominio de la consulta b): **todo ✅**.
`sivra_mercado_sweep` sigue en rojo estructural conocido y aceptado (lotería del snippet de Google,
diagnosticado en PR #1299 — no es señal nueva). `trading_watchdog` sin fila todavía (cron `30 6 * *
2-6`, hoy domingo, estreno esperado el martes — no avería).

## 🟢 Backlog de PRs de rutinas + salud del automerge
`rutinas-automerge.yml` con runs recientes en verde (última corrida ~2 min antes de esta pasada, en
`main`). Sin PRs de solo-registro atascados >24h (#1328 es de hoy, `mergeable_state: unstable` por
CI en curso, normal para un PR de 4 min). PRs de código no-auditoría abiertos: #1323 (pricing,
autoverificado 449 tests/tsc 0/build OK, <24h, pendiente del ojo de Alberto), #1304 (fix audit 08/08,
<24h). Dos PRs de feature antiguos y NO relacionados con esta rutina llevan mucho abiertos y merecen
una decisión de Alberto (mergear o cerrar): **#1055** (mariscos, 19 días) y **#755** (import CSV
banca, 35 días) — fuera del alcance de esta auditoría, solo se anota.

## ✅ Reconciliación de docs (carril 2 — afecta comportamiento de sesiones futuras)
- `apps/plataforma/CLAUDE.md`: sección Subastas sin los PRs #1324/#1325/#1327 (08/08) — añadidos.
- `docs/RUTINAS-PROGRAMADAS.md`: entrada de trading-watchdog/agentes-latido desactualizada en 3
  puntos — el watchdog tiene 3 tramos (no 2) desde el PR #1291, tiene latido propio desde el PR
  #1322, y la huella de "pricing" cambió de `market_rates prop_%` a `pricing_decisiones.ciclo_at`
  en el PR #1318. Añadidos los vigilados que faltaban en la lista.

## Nota metodológica: `list_migrations` no es fuente fiable de "aplicado o no" en este repo
3 migraciones locales de esta semana (`2026-08-08_subastas_mejor_puja.sql`,
`2026-08-08_puja_minima_centinela.sql`, `2026-08-07_corpus_clonado_solo_del_barrido.sql`) no
aparecen en `mcp__Supabase__list_migrations`. Verificado a mano que **sí están aplicadas** (columnas
`subastas.mejor_puja(_at)`, `subastas_seguidas.sobrepuja_avisada_at` existen; el backfill de
`corpus_clonado` da 0 filas mal marcadas) — se aplicaron por `execute_sql` directo, no por el flujo
que registra el historial de migraciones. No es drift real; es un límite del propio check a tener en
cuenta en próximas auditorías (verificar el EFECTO, no solo el registro).

## Checklist de Alberto
1. Revisar y mergear (o pedir cambios) en este PR — solo texto (2 docs), carril 2 por afectar
   comportamiento de sesiones futuras.
2. Sin acción técnica urgente — todo verde salvo los WARN de deps ya documentados como no explotables.
3. Opcional: decidir sobre #1055 (mariscos, 19 días) y #755 (CSV banca, 35 días) — no relacionados
   con esta auditoría.

# Actualización 2026-08-08 — auditoría diaria (ligera)

Rango: desde la última auditoría (5a473f1, 07/08 06:40 UTC) hasta hoy (58c2e4c, 08/08 09:12 UTC) —
día de trabajo intenso: fix del agente contable (#1295, #1300), cursor incremental de subastas-mercado
(#1296), watchdog de trading (#1291), latido del barrido de sivra (#1288), y el workflow de
auto-merge de rutinas (#1289, #1297) que resuelve el atasco de PRs documentado ayer.

## ✅ Sin atasco de PRs de rutina — el auto-merge de #1289/#1297 ya funciona
A diferencia del 04-07/08, hoy **no hay PRs de rutina muertos en conflicto**: el PR #1298 (registro,
conflicto de inserción pura) se resolvió y mergeó solo. Confirmado por `git log`: `019c403 Merge PR
#1298 (registro) resolviendo el conflicto conservando ambas entradas`.

## 🔴→✅ `docs/RUTINAS-PROGRAMADAS.md`: descripción del watchdog de trading desactualizada
La sección 12 ("Monitorización — watchdog trading + latidos de agentes") describía `trading-watchdog`
comprobando solo 2 huellas (`broker_saldos` NAV + `trading_tesis`). El PR #1291 (mergeado hoy) le
añadió un 3er tramo — latido explícito `agente_latidos.trading_puntuar` — tras un caso real (06/08):
NAV y tesis quedaron frescos pero `/puntuar` nunca se llamó, y el watchdog de 2 tramos lo habría dado
por bueno (stops y walk-forward sin actualizar, en silencio). Corregido para reflejar los 3 tramos.
Este fichero está en la lista de exclusión del auto-merge de registro (describe comportamiento de
agentes), así que va en este PR de revisión, no al de solo-registro.

## ✅ Heartbeat de crons — 12/14 ✅, 2 falsos positivos ya conocidos (verificados de nuevo)
`updates/sync` (Smoobu) ⛔ por umbral (113,6h sin fila en `incomes`) — verificado por
`agente_latidos.smoobu_sync`: `ok:true`, última pasada hace 5,4h, "0 nuevas, 0 modificadas, 0
canceladas (6 vistas)" — corre bien, simplemente no hay reservas nuevas. `limpiadoras/auto-sessions`
⛔ por umbral (82,4h) — verificado: 5 inserciones en los últimos 12 días (patrón idempotente ya
documentado desde el 02/07, huecos de días son la norma). Ninguno requiere acción.

## ✅ Integridad estructural — sin hallazgos
Sin cambios de `package.json`/`pnpm-lock.yaml` en el rango.

## ✅ Skills-maestro / `docs/SKILLS.md` — sin drift
Las 31 skills de `.claude/skills/` y los 3 comandos de `.claude/commands/` están reflejados. Reglas
fiscales (`amortizable = NUNCA sin orden de Alberto`) consistentes entre `perfil-fiscal` y memoria.

## ✅ Manuales de usuario — sin cambios que reconciliar
Ningún commit del rango toca `apps/ia-rest/**` (único árbol con manual de usuario final); las features
de hoy (agente contable, subastas) viven en `apps/plataforma`, sin manual de usuario equivalente.

## ✅ Correo triaje — sin drift
`lib/correo/rutas.ts` ya tiene categoría `contabilidad` para el agente contable; subastas usa su
lector IMAP dedicado por diseño (fuera del triaje genérico, ya documentado). Sin cambios necesarios.

## Nota sobre el carril de entrega de esta pasada
Sesión bajo harness de tareas de GitHub, sin push directo a `main` (esperado). Carril 1 (memoria +
`docs/AUTO-APLICADOS.md`) va en PR aparte de solo-registro (`claude/auditoria-registro-2026-08-08`),
que el workflow de auto-merge mergeará solo en cuanto la CI esté verde. El fix de
`docs/RUTINAS-PROGRAMADAS.md` va en este PR porque el fichero está excluido del auto-merge a propósito.

---

# Actualización 2026-08-07 — auditoría diaria (ligera)

Rango: 50 commits desde la última reconciliación real en `main` (023fb05, 04/08 22:45 UTC) hasta
hoy (02fa696, 06/08 12:59 UTC) — 3 días de trabajo intenso (subastas, trading, mercado-booking
fase 1, facturas, CRM ia-rest) sin que ninguna pasada de auditoría llegara a mergearse.

## 🔴 Hallazgo principal: 4 PRs de rutinas (solo memoria/docs) llevan 1-3 días sin mergear y ya están en conflicto
Esta sesión, igual que las de 04/08–06/08, corre bajo el harness de tareas de GitHub sin permiso de
push directo a `main` — así que el carril 1 (texto acotado → directo a `main`) lleva **varios días
sin poder ejercerse de verdad**, y cada pasada termina en un PR draft que Alberto no ha mergeado
todavía. Resultado: **4 PRs abiertos, todos `mergeable_state: dirty`** (ya no aplican limpio sobre
`main`, que ha seguido avanzando):
- **#1252** (auditoría 05/08) — trae el fix real de `scripts/rotar-memoria.mjs` (ver abajo) + la
  entrada de memoria de PR #1139. **Su contenido de valor ya está incorporado en esta rama** (fix
  portado + tests + entrada de memoria reescrita contra el `main` actual) — recomendado CERRAR sin
  mergear una vez esta rama entre.
- **#1277** (auditoría 06/08) — mismo hallazgo de PR #1139, redundante con #1252 y con esta pasada.
  Recomendado CERRAR.
- **#1254** (facturas-correo 05/08) y **#1279** (facturas-correo 06/08) — auto-informes de la
  rutina `facturas-correo` (re-archivado en Drive, conciliación bancaria, hallazgos de gastos
  fantasma ya avisados por Telegram en su momento). El trabajo real (Gmail/Drive/Supabase) **ya se
  hizo e hizo efecto** — solo faltan sus líneas de bitácora en el repo. Esta auditoría NO reproduce
  ese trabajo (fuera de alcance de `/auditoria-diaria`); recomendado que Alberto las revise y
  mergee tal cual (son solo texto) o las cierre si ya no interesa el rastro.
**Acción de fondo sugerida:** si las sesiones de rutina van a seguir sin push directo a `main`, el
carril 1 de `/auditoria-diaria` es papel mojado en la práctica — vale la pena que Alberto decida
entre (a) revisar/mergear estos PRs con más frecuencia, o (b) conceder push directo a `main` a las
rutinas de solo-texto (memoria/bitácora), que es justo el riesgo bajo que el carril 1 asume.

## 🔴→✅ `scripts/rotar-memoria.mjs`: dos bugs de fecha, uno ya conocido (PR #1252) y uno nuevo
El bug de PR #1252 (entradas `### ` heredaban la fecha de la `- **` anterior; fechas envueltas a la
línea 2 se perdían) seguía sin arreglar en `main` porque ese PR nunca mergeó. Portado aquí
(`esInicioEntrada`/`textoFechaDe`/`trocear`/`clasificar` puros + `scripts/rotar-memoria.test.mjs`,
16 tests) y verificado contra el corpus real.

Al hacer el `--dry-run` post-fix apareció un **segundo bug**, no cubierto por el fix anterior: una
entrada cuyo TÍTULO cita una fecha anterior antes de su fecha real —
`- **🐕 3er tramo del watchdog... desde el 30/07 (06/08/2026).**` — se archivaba en JULIO porque
`textoFechaDe` cogía la PRIMERA fecha de la negrita (`30/07`) en vez de la última (`06/08/2026`, la
real). Fix: `clasificar` ahora usa la ÚLTIMA coincidencia de fecha dentro del texto de cabecera, no
la primera (la convención de Alberto pone la fecha real justo antes del cierre `**`/fin de línea).
Nuevo test de regresión con el caso real. **17/17 tests OK.** Verificado con `--dry-run` antes/después:
sin el segundo fix se habrían archivado mal 3 entradas (1 de ellas de agosto); con él, exactamente
2 entradas de julio legítimas. Rotación real ejecutada, segunda pasada `--dry-run` da 0 (idempotente).

## ✅ Reconciliación de memoria — 2 huecos (PR #1139 ialimp, PR #771 Teya landing)
`docs/CONTEXTO-SESIONES.md`: añadidas las 2 entradas que faltaban — PR #1139 (ialimp: formato
español del precio de plan, mergeado por el orquestador Fase 2 sin sesión que lo anotara, ya
detectado por el PR #1252 nunca mergeado) y PR #771 (landing privada de partnership Teya en
ia-rest, `noindex`, sin lógica ni tests — no requiere entrada en manuales). Resto del rango de 50
commits ya estaba bien reflejado en memoria (subastas, trading, mercado-booking, facturas, CRM —
verificado por un agente de investigación dedicado).

## ✅ Skills-maestro — 1 contradicción corregida
`.claude/skills/trading-analista/references/infra-forward-radar.md`: describía el watchdog de
trading vigilando SOLO el NAV de IBKR. El código (PR #1284, 06/08) le añadió un 3er tramo
(`trading_tesis` + latido `trading_puntuar`) tras un caso real donde NAV+tesis quedaron pero
`/puntuar` nunca se llamó y el watchdog lo habría dado por bueno. Doc corregido con el resumen de
los 3 tramos.

## ✅ `docs/FUENTES-DE-VERDAD.md` — 2 filas añadidas
Fila de `plataforma-maestro` sin `packages/module-subastas/**` (3 PRs en 3 días sobre ese paquete
sin fila asociada, mismo hallazgo del PR #1252 nunca mergeado) — añadida. Skill `mercado-booking`
(creada 06/08) sin fila propia — añadida.

## ✅ Sello de frescura refrescado — 1 doc
`.claude/skills/plataforma-maestro/references/ui-inicio-dashboard.md` (`verificado: 2026-07-29`)
describía `/banca`+`BancaClient.tsx` justo antes de que el PR #1267 (05/08) le añadiera el chip de
negocio en móvil — añadida la línea + sello refrescado a `2026-08-07`.

## ✅ Heartbeat de crons — 14/14 ✅ (2 falsos positivos ya documentados, verificados de nuevo)
`updates/sync` (Smoobu) MUDO por umbral (81,2h sin fila en `incomes`) — verificado por
`agente_latidos.smoobu_sync`: `ok:true`, última pasada buena hace 21,1h, "0 nuevas, 0 modificadas"
— el sync corre a diario, sencillamente no hay reservas nuevas (temporada). `limpiadoras/auto-sessions`
MUDO por umbral (50,1h) — verificado: 5 inserciones en los últimos 9 días, patrón normal ya
documentado desde el 02/07 (cron idempotente, huecos de días son la norma). Ninguno requiere acción.

## ✅ Integridad estructural — sin hallazgos
Sin cambios de `package.json`/`pnpm-lock.yaml` en el rango (nada que reconciliar). `transpilePackages`
de las 8 apps coherente con lo que cada una importa. Radiografía de estructura ya fresca (regenerada
por el propio CI en el último commit del rango).

## ✅ Manuales de usuario — sin gap
CRM cold-email de ia-rest (#1270) es un cron 100% automático sin toggle ni acción de usuario — no
necesita entrada en `help-prompts.ts`. Landing Teya (#771) es una página de marketing privada sin
rol de usuario asociado. Sin cambios en `apps/ia-rest/src/components/help/**` ni `public/manual*.html`.

## ✅ Correo triaje — sin drift
Ningún dominio de este rango (subastas, trading, pricing) produce correo por el triaje genérico;
subastas usa su propio lector IMAP dedicado por diseño. `rutas.ts` sin cambios necesarios.

## Nota sobre el carril de entrega de esta pasada
Misma restricción que 04-06/08: sesión bajo harness de GitHub, sin push directo a `main`. Todo lo
de esta pasada (incluido lo que sería carril 1 por criterio: las 2 entradas de memoria, el drift de
skills, las filas de `FUENTES-DE-VERDAD.md`, el sello refrescado) va en este PR en vez de directo a
`main`.

## Checklist de acciones manuales de Alberto
1. **Revisar y mergear este PR** — incluye el fix real de `scripts/rotar-memoria.mjs` (bug de
   fechas que llevaba 2 días activo en `main`), texto de memoria/skills, y el hallazgo de arriba.
2. **Cerrar #1252 y #1277** una vez esta rama mergee (contenido incorporado; evita conflictos
   residuales).
3. **Revisar y mergear (o cerrar) #1254 y #1279** — auto-informes de `facturas-correo`, solo texto,
   el trabajo real ya se hizo.
4. **Decidir sobre el carril 1**: con push directo a `main` bloqueado 4 días seguidos, valorar dar
   permiso de push directo a las rutinas de solo-texto o revisar los PR drafts con más frecuencia.
5. Nada urgente en los 2 falsos positivos del heartbeat — patrón ya conocido.

## ✅ Resolución del atasco (07/08/2026, misma jornada)
Puntos 1-3 ejecutados: **#1285 mergeado** (fix + 17 tests ya en `main`); **#1252 y #1277 cerrados**
tras verificar archivo a archivo que su contenido de valor está en `main`, con sus informes de
auditoría del 05/08 y 06/08 **rescatados al final de este mismo documento** para no dejar huecos en
el histórico; **#1254, #1279 y #1286** (este último abierto después de esta pasada, mismo atasco)
cerrados con su bitácora rescatada en `docs/AGENTES-BITACORA.md`. **El punto 4 sigue abierto — es
decisión de Alberto**, y es la causa raíz: mientras las rutinas no puedan empujar texto a `main`,
cada pasada seguirá generando un PR que envejece hasta el conflicto.

---

# Actualización 2026-08-01 — auditoría diaria (ligera)

Rango: 12 commits sustanciales desde la última auditoría (31/07/2026 02:07 UTC, pasada ligera)
hasta hoy — cierre del PR de latido de facturas (#1194), un fix de pricing (bucket de mes
contaminado por evento, #1196), dos fixes de trading (techo de plausibilidad XBRL #1195, EBIT
derivado ADR #1193 ya reconciliados ayer), subastas (cadena de ubicación, #1191) y la pasada
mensual de RRHH compliance calendar. Checks estructurales baratos (SALTA typecheck/tests
pesados, son de la pasada profunda semanal).

## ✅ Reconciliación memoria/skills — un solo hueco, ya corregido
Las sesiones del rango se auto-documentaron con mucho detalle (prácticamente todos los commits
tocan `docs/CONTEXTO-SESIONES.md` en el mismo commit del fix). Único hallazgo: la entrada del
latido de facturas seguía diciendo **"PR #1194 pendiente de merge"** cuando ya se mergeó hoy a
las 07:40 UTC — corregido (carril 1). `docs/SKILLS.md` sigue listando las 31 skills + 3 comandos
reales de `.claude/skills`/`.claude/commands`, sin huérfanos ni faltantes. No se ha creado
ninguna skill nueva en el rango, así que la tabla de rutas del triaje de correo
(`lib/correo/rutas.ts`) no tiene drift que revisar.

## 🗓️ Rotación mensual — julio archivado
Julio es mes cerrado: `node scripts/rotar-memoria.mjs` archivó 321 entradas a
`docs/memoria/2026-07.md`. Una entrada (`### 💓 El latido de facturas...`) usaba formato
heading (`### `) en vez del `- **` que el script reconoce y no se archivó sola — se movió a
mano al mismo archivo. Anotado en la memoria viva para que quien lo vuelva a ver sepa que es
un gap conocido del script, no un bug nuevo.

## ✅ Heartbeat de crons (14 huellas) — 12/14 ✅, 2 falsos positivos (mismo patrón de siempre)
`limpiadoras/auto-sessions` (168,6h) y `updates/sync` (165,8h) salieron ⛔ MUDO por umbral.
Confirmados por Vercel runtime logs: ambos devolvieron 200 hoy a las 05:00 UTC — son crons
idempotentes que solo escriben fila cuando hay reservas/sesiones nuevas, y llevan sin actividad
real desde el 25/07. Es el mismo patrón documentado repetidamente desde el 02/07 (ver
`docs/AUTO-APLICADOS.md`); no se toca el umbral porque la regla del heartbeat solo permite
ajustarlo en crons semanales/mensuales, y estos son diarios por diseño.

## ✅ Manuales de usuario — nada que tocar
Ningún archivo de `apps/ia-rest/src/app/**` cambió en el rango (los cambios de UI del rango son
`apps/ialimp/app/dashboard/*` — fix de un chip de estado ya roto, no una feature nueva — y
`apps/plataforma/app/(usuario)/subastas/*`, que no tiene sistema de manuales). Sin gap.

## ✅ Integridad estructural — sin hallazgos
Lockfile presente, 38 paquetes en `packages/*`, y las 8 apps (`ia-rest`, `sivra`, `ialimp`,
`plataforma`, `rrhh`, `transporte`, `alquiler`, `almacen`) tienen el `ignoreCommand` obligatorio
en su `vercel.json`.

## ✅ Sin hallazgos de carril 2
Sin código roto, sin infra que tocar, sin crons genuinamente mudos. No se abre PR ni se manda
Telegram (frugalidad, regla del paso 6.4) — solo la reconciliación de texto de carril 1, ya
commiteada a `main` en esta misma pasada.

*Actualización por Claude Code (auditoría diaria automática) · 2026-08-01*

# Actualización 2026-08-02 — auditoría diaria (ligera)

Rango: 10 commits sustanciales desde la última auditoría (01/08/2026 09:40 UTC, pasada ligera) —
RRHH categoría documental (#1212), subastas «cargas no publicadas» (#1213), auditoría de precio
dinámico sivra (#1209, bucket de mes + comisión Booking duplicada), subasta vencida en el radar
(#1210), ia-rest quita el precio de la web + agente SEO (#1208), trading (#1206), health-check
(#1205), pricing eventos previstos (#1203) y palanca de urgencia + House cambió de categoría en
2024 (#1202). Checks estructurales baratos (SALTA typecheck/tests pesados, son de la pasada
profunda semanal).

## ✅ Reconciliación memoria/skills — 2 huecos, corregidos (carril 1)
Las sesiones del rango siguen auto-documentándose muy bien (todos los PRs tocan
`docs/CONTEXTO-SESIONES.md` en el mismo commit del fix). Dos huecos encontrados:
1. La entrada del latido de facturas seguía diciendo **«PR #1194 pendiente de merge»**. El PR ya
   se mergeó el 01/08 07:40 UTC — la corrección de la auditoría de ayer se hizo pero el merge de
   la propia PR (mismo minuto, rama vieja) la volvió a pisar. Corregido con el estado real:
   mergeado, primera pasada del cron con el fix hoy 02/08 06:15 UTC (`agente_latidos` sin fila
   `facturas_gmail` a las 02:00 UTC es lo esperado, no un fallo — el cron es diario y solo ha
   corrido una vez desde el merge, con el código viejo).
2. `apps/plataforma/CLAUDE.md` (sección Subastas) no mencionaba los fixes #1210 (subasta vencida
   en el radar) ni #1213 (`estadoCargas`/`titularCargas`, 5 estados) — el resto de la sección
   documenta cada PR de subastas y estos dos se quedaron fuera. Añadidos.

`docs/SKILLS.md` verificado contra `.claude/skills/` (31) y `.claude/commands/` (3): sin huérfanos
ni faltantes. Ninguna skill nueva en el rango → sin drift en la tabla de rutas del triaje de
correo (`lib/correo/rutas.ts`). `docs/FUENTES-DE-VERDAD.md` sin filas nuevas que añadir (ninguna
vertical/skill nueva en el rango).

## ✅ Manuales de usuario — nada que tocar
RRHH #1212 ya actualizó `apps/rrhh/public/manual.html` en el mismo PR. ia-rest #1208 (quitar precio
de la web) toca el sitio de marketing público, no el POS (`/edge`, `/kds`, `/owner`) — no aplica a
`help-prompts.ts`/`manual.html`, que documentan la operativa del restaurante, no la landing.

## ✅ Heartbeat de crons (14 huellas) — 14/14 ✅
Sin crons mudos. `psd2-sync` 20,0h · `rates/snapshot` 19,0h · `mercado/cron in-app` 18,8h ·
`pricing/pilot-track` 16,8h · `pricing/apply-auto` 7,3h · `updates/sync` 7,3h ·
`limpiadoras/auto-sessions` 7,2h · `trading-universo` 1,7h · `concursos-ingesta` 1,5h ·
`correo-triaje` 0,0h · `AGENTE pricing` 90,6h · `trading forward-paper` 136,1h ·
`trading-ranking` 137,0h · `ia-director-refresh` 141,0h. Todos dentro de umbral.

## ✅ Integridad estructural — sin hallazgos
Lockfile presente, 8 apps (`ia-rest`, `sivra`, `ialimp`, `plataforma`, `rrhh`, `transporte`,
`alquiler`, `almacen`) con `ignoreCommand` obligatorio en su `vercel.json`.

## ✅ Sin hallazgos de carril 2
Sin código roto, sin infra que tocar, sin crons genuinamente mudos. No se abre PR ni se manda
Telegram (frugalidad, regla del paso 6.4) — solo la reconciliación de texto de carril 1, ya
commiteada a `main` en esta misma pasada.

*Actualización por Claude Code (auditoría diaria automática) · 2026-08-02*

# Actualización 2026-08-02 — auditoría PROFUNDA (semanal, `--profunda`)

`auditoria-central` entera: integridad estructural, typecheck de las 8 apps, tests, seguridad
multi-tenant + Supabase advisors, deps, infra real por MCP, coherencia de docs.

## ✅ Integridad estructural
`pnpm install --frozen-lockfile` en sync. `node scripts/auditar-estructura.mjs --check` al día.
`pnpm test:guardia` 26/26 (incluye el guardián de scope viejo `@iarest/` y el de secretos con
fallback literal). `transpilePackages` vs deps `@central/*` verificado app por app (8/8): sin
faltantes ni sobrantes.

## ✅ Typecheck — 8/8 apps limpias
`prisma generate` + `tsc --noEmit` secuencial (mismo orden, mismo `@prisma/client` compartido) en
ialimp, sivra, plataforma, rrhh, transporte, alquiler, almacen — **0 errores**. `tsc --noEmit` en
ia-rest (sin Prisma) — **0 errores**.

## ✅ Tests — 0 fallos
`pnpm test` (guardián + tests de packages + vitest de rrhh/core-firma/module-rrhh/module-documental/
module-chat/module-transporte/core-identity) — todo verde, sin regresiones tras los bumps de deps.

## 🔴→✅ Seguridad de dependencias — 46 vulns (3 críticas) arregladas a 12 (0 críticas)
`pnpm audit --prod` salió con **46 vulnerabilidades: 3 críticas, 17 high, 26 moderadas** — subida
fuerte desde las 16 (0 críticas) de la auditoría de julio. Las 3 críticas y buena parte de las high
eran next-auth/Next.js:

- **next-auth 5.0.0-beta.31 (sivra) → 2 CRÍTICAS Auth.js**: "Configuration errors can cause
  existence-based auth checks to fail open" y "Email normalizer validates before Unicode
  normalization" (bypass homógrafo `@`). Sivra usa Credentials (sin OAuth), pero la primera es
  agnóstica al provider. Parche disponible en beta.32 (sin cambios de API). **Aplicado**: bump a
  `^5.0.0-beta.32`.
- **next desactualizado en las 8 apps**: ia-rest en 16.2.7 (patch <16.2.11, disclosure de Server
  Function endpoints + SSRF en rewrites/Server Actions + middleware bypass, varias HIGH); el resto
  en 15.5.19 (patch <15.5.21, mismo DoS/disclosure). **Aplicado**: bump de parche a `^16.2.12`
  (ia-rest) y `^15.5.22` (ialimp/sivra/plataforma/rrhh/transporte/alquiler/almacen).
- **axios vía `msedge-tts`/`node-ical`**: el override existente en `package.json` raíz
  (`>=1.16.0`, de una auditoría anterior) se había quedado corto — las nuevas advisories exigen
  `>=1.18.0`. **Aplicado**: bump del override; `pnpm -r why axios` confirma una sola versión
  resuelta (1.19.0) en todo el workspace.

Verificado tras cada bump: `pnpm install`, typecheck de las 8 apps (0 errores), `pnpm test` +
`pnpm test:guardia` (0 fallos), `pnpm audit` re-ejecutado. Resultado: **46 → 22 → 12 vulns**, cero
críticas restantes. Todos los bumps son de parche (sin cambios de API). **Cerrado (02/08, sesión
«repara»)**: los builds reales de Vercel de las 8 apps salieron en verde sobre el commit del PR
(checks «Vercel – *» todos en success) → **PR #1215 mergeado a `main`** (squash `783b2fb`).

### Vulns restantes — 2ª pasada («haz tu todo», 02/08): 12 → 3 (0 críticas)
La sesión de cierre revisó una a una las 12 documentadas; casi todas tenían arreglo seguro:

| Paquete | Resolución |
|---|---|
| `nodemailer` (sivra directo) | ✅ Bump 8→9.0.3. **El call site real es un stub** (`app/api/mensajes/auto-reply/route.ts:13` — el transporter está comentado, `sendEmail` solo hace `console.log`), así que no había nada que romper. El peer warning de `@auth/core` es cosmético: su peer de nodemailer es **opcional** y sivra solo usa el provider `Credentials`. |
| `nodemailer` (transitivo vía `imapflow`/`mailparser`) | ✅ `imapflow` ^1.6.5 en sivra+plataforma (1.6.x **eliminó la dep de nodemailer**) y `mailparser` refrescado a 3.9.14 (usa nodemailer 9.0.3). |
| `fast-xml-parser` (plataforma) | ✅ Bump 4→5.10.1. El changelog de v5 declara «no change in the functionality, syntax, APIs, options» (solo empaquetado ESM/CJS); el código ya usa la sintaxis v4 (`removeNSPrefix` etc.). Verificado con smoke test de runtime + los 769 tests de plataforma (BORME/BOE/CODICE con fixtures reales). |
| `sharp` (plataforma directo + vía `next` en almacen) | ✅ Bump 0.35.3 + override raíz `sharp >=0.35.0`. Smoke test de runtime del binario nativo (composición JPEG q82, la operación exacta del lector registral) OK; el build de Vercel del PR es la validación final del binario. |
| `linkify-it` (vía `mailparser`) | ✅ Cayó sola con el refresco de `mailparser` a 3.9.14. |
| `postcss` (vía `next`, almacen) | ✅ Override raíz `postcss >=8.5.18` (mismo major 8, API congelada; next pinnaba 8.4.31). |
| `uuid` (vía `node-ical`, ialimp) | ✅ Override raíz `uuid >=11.1.1` (resuelve 14.0.1). Verificado en el propio contexto de `node-ical` que `require('uuid').v4` sigue funcionando en CJS. |
| `xlsx` | 🟡 QUEDA (high ×2, **sin parche en npm**). No explotable: ialimp solo ESCRIBE xlsx, nunca parsea entrada de terceros. |
| `file-type` (vía `jimp`, ialimp) | 🟡 QUEDA (moderate). El parche exige ≥21.3.1, que es **ESM-only** — el override rompería el `require` CJS de jimp en runtime. Bucle infinito en parser ASF; jimp solo procesa imágenes propias. |

**Resultado final: 3 vulns (2 high `xlsx` sin parche + 1 moderate `file-type`), 0 críticas** — el
suelo alcanzable sin cambiar de librería (`xlsx`→`exceljs` y `jimp`→`sharp` serían migraciones, no bumps).

## ✅ Seguridad multi-tenant + Supabase advisors
Sin hallazgos nuevos de cruce entre tenants. Supabase advisors (`get_advisors`, ambos proyectos):
- **BD compartida `wswbehlcuxqxyinousql`**: 465 lints — 292 INFO (`rls_enabled_no_policy`, ya
  conocido), 154 WARN (`security_definer_function_executable` anon+authenticated, patrón esperado
  de las funciones RPC), 16 `rls_policy_always_true`, 2 `extension_in_public`, 1
  `function_search_path_mutable`. Sin ERROR.
- **ia-rest standalone `efncqyvhniaxsirhdxaa`**: 343 lints — **47 ERROR `security_definer_view`**,
  ya documentado como preexistente desde `AUDITORIA-2026-07.md` (M24); sin cambio desde entonces.
  113 WARN `function_search_path_mutable`, 126 WARN de funciones SECURITY DEFINER
  anon+authenticated, 23 `rls_policy_always_true`, resto ruido conocido del patrón anon-key.

Ninguno de los dos requiere acción nueva en esta pasada — son hallazgos ya llevados a auditorías
anteriores sin plan de arreglo (harding de las 47 vistas queda pendiente, gran radio).

## ✅ Heartbeat de crons — 14/14 ✅
Sin crons mudos (detalle en la pasada ligera del mismo día).

## 🟡→✅ Infra Vercel — resuelto: las 4 apps SÍ existen; el gap era del conector MCP
`list_projects` (team `pisos-turisticos-projects`) devuelve solo **6** proyectos (`plataforma`,
`ia-rest`, `ialimp`, `sivra`, `house-sevillana-landing`, `ialimp-landing`), pero los checks del
propio PR #1215 confirmaron que **`central-rrhh`, `transporte`, `alquiler` y `almacen` viven en el
MISMO team** y desplegaron su preview en verde (project IDs visibles en el comentario del bot de
Vercel). `list_deployments` sobre esos 4 proyectos devuelve `403 Forbidden` → **el conector Vercel
MCP tiene acceso concedido por-proyecto, no al team entero**. No hay gap de despliegue. Acción
manual opcional de Alberto: ampliar el acceso del conector a esos 4 proyectos para que las próximas
auditorías los cubran por MCP (mientras tanto, los checks de Vercel en los PRs sirven de evidencia).

## ✅ Coherencia de docs — 1 drift corregido (carril 1)
`.claude/skills/auditoria-central/SKILL.md` describía una arquitectura vieja: contaba 4 apps y 16
packages (hoy son 8 y 38), decía que las apps con Prisma para typecheck eran "6, no solo 3" cuando
ya son 7 (falta almacen), y afirmaba que ia-rest vive en el schema `iarest` de la BD compartida —
confirmado por MCP que su proyecto standalone `efncqyvhniaxsirhdxaa` no tiene ese schema; sigue
siendo `public`, la migración está diseñada pero pendiente (correctamente documentado en
`ia-rest-maestro`, sección "Split-brain de BD"). Corregido en el propio archivo (carril 1).

## Checklist de acciones manuales de Alberto (esta pasada)
1. ~~Vercel: confirmar team de `rrhh`/`transporte`/`alquiler`/`almacen`~~ → **resuelto**: mismo
   team; opcional ampliar el acceso por-proyecto del conector MCP a esos 4.
2. ~~Revisar y mergear el PR draft de bumps~~ → **hecho**: PR #1215 mergeado (`783b2fb`) tras
   verificar los 8 builds de Vercel en verde. Rollback: revertir el PR, no hay migración de datos
   de por medio.
3. **Opcional, sin urgencia**: valorar nodemailer 8→9 (sivra) y fast-xml-parser 4→5 (plataforma)
   con una prueba manual — quedan fuera de esta pasada por ser saltos de major sin poder probarlos
   en vivo.

*Actualización por Claude Code (auditoría profunda semanal automática) · 2026-08-02*

# Actualización 2026-08-04 — auditoría diaria (ligera)

Rango: 12 commits sustanciales desde la última pasada con reconciliación de memoria
(4eabffc, 02/08 16:45 UTC) hasta hoy (03/08, hasta la Bienal de Flamenco #1239). Checks
estructurales baratos + heartbeat de crons; SALTA typecheck/tests pesados (pasada profunda
siguiente: domingo 09/08). Esta vez el hallazgo grande no es de frescura sino de **integridad**
del propio archivo de memoria.

## 🔴 `docs/CONTEXTO-SESIONES.md` tenía 5.074 líneas de julio YA ARCHIVADAS duplicadas encima
El commit `ada35bb` (memoria del PR #1235, "facturas Booking julio verificadas") se ramificó
antes de la rotación mensual del 01/08 (`886d413`, que movió 321 entradas de julio a
`docs/memoria/2026-07.md`) y al aterrizar en `main` **pegó su entrada nueva Y TODO el contenido
de julio que su rama todavía traía sin rotar** debajo de la nota de rotación — el archivo pasó de
435 a 5.509 líneas. Verificado byte a byte: las 5.074 líneas añadidas son un subconjunto exacto
(mismo texto, mismo orden) de `docs/memoria/2026-07.md` — julio quedó duplicado en DOS sitios,
violando la regla "el archivo vivo solo guarda el mes corriente" y quintuplicando el contexto que
carga cada sesión nueva al leer la memoria. **Fix en esta rama:** `docs/CONTEXTO-SESIONES.md`
recortado de vuelta a sus 435 líneas legítimas (todo agosto, incluida la entrada de Booking del
PR #1235, que SÍ es nueva y se conserva). `docs/memoria/2026-07.md` no se toca — ya tenía la copia
buena. **Nada se pierde**: julio sigue íntegro en el archivo mensual.
**Lección para sesiones futuras:** una rama que edita `docs/CONTEXTO-SESIONES.md` "arriba del
todo" debe partir de `main` actualizado — si se abre antes de una rotación mensual y tarda en
mergear, reintroduce en vivo lo que la rotación ya archivó. Vale la pena que el propio
`scripts/rotar-memoria.mjs` o un hook de PR detecten un archivo que vuelve a crecer muy por encima
de su tamaño esperado tras la rotación (Fase 2, no implementado aquí).

## 🟡→✅ Heartbeat de crons — 13/14 ✅, 1 verificado falso positivo
`psd2-sync` salió ⛔ (68,1h desde el último movimiento nuevo, sobre el umbral de 54h). Investigado
antes de escalarlo: el dispatcher SÍ invocó `/api/cron/psd2-sync` a las 06:00 los 3 días (200 en
logs Vercel de Vercel MCP, 02/08 y 03/08) y `conexiones_banco.ultimo_sync` está fresco (03/08
06:00:40 UTC) — la sincronización con Enable Banking se completó sin error, sencillamente no hay
movimientos bancarios nuevos desde el 01/08 (Sáb-Dom-Lun sin cargos, plausible en temporada de
agosto). Mismo patrón que la falsa alarma ya documentada el 02/08, esta vez alcanzando el nuevo
umbral de 54h. No se toca el umbral de nuevo con una sola muestra — si se repite mañana (04/08)
sin movimiento, sí ameritaría revisar el propio umbral o cambiar de huella. Resto: 13/13 ✅.

## ✅ Coherencia de docs — 1 landmine documentado (carril de esta rama, texto acotado)
`apps/plataforma/CLAUDE.md` no mencionaba el fix del PR #1236 (03/08): el redeploy del panel
🔑 Secretos podía salir CANCELED en Vercel (por `withLatestCommit` apuntando a un commit
`[skip ci]` de esta misma rutina) mientras el panel decía "✅ redeploy lanzado" — el secreto
guardado (p. ej. `GITHUB_TOKEN`) nunca llegaba a runtime. Añadido landmine en la sección "Panel de
OPERADOR" (mismo estilo que los landmines vecinos).

## Nota sobre el carril de entrega de esta pasada
Esta sesión corre bajo el harness de tareas de GitHub (rama asignada `claude/bold-edison-lfq8yj`,
sin permiso de push directo a `main` fuera de PR). Por eso **todo** lo de esta pasada — incluido
lo que la skill `auditoria-diaria` clasificaría como carril 1 (el landmine de texto en
`apps/plataforma/CLAUDE.md`) — va en el mismo PR draft que el fix de memoria (carril 2), en vez de
empujarse directo a `main`. Es una restricción del entorno de ejecución, no un cambio de criterio
sobre qué es "texto acotado" vs "estructural": el hallazgo de memoria seguiría siendo carril 2 aun
con push directo disponible, por su tamaño.

## Checklist de acciones manuales de Alberto (esta pasada)
1. **Revisar y mergear el PR draft** con el recorte de `docs/CONTEXTO-SESIONES.md` (5.074 líneas
   duplicadas de julio) + el landmine del redeploy de secretos. Sin riesgo de pérdida de datos:
   julio sigue completo en `docs/memoria/2026-07.md`; verificado byte a byte antes de recortar.
2. **Nada urgente en `psd2-sync`** — vigilar si el 04/08 06:00 sigue sin movimientos nuevos; de
   confirmarse una racha más larga, revisar entonces (no antes).

# Actualización 2026-08-05 — auditoría diaria (ligera)

> **Nota (07/08/2026):** informe rescatado del PR #1252, que nunca llegó a mergearse y se cerró en
> conflicto. Los cambios que describe SÍ están en `main`, pero llegaron el 07/08 por el PR #1285
> (auditoría del 07/08), no el 05/08 — de ahí que no haya fila en `docs/AUTO-APLICADOS.md`: nada de
> esto se auto-aplicó por carril 1, todo entró por PR.

Rango: 4 commits sustanciales desde la última auditoría (7b7afb4, 04/08/2026 22:10 UTC) —
tres fixes de subastas ya reconciliados en memoria en el propio commit (#1249/#1250/#1251,
cargas/fechas en letra) y un fix mecánico de ialimp (#1139, formato de dinero) mergeado por
el orquestador Fase 2 sin sesión que lo anotara. Checks estructurales baratos (lockfile sin
cambios de deps, radiografía ya fresca por el propio CI). Heartbeat de 14 huellas: **14/14 ✅**,
sin crons mudos.

## 🔴→✅ `scripts/rotar-memoria.mjs` archivaba entradas del mes ACTUAL bajo el mes equivocado
Al intentar la rotación mensual de julio el `--dry-run` habría archivado en `docs/memoria/2026-07.md`
**11 entradas reales de 03–04/08/2026**. **Revertido antes de escribir nada.** Dos causas distintas,
ambas en `scripts/rotar-memoria.mjs`:
1. Una "entrada" solo empezaba con `- **`; 11 de las del vivo usan `### Título (fecha)`. El parser
   las trataba como continuación de la última `- **` de arriba y **heredaban SU fecha**.
2. La fecha se buscaba solo en `entrada[0]` (línea 1). Cuando el título en negrita es largo y la
   fecha envuelve a la línea 2, el regex no la encontraba y heredaba de arriba igual — no dependía
   de usar `###`, le podía pasar a cualquier entrada `- **` con título largo.

Fix propuesto en este informe y **finalmente aplicado en el PR #1285** (07/08) junto con un tercer
bug de fechas descubierto entonces y `scripts/rotar-memoria.test.mjs` (17 tests).

## ✅ Reconciliación memoria — un hueco
PR #1139 (ialimp: precio de plan sin formato español) se mergeó vía el orquestador Fase 2 sin que
ninguna sesión Claude lo anotara en `docs/CONTEXTO-SESIONES.md` — entrada añadida (finalmente por
#1285). De paso, un bloque duplicado palabra por palabra («Verificación en caliente del arreglo de
los ADR», 31/07) que ya vivía en `docs/memoria/2026-07.md` seguía también en el vivo — borrado.
`docs/FUENTES-DE-VERDAD.md`: `packages/module-subastas` no tenía fila pese a 3 PRs en 24h — añadida.

## ✅ Heartbeat de crons (14 huellas) — 14/14 ✅
Sin hallazgos, sin crons mudos.

## ✅ Manuales de usuario — nada que tocar
Los cambios del rango son correcciones internas (lectura de cargas/fechas en subastas, formato de
un precio en ialimp), no features nuevas visibles.

---

# Actualización 2026-08-06 — auditoría diaria (ligera)

> **Nota (07/08/2026):** informe rescatado del PR #1277, cerrado en conflicto sin mergear. Su único
> hallazgo (la entrada de memoria de PR #1139) era el mismo que el de #1252 y ya está en `main` vía #1285.

Rango: 25 commits sustanciales desde la última pasada con reconciliación de memoria (merge
`7b7afb4`, PR #1240, 04/08 22:10 UTC) — día muy productivo del 05/08 (26 PRs: cadena de subastas
«tipo de bien se re-deriva»/«otro no pisa el dato», barrera de earnings + cantera + Yahoo
fundamentales en trading, agente de venta de ia-rest ahora 100% email frío, chip de negocio móvil
en `/banca`, fix de formato de dinero en ialimp).

## ✅ Reconciliación memoria/skills — 1 hueco
De los 25 commits del rango, 24 ya estaban auto-documentados en `docs/CONTEXTO-SESIONES.md`. Único
hueco: **PR #1139** (`ialimp: formato español del dinero en la página de planes`). `docs/SKILLS.md`
verificado contra `.claude/skills/` (31) y `.claude/commands/` (3): sin huérfanos ni faltantes.
Ninguna skill nueva en el rango → sin drift en la tabla de rutas del triaje (`lib/correo/rutas.ts`).

## ✅ Manuales de usuario — nada que tocar
Ningún archivo de `apps/ia-rest/src/app/**` ni `apps/ia-rest/public/**` cambió en el rango.

## ✅ Heartbeat de crons (14 huellas) — 13/14 ✅, 1 falso positivo verificado
`updates/sync` salió ⛔ MUDO (57,2h sin filas nuevas en `incomes`, umbral 36h). Investigado antes de
escalarlo: los runtime logs de Vercel confirman `GET /api/sivra/updates/sync 200` a las 05:00:29 UTC
del 05/08 — el cron corrió bien, es idempotente (solo inserta cuando Smoobu trae reservas nuevas) y
lleva sin actividad real desde el 03/08. Mismo patrón documentado desde el 02/07; no se toca el umbral.

## ✅ Integridad estructural — sin hallazgos
Lockfile presente, y las 8 apps (`ia-rest`, `sivra`, `ialimp`, `plataforma`, `rrhh`, `transporte`,
`alquiler`, `almacen`) tienen el `ignoreCommand` obligatorio en su `vercel.json`.

---

# Actualización 2026-08-20 — auditoría diaria (ligera)

Rango: 45 commits desde la pasada del 19/08 05:15 UTC (`daf811ab`), casi todos del cierre de la saga
de `auditoria.yml`/`rutinas-automerge.yml` (ver `CONTEXTO-SESIONES.md` 19-20/08) + sesión IBKR (libro
de operaciones) + fixes de `housesevillana` (i18n, 403 SEO, guardas de test).

## ✅ Reconciliación memoria/skills — sin huecos
Los 45 commits del rango ya estaban auto-documentados por sus propias sesiones en
`docs/CONTEXTO-SESIONES.md` (el guardián `persist-memoria.sh` hizo su trabajo). `docs/SKILLS.md`
verificado contra `.claude/skills/` (32) y `.claude/commands/` (3): sin huérfanos ni faltantes.
`perfil-fiscal` sin contradicción con la regla `amortizable` de memoria. `lib/correo/rutas.ts`: sin
skill nueva del rango que produzca correo sin categoría (la correduría de Grupo Asegura, PR #1489,
ya tiene `categoria: 'correduria'`).

## 🟡→✅ Backlog de agentes vigilados — `paper_tracker` sin monitor (arreglado en este PR)
El cron semanal `/api/cron/paper-tracker` (`0 10 * * 1`, alta 18/08/2026 PR #1476) ya escribía su
latido en `agente_latidos` pero no estaba en `AGENTES_VIGILADOS`/`PROBES` — si dejara de correr,
nadie se enteraría (mismo patrón que el resto de agentes antes de ser dados de alta). Añadido
`paper_tracker` (192h, criterio semanal) en `apps/plataforma/lib/monitoring/latidos.ts` +
`apps/plataforma/app/api/cron/agentes-latido/route.ts`. Verificado: `node --test latidos.test.ts`
9/9, `eslint` limpio. `sivra_canal` (mismo PR #1484, cron 07:45 UTC) SÍ está en el vigilante — aún
no ha tenido su primera oportunidad de correr desde que se desplegó (11:17 CEST del 19/08, después
del disparo de ese día); no es un hallazgo, solo pendiente de que corra mañana.

## ✅ Heartbeat de agentes/crons (`agente_latidos` + tablas de dominio) — 22/22 ✅
Sin crons mudos. `agente_latidos`: 12 filas, todas dentro de su umbral (peor caso `paper-tracker`
64h de 192h, cadencia semanal correcta). Tablas de dominio (query b): 12/12 ✅, la más ajustada
`correo_cursor` a 0h.

## ✅ Backlog de PRs de rutinas + salud del automerge — sin hallazgos
3 PRs abiertos, los 3 draft de carril 2 con código real (#1489 correduría, #1500 sivra landing,
#1505 trading), ninguno >7 días sin actividad ni con ficheros solo-registro atascados.
`rutinas-automerge.yml`: última ejecución 01:55 UTC (17 min antes de esta pasada), `success`,
corriendo cada hora sin huecos — confirma que la saga de arreglos del 19/08 (PRs #1501→#1511) quedó
resuelta de verdad, no solo "probada una vez".

## ✅ Integridad estructural — sin hallazgos
`pnpm install --frozen-lockfile` OK. Radiografía regenerada hoy mismo (PR #1511, vía automerge).

## ✅ Manuales de usuario — nada que tocar
Ningún archivo de `apps/ia-rest/src/app/**` ni `apps/ia-rest/public/**` cambió en el rango (el
rango tocó housesevillana, sivra/plataforma-lib y trading — sin UI de ia-rest).

---

# Actualización 2026-08-21 — auditoría diaria (ligera)

Rango: 36 commits desde la pasada del 20/08 05:14 UTC (`a3f4d3e..a953b05`) — cierre de la saga del
Portal del BOE (login/2FA/captcha, #1537→#1562), agente de huéspedes SIVRA (guía real + autonomía,
#1542/#1546), cimientos de la correduría/Grupo Asegura (#1489/#1567) y el libro de operaciones de
IBKR (#1505).

## ✅ Reconciliación memoria/skills — sin huecos
Los 36 commits ya estaban auto-documentados por sus propias sesiones en `CONTEXTO-SESIONES.md`.
`docs/SKILLS.md` verificado contra `.claude/skills/` y `.claude/commands/`: sin huérfanos ni
faltantes. `docs/FUENTES-DE-VERDAD.md` cubre ya los dominios más tocados del rango (trading,
subastas, asegura). Sin skill nueva del rango que produzca correo sin categoría en
`lib/correo/rutas.ts`.

## 🟡→✅ Backlog de PRs de rutinas — #1514 desatascado (arreglado en este PR)
El PR #1514 (carril 2 de la pasada del 20/08: dar de alta `paper_tracker` en `AGENTES_VIGILADOS`)
llevaba abierto ~24h con `mergeable_state: dirty`. Causa: el PR #1505 (libro de operaciones del
bróker, mergeado horas después) añadió una entrada HERMANA al mismo array/objeto en
`apps/plataforma/lib/monitoring/latidos.ts` y `apps/plataforma/app/api/cron/agentes-latido/route.ts`
— conflicto de **inserción pura** (ambos lados añaden, ninguno edita lo del otro). Resuelto
fusionando `main` en la rama del PR y conservando las dos entradas; `node --test latidos.test.ts`
9/9 (incluye el test de regresión `AGENTES_VIGILADOS`↔`PROBES`); empujado a la rama existente del
PR — no hizo falta un PR nuevo. Resto del backlog (#1517, #1555, #1568, #1570): 4 PRs draft, todos
`mergeable_state: clean`, ninguno >7 días sin actividad. `rutinas-automerge.yml`: última ejecución
02:05 UTC (17 min antes de esta pasada), `success`, cadencia horaria sin huecos.

## ✅ Heartbeat de crons y agentes (13+12 huellas) — sin ⛔
- **a) Latidos `agente_latidos` (13):** todos `ok=true` salvo `sivra_canal` (`ok=false`, sin
  `ultimo_ok_at`) — pero su último intento (07:45 UTC 20/08) es ANTERIOR al fix de `date - bigint`
  (PRs #1530/#1529, mergeados esa misma mañana a las 10:31/11:45); su próxima pasada natural
  (07:45 UTC 21/08) aún no ha corrido a la hora de esta auditoría (02:01 UTC). No es un hallazgo,
  es pendiente de confirmar mañana.
- **b) Tablas de dominio (12):** todas ✅, la más antigua `ia-director-refresh` a 93,0h (umbral 192h).
- `agente_reparaciones`: sin intentos de auto-reparación en los últimos 7 días (nada que coordinar).

## ✅ Integridad estructural — sin hallazgos
`pnpm install --frozen-lockfile` OK. `pnpm auditar:check`: radiografía al día (regenerada en el
último commit del rango, #1569).

## ✅ Manuales de usuario — nada que tocar
Ningún archivo de `apps/ia-rest/src/app/**` ni `apps/ia-rest/public/**` cambió en el rango.
