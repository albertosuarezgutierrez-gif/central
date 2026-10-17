import test from 'node:test'
import assert from 'node:assert/strict'
import { clasificarSustitucion, enviarAvisosIndependientes, mensajeDobleSeguro, mensajeSustituciones, type SustitucionAviso } from './sustituciones-aviso.ts'

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
  assert.ok(msg?.includes('aún sin póliza nueva enlazada'))
  assert.ok(!msg?.includes('sin determinar'))
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

test('interpretarDuplicados: total y muestra; lo ilegible es error, nunca «0 duplicados»', async () => {
  const { interpretarDuplicados } = await import('../correduria-puerto.ts')
  const ok = interpretarDuplicados(200, { estado: 'ok', total: 2, muestra: [{ numero: 'A1', filas: 2, dgs: 'C0058' }, { numero: 'B2', filas: 3, dgs: null }] })
  assert.deepEqual(ok, { estado: 'ok', total: 2, muestra: [{ numero: 'A1', filas: 2, dgs: 'C0058' }, { numero: 'B2', filas: 3, dgs: null }] })
  assert.equal(interpretarDuplicados(200, { estado: 'ok', muestra: [] }).estado, 'error')
  assert.equal(interpretarDuplicados(200, { estado: 'ok', total: 1, muestra: [{ numero: 'A1' }] }).estado, 'error')
  assert.equal(interpretarDuplicados(401, null).estado, 'error')
  assert.equal(interpretarDuplicados(200, { estado: 'sin_configurar' }).estado, 'sin_configurar')
})

const pilar = (extra: Partial<SustitucionAviso> = {}): SustitucionAviso => ({
  cliente: 'Pilar Franco Ruz', diasSustituida: 19,
  polizaVieja: { aseguradora: 'Occident', numeroPoliza: 'GPAFS0900547' },
  polizaNueva: { aseguradora: 'Allianz', numeroPoliza: '61048939' },
  nuevaConfirmadaCima: false, nuevaReciboCima: true, viejaEnVigorCima: true, ...extra,
})

test('clasificarSustitucion: caso Pilar = cobrada sin ficha + vieja en vigor', () => {
  assert.deepEqual(clasificarSustitucion(pilar()), { nueva: 'cobrada_sin_ficha', vieja: 'en_vigor' })
})

test('clasificarSustitucion: sin rastro, confirmada y anulada', () => {
  assert.deepEqual(clasificarSustitucion(pilar({ nuevaReciboCima: false, viejaEnVigorCima: false })), { nueva: 'sin_rastro', vieja: 'anulada' })
  assert.deepEqual(clasificarSustitucion(pilar({ nuevaConfirmadaCima: true })).nueva, 'confirmada')
})

test('clasificarSustitucion: null NUNCA es false (ni sin_rastro ni anulada)', () => {
  const r = clasificarSustitucion({ nuevaConfirmadaCima: null, nuevaReciboCima: null, viejaEnVigorCima: null })
  assert.deepEqual(r, { nueva: 'desconocido', vieja: 'desconocido' })
  assert.equal(clasificarSustitucion({ nuevaConfirmadaCima: false, nuevaReciboCima: null, viejaEnVigorCima: undefined }).nueva, 'desconocido')
  assert.equal(clasificarSustitucion({}).vieja, 'desconocido')
})

test('mensajeSustituciones: caso Pilar destaca el doble seguro y dice el estado de la nueva', () => {
  const sinRastro = pilar({ cliente: 'Otro', polizaVieja: { aseguradora: 'Mapfre', numeroPoliza: 'M1' }, nuevaReciboCima: false, viejaEnVigorCima: false })
  const msg = mensajeSustituciones([sinRastro, pilar()])!
  assert.ok(msg.includes('Grupo ASegura'))
  assert.ok(msg.includes('⚠️ Confirma en Occident la anulación de nº GPAFS0900547'))
  assert.ok(msg.includes('Nueva: cobrada (recibo en CIMA), falta la ficha de póliza'))
  assert.ok(msg.includes('Nueva: sin rastro en CIMA'))
  assert.ok(msg.indexOf('Pilar') < msg.indexOf('Otro'), 'el doble seguro va primero')
  assert.equal(msg.split('⚠️ Confirma').length, 2, 'solo la vieja en vigor lleva el aviso')
})

test('mensajeSustituciones: campos null no inventan ni «sin rastro» ni aviso de doble seguro', () => {
  const msg = mensajeSustituciones([pilar({ nuevaConfirmadaCima: null, nuevaReciboCima: null, viejaEnVigorCima: null })])!
  assert.ok(!msg.includes('sin rastro'))
  assert.ok(!msg.includes('⚠️ Confirma'))
  assert.ok(msg.includes('sin determinar'))
})

// ── 17/10/2026: anulación confirmada por la compañía / la vieja vence cuando empieza la nueva ──
const VICTOR: SustitucionAviso = {
  cliente: 'Victor', diasSustituida: 5,
  polizaVieja: { aseguradora: 'Allianz', numeroPoliza: '031698897' }, polizaNueva: { aseguradora: 'Reale', numeroPoliza: 'R-1' },
  nuevaConfirmadaCima: false, nuevaReciboCima: true, viejaEnVigorCima: true,
}

test('anulación confirmada por la compañía → «cerrada»: sin ⚠️ aunque CIMA la dé en vigor; «falta la ficha» sigue', () => {
  assert.equal(clasificarSustitucion({ viejaEnVigorCima: true, viejaPendienteAnular: false }).vieja, 'cerrada')
  const msg = mensajeSustituciones([{ ...VICTOR, viejaPendienteAnular: false }])
  assert.ok(msg)
  assert.ok(!msg.includes('DOBLE SEGURO'))
  assert.ok(!msg.includes('⚠️'))
  assert.ok(msg.includes('falta la ficha de póliza'))
})

test('vence cuando empieza la nueva → ⚠️ «no renueva» con la fecha, pero NO cuenta como doble seguro', () => {
  const f = { ...VICTOR, viejaPendienteAnular: true, viejaAviso: 'no_renovacion' as const, viejaVence: '2026-11-01' }
  assert.equal(clasificarSustitucion(f).vieja, 'no_renueva')
  const msg = mensajeSustituciones([f])!
  assert.ok(msg.includes('⚠️ Confirma en Allianz que nº 031698897 no renueva (vence 01/11/2026)'))
  assert.ok(!msg.includes('DOBLE SEGURO'))
  assert.ok(!msg.includes('sigue en vigor'))
})

test('vence después del efecto de la nueva → como siempre: doble seguro en la cabecera y «sigue en vigor»', () => {
  const msg = mensajeSustituciones([{ ...VICTOR, viejaPendienteAnular: true, viejaAviso: 'doble_seguro', viejaVence: '2027-09-09' }])!
  assert.ok(msg.includes('(1 con posible DOBLE SEGURO)'))
  assert.ok(msg.includes('⚠️ Confirma en Allianz la anulación de nº 031698897 (sigue en vigor en CIMA)'))
})

test('clasificar: sin el dato nuevo (asegura antiguo) se usa viejaEnVigorCima, como antes; pendiente null = desconocido', () => {
  assert.equal(clasificarSustitucion({ viejaEnVigorCima: true }).vieja, 'en_vigor')
  assert.equal(clasificarSustitucion({ viejaEnVigorCima: true, viejaPendienteAnular: true }).vieja, 'en_vigor')
  assert.equal(clasificarSustitucion({ viejaEnVigorCima: true, viejaPendienteAnular: null }).vieja, 'desconocido')
  assert.equal(clasificarSustitucion({ viejaEnVigorCima: false, viejaPendienteAnular: false }).vieja, 'anulada')
})

test('interpretarSustituciones: viejaPendienteAnular ausente cae a viejaEnVigorCima; presente null se respeta; aviso y vence se leen', async () => {
  const { interpretarSustituciones } = await import('../correduria-puerto.ts')
  const fila = { clienteId: 'c', cliente: 'X', diasSustituida: 3, sustituidaAt: '2026-10-01', polizaVieja: { id: 'v', aseguradora: 'A' }, viejaEnVigorCima: true }
  const viejo = interpretarSustituciones(200, { estado: 'ok', sustituciones: [fila] })
  assert.equal(viejo.estado === 'ok' && viejo.filas[0]!.viejaPendienteAnular, true)
  const nulo = interpretarSustituciones(200, { estado: 'ok', sustituciones: [{ ...fila, viejaPendienteAnular: null }] })
  assert.equal(nulo.estado === 'ok' && nulo.filas[0]!.viejaPendienteAnular, null)
  const r = interpretarSustituciones(200, { estado: 'ok', sustituciones: [{ ...fila, viejaPendienteAnular: true, viejaAviso: 'no_renovacion', viejaVence: '2026-11-01' }] })
  assert.equal(r.estado === 'ok' && r.filas[0]!.viejaAviso, 'no_renovacion')
  assert.equal(r.estado === 'ok' && r.filas[0]!.viejaVence, '2026-11-01')
  const cerrada = interpretarSustituciones(200, { estado: 'ok', sustituciones: [{ ...fila, viejaPendienteAnular: false, viejaCierre: 'anulacion_confirmada' }] })
  assert.equal(cerrada.estado === 'ok' && cerrada.filas[0]!.viejaCierre, 'anulacion_confirmada')
})
