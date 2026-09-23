import { test } from 'node:test'
import assert from 'node:assert/strict'
import { POLITICA, borradorAnulacionCompania, borradorReciboDevuelto, buzonSugerido, caducaEn, decisionValida } from './aprobaciones.ts'

const hoy = new Date('2026-09-23T10:00:00Z')
const base = { ramo: 'auto', compania: 'MAPFRE', numeroPoliza: '3021700291186', importe: 225.97, vencimiento: '2026-09-10', hoy }

test('mandar un correo a un cliente pide OK: la política no lo deja ir solo', () => {
  assert.equal(POLITICA.enviar_correo_cliente, 'aprobar')
})

test('en plazo: dice hasta cuándo se puede pagar sin perder cobertura, con importe español', () => {
  const b = borradorReciboDevuelto(base)!
  assert.equal(b.urgente, false)
  assert.match(b.texto, /225,97€/)
  assert.match(b.texto, /antes del 10\/10\/2026/)
  assert.match(b.texto, /terminada en 1186/)
  assert.doesNotMatch(b.texto, /3021700291186/, 'nunca el número de póliza entero')
})

test('pasado el mes: en suspenso desde la fecha y vuelve a las 24 h; pasado medio año no se propone nada', () => {
  const b = borradorReciboDevuelto({ ...base, vencimiento: '2026-07-01' })!
  assert.equal(b.urgente, true)
  assert.match(b.texto, /en suspenso desde el 31\/07\/2026/)
  assert.match(b.asunto, /suspenso/)
  assert.equal(borradorReciboDevuelto({ ...base, vencimiento: '2026-01-01' }), null)
})

test('sin importe no inventa cifra; sin fecha no se propone nada (puede ser un impago de hace años)', () => {
  const b = borradorReciboDevuelto({ ...base, importe: null })!
  assert.doesNotMatch(b.texto, /€/)
  assert.equal(borradorReciboDevuelto({ ...base, vencimiento: null }), null)
})

test('«está a tiempo hasta el X» caduca antes del X aunque no hayan pasado 7 días', () => {
  // Vence el 01/09 → a tiempo hasta el 01/10; propuesto el 28/09 → caduca antes del 01/10, no el 05/10.
  const b = borradorReciboDevuelto({ ...base, vencimiento: '2026-09-01', hoy: new Date('2026-09-28T10:00:00Z') })!
  assert.match(b.texto, /antes del 01\/10\/2026/)
  assert.ok(b.caduca.getTime() <= Date.parse('2026-10-01T00:00:00+02:00'), `caduca ${b.caduca.toISOString()}`)
  // Con el plazo lejos, la semana de siempre.
  assert.equal(borradorReciboDevuelto(base)!.caduca.toISOString(), caducaEn(hoy).toISOString())
})

test('la decisión: aprobar exige asunto y texto; el asunto no puede partir cabeceras', () => {
  assert.deepEqual(decisionValida({ decision: 'rechazar' }), { decision: 'rechazar' })
  assert.equal(decisionValida({ decision: 'aprobar', asunto: '', texto: 'x' }), null)
  assert.equal(decisionValida({ decision: 'borrar' }), null)
  assert.deepEqual(decisionValida({ decision: 'cerrar_incierto', salio: false }), { decision: 'cerrar_incierto', salio: false })
  assert.equal(decisionValida({ decision: 'cerrar_incierto' }), null, 'sin decir si salió no se cierra')
  const d = decisionValida({ decision: 'aprobar', asunto: 'Hola\r\nBcc: x@y', texto: 'cuerpo' })
  assert.ok(d && d.decision === 'aprobar' && !/[\r\n]/.test(d.asunto))
})

test('caduca a los 7 días', () => {
  assert.equal(caducaEn(hoy).toISOString(), '2026-09-30T10:00:00.000Z')
})

const anu = {
  tomador: 'Pilar Franco Ruz', compania: 'Allianz', numeroPoliza: '048765432', tipo: 'no_renovacion' as const,
  fechaEfecto: '2026-12-01', firmadaEl: '2026-09-23', docHash: 'a'.repeat(64), mediador: 'Grupo ASegura', hoy,
}

test('comunicar a la compañía pide OK, y la nota dice qué, quién firmó, cuándo y con qué huella', () => {
  assert.equal(POLITICA.enviar_correo_compania, 'aprobar')
  const b = borradorAnulacionCompania(anu)
  assert.match(b.texto, /Pilar Franco Ruz, tomador de la póliza nº 048765432/)
  assert.match(b.texto, /oposición a la prórroga/)
  assert.match(b.texto, /firmada por el tomador el 23\/09\/2026/)
  assert.match(b.texto, new RegExp('a'.repeat(64)))
  assert.match(b.asunto, /no renovación · póliza nº 048765432/)
  assert.equal(b.urgente, false)
})

test('caduca con el efecto si llega antes que el mes; con el efecto cerca es urgente; pasado, tres días', () => {
  const cerca = borradorAnulacionCompania({ ...anu, tipo: 'inmediata', fechaEfecto: '2026-10-05' })
  assert.equal(cerca.urgente, true)
  assert.ok(cerca.caduca.getTime() < Date.parse('2026-10-05T00:00:00Z'))
  assert.match(cerca.texto, /anulación de la póliza con efecto el 05\/10\/2026/)
  assert.equal(borradorAnulacionCompania(anu).caduca.getTime(), caducaEn(hoy, 30).getTime())
  // 🪤 Efecto retroactivo (o de hoy): no nace caducada.
  const pasada = borradorAnulacionCompania({ ...anu, tipo: 'inmediata', fechaEfecto: '2026-09-01' })
  assert.equal(pasada.urgente, true)
  assert.equal(pasada.caduca.getTime(), caducaEn(hoy, 3).getTime())
})

test('🪤 el buzón no se deduce por área: solo se preselecciona el que ya recibió una anulación', () => {
  const c = (id: string, recibeAnulaciones: boolean, orden = 0, activo = true) => ({ id, email: `${id}@x.es`, orden, activo, recibeAnulaciones })
  assert.equal(buzonSugerido([c('adm', false), c('gen', false)]), null)
  assert.equal(buzonSugerido([c('adm', false), c('marcado', true)]), 'marcado')
  assert.equal(buzonSugerido([c('viejo', true, 0, false)]), null, 'uno dado de baja no se preselecciona')
  assert.equal(buzonSugerido([c('b', true, 2), c('a', true, 1)]), 'a')
})

test('decidir: el buzón elegido viaja como uuid; otra cosa invalida la decisión', () => {
  const base = { decision: 'aprobar', asunto: 's', texto: 't' }
  assert.equal(decisionValida({ ...base, contactoId: '11111111-1111-1111-1111-111111111111' })?.decision, 'aprobar')
  assert.equal(decisionValida({ ...base, contactoId: 'a@b.es' }), null)
  assert.deepEqual(decisionValida(base), { decision: 'aprobar', asunto: 's', texto: 't' })
})
