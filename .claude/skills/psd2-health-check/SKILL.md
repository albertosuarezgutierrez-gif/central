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
  MAX(fecha)                                                AS ultimo_movimiento,
  COUNT(*) FILTER (WHERE fecha >= CURRENT_DATE - 30)       AS mov_30d,
  COUNT(*) FILTER (WHERE fecha >= CURRENT_DATE - 60
                     AND fecha < CURRENT_DATE - 30)        AS mov_30d_prev
FROM movimientos_bancarios;
```

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
2. Si `PLATAFORMA_URL` + `ALERTA_SECRET` (token de alertas del ENTORNO; `CRON_SECRET` de respaldo) están disponibles en la sesión, envía la alerta
   por el endpoint interno de plataforma (no necesitas TELEGRAM_BOT_TOKEN):
   ```
   POST {PLATAFORMA_URL}/api/internal/alerta
   Authorization: Bearer {ALERTA_SECRET}
   { "text": "⚠️ PSD2 sync lleva {N} días sin datos nuevos. Último mov: {fecha}. Revisar EB_PIS_ENABLED en Vercel." }
   ```

## Paso 3 — Informe final (siempre)

Muestra en el chat:
- Estado: `✅ OK` / `⚠️ ANOMALÍA MODERADA` / `🚨 ANOMALÍA CRÍTICA`
- Último movimiento: {fecha} (hace {N} días)
- Volumen 30d: {mov_30d} vs 30d anteriores: {mov_30d_prev}
- Acción recomendada si aplica

## Herramientas

- **Supabase** (`wswbehlcuxqxyinousql`): `execute_sql` para las consultas
- **Telegram** (a través de plataforma): `POST {PLATAFORMA_URL}/api/internal/alerta` con Bearer `ALERTA_SECRET` (del entorno; `CRON_SECRET` de respaldo).
  El token de Telegram vive en Vercel plataforma — la rutina NO necesita `TELEGRAM_BOT_TOKEN`.
- Sin GitHub: esta skill no abre PRs (es un guardián, no un corrector)

## Auto-informe (obligatorio al terminar la pasada)

Antes de cerrar, añade UNA entrada arriba del todo de la sección "Entradas pendientes de
procesar" de `docs/AGENTES-BITACORA.md` (3-5 líneas máx.):

`- **YYYY-MM-DD · <nombre-de-esta-skill>** · hizo: …; dudas: …; fallos: …; PRs/commits: …`

- Sin dudas ni fallos → `dudas: —; fallos: —` (el "todo bien" también es señal).
- Commitea la entrada con el resto de tu trabajo (o en un commit propio a `main` si la
  pasada no tocó el repo). La consume el `agentes-entrenador` (semanal) para mejorar este
  prompt; si no queda escrita, esta pasada no existió para él.
