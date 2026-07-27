# Avisos de los agentes — protocolo y resincronización de `ALERTA_TOKEN`

> Fuente única del camino "una rutina de Claude Code quiere avisar a Alberto".
> Código: `apps/plataforma/app/api/internal/alerta/route.ts` · `apps/plataforma/lib/cron-auth.ts` ·
> `apps/plataforma/lib/rutas-rutina.ts` · guardián `test/regression-rutas-rutina.test.ts`.

## El camino

```
rutina (env ALERTA_TOKEN)  →  POST {PLATAFORMA_URL}/api/internal/alerta  →  tgSend  →  Telegram de Alberto
```

Las rutinas **no** llevan `TELEGRAM_BOT_TOKEN` (bot único del monorepo, vive solo en Vercel). Llevan
`ALERTA_TOKEN`, un token **de bajo privilegio a propósito**: el campo de variables del entorno de una
rutina de Claude Code es **texto plano visible**, no un almacén de secretos. Su alcance completo si se
filtra es `RUTAS_RUTINA` (`lib/rutas-rutina.ts`): mandar un Telegram, empujar el saldo del bróker en
paper y disparar el pricing **en dry-run**. Nunca dinero real. La llave maestra `CRON_SECRET`
**no se pone en el entorno de las rutinas.**

## Protocolo para un agente (los 3 pasos)

**1. Preflight AL ARRANCAR** — no al final, cuando ya tienes algo que contar:

```bash
curl -s -o /dev/null -w '%{http_code}' "${PLATAFORMA_URL}/api/internal/alerta" \
  -H "Authorization: Bearer ${ALERTA_TOKEN}"
```

`200` → el canal está vivo, sigue con tu pasada. `401` → el cuerpo trae `causa` y `remedio`; da por
hecho que **no vas a poder avisar** y ve al paso 3.

**2. El aviso**, cuando toque:

```bash
curl -s -X POST "${PLATAFORMA_URL}/api/internal/alerta" \
  -H "Authorization: Bearer ${ALERTA_TOKEN}" -H "Content-Type: application/json" \
  -d '{"text":"<resumen en HTML, con enlaces si hay PR>"}'
```

**3. Si el canal está caído** (401, o no existen `PLATAFORMA_URL`/`ALERTA_TOKEN`) — degrada, **nunca
falles en silencio**, en este orden:

1. Avisa por el **canal nativo de la rutina** (el push de Claude Code al terminar la sesión). Empieza
   el mensaje con `🔇 SIN TELEGRAM (401):` para que se distinga de un aviso normal.
2. Deja constancia **en el repo**, que es lo único que persiste: entrada en `docs/AGENTES-BITACORA.md`
   con `fallos:` describiendo el 401 y **el aviso que no pudiste mandar, entero**. Si abres PR, ponlo
   también en el cuerpo.
3. **No** improvises otro canal ni te inventes el token.

> Alberto se entera igualmente sin depender de esto: desde el 27/07/2026 el propio endpoint **se chiva
> de sus 401** por Telegram (el servidor sí tiene el bot token), con anti-spam de 6 h. Tu paso 3 aporta
> el **contenido** del aviso, que el chivatazo no puede llevar (en un 401 el cuerpo no está autenticado
> y sería un vector para empujar texto arbitrario al Telegram de Alberto).

## Resincronizar `ALERTA_TOKEN` (lo que solo puede hacer Alberto)

El token está **duplicado a mano** en dos sitios, y hay **un entorno de Claude Code por rutina**:

| Dónde | Cómo se cambia |
|---|---|
| Proyecto Vercel `plataforma` | `/operador/secretos` → `ALERTA_TOKEN` → escribir valor + contraseña de operador. **Redespliega solo.** (O a mano en Vercel + redeploy.) |
| Entorno de **cada** rutina en claude.ai/code | Ajustes del entorno → Variables → pegar el **mismo** valor, byte a byte |

**Las dos reglas que se olvidan y provocan el incidente:**

- 🔴 **Una env de Vercel NO entra en runtime sin redeploy.** Cambiarla y no redesplegar deja el valor
  viejo sirviendo. Fue el eslabón que faltó el 19/07/2026. Por eso el panel redespliega automático.
- 🔴 **No hay UN entorno, hay VARIOS.** Rotar y pegarlo solo en el entorno de una rutina deja mudas a
  las demás. Fue lo que pasó el 26-27/07/2026: el entorno de `pricing-agente` tenía el valor bueno (su
  Telegram del 27/07 salió) mientras `agentes-entrenador` y `buscador-ia` daban 401 contra el mismo
  despliegue. Al rotar, **recorre todos los entornos**.

Comprobación end-to-end tras rotar (debe devolver `200` y llegar el Telegram):

```bash
curl -s -X POST "${PLATAFORMA_URL}/api/internal/alerta" \
  -H "Authorization: Bearer ${ALERTA_TOKEN}" -H "Content-Type: application/json" \
  -d '{"text":"✅ prueba de canal"}' -w '\n%{http_code}\n'
```

## Diagnóstico rápido por síntoma

| Síntoma | Qué es | Dónde se arregla |
|---|---|---|
| `403` en el CONNECT del proxy | **Red**: el dominio no está en la allowlist del entorno | Entorno de la rutina → Network access → Custom → añadir dominio |
| `401` con `causa: "el token no coincide…"` | **Token**: este entorno lleva un valor viejo | Resincronizar (tabla de arriba) |
| `401` con `causa: "el servidor no tiene ALERTA_TOKEN…"` | Falta la env en Vercel, o se puso sin redesplegar | `/operador/secretos` |
| `307` → `/login` | **Middleware**: la ruta no está declarada en `RUTAS_RUTINA` | `lib/rutas-rutina.ts` (el guardián lo detecta en CI) |

## Añadir un endpoint nuevo que llame una rutina

1. En el handler, autoriza con `isRoutineAuthorized` (o `isAlertaTokenAuthorized` si quieres
   autorización **escalonada**, como `/api/sivra/pricing/aplicar-propuesta`: con el token de rutina
   solo dry-run, en vivo solo con `CRON_SECRET`/sesión de admin).
2. Añade su ruta a `RUTAS_RUTINA` en `apps/plataforma/lib/rutas-rutina.ts`.

Si te saltas el paso 2, el middleware redirige la petición a `/login` **antes** de que el handler
corra y la rutina se queda bloqueada sin explicación — le costó 3 ciclos al agente de pricing
(20/07, 22/07, 27/07/2026), con el diagnóstico equivocado "falta `CRON_SECRET`" mientras el handler
ya estaba abierto. `test/regression-rutas-rutina.test.ts` lo impide ahora en CI, en las dos
direcciones (handler sin declarar ↔ ruta declarada de más).
