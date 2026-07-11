# Health-check: sacar el backlog de alertas de limpiezas del Telegram de Alberto → a Vanessa

**Fecha:** 2026-07-11 · **Rama:** `claude/health-check-alerts-qidakc`

## Problema
El health-check de plataforma (`apps/plataforma/app/api/cron/health-check/route.ts`, **Check 6**)
cuenta filas de la tabla `alertas` con `creada_at < 30 días` **sin filtrar por empresa** y lo mete al
**Telegram de Alberto** (`🟡 152 alertas de más de 30 días sin resolver`).

Diagnóstico sobre la BD compartida (`wswbehlcuxqxyinousql`):
- La tabla `alertas` es **de ialimp** (scope `empresa_id`). Las 152 son **todas de Sique Brilla (Vanessa)** —
  alertas operativas de limpiezas, no de Alberto.
- **107 de las 152** son `tipo='asignacion_auto'` ("Auto-asign: X → Y"), **todas sin leer**: son un **log**
  del cron de auto-asignación (la limpiadora ya recibe push y queda en `notas_internas`). Nadie las lee →
  se acumulan para siempre e inflan el contador.
- Las otras 45 (ausencias, quejas, stock…) están **ya leídas**; solo son viejas.
- **Última conexión de Vanessa:** el login de *owner* no guarda `ultimo_acceso`. Señales: leyó alertas hasta
  el **29/05** (las 107 de junio sin abrir), última alta manual de limpieza el **14/06**. → **No revisa el
  panel de alertas desde finales de mayo**: su badge 🔔 NO es un canal fiable.

## Decisión de Alberto
- **Quitárselo a él**: el backlog de limpiezas no va a su Telegram.
- **Que le aparezca a Vanessa**: como no entra al panel, hay que **empujarle un email** cuando haya backlog real.

## Diseño

### 1. Raíz del atasco (ialimp — `app/api/admin/auto-assign/route.ts`)
- El `INSERT INTO alertas` de `asignacion_auto` pasa a **`leida=true`**: queda como historial consultable
  (`GET /api/admin/alertas?no_leidas=false`) pero **no infla el badge 🔔 ni el contador de "sin resolver"**.
- **Retención**: al final del cron, `DELETE FROM alertas WHERE tipo='asignacion_auto' AND creada_at < NOW() - INTERVAL '30 days'`.
  Es un log; no necesita conservarse. Sin cron nuevo (va dentro del auto-assign que ya corre 4×/día).
- **Limpieza puntual**: borrar por Supabase MCP las 107 `asignacion_auto` sin leer actuales (todas >30 días).

### 2. Quitárselo a Alberto (plataforma — `app/api/cron/health-check/route.ts`)
- **Eliminar el Check 6** por completo. Es el único punto de plataforma que toca la tabla `alertas` (de otro
  tenant); sacarlo no afecta a nada más de Alberto. El health-check pasa de 9 a 8 checks OK.

### 3. Avisar a Vanessa de verdad (ialimp — cron nuevo)
- **Nuevo cron** `GET /api/cron/alertas-pendientes` (auth `Bearer CRON_SECRET`, patrón de `impagos`), **semanal**
  (`0 8 * * 1`, lunes 08:00). Por cada empresa con **alertas accionables sin resolver** —
  `leida=false AND tipo <> 'asignacion_auto' AND creada_at < NOW() - INTERVAL '3 days'` — manda **un email** a
  `empresas.email` (para Sique Brilla = `limpiezascruzz@gmail.com`) vía `lib/mailer.ts`
  (`from = "<empresa> <MAIL_FROM>"`), con el nº y un listado de títulos + enlace a `app.ialimp.es`.
  Si no hay nada pendiente, **no envía** (sin ruido). Multi-tenant: itera todas las empresas (hoy solo dispara
  Sique Brilla).
- Texto en helper puro **`lib/alertas-resumen.ts`** (`resumenAlertasPendientes`) + test `node --test`.

## No incluido (YAGNI)
- No se toca el `AlertasBadge` ni el flujo del panel (sigue igual para cuando entre).
- No se purgan las alertas **leídas** viejas (son historial inocuo; el contador de Alberto ya no las mira).
- No se añade canal Telegram para Vanessa (el bot es de Alberto; su canal es email, el que ya usa ialimp).

## Verificación
- `asignacion_auto` nuevas entran con `leida=true` (probar en preview/MCP).
- Health-check ya no reporta la línea de alertas (revisar respuesta JSON `ok`/`fallos`).
- El cron de Vanessa: forzar con `?secret=` y confirmar que, con 0 accionables, responde `enviados:0`; con una
  alerta accionable de prueba >3 días, envía (verificar en Gmail/logs Vercel) y luego limpiar el dato de prueba.
