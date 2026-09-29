import test from 'node:test'
import assert from 'node:assert/strict'
import { clasificarMotivoDevolucion, leerCorreoDevolucion, normalizarIdRecibo } from './devolucion-correo.ts'

// Textos copiados de los correos reales (28/09/2026) con números, nombres e IBAN cambiados.

const REALE = {
  remitente: 'contabilidad.mediadores@reale.es',
  asunto: 'Reale Contabilidad - Med 00000 / Devolucion Recibos Banco 28-09-2026',
  fecha: '2026-09-28T18:27:05Z',
  texto: `Estimado colaborador:

Le comunicamos que con fecha 28-09-2026 hemos recibido la devolución del banco de los siguientes recibos de su cartera:

Póliza Recibo Tomador Efecto Rbo. Importe Motivo Valor Cliente

3021700000001 690000000001 Mª PERSONA DE PRUEBA UNO 19-09-2026 184,58 RAZONES.REG. BRONCE
3021700000002 690000000002 OTRA PERSONA 01-09-2026 1.204,10 OPERACION NO CONFORME PLATA

Puede ampliar esta información por cada recibo a través del apartado: Consultas > Recibos`,
}

const OCCIDENT = {
  remitente: 'mediadores@occidentinforma.com',
  asunto: 'Recibos devueltos de banco 14-09-2026',
  fecha: '2026-09-14T19:50:29Z',
  texto: `| Con la intención de mejorar nuestro servicio, le comunicamos que los siguientes recibos domiciliados han sido devueltos |

| |
| Nº Póliza | Nº Recibo | Producto | Total bruto | Nº devolución | Motivo devolución | Titular de la cuenta | Datos bancarios | Fecha envío / devolución | Situación |
| GPAFS0000001 | 400000001 | AUTOS INDIVIDUAL | 573,69 Eur | 1ª | Operación autorizada no conforme | Persona Prueba | ES0000000000000000000000 | 09.09.2026 14.09.2026 | Pendiente |`,
}

const MAPFRE = {
  remitente: 'avisosrecibos@info.mapfre.com',
  asunto: 'Devolución de Recibo MAPFRE',
  fecha: '2026-09-22T11:06:09Z',
  texto: 'Estimada Sra. PRUEBA, Le informamos que ha sido devuelto un recibo correspondiente a la póliza que tiene contratada en nuestra compañía MAPFRE. Además informarle que para mayor comodidad, puede efectuarse el abono de este recibo 8800000001 a través de nuestra página web',
}

test('Reale: lee cada fila, con su efecto, importe y motivo sin el «valor cliente»', () => {
  const l = leerCorreoDevolucion(REALE)
  assert.ok(l)
  assert.equal(l.codigoDgs, 'C0613')
  assert.equal(l.ilegibles, 0)
  assert.deepEqual(l.devoluciones[0], {
    codigoDgs: 'C0613', numeroPoliza: '3021700000001', idRecibo: '690000000001', fechaEfecto: '2026-09-19',
    importe: 184.58, fechaDevolucion: '2026-09-28', motivo: 'RAZONES.REG.', tipoMotivo: 'cuenta',
  })
  assert.equal(l.devoluciones[1].importe, 1204.1)
  assert.equal(l.devoluciones[1].tipoMotivo, 'cliente_rechaza')
})

test('Reale: la tabla también llega con barras (HTML convertido)', () => {
  const l = leerCorreoDevolucion({ ...REALE, texto: REALE.texto.replace('3021700000001 690000000001 Mª PERSONA DE PRUEBA UNO 19-09-2026 184,58 RAZONES.REG. BRONCE', '| 3021700000001 | 690000000001 | Mª PERSONA DE PRUEBA UNO | 19-09-2026 | 184,58 | RAZONES.REG. | BRONCE |') })
  assert.equal(l?.devoluciones[0].idRecibo, '690000000001')
  assert.equal(l?.devoluciones[0].motivo, 'RAZONES.REG.')
})

test('🪤 una fila con forma de devolución que no se sabe leer se CUENTA, no se pierde', () => {
  const l = leerCorreoDevolucion({ ...REALE, texto: `${REALE.texto}\n3021700000003 690000000003 SIN FECHA NI IMPORTE` })
  assert.equal(l?.devoluciones.length, 2)
  assert.equal(l?.ilegibles, 1)
})

test('Occident: fechas de envío y devolución, sin sacar titular ni IBAN', () => {
  const l = leerCorreoDevolucion(OCCIDENT)
  assert.ok(l)
  assert.equal(l.codigoDgs, 'C0468')
  assert.equal(l.devoluciones.length, 1)
  const d = l.devoluciones[0]
  assert.equal(d.idRecibo, '400000001')
  assert.equal(d.numeroPoliza, 'GPAFS0000001')
  assert.equal(d.importe, 573.69)
  assert.equal(d.fechaEfecto, '2026-09-09')
  assert.equal(d.fechaDevolucion, '2026-09-14')
  assert.equal(d.tipoMotivo, 'cliente_rechaza')
  assert.doesNotMatch(JSON.stringify(l), /ES0000|Persona Prueba/)
})

test('Mapfre: la carta al cliente da el nº de recibo; el «contacto» es incidencia, no devolución', () => {
  const l = leerCorreoDevolucion(MAPFRE)
  assert.equal(l?.codigoDgs, 'C0058')
  assert.equal(l?.devoluciones[0].idRecibo, '8800000001')
  assert.equal(l?.devoluciones[0].fechaDevolucion, '2026-09-22')
  const c = leerCorreoDevolucion({ remitente: 'DMAPCCCRECIBOSOPERAC@mapfre.com', asunto: 'CONTACTO RECIBO Nº 8800000001 MAPFRE', fecha: '2026-09-17T09:18:54Z', texto: 'Estimado cliente' })
  assert.equal(c?.devoluciones.length, 0)
  assert.deepEqual(c?.incidencias, [{ idRecibo: '8800000001' }])
})

test('no es de devoluciones → null (otro asunto, otra compañía, un dominio parecido)', () => {
  assert.equal(leerCorreoDevolucion({ ...REALE, asunto: 'Reale - EIAC | 00000 - Ficheros Generados' }), null)
  assert.equal(leerCorreoDevolucion({ ...REALE, remitente: 'contabilidad@reale.es.falso.com' }), null)
  assert.equal(leerCorreoDevolucion({ ...MAPFRE, remitente: 'avisos@nomapfre.com' }), null)
})

test('normalizarIdRecibo y clasificarMotivoDevolucion', () => {
  assert.equal(normalizarIdRecibo('08808116169'), normalizarIdRecibo('8808116169'))
  assert.equal(normalizarIdRecibo('0'), '0')
  assert.equal(clasificarMotivoDevolucion('RR01 cuenta'), 'cuenta')
  assert.equal(clasificarMotivoDevolucion('AM04'), 'fondos')
  assert.equal(clasificarMotivoDevolucion('MD06'), 'cliente_rechaza')
  assert.equal(clasificarMotivoDevolucion('cualquier cosa'), 'otro')
  assert.equal(clasificarMotivoDevolucion(''), null)
})

test('Occident: fila ya recobrada fuera; columnas corridas o una sola fecha = ilegible; sin IBAN como motivo', () => {
  const fila = '| GPAFS0000001 | 400000001 | AUTOS INDIVIDUAL | 573,69 Eur | 1ª | Operación autorizada no conforme | Persona Prueba | ES0000000000000000000000 | 09.09.2026 14.09.2026 | Pendiente |'
  const con = (f: string) => leerCorreoDevolucion({ ...OCCIDENT, texto: f })
  assert.equal(con(fila.replace('| Pendiente |', '| Cobrado |'))?.devoluciones.length, 0)
  assert.equal(con(fila.replace('09.09.2026 14.09.2026', '14.09.2026'))?.ilegibles, 1)
  assert.equal(con(fila.replace('| 1ª |', '|'))?.ilegibles, 1)
  const corrida = fila.replace('Operación autorizada no conforme', 'ES0000000000000000000099')
  assert.equal(con(corrida)?.devoluciones[0].motivo, null)
})

// Allianz: el texto que saca el triaje del PDF adjunto (filas, celdas separadas por tabulador), copiado
// de las cartas reales del 17/06/2026 y del 04/08/2026 con pólizas, recibos, nombres y cuenta cambiados.
const ALLIANZ_DEVUELTOS = {
  remitente: 'mediador@allianz.es',
  asunto: 'Rel. recibos ventanilla',
  fecha: '2026-06-17T19:53:40Z',
  texto: [
    'Hola',
    'Adjunto a este correo encontrarás el siguiente fichero de clientes: - Rel. recibos ventanilla',
    'AVISO Relación de recibos bancarios devueltos',
    'Fecha',
    '17 de Junio de 2026',
    'Nº\tPóliza\tRecibo\tTomador\tImporte\tFecha Efecto\tMotivo\tNº Cuenta',
    'Devolución\tBanco',
    '1\t040000001\t600000001\tPrueba\t249,34\t01/06/26\tDISCONFORM **** **** **',
    'Apellido,\tE IMPORTE\t******0000',
    'Nombre',
    '0018638',
  ].join('\n'),
}

const ALLIANZ_ANULADAS = {
  remitente: 'mediador@allianz.es',
  asunto: 'Relacion anulacion polizas por impago',
  fecha: '2026-08-04T20:50:49Z',
  texto: [
    'Anulación de pólizas por impago.',
    'Fecha',
    '3 de Agosto de 2026',
    'Nº\tPóliza\tRecibo\tRamo\tTomador\tImporte\tFecha Efecto\tF. Anulación',
    '1\t040000001\t600000001\t1234\tPrueba\t249,34\t01/06/2026\t00/00/0000',
    'Apellido,',
    'Nombre Otro',
    '0018638',
  ].join('\n'),
}

test('Allianz devueltos: lee la fila del PDF, une el motivo partido en dos líneas y no saca la cuenta', () => {
  const r = leerCorreoDevolucion(ALLIANZ_DEVUELTOS)
  assert.ok(r)
  assert.equal(r.compania, 'allianz')
  assert.equal(r.ilegibles, 0)
  assert.deepEqual(r.devoluciones, [{
    codigoDgs: 'C0109', numeroPoliza: '040000001', idRecibo: '600000001', importe: 249.34,
    fechaEfecto: '2026-06-01', fechaDevolucion: '2026-06-17',
    motivo: 'DISCONFORME IMPORTE', tipoMotivo: 'cliente_rechaza',
  }])
  assert.doesNotMatch(JSON.stringify(r), /0000\b.*\*|\*{3}|Apellido|Nombre/)
})

test('Allianz anuladas: la póliza anulada por impago entra con su recibo; 00/00/0000 no es una fecha', () => {
  const r = leerCorreoDevolucion(ALLIANZ_ANULADAS)
  assert.ok(r)
  assert.deepEqual(r.devoluciones, [{
    codigoDgs: 'C0109', numeroPoliza: '040000001', idRecibo: '600000001', importe: 249.34,
    fechaEfecto: '2026-06-01', fechaDevolucion: '2026-08-03',
    motivo: 'Póliza anulada por impago', tipoMotivo: 'otro',
  }])
})

test('🪤 Allianz sin el texto del PDF: es un aviso que NO se ha leído, no una carta vacía', () => {
  const r = leerCorreoDevolucion({ ...ALLIANZ_DEVUELTOS, texto: 'Hola Adjunto a este correo encontrarás el siguiente fichero de clientes: - Rel. recibos ventanilla' })
  assert.ok(r)
  assert.equal(r.devoluciones.length, 0)
  assert.equal(r.ilegibles, 1)
  // Una fila con forma de tabla que no casa también se cuenta.
  const rota = leerCorreoDevolucion({ ...ALLIANZ_ANULADAS, texto: ALLIANZ_ANULADAS.texto.replace('249,34', 'N/D') })
  assert.equal(rota?.ilegibles, 1)
  // Otros correos de Allianz (Cuenta Agente, Cartera No Vida) no son de devoluciones.
  assert.equal(leerCorreoDevolucion({ ...ALLIANZ_DEVUELTOS, asunto: 'Cuenta Agente', texto: 'Te adjuntamos la documentación' }), null)
})
