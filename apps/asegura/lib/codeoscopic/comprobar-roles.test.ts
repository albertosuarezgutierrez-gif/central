import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { comprobarRolesRamo, unirFaltanConRoles, type LectorRoles } from './comprobar-roles.ts'
import type { ConfigCodeoscopic } from './config.ts'

const CFG = {} as ConfigCodeoscopic
const campo = (id: string, required = true) => ({ id, required })
const rolesDe = (ids: string[], tomador: string[] = []) => [
  { id: 'holder', path: 'holder', fields: tomador.map((i) => campo(i)) },
  { id: 'insured', path: 'risk.insured', max: 3, fields: ids.map((i) => campo(i)) },
]
const lector = (crudo: unknown): LectorRoles => async () => crudo
const TITULAR = { dni: '00000000T', nombre: 'N', apellido1: 'A', fechaNacimiento: '1985-01-01', sexo: 'hombre', estadoCivil: 'Single', telefono: '600000000' }

test('devuelve como faltan los obligatorios del asegurado que no tenemos', async () => {
  const r = await comprobarRolesRamo(CFG, 'vida', { datos: TITULAR }, lector(rolesDe(['identification', 'smoker', 'economicOccupation'])))
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.faltan.map((f) => f.campo), ['fumador', 'profesion'])
})

test('con todo lo exigido a la vista no falta nada', async () => {
  const r = await comprobarRolesRamo(CFG, 'vida', { datos: { ...TITULAR, fumador: false, profesion: '2612' } }, lector(rolesDe(['identification', 'smoker', 'economicOccupation'], ['phone'])))
  assert.deepEqual(r, { estado: 'ok', faltan: [] })
})

test('el titular es tomador Y asegurado: se le exige la unión de los dos roles', async () => {
  const r = await comprobarRolesRamo(CFG, 'salud', { datos: TITULAR }, lector(rolesDe(['birthDate'], ['email'])))
  assert.ok(r.estado === 'ok' && r.faltan.some((f) => f.campo === 'email'))
})

test('🔒 FAIL-CLOSED: si person-roles lanza, no se cotiza y se avisa', async () => {
  for (const ramo of ['vida', 'salud', 'decesos'] as const) {
    const r = await comprobarRolesRamo(CFG, ramo, { datos: TITULAR }, async () => { throw new Error('codeoscopic_servidor: 500') })
    assert.equal(r.estado, 'no_disponible', ramo)
    if (r.estado === 'no_disponible') assert.match(r.motivo, /no se cotiza[\s\S]*|500/)
  }
})

test('🔒 FAIL-CLOSED: una respuesta ilegible tampoco autoriza a cotizar', async () => {
  for (const crudo of [null, {}, [], 'html', [{ id: 'holder', fields: [] }]]) {
    const r = await comprobarRolesRamo(CFG, 'decesos', { datos: TITULAR }, lector(crudo))
    assert.equal(r.estado, 'no_disponible', JSON.stringify(crudo))
  }
})

test('asegurados adicionales: se les exige lo del rol del asegurado y el máximo del vendor', async () => {
  const adicional = { dni: '', nombre: 'N', apellido1: 'A', fechaNacimiento: '2010-01-01', sexo: 'mujer' }
  const r = await comprobarRolesRamo(CFG, 'salud', { datos: TITULAR, adicionales: [adicional] }, lector(rolesDe(['identification', 'weight'])))
  assert.ok(r.estado === 'ok')
  if (r.estado !== 'ok') return
  const msgs = r.faltan.filter((f) => f.campo === 'aseguradosAdicionales').map((f) => f.motivo)
  assert.ok(msgs.some((m) => /asegurado adicional 1: dni/.test(m)), msgs.join('|'))
  assert.ok(msgs.some((m) => /asegurado adicional 1: weight — dato que falta: weight/.test(m)), msgs.join('|'))

  const cuatro = await comprobarRolesRamo(CFG, 'salud', { datos: TITULAR, adicionales: [adicional, adicional, adicional] }, lector(rolesDe([])))
  assert.ok(cuatro.estado === 'ok' && cuatro.faltan.some((f) => /máximo 3 asegurados/.test(f.motivo)))
})

test('unirFaltanConRoles: sin duplicar y, si no hay roles, un hueco bloqueante «person-roles»', () => {
  const propios = [{ campo: 'estadoCivil', motivo: 'hace falta' }]
  const ok = unirFaltanConRoles(propios, { estado: 'ok', faltan: [{ campo: 'estadoCivil', motivo: 'otra' }, { campo: 'fumador', motivo: 'x' }] })
  assert.deepEqual(ok.map((f) => f.campo), ['estadoCivil', 'fumador'])
  assert.equal(ok[0].motivo, 'hace falta')
  const caido = unirFaltanConRoles(propios, { estado: 'no_disponible', motivo: 'no se pudo' })
  assert.deepEqual(caido.map((f) => f.campo), ['estadoCivil', 'person-roles'])
})

// ─── Cableado: los DOS caminos consultan person-roles ANTES de gastar ────────
// precalificar (gratis, enseña lo que falta) y la ruta de pago (corta en 422/503). Si alguien quita la
// llamada de uno de ellos, el ramo vuelve a pedir precio con un mínimo adivinado.
const leer = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

test('🎯 cada precalificar-*-nuevo consulta person-roles de SU ramo y une los huecos', () => {
  for (const ramo of ['vida', 'salud', 'decesos']) {
    const src = leer(`../../app/api/operador/codeoscopic/precalificar-${ramo}-nuevo/route.ts`)
    assert.match(src, new RegExp(`comprobarRolesRamo\\(cfg, '${ramo}'`), ramo)
    assert.match(src, /unirFaltanConRoles\(pre\.faltan, roles\)/, ramo)
  }
})

test('🎯 la ruta de pago (vida/salud/decesos-nuevo) pasa por comprobarRolesRamo y corta ANTES de construir la petición', () => {
  const src = leer('../retarificar-cartera.ts')
  const i = src.indexOf('await comprobarRolesRamo(cfg.config, ramo')
  const j = src.indexOf('peticion = construir(datos, linea.id)')
  assert.ok(i > 0 && j > i, 'la comprobación de roles tiene que ir antes de construir')
  assert.match(src.slice(i, j), /no_disponible[\s\S]*503/)
})

test('unirFaltanConRoles conserva un hueco por cada asegurado adicional', () => {
  const r = unirFaltanConRoles([], {
    estado: 'ok',
    faltan: [
      { campo: 'aseguradosAdicionales', motivo: 'asegurado adicional 1: sexo — falta' },
      { campo: 'aseguradosAdicionales', motivo: 'asegurado adicional 2: sexo — falta' },
    ],
  })
  assert.equal(r.filter((f) => f.campo === 'aseguradosAdicionales').length, 2)
})
