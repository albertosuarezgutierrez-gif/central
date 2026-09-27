import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { LecturaDocumentoOportunidad } from './seguimiento-asegura.ts'
import { clasificarDestino, HERRAMIENTAS, rastroArgs } from './correduria-asistente.ts'
import { cuerpoAlta, fechaPrimerPaso, prepararAlta, resultadoAlta, textoAlta } from './correduria-oportunidad-tg.ts'

// Caso fundacional (27/09/2026): la póliza de Línea Directa de un lead subida por Telegram acabó en el
// contable buscando un cargo de 691,24€, y el asistente dijo que no podía abrir oportunidades.

const HOY = '2026-09-27'
const leida = (o: Partial<Extract<LecturaDocumentoOportunidad, { estado: 'ok' }>> = {}): LecturaDocumentoOportunidad => ({
  estado: 'ok', ramo: 'auto', compania: 'Línea Directa', numeroPoliza: '05209179001-00', vence: '2027-02-03', prima: 691.24, ...o,
})

test('lo leído del documento rellena la oportunidad y el primer paso cae 60 días antes del vencimiento', () => {
  const r = prepararAlta({}, [leida()], HOY)
  assert.ok(r.ok)
  assert.equal(r.alta.ramo, 'auto')
  assert.equal(r.alta.aseguradora, 'Línea Directa')
  assert.equal(r.alta.prima, 691.24)
  assert.equal(r.alta.fechaFinVigencia, '2027-02-03')
  assert.equal(r.alta.fechaTarea, '2026-12-05')
  assert.deepEqual(r.alta.documentos, { leidos: 1, fallidos: [] })
})

test('lo que dicta Alberto manda sobre el papel', () => {
  const r = prepararAlta({ ramo: 'hogar', prima: '450,5', compania: 'Mapfre' }, [leida()], HOY)
  assert.ok(r.ok)
  assert.equal(r.alta.ramo, 'hogar')
  assert.equal(r.alta.prima, 450.5)
  assert.equal(r.alta.aseguradora, 'Mapfre')
  assert.equal(r.alta.fechaFinVigencia, '2027-02-03')
})

test('de varios documentos se toma el primer valor de cada campo (dos PDFs de la misma póliza)', () => {
  const r = prepararAlta({}, [leida({ prima: null, vence: null }), leida({ ramo: null, compania: null, prima: 700 })], HOY)
  assert.ok(r.ok)
  assert.equal(r.alta.prima, 700)
  assert.equal(r.alta.fechaFinVigencia, '2027-02-03')
  assert.equal(r.alta.aseguradora, 'Línea Directa')
})

test('un vencimiento que ya pasó NO se usa (se habrá renovado) y se dice', () => {
  const r = prepararAlta({}, [leida({ vence: '2026-02-03' })], HOY)
  assert.ok(r.ok)
  assert.equal(r.alta.fechaFinVigencia, null)
  assert.equal(r.alta.venceDescartado, '2026-02-03')
  assert.equal(r.alta.fechaTarea, '2026-09-28')
  assert.match(textoAlta('X', r.alta), /ya pasó/)
})

test('sin ramo no se propone: ni se inventa ni se cae a «otros»', () => {
  const sinLeer = prepararAlta({}, [{ estado: 'error', motivo: 'ilegible' }], HOY)
  assert.equal(sinLeer.ok, false)
  assert.match((sinLeer as { motivo: string }).motivo, /ningún documento/)
  const aSecas = prepararAlta({}, null, HOY)
  assert.equal(aSecas.ok, false)
  assert.equal(prepararAlta({ ramo: 'barco' }, null, HOY).ok, false)
})

test('los documentos que no se pudieron leer se cuentan, no desaparecen', () => {
  const r = prepararAlta({}, [leida(), { estado: 'error', motivo: 'la lectura ha tardado demasiado' }], HOY)
  assert.ok(r.ok)
  assert.deepEqual(r.alta.documentos, { leidos: 1, fallidos: ['la lectura ha tardado demasiado'] })
  assert.match(textoAlta('X', r.alta), /no se ha podido leer: la lectura ha tardado demasiado/)
})

test('lo que no consta se dice «no consta», nunca 0,00€', () => {
  const r = prepararAlta({ ramo: 'vida' }, null, HOY)
  assert.ok(r.ok)
  const t = textoAlta('Ana <Pérez>', r.alta)
  assert.match(t, /Prima actual: no consta/)
  assert.match(t, /Ana &lt;Pérez&gt;/)
  assert.doesNotMatch(t, /0,00€/)
  assert.equal(r.alta.documentos, null)
})

test('fechas del primer paso: dictada, en el pasado o sin vencimiento', () => {
  assert.equal(fechaPrimerPaso(null, HOY), '2026-09-28')
  assert.equal(fechaPrimerPaso('2026-10-15', HOY), '2026-09-28')
  const dictada = prepararAlta({ ramo: 'auto', fechaPrimerPaso: '2026-10-01' }, null, HOY)
  assert.ok(dictada.ok && dictada.alta.fechaTarea === '2026-10-01')
  assert.equal(prepararAlta({ ramo: 'auto', fechaPrimerPaso: '2026-09-01' }, null, HOY).ok, false)
  assert.equal(prepararAlta({ ramo: 'auto', vence: '31/12/2026' }, null, HOY).ok, false)
})

test('el cuerpo es el del botón «Abrir» de la ficha: nace «por contactar» con su llamada', () => {
  const r = prepararAlta({}, [leida()], HOY)
  assert.ok(r.ok)
  const b = cuerpoAlta('c1', r.alta, 'agente:asistente-telegram')
  assert.equal(b.accion, 'crear')
  assert.equal(b.estado, 'competencia')
  assert.equal(b.tipoTarea, 'llamada')
  assert.equal(b.fechaTarea, '2026-12-05')
  assert.match(String(b.nota), /05209179001-00/)
  assert.equal(b.actor, 'agente:asistente-telegram')
})

test('el resultado distingue abierta, duplicada y rechazada', () => {
  assert.equal(resultadoAlta(201, { estado: 'ok', id: 'o1' }, 'u').estado, 'abierta')
  assert.equal(resultadoAlta(409, { estado: 'duplicada', motivo: 'Ya tiene una de auto.', id: 'o0' }, 'u').estado, 'duplicada')
  assert.equal(resultadoAlta(0, { motivo: 'fallo' }, 'u').estado, 'rechazada')
  assert.equal(resultadoAlta(422, { motivo: 'Elige el ramo.' }, 'u').estado, 'rechazada')
})

test('el asistente tiene la herramienta y el reparto manda «oportunidades»/«lead» a la correduría', () => {
  assert.ok(HERRAMIENTAS.some((h) => h.function.name === 'proponer_oportunidad'))
  assert.equal(clasificarDestino('Seguro de un lead, añade en oportunidades'), 'correduria')
  assert.equal(clasificarDestino('añádelo a oportunidades'), 'correduria')
  // El rastro no guarda compañía, prima ni nº de póliza (contrato de un tercero).
  const r = rastroArgs('proponer_oportunidad', { clienteId: 'c', ramo: 'auto', prima: 691, numeroPoliza: 'X' })
  assert.equal(JSON.stringify(r).includes('691'), false)
  assert.equal(JSON.stringify(r).includes('"X"'), false)
})

test('el webhook desvía a la correduría el documento con pie de correduría y apunta todos (lee el FUENTE)', () => {
  const src = readFileSync(fileURLToPath(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url)), 'utf8')
  const i = src.indexOf('const adj = adjuntoDeMensaje(msg)')
  const bloque = src.slice(i, src.indexOf('manejarDocumentoTg(', i))
  assert.match(bloque, /registrarDocumentoTg\(/)
  assert.match(bloque, /esParaCorreduria\(pie\)/)
  assert.match(bloque, /if \(aCorreduria\)[\s\S]*return NextResponse\.json/)
  // El botón «Abrir» escribe en la cartera: solo lo pulsa el titular.
  assert.match(src, /action === 'oport'\) && String\(cb\.from/)
})
