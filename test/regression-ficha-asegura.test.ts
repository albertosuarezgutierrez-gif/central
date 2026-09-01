import test from 'node:test'
import assert from 'node:assert/strict'
import {
  interpretarBusqueda,
  interpretarFicha,
  leerRecibos,
} from '../apps/plataforma/lib/ficha-asegura.ts'

const FICHA_OK = {
  estado: 'ok',
  ficha: {
    id: 'c1',
    nombre: 'Jose Suarez Salas',
    tipo: 'cliente',
    segmento: 'cliente',
    contacto: { telefono: '600000000', email: null, telefonoIlegible: false, emailIlegible: true, ciudad: 'Sevilla', provincia: 'Sevilla', codigoPostal: '41003' },
    polizas: [
      {
        id: 'p1', tipo: 'auto', aseguradora: 'Mapfre', numeroPoliza: 'A-1', estado: 'en_vigor',
        fechaInicio: '2025-06-01', fechaVencimiento: '2026-06-01', prima: 431.85,
        fraccionamiento: 'anual', objeto: { estado: 'conocido', titulo: '1234BCD', detalle: null, nota: null },
        matricula: '1234BCD', viva: true, retarificable: true,
        recibos: { total: 2, pendientes: 0, devueltos: 0, cobrados: 2, anulados: 0, cobradoEur: 863.7, ilegibles: 0, ultimo: null },
      },
    ],
    siniestros: [
      { id: 's1', polizaId: 'p1', estado: 'abierto', tipo: 'daños', referencia: 'R-1', fecha: '2026-02-01', reserva: null, indemnizacion: null, tramitador: null, abierto: true },
    ],
  },
}

test('una ficha completa se lee entera', () => {
  const r = interpretarFicha(200, FICHA_OK)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.ficha.nombre, 'Jose Suarez Salas')
  assert.equal(r.ficha.polizas[0].prima, 431.85)
  assert.equal(r.ficha.polizas[0].recibos?.cobradoEur, 863.7)
  assert.equal(r.ficha.siniestros[0].abierto, true)
  assert.equal(r.ficha.contacto.emailIlegible, true)
})

test('🚨 «no se ha podido mirar» y «se miró y no está» NO son lo mismo', () => {
  assert.deepEqual(interpretarFicha(404, null), { estado: 'no_encontrado' })
  assert.deepEqual(interpretarFicha(200, { estado: 'no_encontrado' }), { estado: 'no_encontrado' })
  assert.deepEqual(interpretarFicha(200, { estado: 'error' }), { estado: 'error', motivo: 'asegura_error' })
  assert.deepEqual(interpretarFicha(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarFicha(200, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarFicha(500, null), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('🚨 una prima o una reserva ausentes se quedan en null, jamás en 0', () => {
  const sinPrima = structuredClone(FICHA_OK)
  sinPrima.ficha.polizas[0].prima = null as never
  const r = interpretarFicha(200, sinPrima)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.ficha.polizas[0].prima, null)
  assert.equal(r.ficha.siniestros[0].reserva, null)
})

test('media ficha es peor que ninguna: una póliza rota invalida el conjunto', () => {
  const roto = structuredClone(FICHA_OK)
  ;(roto.ficha.polizas as unknown[])[0] = { id: 'p1', tipo: 'auto' } // sin aseguradora
  assert.deepEqual(interpretarFicha(200, roto), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('🚨 un bloque de recibos con forma rara degrada a null, NO a un resumen a ceros', () => {
  // Si esto devolviera {total:0,...} la pantalla diría «sin recibos informados»
  // sobre una póliza que sí los tiene: un «no lo sé» disfrazado de dato.
  assert.equal(leerRecibos({ total: 'dos', pendientes: 0, devueltos: 0, cobrados: 0 }), null)
  assert.equal(leerRecibos(null), null)
  assert.equal(leerRecibos(undefined), null)
  // Y una versión vieja de asegura que no manda el bloque: también null.
  const viejo = structuredClone(FICHA_OK)
  delete (viejo.ficha.polizas[0] as Record<string, unknown>).recibos
  const r = interpretarFicha(200, viejo)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.ficha.polizas[0].recibos, null)
})

test('cero recibos SÍ es un dato: total 0 se conserva tal cual', () => {
  const r = leerRecibos({ total: 0, pendientes: 0, devueltos: 0, cobrados: 0, anulados: 0, cobradoEur: null, ilegibles: 0, ultimo: null })
  assert.equal(r?.total, 0)
  assert.equal(r?.cobradoEur, null, 'sin recibos legibles el total es null, no 0,00€')
})

test('🚨 buscar poco NO es «no hay nadie»', () => {
  const corto = interpretarBusqueda(200, { estado: 'ok', termino: 'jo', buscado: false, clientes: [] })
  assert.equal(corto.estado, 'ok')
  if (corto.estado !== 'ok') return
  assert.equal(corto.buscado, false)

  const buscado = interpretarBusqueda(200, { estado: 'ok', termino: 'jose', buscado: true, clientes: [] })
  assert.equal(buscado.estado, 'ok')
  if (buscado.estado !== 'ok') return
  assert.equal(buscado.buscado, true, 'esto sí es una ausencia comprobada')
})

test('la búsqueda propaga el motivo del fallo, no un vacío', () => {
  assert.deepEqual(interpretarBusqueda(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarBusqueda(200, { estado: 'error' }), { estado: 'error', motivo: 'asegura_error' })
  assert.deepEqual(interpretarBusqueda(200, { estado: 'ok' }), { estado: 'error', motivo: 'respuesta_ilegible' })
})
