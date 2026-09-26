// Cepos de la auditoría del parte del portal (26/09/2026).
//
// 1. Un parte nuevo avisa a Alberto AL MOMENTO. Solo existía el resumen diario
//    de las 06:55, que se come hasta un día de los siete del art. 16 LCS.
// 2. «¿Hay heridos? → Sí» orienta al 112 y al atestado: antes no decía nada.
// 3. La cámara directa va en una entrada APARTE: con `capture` en la de
//    siempre, el móvil ya no deja elegir una foto hecha ni un PDF.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8')

test('la ruta de partes avisa por Telegram tras guardar, sin que un fallo tumbe la respuesta', () => {
  const src = leer('apps/asegura-portal/app/api/siniestros/route.ts')
  const guardar = src.indexOf('await crearParte(')
  const avisar = src.indexOf('tgSend(')
  assert.ok(guardar > 0, 'la ruta ya no guarda el parte con crearParte')
  assert.ok(avisar > guardar, 'el aviso inmediato por Telegram no está (o va antes de guardar el parte)')
  assert.match(src.slice(guardar, avisar), /try\s*\{/, 'el aviso tiene que ir en try/catch: un Telegram caído no puede devolver 500 con el parte ya guardado')
  assert.match(src, /textoAvisoParteNuevo\(/)
})

test('con heridos, la pantalla del parte manda al 112 y al atestado', () => {
  const src = leer('apps/asegura-portal/app/(portal)/boveda/ParteSiniestro.tsx')
  assert.match(src, /form\.hayHeridos === 'si' &&/, 'nada reacciona a «¿Hay heridos? → Sí»')
  assert.match(src, /href="tel:112"/)
  assert.match(src, /atestado/)
})

test('la cámara directa va en su propia entrada, nunca en la de elegir ficheros', () => {
  const src = leer('apps/asegura-portal/app/(portal)/boveda/ParteSiniestro.tsx')
  const conCaptura = [...src.matchAll(/<input[^>]*?capture="environment"[^>]*?\/>/gs)].map((m) => m[0])
  assert.ok(conCaptura.length >= 2, 'faltan los botones de cámara (parte amistoso y fotos)')
  for (const i of conCaptura) assert.doesNotMatch(i, /\bmultiple\b/, `capture junto a multiple: ${i.slice(0, 80)}`)
  const conMultiple = [...src.matchAll(/<input[^>]*?\bmultiple\b[^>]*?\/>/gs)].map((m) => m[0])
  for (const i of conMultiple) assert.doesNotMatch(i, /capture=/, 'capture en la entrada de galería/PDF: impide elegir ficheros ya hechos')
})
