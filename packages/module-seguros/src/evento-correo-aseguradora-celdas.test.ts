import test from 'node:test'
import assert from 'node:assert/strict'
import { ACCIONES_TRAMITADOR, eventoNecesitaAdjuntos, leerCorreoEventoAseguradora } from './evento-correo-aseguradora.ts'

// 🚨 Formato REAL del triaje (14/10/2026). Los avisos de Occident son SOLO HTML y el triaje los lee por IMAP
// con `mailparser` (`apps/plataforma/lib/correo/imap.ts`), que pasa cada celda de tabla a UNA LÍNEA, sin `|`,
// y parte las líneas largas a ~80 caracteres. Los fixtures con barras del otro test son la conversión de
// Gmail, que el triaje NO ve. Cada constante de aquí es la salida de `simpleParser(...).text` sobre una
// copia ANONIMIZADA del HTML real (misma estructura de tablas/div/span/&nbsp;; nombres, NIF y números
// inventados). Reale, Mapfre y el «Tramitador» llegan en text/plain: su fixture del otro test ya es el real.

const CELDAS_DETALLE = "Si no ve bien este e-mail, pulse aquí [https://example.invalid/tracker]\n \n\nAsegurado: Persona Inventada Uno\nPóliza: 806000001\n\nNúmero Siniestro: 43000001\nFecha y Hora: 15.09.2026 18:40\n\n\n \n\nLe detallamos a continuación las acciones realizadas en el expediente:\nFecha/Hora\nAcción\n2026-09-15-18.50\nApertura de expediente con cargo a póliza\n *  \n\n2026-09-15-18.50\nEl reparador ha sido designado y comienza el proceso de reparación\n * REPARACIONES INVENTADAS S.L.\n\nLe seguiremos informando al día de todo aquello que pueda serle de utilidad.\n\n \n\nAntes de imprimir este correo, valore si realmente es necesario. El\nmedioambiente es cosa de todos.\nPor favor, no responda directamente a este correo."

const CELDAS_RESUMEN = "Si no ve bien este e-mail, pulse aquí [https://example.invalid/tracker]\n \nEstimado Mediador,\n \nA continuación encontrará el informe agrupado de las acciones realizadas.\n \nLe seguiremos informando al día de todo aquello que pueda serle de utilidad.\n \n\n \n\nApertura de Siniestros\n \n\n\nNúmero Siniestro\nPóliza\nCliente\nNIF\nMatrícula\nFecha de Ocurrencia\nSubtipo de Siniestro\n43000003\n547000001\nEMPRESA INVENTADA SL\n00000000 T\n \n\n18.08.2026\nDaños por agua\n\n \n\nTerminaciones\n \n\n\nNúmero Siniestro\nPóliza\nCliente\nNIF\nMatrícula\nFecha de Ocurrencia\nSubtipo de Siniestro\n42000004\nBIDP000001\nCOMUNIDAD DE PROPIETARIOS INVENTADA\n11111111 H\n \n\n25.08.2026\nRotura de tuberías y escapes COMUNITARIOS\n\n \n\nPagos Realizados\n \n\n\nNo hay pagos.\nAntes de imprimir este correo, valore si realmente es necesario. El\nmedioambiente es cosa de todos.\nPor favor, no responda directamente a este correo."

const CELDAS_PRE_ANULACION = "[https://example.invalid/logo.png]https://example.invalid/\nAdjuntamos listado de recibos que están próximos a superar el plazo de cobro\nprevisto y que en caso de no resolución se procederá a su anulación.\n                   \nRogamos que se realice el cobro de cada uno de los recibos lo antes posible :\n                     \nPóliza: BIDS000001 - Recibo: 480000001-H - Fecha anulación: 15.10.2026\n                        \nPóliza: 8-10.000.001-P - Recibo: 470000002-H - Fecha anulación: 31.10.2026\n                        \nPor favor, no responda directamente a este correo. La cuenta de correo remitente\ntiene propósito exclusivamente informativo y no puede ser empleada como destino\nen comunicaciones. Para informar los datos bancarios puede hacerlo por la agenda\nde recibo"

const CELDAS_REGULARIZACION = "[https://example.invalid/logo.png]https://example.invalid/\nRef. póliza de Responsabilidad Civil nº BIDS000002\nTomador: OBRAS INVENTADAS SL\nPeríodo de regularización:  6/2025 a  6/2026\nApreciado colaborador:\nComo usted ya sabe, recientemente nos dirigimos al Asegurado y le solicitamos se\npusiera en contacto con usted para facilitarle los datos de facturación de su\nempresa o actividad, en relación a la póliza de referencia.\nTeniendo en consideración lo importante que es, tanto para el Asegurado como\npara la Compañía disponer de los datos de la póliza actualizados, le comunicamos\nque nos dirigimos nuevamente al Asegurado y le volvemos a insistir en la\nnecesidad de facilitarnos dicha información.\nAtentamente,"

const CELDAS_SUSCRIPCION_RC = "[https://example.invalid/logo.png]https://example.invalid/\nContrato: M00000-Nombre Mediador\n\nAviso Recordatorio Regularización                                         \n\nEnviada en fecha 02.10.2026 carta de recordatorio al mediador, indicándole que\nno han ingresado suplemento de regularización comunicando el dato real de\nfacturación o la base de cálculo para cumplir con la obligación de regularizar\nesta póliza tanto si ha habido modificaciones como si no. Periodo: 18.06.2025 a\n18.06.2026.\n                                                                                                                        \n\n\nhttp://example.invalid/portal?a=1&b=2\n\n\nLOPD y CONFIDENCIALIDAD: La información contenida en este mensaje es\nconfidencial."

const CELDAS_ALLIANZ_ANULACION = "Remite: Allianz, Compañía de Seguros y Reaseguros, S.A. Telf. 900000000 Para:\nNOMBRE MEDIADOR INVENTADO\n\n30 de Septiembre de 2026                                        \n\n\n\nTOMADOR: APELLIDO INVENTADO, NOMBRE.\nPÓLIZA : 031000001 .                                                            \n  \n\nApreciado/a Colaborador/a:\n\nEn respuesta a su petición, le informamos que hemos procedido a la anulación de\nla póliza reseñada a partir de la fecha 01-11-2026.\n\nQuedamos a su disposición para cualquier duda o aclaración al respecto."

const OCC = 'mediadores@occidentinforma.com'

test('celda por línea · Occident «Siniestro Diversos»: lee póliza, ocurrencia y TODAS las acciones', () => {
  const e = leerCorreoEventoAseguradora({ remitente: OCC, asunto: 'Siniestro Diversos 43000001 Persona Inventada Uno', fecha: '2026-09-16T05:01:20Z', cuerpoTexto: CELDAS_DETALLE })
  assert.ok(e && e.tipo === 'siniestro')
  assert.equal(e.ilegibles, 0)
  assert.deepEqual(e.siniestros, [{
    subtipo: 'apertura', numeroSiniestro: '43000001', numeroPoliza: '806000001', ramo: null,
    fechaOcurrencia: '2026-09-15', fechaAccion: '2026-09-15',
    accion: 'Apertura de expediente con cargo a póliza · El reparador ha sido designado y comienza el proceso de reparación',
  }])
  assert.doesNotMatch(JSON.stringify(e), /Persona Inventada|REPARACIONES/)
})

test('celda por línea · Occident «Siniestro Diversos»: una acción partida en dos líneas se une', () => {
  const larga = 'Se ha recibido la valoración del perito y se ha comunicado al asegurado la propuesta de'
  const cuerpo = CELDAS_DETALLE.replace('El reparador ha sido designado y comienza el proceso de reparación', `${larga}\nindemnización`)
  const e = leerCorreoEventoAseguradora({ remitente: OCC, asunto: 'Siniestro Diversos 43000001 Persona Inventada Uno', cuerpoTexto: cuerpo })
  assert.ok(e && e.tipo === 'siniestro')
  assert.match(e.siniestros[0].accion ?? '', /propuesta de indemnización$/)
})

test('celda por línea · Occident resumen de acciones: aperturas y terminaciones (antes salía VACÍO y sin ilegibles)', () => {
  const e = leerCorreoEventoAseguradora({ remitente: OCC, asunto: 'NOMBRE MEDIADOR, comunicación de las acciones generadas en su expediente', cuerpoTexto: CELDAS_RESUMEN })
  assert.ok(e && e.tipo === 'siniestro')
  assert.equal(e.ilegibles, 0)
  assert.deepEqual(e.siniestros.map((s) => [s.subtipo, s.numeroSiniestro, s.numeroPoliza, s.fechaOcurrencia, s.accion]), [
    ['apertura', '43000003', '547000001', '2026-08-18', 'Apertura: Daños por agua'],
    ['cierre', '42000004', 'BIDP000001', '2026-08-25', 'Terminación: Rotura de tuberías y escapes COMUNITARIOS'],
  ])
  assert.doesNotMatch(JSON.stringify(e), /EMPRESA INVENTADA|COMUNIDAD|00000000 T|11111111 H/)
})

test('🪤 celda por línea · resumen: una fila de «Pagos» (formato no visto) se CUENTA, no se inventa', () => {
  const cuerpo = CELDAS_RESUMEN.replace('No hay pagos.', '42000004\nBIDP000001\nX\n11111111 H\n1.200,00\n25.08.2026')
  const e = leerCorreoEventoAseguradora({ remitente: OCC, asunto: 'X, comunicación de las acciones generadas en su expediente', cuerpoTexto: cuerpo })
  assert.ok(e && e.tipo === 'siniestro')
  assert.equal(e.siniestros.length, 2)
  assert.ok(e.ilegibles >= 1)
})

test('🪤 celda por línea · resumen: una fila sin fecha de ocurrencia en su sitio se CUENTA como ilegible', () => {
  const cuerpo = CELDAS_RESUMEN.replace('18.08.2026', 'sin fecha')
  const e = leerCorreoEventoAseguradora({ remitente: OCC, asunto: 'X, comunicación de las acciones generadas en su expediente', cuerpoTexto: cuerpo })
  assert.ok(e && e.tipo === 'siniestro')
  assert.deepEqual(e.siniestros.map((s) => s.numeroSiniestro), ['42000004'])
  assert.equal(e.ilegibles, 1)
})

test('celda por línea · Occident próximos a la anulación', () => {
  const e = leerCorreoEventoAseguradora({ remitente: OCC, asunto: 'Resumen de recibos próximos a la anulación 00300000 - 00100000 (06.10.2026)', cuerpoTexto: CELDAS_PRE_ANULACION })
  assert.ok(e && e.tipo === 'pre_anulacion')
  assert.equal(e.ilegibles, 0)
  assert.deepEqual(e.recibos, [
    { numeroPoliza: 'BIDS000001', idRecibo: '480000001-H', importe: null, fechaLimite: '2026-10-15' },
    { numeroPoliza: '8-10.000.001-P', idRecibo: '470000002-H', importe: null, fechaLimite: '2026-10-31' },
  ])
})

test('celda por línea · Occident regularización de RC y «Suscripción RC.constr.»', () => {
  const r = leerCorreoEventoAseguradora({ remitente: 'clientes@occidentinforma.com', asunto: 'OBRAS INVENTADAS SL, Regularización responsabilidad civil', cuerpoTexto: CELDAS_REGULARIZACION })
  assert.ok(r && r.tipo === 'suplemento')
  assert.deepEqual([r.numeroPoliza, r.periodoDesde, r.periodoHasta, r.ilegibles], ['BIDS000002', '2025-06', '2026-06', 0])
  const s = leerCorreoEventoAseguradora({ remitente: OCC, asunto: 'Suscripción RC.constr. - Póliza BIDS000002 - OBRAS INVENTADAS SL', cuerpoTexto: CELDAS_SUSCRIPCION_RC })
  assert.ok(s && s.tipo === 'suplemento')
  assert.deepEqual([s.numeroPoliza, s.periodoDesde, s.periodoHasta, s.ilegibles], ['BIDS000002', '2025-06-18', '2026-06-18', 0])
  assert.doesNotMatch(JSON.stringify([r, s]), /OBRAS INVENTADAS|Nombre Mediador/)
})

test('celda por línea · Allianz OSN-CCC (la póliza y la fecha vienen partidas en varias líneas)', () => {
  const e = leerCorreoEventoAseguradora({ remitente: '$s0000uca@allianz.es', asunto: 'OSN-CCC: Comunicación Anulación Póliza P-03100000100000', cuerpoTexto: CELDAS_ALLIANZ_ANULACION })
  assert.ok(e && e.tipo === 'anulacion')
  assert.deepEqual([e.numeroPoliza, e.fechaEfecto, e.motivo, e.ilegibles], ['031000001', '2026-11-01', 'A petición del mediador', 0])
  assert.doesNotMatch(JSON.stringify(e), /APELLIDO INVENTADO/)
})

// ── «Tramitador»: su nota es texto LIBRE (firma, perjudicado, teléfonos…) → solo un estado de lista cerrada ──

const TRAMITADOR = {
  remitente: 'noreply@comunicacionesoccident.com',
  asunto: 'Tramitador Siniestro RC.constr. - 42000005 -  INVE',
  fecha: '2026-09-09T09:56:16Z',
}

test('Tramitador: la acción es un estado de la lista cerrada, nunca la nota (que lleva firma y nombres)', () => {
  const casos: [string, string][] = [
    ['ponemos en disposición de perjudicado el importe de 895,47 €.\nSaludos.\nNombrefirma.', 'Pago o propuesta de pago'],
    ['Quedamos a la espera de que D. Fulano Inventado (600 000 000) aporte copia de DNI.', 'Pide documentación'],
    ['Le informamos de que el expediente queda cerrado.', 'Cierre del expediente'],
    ['Rehusamos el siniestro por falta de cobertura.', 'Rehúse'],
    ['Hemos hablado con Fulana Inventada en el 600000000.', 'Nota del tramitador (ver el correo)'],
  ]
  for (const [nota, esperado] of casos) {
    const e = leerCorreoEventoAseguradora({ ...TRAMITADOR, cuerpoTexto: `Contrato: M00000\n\n${nota}\n\nhttps://example.invalid/x` })
    assert.ok(e && e.tipo === 'siniestro', nota)
    assert.equal(e.siniestros[0].accion, esperado, nota)
    assert.ok((ACCIONES_TRAMITADOR as readonly string[]).includes(e.siniestros[0].accion ?? ''), nota)
    assert.doesNotMatch(JSON.stringify(e), /Fulan|Nombrefirma|600 ?000 ?000/, nota)
  }
})

test('Tramitador «cerrado» sigue siendo subtipo cierre', () => {
  const e = leerCorreoEventoAseguradora({ ...TRAMITADOR, cuerpoTexto: 'Contrato: M00000\n\nEl siniestro ha sido finalizado.' })
  assert.ok(e && e.tipo === 'siniestro')
  assert.equal(e.siniestros[0].subtipo, 'cierre')
})

// ── Qué formatos necesitan el texto de los adjuntos (el triaje no lee PDFs para el resto) ──

test('eventoNecesitaAdjuntos: solo las listas de pre-anulación (Occident y Reale)', () => {
  assert.equal(eventoNecesitaAdjuntos({ remitente: OCC, asunto: 'Resumen de recibos próximos a la anulación 1 - 2 (06.10.2026)' }), true)
  assert.equal(eventoNecesitaAdjuntos({ remitente: 'contabilidad.mediadores@reale.es', asunto: 'REALE - Informacion de Pre-anulaciones Automaticas 10/10/26' }), true)
  assert.equal(eventoNecesitaAdjuntos({ remitente: '$s0000uca@allianz.es', asunto: 'OSN-CCC: Comunicación Anulación Póliza P-0310' }), false)
  assert.equal(eventoNecesitaAdjuntos({ remitente: OCC, asunto: 'Siniestro Diversos 43000001 X' }), false)
  assert.equal(eventoNecesitaAdjuntos({ remitente: 'x@example.invalid', asunto: 'Resumen de recibos próximos a la anulación' }), false)
})
