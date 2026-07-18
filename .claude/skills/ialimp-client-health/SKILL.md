---
name: ialimp-client-health
description: Monitorización semanal de la salud de la cuenta de Sique Brilla (único cliente en producción de ialimp). Comprueba PMS sync, programaciones sin asignar, impagos activos y errores recientes. Genera un resumen de viernes para cerrar la semana operativa. Úsala en la rutina semanal o cuando Alberto quiera un pulso rápido del cliente. Sin secretos: solo nombres de variable.
---

# ialimp client health — Sique Brilla

Pasada semanal sobre la cuenta del único cliente EN VIVO de ialimp. Sesión efímera,
idempotente. Pensada para correr los viernes ~17:00 CEST por un trigger programado.

> ⚠️ Producción = `app.ialimp.es`. Vanessa (Sique Brilla) lo usa en directo. Esta skill
> es de **solo lectura**: no modifica datos ni abre PRs. Solo alerta.

## Contexto

El scope de BD de ialimp es siempre `empresa_id`. Sique Brilla tiene su `empresa_id` fijo
en la tabla `empresas`. Usa `empresa_id` en TODAS las queries (frontera RGPD).

## Paso 1 — Identificar empresa_id de Sique Brilla

```sql
SELECT id, nombre, activa, created_at
FROM empresas
WHERE nombre ILIKE '%sique%' OR nombre ILIKE '%brilla%'
LIMIT 1;
```

Guarda el `id` como `{EMPRESA_ID}` para el resto de la pasada.

## Paso 2 — PMS sync (iCal / Smoobu)

`pms_connections` guarda el estado de la conexión en sí (1 fila por conexión activa);
`cleaning_sessions` es el reflejo operativo (las sesiones que el sync ha ido generando).
Comprueba ambas — la primera detecta el sync roto en origen, la segunda que sigue
llegando actividad real.

```sql
SELECT pms_tipo, activa, last_sync_at, sync_error, total_sessions
FROM pms_connections
WHERE empresa_id = {EMPRESA_ID};

SELECT
  COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '24 hours') AS updated_24h,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')   AS created_7d,
  MAX(updated_at)                                                    AS ultimo_update
FROM cleaning_sessions
WHERE empresa_id = {EMPRESA_ID};
```

- `sync_error IS NOT NULL`, o `last_sync_at < NOW() - INTERVAL '48 hours'` → **sync roto** (alerta)
- `created_7d = 0` con conexión `activa = true` → nota informativa (revisar si Sique Brilla ha tenido reservas esta semana antes de alertar)

## Paso 3 — Sesiones de limpieza sin asignar

`cleaning_sessions.limpiadora_id IS NULL` en fechas futuras es el equivalente operativo
a "sin cubrir" (la tabla `programaciones` es de plantillas recurrentes — `frecuencia` +
`activa` boolean —, no de asignaciones día a día; no tiene columna `estado`).

```sql
SELECT COUNT(*) AS sin_asignar
FROM cleaning_sessions
WHERE empresa_id = {EMPRESA_ID}
  AND session_date >= CURRENT_DATE
  AND limpiadora_id IS NULL;
```

- `sin_asignar > 3` → alerta (pueden quedarse sin cubrir)
- `sin_asignar > 0` → nota informativa
- Si hay alerta, desglosa por `session_date` (agrupa y ordena) para saber cuáles son
  urgentes (próximos días) frente a las que aún tienen margen.

## Paso 4 — Impagos activos

La tabla de facturación a clientes es `facturas_clientes` (columna de importe: `total`,
no `importe`).

```sql
SELECT COUNT(*) AS impagos_activos, SUM(total) AS total_impagado
FROM facturas_clientes
WHERE empresa_id = {EMPRESA_ID}
  AND estado IN ('impagada', 'vencida')
  AND fecha_vencimiento < CURRENT_DATE;
```

- Cualquier `impagos_activos > 0` → alerta con el total

## Paso 5 — Informe de viernes

Genera un resumen corto en el chat:

```
📋 Sique Brilla — semana {FECHA}
✅/⚠️ PMS sync: último {fecha} ({N} sesiones creadas esta semana)
✅/⚠️ Sesiones sin limpiadora asignada: {sin_asignar}
✅/⚠️ Impagos activos: {N} ({total}€)
```

Si hay alertas (⚠️), añade acción recomendada. Si todo verde → "Semana OK, nada urgente."

Si hay alertas y `PLATAFORMA_URL` + `ALERTA_TOKEN` están disponibles, envía el resumen
por el endpoint interno de plataforma (el token de Telegram vive allí, no en la rutina):
```
POST {PLATAFORMA_URL}/api/internal/alerta
Authorization: Bearer {ALERTA_TOKEN}
{ "text": "📋 Sique Brilla — semana {FECHA}\n..." }
```
(`ALERTA_TOKEN` = token estrecho que SOLO abre este endpoint. El endpoint también acepta el
viejo `CRON_SECRET` por compat, pero NO pongas la llave maestra en el prompt de la rutina.)

## Herramientas

- **Supabase** (`wswbehlcuxqxyinousql`): `execute_sql` (solo lectura, queries con `empresa_id`)
- **Vercel MCP** (opcional): `get_runtime_errors` para comprobar errores recientes del build
- **Telegram** (a través de plataforma): `POST {PLATAFORMA_URL}/api/internal/alerta` con Bearer `ALERTA_TOKEN`
  (token estrecho; el endpoint acepta también el viejo `CRON_SECRET` por compat). La rutina NO necesita `TELEGRAM_BOT_TOKEN`.
- Sin GitHub: no abre PRs

## Auto-informe (obligatorio al terminar la pasada)

Antes de cerrar, añade UNA entrada arriba del todo de la sección "Entradas pendientes de
procesar" de `docs/AGENTES-BITACORA.md` (3-5 líneas máx.):

`- **YYYY-MM-DD · <nombre-de-esta-skill>** · hizo: …; dudas: …; fallos: …; PRs/commits: …`

- Sin dudas ni fallos → `dudas: —; fallos: —` (el "todo bien" también es señal).
- Commitea la entrada con el resto de tu trabajo (o en un commit propio a `main` si la
  pasada no tocó el repo). La consume el `agentes-entrenador` (semanal) para mejorar este
  prompt; si no queda escrita, esta pasada no existió para él.
