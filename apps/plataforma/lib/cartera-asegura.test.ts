import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarCartera } from './cartera-asegura.ts'

const RESUMEN_OK = {
  correduria: { nombre: 'Grupo Asegura' },
  resumen: {
    estado: 'ok', clientes: 2742, leads: 29858, polizasVigentes: 50,
    polizasPendientesFecha: 1194, polizasNoVigentes: 27599, siniestrosAbiertos: 3,
  },
}

test('respuesta ok completa → ok con los seis números', () => {
  const r = interpretarCartera(200, RESUMEN_OK)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.nombre, 'Grupo Asegura')
  assert.equal(r.polizasVigentes, 50)
  assert.equal(r.polizasPendientesFecha, 1194)
})

test('sin_configurar del puerto se conserva (no es cartera vacía)', () => {
  assert.deepEqual(interpretarCartera(200, { resumen: { estado: 'sin_configurar' } }), { estado: 'sin_configurar' })
})

test('401 (secreto malo) → error visible, nunca ceros', () => {
  assert.deepEqual(interpretarCartera(401, { error: 'No autorizado' }), { estado: 'error' })
})

test('estado error del puerto → error', () => {
  assert.deepEqual(interpretarCartera(200, { resumen: { estado: 'error' } }), { estado: 'error' })
})

test('un contador que falta o no es número degrada a error (no se inventa un 0)', () => {
  const sinCampo = structuredClone(RESUMEN_OK) as any
  delete sinCampo.resumen.siniestrosAbiertos
  assert.deepEqual(interpretarCartera(200, sinCampo), { estado: 'error' })

  const conNull = structuredClone(RESUMEN_OK) as any
  conNull.resumen.clientes = null
  assert.deepEqual(interpretarCartera(200, conNull), { estado: 'error' })
})

test('cuerpo malformado o vacío → error', () => {
  assert.deepEqual(interpretarCartera(200, null), { estado: 'error' })
  assert.deepEqual(interpretarCartera(200, 'html de un 502'), { estado: 'error' })
  assert.deepEqual(interpretarCartera(200, {}), { estado: 'error' })
})

test('nombre ausente no rompe: ok con nombre null', () => {
  const sinNombre = structuredClone(RESUMEN_OK) as any
  delete sinNombre.correduria
  const r = interpretarCartera(200, sinNombre)
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') assert.equal(r.nombre, null)
})
