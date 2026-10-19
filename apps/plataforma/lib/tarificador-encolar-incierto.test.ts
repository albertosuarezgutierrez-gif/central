import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { clasificarEncolar, MENSAJE_ENCOLAR_INCIERTO } from './tarificador-encolar-incierto.ts'
import { resumenLote, type FilaLote } from './tarificador-todas.ts'

test('clasificarEncolar: timeout/corte/502 mudo = incierto (puede haberse encolado), NUNCA «no se pudo conectar»', () => {
  assert.equal(clasificarEncolar(502, { estado: 'error', motivo: 'timeout', causa: 'TimeoutError' }), 'incierto')
  assert.equal(clasificarEncolar(502, { estado: 'error', motivo: 'red', causa: 'UND_ERR_SOCKET' }), 'incierto')
  assert.equal(clasificarEncolar(502, { estado: 'error', motivo: 'red', causa: 'ECONNRESET' }), 'incierto')
  assert.equal(clasificarEncolar(502, { estado: 'error', motivo: 'red', causa: null }), 'incierto')
  assert.equal(clasificarEncolar(502, null), 'incierto')
  assert.equal(clasificarEncolar(504, null), 'incierto')
})
test('clasificarEncolar: ECONNREFUSED/DNS = sin_conexion (seguro que no salió)', () => {
  for (const causa of ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']) assert.equal(clasificarEncolar(502, { estado: 'error', motivo: 'red', causa }), 'sin_conexion')
})
test('clasificarEncolar: respuestas con veredicto (y 502 de la ruta con mensaje, antes de encolar) = respuesta', () => {
  assert.equal(clasificarEncolar(202, { estado: 'encolado' }), 'respuesta')
  assert.equal(clasificarEncolar(409, { estado: 'rechazado' }), 'respuesta')
  assert.equal(clasificarEncolar(503, { estado: 'sin_configurar' }), 'respuesta')
  assert.equal(clasificarEncolar(502, { estado: 'error', mensaje: 'No se pudo leer la ficha del cliente' }), 'respuesta')
})
test('el mensaje de incierto no dice «conectar» ni «rechazada»', () => {
  assert.match(MENSAJE_ENCOLAR_INCIERTO, /puede que se haya encolado/)
  assert.doesNotMatch(MENSAJE_ENCOLAR_INCIERTO, /conectar|rechaz/i)
})
test('resumenLote cuenta las inciertas «por confirmar», no como rechazadas', () => {
  const f: FilaLote[] = [{ compania: 'allianz', estado: 'incierta', mensaje: 'x' }]
  assert.equal(resumenLote(f), '1 compañía: 0 encoladas, 1 por confirmar')
})
test('cepo de fuente: PedirATodas clasifica antes de rechazar y el encolar lleva su tope propio', () => {
  const bots = readFileSync(new URL('../app/(usuario)/correduria/cliente/[id]/PrecioBots.tsx', import.meta.url), 'utf8')
  assert.match(bots, /clasificarEncolar\(r\.status, r\.json\) === 'incierto'/)
  assert.match(bots, /estado: 'incierta'/)
  const asegura = readFileSync(new URL('./tarificador-asegura.ts', import.meta.url), 'utf8')
  assert.equal((asegura.match(/TOPE_ENCOLAR_MS\)/g) ?? []).length, 3)
})
