---
name: psd2-health-check
description: Guardián de la sincronización bancaria (Enable Banking / PSD2). Verifica que los movimientos bancarios llegan frescos (< 48h) a `movimientos_bancarios`. Si la última importación es antigua o hay una caída >50% en volumen, alerta por Telegram y anota en CONTEXTO-SESIONES.md. Úsala en la rutina semanal de salud financiera o cuando Alberto sospeche que el sync está roto. Sin secretos: solo nombres de variable.
---

# Guardián PSD2 — Enable Banking freshness check

Comprueba que la sincronización bancaria (Enable Banking → `psd2-sync` Vercel) está
entregando datos frescos. Sesión efímera: una pasada idempotente.

> El sync lo hace el **cron Vercel** `psd2-sync` (plataforma, cada 6h). Este guardián no
> reemplaza ese cron: detecta si lleva demasiado tiempo sin traer datos nuevos, situación
> que el cron NO reporta por sí solo (puede fallar en silencio devolviendo 0 movimientos).

## Contexto del riesgo

El tier gratuito de Enable Banking (`EB_PIS_ENABLED`) es un pendiente confirmado en el
backlog de plataforma. Si el token caduca o el proveedor cambia sus condiciones, el cron
Vercel `psd2-sync` seguirá ejecutándose sin errores HTTP visibles pero devolviendo
0 movimientos — el dashboard financiero mostraría datos congelados sin aviso alguno.

## Paso 1 — Consulta de frescura (Supabase MCP)

```sql
SELECT
  MAX(fecha_operacion)                                                AS ultimo_movimiento,
  COUNT(*) FILTER (WHERE fecha_operacion >= CURRENT_DATE - 30)       AS mov_30d,
  COUNT(*) FILTER (WHERE fecha_operacion >= CURRENT_DATE - 60
                     AND fecha_operacion < CURRENT_DATE - 30)        AS mov_30d_prev
FROM movimientos_bancarios
WHERE origen = 'psd2';
```

> **`WHERE origen = 'psd2'` es obligatorio.** Sin el filtro, la caída de volumen de las importaciones
> MANUALES (`xls`/`pdf`/`xls-kutxa`/`xls-bbva` — cargas históricas puntuales que se agotan solas) se
> mezcla con el feed PSD2 real y dispara falsos positivos (caso real 22/07/2026: 57% de caída total,
> pero el feed PSD2 estaba sano — la caída era 100% de las importaciones manuales, fuera del alcance de
> esta skill). Si el feed PSD2 real está seco, dilo; si son las manuales, no es una anomalía de esta skill.

> **Un aviso `ℹ️` de `conexiones_banco.ultimo_avisos` NO es una anomalía.** El prefijo `ℹ️` marca
> una limitación con la que el feed SIGUE entregando (hoy: «Kutxabank ****0855: el banco rechazó la
> ventana de 89 días — importado solo desde X», y el sync cae a la ventana de 30 días). Lo único que
> cuenta como fallo son los avisos SIN ese prefijo. El corte canónico es el helper puro
> `partirAvisos()` de `apps/plataforma/lib/psd2-semaforo.ts` — úsalo como criterio, no leas el texto a
> ojo. Lo que sí hay que decir de una nota `ℹ️` es **desde cuándo hay datos de verdad** en esa cuenta:
> el hueco anterior no está medido y no se afirma «no hubo movimientos» sobre él (21/08/2026, PR #1575).
> **Desde el 26/08/2026 (PR #1739) el cron `psd2-sync` NO manda Telegram por una nota `ℹ️` sola** —
> ni la primera vez: es una limitación permanente del banco sin acción posible. Viaja como contexto
> dentro de una alerta crítica y se pinta en permanencia en `/banca`. Que no llegue aviso de una nota
> es lo ESPERADO, no un vigía roto; esta skill sí debe seguir mirándola en `ultimo_avisos` y contarla.

> 🕳️ **`fecha_operacion` es NULLABLE, y esta consulta no lo ve.** `MAX(fecha_operacion)` ignora los
> NULL y los `COUNT(*) FILTER (WHERE fecha_operacion >= …)` tampoco los cuentan: un apunte que el
> banco entregue SIN fecha entra en la BD, se ve en el libro, y para esta skill es como si no
> hubiera llegado. El fallo que produce es el caro de los dos: declarar el feed **roto** (o en
> caída de volumen) cuando en realidad está entregando — la misma confusión entre «no hay dato» y
> «no sé leer el dato» que arregló el PR #2042 en la línea de `/banca`.
>
> Medido el 02/09/2026: **0 filas sin `fecha_operacion` en las 2.123 de la tabla**, en los seis
> orígenes (`psd2`, `xls`, `xls-kutxa`, `xls-bbva`, `pdf`, `manual`). O sea: hoy no pasa, pero el
> esquema lo permite. Antes de declarar una anomalía por frescura, descarta este caso:
>
> ```sql
> SELECT count(*) AS psd2_sin_fecha
> FROM movimientos_bancarios
> WHERE origen = 'psd2' AND fecha_operacion IS NULL;
> ```
>
> Si devuelve > 0, **no es un feed seco: es un feed que trae apuntes sin fecha**. Dilo así, con el
> número, y no lo cuentes como «sin datos».

Evalúa:
- `ultimo_movimiento < CURRENT_DATE - 2` → **anomalía crítica** (>48h sin datos)
- `mov_30d < mov_30d_prev * 0.5` → **anomalía moderada** (caída >50 % en volumen)
- Ambas OK → estado verde; anota "OK" y termina

> **Complementario (no lo dupliques):** el cron `health-check` de plataforma (07:00) ya vigila
> el **cuadre de tarjetas** (Check 7: liquidación `TARJ.CRDTO` sin extracto de tarjeta que la
> respalde → Telegram) y los **justificantes al cierre de trimestre** (Check 8). Esta skill se
> centra en la FRESCURA del feed PSD2; si el sync está verde pero falta el detalle de una
> tarjeta no conectada (p. ej. la de Pilar ****0302, que entra por Excel/PDF manual), eso lo
> caza el Check 7, no esta skill.

## Paso 2 — Si hay anomalía

1. Inserta al principio de `docs/CONTEXTO-SESIONES.md`:
   ```
   ## {FECHA} — Alerta PSD2 sync
   - Último movimiento: {fecha} (hace {N} días)
   - Causa probable: token caducado / tier gratuito EB / cron mudo
   - Acción: revisar EB_PIS_ENABLED en Vercel + logs del cron psd2-sync
   ```
2. Si `PLATAFORMA_URL` + `ALERTA_TOKEN` están disponibles en la sesión, envía la alerta
   por el endpoint interno de plataforma (no necesitas TELEGRAM_BOT_TOKEN):
   ```
   POST {PLATAFORMA_URL}/api/internal/alerta
   Authorization: Bearer {ALERTA_TOKEN}
   { "text": "⚠️ PSD2 sync lleva {N} días sin datos nuevos. Último mov: {fecha}. Revisar EB_PIS_ENABLED en Vercel." }
   ```
   (`ALERTA_TOKEN` = token estrecho que SOLO abre este endpoint; el endpoint acepta también el
   viejo `CRON_SECRET` por compat, pero NO pongas la llave maestra en el prompt.)

## Paso 3 — Informe final (siempre)

Muestra en el chat:
- Estado: `✅ OK` / `⚠️ ANOMALÍA MODERADA` / `🚨 ANOMALÍA CRÍTICA`
- Último movimiento: {fecha} (hace {N} días)
- Volumen 30d: {mov_30d} vs 30d anteriores: {mov_30d_prev}
- Acción recomendada si aplica

## Herramientas

- **Supabase** (`wswbehlcuxqxyinousql`): `execute_sql` para las consultas
- **Telegram** (a través de plataforma): `POST {PLATAFORMA_URL}/api/internal/alerta` con Bearer `ALERTA_TOKEN`
  (token estrecho; el endpoint acepta también el viejo `CRON_SECRET` por compat). El token de Telegram vive en
  Vercel plataforma — la rutina NO necesita `TELEGRAM_BOT_TOKEN`.
- Sin GitHub: esta skill no abre PRs (es un guardián, no un corrector)

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
