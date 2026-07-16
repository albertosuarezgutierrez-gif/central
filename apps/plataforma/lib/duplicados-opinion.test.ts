// Tests de la parte PURA de la segunda opinión IA de duplicados. Runner: `node --test`
// (type-stripping). Sin BD ni red (no toca aiComplete, solo prompt + parseo).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { construirPromptOpinion, parseOpinion, type DupOpinionInput } from './duplicados-opinion-core.ts'

const input = (o: Partial<DupOpinionInput>): DupOpinionInput => ({
  importe: -171.55, confianza: 'alta',
  movimientos: [
    { fecha: '2026-06-02', concepto: 'RECIBO AYUNTAMIEN IBI RECIBO202601173193', cuentaLabel: 'Kutxabank ****0855' },
    { fecha: '2026-06-02', concepto: 'RECIBO AYUNTAMIEN IBI RECIBO202601173194', cuentaLabel: 'Kutxabank ****0855' },
  ],
  ...o,
})

test('construirPromptOpinion: incluye importe formateado, banco y ambos conceptos, sin pedir sumas', () => {
  const p = construirPromptOpinion(input({}))
  assert.match(p, /171,55€/)                       // importe en formato español, € detrás
  assert.match(p, /Kutxabank \*\*\*\*0855/)        // banco de dónde sale el cargo
  assert.match(p, /202601173193/)                  // concepto crudo del cargo 1
  assert.match(p, /202601173194/)                  // concepto crudo del cargo 2
  assert.match(p, /Sospecha del detector determinista: alta/)
})

test('parseOpinion: JSON limpio → veredicto y confianza válidos', () => {
  const o = parseOpinion('{"veredicto":"probable_legitimo","explicacion":"Son dos recibos de IBI con nº distinto.","confianza":0.9}')
  assert.equal(o.veredicto, 'probable_legitimo')
  assert.equal(o.confianza, 0.9)
  assert.match(o.explicacion, /IBI/)
})

test('parseOpinion: JSON envuelto en ```json y texto → lo extrae igual', () => {
  const o = parseOpinion('Claro, aquí tienes:\n```json\n{"veredicto":"probable_duplicado","explicacion":"Mismo comercio y día.","confianza":0.7}\n```')
  assert.equal(o.veredicto, 'probable_duplicado')
  assert.equal(o.confianza, 0.7)
})

test('parseOpinion: veredicto desconocido o confianza fuera de rango → saneado', () => {
  const o = parseOpinion('{"veredicto":"ni_idea","explicacion":"","confianza":5}')
  assert.equal(o.veredicto, 'incierto')       // veredicto no válido → incierto
  assert.equal(o.confianza, 0)                // 5 fuera de [0,1] → 0
  assert.ok(o.explicacion.length > 0)         // explicación vacía → fallback no vacío
})

test('parseOpinion: basura o vacío → incierto sin romper', () => {
  assert.equal(parseOpinion('').veredicto, 'incierto')
  assert.equal(parseOpinion('lo siento, no puedo').veredicto, 'incierto')
  assert.equal(parseOpinion('{roto').veredicto, 'incierto')
})
