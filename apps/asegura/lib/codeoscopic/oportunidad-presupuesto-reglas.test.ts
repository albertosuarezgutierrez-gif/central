import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { estadoTrasPresupuesto, fuenteDePresupuesto, oportunidadDelPrecioReal, ramoDeOportunidad } from './oportunidad-presupuesto-reglas.ts'

test('con un precio en la mano, «por contactar» pasa a «interesado»; lo demás se respeta', () => {
  assert.equal(estadoTrasPresupuesto('competencia'), 'en_negociacion')
  assert.equal(estadoTrasPresupuesto('en_negociacion'), 'en_negociacion')
  assert.equal(estadoTrasPresupuesto('pendiente_cliente'), 'pendiente_cliente')
})

test('el ramo del presupuesto solo vale si es un ramo de oportunidad: no se inventa', () => {
  assert.equal(ramoDeOportunidad('hogar'), 'hogar')
  assert.equal(ramoDeOportunidad('auto'), 'auto')
  assert.equal(ramoDeOportunidad('barco'), null)
  assert.equal(ramoDeOportunidad(undefined), null)
})

test('retarificar una póliza propia nace como renovación; sin póliza, venta directa', () => {
  assert.equal(fuenteDePresupuesto('00000000-0000-0000-0000-000000000001'), 'renovacion')
  assert.equal(fuenteDePresupuesto(null), 'venta_directa')
})

// 💶 F4 (19/10/2026): el hilo del lead solo pasa a «tarificada» con un precio REAL colgado de su oportunidad.
const OPR = '33333333-3333-4333-8333-333333333333'
test('precio real enlazado → su oportunidad', () => {
  assert.equal(oportunidadDelPrecioReal(false, { estado: 'enlazada', oportunidadId: OPR }), OPR)
})
test('precio real que abrió oportunidad → también', () => {
  assert.equal(oportunidadDelPrecioReal(false, { estado: 'creada', oportunidadId: OPR }), OPR)
})
test('precio SIMULADO → ninguna (no mueve el hilo)', () => {
  assert.equal(oportunidadDelPrecioReal(true, { estado: 'enlazada', oportunidadId: OPR }), null)
})
test('precio no enlazado → ninguna', () => {
  assert.equal(oportunidadDelPrecioReal(false, { estado: 'no_enlazada', oportunidadId: OPR }), null)
})
test('sin enlace → ninguna', () => {
  assert.equal(oportunidadDelPrecioReal(false, undefined), null)
})
test('🪤 cotizar() mueve el hilo SOLO tras enlazar y con oportunidadDelPrecioReal (lee el fuente)', () => {
  const src = readFileSync(new URL('./cotizar.ts', import.meta.url), 'utf8')
  const enl = src.indexOf('g.oportunidad = await enlazar(')
  const gancho = src.indexOf('const opPrecio = oportunidadDelPrecioReal(extra.simulado, g.oportunidad)')
  assert.ok(enl > 0 && gancho > enl, 'el gancho va después de enlazar')
  assert.match(src, /if \(hilo && opPrecio\) await hilo\(p\.correduriaId, opPrecio\)\.catch\(\(\) => \{\}\)/)
})
