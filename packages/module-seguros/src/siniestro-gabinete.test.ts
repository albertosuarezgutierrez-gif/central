import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  encajarMeta, extraerJson, fichaCacheada, huellaDocumentos, huellaHilo, indiceCacheado, metaGabinete, textoVeredicto,
  ultimoVeredicto, validarFichaCaso, validarIndicePoliza, validarVeredicto, verificarCitasIndice, verificarCitasVeredicto,
  INDICE_POLIZA_VERSION, FICHA_CASO_VERSION,
} from './siniestro-gabinete.ts'
import { CONOCIMIENTO_SINIESTROS, CONOCIMIENTO_SINIESTROS_ESTADO, CONOCIMIENTO_SINIESTROS_VERSION } from './conocimiento-siniestros.ts'

const POLIZA = 'GARANTÍA DE RESPONSABILIDAD CIVIL DE EXPLOTACIÓN. Suma asegurada 300.000 euros por siniestro. Quedan excluidos los daños a bienes confiados al asegurado.'

const VEREDICTO_OK = {
  semaforo: 'defendible', confianza: 'media', resumen: 'Hay base.',
  preguntas: [],
  argumentos: [
    { texto: 'La garantía cubre la explotación', apoyo: 'poliza', cita: 'Suma asegurada 300.000 euros por siniestro' },
    { texto: 'Prescripción no corre aún', apoyo: 'ley', cita: '2 AÑOS en seguros de daños' },
    { texto: 'La compañía no respondió', apoyo: 'hechos' },
  ],
  derivar: null,
  plazosAccion: [{ que: 'Reclamar al SAC', fecha: '2026-12-01', base: 'art. 20 LCS' }],
  otrasPolizas: [{ polizaId: 'p-2', ramo: 'hogar', compania: 'Mapfre', motivo: 'RC familiar' }, { polizaId: 'inventada', ramo: 'x', compania: 'y', motivo: 'z' }],
}

test('base de conocimiento: versión, encabezado de revisión y artículos clave', () => {
  assert.match(CONOCIMIENTO_SINIESTROS_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/)
  assert.match(CONOCIMIENTO_SINIESTROS_ESTADO, /PENDIENTE DE REVISIÓN POR ALBERTO/)
  assert.ok(CONOCIMIENTO_SINIESTROS.includes(CONOCIMIENTO_SINIESTROS_VERSION))
  for (const a of ['Art. 3.', 'Art. 10.', 'Art. 18.', 'Art. 20.', 'Art. 23.', 'Art. 76.', '1288']) assert.ok(CONOCIMIENTO_SINIESTROS.includes(a), a)
})

test('metaGabinete anota SIEMPRE la versión de la base de conocimiento', () => {
  const m = metaGabinete({ modelo: 'x', accion: 'analizar' })
  assert.equal(m.conocimientoVersion, CONOCIMIENTO_SINIESTROS_VERSION)
  assert.equal(m.modelo, 'x')
  assert.equal(typeof m.gabinete, 'number')
})

test('huellaDocumentos: estable, sin orden, cambia con el texto', () => {
  const a = huellaDocumentos([{ id: '1', texto: 'uno' }, { id: '2', texto: 'dos' }])
  assert.equal(a, huellaDocumentos([{ id: '2', texto: 'dos' }, { id: '1', texto: 'uno' }]))
  assert.notEqual(a, huellaDocumentos([{ id: '1', texto: 'uno' }, { id: '2', texto: 'dos.' }]))
  assert.notEqual(a, huellaDocumentos([{ id: '1', texto: 'uno' }]))
})

test('huellaHilo: ignora los mensajes de la IA, cambia con un mensaje nuevo o con extra', () => {
  const base = [{ id: 'a', creadoAt: '2026-10-01', autor: 'compania' }, { id: 'b', creadoAt: '2026-10-02', autor: 'corredor' }]
  const h = huellaHilo(base, 'abierto')
  assert.equal(h, huellaHilo([...base, { id: 'ia1', creadoAt: '2026-10-03', autor: 'ia' }], 'abierto'))
  assert.notEqual(h, huellaHilo([...base, { id: 'c', creadoAt: '2026-10-03', autor: 'corredor' }], 'abierto'))
  assert.notEqual(h, huellaHilo(base, 'cerrado'))
})

test('extraerJson tolera bloques ``` y texto alrededor; null si no hay JSON', () => {
  assert.deepEqual(extraerJson('```json\n{"a":1}\n```'), { a: 1 })
  assert.deepEqual(extraerJson('Aquí va: {"a":2} fin'), { a: 2 })
  assert.equal(extraerJson('sin json'), null)
})

test('validarIndicePoliza: descarta basura, recorta y marca incompleto si la IA lo dice', () => {
  const i = validarIndicePoliza('{"garantias":[{"nombre":"RC explotación","suma":"300.000€","cita":"Suma asegurada 300.000 euros"},{"x":1}],"exclusiones":[{"texto":"Bienes confiados","cita":"daños a bienes confiados"}]}')
  assert.ok(i)
  assert.equal(i.garantias.length, 1)
  assert.equal(i.completo, true)
  assert.equal(validarIndicePoliza({ garantias: [], exclusiones: [], completo: false })?.completo, false)
  assert.equal(validarIndicePoliza({ garantias: 'no' }), null)
})

test('verificarCitasIndice: verifica cada cita contra la póliza', () => {
  const i = validarIndicePoliza({ garantias: [{ nombre: 'RC', cita: 'Suma asegurada 300.000 euros' }], exclusiones: [{ texto: 'X', cita: 'cláusula inventada' }] })!
  const r = verificarCitasIndice(i, POLIZA)
  assert.equal(r.indice.garantias[0].citaVerificada, true)
  assert.equal(r.indice.exclusiones[0].citaVerificada, false)
  assert.deepEqual(r.noEncontradas, ['cláusula inventada'])
})

test('validarFichaCaso: fechas válidas o null, sin listas = vacías', () => {
  const f = validarFichaCaso({ cronologia: [{ fecha: '2026-02-30', hecho: 'Rehúse' }, { fecha: '2026-03-01', hecho: 'Declaración' }], motivoRehuse: 'exclusión' })!
  assert.equal(f.cronologia[0].fecha, null)
  assert.equal(f.cronologia[1].fecha, '2026-03-01')
  assert.deepEqual(f.partes, [])
  assert.equal(f.motivoRehuse, 'exclusión')
  assert.equal(validarFichaCaso('nada'), null)
})

test('validarVeredicto: forma correcta y filtra otrasPolizas a las permitidas', () => {
  const r = validarVeredicto(VEREDICTO_OK, { polizasPermitidas: ['p-2'] })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.veredicto.otrasPolizas.length, 1)
  assert.equal(r.veredicto.argumentos[2].cita, null)
  assert.ok(validarVeredicto(JSON.stringify(VEREDICTO_OK)).ok, 'acepta texto JSON')
})

test('validarVeredicto: rechaza lo que no cuadra', () => {
  const malos: Array<[string, unknown]> = [
    ['semáforo', { ...VEREDICTO_OK, semaforo: 'verde' }],
    ['confianza', { ...VEREDICTO_OK, confianza: 'total' }],
    ['apoyo', { ...VEREDICTO_OK, argumentos: [{ texto: 'x', apoyo: 'intuicion' }] }],
    ['derivar', { ...VEREDICTO_OK, derivar: 'notario' }],
    ['fecha', { ...VEREDICTO_OK, plazosAccion: [{ que: 'x', fecha: '01/12/2026', base: 'y' }] }],
    ['faltan_datos sin preguntas', { ...VEREDICTO_OK, semaforo: 'faltan_datos', preguntas: [] }],
    ['no_defendible sin explicación', { ...VEREDICTO_OK, semaforo: 'no_defendible' }],
    ['defendible sin argumentos', { ...VEREDICTO_OK, argumentos: [] }],
    ['no JSON', 'esto no es json'],
  ]
  for (const [n, v] of malos) assert.equal(validarVeredicto(v).ok, false, n)
  assert.ok(validarVeredicto({ ...VEREDICTO_OK, semaforo: 'no_defendible', explicacionCliente: 'No entra en la póliza.' }).ok)
})

test('verificarCitasVeredicto: cada cita contra SU fuente', () => {
  const r = validarVeredicto(VEREDICTO_OK)
  assert.ok(r.ok)
  if (!r.ok) return
  const v = verificarCitasVeredicto(r.veredicto, { poliza: POLIZA, hechos: '', ley: CONOCIMIENTO_SINIESTROS })
  assert.equal(v.veredicto.argumentos[0].citaVerificada, true)
  assert.equal(v.veredicto.argumentos[1].citaVerificada, true)
  assert.equal(v.veredicto.argumentos[2].citaVerificada, undefined)
  const mal = verificarCitasVeredicto(r.veredicto, { poliza: 'otra cosa', hechos: '', ley: '' })
  assert.equal(mal.noEncontradas.length, 2)
  assert.match(textoVeredicto(mal.veredicto), /cita NO verificada/)
})

test('caché: índice y ficha del análisis con la misma huella; incompleto o versión vieja no se reutilizan', () => {
  const indice = { garantias: [{ nombre: 'RC', suma: null, franquicia: null, cita: null }], exclusiones: [], completo: true, version: INDICE_POLIZA_VERSION, huella: 'doc:1', modelo: 'm', creadoAt: 'x' }
  const ficha = { cronologia: [], partes: [], importesPerito: [], garantiaEnJuego: null, motivoRehuse: 'x', documentosFaltan: [], version: FICHA_CASO_VERSION, huella: 'hilo:1', modelo: 'm', creadoAt: 'x' }
  const msgs = [
    { autor: 'ia', tipo: 'analisis', meta: { indicePoliza: indice, fichaCaso: ficha, veredicto: VEREDICTO_OK } },
    { autor: 'corredor', tipo: 'nota', meta: null },
  ]
  assert.equal(indiceCacheado(msgs, 'doc:1')?.garantias[0].nombre, 'RC')
  assert.equal(indiceCacheado(msgs, 'doc:2'), null)
  assert.equal(indiceCacheado([{ autor: 'ia', tipo: 'analisis', meta: { indicePoliza: { ...indice, completo: false } } }], 'doc:1'), null)
  assert.equal(indiceCacheado([{ autor: 'ia', tipo: 'analisis', meta: { indicePoliza: { ...indice, version: 0 } } }], 'doc:1'), null)
  assert.equal(fichaCacheada(msgs, 'hilo:1')?.motivoRehuse, 'x')
  assert.equal(fichaCacheada(msgs, 'hilo:2'), null)
  assert.equal(ultimoVeredicto(msgs)?.semaforo, 'defendible')
})

test('encajarMeta: respeta el tope recortando índice → ficha → índice → veredicto', () => {
  const grande = { garantias: Array.from({ length: 25 }, (_, i) => ({ nombre: `G${i}`, suma: null, franquicia: null, cita: 'x'.repeat(220) })), exclusiones: Array.from({ length: 25 }, () => ({ texto: 'y'.repeat(200), cita: 'z'.repeat(220) })), completo: true }
  const meta = { modelo: 'm', indicePoliza: grande, fichaCaso: { cronologia: [] }, veredicto: VEREDICTO_OK }
  const r = encajarMeta(meta, 6_000)
  assert.ok(new TextEncoder().encode(JSON.stringify(r.meta)).length <= 6_000)
  assert.ok(r.recortes.includes('indice_recortado'))
  assert.equal((r.meta.indicePoliza as { completo: boolean }).completo, false, 'recortado = no se reutiliza')
  assert.ok(r.meta.veredicto, 'el veredicto se conserva')
  const sin = encajarMeta({ a: 1 }, 6_000)
  assert.deepEqual(sin.recortes, [])
  assert.equal('recortesMeta' in sin.meta, false)
})
