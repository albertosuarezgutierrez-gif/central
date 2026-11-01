// Mapfre auto v0.8.43 (01/11/2026, trabajo 48b0df76: «Garantías NO leídas» con el proyecto guardado y el PDF ya bajado para un producto).
// Fixtures SINTÉTICOS (sin datos personales).
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { chromium, type Browser } from 'playwright'
import type { OfertaNormalizada } from '@central/module-tarificacion'
import { leerGarantiasPantallaMapfre, mapfreAuto, ofertasDesdePrimasMapfre } from '../src/adapters/mapfre/auto.ts'
import { AVISO_COBERTURAS_SIN_LEER, coberturasPorProducto, diagnosticoGarantiasMapfre, ofertasConGarantiasMapfre } from '../src/adapters/mapfre/garantias.ts'
import { esperarSinCapaOverlay } from '../src/descarga-proyecto-auto.ts'
import { puntuarBotonDescargaProyecto } from '../src/guard.ts'

test('v0.8.43 · versión', () => assert.equal(mapfreAuto.version, '0.8.47'))

async function lanzar(): Promise<Browser> {
  try { return await chromium.launch({ headless: true }) } catch (e) {
    const dir0 = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(dir0) ? readdirSync(dir0).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(dir0, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    return await chromium.launch({ headless: true, executablePath: exe })
  }
}

const CAPA = '<div class="cdk-overlay-backdrop cdk-overlay-dark-backdrop cdk-overlay-backdrop-showing" id="capa" style="position:fixed;inset:0;background:#0003"></div>'

test('capa: sin capa → true al instante; la capa que se quita a los ~700 ms → true; la que no se quita → false al tope (y no se pulsa nada)', async () => {
  const nav = await lanzar()
  try {
    const page = await nav.newPage()
    await page.setContent('<button onclick="window.__clic=1">x</button>')
    assert.equal(await esperarSinCapaOverlay(page, 1_000), true)
    await page.setContent(`<button onclick="window.__clic=1">x</button>${CAPA}<script>setTimeout(()=>document.getElementById('capa').remove(),700)</script>`)
    const t0 = Date.now()
    assert.equal(await esperarSinCapaOverlay(page, 4_000), true)
    assert.ok(Date.now() - t0 >= 500, 'esperó a que desapareciera')
    await page.setContent(`<button onclick="window.__clic=1">x</button>${CAPA}`)
    assert.equal(await esperarSinCapaOverlay(page, 600), false)
    assert.equal(await page.evaluate(() => (window as unknown as Record<string, unknown>).__clic ?? null), null, 'solo lectura: no se pulsó nada')
  } finally { await nav.close() }
})

test('cableado: auto.ts espera la capa DESPUÉS de «Generar Proyecto» y ANTES de buscar la descarga', () => {
  const s = readFileSync(new URL('../src/adapters/mapfre/auto.ts', import.meta.url), 'utf8')
  const iGen = s.indexOf('await ctx.generarProyectoMapfre(nsei')
  const iCapa = s.indexOf('await esperarSinCapaOverlay(nsei)')
  const iDesc = s.indexOf('await descargarProyectoAuto(nsei, ctxPdf')
  assert.ok(iGen > 0 && iCapa > iGen && iDesc > iCapa)
})

test('icono «picture_as_pdf»: vale con el proyecto guardado y (desde 0.8.44, run real 01/11) también sin nº leído; «emitir» y compañía distinta de Generali siguen como estaban', () => {
  assert.ok(puntuarBotonDescargaProyecto(['picture_as_pdf'], 'mapfre', true) > 0)
  assert.equal(puntuarBotonDescargaProyecto(['picture_as_pdf'], 'mapfre', false), 1)
  assert.equal(puntuarBotonDescargaProyecto(['emitir picture_as_pdf'], 'mapfre', true), 0)
})

test('PDF: un producto sin encabezado exacto («TERCEROS – 392,02 €») se halla; la prosa «Terceros afectados…» y el producto más largo NO lo son', () => {
  const l = ['TERCEROS AMPLIADO', 'R. C. OBLIGATORIA   Incluida', 'DEFENSA JURÍDICA   Límite 3.000 €', 'TERCEROS – 392,02 €', 'R. C. OBLIGATORIA   Incluida', 'Robo   No incluida']
  const m = coberturasPorProducto(l, ['TERCEROS', 'TERCEROS AMPLIADO'])
  assert.equal(m.get('terceros ampliado')!.coberturas.length, 2)
  assert.equal(m.get('terceros')!.coberturas.length, 2)
  const prosa = coberturasPorProducto(['TERCEROS AMPLIADO', 'Robo   Incluida', 'Terceros afectados por el siniestro   Incluida', 'TERCEROS AMPLIADO – 480 €', 'Lunas   Incluida'], ['TERCEROS', 'TERCEROS AMPLIADO'])
  assert.equal(prosa.has('terceros'), false)
})

test('aviso: sin garantías añade POR QUÉ (PDF bajado sin sección del producto vs PDF no descargado); el aviso de siempre se conserva', () => {
  const productos = ['TERCEROS', 'TERCEROS AMPLIADO']
  const pdf = coberturasPorProducto(['TERCEROS AMPLIADO', 'Robo   Incluida'], productos)
  const d1 = diagnosticoGarantiasMapfre({ pdfBytes: 5000, pdfLineas: 40, deLaPdf: pdf, deLaPantalla: new Map(), productos })
  assert.match(d1, /descargado, 40 líneas.*«TERCEROS AMPLIADO»/)
  assert.doesNotMatch(d1, /con garantías de: «TERCEROS»/)
  assert.match(diagnosticoGarantiasMapfre({ pdfBytes: null, pdfLineas: 0, deLaPdf: new Map(), deLaPantalla: new Map(), productos }), /no descargado.*ningún producto/)
  assert.match(diagnosticoGarantiasMapfre({ pdfBytes: 900, pdfLineas: 0, deLaPdf: new Map(), deLaPantalla: new Map(), productos }), /sin texto legible/)
  const ofs: OfertaNormalizada[] = ofertasDesdePrimasMapfre(productos.map((producto) => ({ producto, periodicidad: 'anual' as const, primaTotalEur: 100, requiereVerificacionVehiculo: false })), null)
  const [a, b] = ofertasConGarantiasMapfre(ofs, pdf, new Map(), d1)
  assert.ok(a!.avisos.includes(AVISO_COBERTURAS_SIN_LEER)); assert.ok(a!.avisos.includes(d1))
  assert.equal(b!.avisos.includes(AVISO_COBERTURAS_SIN_LEER), false); assert.equal(b!.avisos.includes(d1), false)
})

test('pantalla: garantías en un panel PLEGADO (display:none) de la tarjeta se leen igualmente (solo lectura)', async () => {
  const nav = await lanzar()
  try {
    const page = await nav.newPage()
    await page.setContent(`<app-coberturas>
      <prima-producto><mat-select><span class="mat-select-value-text">TERCEROS</span></mat-select><mat-select><span class="mat-select-value-text">ANUAL</span></mat-select>
        <div style="display:none"><table><tr><td>Robo</td><td>No incluida</td></tr><tr><td>Lunas</td><td>Incluida</td></tr></table></div></prima-producto></app-coberturas>`)
    const m = await leerGarantiasPantallaMapfre(page, ['TERCEROS'])
    assert.equal(m.get('terceros')!.coberturas.length, 2)
    assert.equal(m.get('terceros')!.coberturas[0]!.estado, 'excluida')
  } finally { await nav.close() }
})
