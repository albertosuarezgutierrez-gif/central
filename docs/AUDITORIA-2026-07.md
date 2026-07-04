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

---

## Auditoría LIGERA — 04/07/2026

**Rango:** commits desde `4aace5c` (03/07 17:17, última auditoría) hasta `e4fd0d0` (03/07 23:27) — 15
commits, todos ya en `main`.

### 🔴 Cron `correo-triaje` MUDO desde su creación (heartbeat, paso 2-bis)
- **Síntoma:** `correo_triaje` tiene **0 filas** desde que el agente se creó (PR #718, 03/07 14:53). El
  cron corre cada 10 min (`*/10 * * * *`) y nunca ha completado una pasada con éxito.
- **Causa 1 (resuelta sola):** de 13:00 a 19:30 del 03/07, `relation "correo_cursor" does not exist` —
  la migración `prisma/sql/2026-07-03_correo_triaje.sql` no estaba aplicada aún. **Ya está aplicada**:
  verificado por Supabase MCP que `correo_triaje`/`correo_cursor`/`correo_reglas` existen las 3.
- **Causa 2 (ACTUAL, sin resolver):** desde las 19:40 del 03/07 hasta la última pasada (04/07 02:00,
  la más reciente antes de esta auditoría), **cada ejecución falla con `Error: Faltan GMAIL_USER /
  GMAIL_APP_PASSWORD`** (`lib/correo/imap.ts::nuevoCliente`). Confirmado en el deployment de
  **producción actual** (`dpl_DLkUeQzat71yb146DUngzxPvmuVZ`, commit `e4fd0d0`, desplegado 21:27 UTC —
  el error sigue ocurriendo DESPUÉS de este deploy, no es un residuo de uno anterior).
- **Lo raro:** `GMAIL_USER`/`GMAIL_APP_PASSWORD` son envs **antiguos** (ya documentados en
  `apps/plataforma/CLAUDE.md`, usados por `lib/agente-facturas/gmail.ts` con el MISMO patrón de lectura
  `process.env.GMAIL_USER`/`GMAIL_APP_PASSWORD`) — no son nuevos de este PR. No he podido confirmar si
  siguen funcionando para `facturas-scan` en este mismo deployment: ese cron es diario (`15 6 * * *`) y
  su última ejecución registrada (03/07 06:15) es **anterior** a cuando empezó a fallar `correo-triaje`
  (19:40), así que no sirve de control — podría ser que el problema afecte a AMBOS crons y todavía no se
  haya visto en `facturas-scan` porque no ha vuelto a correr.
- **Acción manual de Alberto (no ejecutable por MCP — cambio de env es fuera del repo):**
  1. Vercel → proyecto `plataforma` → Settings → Environment Variables → confirmar que
     `GMAIL_USER`/`GMAIL_APP_PASSWORD` están marcados para el entorno **Production** (no solo
     Preview/Development).
  2. Si están bien, **forzar un redeploy** de producción (Vercel a veces no repropaga un env
     editado a los deployments ya construidos hasta el siguiente deploy).
  3. Vigilar la siguiente pasada del cron (`GET /api/cron/correo-triaje` cada 10 min) — si el error
     persiste con los envs confirmados, revisar si `GMAIL_APP_PASSWORD` (app password de Gmail) caducó
     o fue revocado.
  - **Rollback:** ninguno necesario — el cron no escribe nada erróneo, solo falla y reintenta a los 10
    min; no hay riesgo de datos, solo el Gmail de Alberto lleva sin triar desde el 03/07.
- **Resto del heartbeat (8 crons):** todos ✅ (`rates/snapshot` 19,1h · `mercado/cron` 18,8h ·
  `pricing/pilot-track` 16,8h · `psd2-sync` 10,5h · `updates/sync` 6,0h · `limpiadoras/auto-sessions`
  5,9h · `pricing/apply-auto` 5,5h · `concursos-ingesta` 1,5h — todos dentro de umbral).

### Memoria y skills reconciliados (carril 1, ya en `main`)
5 commits del 03/07 tarde/noche sin anotar en `docs/CONTEXTO-SESIONES.md`: rrhh `centro_trabajo` libre
+ reconocimiento médico (`073c5bc`), domótica Tuya (PR #714), eliminación Modelo 179 (PR #698), agente
de triaje de correo (PR #718) y fix ialimp mailing frío (PR #717). Además: fecha incorrecta del cierre
de Modelo 179 en `apps/plataforma/CLAUDE.md` (02/07→03/07) y mención residual a "Modelo 179" +
ausencia total de domótica Tuya / triaje de correo en `plataforma-maestro`. Detalle línea por línea en
`docs/AUTO-APLICADOS.md`.

### No revisado en esta pasada (ligera)
Typecheck de las 4 apps, tests pesados, seguridad multi-tenant e infra completa — quedan para la
pasada profunda semanal (`/auditoria-diaria --profunda`).

## Verificación
- Heartbeat de crons por Supabase MCP (solo lectura) + causa del cron mudo confirmada por Vercel MCP
  (`get_runtime_errors`, `list_deployments`). Existencia de tablas `correo_triaje`/`correo_cursor`/
  `correo_reglas` verificada por Supabase MCP.

*Actualización por Claude Code · auditoría ligera · 2026-07-04*
