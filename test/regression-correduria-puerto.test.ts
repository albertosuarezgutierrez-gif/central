import test from 'node:test'
import assert from 'node:assert/strict'
import {
  interpretarBusqueda,
  interpretarImpagados,
  interpretarLineas,
} from '../apps/plataforma/lib/correduria-puerto.ts'

// ── Buscador ────────────────────────────────────────────────────────────────

const BUSQUEDA_OK = {
  estado: 'ok',
  termino: '1234BCD',
  buscable: true,
  distintos: 1,
  avisos: [],
  bloques: [
    {
      tipo: 'matricula',
      valor: '1234BCD',
      explicacion: 'Solo 4.504 de 28.838 pólizas…',
      cobertura: { alcanzables: 4504, total: 28838 },
      hallazgos: [
        { clienteId: 'c1', nombre: 'Jose Suarez Salas', tipo: 'cliente', polizas: 3, porque: 'matrícula 1234BCD' },
      ],
    },
  ],
}

test('una búsqueda con resultados se lee entera, con su cobertura', () => {
  const r = interpretarBusqueda(200, BUSQUEDA_OK)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.bloques[0].hallazgos[0].nombre, 'Jose Suarez Salas')
  assert.deepEqual(r.bloques[0].cobertura, { alcanzables: 4504, total: 28838 })
})

test('🚨 una cobertura a medias NO se completa con ceros', () => {
  // {alcanzables: 0, total: 0} diría «no alcanza a nadie», que es una
  // afirmación. Si falta cualquiera de los dos, la cobertura es desconocida.
  const roto = structuredClone(BUSQUEDA_OK)
  ;(roto.bloques[0] as Record<string, unknown>).cobertura = { alcanzables: 4504 }
  const r = interpretarBusqueda(200, roto)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.bloques[0].cobertura, null)
})

test('🚨 «no se ha buscado» no es «no hay resultados»', () => {
  const corto = interpretarBusqueda(200, { estado: 'ok', termino: 'jo', buscable: false, bloques: [], distintos: 0 })
  assert.equal(corto.estado, 'ok')
  if (corto.estado !== 'ok') return
  assert.equal(corto.buscable, false)
})

test('el fallo del puerto propaga su motivo, no un vacío', () => {
  assert.deepEqual(interpretarBusqueda(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarBusqueda(200, { estado: 'error' }), { estado: 'error', motivo: 'asegura_error' })
  assert.deepEqual(interpretarBusqueda(200, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarBusqueda(500, null), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('los avisos sin texto se descartan, no se pintan vacíos', () => {
  const con = interpretarBusqueda(200, {
    ...BUSQUEDA_OK,
    avisos: [{ tema: 'direccion', texto: 'va cifrada' }, { tema: 'x' }, null],
  })
  assert.equal(con.estado, 'ok')
  if (con.estado !== 'ok') return
  assert.equal(con.avisos.length, 1)
})

// ── Cola de retención ───────────────────────────────────────────────────────

const FILA = {
  polizaId: 'p1',
  clienteId: 'c1',
  cliente: 'Jose Suarez Salas',
  telefono: '600000000',
  telefonoIlegible: false,
  tipo: 'auto',
  aseguradora: 'Mapfre',
  numeroPoliza: 'A-1',
  matricula: '1234BCD',
  prima: 431.85,
  importeRecibo: 107.96,
  fechaRecibo: '2026-06-01',
  estado: 'suspendida',
  dias: 92,
  diasParaExtincion: 88,
  accion: 'Llama hoy…',
  retarificable: true,
}

const IMPAGADOS_OK = {
  estado: 'ok',
  filas: [FILA],
  resumen: { suspendidas: 1, enPlazo: 0, extinguidas: 0, sinFecha: 0, primaEnRiesgo: 431.85, sinPrima: 0 },
  sinRecibosInformados: 18,
  pendientesSinJuzgar: 4,
}

test('la cola se lee entera con sus dos huecos declarados', () => {
  const r = interpretarImpagados(200, IMPAGADOS_OK)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.filas[0].estado, 'suspendida')
  assert.equal(r.sinRecibosInformados, 18)
  assert.equal(r.pendientesSinJuzgar, 4)
})

test('🚨 un estado de retención desconocido invalida la lista entera', () => {
  // Pintarlo como «en plazo» diría que aún hay margen sobre una póliza que
  // quizá ya no lo tiene — el error exacto que esta pantalla evita.
  const roto = structuredClone(IMPAGADOS_OK)
  ;(roto.filas[0] as Record<string, unknown>).estado = 'lo_que_sea'
  assert.deepEqual(interpretarImpagados(200, roto), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('🚨 un importe o una prima ausentes se quedan en null, nunca en 0', () => {
  const sin = structuredClone(IMPAGADOS_OK)
  sin.filas[0].prima = null as never
  sin.filas[0].importeRecibo = null as never
  sin.resumen.primaEnRiesgo = null as never
  const r = interpretarImpagados(200, sin)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.filas[0].prima, null)
  assert.equal(r.filas[0].importeRecibo, null)
  assert.equal(r.resumen.primaEnRiesgo, null, 'sin ninguna prima el riesgo es «no se sabe»')
})

test('🚨 si asegura no manda los huecos, se marcan como desconocidos (-1), no como 0', () => {
  // Un 0 aquí diría «ninguna póliza está sin recibos», que es lo tranquilizador
  // y lo falso: es que esa versión de asegura todavía no lo informa.
  const viejo = structuredClone(IMPAGADOS_OK) as Record<string, unknown>
  delete viejo.sinRecibosInformados
  delete viejo.pendientesSinJuzgar
  const r = interpretarImpagados(200, viejo)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.sinRecibosInformados, -1)
  assert.equal(r.pendientesSinJuzgar, -1)
})

test('una cola vacía con estado ok SÍ significa que no hay nadie a quien llamar', () => {
  const r = interpretarImpagados(200, { estado: 'ok', filas: [], resumen: {}, sinRecibosInformados: 0, pendientesSinJuzgar: 0 })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.filas.length, 0)
  assert.equal(r.resumen.primaEnRiesgo, null)
})

test('el fallo de la cola propaga su motivo', () => {
  assert.deepEqual(interpretarImpagados(403, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarImpagados(200, { estado: 'error' }), { estado: 'error', motivo: 'asegura_error' })
  assert.deepEqual(interpretarImpagados(200, { estado: 'ok' }), { estado: 'error', motivo: 'respuesta_ilegible' })
})

// ── Ramos de Codeoscopic (¿tarifica hogar?) ─────────────────────────────────

test('hogar disponible llega con el id exacto del vendor', () => {
  const r = interpretarLineas(200, {
    estado: 'ok',
    lineas: [{ id: 'Car', nombre: 'Auto' }, { id: 'Home', nombre: 'Hogar' }],
    hogar: { estado: 'disponible', id: 'Home', nombre: 'Hogar' },
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.ramos, ['Auto', 'Hogar'])
  assert.deepEqual(r.hogar, { estado: 'disponible', id: 'Home', nombre: 'Hogar' })
})

test('🚨 un hogar «disponible» sin id NO se cree: pasa a desconocido', () => {
  const r = interpretarLineas(200, { estado: 'ok', lineas: [], hogar: { estado: 'disponible' } })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.hogar, { estado: 'desconocido' })
})

test('sin configurar, secreto rechazado y error no se confunden entre sí', () => {
  assert.deepEqual(interpretarLineas(200, { estado: 'sin_configurar', mensaje: 'faltan X' }), {
    estado: 'sin_configurar',
    mensaje: 'faltan X',
  })
  assert.deepEqual(interpretarLineas(401, null), { estado: 'error', motivo: 'secreto' })
  assert.deepEqual(interpretarLineas(502, { estado: 'error', mensaje: 'host caído' }), {
    estado: 'error',
    motivo: 'host caído',
  })
})
