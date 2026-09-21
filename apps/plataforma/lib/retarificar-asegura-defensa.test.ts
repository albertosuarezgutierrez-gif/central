import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defensaDeCartera } from '@central/module-seguros'
import {
  catalogoParaDefensa,
  interpretarPrecalificacion,
  interpretarTarificacionGuardada,
  leerCarteraCompanias,
  polizasParaDefensa,
} from './retarificar-asegura.ts'

// Los cepos de la defensa de cartera en el lado de plataforma. El más caro de
// todos es el primero: que un `carteraCompanias` que NO ha llegado no se lea
// jamás como «este cliente no está en ninguna compañía».

/** Una precalificación de auto como la que manda el puerto, sin el bloque nuevo. */
const PRE_SIN_BLOQUE = {
  estado: 'ok',
  ramo: 'auto',
  precalificado: true,
  motivo: null,
  vehiculo: { marca: 'FORD', modelo: 'TOURNEO COURIER', versiones: [] },
  faltan: [],
  supuestos: [],
  fechaMatriculacion: '2018-03-01',
  notaMatricula: null,
  municipios: [{ id: '41091', nombre: 'Sevilla' }],
  municipiosMotivo: null,
  estadoCivil: { id: '1', nombre: 'Casado' },
  estadoCivilMotivo: null,
  tiposVia: null,
  tipoVia: null,
  tipoViaMotivo: null,
  consumo: { veredicto: { permitido: true }, gastadoMes: '3,00€' },
  simulacion: false,
  gastado: '0,00€',
}

const CATALOGO = [
  { codigoDgs: 'C0058', nombreComun: 'Mapfre', nombreCima: 'Mapfre' },
  { codigoDgs: 'C0109', nombreComun: 'Allianz', nombreCima: 'Allianz' },
]

const POLIZA_MAPFRE_VIVA = {
  id: 'p-1',
  codigoEntidadDgs: 'C0058',
  aseguradora: 'Mapfre',
  estado: 'activa',
  viva: true,
  ramo: 'auto',
  numeroPoliza: '3021700291186',
}

// ─── El cepo caro: campo ausente ≠ lista vacía ───────────────────────────────

test('asegura sin desplegar (campo ausente) → no_disponible, y la defensa sale «desconocida», no «libre»', () => {
  const r = interpretarPrecalificacion(200, PRE_SIN_BLOQUE)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return

  assert.equal(r.pre.carteraCompanias.estado, 'no_disponible')
  // Lo que se le pasa al módulo es `null`, NUNCA `[]`.
  assert.equal(polizasParaDefensa(r.pre.carteraCompanias), null)

  const d = defensaDeCartera({
    compania: 'Mapfre',
    catalogo: catalogoParaDefensa(r.pre.carteraCompanias),
    polizas: polizasParaDefensa(r.pre.carteraCompanias),
  })
  assert.equal(d.estado, 'desconocida')
  assert.match(d.motivo, /no se han podido leer las pólizas/i)
})

test('mirado y sin ninguna póliza (lista vacía de verdad) SÍ es «libre»: los dos casos no se confunden', () => {
  const r = interpretarPrecalificacion(200, {
    ...PRE_SIN_BLOQUE,
    carteraCompanias: { estado: 'ok', polizas: [], catalogo: CATALOGO, polizaActualId: null },
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(polizasParaDefensa(r.pre.carteraCompanias), [])

  const d = defensaDeCartera({
    compania: 'Mapfre',
    catalogo: catalogoParaDefensa(r.pre.carteraCompanias),
    polizas: polizasParaDefensa(r.pre.carteraCompanias),
  })
  assert.equal(d.estado, 'libre')
})

// ─── El camino completo: una compañía ocupada se marca ───────────────────────

test('con una póliza viva en Mapfre, el precio de Mapfre sale «ocupada» y el de Allianz «libre»', () => {
  const r = interpretarPrecalificacion(200, {
    ...PRE_SIN_BLOQUE,
    carteraCompanias: {
      estado: 'ok',
      polizas: [POLIZA_MAPFRE_VIVA],
      catalogo: CATALOGO,
      polizaActualId: null,
    },
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return

  const entrada = {
    catalogo: catalogoParaDefensa(r.pre.carteraCompanias),
    polizas: polizasParaDefensa(r.pre.carteraCompanias),
  }
  const mapfre = defensaDeCartera({ ...entrada, compania: 'Mapfre' })
  assert.equal(mapfre.estado, 'ocupada')
  assert.equal(mapfre.coincidencia, 'dgs')
  assert.equal(defensaDeCartera({ ...entrada, compania: 'Allianz' }).estado, 'libre')
})

test('la póliza que se está retarificando es «actual», no «ocupada»: se emparejó por su id', () => {
  const c = leerCarteraCompanias({
    estado: 'ok',
    polizas: [POLIZA_MAPFRE_VIVA],
    catalogo: CATALOGO,
    polizaActualId: 'p-1',
  })
  assert.equal(c.estado, 'ok')
  if (c.estado !== 'ok') return
  assert.equal(c.polizaActualId, 'p-1')

  const d = defensaDeCartera({
    compania: 'Mapfre',
    catalogo: c.catalogo,
    polizas: c.polizas,
    polizaActualId: c.polizaActualId,
  })
  assert.equal(d.estado, 'actual')
})

// ─── Lo que llega roto no se descarta en silencio ────────────────────────────

test('una póliza ilegible tumba la lista entera: media lista diría «libre» sobre una compañía ocupada', () => {
  const c = leerCarteraCompanias({
    estado: 'ok',
    polizas: [POLIZA_MAPFRE_VIVA, { id: 'p-2', aseguradora: 'Allianz' }], // sin `viva`
    catalogo: CATALOGO,
    polizaActualId: null,
  })
  assert.equal(c.estado, 'no_disponible')
  if (c.estado !== 'no_disponible') return
  assert.match(c.porque, /ilegible/i)
})

test('el no_disponible que manda asegura conserva su motivo (se arregla en otro sitio que un campo ausente)', () => {
  const c = leerCarteraCompanias({ estado: 'no_disponible', porque: 'no se ha podido leer el catálogo.' })
  assert.equal(c.estado, 'no_disponible')
  if (c.estado !== 'no_disponible') return
  assert.equal(c.porque, 'no se ha podido leer el catálogo.')
})

test('una fila ilegible del CATÁLOGO se salta (solo resta capacidad de resolver nombres, no afirma nada)', () => {
  const c = leerCarteraCompanias({
    estado: 'ok',
    polizas: [],
    catalogo: [...CATALOGO, { nombreComun: 'Fiatc' }, null],
    polizaActualId: null,
  })
  assert.equal(c.estado, 'ok')
  if (c.estado !== 'ok') return
  assert.equal(c.catalogo.length, 2)
})

// ─── Los campos del precio que el vendor SÍ manda ────────────────────────────

const GUARDADA = {
  estado: 'ok',
  cotizacionId: 'cot-1',
  projectId: '40769244',
  creadaEn: '2026-09-20T10:00:00.000Z',
  fechaEfecto: '2026-09-22',
  caducada: false,
  formulario: { correcciones: {} },
}

test('el id del precio viaja cuando está: es la clave estable de la fila, no su posición', () => {
  const r = interpretarTarificacionGuardada(200, {
    ...GUARDADA,
    precios: [
      { id: 'Q7601460', compania: 'Mapfre', primaEur: 312.41, entradaEur: 78.1, meses: 12, formaPago: 'Domiciliación', frecuenciaPago: 'Trimestral' },
    ],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  const p = r.guardada.precios[0]!
  assert.equal(p.id, 'Q7601460')
  assert.equal(p.entradaEur, 78.1)
  assert.equal(p.meses, 12)
  assert.equal(p.formaPago, 'Domiciliación')
  assert.equal(p.frecuenciaPago, 'Trimestral')
})

test('lo que asegura no manda se queda en undefined («no se guardó»), no en null («no lo declara»)', () => {
  const r = interpretarTarificacionGuardada(200, {
    ...GUARDADA,
    precios: [{ compania: 'Mapfre', primaEur: 312.41 }],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  const p = r.guardada.precios[0]!
  assert.equal(p.id, undefined)
  assert.equal(p.formaPago, undefined)
  assert.equal(p.meses, undefined)
  // Y lo que SÍ viene con valor nulo sigue siendo `null`: el producto no lo declara.
  const conNulos = interpretarTarificacionGuardada(200, {
    ...GUARDADA,
    precios: [{ compania: 'Mapfre', primaEur: 312.41, formaPago: null, meses: null }],
  })
  assert.equal(conNulos.estado, 'ok')
  if (conNulos.estado !== 'ok') return
  assert.equal(conNulos.guardada.precios[0]!.formaPago, null)
  assert.equal(conNulos.guardada.precios[0]!.meses, null)
})

// ─── Los fallos de una cotización recuperada ─────────────────────────────────

test('sin columna en la BD, los fallos de una cotización recuperada son null («no se guardaron»), no []', () => {
  const r = interpretarTarificacionGuardada(200, { ...GUARDADA, precios: [] })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.guardada.fallos, null)
})

test('cuando asegura los mande, los fallos llegan tal cual (ahí vive «ya está asegurada en la compañía»)', () => {
  const r = interpretarTarificacionGuardada(200, {
    ...GUARDADA,
    precios: [],
    fallos: [{ compania: 'Reale', motivo: 'La matrícula ya está asegurada en la compañía', tambienDioPrecio: false }],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.guardada.fallos?.length, 1)
  assert.match(r.guardada.fallos![0]!.motivo ?? '', /ya está asegurada/)
})
