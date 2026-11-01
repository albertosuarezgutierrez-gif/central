// Mapfre auto v0.8.39 · garantías del PDF del proyecto / de la pantalla «Coberturas» (AS-26-0042: columnas enteras «No figura»).
// Fixtures SINTÉTICOS (sin datos personales).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deflateSync } from 'node:zlib'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import type { OfertaNormalizada } from '@central/module-tarificacion'
import { mapfreAuto, ofertasDesdePrimasMapfre, leerGarantiasPantallaMapfre } from '../src/adapters/mapfre/auto.ts'
import {
  AVISO_COBERTURAS_PANTALLA, AVISO_COBERTURAS_PDF, AVISO_COBERTURAS_SIN_LEER, coberturasDeLineas, coberturasPorProducto, ofertasConGarantiasMapfre, valorDeTexto,
} from '../src/adapters/mapfre/garantias.ts'
import { textoDePdf } from '../src/pdf-texto.ts'

test('v0.8.39 · versión', () => assert.equal(mapfreAuto.version, '0.8.42'))

const ofertas = (): OfertaNormalizada[] => ofertasDesdePrimasMapfre([
  { producto: 'TERCEROS', periodicidad: 'anual', primaTotalEur: 392.02, requiereVerificacionVehiculo: false },
  { producto: 'TERCEROS AMPLIADO', periodicidad: 'anual', primaTotalEur: 480, requiereVerificacionVehiculo: false },
], null)

test('pura: valor de una celda (estado, límite, franquicia) y nunca se inventa', () => {
  assert.equal(valorDeTexto('Incluida')?.estado, 'incluida')
  assert.equal(valorDeTexto('No incluida')?.estado, 'excluida')
  assert.equal(valorDeTexto('No')?.estado, 'excluida')
  const v = valorDeTexto('Incluida | Límite 1.500,50 € | Franquicia 150 €')!
  assert.equal(v.estado, 'incluida'); assert.equal(v.limite, 1500.5); assert.equal(v.franquicia, 150)
  assert.equal(valorDeTexto('Sin franquicia')?.franquicia, 0)
  assert.equal(valorDeTexto('texto sin nada'), null)
  assert.equal(valorDeTexto(''), null)
})

test('pura: líneas → coberturas en formato Allianz (etiqueta y valor en la misma línea o en líneas separadas)', () => {
  const { coberturas, franquicias } = coberturasDeLineas([
    'Responsabilidad Civil Obligatoria\tIncluida',
    'Robo   No incluida',
    'Lunas',
    'Límite 600 €',
    'Daños propios',
    'Franquicia 300 €',
    'Defensa jurídica - Límite 3.000 €',
    'PRIMA TOTAL: 392,02 €',
    'Forma de pago   Anual',
    'Datos del tomador',
  ])
  const por = Object.fromEntries(coberturas.map((c) => [c.clave, c]))
  assert.equal(por['Responsabilidad Civil Obligatoria']!.estado, 'incluida')
  assert.equal(por['Robo']!.estado, 'excluida')
  assert.equal(por['Lunas']!.limite, 600)
  assert.equal(por['Daños propios']!.franquicia, 300)
  assert.equal(por['Defensa jurídica']!.limite, 3000)
  assert.equal(coberturas.length, 5, 'ni la prima, ni la forma de pago, ni un encabezado son garantías')
  assert.deepEqual(franquicias.map((f) => [f.ambito, f.importeEur]), [['Daños propios', 300]])
})

test('pura: por producto, nombre exacto como encabezado; sin encabezados y varios productos → nada (no se reparte a ojo)', () => {
  const l = ['TERCEROS', 'Robo   No incluida', 'Lunas   Incluida', 'TERCEROS AMPLIADO', 'Robo   Incluida', 'Lunas   Incluida', 'Incendio   Incluida']
  const m = coberturasPorProducto(l, ['TERCEROS', 'TERCEROS AMPLIADO'])
  assert.equal(m.get('terceros')!.coberturas.length, 2)
  assert.equal(m.get('terceros')!.coberturas[0]!.estado, 'excluida')
  assert.equal(m.get('terceros ampliado')!.coberturas.length, 3)
  assert.equal(coberturasPorProducto(['Robo   Incluida'], ['A', 'B']).size, 0)
  assert.equal(coberturasPorProducto(['Robo   Incluida'], ['A']).get('a')!.coberturas.length, 1)
})

test('oferta: PDF > pantalla; sin ninguna → aviso «coberturas no leídas» y coberturas vacías (nunca inventadas)', () => {
  const pdf = coberturasPorProducto(['TERCEROS', 'Robo   No incluida'], ['TERCEROS'])
  const pant = coberturasPorProducto(['TERCEROS AMPLIADO', 'Robo   Incluida'], ['TERCEROS AMPLIADO'])
  const [a, b] = ofertasConGarantiasMapfre(ofertas(), pdf, pant)
  assert.equal(a!.coberturas.length, 1); assert.ok(a!.avisos.includes(AVISO_COBERTURAS_PDF))
  assert.equal(b!.coberturas.length, 1); assert.ok(b!.avisos.includes(AVISO_COBERTURAS_PANTALLA))
  const [c, d] = ofertasConGarantiasMapfre(ofertas(), new Map(), new Map())
  for (const o of [c!, d!]) { assert.deepEqual(o.coberturas, []); assert.ok(o.avisos.includes(AVISO_COBERTURAS_SIN_LEER)) }
})

function pdfSintetico(contenido: string, cmap?: string): Buffer {
  const obj = (n: number, cuerpo: Buffer) => Buffer.concat([Buffer.from(`${n} 0 obj\n`), cuerpo, Buffer.from('\nendobj\n')])
  const flate = (txt: string) => { const z = deflateSync(Buffer.from(txt, 'latin1')); return Buffer.concat([Buffer.from(`<< /Filter /FlateDecode /Length ${z.length} >>\nstream\n`), z, Buffer.from('\nendstream')]) }
  const partes = [Buffer.from('%PDF-1.4\n'), obj(1, flate(contenido))]
  if (cmap) partes.push(obj(2, flate(cmap)))
  partes.push(Buffer.from('trailer<<>>\n%%EOF\n'))
  return Buffer.concat(partes)
}

test('pdf-texto: literales (acentos WinAnsi), TJ con kerning y Flate', () => {
  const pdf = pdfSintetico('BT /F1 10 Tf 50 700 Td (Responsabilidad Civil) Tj 200 0 Td (Incluida) Tj 0 -12 Td [(Da) -20 (\\361os propios) -400 (No)] TJ ET')
  const t = textoDePdf(pdf)
  assert.match(t, /Responsabilidad Civil/); assert.match(t, /Incluida/); assert.match(t, /Daños propios No/)
  assert.equal(textoDePdf(Buffer.from('no es un pdf')), '')
  assert.equal(textoDePdf(null), '')
})

test('pdf-texto: fuente Identity-H con ToUnicode + garantías extraídas del PDF', () => {
  const cmap = '/CIDInit begin begincmap 3 beginbfchar <0001> <0052> <0002> <006F> <0003> <0062> endbfchar 1 beginbfrange <0004> <0006> <0049> endbfrange endcmap'
  const pdf = pdfSintetico('BT <000100020003> Tj <000400050006> Tj ET', cmap)
  assert.equal(textoDePdf(pdf).replace(/\n/g, ''), 'RobIJK')
  const pdf2 = pdfSintetico('BT (TERCEROS) Tj T* (Robo) Tj T* (No incluida) Tj T* (TERCEROS AMPLIADO) Tj T* (Robo) Tj T* (Incluida) Tj ET')
  const m = coberturasPorProducto(textoDePdf(pdf2).split('\n'), ['TERCEROS', 'TERCEROS AMPLIADO'])
  assert.equal(m.get('terceros')!.coberturas[0]!.estado, 'excluida')
  assert.equal(m.get('terceros ampliado')!.coberturas[0]!.estado, 'incluida')
})

test('pantalla: lee garantías de cada tarjeta (respaldo sin PDF) con un navegador real', async () => {
  let navegador: Browser
  try { navegador = await chromium.launch({ headless: true }) } catch (e) {
    const dir0 = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(dir0) ? readdirSync(dir0).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(dir0, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    navegador = await chromium.launch({ headless: true, executablePath: exe })
  }
  try {
    const page = await navegador.newPage()
    await page.setContent(`<app-coberturas>
      <prima-producto><mat-select><span class="mat-select-value-text">TERCEROS</span></mat-select><mat-select><span class="mat-select-value-text">ANUAL</span></mat-select>
        <div class="caja-primas"><p><strong>PRIMA TOTAL: 392,02 €</strong></p></div>
        <table><tr><td>Robo</td><td>No incluida</td></tr><tr><td>Lunas</td><td>Incluida</td></tr></table></prima-producto>
      <prima-producto><mat-select><span class="mat-select-value-text">TERCEROS AMPLIADO</span></mat-select><mat-select><span class="mat-select-value-text">ANUAL</span></mat-select>
        <div class="caja-primas"><p><strong>PRIMA TOTAL: 480,00 €</strong></p></div>
        <table><tr><td>Robo</td><td>Incluida</td></tr></table></prima-producto></app-coberturas>`)
    const m = await leerGarantiasPantallaMapfre(page, ['TERCEROS', 'TERCEROS AMPLIADO'])
    assert.equal(m.get('terceros')!.coberturas.length, 2)
    assert.equal(m.get('terceros ampliado')!.coberturas[0]!.estado, 'incluida')
  } finally { await navegador.close() }
})
