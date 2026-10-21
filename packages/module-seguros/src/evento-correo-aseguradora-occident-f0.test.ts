import test from 'node:test'
import assert from 'node:assert/strict'
import { avisoCompaniaIgnorado, leerCorreoEventoAseguradora, type EventoPreAnulacion, type EventoSolicitud } from './evento-correo-aseguradora.ts'

// F0 del agente corredor de correo (docs/CORREDURIA-AGENTE-CORREO.md §9, 21/10/2026). Plantillas de Occident de correos
// REALES (inventario del 21/10/2026, cuerpos saneados) que el lector no reconocía:
// · «Suscripción <ramo> <nº>, <tomador>» EMITIDA (trae «Póliza: N» y NO «Solicitud:») y ACEPTADA pte. de emisión.
// · «Mensaje recibo <recibo> (póliza <póliza>) <tomador>»: recibo a 70 días de su inicio de cobro → pre-anulación.
// · «Suscripción <ramo> - Póliza <nº> - <tomador>» recordatorio de firma de mandato SEPA → se reconoce y se IGNORA.
// Tomador, mediador y todos los nº (solicitud, póliza, recibo, contrato) son inventados con el mismo formato.
const OCC = 'mediadores@occidentinforma.com'
const AVISO = 'Aviso de confidencialidad: Esta comunicación y los documentos que en su caso lleve anexos, son para uso exclusivo del destinatario arriba indicado.'
const urlPoliza = (p: string) => `https://portaloccident.gco.global/Aplicacion/Paginas/default.aspx?marco=false&urlTransaccion=FE/SGE.Consulta.Polizas/?refpoli=${p}&ramo=X`
const urlSolicitud = (n: string) => `https://portaloccident.gco.global/Aplicacion/Paginas/default.aspx?marco=false&urlTransaccion=FE/SGE.Gestion.Proyectos.FE.AccesoProyecto/?idSubscripcio=00${n}`

// ── Solicitud EMITIDA (asunto sin guion; cuerpo por IMAP, con sus saltos de línea como llega) ─────────────────────
const cuerpoEmitida = (poliza: string, observ = `Ingresada póliza número ${poliza}`, enlace = urlPoliza(poliza)) => `Le confirmamos que la solicitud de póliza referenciada ha sido emitida:

Contrato mediador: M00000 - Mediador Inventado
Usuario solicitante: M000000X - Mediador Inventado
Póliza: ${poliza}
Modalidad: Accidentes colectivo educación
Tomador:
Observaciones: ${observ}

Puede consultar la póliza emitida a través del siguiente enlace:

${enlace}
${AVISO}`

const EMITIDA = {
  remitente: OCC,
  asunto: 'Suscripción Acc.colec. 170000021, ACADEMIA INVENTADA DE FORMACION PROFESI',
  fecha: new Date().toISOString(),
  cuerpoTexto: cuerpoEmitida('540000021'),
}

function solicitud(c: Parameters<typeof leerCorreoEventoAseguradora>[0]): EventoSolicitud {
  const e = leerCorreoEventoAseguradora(c)
  assert.ok(e, 'debe reconocerse')
  assert.equal(e.tipo, 'solicitud')
  return e as EventoSolicitud
}

test('Occident solicitud EMITIDA: nº de solicitud del asunto, póliza del cuerpo, fase «emitida», sin ilegibles', () => {
  const e = solicitud(EMITIDA)
  assert.equal(e.compania, 'occident')
  assert.equal(e.codigoDgs, 'C0468')
  assert.equal(e.numeroSolicitud, '170000021')
  assert.equal(e.fase, 'emitida')
  assert.equal(e.numeroPoliza, '540000021')
  assert.equal(e.estado, 'Solicitud emitida · póliza 540000021')
  assert.equal(e.ramo, 'Acc.colec.')
  assert.equal(e.motivoRechazo, null)
  assert.equal(e.ilegibles, 0)
  // El enlace de la emitida es de la PÓLIZA (refpoli), no del proyecto: no se guarda como enlace de la solicitud.
  assert.equal(e.url, null)
  assert.doesNotMatch(JSON.stringify(e), /Mediador Inventado|M000000X/)
})

test('Occident EMITIDA en la vista de Gmail (una línea con barras) se lee igual', () => {
  const e = solicitud({ ...EMITIDA, cuerpoTexto: `| ${cuerpoEmitida('540000021').replace(/\n+/g, ' ')} |` })
  assert.equal(e.fase, 'emitida')
  assert.equal(e.numeroPoliza, '540000021')
})

test('🪤 EMITIDA: si «Ingresada póliza número» o el refpoli del enlace dicen OTRO nº, la póliza queda null e ilegible', () => {
  const a = solicitud({ ...EMITIDA, cuerpoTexto: cuerpoEmitida('540000021', 'Ingresada póliza número 540000099') })
  assert.equal(a.fase, 'emitida')
  assert.equal(a.numeroPoliza, null)
  assert.equal(a.ilegibles, 1)
  assert.match(a.estado ?? '', /dudoso/)
  const b = solicitud({ ...EMITIDA, cuerpoTexto: cuerpoEmitida('540000021', 'Sin observaciones', urlPoliza('540000098')) })
  assert.equal(b.numeroPoliza, null)
  assert.equal(b.ilegibles, 1)
  // Sin observaciones ni enlace, basta la línea «Póliza:».
  const c = solicitud({ ...EMITIDA, cuerpoTexto: cuerpoEmitida('540000021', 'Sin observaciones', '') })
  assert.equal(c.numeroPoliza, '540000021')
})

test('🪤 cepo (3): una «Suscripción … Póliza N» SIN la frase «ha sido emitida» y SIN «Solicitud: N» no es una solicitud', () => {
  // Mismo cuerpo, sin la frase: queda «Póliza: N» y el nº del asunto no se puede confirmar con nada.
  const sinFrase = cuerpoEmitida('540000021').replace('ha sido emitida', 'ha sido modificada')
  assert.equal(leerCorreoEventoAseguradora({ ...EMITIDA, cuerpoTexto: sinFrase }), null)
  // Con la frase pero sin «Póliza:»: no hay nº de póliza que leer → no se adivina.
  assert.equal(leerCorreoEventoAseguradora({ ...EMITIDA, cuerpoTexto: cuerpoEmitida('540000021').replace(/Póliza: 540000021\n/, '') }), null)
  // Con «Solicitud:» de OTRO nº: el del asunto no se sabe qué es.
  assert.equal(leerCorreoEventoAseguradora({ ...EMITIDA, cuerpoTexto: cuerpoEmitida('540000021').replace('Póliza: 540000021', 'Solicitud: 170000099\nPóliza: 540000021') }), null)
  // La «solicitud del SUPLEMENTO … emitida» no es un proyecto de una oportunidad.
  assert.equal(leerCorreoEventoAseguradora({ ...EMITIDA, cuerpoTexto: cuerpoEmitida('540000021').replace('la solicitud de póliza referenciada ha sido emitida', 'la solicitud del suplemento de la póliza referenciada ha sido emitida') }), null)
  // El asunto CON guion «- Póliza N -» (recordatorios, regularizaciones) nunca es una solicitud.
  const guion = leerCorreoEventoAseguradora({ ...EMITIDA, asunto: 'Suscripción Acc.colec. - Póliza 540000021 - ACADEMIA INVENTADA' })
  assert.notEqual(guion?.tipo, 'solicitud')
})

// ── Solicitud ACEPTADA pendiente de emisión ──────────────────────────────────────────────────────────────────────
const ACEPTADA = {
  remitente: OCC,
  asunto: 'Suscripción RC.profes. 170000022,',
  cuerpoTexto: `| Le confirmamos que la solicitud de póliza referenciada ha sido aceptada y está pendiente de emisión: Contrato mediador: M00000 - Mediador Inventado Usuario solicitante: M000000X - Mediador Inventado Solicitud: 170000022 Modalidad: Responsabilidad civil profesional Tomador: Observaciones: OK suscripción. Puede consultar la solicitud a través del siguiente enlace: ${urlSolicitud('170000022')} ${AVISO} |`,
}

test('Occident solicitud ACEPTADA pte. de emisión: fase «aceptada», SIN nº de póliza (aún no hay), tomador vacío → null', () => {
  const e = solicitud(ACEPTADA)
  assert.equal(e.numeroSolicitud, '170000022')
  assert.equal(e.fase, 'aceptada')
  assert.equal(e.numeroPoliza, null)
  assert.equal(e.estado, 'Solicitud aceptada, pendiente de emisión')
  assert.equal(e.tomador, null)
  assert.equal(e.url, urlSolicitud('170000022'))
  assert.equal(e.ilegibles, 0)
  // La aceptada SÍ exige «Solicitud: <el mismo nº>».
  assert.equal(leerCorreoEventoAseguradora({ ...ACEPTADA, cuerpoTexto: ACEPTADA.cuerpoTexto.replace('Solicitud: 170000022 ', '') }), null)
})

test('Occident RECHAZADA: fase «rechazada» y el código de motivo en mayúsculas; la nota libre no sale', () => {
  const e = solicitud({
    remitente: OCC,
    asunto: 'Suscripción RC.indust. 170000023, Persona Inventada Ejemplo',
    cuerpoTexto: `Le informamos que la solicitud de póliza referenciada ha sido rechazada: Contrato mediador: M00000 - Mediador Inventado Solicitud: 170000023 Modalidad: Facturación Tomador: Persona Inventada Ejemplo Motivo del rechazo: RIESGO EXCLUIDO Observaciones: El riesgo no entra en nuestra contratación. ${urlSolicitud('170000023')}`,
  })
  assert.equal(e.fase, 'rechazada')
  assert.equal(e.estado, 'Solicitud rechazada')
  assert.equal(e.motivoRechazo, 'RIESGO EXCLUIDO')
  assert.equal(e.numeroPoliza, null)
  assert.doesNotMatch(JSON.stringify(e), /no entra en nuestra/)
  // Sin «Motivo del rechazo» (solo observaciones de una persona): null, no se inventa.
  const s = solicitud({ remitente: OCC, asunto: 'Suscripción Acc.colec. 170000024, ACADEMIA INVENTADA', cuerpoTexto: 'Le informamos que la solicitud de póliza referenciada ha sido rechazada: Solicitud: 170000024 Observaciones: Buenos días, deben cotizar con otra modalidad.' })
  assert.equal(s.motivoRechazo, null)
})

test('la variante CON guion «PTE DOCUMENTACION» lleva fase pte_documentacion; otros estados, fase null', () => {
  const g = solicitud({ remitente: OCC, asunto: 'Suscripción Acc.colec. - Solicitud 170000001 - ACADEMIA INVENTADA', cuerpoTexto: `| Contrato mediador: M00000 - Mediador Inventado PRIMA / PROY * PTE DOCUMENTACION Buenas tardes. ${urlSolicitud('170000001')} |` })
  assert.equal(g.fase, 'pte_documentacion')
  assert.equal(g.numeroPoliza, null)
  const f = solicitud({ remitente: OCC, asunto: 'Suscripción Acc.colec. - Solicitud 170000002 - ACADEMIA INVENTADA', cuerpoTexto: '| Contrato mediador: M00000 Finalización automática del proyecto |' })
  assert.equal(f.fase, null)
})

// ── Mensaje recibo (recibo a 70 días) ────────────────────────────────────────────────────────────────────────────
const MENSAJE = {
  remitente: OCC,
  asunto: 'Mensaje recibo 460000001-S (póliza GPAFJ0000001) PERSONA INVENTADA',
  cuerpoTexto: 'Mensajería de recibos: HAN PASADO 070 DÍAS DESDE LA FECHA DE INICIO DE COBRO DEL RECIBO. ROGAMOS AGILICEN SOLUCIÓN. GRACIAS. Puede acceder a consultar y/o dar respuesta a dicho mensaje a través de la agenda de su Portal: Agenda/Mensajería de Recibos.',
}

test('Occident «Mensaje recibo» a 70 días → pre_anulacion de ESE recibo y póliza (del asunto), SIN fecha inventada', () => {
  const e = leerCorreoEventoAseguradora(MENSAJE) as EventoPreAnulacion | null
  assert.ok(e)
  assert.equal(e.tipo, 'pre_anulacion')
  assert.equal(e.compania, 'occident')
  assert.deepEqual(e.recibos, [{ numeroPoliza: 'GPAFJ0000001', idRecibo: '460000001-S', importe: null, fechaLimite: null }])
  assert.equal(e.ilegibles, 0)
  assert.doesNotMatch(JSON.stringify(e), /PERSONA INVENTADA/)
})

test('«Mensaje recibo» con fecha explícita en el cuerpo la usa; otro mensaje de la agenda NO es este aviso', () => {
  const con = leerCorreoEventoAseguradora({ ...MENSAJE, cuerpoTexto: `${MENSAJE.cuerpoTexto} Fecha de anulación: 30.11.2026` }) as EventoPreAnulacion | null
  assert.equal(con?.recibos[0]?.fechaLimite, '2026-11-30')
  // Texto de una persona en la agenda (no el aviso de plazo): no se lee como pre-anulación.
  assert.equal(leerCorreoEventoAseguradora({ ...MENSAJE, cuerpoTexto: 'Mensajería de recibos: EL CLIENTE INDICA QUE YA HA PAGADO POR TRANSFERENCIA.' }), null)
  // Otro dominio o un reenvío: nada.
  assert.equal(leerCorreoEventoAseguradora({ ...MENSAJE, remitente: 'alguien@gmail.com' }), null)
  assert.equal(leerCorreoEventoAseguradora({ ...MENSAJE, asunto: `RV: ${MENSAJE.asunto}` }), null)
})

// ── Mandato SEPA: se reconoce y se ignora ────────────────────────────────────────────────────────────────────────
const MANDATO = {
  remitente: OCC,
  asunto: 'Suscripción Acc.colec. - Póliza 540000031 - ACADEMIA INVENTADA DE FORMACION PROFESI',
  cuerpoTexto: '| Contrato: M00000-Mediador Inventado Recordatorio de firma de mandato Recuerde que debe gestionar la firma del mandato de cobro bancario por parte del Cliente http://portaloccident.gco.global/ |',
}

test('🪤 cepo (4): el recordatorio de firma de mandato SEPA se RECONOCE (ignorable) y NO es un evento (ni tarea ni aviso)', () => {
  assert.equal(avisoCompaniaIgnorado(MANDATO), 'mandato_sepa')
  assert.equal(leerCorreoEventoAseguradora(MANDATO), null)
})

test('mandato: ante la duda NO se ignora (otra señal en el cuerpo, otro dominio, reenvío, otro asunto)', () => {
  assert.equal(avisoCompaniaIgnorado({ ...MANDATO, cuerpoTexto: `${MANDATO.cuerpoTexto} Aviso Recordatorio Regularización` }), null)
  assert.equal(avisoCompaniaIgnorado({ ...MANDATO, remitente: 'alguien@gmail.com' }), null)
  assert.equal(avisoCompaniaIgnorado({ ...MANDATO, asunto: `RV: ${MANDATO.asunto}` }), null)
  assert.equal(avisoCompaniaIgnorado({ ...MANDATO, asunto: 'Suscripción Acc.colec. 170000021, ACADEMIA' }), null)
  assert.equal(avisoCompaniaIgnorado({ ...MANDATO, cuerpoTexto: '| Contrato: M00000 Recordatorio de firma de mandato |' }), null)
  // La regularización de RC (mismo asunto con guion) sigue siendo un suplemento.
  const sup = leerCorreoEventoAseguradora({ remitente: OCC, asunto: 'Suscripción RC.constr. - Póliza 540000032 - OBRAS INVENTADAS SL', cuerpoTexto: 'Aviso Recordatorio Regularización Enviada en fecha 02.10.2026 carta de recordatorio al mediador, indicándole que no han ingresado suplemento de regularización comunicando el dato real de facturación. Periodo: 18.06.2025 a 18.06.2026.' })
  assert.equal(sup?.tipo, 'suplemento')
  assert.equal(avisoCompaniaIgnorado({ remitente: OCC, asunto: 'Suscripción RC.constr. - Póliza 540000032 - OBRAS', cuerpoTexto: 'Aviso Recordatorio Regularización … no han ingresado suplemento de regularización' }), null)
})
