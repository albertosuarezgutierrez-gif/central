import test from 'node:test'
import assert from 'node:assert/strict'
import { contieneIban, eventoNecesitaAdjuntos, leerCorreoEventoAseguradora } from './evento-correo-aseguradora.ts'
import { leerCorreoDevolucion } from './devolucion-correo.ts'

// Allianz «Rel. Emisión Producción» (14/10/2026). El correo no trae nada; la lista va en el PDF adjunto y el
// triaje lo pasa por `pdf-filas` (apps/plataforma/lib/correo/pdf-filas.ts): celdas separadas por TABULADOR.
// Fixtures = la salida REAL de `textoPdfPorFilas` sobre los PDF de 07/10 y 09/10/2026, con nº de póliza/recibo,
// mediador, tomador, matrícula e importes cambiados por otros inventados del mismo formato.

const CUERPO_ALLIANZ = ` Allianz

| [](https://www.allianz.es/) | allianz.es[](https://www.allianz.es/) |
| Hola |
| Te adjuntamos la documentación que consta en el asunto de este correo electrónico. |
| Tu privacidad nos importa. Consulta toda la información en nuestra Política de privacidad [](https://www.allianz.es/informacion-legal.html#privacidad) |
| 0103000000000000 |`

const PIE_PDF = `Si   en  su  cartera  figuran  pólizas  de  Vida  Individual  cuyos  recibos  sucesivos  se  obtengan  en  proceso  diario,  los  días  que  corresponda  le
facilitaremos también información detallada de la emisión de los mismos.
Página  1

`

/** Con tipo de documento «Póliza» delante y producto + matrícula + bonus en la 2.ª fila (moto). */
const PDF_MOTO = `

PRD35\t(IA027)
Emisión del día 7 de Octubre de 2026
Mediador:  0099999 NOMBRE INVENTADO DEL MEDIADOR
Documentos
Póliza\tPóliza: 061000001  Recibo: 900000001  F.Vto.: 29-09-2026  Anual Comisión\t12,30 P.Neta\t102,70
Allianz Moto V.03  0000-BBB     Bonus: 3  Produccion\tIRPF\t1,80 Imptos.+Recgos.\t10,60
Apellido Inventado, Nombre Uno\tLiquidar\t102,80 T.Recibo\t113,30
Totales en Euros\tDocumentos
Comisión\t12,30\tPrima Neta\t102,70\tPólizas\t1\tRecibos\t0
IRPF\t1,80\tImptos.+Recgos.\t10,60\tProyectos\t0\tCIS\t0
Liquidar\t102,80\tDescuentos\t0,00\tSuplementos y Copias 0\tCert. Cazador\t0
Total Recibo\t113,30\tTarjetas/Certificados\t0
${PIE_PDF}`

/** Sin tipo de documento delante; la 2.ª fila es «Terceros      Produccion» (auto a terceros). */
const PDF_TERCEROS = `

PRD35\t(IA027)
Emisión del día 9 de Octubre de 2026
Mediador:  0099999 NOMBRE INVENTADO DEL MEDIADOR
Documentos
Póliza: 061000002  Recibo: 900000002  F.Vto.: 08-10-2026  Anual Comisión\t84,30 P.Neta\t602,30
Terceros      Produccion\tIRPF\t12,60 Imptos.+Recgos.\t57,10
Apellido Inventado, Nombre Dos\tLiquidar\t587,70 T.Recibo\t1.659,40
Totales en Euros\tDocumentos
Comisión\t84,30\tPrima Neta\t602,30\tPólizas\t0\tRecibos\t0
IRPF\t12,60\tImptos.+Recgos.\t57,10\tProyectos\t0\tCIS\t0
Liquidar\t587,70\tDescuentos\t0,00\tSuplementos y Copias 0\tCert. Cazador\t0
Total Recibo\t1.659,40\tTarjetas/Certificados\t0
${PIE_PDF}`

const correo = (textoAdjuntos: string | null, asunto = 'Rel. Emisión Producción') => ({
  remitente: 'mediador@allianz.es', asunto, cuerpoTexto: CUERPO_ALLIANZ, textoAdjuntos, fecha: '2026-10-07T19:27:33Z',
})

test('Allianz «Rel. Emisión Producción» (moto): póliza, recibo, producto sin matrícula, efecto y total del recibo', () => {
  const e = leerCorreoEventoAseguradora(correo(PDF_MOTO))
  assert.ok(e && e.tipo === 'emision')
  assert.equal(e.compania, 'allianz')
  assert.equal(e.codigoDgs, 'C0109')
  assert.equal(e.ilegibles, 0)
  assert.deepEqual(e.polizas, [{ numeroPoliza: '061000001', idRecibo: '900000001', producto: 'Allianz Moto V.03', fechaEfecto: '2026-09-29', prima: 113.3 }])
})

test('Allianz «Rel. Emisión Producción» (terceros, sin «Póliza» delante): se lee igual; miles con punto', () => {
  const e = leerCorreoEventoAseguradora(correo(PDF_TERCEROS))
  assert.ok(e && e.tipo === 'emision')
  assert.equal(e.ilegibles, 0)
  assert.deepEqual(e.polizas, [{ numeroPoliza: '061000002', idRecibo: '900000002', producto: 'Terceros', fechaEfecto: '2026-10-08', prima: 1659.4 }])
})

test('🪤 emisión: ni el tomador, ni el mediador, ni la matrícula salen en el evento', () => {
  for (const pdf of [PDF_MOTO, PDF_TERCEROS]) {
    const json = JSON.stringify(leerCorreoEventoAseguradora(correo(pdf)))
    assert.doesNotMatch(json, /Inventad|Nombre|NOMBRE|0000-BBB|BBB|0099999/, json)
  }
})

test('🪤 emisión sin PDF legible: evento con ilegibles, nunca «no se ha emitido nada»', () => {
  const sinPdf = leerCorreoEventoAseguradora(correo(null))
  assert.ok(sinPdf && sinPdf.tipo === 'emision')
  assert.deepEqual(sinPdf.polizas, [])
  assert.equal(sinPdf.ilegibles, 1)
  // Una fila que no es de «Produccion» (origen no visto) se CUENTA, no se toma por póliza nueva.
  const otra = leerCorreoEventoAseguradora(correo(PDF_TERCEROS.replace('Terceros      Produccion', 'Terceros      Cartera')))
  assert.ok(otra && otra.tipo === 'emision')
  assert.deepEqual(otra.polizas, [])
  assert.equal(otra.ilegibles, 1)
})

test('emisión: el triaje pide el texto del PDF para este asunto (y no para un reenvío ni otro remitente)', () => {
  assert.equal(eventoNecesitaAdjuntos({ remitente: 'mediador@allianz.es', asunto: 'Rel. Emisión Producción' }), true)
  assert.equal(eventoNecesitaAdjuntos({ remitente: 'mediador@allianz.es', asunto: 'Fwd: Rel. Emisión Producción' }), false)
  assert.equal(eventoNecesitaAdjuntos({ remitente: 'mediador@allianz.es.example.net', asunto: 'Rel. Emisión Producción' }), false)
})

test('negativos: comunicación comercial de Allianz, reenvío y remitente ajeno → null', () => {
  assert.equal(leerCorreoEventoAseguradora({
    remitente: 'comunicacion.mediadores@allianz.es',
    asunto: 'Novedades Allianz - Campaña de producción de otoño: nuevas emisiones con descuento',
    cuerpoTexto: 'Emisión del día con descuento. Póliza: 061000003 Recibo: 900000003 F.Vto.: 01-11-2026 Produccion',
    textoAdjuntos: PDF_MOTO,
  }), null)
  assert.equal(leerCorreoEventoAseguradora(correo(PDF_MOTO, 'Fwd: Rel. Emisión Producción')), null)
  assert.equal(leerCorreoEventoAseguradora({ ...correo(PDF_MOTO), remitente: 'alguien@gmail.com' }), null)
})

test('no pisa a `leerCorreoDevolucion`: la relación de emisión no es una devolución', () => {
  assert.equal(leerCorreoDevolucion({ remitente: 'mediador@allianz.es', asunto: 'Rel. Emisión Producción', texto: `${CUERPO_ALLIANZ}\n${PDF_MOTO}`, fecha: '2026-10-07T19:27:33Z' }), null)
})

test('🪤 emisión: un IBAN o NIF metido en el PDF no sale en ningún campo', () => {
  const IBAN_FALSO = 'ES00 0000 0000 0000 0000 0000'
  const pdf = PDF_MOTO
    .replace('Allianz Moto V.03', `Allianz Moto V.03 ${IBAN_FALSO}`)
    .replace('Apellido Inventado, Nombre Uno', `Apellido Inventado, Nombre Uno 00000000T ${IBAN_FALSO}`)
    .concat(`\nIBAN : ${IBAN_FALSO}\n`)
  const e = leerCorreoEventoAseguradora(correo(pdf))
  assert.ok(e && e.tipo === 'emision')
  assert.equal(e.polizas.length, 1)
  const json = JSON.stringify(e)
  assert.equal(contieneIban(json), false, json)
  assert.doesNotMatch(json, /0000 0000 0000 0000|00000000T/, json)
})
