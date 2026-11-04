// Conformidad VeriFactu de @central/core-fiscal/es: huella, encadenamiento, QR, XML y rectificativas.
//
// VECTORES OFICIALES: los tres ejemplos con huella resultante del documento AEAT «Detalle de las
// especificaciones técnicas para generación de la huella o hash de los registros de facturación» (v0.1.2,
// 27/08/2024): dos altas encadenadas y una anulación del NIF de pruebas 89890001K. Si uno de estos tests
// falla, la huella NO es la de la AEAT y toda la cadena de facturas sería inválida: no se «actualiza el valor».

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  centimosAImporte, eurosACentimos, fechaAeat, fechaHoraHuso, ErrorVerifactu,
} from '../src/es/importe.ts'
import { cadenaHuellaAlta, huellaAlta, huellaAnulacion } from '../src/es/huella.ts'
import {
  construirRegistroAlta, construirRegistroAnulacion, desglosarDesdeBases, desglosarDesdeTotales,
  eslabonDe, primerEslabonRoto,
} from '../src/es/registro.ts'
import type { DatosRegistroAlta, RegistroFacturacion } from '../src/es/registro.ts'
import { urlQrCotejo } from '../src/es/qr.ts'
import { xmlSuministroLR, NS_SUMINISTRO_LR, NS_SUMINISTRO_INFORMACION } from '../src/es/xml-suministro.ts'
import type { SistemaInformatico } from '../src/es/xml-suministro.ts'
import { transporteDesactivado } from '../src/es/transporte.ts'

// ── Vectores oficiales AEAT ─────────────────────────────────────────────────
const H1 = '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60'
const H2 = 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97'
const H3 = '177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68'

test('AEAT ejemplo 1 (alta, primer registro): cadena y huella oficiales', () => {
  const campos = {
    IDEmisorFactura: '89890001K', NumSerieFactura: '12345678/G33', FechaExpedicionFactura: '01-01-2024',
    TipoFactura: 'F1', CuotaTotal: '12.35', ImporteTotal: '123.45', Huella: '',
    FechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
  }
  assert.equal(cadenaHuellaAlta(campos),
    'IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1' +
    '&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00')
  assert.equal(huellaAlta(campos), H1)
})

test('AEAT ejemplo 2 (alta encadenada): huella oficial', () => {
  assert.equal(huellaAlta({
    IDEmisorFactura: '89890001K', NumSerieFactura: '12345679/G34', FechaExpedicionFactura: '01-01-2024',
    TipoFactura: 'F1', CuotaTotal: '12.35', ImporteTotal: '123.45', Huella: H1,
    FechaHoraHusoGenRegistro: '2024-01-01T19:20:35+01:00',
  }), H2)
})

test('AEAT ejemplo 3 (anulación): huella oficial', () => {
  assert.equal(huellaAnulacion({
    IDEmisorFacturaAnulada: '89890001K', NumSerieFacturaAnulada: '12345679/G34',
    FechaExpedicionFacturaAnulada: '01-01-2024', Huella: H2, FechaHoraHusoGenRegistro: '2024-01-01T19:20:40+01:00',
  }), H3)
})

test('huella: los espacios de borde de cada valor no cuentan', () => {
  assert.equal(huellaAlta({
    IDEmisorFactura: ' 89890001K ', NumSerieFactura: '12345678/G33 ', FechaExpedicionFactura: '01-01-2024',
    TipoFactura: 'F1', CuotaTotal: '12.35', ImporteTotal: ' 123.45', Huella: '',
    FechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00 ',
  }), H1)
})

// ── Registro de alta / anulación (API de alto nivel) sobre los mismos vectores ──
const DEST = { nombreRazon: 'Cliente de prueba SL', nif: 'B12345674' }
const SISTEMA: SistemaInformatico = {
  nombreRazon: 'Productor SL', nif: 'B12345674', nombreSistemaInformatico: 'central', idSistemaInformatico: 'CF',
  version: '1.0', numeroInstalacion: '1', tipoUsoPosibleSoloVerifactu: 'S', tipoUsoPosibleMultiOT: 'N',
  indicadorMultiplesOT: 'N',
}

function alta1(): DatosRegistroAlta {
  return {
    factura: { idEmisor: '89890001K', numSerie: '12345678/G33', fechaExpedicion: '2024-01-01' },
    nombreRazonEmisor: 'Emisor de pruebas', tipoFactura: 'F1', descripcion: 'Venta',
    desglose: [{ tipoImpositivo: 21, baseCentimos: 11110, cuotaCentimos: 1235 }],
    destinatario: DEST, anterior: null, fechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
  }
}

test('construirRegistroAlta: primer registro sin anterior → huella oficial 1, totales en céntimos', () => {
  const r = construirRegistroAlta(alta1())
  assert.equal(r.cuotaTotalCentimos, 1235)
  assert.equal(r.importeTotalCentimos, 12345)
  assert.equal(r.huella, H1)
})

test('encadenamiento alta → alta → anulación reproduce las 3 huellas oficiales', () => {
  const r1 = construirRegistroAlta(alta1())
  const r2 = construirRegistroAlta({
    ...alta1(), factura: { idEmisor: '89890001K', numSerie: '12345679/G34', fechaExpedicion: '2024-01-01' },
    anterior: eslabonDe(r1), fechaHoraHusoGenRegistro: '2024-01-01T19:20:35+01:00',
  })
  assert.equal(r2.huella, H2)
  assert.deepEqual(r2.anterior, { idEmisor: '89890001K', numSerie: '12345678/G33', fechaExpedicion: '2024-01-01', huella: H1 })
  const r3 = construirRegistroAnulacion({
    facturaAnulada: r2.factura, anterior: eslabonDe(r2), fechaHoraHusoGenRegistro: '2024-01-01T19:20:40+01:00',
  })
  assert.equal(r3.huella, H3)
  assert.equal(primerEslabonRoto([r1, r2, r3]), null)
  // Un eslabón manipulado se detecta en su posición.
  const roto: RegistroFacturacion[] = [r1, { ...r2, importeTotalCentimos: 1 , desglose: [{ tipoImpositivo: 21, baseCentimos: 1, cuotaCentimos: 0 }] }, r3]
  assert.equal(primerEslabonRoto(roto), 1)
  assert.equal(primerEslabonRoto([r2]), 0) // r2 no puede ser el primero: apunta a una huella
})

test('alta: CuotaTotal = Σ cuotas e ImporteTotal = Σ (base + cuota); ambos entran en la huella', () => {
  const base = construirRegistroAlta(alta1())
  const otraCuota = construirRegistroAlta({ ...alta1(), desglose: [{ tipoImpositivo: 21, baseCentimos: 11111, cuotaCentimos: 1234 }] })
  assert.equal(otraCuota.importeTotalCentimos, base.importeTotalCentimos)
  assert.notEqual(otraCuota.huella, base.huella) // misma ImporteTotal, distinta CuotaTotal → distinta huella
  const otroTotal = construirRegistroAlta({ ...alta1(), desglose: [{ tipoImpositivo: 21, baseCentimos: 11111, cuotaCentimos: 1235 }] })
  assert.notEqual(otroTotal.huella, base.huella) // misma CuotaTotal, distinta ImporteTotal → distinta huella
})

test('alta: el TipoFactura entra en la huella (F2 ≠ F1)', () => {
  const f1 = construirRegistroAlta(alta1())
  const f2 = construirRegistroAlta({ ...alta1(), tipoFactura: 'F2', destinatario: null })
  assert.notEqual(f1.huella, f2.huella)
})

test('alta: validaciones (destinatario, céntimos, fecha, huella anterior)', () => {
  assert.throws(() => construirRegistroAlta({ ...alta1(), destinatario: null }), ErrorVerifactu)
  assert.throws(() => construirRegistroAlta({ ...alta1(), tipoFactura: 'F2' }), /no admite destinatario/)
  assert.throws(() => construirRegistroAlta({ ...alta1(), desglose: [{ tipoImpositivo: 21, baseCentimos: 111.1, cuotaCentimos: 1 }] }), /céntimos enteros/)
  assert.throws(() => construirRegistroAlta({ ...alta1(), desglose: [] }), /al menos una línea/)
  assert.throws(() => construirRegistroAlta({ ...alta1(), fechaHoraHusoGenRegistro: '2024-01-01T18:20:30.000Z' }), /FechaHoraHuso/)
  assert.throws(() => construirRegistroAlta({ ...alta1(), anterior: { idEmisor: 'X', numSerie: 'A', fechaExpedicion: '2024-01-01', huella: 'abc' } }), /huella/)
})

// ── Rectificativas ──────────────────────────────────────────────────────────
test('rectificativa R1 por diferencias: importes negativos, sin importeRectificado', () => {
  const r = construirRegistroAlta({
    ...alta1(), factura: { idEmisor: '89890001K', numSerie: 'R-1', fechaExpedicion: '2024-02-01' },
    tipoFactura: 'R1', desglose: [{ tipoImpositivo: 21, baseCentimos: -1000, cuotaCentimos: -210 }],
    rectificativa: { tipo: 'I', facturas: [{ idEmisor: '89890001K', numSerie: '12345678/G33', fechaExpedicion: '2024-01-01' }] },
    anterior: eslabonDe(construirRegistroAlta(alta1())), fechaHoraHusoGenRegistro: '2024-02-01T10:00:00+01:00',
  })
  assert.equal(r.importeTotalCentimos, -1210)
  assert.equal(centimosAImporte(r.importeTotalCentimos), '-12.10')
})

test('rectificativa: validaciones (faltan datos, S sin importeRectificado, F1 con datos de rectificación)', () => {
  const fr = [{ idEmisor: '89890001K', numSerie: '12345678/G33', fechaExpedicion: '2024-01-01' }]
  assert.throws(() => construirRegistroAlta({ ...alta1(), tipoFactura: 'R1' }), /rectificativa/)
  assert.throws(() => construirRegistroAlta({ ...alta1(), tipoFactura: 'R4', rectificativa: { tipo: 'S', facturas: fr } }), /sustitución/)
  assert.throws(() => construirRegistroAlta({ ...alta1(), tipoFactura: 'R1', rectificativa: { tipo: 'I', facturas: [] } }), /al menos una factura/)
  assert.throws(() => construirRegistroAlta({ ...alta1(), rectificativa: { tipo: 'I', facturas: fr } }), /no es rectificativa/)
  // R5 (rectificativa de simplificada) no lleva destinatario.
  assert.throws(() => construirRegistroAlta({ ...alta1(), tipoFactura: 'R5', rectificativa: { tipo: 'I', facturas: fr } }), /no admite destinatario/)
})

// ── Desglose por tipo de IVA ────────────────────────────────────────────────
test('desglosarDesdeTotales: agrupa por tipo y base + cuota = total al céntimo', () => {
  const d = desglosarDesdeTotales([
    { totalCentimos: 1100, tipoIva: 10 }, { totalCentimos: 999, tipoIva: 10 }, { totalCentimos: 1210, tipoIva: 21 },
  ])
  assert.deepEqual(d, [
    { tipoImpositivo: 21, baseCentimos: 1000, cuotaCentimos: 210 },
    { tipoImpositivo: 10, baseCentimos: 1908, cuotaCentimos: 191 },
  ])
})

test('desglosarDesdeBases: cuota redondeada por grupo', () => {
  assert.deepEqual(desglosarDesdeBases([{ baseCentimos: 333, tipoIva: 21 }, { baseCentimos: 333, tipoIva: 21 }]),
    [{ tipoImpositivo: 21, baseCentimos: 666, cuotaCentimos: 140 }])
})

// ── Importes y fechas ───────────────────────────────────────────────────────
test('centimosAImporte / eurosACentimos / fechaAeat', () => {
  assert.equal(centimosAImporte(12345), '123.45')
  assert.equal(centimosAImporte(5), '0.05')
  assert.equal(centimosAImporte(0), '0.00')
  assert.throws(() => centimosAImporte(1.5), ErrorVerifactu)
  assert.equal(eurosACentimos(0.1 + 0.2), 30)
  assert.equal(eurosACentimos(19.99), 1999)
  assert.equal(fechaAeat('2026-05-02'), '02-05-2026')
  assert.throws(() => fechaAeat('02/05/2026'), ErrorVerifactu)
})

test('fechaHoraHuso: hora local de Madrid con su huso, sea cual sea el TZ del servidor', () => {
  assert.equal(fechaHoraHuso(new Date('2026-07-15T22:30:05.900Z')), '2026-07-16T00:30:05+02:00') // verano: cambia el día
  assert.equal(fechaHoraHuso(new Date('2026-01-15T12:00:00Z')), '2026-01-15T13:00:00+01:00')     // invierno
})

// ── QR ──────────────────────────────────────────────────────────────────────
test('urlQrCotejo: ValidarQR con nif, numserie codificado, fecha dd-mm-aaaa e importe', () => {
  assert.equal(
    urlQrCotejo({ nif: '89890001K', numSerie: '12345678&G33', fechaExpedicion: '2024-01-01', importeTotalCentimos: 24140 }),
    'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=12345678%26G33&fecha=01-01-2024&importe=241.40',
  )
  assert.match(urlQrCotejo({ nif: 'B1', numSerie: 'A 1', fechaExpedicion: '2024-01-01', importeTotalCentimos: 1, entorno: 'pruebas', verifactu: false }),
    /^https:\/\/prewww2\.aeat\.es\/wlpl\/TIKE-CONT\/ValidarQRNoVerifactu\?nif=B1&numserie=A%201&/)
})

// ── XML ─────────────────────────────────────────────────────────────────────
/** Comprobador mínimo de XML bien formado: etiquetas equilibradas, entidades válidas, un único raíz. */
function bienFormado(xml: string): void {
  const sinDecl = xml.replace(/^<\?xml[^?]*\?>/, '')
  const pila: string[] = []
  let raices = 0
  const re = /<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>|([^<]+)/g
  let m: RegExpExecArray | null
  let pos = 0
  while ((m = re.exec(sinDecl))) {
    assert.equal(m.index, pos, `basura en la posición ${pos}`)
    pos = re.lastIndex
    if (m[5] !== undefined) {
      assert.ok(!/&(?!(amp|lt|gt|quot|apos);)/.test(m[5]), `entidad no válida en «${m[5]}»`)
      assert.ok(pila.length > 0 || !m[5].trim(), 'texto fuera del raíz')
      continue
    }
    const [, cierre, nombre, , vacia] = m
    if (cierre) assert.equal(pila.pop(), nombre, `cierre desparejado </${nombre}>`)
    else if (!vacia) { if (!pila.length) raices++; pila.push(nombre) }
    else if (!pila.length) raices++
  }
  assert.equal(pos, sinDecl.length, 'XML truncado')
  assert.deepEqual(pila, [], 'etiquetas sin cerrar')
  assert.equal(raices, 1, 'debe haber un único elemento raíz')
}

/** Texto del primer elemento `tag` dentro de `xml`. */
function valor(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)
  return m ? m[1] : null
}

test('xmlSuministroLR: bien formado, namespaces y campos obligatorios del alta y la anulación', () => {
  const r1 = construirRegistroAlta({ ...alta1(), nombreRazonEmisor: 'Bar & Co <SL>' })
  const r2 = construirRegistroAnulacion({ facturaAnulada: r1.factura, anterior: eslabonDe(r1), fechaHoraHusoGenRegistro: '2024-01-01T19:21:00+01:00' })
  const xml = xmlSuministroLR({ obligado: { nombreRazon: 'Bar & Co <SL>', nif: '89890001K' }, registros: [r1, r2], sistema: SISTEMA })
  bienFormado(xml)
  assert.ok(xml.includes(`xmlns:sum="${NS_SUMINISTRO_LR}"`))
  assert.ok(xml.includes(`xmlns:sum1="${NS_SUMINISTRO_INFORMACION}"`))
  assert.ok(xml.includes('Bar &amp; Co &lt;SL&gt;'))

  const alta = xml.slice(xml.indexOf('<sum1:RegistroAlta>'), xml.indexOf('</sum1:RegistroAlta>'))
  for (const tag of ['IDVersion', 'IDEmisorFactura', 'NumSerieFactura', 'FechaExpedicionFactura', 'NombreRazonEmisor',
    'TipoFactura', 'DescripcionOperacion', 'CuotaTotal', 'ImporteTotal', 'PrimerRegistro', 'FechaHoraHusoGenRegistro',
    'TipoHuella', 'Huella', 'IdSistemaInformatico', 'TipoImpositivo', 'BaseImponibleOimporteNoSujeto', 'CuotaRepercutida']) {
    assert.notEqual(valor(alta, `sum1:${tag}`), null, `falta sum1:${tag} en el alta`)
  }
  assert.equal(valor(alta, 'sum1:FechaExpedicionFactura'), '01-01-2024')
  assert.equal(valor(alta, 'sum1:CuotaTotal'), '12.35')
  assert.equal(valor(alta, 'sum1:ImporteTotal'), '123.45')
  assert.equal(valor(alta, 'sum1:Huella'), H1)
  // El XML lleva EXACTAMENTE los valores de la huella: se recalcula desde el propio XML.
  assert.equal(huellaAlta({
    IDEmisorFactura: valor(alta, 'sum1:IDEmisorFactura')!, NumSerieFactura: valor(alta, 'sum1:NumSerieFactura')!,
    FechaExpedicionFactura: valor(alta, 'sum1:FechaExpedicionFactura')!, TipoFactura: valor(alta, 'sum1:TipoFactura')!,
    CuotaTotal: valor(alta, 'sum1:CuotaTotal')!, ImporteTotal: valor(alta, 'sum1:ImporteTotal')!, Huella: '',
    FechaHoraHusoGenRegistro: valor(alta, 'sum1:FechaHoraHusoGenRegistro')!,
  }), valor(alta, 'sum1:Huella'))

  const anul = xml.slice(xml.indexOf('<sum1:RegistroAnulacion>'))
  for (const tag of ['IDEmisorFacturaAnulada', 'NumSerieFacturaAnulada', 'FechaExpedicionFacturaAnulada', 'RegistroAnterior', 'Huella']) {
    assert.ok(anul.includes(`<sum1:${tag}>`), `falta sum1:${tag} en la anulación`)
  }
  assert.ok(!anul.includes('PrimerRegistro'))
})

test('xmlSuministroLR: rectificativa lleva TipoRectificativa y FacturasRectificadas en orden de esquema; sobre SOAP bien formado', () => {
  const r = construirRegistroAlta({
    ...alta1(), tipoFactura: 'R1', factura: { idEmisor: '89890001K', numSerie: 'R-1', fechaExpedicion: '2024-02-01' },
    desglose: [{ tipoImpositivo: 21, baseCentimos: 20000, cuotaCentimos: 4200 }],
    rectificativa: { tipo: 'S', facturas: [{ idEmisor: '89890001K', numSerie: 'F-9', fechaExpedicion: '2024-01-10' }],
      importeRectificado: { baseCentimos: 10000, cuotaCentimos: 2100 } },
  })
  const xml = xmlSuministroLR({ obligado: { nombreRazon: 'E', nif: '89890001K' }, registros: [r], sistema: SISTEMA, soap: true })
  bienFormado(xml)
  const orden = ['TipoFactura', 'TipoRectificativa', 'FacturasRectificadas', 'ImporteRectificacion', 'DescripcionOperacion', 'Destinatarios', 'Desglose', 'CuotaTotal']
    .map(t => xml.indexOf(`<sum1:${t}>`))
  assert.ok(orden.every(i => i > 0), 'falta algún elemento de la rectificativa')
  assert.deepEqual([...orden].sort((a, b) => a - b), orden, 'orden distinto del XSD')
  assert.equal(valor(xml, 'sum1:BaseRectificada'), '100.00')
  assert.ok(xml.includes('<soapenv:Body><sum:RegFactuSistemaFacturacion'))
})

test('xmlSuministroLR: F2 sin destinatario no lleva Destinatarios ni TipoRectificativa vacío', () => {
  const r = construirRegistroAlta({ ...alta1(), tipoFactura: 'F2', destinatario: null })
  const xml = xmlSuministroLR({ obligado: { nombreRazon: 'E', nif: '89890001K' }, registros: [r], sistema: SISTEMA })
  assert.ok(!xml.includes('Destinatarios'))
  assert.ok(!xml.includes('TipoRectificativa'))
})

// ── Transporte ──────────────────────────────────────────────────────────────
test('transporteDesactivado: nunca dice «aceptado», dice «no_enviado»', async () => {
  const r = await transporteDesactivado('fase 0').enviar({ xml: '<x/>', nifObligado: 'B1', entorno: 'pruebas' })
  assert.deepEqual(r, { estado: 'no_enviado', motivo: 'fase 0' })
})
