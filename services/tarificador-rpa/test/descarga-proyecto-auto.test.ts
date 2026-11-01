// Descarga del PDF del presupuesto/proyecto guardado en AUTO (26/10/2026): Allianz 0.6.28, Mapfre 0.8.23, Generali 0.2.33.
// Fixtures SINTÉTICOS (sin datos personales). Buscador conservador: nunca emitir/contratar/pagar/firmar/enviar.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import type { OfertaNormalizada } from '@central/module-tarificacion'
import { buscarBotonDescargaProyecto, esBotonDescargaProyecto, instalarGuardEmision, pulsarDescargaProyectoAuto, type CompaniaDescargaProyecto } from '../src/guard.ts'
import { DESCARGA_PROYECTO_ACTIVA, descargarProyectoAuto, motivoPdfInvalido, ofertasConPdfProyecto } from '../src/descarga-proyecto-auto.ts'
import { allianzAuto } from '../src/adapters/allianz/auto.ts'
import { mapfreAuto } from '../src/adapters/mapfre/auto.ts'
import { VERSION_GENERALI_AUTO } from '../src/adapters/generali/auto.ts'

const PDF_MINIMO = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n' + ' '.repeat(80), 'latin1')

test('versiones: Allianz auto 0.6.35, Mapfre auto 0.8.30, Generali auto 0.2.41', () => {
  assert.equal(allianzAuto.version, '0.6.39')
  assert.equal(mapfreAuto.version, '0.8.44')
  assert.equal(VERSION_GENERALI_AUTO, '0.2.59')
})

test('interruptor por compañía: todas activadas por defecto', () => {
  assert.deepEqual({ ...DESCARGA_PROYECTO_ACTIVA }, { allianz: true, mapfre: true, generali: true })
})

test('pura: solo imprimir/descargar/pdf/documento + proyecto/presupuesto/oferta; nunca emitir/contratar/pagar/firmar/enviar', () => {
  for (const t of ['Imprimir presupuesto', 'Descargar presupuesto', 'Imprimir proyecto', 'Descargar PDF del proyecto', 'Ver documento del presupuesto', 'Descargar oferta', 'print presupuesto']) {
    for (const c of ['allianz', 'mapfre', 'generali'] as const) assert.equal(esBotonDescargaProyecto([t], c, true), true, `${c}: ${t}`)
    assert.equal(esBotonDescargaProyecto([t], 'allianz', false), true, `sin guardar: ${t}`)
  }
  // A secas: solo con el proyecto guardado y solo donde la compañía lo admite (Generali aún no guarda).
  for (const t of ['Imprimir', 'Descargar', 'Ver PDF', 'picture_as_pdf', 'print']) {
    assert.equal(esBotonDescargaProyecto([t], 'allianz', true), true, t)
    assert.equal(esBotonDescargaProyecto([t], 'mapfre', true), true, t)
    assert.equal(esBotonDescargaProyecto([t], 'allianz', false), false, `${t} sin guardar`)
    assert.equal(esBotonDescargaProyecto([t], 'generali', true), false, `${t} generali`)
  }
  for (const t of ['Emitir', 'Contratar', 'Grabar póliza', 'Pagar', 'Firmar', 'Formalizar', 'Enviar al cliente', 'Enviar email', 'Imprimir y emitir presupuesto', 'Enviar presupuesto por email', 'Descargar condiciones generales', 'Imprimir recibo', 'Documento', 'Documentos', 'Guardar presupuesto', 'Descargar aplicación']) {
    for (const c of ['allianz', 'mapfre', 'generali'] as const) assert.equal(esBotonDescargaProyecto([t], c, true), false, `${c}: ${t}`)
  }
  // Un id o manejador de emisión tumba el texto bueno.
  assert.equal(esBotonDescargaProyecto(['Imprimir presupuesto', null, null, null, 'btnEmitir'], 'allianz', true), false)
  assert.equal(esBotonDescargaProyecto(['Imprimir presupuesto', null, null, null, null, null, null, 'emitirPoliza()'], 'allianz', true), false)
})

test('pura: validación del fichero (%PDF y tamaño razonable)', () => {
  assert.equal(motivoPdfInvalido(PDF_MINIMO), null)
  assert.match(motivoPdfInvalido(Buffer.from('<html>' + 'x'.repeat(500)))!, /%PDF/)
  assert.match(motivoPdfInvalido(Buffer.from('%PDF-1.4'))!, /pequeño/)
  assert.match(motivoPdfInvalido(Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(4 * 1024 * 1024)]))!, /grande/)
})

test('pura: el PDF y el aviso van a TODAS las ofertas (mismo PdfRef)', () => {
  const o = { compania: 'allianz', producto: 'x', primaAnualEur: 1, avisos: ['a'], pdf: null } as unknown as OfertaNormalizada
  const [a, b] = ofertasConPdfProyecto([o, o], { pdf: { indice: 0, nombre: 'p.pdf' }, aviso: null })
  assert.deepEqual(a!.pdf, { indice: 0, nombre: 'p.pdf' })
  assert.deepEqual(b!.pdf, a!.pdf)
  assert.deepEqual(a!.avisos, ['a'])
  const [c] = ofertasConPdfProyecto([o], { pdf: null, aviso: 'PDF del proyecto no descargado en X: y' })
  assert.equal(c!.pdf, null)
  assert.equal(c!.avisos.at(-1), 'PDF del proyecto no descargado en X: y')
})

// ── Navegador ──
let browser: Browser
before(async () => {
  const opciones = { headless: true, args: ['--proxy-server=http://127.0.0.1:9'] }
  try {
    browser = await chromium.launch(opciones)
  } catch (e) {
    const dir0 = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(dir0) ? readdirSync(dir0).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(dir0, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ ...opciones, executablePath: exe })
  }
})
after(async () => { await browser?.close() })

const pagina = (cuerpo: string) => `<!doctype html><html><body><h1>Proyecto guardado</h1>${cuerpo}</body></html>`

async function abrir(cuerpo: string, pdf: Buffer | string = PDF_MINIMO) {
  const context: BrowserContext = await browser.newContext({ acceptDownloads: true })
  const guard = await instalarGuardEmision(context)
  await context.route('https://**/*', (r) => {
    const url = new URL(r.request().url())
    if (url.pathname === '/doc.pdf') return r.fulfill({ status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="doc.pdf"' }, body: pdf as Buffer })
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pagina(cuerpo) })
  })
  const page: Page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.goto('https://portal.test/proyecto')
  const adjuntos: { nombre: string; bytes: Buffer }[] = []
  const ctx = {
    adjuntarPdf: (nombre: string, bytes: Uint8Array) => (adjuntos.push({ nombre, bytes: Buffer.from(bytes) }), { indice: adjuntos.length - 1, nombre }),
    log: () => {},
    buscarDescargaProyectoAuto: (p: Page, c: CompaniaDescargaProyecto, g: boolean) => buscarBotonDescargaProyecto(p, guard, c, g, 600),
    pulsarDescargaProyectoAuto: (p: Page, b: import('playwright').Locator, c: CompaniaDescargaProyecto, g: boolean) => pulsarDescargaProyectoAuto(p, guard, b, c, g),
  }
  return { context, page, ctx, adjuntos }
}
const marca = (page: Page, k: string) => page.evaluate((x) => (window as unknown as Record<string, unknown>)[x] ?? null, k)

test('«Imprimir presupuesto» dispara la descarga de un PDF → PdfRef por adjuntarPdf, sin aviso', async () => {
  const { context, page, ctx, adjuntos } = await abrir('<button type="button" onclick="location.href=\'/doc.pdf\'">Imprimir presupuesto</button><button type="button" onclick="window.__emitido=1">Emitir</button>')
  try {
    const r = await descargarProyectoAuto(page, ctx, 'allianz', 'presupuesto.pdf', true, 8_000)
    assert.deepEqual(r, { pdf: { indice: 0, nombre: 'presupuesto.pdf' }, aviso: null })
    assert.equal(adjuntos.length, 1)
    assert.equal(adjuntos[0]!.bytes.subarray(0, 5).toString('latin1'), '%PDF-')
    assert.equal(await marca(page, '__emitido'), null, 'Emitir no se pulsa')
  } finally {
    await context.close()
  }
})

test('botón de solo icono (picture_as_pdf) con el proyecto guardado (Mapfre)', async () => {
  const { context, page, ctx, adjuntos } = await abrir('<button type="button" aria-label="x" onclick="location.href=\'/doc.pdf\'"><span class="material-icons">picture_as_pdf</span></button>')
  try {
    const r = await descargarProyectoAuto(page, ctx, 'mapfre', 'proyecto.pdf', true, 8_000)
    assert.equal(r.aviso, null)
    assert.equal(adjuntos.length, 1)
  } finally {
    await context.close()
  }
})

test('el botón abre una VENTANA con el PDF → se captura y la ventana se cierra', async () => {
  const { context, page, ctx, adjuntos } = await abrir('<a href="#" role="button" onclick="window.open(\'/doc.pdf\');return false">Descargar PDF del proyecto</a>')
  try {
    const r = await descargarProyectoAuto(page, ctx, 'mapfre', 'proyecto.pdf', true, 8_000)
    assert.equal(r.aviso, null)
    assert.ok(r.pdf)
    assert.equal(adjuntos.length, 1)
    assert.equal(context.pages().length, 1, 'la ventana abierta para el PDF se cerró')
  } finally {
    await context.close()
  }
})

test('solo «Emitir»/«Contratar»/«Enviar al cliente» y sin descarga → NO se pulsa nada, aviso con los botones a la vista', async () => {
  const { context, page, ctx, adjuntos } = await abrir('<button onclick="window.__emitido=1">Emitir</button><button onclick="window.__c=1">Contratar</button><button onclick="window.__e=1">Enviar al cliente</button><button onclick="window.__g=1">Guardar presupuesto</button>')
  try {
    const r = await descargarProyectoAuto(page, ctx, 'allianz', 'presupuesto.pdf', true, 2_000)
    assert.equal(r.pdf, null)
    assert.match(r.aviso!, /^PDF del proyecto no descargado en Allianz: no aparece ningún botón/)
    assert.match(r.aviso!, /controles a la vista: .*«Emitir»/)
    assert.equal(adjuntos.length, 0)
    for (const k of ['__emitido', '__c', '__e', '__g']) assert.equal(await marca(page, k), null, k)
  } finally {
    await context.close()
  }
})

test('el botón se pulsa pero no llega ningún PDF → aviso (precio intacto), sin lanzar', async () => {
  const { context, page, ctx } = await abrir('<button type="button" onclick="window.__p=1">Imprimir presupuesto</button>')
  try {
    const r = await descargarProyectoAuto(page, ctx, 'generali', 'presupuesto.pdf', false, 1_200)
    assert.equal(r.pdf, null)
    assert.match(r.aviso!, /^PDF del proyecto no descargado en Generali: «Imprimir presupuesto» no produjo ningún PDF/)
    assert.equal(await marca(page, '__p'), 1)
  } finally {
    await context.close()
  }
})

test('lo que llega no es un PDF (HTML descargado) → aviso, nada adjuntado', async () => {
  const { context, page, ctx, adjuntos } = await abrir('<button type="button" onclick="location.href=\'/doc.pdf\'">Imprimir presupuesto</button>', Buffer.from('<html>' + 'x'.repeat(400)))
  try {
    const r = await descargarProyectoAuto(page, ctx, 'allianz', 'presupuesto.pdf', true, 1_500)
    assert.equal(r.pdf, null)
    assert.match(r.aviso!, /no descargado en Allianz/)
    assert.equal(adjuntos.length, 0)
  } finally {
    await context.close()
  }
})

test('Generali (no guarda aún): «Imprimir» a secas NO se pulsa; con «presupuesto» en el rótulo, sí', async () => {
  const seco = await abrir('<button type="button" onclick="window.__p=1">Imprimir</button>')
  try {
    const r = await descargarProyectoAuto(seco.page, seco.ctx, 'generali', 'p.pdf', false, 1_000)
    assert.match(r.aviso!, /no descargado en Generali/)
    assert.equal(await marca(seco.page, '__p'), null)
  } finally {
    await seco.context.close()
  }
  const con = await abrir('<button type="button" onclick="location.href=\'/doc.pdf\'">Imprimir presupuesto</button>')
  try {
    const r = await descargarProyectoAuto(con.page, con.ctx, 'generali', 'p.pdf', false, 8_000)
    assert.equal(r.aviso, null)
    assert.ok(r.pdf)
  } finally {
    await con.context.close()
  }
})

test('interruptor apagado → no busca ni pulsa nada, sin aviso', async () => {
  const { context, page, ctx } = await abrir('<button type="button" onclick="window.__p=1">Imprimir presupuesto</button>')
  const activa = DESCARGA_PROYECTO_ACTIVA as Record<CompaniaDescargaProyecto, boolean>
  activa.mapfre = false
  try {
    assert.deepEqual(await descargarProyectoAuto(page, ctx, 'mapfre', 'p.pdf', true, 500), { pdf: null, aviso: null })
    assert.equal(await marca(page, '__p'), null)
  } finally {
    activa.mapfre = true
    await context.close()
  }
})

test('sin las puertas guardadas del runner → aviso, no rompe', async () => {
  const { context, page } = await abrir('<button>Imprimir presupuesto</button>')
  try {
    const r = await descargarProyectoAuto(page, { log: () => {} }, 'allianz', 'p.pdf', true, 500)
    assert.match(r.aviso!, /no descargado en Allianz/)
  } finally {
    await context.close()
  }
})

test('Mapfre: el «Imprimir» a secas solo si el proyecto quedó GENERADO (no con sin_numero ni no_generado)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../src/adapters/mapfre/auto.ts', import.meta.url), 'utf8')
  assert.match(src, /descargarProyectoAuto\(nsei, ctxPdf, 'mapfre', 'proyecto-mapfre-auto\.pdf', proyecto\.estado === 'generado'\)/)
  assert.doesNotMatch(src, /'proyecto-mapfre-auto\.pdf', proyecto\.estado !== /)
})
