import test from 'node:test'
import assert from 'node:assert/strict'
import { enviarAvisosIndependientes, mensajeDobleSeguro, mensajeSustituciones, type SustitucionAviso } from './sustituciones-aviso.ts'

test('mensajeSustituciones: lista vacía → null, nunca un mensaje de «0 pendientes»', () => {
  assert.equal(mensajeSustituciones([]), null)
})

test('mensajeSustituciones: una fila con póliza nueva conocida', () => {
  const fila: SustitucionAviso = {
    cliente: 'Pilar Franco Ruz',
    diasSustituida: 4,
    polizaVieja: { aseguradora: 'Occident', numeroPoliza: 'GPAFS0000030' },
    polizaNueva: { aseguradora: 'Reale', numeroPoliza: 'R-123' },
  }
  const msg = mensajeSustituciones([fila])
  assert.ok(msg)
  assert.ok(msg.includes('Pilar Franco Ruz'))
  assert.ok(msg.includes('Occident nº GPAFS0000030'))
  assert.ok(msg.includes('Reale nº R-123'))
  assert.ok(msg.includes('hace 4 días'))
})

test('mensajeSustituciones: sin póliza nueva informada, se marca con «?» en vez de callarlo', () => {
  const fila: SustitucionAviso = {
    cliente: 'Cliente X', diasSustituida: 3,
    polizaVieja: { aseguradora: 'Mapfre', numeroPoliza: null }, polizaNueva: null,
  }
  const msg = mensajeSustituciones([fila])
  assert.ok(msg?.includes('→ ?'))
})

test('mensajeSustituciones: más de 20 filas, se trunca con recuento del resto', () => {
  const filas: SustitucionAviso[] = Array.from({ length: 25 }, (_, i) => ({
    cliente: `Cliente ${i}`, diasSustituida: 3,
    polizaVieja: { aseguradora: 'Mapfre', numeroPoliza: null }, polizaNueva: null,
  }))
  const msg = mensajeSustituciones(filas)
  assert.ok(msg?.includes('y 5 más'))
})

test('mensajeDobleSeguro: vacío → null; con avisos lista el texto sin datos personales', () => {
  assert.equal(mensajeDobleSeguro([]), null)
  const msg = mensajeDobleSeguro([{ texto: 'posible doble seguro: pedir anulación de GPAFS0900547 a C0468' }])
  assert.ok(msg?.includes('pedir anulación de GPAFS0900547 a C0468'))
})

test('interpretarSustituciones: dobleSeguro ausente → null (≠ []), presente se lee y lo ilegible se descarta', async () => {
  const { interpretarSustituciones } = await import('../correduria-puerto.ts')
  const base = { estado: 'ok', sustituciones: [] }
  const sin = interpretarSustituciones(200, base)
  assert.equal(sin.estado === 'ok' && sin.dobleSeguro, null)
  const vacio = interpretarSustituciones(200, { ...base, dobleSeguro: [] })
  assert.deepEqual(vacio.estado === 'ok' && vacio.dobleSeguro, [])
  const con = interpretarSustituciones(200, { ...base, dobleSeguro: [{ polizaViejaId: 'a', polizaNuevaId: 'b', texto: 't' }, { texto: 'sin ids' }, 7] })
  assert.deepEqual(con.estado === 'ok' && con.dobleSeguro, [{ polizaViejaId: 'a', polizaNuevaId: 'b', texto: 't' }])
})

test('enviarAvisosIndependientes: el fallo del primero NO impide el segundo y se agrega', async () => {
  const enviados: string[] = []
  const r = await enviarAvisosIndependientes([
    { id: 'doble', mensaje: 'a', enviar: async () => { throw new Error('tg caído') } },
    { id: 'seguimiento', mensaje: 'b', enviar: async (m) => { enviados.push(m) } },
    { id: 'vacio', mensaje: null, enviar: async () => { throw new Error('no debe llamarse') } },
  ])
  assert.deepEqual(enviados, ['b'])
  assert.equal(r.enviados, 1)
  assert.equal(r.errores.length, 1)
  assert.match(r.errores[0], /^doble: /)
})
