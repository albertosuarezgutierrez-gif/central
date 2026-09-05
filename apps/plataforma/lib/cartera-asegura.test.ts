import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarCartera, interpretarObjeto, interpretarVencimientos } from './cartera-asegura.ts'

const RESUMEN_OK = {
  correduria: { nombre: 'Grupo ASegura' },
  resumen: {
    estado: 'ok', clientes: 2742, leads: 29858, polizasVigentes: 50,
    polizasPendientesFecha: 1194, polizasNoVigentes: 27599, siniestrosAbiertos: 3,
  },
}

test('respuesta ok completa → ok con los seis números', () => {
  const r = interpretarCartera(200, RESUMEN_OK)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.nombre, 'Grupo ASegura')
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

// ── Objeto asegurado ────────────────────────────────────────────────────────

test('objeto: una versión antigua del puerto (sin el campo) da null, no una fila rota', () => {
  const r = interpretarVencimientos(200, VENC_OK)
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') assert.equal(r.polizas[0].objeto, null)
})

test('objeto: se propaga tal cual cuando el puerto lo manda bien', () => {
  const con = {
    ...VENC_OK,
    polizas: [{ ...FILA_OK, objeto: { estado: 'conocido', titulo: 'SEAT IBIZA', detalle: '1234ABC', nota: null } }],
  }
  const r = interpretarVencimientos(200, con)
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') {
    assert.equal(r.polizas[0].objeto?.titulo, 'SEAT IBIZA')
    assert.equal(r.polizas[0].objeto?.detalle, '1234ABC')
  }
})

test('objeto: «cifrado» y «no informado» NO se colapsan entre sí', () => {
  assert.equal(interpretarObjeto({ estado: 'cifrado', titulo: null, detalle: null, nota: 'x' })?.estado, 'cifrado')
  assert.equal(interpretarObjeto({ estado: 'no_informado', titulo: null, detalle: null, nota: 'x' })?.estado, 'no_informado')
})

test('objeto: una forma rara degrada a null y NO tumba la fila entera', () => {
  assert.equal(interpretarObjeto({ estado: 'inventado' }), null)
  assert.equal(interpretarObjeto('SEAT IBIZA'), null)
  assert.equal(interpretarObjeto(null), null)
  const r = interpretarVencimientos(200, { ...VENC_OK, polizas: [{ ...FILA_OK, objeto: 42 }] })
  assert.equal(r.estado, 'ok')
})

// ── Contacto en la lista de renovaciones (05/09/2026) ───────────────────────
// La tabla existe para llamar, así que el teléfono viaja con la fila. Los tres
// estados no se pueden colapsar: sin bloque = «no se ha podido mirar»; con
// bloque y todo a null = «se miró y no hay»; ilegible = «está y no se abre».

test('vencimientos: sin bloque de contacto llega null, NUNCA un contacto a ceros', () => {
  const r = interpretarVencimientos(200, VENC_OK)
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') assert.equal(r.polizas[0].contacto, null)
})

test('vencimientos: un contacto vacío SÍ afirma que no hay teléfono ni email', () => {
  const con = {
    ...VENC_OK,
    polizas: [{ ...FILA_OK, contacto: { telefono: null, telefonoIlegible: false, email: null, emailIlegible: false } }],
  }
  const r = interpretarVencimientos(200, con)
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') {
    assert.deepEqual(r.polizas[0].contacto, {
      telefono: null, telefonoIlegible: false, email: null, emailIlegible: false,
    })
  }
})

test('vencimientos: el teléfono cifrado no se confunde con no tenerlo', () => {
  const con = {
    ...VENC_OK,
    polizas: [{ ...FILA_OK, contacto: { telefono: null, telefonoIlegible: true, email: 'a@b.es', emailIlegible: false } }],
  }
  const r = interpretarVencimientos(200, con)
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') {
    assert.equal(r.polizas[0].contacto?.telefonoIlegible, true)
    assert.equal(r.polizas[0].contacto?.email, 'a@b.es')
  }
})

test('vencimientos: un contacto con forma rara degrada a null y NO tumba la lista', () => {
  const r = interpretarVencimientos(200, { ...VENC_OK, polizas: [{ ...FILA_OK, contacto: 'jose@ejemplo.es' }] })
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') assert.equal(r.polizas[0].contacto, null)
})
