// Texto concreto, agrupación semanal, rebotes y direcciones internas del correo de la intranet.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cuerpoAvisosIntranet, frasePoliza, tocaEscribir, esDireccionInterna, direccionesBloqueadas, elegirDestino,
  type DatosAvisosIntranet,
} from './correo-avisos-intranet.ts'

const base = { nombre: null, total: 1, enlace: 'https://x.es/' }
const mod = (campos: ('estado' | 'fechas' | 'prima' | 'forma_pago' | 'coberturas' | 'documentos' | 'siniestros')[], ramo: string | null, estadoNuevo: string | null = null) =>
  ({ tipo: 'poliza_modificada' as const, ramo, campos, estadoNuevo })

test('renovación (fechas + prima + coberturas, estado sin cambio) dice «se ha renovado», sin importes', () => {
  const d: DatosAvisosIntranet = { ...base, avisos: [{ tipo: 'poliza_modificada' }], detalles: [mod(['fechas', 'prima', 'coberturas'], 'Auto')] }
  const c = cuerpoAvisosIntranet(d)
  assert.equal(c.asunto, 'Tu seguro de Auto se ha renovado')
  assert.match(c.texto, /Tu seguro de Auto se ha renovado; revisa el precio y las coberturas/)
  assert.doesNotMatch(c.texto, /€|\d{3,}/)
  assert.doesNotMatch(c.asunto, /cambios/)
})

test('un cambio suelto dice el ramo y el tipo; sin ramo, neutro pero con el tipo', () => {
  assert.equal(cuerpoAvisosIntranet({ ...base, avisos: [{ tipo: 'poliza_modificada' }], detalles: [mod(['coberturas'], 'Hogar')] }).asunto, 'Tu seguro de Hogar: cambio en las coberturas')
  assert.equal(cuerpoAvisosIntranet({ ...base, avisos: [{ tipo: 'poliza_modificada' }], detalles: [mod(['prima'], null)] }).asunto, 'Novedades en tu área de clientes: cambio en el precio')
  assert.equal(frasePoliza(mod(['estado'], 'Auto', 'baja')).asunto, 'Tu seguro de Auto: póliza dada de baja')
  // fechas con cambio de estado NO es renovación
  assert.doesNotMatch(frasePoliza(mod(['estado', 'fechas'], 'Auto', 'vencida')).asunto, /renovado/)
  assert.equal(cuerpoAvisosIntranet({ ...base, avisos: [{ tipo: 'poliza_emitida' }], detalles: [{ tipo: 'poliza_emitida', ramo: 'Hogar', sustituye: false }] }).asunto, 'Tu seguro de Hogar: póliza nueva')
})

test('varias pólizas: viñetas por póliza; el correo conserva «Grupo ASegura»', () => {
  const c = cuerpoAvisosIntranet({ ...base, total: 2, avisos: [{ tipo: 'poliza_modificada' }, { tipo: 'poliza_modificada' }], detalles: [mod(['fechas'], 'Auto'), mod(['prima'], 'Hogar')] })
  assert.equal(c.asunto, '2 novedades en tu área de clientes')
  assert.match(c.texto, /- Tu seguro de Auto se ha renovado\n- Tu seguro de Hogar: cambio en el precio/)
  assert.match(c.texto, /Grupo ASegura$/)
})

test('7 días: menos de una semana desde el último sello no se escribe', () => {
  const hoy = new Date('2026-10-06T08:15:00Z')
  assert.equal(tocaEscribir(null, hoy), true)
  assert.equal(tocaEscribir(new Date('2026-10-03T08:15:00Z'), hoy), false)
  assert.equal(tocaEscribir(new Date('2026-09-29T08:15:30Z'), hoy), true, 'una semana justa (con la holgura del sello) sí')
  assert.equal(tocaEscribir(new Date('2026-09-28T08:15:00Z'), hoy), true)
})

test('direcciones internas o de pruebas se excluyen por dominio', () => {
  for (const e of ['alberto@grupoasegura.es', 'x@envios.grupoasegura.es', 'a@GrupoAsegura.com', 'a@example.com', 'a@prueba.invalid']) assert.equal(esDireccionInterna(e), true, e)
  for (const e of ['cliente@gmail.com', 'a@notgrupoasegura.es']) assert.equal(esDireccionInterna(e), false, e)
})

test('rebote duro y queja bloquean la dirección; rebote blando no; se salta a la siguiente', () => {
  const b = direccionesBloqueadas([
    { tipo: 'email.bounced', tipoRebote: 'Permanent', destino: 'Muerta@x.es' },
    { tipo: 'email.bounced', tipoRebote: 'Transient', destino: 'llena@x.es' },
    { tipo: 'email.complained', destino: 'queja@x.es' },
  ])
  assert.deepEqual([...b].sort(), ['muerta@x.es', 'queja@x.es'])
  assert.equal(elegirDestino(['muerta@x.es', 'interno@grupoasegura.es', 'llena@x.es'], b), 'llena@x.es')
  assert.equal(elegirDestino(['muerta@x.es', null, 'no-es-email'], b), null)
})
