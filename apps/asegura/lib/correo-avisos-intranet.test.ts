// Texto concreto, agrupación semanal, rebotes y direcciones internas del correo de la intranet.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TIPOS_AVISO } from '@central/module-seguros-portal'
import {
  cuerpoAvisosIntranet, frasePoliza, iconoAviso, iconoDeRamo, ICONO_POR_TIPO, tocaEscribir, debeEscribirHoy, esTablaInexistente, esDireccionInterna, direccionesBloqueadas, elegirDestino,
  type DatosAvisosIntranet,
} from './correo-avisos-intranet.ts'

const base = { nombre: null, total: 1, enlace: 'https://x.es/' }
const mod = (campos: ('estado' | 'fechas' | 'prima' | 'forma_pago' | 'coberturas' | 'documentos' | 'siniestros')[], ramo: string | null, estadoNuevo: string | null = null) =>
  ({ tipo: 'poliza_modificada' as const, ramo, campos, estadoNuevo })

test('renovación (fechas + prima + coberturas, estado sin cambio) dice «se ha renovado», sin importes', () => {
  const d: DatosAvisosIntranet = { ...base, avisos: [{ tipo: 'poliza_modificada' }], detalles: [mod(['fechas', 'prima', 'coberturas'], 'Auto')] }
  const c = cuerpoAvisosIntranet(d)
  assert.equal(c.asunto, '🚗 Tu seguro de Auto se ha renovado')
  assert.match(c.texto, /Tu seguro de Auto se ha renovado; revisa el precio y las coberturas/)
  assert.doesNotMatch(c.texto, /€|\d{3,}/)
  assert.doesNotMatch(c.asunto, /cambios/)
})

test('un cambio suelto dice el ramo y el tipo; sin ramo, neutro pero con el tipo', () => {
  assert.equal(cuerpoAvisosIntranet({ ...base, avisos: [{ tipo: 'poliza_modificada' }], detalles: [mod(['coberturas'], 'Hogar')] }).asunto, '🏠 Tu seguro de Hogar: cambio en las coberturas')
  assert.equal(cuerpoAvisosIntranet({ ...base, avisos: [{ tipo: 'poliza_modificada' }], detalles: [mod(['prima'], null)] }).asunto, '📄 Novedades en tu área de clientes: cambio en el precio')
  assert.equal(frasePoliza(mod(['estado'], 'Auto', 'baja')).asunto, 'Tu seguro de Auto: póliza dada de baja')
  // fechas con cambio de estado NO es renovación
  assert.doesNotMatch(frasePoliza(mod(['estado', 'fechas'], 'Auto', 'vencida')).asunto, /renovado/)
  assert.equal(cuerpoAvisosIntranet({ ...base, avisos: [{ tipo: 'poliza_emitida' }], detalles: [{ tipo: 'poliza_emitida', ramo: 'Hogar', sustituye: false }] }).asunto, '🏠 Tu seguro de Hogar: póliza nueva')
})

test('varias pólizas: viñetas por póliza; el correo conserva «Grupo ASegura»', () => {
  const c = cuerpoAvisosIntranet({ ...base, total: 2, avisos: [{ tipo: 'poliza_modificada' }, { tipo: 'poliza_modificada' }], detalles: [mod(['fechas'], 'Auto'), mod(['prima'], 'Hogar')] })
  assert.equal(c.asunto, '🔄 2 novedades en tu área de clientes')
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

test('un aviso con fecha propia sale hoy aunque haya sello reciente; los demás esperan', () => {
  const hoy = new Date('2026-10-06T08:15:00Z')
  const reciente = new Date('2026-10-03T08:15:00Z')
  assert.equal(debeEscribirHoy(reciente, hoy, ['poliza_modificada']), false)
  for (const t of ['felicitacion', 'obligacion_en_ventana', 'carnet_en_ventana']) {
    assert.equal(debeEscribirHoy(reciente, hoy, ['poliza_modificada', t]), true, t)
  }
  assert.equal(debeEscribirHoy(null, hoy, ['poliza_modificada']), true)
})

test('«la relación no existe» se reconoce; otros errores no', () => {
  assert.equal(esTablaInexistente(new Error('relation "correo_envio" does not exist')), true)
  assert.equal(esTablaInexistente(Object.assign(new Error('x'), { meta: { code: '42P01' } })), true)
  assert.equal(esTablaInexistente(new Error('connection refused')), false)
  assert.equal(esTablaInexistente(new Error('column "x" does not exist')), false)
})

const EMOJI = /\p{Extended_Pictographic}/gu

test('iconoAviso: un aviso de póliza va por ramo; ramo desconocido o ausente, 📄', () => {
  const uno = (ramo: string | null) => iconoAviso({ avisos: [{ tipo: 'poliza_modificada' }], detalles: [mod(['prima'], ramo)] })
  assert.equal(uno('Hogar'), '🏠')
  assert.equal(uno('Auto'), '🚗')
  assert.equal(uno('Moto'), '🏍️')
  assert.equal(uno('Salud'), '🩺')
  assert.equal(uno('Vida'), '❤️')
  assert.equal(uno('Mascotas'), '🐾')
  assert.equal(uno('Comunidades'), '🏢')
  assert.equal(uno('Viaje'), '✈️')
  assert.equal(uno('Cosa rara'), '📄')
  assert.equal(uno(null), '📄')
  assert.equal(iconoDeRamo('HOGAR'), '🏠')
})

test('iconoAviso: sin detalle, por tipo; varios tipos mezclados, 🔔', () => {
  assert.equal(iconoAviso({ avisos: [{ tipo: 'anulacion_por_firmar' }] }), '⚠️')
  assert.equal(iconoAviso({ avisos: [{ tipo: 'carnet_en_ventana' }, { tipo: 'carnet_en_ventana' }] }), '🪪')
  assert.equal(iconoAviso({ avisos: [{ tipo: 'itv_en_ventana' }, { tipo: 'datos_por_revisar' }] }), '🔔')
  assert.equal(iconoAviso({ avisos: [{ tipo: 'poliza_emitida' }] }), '✅')
  for (const t of TIPOS_AVISO) assert.ok(ICONO_POR_TIPO[t], t)
})

test('el asunto empieza por EXACTAMENTE un emoji (más, y Gmail lo manda a Promociones)', () => {
  const casos: DatosAvisosIntranet[] = [
    { ...base, avisos: [{ tipo: 'poliza_modificada' }], detalles: [mod(['fechas'], 'Hogar')] },
    { ...base, avisos: [{ tipo: 'datos_por_revisar' }] },
    { ...base, total: 2, avisos: [{ tipo: 'itv_en_ventana' }, { tipo: 'felicitacion' }] },
  ]
  for (const d of casos) {
    const a = cuerpoAvisosIntranet(d).asunto
    assert.equal(a.match(EMOJI)?.length, 1, a)
    assert.match(a, /^\p{Extended_Pictographic}\uFE0F? \S/u, a)
  }
})

test('el HTML lleva la insignia con el mismo emoji y el texto plano no cambia', () => {
  const c = cuerpoAvisosIntranet({ ...base, avisos: [{ tipo: 'poliza_modificada' }], detalles: [mod(['prima'], 'Hogar')] })
  assert.match(c.html, /<td[^>]*width="56"[^>]*background:#eaf0fe[^>]*font-size:28px[^>]*>🏠<\/td>/)
  assert.match(c.html, /Entrar en mi área de clientes/)
  assert.match(c.texto, /^Hola:/)
  assert.equal(c.texto.match(EMOJI), null)
})
