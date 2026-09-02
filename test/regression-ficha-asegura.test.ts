import test from 'node:test'
import assert from 'node:assert/strict'
import {
  interpretarBusqueda,
  interpretarFicha,
  leerRecibos,
  leerRetarificacion,
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

// ── Intervinientes (02/09/2026) ─────────────────────────────────────────────
// Esquiansa (empresa) «sin teléfono»: el número está en su conductor habitual.

test('los intervinientes se leen y una fila rara se salta sin tumbar la ficha', () => {
  const r = interpretarFicha(200, {
    ...FICHA_OK,
    ficha: {
      ...FICHA_OK.ficha,
      intervinientes: [
        { polizaId: 'p1', rol: 'conductor_habitual', nombre: 'Juan Manuel Lopez Benjumea', telefono: '600', fichaId: 'f2', esTomador: false, origen: 'cima' },
        { rol: 'propietario' }, // sin polizaId: se salta
        'basura',
      ],
    },
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.ficha.intervinientes?.length, 1)
  assert.equal(r.ficha.intervinientes?.[0].telefono, '600')
  assert.equal(r.ficha.intervinientes?.[0].fichaId, 'f2')
})

test('🚨 sin bloque de intervinientes → null, NO lista vacía', () => {
  // `[]` diría «no hay nadie más a quien llamar»; `null` dice «asegura no lo informa».
  const r = interpretarFicha(200, FICHA_OK)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.ficha.intervinientes, null)
  const vacio = interpretarFicha(200, { ...FICHA_OK, ficha: { ...FICHA_OK.ficha, intervinientes: [] } })
  assert.equal(vacio.estado, 'ok')
  if (vacio.estado !== 'ok') return
  assert.deepEqual(vacio.ficha.intervinientes, [])
})

// ── Forma de pago (02/09/2026) ──────────────────────────────────────────────

test('el bloque de pago se lee, y un recargo con forma rara degrada a sin_datos', () => {
  const con = interpretarFicha(200, {
    ...FICHA_OK,
    ficha: { ...FICHA_OK.ficha, polizas: [{ ...FICHA_OK.ficha.polizas[0], pago: { fraccionamiento: 'semestral', formaCobro: 'domiciliado', recargo: { estado: 'calculado', primaAnual: 400, sumaRecibos: 420, recargoEur: 20, recargoPct: 5, recibos: 2 } } }] },
  })
  assert.equal(con.estado, 'ok')
  if (con.estado !== 'ok') return
  assert.equal(con.ficha.polizas[0].pago?.recargo.estado, 'calculado')
  const raro = interpretarFicha(200, {
    ...FICHA_OK,
    ficha: { ...FICHA_OK.ficha, polizas: [{ ...FICHA_OK.ficha.polizas[0], pago: { fraccionamiento: 'semestral', recargo: { estado: 'calculado', recargoEur: 'veinte' } } }] },
  })
  assert.equal(raro.estado, 'ok')
  if (raro.estado !== 'ok') return
  assert.equal(raro.ficha.polizas[0].pago?.recargo.estado, 'sin_datos')
})

test('🚨 sin bloque de pago → null, no «anual» ni «0€ de recargo»', () => {
  const r = interpretarFicha(200, FICHA_OK)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.ficha.polizas[0].pago, null)
})

// ── Retarificación por ramo (02/09/2026: AUTO → AUTO+HOGAR) ─────────────────

test('🚨 sin el campo `retarificacion` → null, NO un veredicto a falso inventado', () => {
  // Una versión desplegada más vieja de asegura no lo manda: la pantalla cae
  // al booleano `retarificable` de siempre, no a «no se puede».
  const r = interpretarFicha(200, FICHA_OK)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.ficha.polizas[0].retarificacion, null)
  assert.equal(r.ficha.polizas[0].retarificable, true, 'el booleano de siempre se conserva')
})

test('el veredicto de hogar se lee entero (ramo, motivo y fuente)', () => {
  const r = interpretarFicha(200, {
    ...FICHA_OK,
    ficha: {
      ...FICHA_OK.ficha,
      polizas: [{ ...FICHA_OK.ficha.polizas[0], tipo: 'hogar', retarificacion: { ramo: 'hogar', retarificable: true, motivo: null, fuente: 'gemela' } }],
    },
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.ficha.polizas[0].retarificacion, { ramo: 'hogar', retarificable: true, motivo: null, fuente: 'gemela' })
  const no = leerRetarificacion({ ramo: null, retarificable: false, motivo: 'Faltan datos del riesgo para tarificar hogar (m², CP).', fuente: null })
  assert.equal(no?.retarificable, false)
  assert.equal(no?.motivo, 'Faltan datos del riesgo para tarificar hogar (m², CP).')
})

test('🚨 un veredicto con basura degrada a null, nunca a un objeto a medias', () => {
  assert.equal(leerRetarificacion('sí'), null)
  assert.equal(leerRetarificacion({ ramo: 'vida', retarificable: true, motivo: null, fuente: 'poliza' }), null)
  assert.equal(leerRetarificacion({ ramo: 'auto', retarificable: 'true', motivo: null, fuente: 'poliza' }), null)
  assert.equal(leerRetarificacion({ ramo: 'auto', retarificable: true, motivo: null, fuente: 'catastro' }), null)
  assert.equal(leerRetarificacion({ ramo: 'auto', retarificable: true, motivo: 42, fuente: 'poliza' }), null)
  assert.equal(leerRetarificacion({}), null)
  const r = interpretarFicha(200, {
    ...FICHA_OK,
    ficha: { ...FICHA_OK.ficha, polizas: [{ ...FICHA_OK.ficha.polizas[0], retarificacion: 'basura' }] },
  })
  assert.equal(r.estado, 'ok', 'la basura en este campo no tumba la ficha: es un extra, no el contrato')
  if (r.estado !== 'ok') return
  assert.equal(r.ficha.polizas[0].retarificacion, null)
})
