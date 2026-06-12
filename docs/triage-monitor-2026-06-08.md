# Informe — Triage de alertas del Monitor ia.rest (2026-06-08)

## TL;DR
Las **3 alertas que llegaron son históricas (stale)**, del 6–15 de mayo. El bug de
Stripe que mencionan **ya se arregló** (migración del 17 may, verificada en
producción). El monitor las re-muestra solo porque están con `resuelto = false`.

**Pero** durante la investigación aparecieron **4 errores reales y activos** (en
logs de Postgres ahora mismo, repitiéndose) por **deriva de nombres de columna**
entre el código y el esquema real. Eso es lo que merece arreglo.

---

## 1. Alertas recibidas = STALE (no tocar, solo cerrar)

Evidencia: tabla `system_errors` en producción.

| funcion_origen | mensaje | nº | último visto |
|---|---|---|---|
| `webhook-stripe` | `perfiles_plan_check` violado en `checkout.session.completed` | 2 | **2026-05-06** |
| `deploy-check` | "error-monitoring desplegado correctamente" (es un test, no error) | 1 | 2026-05-06 |
| `courier-route` | `Could not find the 'notas' column of 'comandas'` | 2 | 2026-05-15 |

- **Stripe**: causa raíz fue que el checkout escribía planes nuevos (`per_seat`,
  `starter`) que la constraint vieja no admitía. **Arreglado** por
  `supabase/migrations/20260517_fix_perfiles_plan_constraint.sql`. Confirmado en
  prod: hoy `perfiles_plan_check` admite
  `trial, activo, per_seat, starter, barra, servicio, casa, bloqueado`.
  **0 ocurrencias desde el 6 may.**
- **`'notas'`**: la columna real es `nota_general` — también lleva sin reaparecer
  desde el 15 may.

### Acción recomendada (cierre del ruido)
```sql
UPDATE public.system_errors
SET resuelto = true,
    resuelto_por = 'triage-2026-06-08',
    notas_resolucion = 'Stale. Stripe arreglado en migr. 20260517; notas->nota_general ya corregido.'
WHERE resuelto = false
  AND funcion_origen IN ('webhook-stripe','deploy-check','courier-route');
```

---

## 2. Errores REALES y activos (esto es lo que hay que arreglar)

Aparecen en los logs de Postgres de las últimas 24h, recurrentes. Es una migración
`restaurante_id → local_id` + renombrados de columnas que dejó código y funciones
DB sin actualizar.

### A) `comandas.cerrada_at` no existe → usar `cobrado_at`
La columna real de cierre es **`cobrado_at`** (comandas tiene `cobrado_at`,
`estado_cobro`, `total_cobrado`; NO `cerrada_at`).

- `src/app/api/factura/cerrar/route.ts:156`
  ```ts
  // ahora: { estado: 'cerrada', cerrada_at: new Date().toISOString() }
  // → cambiar cerrada_at por cobrado_at
  ```
- `src/app/api/bridge/cashlogy/result/route.ts:77` → mismo cambio `cerrada_at` → `cobrado_at`
- `src/app/api/cron/feedback-visita/route.ts:84, 91, 92` → `cerrada_at` → `cobrado_at`
  (en el `select` y en los filtros `.gte/.lte`)

### B) `comandas.restaurante_id` no existe → usar `local_id`
La columna real es **`local_id`** (comandas NO tiene `restaurante_id`).

- `src/app/api/cron/feedback-visita/route.ts:84` → en el `select(... restaurante_id ...)`
  cambiar a `local_id`
  > ⚠️ Este cron está fallando **entero** cada 10 min (doble fallo: `cerrada_at` +
  > `restaurante_id`). Los emails de feedback post-visita no salen.

### C) `qr_sesiones_cliente.restaurante_id` no existe → usar `local_id`
La columna real es **`local_id`**.

- `src/app/q/success/page.tsx:73`
  ```
  // .../qr_sesiones_cliente?id=eq.${sesionId}&select=restaurante_id
  // → select=local_id  (y ajustar quien consuma ese campo)
  ```
  > Nota: la migración `20260510120000_qr_module.sql:39` crea un índice sobre
  > `qr_sesiones_cliente(restaurante_id)`, pero en prod la columna es `local_id`.
  > Hubo un rename posterior que no actualizó ni el índice/migración ni este código.

### D) `alerta_log.tipo` no existe → usar `trigger_tipos` (es `text[]`) y `mensaje` → `mensaje_voz`
Columnas reales de `alerta_log`:
`..., trigger_tipos (text[]), ..., mensaje_voz, leida, ..., local_id`.
NO existen `tipo` ni `mensaje`.

Funciones DB que insertan en `alerta_log` (revisar las tres; al menos
`fn_avisos_trial` usa los nombres viejos):

- `fn_avisos_trial` — hace `INSERT INTO alerta_log (local_id, tipo, mensaje, leida)`
  → debe ser `(local_id, trigger_tipos, mensaje_voz, leida)` con
  `trigger_tipos = ARRAY['trial_expira']` (es array).
- `fn_alerta_super`
- `fn_generar_alertas_consumo`

> El cron `pg_cron` job #6 (alerta-ritmo, cada 2 min) es el que dispara esto en
> bucle. Hay que corregir las funciones con `CREATE OR REPLACE FUNCTION`
> (migración SQL nueva).

---

## 3. Mapa de renombrados detectado
| Antiguo (en código) | Real (en BD) | Tablas afectadas |
|---|---|---|
| `restaurante_id` | `local_id` | `comandas`, `qr_sesiones_cliente`, `alerta_log` |
| `cerrada_at` | `cobrado_at` | `comandas` |
| `notas` | `nota_general` | `comandas` (ya corregido) |
| `tipo` | `trigger_tipos` (`text[]`) | `alerta_log` |
| `mensaje` | `mensaje_voz` | `alerta_log` |

> Recomendación: tras corregir estos, hacer un barrido (`grep`) de `restaurante_id`
> que apunte específicamente a `comandas`/`qr_sesiones_cliente`/`alerta_log`,
> porque puede haber más usos de los listados. El resto de tablas del proyecto sí
> usan `restaurante_id` legítimamente, así que el reemplazo **NO es global**.

---

## Anexo — cómo se obtuvo la evidencia
- Constraint real en prod:
  `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='perfiles_plan_check';`
- Fechas de las alertas:
  `SELECT funcion_origen, min(created_at), max(created_at), count(*) FROM system_errors GROUP BY 1;`
- Esquema real de tablas: `information_schema.columns` para
  `comandas`, `qr_sesiones_cliente`, `alerta_log`.
- Errores vivos: logs de Postgres (servicio `postgres`, últimas 24h).
- Funciones que insertan en `alerta_log`: barrido de `pg_proc` con
  `pg_get_functiondef(...) ~* 'alerta_log'`.
