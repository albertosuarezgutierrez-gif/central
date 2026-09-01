---
name: ialimp-client-health
description: Monitorización semanal de la salud de la cuenta de Sique Brilla (único cliente en producción de ialimp). Comprueba PMS sync, programaciones sin asignar, impagos activos y errores recientes. Genera un resumen de viernes para cerrar la semana operativa. Úsala en la rutina semanal o cuando Alberto quiera un pulso rápido del cliente. Sin secretos: solo nombres de variable.
---

# ialimp client health — Sique Brilla

> 🚨 **LEE ESTO ANTES DE INTERPRETAR NADA (01/09/2026): Sique Brilla YA NO USA ialimp.** Se le retiró
> el acceso; su operativa vive en `/invitado/limpieza` de plataforma. Así que **«0 accesos», «0
> programaciones», «sin actividad» NO son señales de avería: son la consecuencia esperada** de que no
> haya nadie dentro. Un rojo de esta skill hoy dice «el cliente no entra», que ya se sabe, no «el SaaS
> está roto». Antes de avisar a Alberto de un silencio, comprueba si lo que mides depende de que
> alguien use la app. Lo que SÍ sigue siendo señal real: errores del PMS sync (infraestructura, corre
> sola) e impagos. **Alberto no ha pedido retirar esta skill** — ialimp se queda como producto a
> vender; lo que cambia es quién hay dentro.

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

No existe tabla `reservas`. La conexión PMS vive en `pms_connections` (1 fila por
empresa: `ultimo_sync`, `last_sync_at`, `sync_error`, `activa`) y el pulso real de
actividad son las `cleaning_sessions` que genera cada sync:

```sql
SELECT id, cliente_nombre, pms_tipo, activa, ultimo_sync, last_sync_at, sync_error, total_sessions
FROM pms_connections
WHERE empresa_id = {EMPRESA_ID};

SELECT
  COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '24 hours') AS sync_24h,
  COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '7 days')   AS sync_7d,
  MAX(updated_at)                                                    AS ultimo_update
FROM cleaning_sessions
WHERE empresa_id = {EMPRESA_ID};
```

- `sync_error IS NOT NULL`, o `activa = false`, o `sync_24h = 0` con `last_sync_at < NOW() - INTERVAL '48 hours'` → **sync roto** (alerta)
- `sync_7d > 0` y sin `sync_error` → OK

## Paso 3 — Programaciones sin asignar

`programaciones` son plantillas de recurrencia (sin `estado` ni `fecha_programada`):
la columna que importa es `activa` + `limpiadora_id`.

```sql
SELECT COUNT(*) AS pendientes
FROM programaciones
WHERE empresa_id = {EMPRESA_ID}
  AND activa = true
  AND limpiadora_id IS NULL;
```

- `pendientes > 3` → alerta (pueden quedarse sin cubrir)
- `pendientes > 0` → nota informativa
- Si `programaciones` está vacía para la empresa, no es necesariamente un fallo: puede
  que el cliente no use recurrencias y dependa solo del sync PMS (Paso 2).

## Paso 4 — Impagos activos

No existe tabla `facturas` (genérica); las facturas al cliente final viven en
`facturas_clientes` (`estado`, `total`, `fecha_vencimiento`):

```sql
SELECT COUNT(*) AS impagos_activos, SUM(total) AS total_impagado
FROM facturas_clientes
WHERE empresa_id = {EMPRESA_ID}
  AND estado IN ('impagada', 'vencida', 'pendiente')
  AND fecha_vencimiento < CURRENT_DATE;
```

- Cualquier `impagos_activos > 0` → alerta con el total
- Si la tabla está vacía para la empresa, comprueba si su facturación corre por otro
  raíl (p.ej. `empresas.stripe_subscription_id`) antes de asumir que es un hueco de datos.

## Paso 5 — Informe de viernes

Genera un resumen corto en el chat:

```
📋 Sique Brilla — semana {FECHA}
✅/⚠️ PMS sync: último {fecha} ({N} reservas sincronizadas esta semana)
✅/⚠️ Programaciones sin cubrir: {pendientes}
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

## Canal de aviso — protocolo común

**Preflight AL ARRANCAR** (no al final, cuando ya tengas algo que contar):
`GET {PLATAFORMA_URL}/api/internal/alerta` con `Authorization: Bearer {ALERTA_TOKEN}`.

- `200` → el canal está vivo, sigue con tu pasada.
- `401` → el canal está **mudo** (el token de ESTE entorno no coincide con el de Vercel `plataforma`;
  hay un entorno por rutina y se desincronizan de uno en uno). El cuerpo trae `causa` y `remedio`.
  Entonces, según `docs/AVISOS-AGENTES.md`: avisa por el **push nativo** de la sesión empezando por
  `🔇 SIN TELEGRAM (401):` y deja el aviso **entero** en `docs/AGENTES-BITACORA.md` (`fallos:`).

Nunca te inventes el token, nunca uses `CRON_SECRET` en el prompt, y **nunca falles en silencio**.
