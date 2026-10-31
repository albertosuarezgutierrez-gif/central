// Texto concreto, agrupación semanal, rebotes y direcciones internas del correo de la intranet.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TIPOS_AVISO } from '@central/module-seguros-portal'
import {
  cuerpoAvisosIntranet, frasePoliza, iconoAviso, iconoDeRamo, ICONO_POR_TIPO, tocaEscribir, debeEscribirHoy, esTablaInexistente, esDireccionInterna, direccionesBloqueadas, elegirDestino,
  BOTON_PRESENTAR_APP, TEXTO_PRESENTAR_APP, INVITACION_APP, debePresentarApp, debeRegistrarCampana, enlacePresentarApp,
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

// ── Campaña «app en el aviso de vencimiento» (`aviso_venc_app`, 31/10/2026) ──────────────────────────

const VENC = ['obligacion_en_ventana']
const REF = 'AAAAAAAAAAAAAAAAAAAAAA' // 22 caracteres base64url: forma de ref válida

test('app: el bloque solo se ofrece a quien SE SABE que no entra al portal y con un vencimiento entre lo nuevo', () => {
  assert.equal(debePresentarApp(VENC, { estado: 'invitable', identidades: 0 }), true)
  // Ya entra al portal.
  assert.equal(debePresentarApp(VENC, { estado: 'ya_entra', identidades: 1 }), false)
  // Estado desconocido: null = no se pudo mirar → no se muestra.
  assert.equal(debePresentarApp(VENC, null), false)
  // Vínculos sin contar (lectura fallida) aunque el correo resuelva: no se sabe → no se muestra.
  assert.equal(debePresentarApp(VENC, { estado: 'invitable', identidades: null }), false)
  // Correo que llevaría a otra ficha o a ninguna concreta: no se le manda a una bóveda vacía.
  for (const estado of ['ambiguo', 'resuelve_a_otra', 'no_comprobado', 'ilegible', 'sin_email']) {
    assert.equal(debePresentarApp(VENC, { estado, identidades: 0 }), false, estado)
  }
  // Sin vencimiento entre lo nuevo (p. ej. solo un cambio de póliza): no es esta campaña.
  assert.equal(debePresentarApp(['poliza_modificada'], { estado: 'invitable', identidades: 0 }), false)
})

test('app: el correo lleva el bloque con el ?r= personal, al final y en lugar del consejo genérico', () => {
  const enlace = enlacePresentarApp(REF, 'https://clientes.grupoasegura.es/')
  assert.equal(enlace, `https://clientes.grupoasegura.es/?r=${REF}`)
  const c = cuerpoAvisosIntranet({ ...base, avisos: [{ tipo: 'obligacion_en_ventana' }], presentarApp: { enlace } })
  assert.ok(c.texto.includes(TEXTO_PRESENTAR_APP))
  assert.ok(c.texto.includes(`${BOTON_PRESENTAR_APP}: ${enlace}`))
  assert.ok(c.html.includes(`href="${enlace}"`))
  assert.match(c.html, />Activar mi app<\/a>/)
  assert.match(c.html, /background:#3364ee/)
  assert.match(c.html, /Quicksand/)
  assert.ok(!c.texto.includes(INVITACION_APP))
  // Secundario: el aviso (y su botón de siempre) va ANTES que el bloque.
  assert.ok(c.html.indexOf('Entrar en mi área de clientes') < c.html.indexOf('Activar mi app'))
  assert.ok(c.texto.indexOf('Puedes verlo aquí') < c.texto.indexOf(TEXTO_PRESENTAR_APP))
})

test('app: sin bloque (null o ausente) el correo es el de siempre, sin «Activar mi app» ni ?r=', () => {
  for (const presentarApp of [null, undefined]) {
    const c = cuerpoAvisosIntranet({ ...base, avisos: [{ tipo: 'obligacion_en_ventana' }], presentarApp })
    assert.ok(!c.texto.includes(TEXTO_PRESENTAR_APP))
    assert.ok(!c.html.includes(BOTON_PRESENTAR_APP))
    assert.doesNotMatch(c.html, /\?r=/)
    assert.ok(c.texto.includes(INVITACION_APP))
  }
})

test('app: sin ref (ya estaba en la campaña) el enlace va sin ?r= — no se inventa atribución', () => {
  assert.equal(enlacePresentarApp(null, 'https://clientes.grupoasegura.es/'), 'https://clientes.grupoasegura.es/')
  assert.throws(() => cuerpoAvisosIntranet({ ...base, avisos: [{ tipo: 'obligacion_en_ventana' }], presentarApp: { enlace: 'http://x.es/' } }), /enlace_no_https/)
})

test('app: la fila de campaña solo tras un envío ACEPTADO, nunca en el modo cuenta ni sin ref', () => {
  assert.equal(debeRegistrarCampana({ soloContar: false, resultado: 'enviado', ref: REF }), true)
  assert.equal(debeRegistrarCampana({ soloContar: true, resultado: 'enviado', ref: REF }), false)
  assert.equal(debeRegistrarCampana({ soloContar: false, resultado: 'rechazado', ref: REF }), false)
  assert.equal(debeRegistrarCampana({ soloContar: false, resultado: 'sin_proveedor', ref: REF }), false)
  assert.equal(debeRegistrarCampana({ soloContar: false, resultado: 'enviado', ref: null }), false)
})

test('app (fuente): en el cron, el ensayo sale ANTES de preparar el bloque, y la fila va DESPUÉS del sello', () => {
  const src = readFileSync(new URL('./avisos-intranet.ts', import.meta.url), 'utf8')
  const iEnsayo = src.indexOf('if (soloContar) continue')
  const iPreparar = src.indexOf('await prepararPresentacionApp(')
  const iSello = src.indexOf('await db.portalAvisoEnviado.createMany(')
  const iRegistrar = src.indexOf('await registrarPresentacionEnviada(')
  assert.ok(iEnsayo > 0 && iPreparar > 0 && iSello > 0 && iRegistrar > 0)
  assert.ok(iEnsayo < iPreparar, 'el bloque (y su ref) solo se prepara con envío real')
  assert.ok(iSello < iRegistrar, 'la fila de campaña va después del sello y no lo condiciona')
  // Y la escritura pasa por la puerta pura.
  assert.match(src.slice(iSello, iRegistrar + 60), /debeRegistrarCampana\(\{ soloContar, resultado, ref: presentacion\.ref \}\)/)
})
