import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  revisarFichero,
  TIPOS_ACEPTADOS,
  TAMANO_MAXIMO_BYTES,
} from './fichero.ts'

// Solo se prueba lo que es PURO: la revisión del fichero. La lectura en sí
// llama a la IA y se verifica con documentos reales, no con fixtures — un
// fixture se escribe con la misma suposición equivocada que el código.
//
// 📌 Desde el 03/09/2026 `fichero.ts` es un re-export de `@central/module-seguros`:
// la regla es una sola y el tope pasó de 12 MB a **10 MB**, que es el del CHECK
// `documentos_tamano` de la tabla. Con 12 MB, un fichero de 11 aprobaba aquí y
// lo tumbaba Postgres después. Estos tests siguen valiendo como cepo de que la
// pantalla de `apps/asegura` no pierde la revisión por el camino.

test('acepta los tipos declarados', () => {
  for (const type of TIPOS_ACEPTADOS) {
    assert.equal(revisarFichero({ type, size: 1000, name: 'p.bin' }), null, type)
  }
})

test('acepta un PDF aunque el navegador no mande el tipo', () => {
  // Pasa de verdad: algunos navegadores mandan '' o 'application/octet-stream'.
  assert.equal(revisarFichero({ type: '', size: 1000, name: 'poliza.PDF' }), null)
  assert.equal(
    revisarFichero({ type: 'application/octet-stream', size: 1000, name: 'poliza.pdf' }),
    null,
  )
})

test('rechaza lo que no sabemos abrir, y dice qué era', () => {
  const motivo = revisarFichero({ type: 'application/zip', size: 1000, name: 'v.zip' })
  assert.ok(motivo)
  assert.match(motivo!, /application\/zip/)
  assert.match(motivo!, /PDF o una foto/)
})

test('el vídeo tiene su propio motivo: no es «un tipo raro»', () => {
  const motivo = revisarFichero({ type: 'video/mp4', size: 1000, name: 'v.mp4' })
  assert.ok(motivo)
  assert.match(motivo!, /vídeos/)
})

test('un tipo desconocido se nombra como tal en vez de dejar un hueco', () => {
  const motivo = revisarFichero({ type: '', size: 1000, name: 'cosa.xyz' })
  assert.ok(motivo)
  assert.match(motivo!, /desconocido/)
})

test('rechaza el fichero vacío — que no es lo mismo que un tipo malo', () => {
  const motivo = revisarFichero({ type: 'application/pdf', size: 0, name: 'p.pdf' })
  assert.equal(motivo, 'El fichero está vacío.')
})

test('rechaza lo que pasa del máximo, diciendo cuánto pesa y cuánto cabe', () => {
  const motivo = revisarFichero({
    type: 'application/pdf',
    size: TAMANO_MAXIMO_BYTES + 1,
    name: 'p.pdf',
  })
  assert.ok(motivo)
  assert.match(motivo!, /10\.0 MB/)
  assert.match(motivo!, /máximo son 10 MB/)
})

test('el límite exacto SÍ entra: se rechaza a partir de pasarse', () => {
  assert.equal(
    revisarFichero({ type: 'application/pdf', size: TAMANO_MAXIMO_BYTES, name: 'p.pdf' }),
    null,
  )
})

test('sin nombre de fichero también decide, sin reventar', () => {
  assert.equal(revisarFichero({ type: 'image/png', size: 10 }), null)
  assert.ok(revisarFichero({ type: 'text/plain', size: 10 }))
})
