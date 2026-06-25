# Diseño — Botón "🔧 Retocar" sobre el borrador (agente de huéspedes SIVRA)

**Fecha:** 2026-06-25
**Vertical:** `apps/plataforma` → `lib/sivra/agente-huesped/*`
**Origen:** Alberto, sobre un borrador real (Luxury Busto · David, reserva 142771692). El huésped
preguntó por el tipo de cafetera; el borrador solo decía "dispone de cafetera y microondas". Alberto
quiere **retocar el borrador existente** (no reescribirlo entero), enviarlo y que el agente aprenda.

## Problema
Hoy el botón **✏️ Modificar** pide a Alberto el **texto completo** para el huésped, que **reemplaza**
el borrador. Para un cambio pequeño ("añade que la cafetera es italiana") tiene que reescribir todo.

## Decisiones de diseño (acordadas)
1. **Disparador = botón nuevo** "🔧 Retocar" (explícito), junto al "✏️ Modificar" actual. No se toca el
   comportamiento de Modificar (sigue siendo reescritura completa).
2. **Aprendizaje = par pregunta + respuesta final.** Se guarda la pregunta del huésped junto a la
   respuesta final, para que el ejemplo en `mensajes_aprendizaje` sea preciso (la próxima vez que
   pregunten por la cafetera, el agente ya sabe que es italiana).

## Diseño

### 1. UX (Telegram) — `telegram-msg.ts`
Tres acciones en la propuesta:
```
[ ✅ Enviar ] [ ✏️ Modificar ]
[ 🔧 Retocar sobre el borrador ]
```
- **✏️ Modificar** (`hsp_edit`): como hoy → reescritura completa.
- **🔧 Retocar** (`hsp_tune`, NUEVO): Alberto escribe una **instrucción corta**; la IA la aplica al
  borrador existente.

### 2. Estado — tabla `mensajes_pendientes_tg` (Supabase compartida `wswbehlcuxqxyinousql`)
Dos columnas nuevas:
- `pregunta TEXT` — pregunta del huésped (ya disponible como parámetro de `proponerPorTelegram`; solo
  hay que persistirla en el INSERT/UPSERT). Habilita el aprendizaje Q→A.
- `esperando_retoque BOOLEAN NOT NULL DEFAULT false` — modo. Al pulsar Retocar → `true` y
  `esperando_edit=false`; al pulsar Modificar → `esperando_edit=true` y `esperando_retoque=false`
  (mutuamente excluyentes).

### 3. Aplicar el retoque — nuevo módulo `retoque.ts`
`aplicarRetoque(borrador: string, instruccion: string, idioma: string): Promise<string>`
- Llama a `aiComplete` (`@central/core-ai`) con un prompt: *"Aquí tienes un borrador de respuesta a un
  huésped escrito en {idioma}. Aplica este cambio del anfitrión: {instrucción}. Devuelve SOLO el
  mensaje revisado, en {idioma}, conservando el resto intacto, sin comillas ni notas."*
- El borrador ya está en el idioma del huésped → el resultado sale en su idioma, **sin paso de
  traducción adicional**.
- Devuelve cadena vacía si la IA falla; el llamador decide qué hacer.

### 4. Envío + aprendizaje — `telegram-webhook/route.ts`
Nuevo `action === 'tune'` (botón) → `tgAskForReply("🔧 Dime el retoque a aplicar al borrador (p. ej.
'añade que la cafetera es italiana') — reserva {bookingId}")` y `esperando_retoque=true`.

En el handler de respuesta de texto (force_reply), si `pend.esperando_retoque`:
1. `texto = aplicarRetoque(pend.borrador, instruccionEs, pend.idioma)`.
2. Si vacío → aviso a Alberto, **no se envía**, se conserva el pendiente (igual que el patrón de fallo
   de envío actual).
3. `enviarAlHuesped(bookingId, texto)`; si falla envío → aviso, conservar pendiente.
4. `aprenderCorreccion({ propertyId, categoria, pregunta: pend.pregunta, respuestaFinal: texto })`.
5. `logMensaje({ ..., pregunta: pend.pregunta, respuesta: texto, edited: true, auto_sent: ok })`.
6. `evaluarGraduacion(categoria)` → borrar pendiente.
7. Confirmación a Alberto con el texto enviado; si `idioma !== 'es'`, añade línea `🔁 {traducción al
   español}` para que pueda verificar lo que se mandó.

**Mejora de paso (mismo radio):** los caminos *Modificar* y *aprobación corta* hoy llaman a
`aprenderCorreccion`/`logMensaje` con `pregunta: ''`. Se cambian a `pend.pregunta` para que también
aprendan el par Q→A.

### 5. SQL — `prisma/sql/2026-06-25_retoque_borrador.sql`
```sql
ALTER TABLE mensajes_pendientes_tg ADD COLUMN IF NOT EXISTS pregunta TEXT;
ALTER TABLE mensajes_pendientes_tg ADD COLUMN IF NOT EXISTS esperando_retoque BOOLEAN NOT NULL DEFAULT false;
```
Aplicada a la BD real (verificada contra Supabase, no solo `tsc`). No toca RLS, buckets ni nada que
comparta ialimp.

### 6. Tests — `retoque.test.ts` (node --test)
Verifica que `aplicarRetoque` construye el prompt esperado (idioma + instrucción + borrador) y que
devuelve cadena vacía cuando la IA lanza/da vacío. `aiComplete` se mockea.

## Archivos
- `apps/plataforma/lib/sivra/agente-huesped/telegram-msg.ts` (botón + persistir `pregunta`)
- `apps/plataforma/lib/sivra/agente-huesped/retoque.ts` (NUEVO)
- `apps/plataforma/lib/sivra/agente-huesped/retoque.test.ts` (NUEVO)
- `apps/plataforma/app/api/sivra/mensajes/telegram-webhook/route.ts` (acción `tune` + modo retoque + fix aprendizaje con pregunta)
- `apps/plataforma/prisma/sql/2026-06-25_retoque_borrador.sql` (NUEVO)

## Fuera de alcance (YAGNI)
- Autodetección instrucción-vs-texto (se descartó a favor del botón explícito).
- Escribir el hecho ("cafetera italiana") de vuelta en la guía de Smoobu (es read-only/caché).
- Histórico de retoques o deshacer.
