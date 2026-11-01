// Generali auto 0.2.59 · Allianz hogar 0.1.11 · Allianz auto 0.6.39 (01/11/2026): garantías completas en el presupuesto (nunca «No figura»).
// Fixtures SINTÉTICOS (sin datos personales).
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { deflateSync } from 'node:zlib'
import { chromium, type Browser } from 'playwright'
import type { OfertaNormalizada } from '@central/module-tarificacion'
import { VERSION_GENERALI_AUTO, conPdfPresupuestoGenerali, ofertaGenerali } from '../src/adapters/generali/auto.ts'
import {
  AVISO_GARANTIAS_PANTALLA_GENERALI, AVISO_GARANTIAS_PDF_GENERALI, AVISO_GARANTIAS_SIN_LEER_GENERALI, garantiasDePdfGenerali, leerGarantiasPantallaGenerali, ofertasConGarantiasGenerali,
} from '../src/adapters/generali/garantias.ts'
import { allianzHogar, ofertasDesdePrecioHogar } from '../src/adapters/allianz/hogar.ts'
import {
  AVISO_GARANTIAS_HOGAR_LEIDAS, AVISO_GARANTIAS_HOGAR_SIN_LEER, garantiasPorModalidadHogar, ofertasConGarantiasHogar, type FilaGarantiaHogar,
} from '../src/adapters/allianz/garantias-hogar.ts'
import { leerGarantiasTablaHogarAllianz } from '../src/guard.ts'
import { allianzAuto, ofertasDesdePaquetesTurismos } from '../src/adapters/allianz/auto.ts'

async function navegador(): Promise<Browser> {
  try { return await chromium.launch({ headless: true }) } catch (e) {
    const dir0 = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(dir0) ? readdirSync(dir0).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(dir0, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    return chromium.launch({ headless: true, executablePath: exe })
  }
}

function pdfSintetico(contenido: string): Buffer {
  const z = deflateSync(Buffer.from(contenido, 'latin1'))
  return Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode /Length ' + z.length + ' >>\nstream\n'), z, Buffer.from('\nendstream\nendobj\ntrailer<<>>\n%%EOF\n')])
}

// ─────────────────────────── Generali auto 0.2.59 ───────────────────────────
test('versiones: Generali auto 0.2.59, Allianz hogar 0.1.14, Allianz auto 0.6.39', () => {
  assert.equal(VERSION_GENERALI_AUTO, '0.2.59')
  assert.equal(allianzHogar.version, '0.1.14')
  assert.equal(allianzAuto.version, '0.6.39')
})

test('Generali: garantías del PDF (límite y franquicia incluidos); PDF ilegible o ausente → vacío, nunca lanza', () => {
  const pdf = pdfSintetico('BT (Responsabilidad Civil) Tj T* (Incluida) Tj T* (Lunas) Tj T* (Franquicia 50 EUR) Tj T* (Robo) Tj T* (No incluida) Tj T* (Defensa jur\\355dica - L\\355mite 3.000 EUR) Tj T* (Prima total: 392,02 EUR) Tj ET')
  const g = garantiasDePdfGenerali(pdf)
  const por = Object.fromEntries(g.coberturas.map((c) => [c.clave, c]))
  assert.equal(por['Responsabilidad Civil']!.estado, 'incluida')
  assert.equal(por['Lunas']!.franquicia, 50)
  assert.equal(por['Robo']!.estado, 'excluida')
  assert.equal(por['Defensa jurídica']!.limite, 3000)
  assert.equal(g.coberturas.length, 4, 'la prima no es una garantía')
  assert.deepEqual(g.franquicias.map((f) => [f.ambito, f.importeEur]), [['Lunas', 50]])
  assert.deepEqual(garantiasDePdfGenerali(Buffer.from('no es un pdf')), { coberturas: [], franquicias: [] })
  assert.deepEqual(garantiasDePdfGenerali(null), { coberturas: [], franquicias: [] })
})

test('Generali: oferta con PDF > pantalla; sin ninguna → aviso «coberturas no leídas» y coberturas vacías', () => {
  const o = (): OfertaNormalizada[] => [ofertaGenerali(400, null)]
  const pdf = { coberturas: [{ clave: 'Robo', literal: 'Robo', estado: 'incluida' as const, capital: null, limite: null, franquicia: null }], franquicias: [] }
  const pant = { coberturas: [{ clave: 'Lunas', literal: 'Lunas', estado: 'incluida' as const, capital: null, limite: null, franquicia: null }], franquicias: [] }
  const [a] = ofertasConGarantiasGenerali(o(), pdf, pant)
  assert.deepEqual(a!.coberturas.map((c) => c.clave), ['Robo']); assert.ok(a!.avisos.includes(AVISO_GARANTIAS_PDF_GENERALI))
  const [b] = ofertasConGarantiasGenerali(o(), { coberturas: [], franquicias: [] }, pant)
  assert.deepEqual(b!.coberturas.map((c) => c.clave), ['Lunas']); assert.ok(b!.avisos.includes(AVISO_GARANTIAS_PANTALLA_GENERALI))
  const [c] = ofertasConGarantiasGenerali(o(), { coberturas: [], franquicias: [] }, { coberturas: [], franquicias: [] })
  assert.deepEqual(c!.coberturas, []); assert.ok(c!.avisos.includes(AVISO_GARANTIAS_SIN_LEER_GENERALI)); assert.match(AVISO_GARANTIAS_SIN_LEER_GENERALI, /coberturas no leídas/)
})

const HTML_GENERALI = `<div><h3>Garantías y Resultados</h3>
<table><tr><th>Modalidades de Seguro (garantías)</th><th>Recibo Anual</th></tr><tr><td>TERCEROS</td><td>392,02 €</td></tr></table>
<table><tr><th>Garantías y Capitales opcionales</th><th>Valor</th></tr>
<tr><td>Responsabilidad Civil Obligatoria</td><td>Incluida</td></tr>
<tr><td>Lunas</td><td>Franquicia 50 €</td></tr>
<tr><td>Robo</td><td><input type="checkbox"></td></tr>
<tr><td>Defensa jurídica</td><td><input type="checkbox" checked></td></tr>
<tr><td>Asistencia en viaje</td><td><select><option>Sin ampliar</option><option selected>Límite 600 €</option></select></td></tr></table>
<table><tr><td>Datos del tomador</td><td>nada</td></tr></table></div>`

test('Generali: pantalla «Garantías y Resultados» (navegador real) lee garantías y NO el precio ni tablas ajenas', async () => {
  const nav = await navegador()
  try {
    const page = await nav.newPage()
    await page.setContent(HTML_GENERALI)
    const g = await leerGarantiasPantallaGenerali(page)
    const por = Object.fromEntries(g.coberturas.map((c) => [c.clave, c]))
    assert.equal(por['Responsabilidad Civil Obligatoria']!.estado, 'incluida')
    assert.equal(por['Lunas']!.franquicia, 50)
    assert.equal(por['Robo']!.estado, 'excluida')
    assert.equal(por['Defensa jurídica']!.estado, 'incluida')
    assert.equal(por['Asistencia en viaje']!.limite, 600)
    assert.ok(!por['TERCEROS'] && !por['Datos del tomador'], 'ni la tabla de modalidades (precio) ni la de datos')
    // Sin pulsar nada: el DOM sigue igual.
    assert.equal(await page.locator('input[type=checkbox]:checked').count(), 1)
  } finally { await nav.close() }
})

test('Generali: conPdfPresupuestoGenerali pone las garantías de la pantalla aunque el PDF no llegue (sin botón → aviso de PDF y garantías igual)', async () => {
  const nav = await navegador()
  try {
    const page = await nav.newPage()
    await page.setContent(HTML_GENERALI)
    const ctx = { log: () => {} } as never
    const [o] = await conPdfPresupuestoGenerali(page, ctx, [ofertaGenerali(392.02, null)])
    assert.ok(o!.coberturas.length >= 5, o!.coberturas.length.toString())
    assert.ok(o!.avisos.includes(AVISO_GARANTIAS_PANTALLA_GENERALI))
    assert.ok(o!.avisos.some((a) => a.startsWith('PDF del proyecto no descargado en Generali')))
    const page2 = await nav.newPage()
    await page2.setContent('<p>nada</p>')
    const [v] = await conPdfPresupuestoGenerali(page2, ctx, [ofertaGenerali(392.02, null)])
    assert.deepEqual(v!.coberturas, []); assert.ok(v!.avisos.includes(AVISO_GARANTIAS_SIN_LEER_GENERALI))
  } finally { await nav.close() }
})

// ─────────────────────────── Allianz hogar 0.1.11 ───────────────────────────
const FILAS_HOGAR: FilaGarantiaHogar[] = [
  { descripcion: 'Incendio', celdas: [{ icono: 'check', texto: '' }, { icono: 'check', texto: '' }, { icono: 'check', texto: '' }], opciones: [], comunes: [] },
  { descripcion: 'Robo', celdas: [{ icono: 'minus', texto: '' }, { icono: 'check', texto: 'Hasta 6.000 €' }, { icono: 'check', texto: 'Hasta 12.000,50 €' }], opciones: [], comunes: [] },
  { descripcion: 'Daños por agua', celdas: [{ icono: 'check', texto: '150 €' }, { icono: 'check', texto: '100 €' }, { icono: 'check', texto: 'Sin franquicia' }], opciones: [], comunes: [] },
  { descripcion: 'Franquicia daños por agua', celdas: [{ icono: null, texto: '150 €' }, { icono: null, texto: '100 €' }, { icono: null, texto: 'Sin franquicia' }], opciones: [], comunes: [] },
  { descripcion: 'Responsabilidad civil', celdas: [], opciones: [{ texto: '300.000 €', marcada: true, adicional: '9,95 € Anual' }, { texto: '600.000 €', marcada: false, adicional: '' }], comunes: [] },
  { descripcion: '', celdas: [], opciones: [], comunes: ['Defensa jurídica', 'Asistencia 24 h'] },
  { descripcion: 'Fila rota', celdas: [{ icono: 'check', texto: '' }], opciones: [], comunes: [] },
]

test('Allianz hogar: tabla → garantías por modalidad con límites y franquicias en importe (nada inventado)', () => {
  const [est, com, sup] = garantiasPorModalidadHogar(FILAS_HOGAR, 3)
  const de = (g: typeof est, k: string) => g!.coberturas.find((c) => c.clave === k)!
  assert.equal(de(est, 'Incendio').estado, 'incluida')
  assert.equal(de(est, 'Robo').estado, 'excluida')
  assert.equal(de(com, 'Robo').limite, 6000)
  assert.equal(de(sup, 'Robo').limite, 12000.5)
  assert.equal(de(est, 'Daños por agua').limite, 150, 'sin la palabra franquicia en la fila, un importe suelto es el límite')
  assert.equal(de(est, 'Franquicia daños por agua').franquicia, 150, 'fila de franquicia: el importe suelto es la franquicia')
  assert.equal(de(sup, 'Franquicia daños por agua').franquicia, 0)
  assert.deepEqual(est!.franquicias.map((f) => [f.ambito, f.importeEur]), [['Franquicia daños por agua', 150]])
  assert.equal(de(com, 'Responsabilidad civil').capital, 300000, 'solo la opción marcada; el suplemento 9,95 no es un límite')
  assert.equal(de(com, 'Responsabilidad civil').limite, null)
  assert.ok(sup!.coberturas.some((c) => c.clave === 'Defensa jurídica' && c.estado === 'incluida'))
  assert.ok(!sup!.coberturas.some((c) => /Fila rota/.test(c.clave)), 'una fila con otro número de celdas no se reparte a ojo')
})

test('Allianz hogar: ofertas con garantías; sin filas → «coberturas no leídas» y desaparece el «lector pendiente»', () => {
  const l = { modalidades: [{ nombre: 'A', primerRecibo: '10,00 €', anualidad: '100,00 €', seleccionada: false, conAviso: false }, { nombre: 'B', primerRecibo: '20,00 €', anualidad: '200,00 €', seleccionada: true, conAviso: false }], operacion: 'Número operación: 90001', frecuencia: 'Anual', vigencia: '01/11/2026 - 01/10/2027', condicionado: false }
  const base = ofertasDesdePrecioHogar(l)
  const [a, b] = ofertasConGarantiasHogar(base, garantiasPorModalidadHogar(FILAS_HOGAR.slice(0, 2).map((f) => ({ ...f, celdas: f.celdas.slice(0, 2) })), 2))
  assert.ok(a!.coberturas.length > 0 && b!.coberturas.length > 0)
  assert.ok(a!.avisos.includes(AVISO_GARANTIAS_HOGAR_LEIDAS) && !a!.avisos.some((x) => /lector pendiente/.test(x)))
  const [c] = ofertasConGarantiasHogar(base, garantiasPorModalidadHogar([], 2))
  assert.deepEqual(c!.coberturas, []); assert.ok(c!.avisos.includes(AVISO_GARANTIAS_HOGAR_SIN_LEER)); assert.ok(!c!.avisos.some((x) => /lector pendiente/.test(x)))
  assert.match(AVISO_GARANTIAS_HOGAR_SIN_LEER, /coberturas no leídas/)
})

test('Allianz hogar: lector de la tabla de «Precio» en un navegador real (solo lectura)', async () => {
  const nav = await navegador()
  try {
    const page = await nav.newPage()
    const celda = (inner: string) => `<div class="nx-comparison-table__cell">${inner}</div>`
    await page.setContent(`<epac-price-page><nx-comparison-table><div role="table">
      <nx-comparison-table-flex-row class="is-content-row"><div class="nx-comparison-table__description-cell">Incendio</div>${celda('<nx-icon name="check"></nx-icon>')}${celda('<nx-icon name="check"></nx-icon>')}</nx-comparison-table-flex-row>
      <nx-comparison-table-flex-row class="is-content-row"><div class="nx-comparison-table__description-cell">Robo</div>${celda('<nx-icon name="minus"></nx-icon>')}${celda('<nx-icon name="check"></nx-icon> Hasta 6.000 €')}</nx-comparison-table-flex-row>
      <nx-comparison-table-flex-row class="is-content-row"><div class="nx-comparison-table__description-cell">Responsabilidad civil</div><div class="nx-comparison-table__intersection-cell"><nx-radio><input type="radio" checked><span class="nx-radio__label--text"><span>300.000 €</span></span><span class="option-additional-text">9,95 € Anual</span></nx-radio></div></nx-comparison-table-flex-row>
      <nx-comparison-table-flex-row class="is-content-row"><div class="common-coverages"><ul><li><span>Defensa jurídica</span></li></ul></div></nx-comparison-table-flex-row>
      </div></nx-comparison-table></epac-price-page>`)
    const filas = (await leerGarantiasTablaHogarAllianz(page.mainFrame()))!
    assert.equal(filas.length, 4)
    const [a, b] = garantiasPorModalidadHogar(filas, 2)
    assert.equal(a!.coberturas.find((c) => c.clave === 'Robo')!.estado, 'excluida')
    assert.equal(b!.coberturas.find((c) => c.clave === 'Robo')!.limite, 6000)
    assert.equal(b!.coberturas.find((c) => c.clave === 'Responsabilidad civil')!.capital, 300000)
    assert.ok(b!.coberturas.some((c) => c.clave === 'Defensa jurídica'))
    const vacio = await nav.newPage()
    await vacio.setContent('<p>sin tabla</p>')
    assert.equal(await leerGarantiasTablaHogarAllianz(vacio.mainFrame()), null)
  } finally { await nav.close() }
})

// ─────────────────────────── Allianz auto 0.6.39 ───────────────────────────
test('Allianz auto: límite y franquicia en importe SOLO si el texto de pantalla los trae; el suplemento no es un límite; el nivel sin importe sigue sin importe', () => {
  const lectura = {
    paquetes: [{ nombre: 'Uno', primerRecibo: '10,00 €', anualidad: '100,00 €', mejorOpcion: false, conAviso: false }, { nombre: 'Dos', primerRecibo: '20,00 €', anualidad: '200,00 €', mejorOpcion: false, conAviso: false }],
    filas: [
      { descripcion: 'Daños propios', celdas: [{ icono: null, texto: 'Franquicia 300 €' }, { icono: null, texto: 'Baja' }], opciones: [], comunes: [] },
      { descripcion: 'Lunas', celdas: [{ icono: 'check', texto: 'Hasta 600 €' }, { icono: 'check', texto: 'Sí' }], opciones: [], comunes: [] },
      { descripcion: 'Accidentes del conductor', celdas: [], opciones: [{ texto: '100.000', marcada: true, adicional: '9.95 € Anual' }], comunes: [] },
      { descripcion: 'Franquicia de lunas', celdas: [], opciones: [{ texto: '50 €', marcada: true, adicional: '' }], comunes: [] },
    ],
  }
  const [uno, dos] = ofertasDesdePaquetesTurismos(lectura, null)
  const de = (o: typeof uno, k: string) => o!.coberturas.find((c) => c.clave === k)!
  assert.equal(de(uno, 'Daños propios').franquicia, 300)
  assert.deepEqual(uno!.franquicias.find((f) => f.ambito === 'Daños propios'), { ambito: 'Daños propios', importeEur: 300, literal: null })
  assert.equal(de(dos, 'Daños propios').franquicia, null)
  assert.deepEqual(dos!.franquicias.find((f) => f.ambito === 'Daños propios')?.importeEur, null, 'nivel «Baja»: sin importe en pantalla, no se inventa')
  assert.equal(de(uno, 'Lunas').limite, 600)
  assert.equal(de(dos, 'Lunas').limite, null)
  assert.equal(de(uno, 'Accidentes del conductor').capital, 100000)
  assert.equal(de(uno, 'Accidentes del conductor').limite, null, 'el suplemento «9.95 € Anual» no es un límite')
  assert.equal(de(uno, 'Franquicia de lunas').franquicia, 50)
})
