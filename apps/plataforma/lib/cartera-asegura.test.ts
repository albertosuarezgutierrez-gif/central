import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarCartera, interpretarVencimientos } from './cartera-asegura.ts'

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

test('401/403 (secreto malo) → error con motivo secreto_rechazado', () => {
  assert.deepEqual(interpretarCartera(401, { error: 'No autorizado' }), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarCartera(403, null), { estado: 'error', motivo: 'secreto_rechazado' })
})

test('estado error del puerto → error con motivo asegura_error (su BD)', () => {
  assert.deepEqual(interpretarCartera(200, { resumen: { estado: 'error' } }), { estado: 'error', motivo: 'asegura_error' })
})

test('un contador que falta o no es número degrada a error (no se inventa un 0)', () => {
  const sinCampo = structuredClone(RESUMEN_OK) as any
  delete sinCampo.resumen.siniestrosAbiertos
  assert.deepEqual(interpretarCartera(200, sinCampo), { estado: 'error', motivo: 'respuesta_ilegible' })

  const conNull = structuredClone(RESUMEN_OK) as any
  conNull.resumen.clientes = null
  assert.deepEqual(interpretarCartera(200, conNull), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('cuerpo malformado o vacío → error', () => {
  assert.deepEqual(interpretarCartera(200, null), { estado: 'error', motivo: 'respuesta_ilegible' })
  assert.deepEqual(interpretarCartera(200, 'html de un 502'), { estado: 'error', motivo: 'respuesta_ilegible' })
  assert.deepEqual(interpretarCartera(200, {}), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('nombre ausente no rompe: ok con nombre null', () => {
  const sinNombre = structuredClone(RESUMEN_OK) as any
  delete sinNombre.correduria
  const r = interpretarCartera(200, sinNombre)
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') assert.equal(r.nombre, null)
})

// ── Vencimientos ────────────────────────────────────────────────────────────

const FILA_OK = {
  id: 'p1', cliente: 'Nombre Apellidos', tipo: 'auto', aseguradora: 'Mapfre',
  numeroPoliza: '123', fechaVencimiento: '2026-09-10', dias: 9,
  urgencia: 'prorroga_inevitable', prima: 395.09, fraccionamiento: 'anual',
}
const VENC_OK = { estado: 'ok', dias: 90, polizas: [FILA_OK] }

test('vencimientos: lista vacía con estado ok SÍ significa «no vence nada»', () => {
  const r = interpretarVencimientos(200, { estado: 'ok', dias: 90, polizas: [] })
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') assert.deepEqual(r.polizas, [])
})

test('vencimientos: «sin configurar» y el error de asegura no se confunden con lista vacía', () => {
  assert.deepEqual(interpretarVencimientos(200, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarVencimientos(200, { estado: 'error' }), { estado: 'error', motivo: 'asegura_error' })
  assert.deepEqual(interpretarVencimientos(401, {}), { estado: 'error', motivo: 'secreto_rechazado' })
})

test('vencimientos: la prima ausente llega como null, nunca como 0', () => {
  const sinPrima = { ...VENC_OK, polizas: [{ ...FILA_OK, prima: null }] }
  const r = interpretarVencimientos(200, sinPrima)
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') assert.equal(r.polizas[0].prima, null)
})

test('vencimientos: una fila con forma inesperada invalida la lista entera', () => {
  const rota = { ...VENC_OK, polizas: [FILA_OK, { ...FILA_OK, dias: 'nueve' }] }
  assert.deepEqual(interpretarVencimientos(200, rota), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('vencimientos: sin array de pólizas es error, no lista vacía', () => {
  assert.deepEqual(interpretarVencimientos(200, { estado: 'ok', dias: 90 }), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('resumen: los contadores de vencimiento son opcionales y llegan como null si faltan', () => {
  const sinVence = structuredClone(RESUMEN_OK) as any
  const r = interpretarCartera(200, sinVence)
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') {
    assert.equal(r.vence30, null)
    assert.equal(r.vence60, null)
  }
})

test('resumen: con contadores presentes se propagan tal cual', () => {
  const con = structuredClone(RESUMEN_OK) as any
  con.resumen.vence30 = 6
  con.resumen.vence60 = 8
  const r = interpretarCartera(200, con)
  if (r.estado === 'ok') {
    assert.equal(r.vence30, 6)
    assert.equal(r.vence60, 8)
  }
})
