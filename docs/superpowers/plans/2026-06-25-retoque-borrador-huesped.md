# Botón "🔧 Retocar" sobre el borrador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un botón "🔧 Retocar" al agente de huéspedes de SIVRA que aplica una instrucción corta de Alberto sobre el borrador existente (en vez de reescribirlo entero), lo envía y aprende el par pregunta→respuesta.

**Architecture:** Nuevo helper puro-inyectable `aplicarRetoque` que llama a `aiComplete`; nuevo `callback hsp_tune` y modo `esperando_retoque` en el webhook de Telegram; dos columnas nuevas en `mensajes_pendientes_tg` (`pregunta`, `esperando_retoque`) para persistir la pregunta y el modo.

**Tech Stack:** Next.js (route handler), Prisma raw SQL sobre Supabase compartida, `@central/core-ai` (`aiComplete`), `@central/core-telegram`, tests `node:test` (Node 22 strip-types).

---

### Task 1: SQL — columnas nuevas en `mensajes_pendientes_tg`

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-06-25_retoque_borrador.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- 2026-06-25_retoque_borrador.sql
-- Agente de huéspedes: soporte para el botón "🔧 Retocar" (instrucción sobre el borrador)
-- y aprendizaje del par pregunta→respuesta.
ALTER TABLE mensajes_pendientes_tg ADD COLUMN IF NOT EXISTS pregunta TEXT;
ALTER TABLE mensajes_pendientes_tg ADD COLUMN IF NOT EXISTS esperando_retoque BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Aplicar a la BD real (Supabase `wswbehlcuxqxyinousql`)**

Aplicar vía Supabase MCP (`apply_migration`, name `retoque_borrador_2026_06_25`) o `execute_sql` con el contenido del paso 1. NO basta con `tsc`: la tabla no está en Prisma.
Verificar después:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'mensajes_pendientes_tg' AND column_name IN ('pregunta','esperando_retoque');
```
Expected: dos filas (`pregunta`, `esperando_retoque`).

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/prisma/sql/2026-06-25_retoque_borrador.sql
git commit -m "feat(sivra): columnas pregunta/esperando_retoque en mensajes_pendientes_tg"
```

---

### Task 2: Helper `aplicarRetoque` (TDD)

**Files:**
- Create: `apps/plataforma/lib/sivra/agente-huesped/retoque.ts`
- Test: `apps/plataforma/lib/sivra/agente-huesped/retoque.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// retoque.test.ts
import { test } from 'node:test'
import assert from 'node:assert'
import { aplicarRetoque } from './retoque.ts'

// Stub de la función de completado (inyectada) para no llamar a la IA real.
const stub = (out: string, capture?: (args: any[]) => void) =>
  async (...args: any[]) => { capture?.(args); return out }

test('aplica la instrucción y devuelve el texto revisado', async () => {
  const res = await aplicarRetoque('Sí, dispone de cafetera y microondas.', 'añade que la cafetera es italiana', 'es',
    stub('Sí, dispone de cafetera italiana y microondas.'))
  assert.equal(res, 'Sí, dispone de cafetera italiana y microondas.')
})

test('pasa idioma, borrador e instrucción al modelo', async () => {
  let seen: any[] = []
  await aplicarRetoque('Yes, there is a coffee machine.', 'di que es italiana', 'en',
    stub('Yes, there is an Italian coffee machine.', a => { seen = a }))
  const [messages, opts] = seen
  assert.match(opts.system, /inglés/)
  assert.match(messages[0].content, /Yes, there is a coffee machine\./)
  assert.match(messages[0].content, /di que es italiana/)
})

test('borrador o instrucción vacíos → cadena vacía sin llamar al modelo', async () => {
  let called = false
  const res = await aplicarRetoque('', 'algo', 'es', async () => { called = true; return 'x' })
  assert.equal(res, '')
  assert.equal(called, false)
})

test('si el modelo lanza, devuelve cadena vacía', async () => {
  const res = await aplicarRetoque('borrador', 'instr', 'es', async () => { throw new Error('boom') })
  assert.equal(res, '')
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/retoque.test.ts`
Expected: FAIL — `Cannot find module './retoque.ts'`.

- [ ] **Step 3: Implementar el helper**

```ts
// lib/sivra/agente-huesped/retoque.ts — aplica una instrucción de Alberto sobre el borrador existente.
import { aiComplete } from '@central/core-ai'

const NOMBRE_IDIOMA: Record<string, string> = { es: 'español', en: 'inglés', fr: 'francés', de: 'alemán', it: 'italiano' }

// Tipo de la función de completado (inyectable para test; por defecto aiComplete).
type Complete = (messages: { role: 'user'; content: string }[], opts: { system: string; maxTokens: number }) => Promise<string>

// Aplica una instrucción corta del anfitrión al borrador (que YA está en el idioma del huésped).
// Devuelve el mensaje revisado en ESE idioma, o '' si falta entrada o la IA falla/da vacío.
export async function aplicarRetoque(
  borrador: string,
  instruccion: string,
  idioma: string,
  complete: Complete = aiComplete as unknown as Complete,
): Promise<string> {
  const txt = (borrador || '').trim()
  const ins = (instruccion || '').trim()
  if (!txt || !ins) return ''
  const nombre = NOMBRE_IDIOMA[idioma] || idioma || 'español'
  try {
    const out = (await complete(
      [{ role: 'user', content: `BORRADOR:\n${txt}\n\nCAMBIO A APLICAR:\n${ins}` }],
      { system: `Eres el anfitrión de un alojamiento. Tienes un BORRADOR de respuesta a un huésped escrito en ${nombre}. Aplica el CAMBIO indicado conservando el resto del mensaje intacto. Devuelve SOLO el mensaje revisado, en ${nombre}, sin comillas ni notas.`, maxTokens: 600 },
    )).trim()
    return out
  } catch { return '' }
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/retoque.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/retoque.ts apps/plataforma/lib/sivra/agente-huesped/retoque.test.ts
git commit -m "feat(sivra): helper aplicarRetoque (instrucción sobre el borrador)"
```

---

### Task 3: Botón "🔧 Retocar" + persistir `pregunta`

**Files:**
- Modify: `apps/plataforma/lib/sivra/agente-huesped/telegram-msg.ts` (botones ~50-61, INSERT ~65-69)

- [ ] **Step 1: Añadir el botón Retocar**

En `proponerPorTelegram`, tras el array `botones` inicial (línea ~50-53), añadir una fila:

```ts
  const botones: Boton[][] = [[
    { texto: '✅ Enviar', callback: `hsp_send:${ctx.bookingId}` },
    { texto: '✏️ Modificar', callback: `hsp_edit:${ctx.bookingId}` },
  ]]
  // Retocar: aplicar una instrucción corta sobre el borrador (no reescribir entero).
  if (dec.reply) botones.push([{ texto: '🔧 Retocar sobre el borrador', callback: `hsp_tune:${ctx.bookingId}` }])
```

(El `if (dec.reply)` evita ofrecer Retocar cuando no hay borrador que retocar.)

- [ ] **Step 2: Persistir la pregunta del huésped en el pendiente**

Cambiar el INSERT/UPSERT (líneas ~65-69) para incluir la columna `pregunta` (el parámetro `pregunta` ya existe en la firma de la función):

```ts
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_pendientes_tg (booking_id, property_id, borrador, categoria, tg_message_id, esperando_edit, esperando_retoque, idioma, pregunta)
    VALUES (${ctx.bookingId}, ${ctx.propertyId}, ${dec.reply || ''}, ${dec.categoria}, ${mid}, false, false, ${ctx.lang}, ${pregunta || ''})
    ON CONFLICT (booking_id) DO UPDATE SET borrador = ${dec.reply || ''}, categoria = ${dec.categoria}, tg_message_id = ${mid}, esperando_edit = false, esperando_retoque = false, idioma = ${ctx.lang}, pregunta = ${pregunta || ''}, created_at = now()
  `).catch(() => {})
```

- [ ] **Step 3: Verificar tipos**

Run: `cd apps/plataforma && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "telegram-msg\|retoque" || echo "sin errores en archivos tocados"`
Expected: `sin errores en archivos tocados`.

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/telegram-msg.ts
git commit -m "feat(sivra): botón Retocar y persistir la pregunta del huésped en el pendiente"
```

---

### Task 4: Acción `tune` + modo retoque en el webhook

**Files:**
- Modify: `apps/plataforma/app/api/sivra/mensajes/telegram-webhook/route.ts`

- [ ] **Step 1: Añadir `esperando_retoque` y `pregunta` al tipo y al SELECT**

El tipo `Pendiente` (líneas ~15-18) y `getPendiente` ya hacen `SELECT *`, así que solo hay que ampliar el tipo:

```ts
type Pendiente = {
  booking_id: string; property_id: string | null; borrador: string | null
  categoria: string | null; tg_message_id: number | null; esperando_edit: boolean; idioma: string | null
  esperando_retoque: boolean; pregunta: string | null
}
```

- [ ] **Step 2: Importar el helper**

Añadir junto a los imports existentes (tras la línea 9):

```ts
import { aplicarRetoque } from '@/lib/sivra/agente-huesped/retoque'
```

- [ ] **Step 3: Manejar el botón Retocar (acción `tune`)**

Tras el bloque `if (action === 'edit') { ... }` (línea ~71), añadir:

```ts
    if (action === 'tune') {
      await tgAnswerCallback(cb.id, 'Escribe el retoque')
      await tgAskForReply(`🔧 Responde con el RETOQUE a aplicar al borrador (p. ej. "añade que la cafetera es italiana") — reserva ${bookingId}`)
      await prisma.$executeRaw(Prisma.sql`UPDATE mensajes_pendientes_tg SET esperando_retoque = true, esperando_edit = false WHERE booking_id = ${bookingId}`).catch(() => {})
      return NextResponse.json({ ok: true })
    }
```

(En el bloque `action === 'edit'` existente, cambiar su UPDATE para que también ponga `esperando_retoque = false`:)

```ts
      await prisma.$executeRaw(Prisma.sql`UPDATE mensajes_pendientes_tg SET esperando_edit = true, esperando_retoque = false WHERE booking_id = ${bookingId}`).catch(() => {})
```

- [ ] **Step 4: Manejar la respuesta de texto en modo retoque**

En el handler de `msg.reply_to_message` (tras obtener `pend`, antes del bloque `if (pend && pend.esperando_edit)` de la línea ~81), añadir el bloque de retoque:

```ts
    if (pend && pend.esperando_retoque) {
      const instruccion = (msg.text || '').trim()
      const texto = await aplicarRetoque(pend.borrador || '', instruccion, pend.idioma || 'es')
      if (!texto) {
        await tgSend('❌ No pude aplicar el retoque. Vuelve a pulsar 🔧 Retocar e indícamelo de nuevo (o ✏️ Modificar para reescribir).')
        return NextResponse.json({ ok: false, tuned: false })
      }
      const ok = await enviarAlHuesped(bookingId!, texto)
      if (!ok) {
        await tgSend('❌ No se pudo enviar al huésped. Inténtalo de nuevo (o pulsa ✅ Enviar / 🔧 Retocar en el mensaje original).')
        return NextResponse.json({ ok: false, sent: false })
      }
      await aprenderCorreccion({ propertyId: pend.property_id || '', categoria: pend.categoria || 'general', pregunta: pend.pregunta || '', respuestaFinal: texto })
      await logMensaje({ bookingId: bookingId!, propertyId: pend.property_id || '', categoria: pend.categoria || 'general', pregunta: pend.pregunta || '', respuesta: texto, fuente: 'ia', confidence: 0, sentimiento: 'neutro', needs_human: true, auto_sent: ok, edited: true })
      if (pend.categoria) await evaluarGraduacion(pend.categoria)
      await prisma.$executeRaw(Prisma.sql`DELETE FROM mensajes_pendientes_tg WHERE booking_id = ${bookingId}`).catch(() => {})
      // Confirmación a Alberto; si el huésped no es de habla hispana, añade traducción al español para verificar.
      let conf = `✅ Enviado al huésped${pend.idioma && pend.idioma !== 'es' ? ` (en ${pend.idioma.toUpperCase()})` : ''}:\n${escapeHtml(texto)}`
      if (pend.idioma && pend.idioma !== 'es') {
        try {
          const es = (await aiComplete([{ role: 'user', content: texto }], { system: 'Traduce al español de España. Devuelve SOLO la traducción, sin comillas ni explicaciones.', maxTokens: 400 })).trim()
          if (es) conf += `\n<i>🔁 ${escapeHtml(es)}</i>`
        } catch {}
      }
      await tgSend(conf)
      return NextResponse.json({ ok: true, tuned: true })
    }
```

- [ ] **Step 5: Aprender con la pregunta también en los caminos existentes**

En el bloque del botón `send/grant/grad` (línea ~57) y en los dos `aprenderCorreccion`/`logMensaje` del modo edición/aprobación (líneas ~100, ~124-125), cambiar `pregunta: ''` por `pregunta: pend.pregunta || ''`. Quedan así:

```ts
// botón Enviar (línea ~57):
      await aprenderCorreccion({ propertyId: pend.property_id || '', categoria: pend.categoria || 'general', pregunta: pend.pregunta || '', respuestaFinal: pend.borrador || '' })
// aprobación corta (línea ~100):
        await aprenderCorreccion({ propertyId: pend.property_id || '', categoria: pend.categoria || 'general', pregunta: pend.pregunta || '', respuestaFinal: pend.borrador || '' })
// modificación completa (líneas ~124-125):
      await aprenderCorreccion({ propertyId: pend.property_id || '', categoria: pend.categoria || 'general', pregunta: pend.pregunta || '', respuestaFinal: textoEnviar })
      await logMensaje({ bookingId: bookingId!, propertyId: pend.property_id || '', categoria: pend.categoria || 'general', pregunta: pend.pregunta || '', respuesta: textoEnviar, fuente: 'ia', confidence: 0, sentimiento: 'neutro', needs_human: true, auto_sent: ok, edited: true })
```

- [ ] **Step 6: Verificar tipos**

Run: `cd apps/plataforma && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "telegram-webhook\|retoque" || echo "sin errores en archivos tocados"`
Expected: `sin errores en archivos tocados`.

- [ ] **Step 7: Commit**

```bash
git add apps/plataforma/app/api/sivra/mensajes/telegram-webhook/route.ts
git commit -m "feat(sivra): acción tune en el webhook — aplica el retoque, envía y aprende Q→A"
```

---

### Task 5: Verificación final y memoria

**Files:**
- Modify: `docs/CONTEXTO-SESIONES.md` (entrada nueva arriba)

- [ ] **Step 1: Correr los tests del módulo**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/*.test.ts 2>&1 | tail -8`
Expected: `# fail 0`.

- [ ] **Step 2: Anotar la sesión en la memoria**

Añadir una entrada arriba en `docs/CONTEXTO-SESIONES.md` resumiendo: botón "🔧 Retocar" del agente de huéspedes (instrucción sobre el borrador), columnas `pregunta`/`esperando_retoque` en `mensajes_pendientes_tg` (SQL aplicada), y que Modificar/aprobación ahora aprenden el par Q→A.

- [ ] **Step 3: Commit y push**

```bash
git add docs/CONTEXTO-SESIONES.md
git commit -m "docs(memoria): retoque sobre el borrador del agente de huéspedes"
git push -u origin claude/luxury-busto-guest-reply-n8ltqp
```

- [ ] **Step 4: Crear PR draft** (vía GitHub MCP `create_pull_request`, base `main`, draft=true).
