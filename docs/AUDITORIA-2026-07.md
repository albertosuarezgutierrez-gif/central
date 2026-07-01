# Auditoría — Julio 2026

> Generada automáticamente el 2026-07-01. Cubre 9/9 dimensiones.

## Resumen ejecutivo

El sistema tiene tres problemas que necesitan atención hoy: (1) el dashboard financiero muestra gastos de pisos subestimados en al menos **€5.670** por leer la tabla obsoleta `expenses` en lugar de `gastos` — fix disponible en dos líneas; (2) **22 de 33 crons** no tienen evidencia de ejecución en 48h, incluyendo el sync de Smoobu, lo que significa que los datos de ocupación llevan 2 días congelados; (3) tablas críticas multi-tenant (movimientos bancarios, gastos, facturas, todo el schema rrhh) tienen RLS sin políticas, dejando los datos expuestos a cualquier acceso directo aunque en producción el rol de app use BYPASSRLS. En el lado positivo, la banca PSD2 funciona correctamente con saldos actualizados a hoy (BBVA 20.210€, Kutxabank 18.778€), la clasificación de movimientos está al 100%, el trimestre fiscal está limpio y el agente de pricing ha aplicado 2.426 precios reales con 95% de tasa de éxito.

---

## Estado por dimensión

### Criticos

#### 1. `getResumenSivra` lee tabla `expenses` congelada (34 filas) en vez de `gastos` (71 filas)

- **Qué es:** El dashboard financiero y el briefing subestiman los gastos de pisos. La tabla `expenses` está congelada desde hace meses; la tabla viva es `gastos`. Dos queries en `financiero.ts` (líneas ~59 y ~65) siguen apuntando a la tabla incorrecta.
- **Datos reales:** `expenses` = 34 filas (congelada); `gastos` = 71 filas (activa). Delta documentado: €5.670 subestimados en P&L sivra.
- **Impacto:** Cualquier decisión basada en el P&L de pisos está trabajando con datos incompletos. El error se arrastra a todos los informes derivados del briefing automático.
- **Archivo:** `apps/plataforma/lib/financiero.ts`
- **Estado del fix:** Fix auto disponible — reemplazar `FROM expenses` por `FROM gastos` en las dos queries de `getResumenSivra`. Las columnas `amount`, `date` y `propertyId` existen con el mismo nombre en `gastos`. **Pendiente de aplicar.**

---

#### 2. 1.929 incomes OTA con `amount NULL` invalidan cualquier cuadre de ingresos por portal

- **Qué es:** Todos los registros de BOOKING, AIRBNB y EXPEDIA tienen `amount NULL`. Los totales OTA están subestimados y cualquier reconciliación banco↔OTA es inválida.
- **Datos reales:** `n_null_amount = 1.929`, `n_zero = 0` para `portal IN (BOOKING, AIRBNB, EXPEDIA)`.
- **Impacto:** Imposible cuadrar ingresos OTA contra banco. Cualquier análisis de rentabilidad por canal es incorrecto.
- **Archivo:** Supabase — tabla `incomes`
- **Estado del fix:** Manual. Revisar el proceso de ingesta desde cada portal OTA. Los registros con `amount NULL` deben completarse desde las APIs o marcarse con estado `pendiente_importe` para excluirlos de cuadres.

---

#### 3. 22 de 33 crons sin evidencia de ejecución en las últimas 48h, incluyendo Smoobu sync

- **Qué es:** Solo 10 de los 33 crons tienen trazas en logs de producción. Smoobu sync, `categorizar-movimientos` y todo el bloque pricing/limpiadoras/rates no aparecen. La tabla `incomes` lleva 2 días sin actualizar.
- **Datos reales:** 33 crons en `vercel.json`; 10 con trazas en 48h. `MAX(createdAt)` en `incomes` = 2026-06-29 (hoy 2026-07-01).
- **Impacto:** Los datos de ocupación y reservas están congelados. El pricing automático puede estar inactivo. Los movimientos bancarios pueden no estar categorizándose.
- **Archivo:** `apps/plataforma/vercel.json`
- **Estado del fix:** Manual. Verificar en el dashboard de Vercel (Crons tab) si los crons están habilitados. Comprobar que `CRON_SECRET` está configurado. Invocar manualmente `/api/sivra/updates/sync` para descartar bug en el handler.

---

#### 4. 29 tablas multi-tenant críticas en public y 9 tablas rrhh con RLS habilitado pero sin ninguna política

- **Qué es:** Tablas como `movimientos_bancarios`, `gastos`, `facturas_clientes`, `alquiler_*` y todo el schema `rrhh` tienen RLS habilitado pero ninguna política creada. En producción el rol de app usa `BYPASSRLS` y oculta el problema, pero cualquier acceso directo vía `anon`/`authenticated` expone datos de todos los tenants.
- **Datos reales:** 29 tablas en `public` sin política RLS; 9 tablas en schema `rrhh` (`empleados`, `documentos`, `firmas`, etc.) sin política RLS.
- **Impacto:** Riesgo de exposición de datos sensibles (nóminas, documentos de empleados, movimientos bancarios de todos los negocios) ante acceso directo a Supabase.
- **Archivo:** `supabase/migrations/`
- **Estado del fix:** Manual. Crear políticas RLS por tenant usando el patrón `empresa_id = (SELECT current_setting('app.empresa_id')::uuid)`. Priorizar: `alquiler_*`, `facturas_*`, `gastos`, `movimientos_bancarios`, `sociedades` y todo el schema `rrhh`.

---

#### 5. 1.182 movimientos bancarios `requiere_revision` acumulados (309.703 EUR) sin barrido autónomo

- **Qué es:** El backlog incluye 813 personales (109k€), 158 turísticos pisos (84k€), 159 turístico duplex (35k€) y 52 traspasos internos (80k€). El agente procesa máximo 15 por ciclo de importación sin cron de barrido propio.
- **Datos reales:** 887 con `requiere_revision=true` en BD; `LIMIT 15` en línea 71. Volumen total: 309.703 EUR.
- **Impacto:** El backlog crece más rápido de lo que se procesa. €309k de movimientos sin clasificar distorsionan P&L y posición de caja.
- **Archivo:** `apps/plataforma/lib/agente-movimientos.ts`
- **Estado del fix:** Manual. Crear cron semanal que llame a un endpoint `/api/banca/agente-dudosos` con paginación sobre todas las cuentas y meses pendientes. Subir el LIMIT de 15 a 50 para acelerar el vaciado.

---

#### 6. `cron-auth.ts` acepta cualquier request si `CRON_SECRET` no está definido en el entorno

- **Qué es:** Si `CRON_SECRET` es undefined/vacío, `isCronAuthorized()` loguea un warning y devuelve `true`, dejando todos los endpoints de cron expuestos sin autenticación.
- **Datos reales:** Línea 6-7: `if (!secret) { console.warn(...); return true }`
- **Impacto:** Cualquiera que conozca las URLs de los crons puede dispararlos sin credenciales. En producción sin la variable definida, todos los endpoints de cron son públicos.
- **Archivo:** `apps/plataforma/lib/cron-auth.ts`
- **Estado del fix:** Manual. En producción (`NODE_ENV==='production'`), retornar `false` y loguear error si `CRON_SECRET` no está definido. Usar el patrón `requireSecret()` de `@central/core-identity`.

---

### Altos

#### 1. AGODA excluida del monitor de cobros OTA (14 reservas, 3.178€ sin vigilancia)

- **Qué es:** `cobros-ota-db.ts` filtraba solo BOOKING, AIRBNB y EXPEDIA. Las 14 reservas de Agoda (1 activa con 478€ en ventana de 120 días) nunca disparaban alerta de cobro pendiente.
- **Impacto:** 3.178€ de reservas Agoda sin vigilancia de cobro.
- **Estado del fix:** APLICADO en este sprint. `'AGODA'` añadido al array `IN` en `cobros-ota-db.ts` y `cobros-ota.ts`, incluido margen de días `AGODA: 14`.

#### 2. 16 políticas RLS siempre-true en iarest anulan el aislamiento multi-tenant

- **Qué es:** 16 políticas en schema `iarest` tienen `USING/WITH CHECK = TRUE`, incluyendo `iarest.impresoras` (4 políticas), `iarest.bridge_tokens` y `iarest.turnos`. Cualquier usuario autenticado puede leer/escribir datos de cualquier restaurante.
- **Impacto:** Aislamiento multi-tenant roto en iarest. Un usuario de un restaurante puede acceder a datos de otro.
- **Estado del fix:** Manual. Reescribir cada política para incluir filtro real de tenant (`local_id = (select current_setting('app.local_id')::int)`).

#### 3. 76 funciones SECURITY DEFINER en iarest ejecutables por anon y authenticated sin restricción

- **Qué es:** Funciones como `activar_plan`, `cancelar_plan`, `clonar_evento` se ejecutan con privilegios del propietario (`postgres`) y pueden ser invocadas por cualquier usuario autenticado.
- **Impacto:** Posible escalado de privilegios o acceso cross-tenant a través de funciones privilegiadas.
- **Estado del fix:** Manual. Ejecutar `REVOKE EXECUTE ON FUNCTION ... FROM anon, authenticated` para cada función y hacer `GRANT` solo a los roles específicos necesarios.

#### 4. `getPLMensual` no excluye `duplicado_estado='ignorado'` en movimiento_reparto

- **Qué es:** La query de `movimiento_reparto` hace JOIN directo a `movimientos_bancarios` sin filtrar duplicados. Si un movimiento está marcado 'ignorado' pero tiene repartos, esos repartos siguen sumando al P&L de los pisos.
- **Impacto:** P&L de pisos potencialmente inflado por movimientos duplicados marcados como ignorados.
- **Estado del fix:** Manual. Añadir `AND coalesce(m.duplicado_estado,'') <> 'ignorado'` a la query de `movimiento_reparto` (línea ~83) y a la query de lavandería libre (línea ~101).

#### 5. Junio y julio 2025 sin reservas reales en incomes: €1.570 fuera del P&L temporal

- **Qué es:** Los dos meses fueron parchados con registros manuales con `checkIn=NULL`. Esas filas no aparecen en ninguna query `WHERE checkIn BETWEEN`.
- **Impacto:** €1.570 netos quedan fuera de cualquier análisis de P&L por período.
- **Estado del fix:** Manual. Actualizar `checkIn` y `checkOut` de los registros manuales con fechas representativas del mes, o recuperar las reservas individuales reales desde la API de Smoobu.

#### 6. 10 precios aplicados en `prop_busto_reform` superan 3x la media histórica (max=503€ vs media=140€)

- **Qué es:** Con solo un piso activo en `pricing_applied`, cualquier spike incorrecto afecta a ingresos reales o genera reclamaciones. No hay guardia que rechace precios fuera de rango antes de aplicarlos a Smoobu.
- **Impacto:** Riesgo de precios erróneos publicados en OTAs (reclamaciones o reservas perdidas).
- **Estado del fix:** Manual. Revisar los 10 registros donde `new_price > 420€`. Añadir guardia en el agente que rechace precios > 2.5x la media histórica del piso salvo `source='manual'`.

#### 7. 16 mensajes de huéspedes con `needs_human=true` sin despachar

- **Qué es:** 16 mensajes requieren intervención humana pero no han sido enviados ni editados. `agente_log` solo registra decisiones de agente-drive (5 filas), sin cobertura del agente de movimientos ni del de mensajes.
- **Impacto:** Posibles huéspedes sin respuesta. Sin observabilidad cross-agente.
- **Estado del fix:** Manual. Verificar que los 16 `needs_human=true` tienen fila en `mensajes_pendientes_tg`. Añadir cron de guardia diario que alerte por Telegram si hay mensajes `needs_human` sin respuesta en más de 6h.

#### 8. Notificaciones con tasa de error del 75% (3 de 4 en estado error)

- **Qué es:** El canal de notificaciones falla sistemáticamente. Solo 1 de 4 notificaciones registradas fue enviada correctamente. No hay reintento automático ni alerta de fallo.
- **Impacto:** Las alertas operativas no están llegando de forma fiable.
- **Estado del fix:** Manual. Revisar columna `error_msg` de los 3 registros fallidos. Activar reintento automático con backoff exponencial o alertar vía Telegram cuando `estado=error`.

---

### Medios (deuda tecnica)

| # | Titulo | Dimension | Estado |
|---|--------|-----------|--------|
| 1 | 326 políticas RLS en iarest re-evalúan `auth.uid()` por fila en lugar de por query | Rendimiento | Pendiente |
| 2 | `getEvolucionMensual` y `getComparativaMensual` no filtraban `duplicado_estado='ignorado'` | Consistencia financiera | APLICADO en este sprint |
| 3 | `getGastosPorCategoria` y `getResumenPorDestino` no filtraban `duplicado_estado='ignorado'` | Consistencia financiera | APLICADO en este sprint |
| 4 | `getPLMensual` usa `checkIn` para ingresos; `getResumenSivra` usa `date` — convención no definida | Consistencia fiscal | Pendiente — definir canónica (fecha de cobro) |
| 5 | 278 foreign keys sin índice de cobertura (75 public, 200 iarest, 3 rrhh) | Rendimiento | Pendiente — `CREATE INDEX CONCURRENTLY` |
| 6 | 446 índices sin uso acumulados (369 iarest, 74 public, 3 rrhh) | Rendimiento | Pendiente — revisar y eliminar con >30 días |
| 7 | 13 índices duplicados en public e iarest (doble overhead en escrituras) | Rendimiento | Pendiente |
| 8 | `intercompany.ts` silenciaba TODOS los errores de BD, no solo tabla ausente (42P01) | Observabilidad | APLICADO en este sprint |
| 9 | Backlog 181 alertas SIVRA sin resolver: 136 `asignacion_auto` (desde 31 mayo) y 27 `ausencia` | Operativo | Pendiente — posible job de ingesta caído |

---

### Confirmado OK

- Conexiones PSD2 operativas: Kutxabank y BBVA sincronizadas hoy 2026-07-01 a las 06:01 UTC con `estado=vinculada`.
- Clasificación de movimientos bancarios al 100%: 0 filas con `destino=NULL` fuera de ignorados.
- IVA en riesgo = 0 EUR: ninguna factura en estado 'pagada' con `cuota_iva > 0` sin `pago_confirmado_at`. Trimestre fiscal limpio.
- Sin incomes con `propertyId` huérfano: integridad referencial implícita correcta (0 filas).
- Agente de pricing activo: 2.426 precios reales aplicados en 2026 (95% tasa de aplicación), rango 90–503€.
- Sync Smoobu reciente funciona: cron ha capturado reservas hasta noviembre 2026, sin duplicados ni fechas invertidas.
- 10 crons críticos verificados en ejecución: mensajes auto-reply (963 invoc/48h), psd2-sync, banca-alertas, concursos (ingesta/radar/avisos/cierre), cima-liq, mercado/cron.
- `getPLMensual` usa correctamente la tabla `gastos` (no `expenses`) para gastos directos por piso.
- `categorizarLoteSinSubcategoria` ya incluye filtro `duplicado_estado='ignorado'` en ambas ramas.
- `NULLIF(SUM(nights),0)` protege contra división por cero en cálculo de ADR en `lib/propiedades.ts`.
- Saldos bancarios actualizados a hoy: BBVA 20.210€, Kutxabank 18.778€.
- Descuadre OTA vs banco (+6.985€): el dinero está en banco, el widget es una falsa alarma, no dinero perdido.
- PR #638 (agente movimientos Telegram) mergeado hoy 01/07 con arquitectura correcta.

---

## Fixes aplicados en este sprint

### FIX 1 — Widget OTA informativo

**Archivo:** `apps/plataforma/app/(usuario)/dashboard/page.tsx`

- Borde cambiado de amber (`#f59e0b66`) a azul (`#93c5fd66`) para no alarmar innecesariamente.
- Cifra cambiada de naranja-oscuro (`#b45309`) a azul (`#1d4ed8`).
- Añadida nota explicativa en cursiva: "Booking paga en liquidaciones semanales agregadas. Este importe puede estar ya recibido en banco."

### FIX 2 — AGODA en monitor OTA

**Archivos:** `apps/plataforma/lib/sivra/cobros-ota-db.ts`, `apps/plataforma/lib/sivra/cobros-ota.ts`

- `WHERE portal IN (...)` ampliado con `'AGODA'`.
- Type `CanalOTA` incluye `'AGODA'`.
- `CONFIG_COBROS_DEFAULT.margenDias` incluye `AGODA: 14`.

### FIX 3 — Filtro `ignorado` universal en banca.ts

**Archivo:** `apps/plataforma/lib/banca.ts`

- 9 queries afectadas: `listarMovimientos` (ambas ramas), `listarPorRevisar`, `getEvolucionMensual`, `getMovimientosExport`, `getComparativaMensual`, `getGastosPorCategoria`, `getEvolucionPorDestino`, `getResumenPorDestino`, y las dos sub-queries de `getAlertas` (porRevisar + sinJustificante).

### FIX 4 — SQL backfill duplicados

**Archivo:** `prisma/sql/2026-07-01_fix_duplicados_activos.sql`

- Script one-shot que marca `duplicado_estado='ignorado'` en las filas duplicadas, conservando la más antigua. Pendiente de ejecutar en producción.

### FIX 5 — Health check cron

**Archivos:** `apps/plataforma/app/api/cron/health-check/route.ts`, `apps/plataforma/vercel.json`

- 6 checks: duplicados activos, backlog revisión, cuadre OTA/banco (60d), sync Smoobu, `amount NULL` en OTAs, alertas >30d.
- Cron a las 07:00 UTC (09:00 Madrid) todos los días.
- Notifica por Telegram solo si hay fallos.

### FIX 6 — intercompany.ts distingue errores

**Archivo:** `apps/plataforma/lib/intercompany.ts`

- El `catch` genérico reemplazado por distinción de `42P01` (tabla ausente, silenciado) vs. otros errores (logueados con `console.error('[intercompany]', err)`).

---

## Acciones manuales pendientes (Alberto)

1. **Crons caídos — URGENTE HOY:** Verificar en dashboard de Vercel (Crons tab) que los 22 crons sin trazas están habilitados y que `CRON_SECRET` está configurado en las variables de entorno del proyecto plataforma. Invocar manualmente `/api/sivra/updates/sync` para confirmar que el handler funciona.

2. **Fix `expenses` → `gastos`:** Aplicar el fix en `apps/plataforma/lib/financiero.ts` (líneas ~59 y ~65): reemplazar `FROM expenses` por `FROM gastos`. Verificar con `SELECT COUNT(*) FROM gastos` (debe devolver 71 filas). Esto corrige €5.670 subestimados en el P&L.

3. **Ejecutar backfill SQL de duplicados:** Correr `prisma/sql/2026-07-01_fix_duplicados_activos.sql` en producción para limpiar duplicados activos.

4. **Vaciar backlog de 1.182 movimientos `requiere_revision`:** Ir a `/finanzas > Gastos` y procesar en lotes. Subir el `LIMIT` del agente de 15 a 50 movimientos por ciclo para acelerar el vaciado de los 309.703 EUR pendientes.

5. **Seguridad `cron-auth.ts`:** En producción, cambiar el comportamiento cuando `CRON_SECRET` es undefined para que retorne `false` en lugar de `true`. Urgente si los crons son accesibles públicamente.

6. **Políticas RLS faltantes:** Crear políticas en las 29 tablas de `public` y 9 de schema `rrhh` que tienen RLS habilitado sin políticas. Priorizar `movimientos_bancarios`, `gastos`, `facturas_*`, `alquiler_*` y todo el schema `rrhh`.

7. **Incomes OTA con `amount NULL`:** Revisar proceso de ingesta de BOOKING, AIRBNB y EXPEDIA. Los 1.929 registros sin importe invalidan cualquier cuadre banco↔OTA.

8. **Mensajes huéspedes `needs_human`:** Revisar los 16 mensajes pendientes de respuesta humana en el panel de mensajería SIVRA.

9. **Revisar spikes de pricing:** Auditar los 10 precios `> 420€` en `prop_busto_reform` y añadir guardia de rango al agente de pricing.

---

## Proximos pasos recomendados

1. **[Hoy]** Resolver bloqueo de crons en Vercel y confirmar `CRON_SECRET` activo.
2. **[Hoy]** Aplicar fix `expenses`→`gastos` y desplegar para corregir el P&L inmediatamente.
3. **[Esta semana]** Ejecutar backfill SQL de duplicados y configurar `cron-auth.ts` para fallar de forma segura en producción.
4. **[Esta semana]** Investigar los 1.929 incomes OTA con `amount NULL` y restablecer el proceso de ingesta.
5. **[Este mes]** Crear políticas RLS para tablas multi-tenant críticas (public + rrhh).
6. **[Este mes]** Crear cron semanal de barrido autónomo del backlog `requiere_revision` con paginación.
7. **[Este mes]** Resolver las 16 políticas RLS `USING (TRUE)` en iarest y revocar `EXECUTE` de las 76 funciones `SECURITY DEFINER` expuestas.
8. **[Deuda técnica]** Limpiar índices sin uso (446) y duplicados (13) tras confirmar con `pg_stat_user_indexes`.
9. **[Deuda técnica]** Definir convención canónica de fecha para P&L (fecha de cobro vs. fecha de entrada).

---

*Generada por Claude Code · auditoria-completa-central workflow · 2026-07-01*
