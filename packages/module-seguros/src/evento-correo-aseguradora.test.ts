import test from 'node:test'
import assert from 'node:assert/strict'
import { contieneIban, leerCorreoEventoAseguradora, sinDatosSensibles, type EventoAseguradora } from './evento-correo-aseguradora.ts'
import { leerCorreoDevolucion } from './devolucion-correo.ts'

// Formatos copiados de correos REALES (jul-oct 2026). Nombres, NIF, IBAN, teléfonos y nº de
// póliza/siniestro/recibo cambiados por otros inventados del mismo formato.

const PIE_OCCIDENT = '| Antes de imprimir este correo, valore si realmente es necesario. Por favor, no responda directamente a este correo. |'

const OCC_SINIESTRO_APERTURA = {
  remitente: 'mediadores@occidentinforma.com',
  asunto: 'Siniestro Diversos 43000001 Persona Inventada Uno',
  fecha: '2026-09-16T05:01:20Z',
  cuerpoTexto: ` Siniestro Diversos 43000001 Persona Inventada Uno

| |
| Si no ve bien este e-mail, pulse aquí[](https://example.invalid/tracker) |
| |

| |
| Asegurado: Persona Inventada Uno Póliza: 806000001 Número Siniestro: 43000001 Fecha y Hora: 15.09.2026 18:40 |
| Le detallamos a continuación las acciones realizadas en el expediente: |

| |
| Fecha/Hora | Acción |

| 2026-09-15-18.50 | |
| Apertura de expediente con cargo a póliza |

| * |

| 2026-09-15-18.50 | |
| El reparador ha sido designado y comienza el proceso de reparación |

| * REPARACIONES INVENTADAS S.L. |

| Le seguiremos informando al día de todo aquello que pueda serle de utilidad. |

${PIE_OCCIDENT}`,
}

const OCC_SINIESTRO_CIERRE = {
  remitente: 'mediadores@occidentinforma.com',
  asunto: 'Siniestro Diversos 42000002 Persona Inventada Uno',
  fecha: '2026-09-25T05:01:40Z',
  cuerpoTexto: `| Asegurado: Persona Inventada Uno Póliza: 806000001 Número Siniestro: 42000002 Fecha y Hora: 29.07.2026 00:00 |
| Le detallamos a continuación las acciones realizadas en el expediente: |

| Fecha/Hora | Acción |

| 2026-09-24-23.09 | |
| El siniestro de referencia ha sido finalizado |

| * |

${PIE_OCCIDENT}`,
}

const OCC_RESUMEN = {
  remitente: 'mediadores@occidentinforma.com',
  asunto: 'NOMBRE MEDIADOR, comunicación de las acciones generadas en su expediente',
  fecha: '2026-09-18T05:01:36Z',
  cuerpoTexto: `Estimado Mediador,

A continuación encontrará el informe agrupado de las acciones realizadas.

| Apertura de Siniestros |
| |

| Número Siniestro | Póliza | Cliente | NIF | Matrícula | Fecha de Ocurrencia | Subtipo de Siniestro |
| 43000003 | 547000001 | EMPRESA INVENTADA SL | 00000000 T | | 18.08.2026 | Daños por agua |

| Terminaciones |
| |

| Número Siniestro | Póliza | Cliente | NIF | Matrícula | Fecha de Ocurrencia | Subtipo de Siniestro |
| 42000004 | BIDP000001 | COMUNIDAD DE PROPIETARIOS INVENTADA | 11111111 H | | 25.08.2026 | Rotura de tuberías y escapes COMUNITARIOS |

| Pagos Realizados |
| |

No hay pagos.`,
}

const OCC_TRAMITADOR = {
  remitente: 'noreply@comunicacionesoccident.com',
  asunto: 'Tramitador Siniestro RC.constr. - 42000005 -  INVE',
  fecha: '2026-09-09T09:56:16Z',
  cuerpoTexto: `Contrato: M00000

Una vez revisada la documentación aportada, consideramos que asegurado es
responsable y el siniestro tiene cobertura en póliza, por lo que ponemos en
disposición de perjudicado el importe de 895,47 €, una vez descontada
franquicia de 600.00 €.
                                                                             Quedamos a la espera de que se aporte copia de DNI y certificado bancario
de perjudicado.
                                                                             Saludos.
Tramitador.

https://example.invalid/SIN?NUMSINI=42000005

LOPD y CONFIDENCIALIDAD: La información contenida en este mensaje es confidencial.`,
}

const OCC_PRE_ANULACION = {
  remitente: 'mediadores@occidentinforma.com',
  asunto: 'Resumen de recibos próximos a la anulación 00300000 - 00100000 (06.10.2026)',
  fecha: '2026-10-07T05:01:42Z',
  cuerpoTexto: `| |
| Adjuntamos listado de recibos que están próximos a superar el plazo de cobro previsto y que en caso de no resolución se procederá a su anulación. Rogamos que se realice el cobro de cada uno de los recibos lo antes posible : Póliza: BIDS000001 - Recibo: 480000001-H - Fecha anulación: 15.10.2026 Póliza: 8-10.000.001-P - Recibo: 470000002-H - Fecha anulación: 31.10.2026 Por favor, no responda directamente a este correo. Para informar los datos bancarios puede hacerlo por la agenda de recibo |`,
}

const OCC_REGULARIZACION = {
  remitente: 'clientes@occidentinforma.com',
  asunto: 'OBRAS INVENTADAS SL, Regularización responsabilidad civil',
  fecha: '2026-10-05T07:39:13Z',
  cuerpoTexto: `| Ref. póliza de Responsabilidad Civil nº BIDS000002 Tomador: OBRAS INVENTADAS SL Período de regularización: 6/2025 a 6/2026 |
| Apreciado colaborador: |
| Como usted ya sabe, recientemente nos dirigimos al Asegurado y le solicitamos se pusiera en contacto con usted para facilitarle los datos de facturación de su empresa o actividad, en relación a la póliza de referencia. |
| Teniendo en consideración lo importante que es, tanto para el Asegurado como para la Compañía disponer de los datos de la póliza actualizados, le comunicamos que nos dirigimos nuevamente al Asegurado y le volvemos a insistir en la necesidad de facilitarnos dicha información. |`,
}

const OCC_SUSCRIPCION_RC = {
  remitente: 'mediadores@occidentinforma.com',
  asunto: 'Suscripción RC.constr. - Póliza BIDS000002 - OBRAS INVENTADAS SL',
  fecha: '2026-10-02T05:04:44Z',
  cuerpoTexto: `| Contrato: M00000-Nombre Mediador Aviso Recordatorio Regularización Enviada en fecha 02.10.2026 carta de recordatorio al mediador, indicándole que no han ingresado suplemento de regularización comunicando el dato real de facturación o la base de cálculo para cumplir con la obligación de regularizar esta póliza tanto si ha habido modificaciones como si no. Periodo: 18.06.2025 a 18.06.2026. http://example.invalid/portal LOPD y CONFIDENCIALIDAD: … |`,
}

const REALE_PRE_ANULACION = {
  remitente: 'contabilidad.mediadores@reale.es',
  asunto: 'REALE SEGUROS GENERALES, S.A. - Informacion de Pre-anulaciones Automaticas 10/10/26 . Mediador 00000',
  fecha: '2026-10-11T04:20:49Z',
  cuerpoTexto: `Estimado colaborador:

Adjuntamos el detalle de las pólizas correspondientes a su cartera que a fecha de hoy se encuentran pendientes de cobro. Le informamos que debido a la antigüedad de los recibos pendientes, de continuar en esta situación al cierre del presente mes procederemos a la anulación de las mismas.

DIRECCIÓN DE ADMINISTRACIÓN

     POLIZA TOMADOR RECIBO GESTOR
------------------ -------------------------------------------------- ------------ --------

  3021700000001 Mª PERSONA INVENTADA DOS 690000000001 MEDIADOR`,
}

const MAPFRE_DELEGACION = {
  remitente: 'DMAPCCCRECIBOSOPERAC@mapfre.com',
  asunto: 'DELEGACIÓN RECIBO Nº 8800000001 PÓLIZA MAPFRE',
  fecha: '2026-10-07T08:43:39Z',
  cuerpoTexto: `Buenos días/tardes,

                Agotadas las gestiones para el cobro de la póliza 0008400000001 con recibo número 8800000001 e importe 494,69 euros delegamos para su intervención.

                Si en el plazo de 12 días no recibimos respuesta positiva, procederemos a la anulación de la póliza por impago con la correspondiente notificación al tomador de la póliza.

Reciban un cordial saludo,

MAPFRE ESPAÑA`,
}

const ALLIANZ_ANULACION = {
  remitente: '$s0000uca@allianz.es',
  asunto: 'OSN-CCC: Comunicación Anulación Póliza P-03100000100000',
  fecha: '2026-09-30T15:17:22Z',
  cuerpoTexto: `| Remite: |
| Allianz, Compañía de Seguros y Reaseguros, S.A. |
| Telf. 900000000 |
| 30 de Septiembre de 2026 TOMADOR: APELLIDO INVENTADO, NOMBRE. PÓLIZA : 031000001 . Apreciado/a Colaborador/a: En respuesta a su petición, le informamos que hemos procedido a la anulación de la póliza reseñada a partir de la fecha 01-11-2026. Quedamos a su disposición para cualquier duda o aclaración al respecto. |`,
}

const COMERCIAL_ALLIANZ = {
  remitente: 'comunicacion.mediadores@allianz.es',
  asunto: 'Novedades Allianz - ¡Aprovecha el Plan Otoño y más promociones para cerrar el año! ',
  cuerpoTexto: '¡Foco en el Plan Otoño para cerrar el año! Revisa la infografía adjunta. Anulación de franquicia en pólizas de hogar contratadas este mes. Siniestro Diversos 43000001.',
}

const BIENVENIDA_MAPFRE = {
  remitente: 'enviodocumentacionpoliza@info.mapfre.com',
  asunto: 'Welcome Pack Digital - MAPFRE',
  cuerpoTexto: 'Le agradecemos la confianza que ha depositado en MAPFRE al contratar su seguro de Autos. Le hacemos llegar los enlaces a la documentación relativa a su póliza.',
}

/** Todos los textos (no claves) que lleva un evento. */
function textos(e: EventoAseguradora | null): string[] {
  const out: string[] = []
  const recorre = (v: unknown): void => {
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach(recorre)
    else if (v && typeof v === 'object') Object.values(v).forEach(recorre)
  }
  recorre(e)
  return out
}

test('Occident «Siniestro Diversos»: apertura con póliza, ocurrencia y acciones, sin asegurado ni reparador', () => {
  const e = leerCorreoEventoAseguradora(OCC_SINIESTRO_APERTURA)
  assert.ok(e && e.tipo === 'siniestro')
  assert.equal(e.codigoDgs, 'C0468')
  assert.equal(e.ilegibles, 0)
  assert.deepEqual(e.siniestros, [{
    subtipo: 'apertura', numeroSiniestro: '43000001', numeroPoliza: '806000001', ramo: null,
    fechaOcurrencia: '2026-09-15', fechaAccion: '2026-09-15',
    accion: 'Apertura de expediente con cargo a póliza · El reparador ha sido designado y comienza el proceso de reparación',
  }])
  assert.doesNotMatch(JSON.stringify(e), /Persona Inventada|REPARACIONES/)
})

test('Occident «Siniestro Diversos»: «ha sido finalizado» es un cierre', () => {
  const e = leerCorreoEventoAseguradora(OCC_SINIESTRO_CIERRE)
  assert.ok(e && e.tipo === 'siniestro')
  assert.equal(e.siniestros[0].subtipo, 'cierre')
  assert.equal(e.siniestros[0].fechaAccion, '2026-09-24')
  assert.equal(e.siniestros[0].fechaOcurrencia, '2026-07-29')
})

test('Occident resumen de expedientes: aperturas y terminaciones, sin cliente ni NIF', () => {
  const e = leerCorreoEventoAseguradora(OCC_RESUMEN)
  assert.ok(e && e.tipo === 'siniestro')
  assert.equal(e.ilegibles, 0)
  assert.equal(e.siniestros.length, 2)
  assert.deepEqual(e.siniestros.map((s) => [s.subtipo, s.numeroSiniestro, s.numeroPoliza, s.fechaOcurrencia]), [
    ['apertura', '43000003', '547000001', '2026-08-18'],
    ['cierre', '42000004', 'BIDP000001', '2026-08-25'],
  ])
  assert.equal(e.siniestros[0].accion, 'Apertura: Daños por agua')
  assert.doesNotMatch(JSON.stringify(e), /EMPRESA INVENTADA|COMUNIDAD|00000000 T|11111111 H/)
})

test('🪤 Occident resumen: una fila de «Pagos» (formato no visto) se CUENTA, no se inventa', () => {
  const e = leerCorreoEventoAseguradora({ ...OCC_RESUMEN, cuerpoTexto: OCC_RESUMEN.cuerpoTexto.replace('No hay pagos.', '| 42000004 | BIDP000001 | X | 11111111 H | 1.200,00 | 25.08.2026 |') })
  assert.ok(e && e.tipo === 'siniestro')
  assert.equal(e.siniestros.length, 2)
  assert.equal(e.ilegibles, 1)
})

test('Occident «Tramitador Siniestro»: nº y ramo del asunto, nota del tramitador; el «Contrato» no es la póliza', () => {
  const e = leerCorreoEventoAseguradora(OCC_TRAMITADOR)
  assert.ok(e && e.tipo === 'siniestro')
  const s = e.siniestros[0]
  assert.equal(s.subtipo, 'actualizacion')
  assert.equal(s.numeroSiniestro, '42000005')
  assert.equal(s.ramo, 'RC.constr.')
  assert.equal(s.numeroPoliza, null)
  assert.equal(s.fechaAccion, '2026-09-09')
  // La nota del tramitador (firma, perjudicado) NO sale: solo un estado de lista cerrada.
  assert.equal(s.accion, 'Pago o propuesta de pago')
  assert.doesNotMatch(JSON.stringify(e), /Una vez revisada|Tramitador\./)
  assert.doesNotMatch(JSON.stringify(e), /M00000|https?:/)
})

test('Occident próximos a la anulación: cada póliza con su recibo y fecha de anulación', () => {
  const e = leerCorreoEventoAseguradora(OCC_PRE_ANULACION)
  assert.ok(e && e.tipo === 'pre_anulacion')
  assert.equal(e.ilegibles, 0)
  assert.deepEqual(e.recibos, [
    { numeroPoliza: 'BIDS000001', idRecibo: '480000001-H', importe: null, fechaLimite: '2026-10-15' },
    { numeroPoliza: '8-10.000.001-P', idRecibo: '470000002-H', importe: null, fechaLimite: '2026-10-31' },
  ])
})

test('🪤 Occident próximos a la anulación sin lista legible: evento con ilegibles, no «nada que anular»', () => {
  const e = leerCorreoEventoAseguradora({ ...OCC_PRE_ANULACION, cuerpoTexto: 'Adjuntamos listado de recibos que están próximos a superar el plazo de cobro previsto.' })
  assert.ok(e && e.tipo === 'pre_anulacion')
  assert.equal(e.recibos.length, 0)
  assert.equal(e.ilegibles, 1)
})

test('Reale pre-anulaciones: póliza y recibo, límite a fin de mes, sin el tomador', () => {
  const e = leerCorreoEventoAseguradora(REALE_PRE_ANULACION)
  assert.ok(e && e.tipo === 'pre_anulacion')
  assert.equal(e.codigoDgs, 'C0613')
  assert.equal(e.ilegibles, 0)
  assert.deepEqual(e.recibos, [{ numeroPoliza: '3021700000001', idRecibo: '690000000001', importe: null, fechaLimite: '2026-10-31' }])
  assert.doesNotMatch(JSON.stringify(e), /INVENTADA/)
})

test('Mapfre «Delegación recibo»: impago con importe y plazo de 12 días desde el correo', () => {
  const e = leerCorreoEventoAseguradora(MAPFRE_DELEGACION)
  assert.ok(e && e.tipo === 'impago')
  assert.equal(e.codigoDgs, 'C0058')
  assert.deepEqual(e.recibos, [{ numeroPoliza: '0008400000001', idRecibo: '8800000001', importe: 494.69, fechaLimite: '2026-10-19' }])
  // Sin fecha del correo, el plazo no se inventa.
  const sinFecha = leerCorreoEventoAseguradora({ ...MAPFRE_DELEGACION, fecha: null })
  assert.ok(sinFecha && sinFecha.tipo === 'impago')
  assert.equal(sinFecha.recibos[0].fechaLimite, null)
})

test('Allianz OSN-CCC: anulación con póliza del cuerpo, fecha de efecto y motivo', () => {
  const e = leerCorreoEventoAseguradora(ALLIANZ_ANULACION)
  assert.ok(e && e.tipo === 'anulacion')
  assert.equal(e.codigoDgs, 'C0109')
  assert.equal(e.numeroPoliza, '031000001')
  assert.equal(e.fechaEfecto, '2026-11-01')
  assert.equal(e.motivo, 'A petición del mediador')
  assert.equal(e.ilegibles, 0)
  assert.doesNotMatch(JSON.stringify(e), /APELLIDO INVENTADO/)
})

test('Occident regularización de RC (clientes@): suplemento con periodo mes/año, sin tomador', () => {
  const e = leerCorreoEventoAseguradora(OCC_REGULARIZACION)
  assert.ok(e && e.tipo === 'suplemento')
  assert.equal(e.numeroPoliza, 'BIDS000002')
  assert.equal(e.periodoDesde, '2025-06')
  assert.equal(e.periodoHasta, '2026-06')
  assert.match(e.descripcion ?? '', /vuelve a pedir/)
  assert.doesNotMatch(JSON.stringify(e), /OBRAS INVENTADAS/)
})

test('Occident «Suscripción RC.constr.»: recordatorio de suplemento sin ingresar con su periodo', () => {
  const e = leerCorreoEventoAseguradora(OCC_SUSCRIPCION_RC)
  assert.ok(e && e.tipo === 'suplemento')
  assert.equal(e.numeroPoliza, 'BIDS000002')
  assert.equal(e.periodoDesde, '2025-06-18')
  assert.equal(e.periodoHasta, '2026-06-18')
  assert.match(e.descripcion ?? '', /^Recordatorio/)
  assert.equal(e.ilegibles, 0)
  assert.doesNotMatch(JSON.stringify(e), /OBRAS INVENTADAS|Nombre Mediador/)
})

test('negativos: comercial, bienvenida sin póliza, reenvío y conversación con la sucursal → null', () => {
  assert.equal(leerCorreoEventoAseguradora(COMERCIAL_ALLIANZ), null)
  assert.equal(leerCorreoEventoAseguradora(BIENVENIDA_MAPFRE), null)
  assert.equal(leerCorreoEventoAseguradora({ ...OCC_TRAMITADOR, remitente: 'alguien@gmail.com', asunto: `Fwd: ${OCC_TRAMITADOR.asunto}` }), null)
  assert.equal(leerCorreoEventoAseguradora({ ...OCC_SINIESTRO_APERTURA, asunto: `RE: ${OCC_SINIESTRO_APERTURA.asunto}` }), null)
  assert.equal(leerCorreoEventoAseguradora({
    remitente: 'sucursal.000@allianz.es',
    asunto: 'RE: Solicitud de anulación · póliza nº 031000001 · Nombre Inventado',
    cuerpoTexto: 'La póliza está anulada, según vuestra solicitud.',
  }), null)
  // Un asunto de siniestro desde un dominio que no es la compañía no se cree.
  assert.equal(leerCorreoEventoAseguradora({ ...OCC_SINIESTRO_APERTURA, remitente: 'mediadores@occidentinforma.com.example.net' }), null)
})

test('no pisa a `leerCorreoDevolucion`: los avisos de recibo devuelto no son eventos aquí, ni al revés', () => {
  const devoluciones = [
    { remitente: 'mediadores@occidentinforma.com', asunto: 'Recibos devueltos de banco 14-09-2026', cuerpoTexto: '| GPAFS0000001 | 400000001 | AUTOS | 573,69 Eur |' },
    { remitente: 'avisosrecibos@info.mapfre.com', asunto: 'Devolución de Recibo MAPFRE', cuerpoTexto: 'abono de este recibo 8800000001' },
    { remitente: 'avisosrecibos@info.mapfre.com', asunto: 'CONTACTO RECIBO Nº 8800000001 MAPFRE', cuerpoTexto: '' },
    { remitente: 'mediador@allianz.es', asunto: 'Relacion anulacion polizas por impago', cuerpoTexto: 'Relacion anulacion polizas por impago' },
  ]
  for (const d of devoluciones) assert.equal(leerCorreoEventoAseguradora(d), null, d.asunto)
  for (const c of [MAPFRE_DELEGACION, REALE_PRE_ANULACION, ALLIANZ_ANULACION, OCC_PRE_ANULACION]) {
    assert.equal(leerCorreoDevolucion({ remitente: c.remitente, asunto: c.asunto, texto: c.cuerpoTexto, fecha: c.fecha }), null, c.asunto)
  }
})

test('🪤 ningún campo de ningún evento lleva un IBAN (ni con el IBAN metido en el cuerpo)', () => {
  const IBAN_FALSO = 'ES00 0000 0000 0000 0000 0000'
  const conIban = [
    OCC_SINIESTRO_APERTURA, OCC_SINIESTRO_CIERRE, OCC_RESUMEN, OCC_PRE_ANULACION, OCC_REGULARIZACION,
    OCC_SUSCRIPCION_RC, REALE_PRE_ANULACION, MAPFRE_DELEGACION, ALLIANZ_ANULACION,
  ].map((c) => ({ ...c, cuerpoTexto: `${c.cuerpoTexto}\nIBAN : ${IBAN_FALSO}\nCCC: 0000 0000 00 0000000000` }))
  // El tramitador escribe texto libre: el IBAN cae DENTRO de la nota que sí sale.
  // Al PRINCIPIO de la nota, para que no lo quite el recorte de 200 caracteres y se mida el saneado.
  conIban.push({ ...OCC_TRAMITADOR, cuerpoTexto: OCC_TRAMITADOR.cuerpoTexto.replace('Una vez revisada', `Cuenta del perjudicado ${IBAN_FALSO}, NIF 00000000T. Una vez revisada`) })
  for (const c of conIban) {
    const e = leerCorreoEventoAseguradora(c)
    assert.ok(e, c.asunto)
    for (const t of textos(e)) {
      assert.equal(contieneIban(t), false, `${c.asunto}: ${t}`)
      assert.doesNotMatch(t, /0000 0000 0000 0000|00000000T/, `${c.asunto}: ${t}`)
    }
  }
})

test('sinDatosSensibles retira IBAN, CCC y NIF y deja el resto', () => {
  assert.equal(sinDatosSensibles('pago a ES00 0000 0000 0000 0000 0000 de 00000000T'), 'pago a [retirado] de [retirado]')
  assert.equal(sinDatosSensibles('Daños por agua'), 'Daños por agua')
})
