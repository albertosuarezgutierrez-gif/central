import test from 'node:test'
import assert from 'node:assert/strict'
import { leerCorreoEventoAseguradora, motivoReciboAnulado, type EventoAnulacion, type EventoSolicitud } from './evento-correo-aseguradora.ts'

// Dos formatos de Occident vistos en correos REALES de oct 2026 que el lector no reconocía (20/10/2026):
// · «Suscripción <ramo> <nº>, <tomador>» (solicitud rechazada, SIN guion) → `solicitud`.
// · «Resumen de recibos anulados por impago <med> - <med> (dd.mm.aaaa)» → `anulacion`, una entrada por recibo.
// Tomador, mediador, nº de solicitud/póliza/recibo, nota del suscriptor y fechas cambiados por otros inventados
// del mismo formato.
const OCC = 'mediadores@occidentinforma.com'
const AVISO = 'Por favor, no responda directamente a este correo. Aviso de confidencialidad: Esta comunicación y los documentos que en su caso lleve anexos, son para uso exclusivo del destinatario arriba indicado.'
const url = (n: string) => `https://portaloccident.gco.global/Aplicacion/Paginas/default.aspx?marco=false&aplicacion=AplicacionesSCO&urlTransaccion=FE/SGE.Gestion.Proyectos.FE.AccesoProyecto/?idSubscripcio=00${n}`

// ── Solicitud rechazada, asunto sin guion ────────────────────────────────────────────────────────────

const cuerpoRechazo = (n: string, extra = '') => ` Suscripción Acc.colec. ${n}, ACADEMIA INVENTADA DE FORMACION PROFESI

| |
| [](https://gco.quadientcloud.eu/api/query/Messenger/TrackerQuery?Uri=xxx) |
| |

| |
| Le informamos que la solicitud de póliza referenciada ha sido rechazada: Contrato mediador: M00000 - Mediador Inventado Usuario solicitante: M000000X - Mediador Inventado Solicitud: ${n} Modalidad: Accidentes colectivo educación Tomador: ${extra}Observaciones: Buenos días, deben cotizar a través de otra modalidad. Gracias, un saludo Puede consultar la solicitud de póliza rechazada a través del siguiente enlace: ${url(n)} ${AVISO} |
| |`

const RECHAZO = {
  remitente: OCC,
  asunto: 'Suscripción Acc.colec. 170000011, ACADEMIA INVENTADA DE FORMACION PROFESI',
  fecha: '2026-10-15T12:11:20Z',
  cuerpoTexto: cuerpoRechazo('170000011'),
}

// Por IMAP (triaje): celda por línea, con «Motivo del rechazo» (visto en un RC.indust.).
const RECHAZO_IMAP = {
  remitente: OCC,
  asunto: 'Suscripción RC.indust. 170000012, Persona Inventada Ejemplo',
  cuerpoTexto: `Suscripción RC.indust. 170000012, Persona Inventada Ejemplo
Le informamos que la solicitud de póliza referenciada ha sido rechazada: Contrato mediador: M00000 - Mediador Inventado Usuario solicitante: M000000X - Mediador Inventado Solicitud: 170000012 Modalidad: Facturación Tomador: Persona Inventada Ejemplo Fecha de solicitud: 15-10-2026 Fecha de rechazo: 15-10-2026 Motivo del rechazo: RIESGO EXCLUIDO Observaciones: El riesgo no entra en nuestra contratación.
Puede consultar la solicitud de póliza rechazada a través del siguiente enlace:
${url('170000012')}
${AVISO}`,
}

// Mismo asunto, pero es la solicitud de un SUPLEMENTO de una póliza ya emitida.
const SUPLEMENTO_RECHAZADO = {
  remitente: OCC,
  asunto: 'Suscripción Acc.colec. 170000013, ACADEMIA INVENTADA DE FORMACION PROFESI',
  cuerpoTexto: `| Le informamos que la solicitud del suplemento de la póliza referenciada ha sido rechazada: Contrato mediador: M00000 - Mediador Inventado Usuario solicitante: M000000X - Mediador Inventado Solicitud: 170000013 Póliza: 540000001 Tipo de suplemento: Modificación general Modalidad: Accidentes colectivo educación Tomador: Observaciones: si se trata de otro curso deben emitir póliza nueva. Puede consultar la solicitud a través del siguiente enlace: ${url('170000013')} ${AVISO} |`,
}

function solicitud(c: Parameters<typeof leerCorreoEventoAseguradora>[0]): EventoSolicitud {
  const e = leerCorreoEventoAseguradora(c)
  assert.ok(e, 'debe reconocerse')
  assert.equal(e.tipo, 'solicitud')
  return e as EventoSolicitud
}

test('Occident solicitud SIN guion (vista Gmail): nº, ramo, tomador, estado «rechazada» y enlace', () => {
  const e = solicitud(RECHAZO)
  assert.equal(e.compania, 'occident')
  assert.equal(e.codigoDgs, 'C0468')
  assert.equal(e.numeroSolicitud, '170000011')
  assert.equal(e.ramo, 'Acc.colec.')
  assert.equal(e.tomador, 'ACADEMIA INVENTADA DE FORMACION PROFESI')
  assert.equal(e.estado, 'Solicitud rechazada')
  assert.equal(e.url, url('170000011'))
  assert.equal(e.ilegibles, 0)
  // La nota libre del suscriptor y el mediador no salen.
  assert.doesNotMatch(JSON.stringify(e), /Buenos días|Mediador Inventado|M000000X/)
})

test('Occident solicitud SIN guion por IMAP (celda por línea), ramo RC.indust.', () => {
  const e = solicitud(RECHAZO_IMAP)
  assert.equal(e.numeroSolicitud, '170000012')
  assert.equal(e.ramo, 'RC.indust.')
  assert.equal(e.tomador, 'Persona Inventada Ejemplo')
  assert.equal(e.estado, 'Solicitud rechazada')
  assert.equal(e.url, url('170000012'))
  assert.equal(e.ilegibles, 0)
})

test('Occident solicitud SIN guion sin la frase de rechazo: se reconoce, estado null y se CUENTA ilegible', () => {
  const e = solicitud({ ...RECHAZO, cuerpoTexto: RECHAZO.cuerpoTexto.replace('ha sido rechazada', 'ha cambiado de situación') })
  assert.equal(e.estado, null)
  assert.equal(e.ilegibles, 1)
  assert.equal(e.numeroSolicitud, '170000011')
})

test('Occident SIN guion: el asunto solo no basta — sin «Solicitud: <el mismo nº>» en el cuerpo, no se lee', () => {
  // Otro nº en el cuerpo: el del asunto no se sabe qué es.
  assert.equal(leerCorreoEventoAseguradora({ ...RECHAZO, cuerpoTexto: RECHAZO.cuerpoTexto.replace('Solicitud: 170000011', 'Solicitud: 170000099') }), null)
  // Sin «Solicitud:» en el cuerpo.
  assert.equal(leerCorreoEventoAseguradora({ ...RECHAZO, cuerpoTexto: RECHAZO.cuerpoTexto.replace('Solicitud: 170000011 ', '') }), null)
  // La solicitud de un SUPLEMENTO (de una póliza ya emitida) no es una solicitud de oportunidad.
  assert.equal(leerCorreoEventoAseguradora(SUPLEMENTO_RECHAZADO), null)
  // Otro dominio o un reenvío: no es la compañía.
  assert.equal(leerCorreoEventoAseguradora({ ...RECHAZO, remitente: 'alguien@gmail.com' }), null)
  assert.equal(leerCorreoEventoAseguradora({ ...RECHAZO, asunto: `RV: ${RECHAZO.asunto}` }), null)
})

test('la variante CON guion y los suplementos «- Póliza …» siguen igual', () => {
  const g = solicitud({
    remitente: OCC,
    asunto: 'Suscripción Acc.colec. - Solicitud 170000001 - ACADEMIA INVENTADA DE FORMACION PROFESI',
    cuerpoTexto: `| Contrato mediador: M00000 - Mediador Inventado PRIMA / PROY * PTE DOCUMENTACION Buenas tardes. ${url('170000001')} ${AVISO} |`,
  })
  assert.equal(g.estado, 'PRIMA / PROY * PTE DOCUMENTACION')
  assert.equal(g.numeroSolicitud, '170000001')
  // Con guion NO hace falta «Solicitud:» en el cuerpo (como hasta ahora).
  assert.equal(g.ilegibles, 0)
  const sup = leerCorreoEventoAseguradora({ remitente: OCC, asunto: 'Suscripción RC.constr. - Póliza 540000002 - OBRAS INVENTADAS SL', cuerpoTexto: 'Aviso Recordatorio Regularización … no han ingresado suplemento de regularización … Periodo: 18.06.2025 a 18.06.2026.' })
  assert.equal(sup?.tipo, 'suplemento')
})

// ── Resumen de recibos anulados por impago ───────────────────────────────────────────────────────────

const filaAnulada = (poliza: string, recibo: string, fecha: string) => `Póliza: ${poliza} - Recibo: ${recibo} - Anulado en fecha: ${fecha}`
const cuerpoAnulados = (filas: string[]) => ` Resumen de recibos anulados por impago 00000001 - 00000002 (16.10.2026)

| |
| [](https://gco.quadientcloud.eu/api/query/Messenger/TrackerQuery?Uri=xxx) |
| |

| |
| Adjuntamos listado de recibos que se han anulado de forma automática por superar el plazo de cobro previsto. Rogamos que realicen las comprobaciones que consideren oportunas: ${filas.join(' ')} Por favor, no responda directamente a este correo. La cuenta de correo remitente tiene propósito exclusivamente informativo. Para informar los datos bancarios puede hacerlo por la agenda de recibo o enviar correo al buzón del Centro Administrativo Contable que tengan asignado |
| |`

const ANULADO = {
  remitente: OCC,
  asunto: 'Resumen de recibos anulados por impago 00000001 - 00000002 (16.10.2026)',
  fecha: '2026-10-17T05:02:04Z',
  cuerpoTexto: cuerpoAnulados([filaAnulada('BIDS000001', '480000001-H', '15.10.2026')]),
}

function anulacion(c: Parameters<typeof leerCorreoEventoAseguradora>[0]): EventoAnulacion {
  const e = leerCorreoEventoAseguradora(c)
  assert.ok(e, 'debe reconocerse')
  assert.equal(e.tipo, 'anulacion')
  return e as EventoAnulacion
}

test('Occident anulados por impago (un recibo): póliza, recibo y fecha de anulación; SIN fecha de efecto inventada', () => {
  const e = anulacion(ANULADO)
  assert.equal(e.compania, 'occident')
  assert.equal(e.codigoDgs, 'C0468')
  // Lo anulado es el RECIBO: sin póliza «principal» (un puerto viejo no anotaría «póliza anulada»).
  assert.equal(e.numeroPoliza, null)
  // «Anulado en fecha» es del RECIBO: la fecha de efecto de la baja no la da el correo.
  assert.equal(e.fechaEfecto, null)
  assert.equal(e.motivo, 'Recibo 480000001-H anulado por impago el 15/10/2026 (anulación automática)')
  assert.deepEqual(e.recibos, [{ numeroPoliza: 'BIDS000001', idRecibo: '480000001-H', fechaAnulacion: '2026-10-15' }])
  assert.equal(e.ilegibles, 0)
  // Los nº del asunto son del mediador: no salen como póliza.
  assert.doesNotMatch(JSON.stringify(e), /00000001|00000002/)
})

test('Occident anulados por impago: póliza con puntos y guiones (formato real «8-10.000.000-P»)', () => {
  const e = anulacion({ ...ANULADO, cuerpoTexto: cuerpoAnulados([filaAnulada('8-10.000.001-P', '470000001-H', '31.07.2026')]) })
  assert.equal(e.recibos?.[0]?.numeroPoliza, '8-10.000.001-P')
  assert.equal(e.recibos?.[0]?.fechaAnulacion, '2026-07-31')
})

test('Occident anulados por impago con VARIOS recibos: una entrada por recibo, sin póliza «principal»', () => {
  const e = anulacion({ ...ANULADO, cuerpoTexto: cuerpoAnulados([
    filaAnulada('BIDS000001', '480000001-H', '15.10.2026'),
    filaAnulada('8-10.000.001-P', '470000001-H', '14.10.2026'),
    filaAnulada('BIDS000001', '480000001-H', '15.10.2026'), // repetida: una vez
  ]) })
  assert.equal(e.numeroPoliza, null)
  assert.equal(e.fechaEfecto, null)
  assert.equal(e.recibos?.length, 2)
  assert.deepEqual(e.recibos?.map((r) => r.numeroPoliza), ['BIDS000001', '8-10.000.001-P'])
  assert.equal(e.motivo, '2 recibos anulados por impago (anulación automática)')
  assert.equal(e.ilegibles, 0) // la repetida se lee bien: no es ilegible
})

test('Occident anulados por impago: fila que no cuadra → ilegible; sin ninguna fila → reconocido e ilegible', () => {
  const mal = anulacion({ ...ANULADO, cuerpoTexto: cuerpoAnulados([filaAnulada('BIDS000001', '480000001-H', '15.10.2026'), 'Póliza: BIDS000002 - Recibo: (ver adjunto)']) })
  assert.equal(mal.recibos?.length, 1)
  assert.equal(mal.ilegibles, 1)
  const vacio = anulacion({ ...ANULADO, cuerpoTexto: cuerpoAnulados(['(listado en el adjunto)']) })
  assert.deepEqual(vacio.recibos, [])
  assert.equal(vacio.numeroPoliza, null)
  assert.equal(vacio.motivo, null)
  assert.equal(vacio.ilegibles, 1)
})

test('anulados: negativos — «próximos a la anulación» sigue siendo pre_anulacion; otro dominio y reenvío, nada', () => {
  const pre = leerCorreoEventoAseguradora({
    remitente: OCC, asunto: 'Resumen de recibos próximos a la anulación 00000001 (06.10.2026)',
    cuerpoTexto: 'Rogamos gestionen el cobro: Póliza: BIDS000001 - Recibo: 480000001-H - Fecha anulación: 15.10.2026 Por favor, …',
  })
  assert.equal(pre?.tipo, 'pre_anulacion')
  // Una fila de pre-anulación no se lee como anulada (ni al revés).
  assert.equal(anulacion({ ...ANULADO, cuerpoTexto: 'Póliza: BIDS000001 - Recibo: 480000001-H - Fecha anulación: 15.10.2026' }).recibos?.length, 0)
  assert.equal(leerCorreoEventoAseguradora({ ...ANULADO, remitente: 'alguien@gmail.com' }), null)
  assert.equal(leerCorreoEventoAseguradora({ ...ANULADO, asunto: `Fwd: ${ANULADO.asunto}` }), null)
  // La anulación de Allianz sigue sin `recibos`.
  const alz = leerCorreoEventoAseguradora({
    remitente: 'osn@allianz.es', asunto: 'OSN-CCC: Comunicación Anulación Póliza P-03100000000000',
    cuerpoTexto: 'TOMADOR: X PÓLIZA : 031000000 . En respuesta a su petición, le informamos que hemos procedido a la anulación de la póliza reseñada a partir de la fecha 01-11-2026.',
  })
  assert.ok(alz && alz.tipo === 'anulacion')
  assert.equal(alz.numeroPoliza, '031000000')
  assert.equal(alz.recibos, undefined)
})

test('motivoReciboAnulado: sin fecha no inventa una', () => {
  assert.equal(motivoReciboAnulado({ idRecibo: '480000001-H', fechaAnulacion: null }), 'Recibo 480000001-H anulado por impago (anulación automática)')
})
