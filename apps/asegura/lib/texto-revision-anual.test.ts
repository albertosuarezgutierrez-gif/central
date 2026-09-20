import test from 'node:test'
import assert from 'node:assert/strict'

import { PROHIBIDAS_REVISION, textoRevisionAnual, type PolizaEnRevision } from './texto-revision-anual.ts'

const p = (o: Partial<PolizaEnRevision> = {}): PolizaEnRevision => ({
  tipo: 'auto',
  compania: 'Generali',
  fechaVencimiento: new Date('2026-11-15T00:00:00Z'),
  declarada: false,
  ...o,
})

test('🚨 el correo no promete ahorro ni precio: sería asesoramiento (RDL 3/2020)', () => {
  const { asunto, texto, html } = textoRevisionAnual({ nombre: 'Ana López', polizas: [p(), p({ tipo: 'hogar', declarada: true })] })
  for (const s of [asunto, texto, html]) assert.doesNotMatch(s, PROHIBIDAS_REVISION)
})

test('🚨 dice por qué llega y cómo dejar de recibirlo (art. 21 LSSI)', () => {
  const { texto, html } = textoRevisionAnual({ nombre: null, polizas: [p()] })
  assert.match(texto, /marcaste la casilla/)
  assert.match(texto, /desmarcarla/)
  assert.match(html, /desmarcarla/)
})

test('las pólizas salen ordenadas por vencimiento y la declarada se distingue', () => {
  const { texto } = textoRevisionAnual({
    nombre: 'Ana',
    polizas: [p({ fechaVencimiento: new Date('2026-12-01T00:00:00Z') }), p({ tipo: 'hogar', compania: 'Mapfre', declarada: true })],
  })
  const iHogar = texto.indexOf('Hogar · Mapfre')
  const iAuto = texto.indexOf('Coche · Generali')
  assert.ok(iHogar >= 0 && iAuto >= 0 && iHogar < iAuto, 'la que vence antes va primero')
  assert.match(texto, /Hogar · Mapfre — vence el 15\/11\/2026 \(la subiste tú al portal\)/)
})

test('con una sola póliza el asunto la nombra; con varias, las cuenta', () => {
  assert.match(textoRevisionAnual({ nombre: null, polizas: [p()] }).asunto, /^Tu seguro de coche vence el 15\/11\/2026/)
  assert.match(textoRevisionAnual({ nombre: null, polizas: [p(), p()] }).asunto, /^Tienes 2 seguros/)
})

test('sin compañía no se inventa: la línea va sin ella', () => {
  const { texto } = textoRevisionAnual({ nombre: null, polizas: [p({ compania: null, tipo: null })] })
  assert.match(texto, /· Seguro — vence el/)
})
