import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { muestraHistorialSinco } from './piezas-riesgo.ts'

test('historial/SINCO solo en ramos de vehículo', () => {
  assert.equal(muestraHistorialSinco('auto'), true)
  assert.equal(muestraHistorialSinco('moto'), true)
  for (const r of ['accidentes', 'hogar', 'vida', 'salud', 'decesos', 'otros', '', null, undefined, 42]) assert.equal(muestraHistorialSinco(r), false, String(r))
})

test('la pantalla del riesgo monta HistorialRiesgo solo bajo muestraHistorialSinco', () => {
  const src = readFileSync(new URL('./RiesgoPantalla.tsx', import.meta.url), 'utf8')
  assert.match(src, /muestraHistorialSinco\(op\.ramo\) && \(\s*<SeccionPlegable id="sec-historial"/)
})
