import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { redactarPii } from '@central/module-seguros'
import {
  ACUSE_GENERICO,
  MAX_RESPUESTAS_CONVERSACION_DIA,
  MAX_RESPUESTAS_DIA,
  RESPUESTA_BAJA,
  VENTANA_MS,
  decidirRespuesta,
  esBaja,
  filtrarContenido,
  puedeResponder,
  sistemaRespuesta,
  type EstadoConversacionRespuesta,
} from './respuesta-reglas.ts'
import { respuestaIaActiva } from './config.ts'

// Reloj INYECTADO y relativo (regla del repo: nada de fechas fijas contra el reloj real).
const AHORA = new Date()
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000)
const redactar = (s: string) => redactarPii(s)

function estado(p: Partial<EstadoConversacionRespuesta> = {}): EstadoConversacionRespuesta {
  return {
    flag: true,
    tipoFicha: 'cliente',
    clientesCandidatos: 1,
    estadoConversacion: 'abierta',
    optOut: false,
    silenciada: false,
    ultimaEntrante: { id: 'e1', tipo: 'text', fecha: hace(12), historial: false },
    ultimoSaliente: { fecha: hace(30 * 60), ia: false },
    haySalienteHumanoPrevio: true,
    yaRespondida: false,
    respuestasHoyConversacion: 0,
    respuestasHoyTotal: 0,
    ahora: AHORA,
    ...p,
  }
}
const motivo = (p: Partial<EstadoConversacionRespuesta>) => {
  const r = puedeResponder(estado(p))
  return r.ok ? 'ok' : r.motivo
}

test('contesta: lead o cliente con ficha única que responde a Alberto dentro de 24 h', () => {
  assert.equal(motivo({}), 'ok')
  assert.equal(motivo({ tipoFicha: 'lead' }), 'ok')
})

test('CEPO no contesta: flag apagado (y el flag exige canal + IA, solo con «1»)', () => {
  assert.equal(motivo({ flag: false }), 'flag_apagado')
  const todo = { ASEGURA_WHATSAPP_ACTIVO: '1', ASEGURA_WHATSAPP_IA_ACTIVO: '1', ASEGURA_WHATSAPP_RESPUESTA_ACTIVA: '1' }
  assert.equal(respuestaIaActiva(todo), true)
  assert.equal(respuestaIaActiva({}), false)
  assert.equal(respuestaIaActiva({ ...todo, ASEGURA_WHATSAPP_RESPUESTA_ACTIVA: 'true' }), false)
  assert.equal(respuestaIaActiva({ ...todo, ASEGURA_WHATSAPP_IA_ACTIVO: '0' }), false)
  assert.equal(respuestaIaActiva({ ...todo, ASEGURA_WHATSAPP_ACTIVO: undefined }), false)
})

test('CEPO no contesta: sin ficha, teléfono en >1 ficha o «no se miró»', () => {
  assert.equal(motivo({ clientesCandidatos: 0, tipoFicha: null }), 'sin_ficha_unica')
  assert.equal(motivo({ clientesCandidatos: 2 }), 'sin_ficha_unica')
  assert.equal(motivo({ clientesCandidatos: null }), 'sin_ficha_unica')
  assert.equal(motivo({ tipoFicha: 'beneficiario' }), 'tipo_ficha')
})

test('CEPO no contesta: conversación personal, opt-out o silenciada', () => {
  assert.equal(motivo({ estadoConversacion: 'descartada_personal' }), 'conversacion_no_abierta')
  assert.equal(motivo({ estadoConversacion: 'pendiente_clasificar' }), 'conversacion_no_abierta')
  assert.equal(motivo({ optOut: true }), 'opt_out')
  assert.equal(motivo({ silenciada: true }), 'silenciada')
})

test('CEPO no contesta: fuera de la ventana de 24 h (con margen) ni a una fecha futura', () => {
  assert.equal(motivo({ ultimaEntrante: { id: 'e1', tipo: 'text', fecha: new Date(AHORA.getTime() - VENTANA_MS - 1), historial: false } }), 'fuera_de_ventana')
  assert.equal(motivo({ ultimaEntrante: { id: 'e1', tipo: 'text', fecha: hace(23 * 60 + 45), historial: false } }), 'fuera_de_ventana')
  assert.equal(motivo({ ultimaEntrante: { id: 'e1', tipo: 'text', fecha: hace(-60), historial: false }, ultimoSaliente: null }), 'fuera_de_ventana')
  assert.equal(motivo({ ultimaEntrante: { id: 'e1', tipo: 'text', fecha: hace(22 * 60), historial: false } }), 'ok')
})

test('CEPO no contesta: si Alberto escribió después del último entrante (él lleva la conversación)', () => {
  assert.equal(motivo({ ultimoSaliente: { fecha: hace(5), ia: false } }), 'alberto_lleva_conversacion')
})

test('CEPO idempotencia: nunca dos respuestas al mismo entrante', () => {
  assert.equal(motivo({ yaRespondida: true }), 'ya_respondida')
  assert.equal(motivo({ ultimoSaliente: { fecha: hace(5), ia: true } }), 'ya_respondida')
})

test('CEPO no contesta a mensajes ANTIGUOS del historial importado', () => {
  assert.equal(motivo({ ultimaEntrante: { id: 'e1', tipo: 'text', fecha: hace(12), historial: true } }), 'entrante_historial')
})

test('CEPO no contesta si Alberto no abrió la conversación (nadie le escribió antes)', () => {
  assert.equal(motivo({ haySalienteHumanoPrevio: false, ultimoSaliente: null }), 'sin_saliente_previo')
})

test('CEPO topes diarios: por conversación y total', () => {
  assert.equal(motivo({ respuestasHoyConversacion: MAX_RESPUESTAS_CONVERSACION_DIA }), 'tope_conversacion')
  assert.equal(motivo({ respuestasHoyConversacion: MAX_RESPUESTAS_CONVERSACION_DIA - 1 }), 'ok')
  assert.equal(motivo({ respuestasHoyTotal: MAX_RESPUESTAS_DIA }), 'tope_diario')
})

test('CEPO tipos: sticker/reacción/ubicación no; imagen/documento/audio solo acuse genérico', () => {
  for (const tipo of ['sticker', 'reaction', 'location', 'contacts', 'unsupported']) {
    assert.equal(motivo({ ultimaEntrante: { id: 'e1', tipo, fecha: hace(12), historial: false } }), 'tipo_no_admitido', tipo)
  }
  for (const tipo of ['image', 'document', 'audio']) {
    assert.equal(motivo({ ultimaEntrante: { id: 'e1', tipo, fecha: hace(12), historial: false } }), 'ok', tipo)
    const d = decidirRespuesta({ esComercial: true, descartaPersonal: false, baja: false, tipoEntrante: tipo, respuestaIA: 'Muy bien, gracias', promesaAviso: false, redactar })
    assert.deepEqual(d, { enviar: true, texto: ACUSE_GENERICO, clase: 'acuse' }, tipo)
  }
})

// ── Contenido ───────────────────────────────────────────────────────────────────

const pasa = (t: string, promesaAviso = false) => filtrarContenido(t, { promesaAviso, redactar })
const motivoFiltro = (t: string, promesaAviso = false) => {
  const r = pasa(t, promesaAviso)
  return r.ok ? 'ok' : r.motivo
}

test('filtro: acuses que NO comprometen pasan', () => {
  assert.equal(motivoFiltro('Perfecto, tomo nota, Alberto se lo revisa antes del vencimiento.'), 'ok')
  assert.equal(motivoFiltro('Recibido, Alberto lo revisa y le dice algo.'), 'ok')
  assert.equal(motivoFiltro('Gracias por avisar. Alberto le llama mañana.'), 'ok')
})

test('CEPO filtro: precios e importes', () => {
  for (const t of ['Le sale por 320 € al año.', 'El precio es muy bueno.', 'Tiene un 10% de descuento.', 'La prima baja este año.', 'Son 45 euros.']) {
    assert.notEqual(motivoFiltro(t), 'ok', t)
  }
})

test('CEPO filtro: recomendar productos/coberturas/compañías (IDD)', () => {
  for (const t of ['Le recomiendo el todo riesgo.', 'Le conviene ampliar coberturas.', 'Mejor pásese a Mapfre.', 'Le aconsejo quitar la franquicia.']) {
    assert.equal(motivoFiltro(t), 'asesoramiento', t)
  }
})

test('CEPO filtro: confirmar trámites que no se han aplicado', () => {
  for (const t of ['Ya está dado de baja.', 'He anulado la póliza.', 'Su cambio queda tramitado.', 'Le confirmo la baja.', 'Listo, ya está hecho.', 'Hemos actualizado la fecha de cobro.']) {
    assert.equal(motivoFiltro(t), 'tramite_confirmado', t)
  }
})

test('CEPO filtro: datos personales (propios o de terceros), marcadores de redacción y enlaces', () => {
  assert.equal(motivoFiltro('Su DNI 12345678Z consta bien.'), 'numero')
  assert.equal(motivoFiltro('Escriba a pepe@ejemplo.com'), 'dato_personal')
  assert.equal(motivoFiltro('Llame al 600 123 456.'), 'numero')
  assert.equal(motivoFiltro('Hola [NOMBRE], recibido.'), 'marcador')
  assert.equal(motivoFiltro('Mírelo en www.algo.es'), 'enlace')
  assert.equal(motivoFiltro('Mándeme el IBAN y lo vemos.'), 'dato_personal')
  assert.equal(motivoFiltro('Recibido, su matrícula 1234 BCD.'), 'numero')
})

test('CEPO filtro: prometer avisos futuros solo con el aviso por plantilla disponible', () => {
  const t = 'Perfecto, tomo nota; le aviso 60 días antes del vencimiento.'
  assert.equal(motivoFiltro(t, false), 'promesa_aviso')
  assert.equal(motivoFiltro('Tomo nota, le avisaré antes del vencimiento.', false), 'promesa_aviso')
  assert.equal(motivoFiltro(t, true), 'ok')
  assert.match(sistemaRespuesta({ promesaAviso: false }), /NO prometas avisos/)
  assert.doesNotMatch(sistemaRespuesta({ promesaAviso: true }), /NO prometas avisos/)
})

test('CEPO filtro: largo, vacío o no-texto → no', () => {
  assert.equal(motivoFiltro('x'.repeat(401)), 'larga')
  assert.equal(motivoFiltro('Uno. Dos. Tres. Cuatro.'), 'larga')
  assert.equal(motivoFiltro(' '), 'vacia')
  assert.equal(filtrarContenido(42, { promesaAviso: false, redactar }).ok, false)
})

// ── Decisión tras la IA ─────────────────────────────────────────────────────────

const decide = (p: Partial<Parameters<typeof decidirRespuesta>[0]>) =>
  decidirRespuesta({ esComercial: true, descartaPersonal: false, baja: false, tipoEntrante: 'text', respuestaIA: 'Recibido, Alberto lo revisa.', promesaAviso: false, redactar, ...p })

test('decisión: texto de la IA filtrado → se envía tal cual', () => {
  assert.deepEqual(decide({}), { enviar: true, texto: 'Recibido, Alberto lo revisa.', clase: 'ia' })
})

test('CEPO decisión: IA no segura (null) → no se envía nada, ni plantilla', () => {
  assert.deepEqual(decide({ respuestaIA: null }), { enviar: false, motivo: 'ia_no_segura' })
  assert.deepEqual(decide({ respuestaIA: null, baja: true }), { enviar: false, motivo: 'ia_no_segura' })
})

test('CEPO decisión: no comercial o personal → no', () => {
  assert.equal(decide({ esComercial: false }).enviar, false)
  assert.equal(decide({ descartaPersonal: true }).enviar, false)
})

test('CEPO decisión: contenido prohibido → no (el texto rechazado no viaja)', () => {
  const d = decide({ respuestaIA: 'Ya está dado de baja, le sale a 0 €.' })
  assert.equal(d.enviar, false)
  if (!d.enviar) assert.equal(d.motivo, 'contenido_prohibido')
  assert.ok(!JSON.stringify(d).includes('baja,'))
})

test('CEPO bajas: SIEMPRE el texto fijo «Alberto lo gestiona», nunca lo que diga la IA, y nunca «hecho»', () => {
  const d = decide({ baja: true, respuestaIA: 'Hecho, ya está dada de baja.' })
  assert.deepEqual(d, { enviar: true, texto: RESPUESTA_BAJA, clase: 'baja' })
  assert.match(RESPUESTA_BAJA, /Alberto/)
  assert.doesNotMatch(RESPUESTA_BAJA, /\b(ya est[aá]|dad[oa] de baja|anulad|hecho)\b/i)
})

test('esBaja: por la intención de la IA o por el texto', () => {
  assert.equal(esBaja('baja', ''), true)
  assert.equal(esBaja(null, 'Quiero darme de baja del seguro del coche'), true)
  assert.equal(esBaja(null, 'no quiero renovar'), true)
  assert.equal(esBaja(null, 'Ya no tengo el seguro, lo vendí'), true)
  assert.equal(esBaja('renovacion', 'Me parece bien, renuévelo'), false)
})

test('CEPO prompt: el pedido de respuesta solo va al sistema cuando `pre.ok` (flag apagado = prompt de siempre)', () => {
  const src = readFileSync(new URL('./analizar.ts', import.meta.url), 'utf8')
  assert.match(src, /system: pre\.ok \? SISTEMA \+ sistemaRespuesta\(\{ promesaAviso \}\) : SISTEMA/)
  assert.match(src, /let pre: Pre = \{ ok: false, motivo: 'flag_apagado' \}/)
  // El envío solo ocurre bajo `pre.ok` y por `enviarRespuesta` (reserva idempotente).
  assert.match(src, /if \(pre\.ok && entranteId\) \{/)
  assert.equal((src.match(/enviarRespuesta\(/g) ?? []).length, 1)
})

test('CEPO idempotencia en BD: la reserva va bajo índice único y antes del envío; un solo intento', () => {
  const src = readFileSync(new URL('./respuesta.ts', import.meta.url), 'utf8')
  assert.match(src, /on conflict \(responde_a_mensaje_id\) where responde_a_mensaje_id is not null do nothing/)
  const reserva = src.indexOf('insert into mensajes')
  const envio = src.indexOf('.enviarTexto(')
  assert.ok(reserva > 0 && envio > reserva, 'la reserva va ANTES del envío')
  assert.equal((src.match(/\.enviarTexto\(/g) ?? []).length, 1, 'un solo intento')
  assert.doesNotMatch(src, /console\.(log|error|warn)\([^)]*(telefono|texto|token)/i, 'ni teléfono ni texto ni token en logs')
})
