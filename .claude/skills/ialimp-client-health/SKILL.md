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

```sql
SELECT
  COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '24 hours') AS sync_24h,
  COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '7 days')   AS sync_7d,
  MAX(updated_at)                                                    AS ultimo_sync
FROM reservas
WHERE empresa_id = {EMPRESA_ID};
```

- `sync_24h = 0` y `ultimo_sync < NOW() - INTERVAL '48 hours'` → **sync roto** (alerta)
- `sync_7d > 0` → OK

## Paso 3 — Programaciones sin asignar

```sql
SELECT COUNT(*) AS pendientes
FROM programaciones
WHERE empresa_id = {EMPRESA_ID}
  AND estado = 'pendiente'
  AND fecha_programada >= CURRENT_DATE
  AND limpiadora_id IS NULL;
```

- `pendientes > 3` → alerta (pueden quedarse sin cubrir)
- `pendientes > 0` → nota informativa

## Paso 4 — Impagos activos

```sql
SELECT COUNT(*) AS impagos_activos, SUM(importe) AS total_impagado
FROM facturas
WHERE empresa_id = {EMPRESA_ID}
  AND estado IN ('impagada', 'vencida')
  AND fecha_vencimiento < CURRENT_DATE;
```

- Cualquier `impagos_activos > 0` → alerta con el total

## Paso 5 — Informe de viernes

Genera un resumen corto en el chat:

```
📋 Sique Brilla — semana {FECHA}
✅/⚠️ PMS sync: último {fecha} ({N} reservas sincronizadas esta semana)
✅/⚠️ Programaciones sin cubrir: {pendientes}
✅/⚠️ Impagos activos: {N} ({total}€)
```

Si hay alertas (⚠️), añade acción recomendada. Si todo verde → "Semana OK, nada urgente."

Si hay alertas y `PLATAFORMA_URL` + `ALERTA_SECRET` (token de alertas del ENTORNO; `CRON_SECRET` de respaldo) están disponibles, envía el resumen
por el endpoint interno de plataforma (el token de Telegram vive allí, no en la rutina):
```
POST {PLATAFORMA_URL}/api/internal/alerta
Authorization: Bearer {ALERTA_SECRET}
{ "text": "📋 Sique Brilla — semana {FECHA}\n..." }
```

## Herramientas

- **Supabase** (`wswbehlcuxqxyinousql`): `execute_sql` (solo lectura, queries con `empresa_id`)
- **Vercel MCP** (opcional): `get_runtime_errors` para comprobar errores recientes del build
- **Telegram** (a través de plataforma): `POST {PLATAFORMA_URL}/api/internal/alerta` con Bearer `ALERTA_SECRET` (del entorno; `CRON_SECRET` de respaldo).
  La rutina NO necesita `TELEGRAM_BOT_TOKEN`.
- Sin GitHub: no abre PRs

## Auto-informe (obligatorio al terminar la pasada)

Antes de cerrar, añade UNA entrada arriba del todo de la sección "Entradas pendientes de
procesar" de `docs/AGENTES-BITACORA.md` (3-5 líneas máx.):

`- **YYYY-MM-DD · <nombre-de-esta-skill>** · hizo: …; dudas: …; fallos: …; PRs/commits: …`

- Sin dudas ni fallos → `dudas: —; fallos: —` (el "todo bien" también es señal).
- Commitea la entrada con el resto de tu trabajo (o en un commit propio a `main` si la
  pasada no tocó el repo). La consume el `agentes-entrenador` (semanal) para mejorar este
  prompt; si no queda escrita, esta pasada no existió para él.
