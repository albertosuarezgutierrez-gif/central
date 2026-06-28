# Redacción IA desde idea en ✏️ Modificar

**Fecha:** 2026-06-28  
**Vertical:** SIVRA — agente huéspedes (`apps/plataforma`)  
**Estado:** aprobado por Alberto

## Problema

Cuando Alberto pulsaba ✏️ Modificar y escribía texto, el sistema lo usaba verbatim (o solo lo traducía al idioma del huésped). Alberto quiere escribir la idea en bruto ("Lo siento, la empresa de limpieza ya va de camino") y que la IA lo redacte como mensaje profesional en el idioma del huésped.

## Decisiones

- **✏️ Modificar siempre pasa por IA.** Lo que Alberto escribe es la idea; la IA genera el borrador final.
- **Contexto completo:** La IA recibe idea + pregunta del huésped + últimas 3 conversaciones de `mensajes_log` + datos de reserva (propiedad, nombre huésped, checkIn/checkOut).
- **Escape hatch:** 🔧 Retocar sigue siendo para ajustes finos sobre el borrador existente (sin cambio).
- **Sin cambios en BD** ni en el resto del flujo.

## Prompt

```
Eres el anfitrión de {propiedad} (Sevilla).
Conversación reciente con {guestName} ({checkIn}–{checkOut}):
{historial de últimas 3 conversaciones}

Su último mensaje: "{pregunta}"
Quieres responderle transmitiendo esta idea: "{idea}"

Escribe el mensaje en {idioma}. Cálido, directo, máximo 4 frases.
Solo el texto del mensaje.
```

## Cambios

| Fichero | Cambio |
|---------|--------|
| `lib/sivra/agente-huesped/redactar.ts` | **Nuevo.** `redactarDesdeIdea(idea, ctx, complete?)` — función pura testeable (inyecta complete) |
| `lib/sivra/agente-huesped/redactar.test.ts` | **Nuevo.** Tests con stub de complete |
| `app/api/sivra/mensajes/telegram-webhook/route.ts` | En bloque `esperando_edit`: reemplaza traducción verbatim por `redactarDesdeIdea()` + helper `cargarCtxRedaccion()` |

## Flujo resultante

1. Alberto pulsa ✏️ Modificar → bot pide "Escribe tu idea en bruto"
2. Alberto escribe idea en español
3. Webhook: carga contexto (DB) → llama `redactarDesdeIdea()` → IA genera borrador en idioma del huésped
4. `reproponerBorrador()` muestra el borrador con botones normales
5. Alberto: ✅ Enviar / volver a ✏️ Modificar / 🔧 Retocar para ajuste fino
