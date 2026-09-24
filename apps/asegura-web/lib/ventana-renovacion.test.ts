import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { calcularVentana, ramoTieneVentana, POS } from './ventana-renovacion.ts'

const HOY = new Date(Date.UTC(2026, 8, 24)) // 24/09/2026
const iso = (d: Date) => d.toISOString().slice(0, 10)

test('los dos plazos del art. 22: compañía a 60 días, tomador a 30', () => {
  const v = calcularVentana('2027-03-01', HOY)!
  assert.equal(iso(v.avisoCompania), '2026-12-31')
  assert.equal(iso(v.limite), '2027-01-30')
  assert.equal(v.fase, 'antes')
  assert.equal(v.avanzada, false)
})

test('fases: antes, dentro de la ventana y tarde', () => {
  assert.equal(calcularVentana('2026-12-31', HOY)!.fase, 'antes') // ventana empieza el 01/11
  assert.equal(calcularVentana('2026-11-23', HOY)!.fase, 'ventana') // 60 días justos: hoy es el primer día
  assert.equal(calcularVentana('2026-10-24', HOY)!.fase, 'ventana') // hoy es el último día para oponerse
  assert.equal(calcularVentana('2026-10-23', HOY)!.fase, 'tarde')
})

test('una fecha pasada se lleva a su próximo aniversario', () => {
  const v = calcularVentana('2019-05-10', HOY)!
  assert.equal(iso(v.vence), '2027-05-10')
  assert.equal(v.avanzada, true)
  const hoyMismo = calcularVentana('2020-09-24', HOY)!
  assert.equal(iso(hoyMismo.vence), '2026-09-24')
  assert.equal(hoyMismo.fase, 'tarde')
})

test('29 de febrero en año no bisiesto cae al 28', () => {
  assert.equal(iso(calcularVentana('2024-02-29', HOY)!.vence), '2027-02-28')
})

test('fecha inválida → null, no una ventana inventada', () => {
  assert.equal(calcularVentana('', HOY), null)
  assert.equal(calcularVentana('2026-02-31', HOY), null)
})

test('posición de hoy en la barra', () => {
  assert.equal(calcularVentana('2027-06-01', HOY)!.posHoy, null) // fuera del tramo de 90 días
  assert.equal(calcularVentana('2026-12-23', HOY)!.posHoy, 0) // 90 días justos
  assert.equal(calcularVentana('2026-09-24', HOY)!.posHoy, 100)
  assert.ok(POS.avisoCompania < POS.limite)
})

test('vida y salud no pintan la ventana; los ramos de daños sí', () => {
  assert.equal(ramoTieneVentana('vida-y-salud'), false)
  for (const s of ['auto', 'hogar', 'comercio', 'comunidades']) assert.equal(ramoTieneVentana(s), true)
})

test('la página de ramo monta el widget con el ramo como origen medido', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'app', 'seguros', '[ramo]', 'page.tsx'), 'utf8')
  assert.match(src, /<VentanaRenovacion\b/)
  assert.match(src, /ramoTieneVentana\(ramo\.slug\)/)
  const comp = readFileSync(join(import.meta.dirname, '..', 'components', 'VentanaRenovacion.tsx'), 'utf8')
  assert.match(comp, /origen=\{`ramo_ventana_\$\{ramo\}`\}/)
  assert.match(comp, /medir\('ventana_calculo'/)
})
