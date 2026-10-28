import { test } from 'node:test'
import assert from 'node:assert/strict'
import { trocearVolcadoIntranet, fichaInformePerito, huellaMensaje } from './siniestro-volcado.ts'
import { buscarEnTexto } from './siniestro-buscar.ts'
import { hiloVigente } from './siniestro-hilo-versiones.ts'
import { diasEsperandoCompania } from './siniestro-plazos.ts'

const VOLCADO = `PERITO-28-09-2026 18:40
Buenas tardes estimada Yolanda,
Le informo que ...
UE7234 (JC940-940-021)-29-09-2026 13:09
Buenos días,
Reviso y comentamos. Saludos. Yolanda.
UE7234 (JC940-940-021)-26-10-2026 17:13
Buenas tardes,
Revisado por responsable ... se debe rehusar por la "rc cruzada". Te asigno para que modifiques informe. Saludos. Yolanda.`

test('trocea el volcado real por cabeceras, con emisor, rol y fecha (hora de Madrid)', () => {
  const t = trocearVolcadoIntranet(VOLCADO)
  assert.equal(t.length, 3)
  assert.deepEqual(t.map((x) => [x.emisor, x.rol]), [['PERITO', 'perito'], ['UE7234 (JC940-940-021)', 'tramitador'], ['UE7234 (JC940-940-021)', 'tramitador']])
  assert.equal(t[0].fechaOriginal, '2026-09-28T16:40:00.000Z') // CEST +2
  assert.equal(t[2].fechaOriginal, '2026-10-26T16:13:00.000Z') // CET aún no (cambio el 25/10 a las 03:00): +1
  assert.match(t[2].texto, /rc cruzada/)
  assert.ok(!t[0].texto.includes('UE7234'))
})

test('sin cabeceras: un solo trozo sin fecha; vacío: nada; emisor desconocido = compania', () => {
  assert.deepEqual(trocearVolcadoIntranet('hola\nmundo'), [{ emisor: '', rol: 'compania', fechaOriginal: null, texto: 'hola\nmundo' }])
  assert.deepEqual(trocearVolcadoIntranet('  \n '), [])
  assert.equal(trocearVolcadoIntranet('Mapfre Tramitación-01-02-2026 09:00\nTexto')[0].rol, 'compania')
})

test('una fecha imposible no es cabecera', () => {
  assert.equal(trocearVolcadoIntranet('X-31-02-2026 10:00\nTexto').length, 1)
  assert.equal(trocearVolcadoIntranet('X-31-02-2026 10:00\nTexto')[0].fechaOriginal, null)
})

const INFORME = `==== INFORME PREVIO PERITO ====
Número de Informe:   1

Fecha de Gestión:    21.09.2026
Fecha Prox. Gestión: 06.10.2026

Importe daños según garantías póliza:           4.000,00
Importe aproximado total daños no cubiertos:          0,00

Origen, causas y circunstancias:
Como consecuencia de rotura de tubería ...

Número de Afectados:    1`

test('ficha del informe del perito', () => {
  assert.deepEqual(fichaInformePerito(INFORME), {
    numeroInforme: 1, fechaGestion: '2026-09-21', fechaProxGestion: '2026-10-06',
    importeCubierto: 4000, importeNoCubierto: 0, origenCausas: 'Como consecuencia de rotura de tubería ...', afectados: 1,
  })
})

test('ficha: campo ausente = null (nunca 0); no informe = null', () => {
  const f = fichaInformePerito('==== INFORME PREVIO PERITO ====\nNúmero de Informe: 2')
  assert.equal(f?.numeroInforme, 2)
  assert.equal(f?.importeCubierto, null)
  assert.equal(f?.afectados, null)
  assert.equal(f?.fechaGestion, null)
  assert.equal(fichaInformePerito('Buenas tardes, le informo...'), null)
})

test('huella: normaliza espacios, distingue fecha y texto', () => {
  assert.equal(huellaMensaje('a  b\n c', '2026-01-01T00:00:00.000Z'), huellaMensaje(' a b c ', '2026-01-01T00:00:00.000Z'))
  assert.notEqual(huellaMensaje('a b', '2026-01-01T00:00:00.000Z'), huellaMensaje('a b', null))
  assert.notEqual(huellaMensaje('a b', null), huellaMensaje('a c', null))
})

test('buscarEnTexto: sin tildes ni mayúsculas, varias palabras cerca, tope', () => {
  const t = 'Cláusula de EXCLUSIONES: quedan excluidos los daños por Responsabilidad Civil Cruzada entre asegurados.' + ' x'.repeat(500) + ' rc lejana'
  assert.equal(buscarEnTexto(t, 'clausula exclusiones').length, 1)
  assert.equal(buscarEnTexto(t, 'responsabilidad CRUZADA')[0].fragmento.includes('Civil Cruzada'), true)
  assert.equal(buscarEnTexto(t, 'exclusiones lejana').length, 0)
  assert.equal(buscarEnTexto(t, 'zzz').length, 0)
  assert.equal(buscarEnTexto('a '.repeat(100), 'a', { max: 3, contexto: 1 }).length, 3)
  assert.equal(buscarEnTexto(t, '  ').length, 0)
})

test('fechaOriginal manda sobre creadoAt en versiones y en espera', () => {
  const r = hiloVigente([
    { id: 'a', creadoAt: '2026-10-28T10:00:00.000Z', meta: { fechaOriginal: '2026-09-28T16:40:00.000Z' } },
    { id: 'a2', creadoAt: '2026-10-28T11:00:00.000Z', meta: { sustituyeA: 'a' } },
  ])
  assert.equal(r[0].creadoAtOriginal, '2026-09-28T16:40:00.000Z')
  const msgs = [
    { autor: 'corredor', tipo: 'enviado', creadoAt: '2026-10-20T10:00:00.000Z', dia: '2026-10-20' },
    { autor: 'compania', tipo: 'comentario', creadoAt: '2026-10-28T10:00:00.000Z', dia: '2026-10-28', meta: { fechaOriginal: '2026-10-10T10:00:00.000Z' } },
  ]
  assert.equal(diasEsperandoCompania(msgs, '2026-10-28'), 8) // la respuesta es ANTERIOR al envío: sigue esperando
  const msgs2 = [msgs[0], { ...msgs[1], meta: { fechaOriginal: '2026-10-22T10:00:00.000Z' } }]
  assert.equal(diasEsperandoCompania(msgs2, '2026-10-28'), null)
})
