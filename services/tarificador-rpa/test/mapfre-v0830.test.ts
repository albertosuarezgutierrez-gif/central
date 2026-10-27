// Mapfre auto v0.8.30 (27/10/2026, trabajo real con 0.8.29, captura del atasco): «Figuras» (pestaña Tomador: Datos Básicos, Dirección Habitual, Permiso
// Conducir) NO pinta ningún bloque de siniestralidad. El diagnóstico decía «compania» mat-select habilitado, pero ese control NO se veía (la selección exige
// visible) y el diagnóstico no daba el motivo: ni si estaba oculto ni en qué componente vive (la lista de 20 controles del atasco es el inventario genérico y
// corta antes). 0.8.28 (esperar 6 s) y 0.8.29 (unificar localizador) no atacaban eso. Ahora el diagnóstico dice VISIBLE/OCULTO, por qué y el componente.
// Fixtures SINTÉTICAS (sin datos personales).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { readFileSync } from 'node:fs'
import { companiaHabilitadaOculta, describirBloqueHistorial, mapfreAuto, rellenarMatSelects, selectCompaniaPorEtiqueta, SEL_HISTORIAL } from '../src/adapters/mapfre/auto.ts'

let browser: Browser
before(async () => {
  try {
    browser = await chromium.launch({ headless: true })
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'chrome') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ headless: true, executablePath: exe })
  }
})
after(async () => {
  await browser?.close()
})
async function pagina(html: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(2_000)
  await page.setContent(html)
  return page
}
const SEL = '<mat-select formcontrolname="compania" style="display:inline-block;min-width:80px;min-height:14px"><span>x</span></mat-select>'
const CAMPO = (sel: string) => `<mat-form-field><label><mat-label>Compañia</mat-label></label>${sel}</mat-form-field><mat-form-field><label><mat-label>Procedencia Siniestralidad</mat-label></label><input formcontrolname="procedencia" disabled></mat-form-field>`
const FIGURAS = '<app-tomador><datos-licencia><mat-form-field><label><mat-label>Clase</mat-label></label><mat-select formcontrolname="codigoTipoLicencia" style="display:inline-block;min-width:80px;min-height:14px"></mat-select></mat-form-field></datos-licencia></app-tomador>'
const PLAN = { escribibles: [{ sel: SEL_HISTORIAL.companiaAnterior, tipo: 'mat-select', etiqueta: 'compañía anterior', paso: 'figuras', valor: 'ZZ Seguros', opciones: ['ZZ Seguros'] }], pendientes: [] } as never

test('v0.8.30 · la versión del bot es 0.8.30', () => assert.equal(mapfreAuto.version, '0.8.31'))

test('«Compañia» habilitado en otro componente OCULTO (display:none): el diagnóstico lo dice con el motivo y el componente; la selección no lo toca', async () => {
  const page = await pagina(`<body>${FIGURAS}<app-info-descuentos style="display:none">${CAMPO(SEL)}</app-info-descuentos></body>`)
  const diag = await describirBloqueHistorial(page)
  assert.match(diag, /«compania» mat-select\[compania\] habilitado OCULTO por app-info-descuentos display:none \(en app-info-descuentos\)/, diag)
  assert.match(diag, /OCULTO en esta pantalla/, diag)
  assert.doesNotMatch(diag, /sin lector|no es único, visible/, diag)
  assert.equal(await selectCompaniaPorEtiqueta(page), null)
  const elegidas: string[][] = []
  await assert.rejects(
    rellenarMatSelects(page, PLAN, { elegirMatSelect: async (_s: Locator, o: string[]) => { elegidas.push(o) } } as never, { page, formador: undefined } as never, 0),
    (e: unknown) => /no aparece/.test(String((e as Error).message)) && /habilitado OCULTO por app-info-descuentos display:none/.test(String((e as Error).message)),
  )
  assert.deepEqual(elegidas, [])
})

test('«Compañia» en una pestaña inactiva (mat-tab-body sin «active»): se declara como pestaña inactiva', async () => {
  const page = await pagina(`<body>${FIGURAS}<mat-tab-body class="mat-tab-body" style="display:none"><app-conductor>${CAMPO(SEL)}</app-conductor></mat-tab-body></body>`)
  const diag = await describirBloqueHistorial(page)
  assert.match(diag, /habilitado OCULTO por .*\(pestaña inactiva\) \(en app-conductor < mat-tab-body\)/, diag)
})

test('«Compañia» VISIBLE: el diagnóstico no añade «OCULTO» y la selección lo halla (sin regresión)', async () => {
  const page = await pagina(`<body><app-figuras>${CAMPO(SEL)}</app-figuras></body>`)
  const diag = await describirBloqueHistorial(page)
  assert.match(diag, /«compania» mat-select\[compania\] habilitado;/)
  assert.doesNotMatch(diag, /OCULTO/)
  assert.ok(await selectCompaniaPorEtiqueta(page))
})

test('el diagnóstico no vuelca texto de la pantalla (solo etiquetas, clases y nombres de control)', async () => {
  const page = await pagina(`<body><app-info-descuentos style="display:none">${CAMPO(SEL.replace('<span>x</span>', '<span>NIF 00000000T</span>'))}</app-info-descuentos></body>`)
  assert.doesNotMatch(await describirBloqueHistorial(page), /00000000T/)
})

// ── Intento de arreglo (misma 0.8.30): compañía anterior DIFERIDA al paso donde su desplegable es visible ──
const OCULTA = `<body>${FIGURAS}<app-info-descuentos id="cob" style="display:none">${CAMPO(SEL)}</app-info-descuentos></body>`
const ctxElegir = (elegidas: string[][]) => ({ elegirMatSelect: async (_s: Locator, o: string[]) => { elegidas.push(o); return { texto: o[0], origen: 'coincidencia' as const } } }) as never

test('diferida: con «Compañia» habilitado OCULTO en «Figuras» NO se atasca ni se omite: queda en `diferidos` y no se elige nada aún', async () => {
  const page = await pagina(OCULTA)
  assert.equal(await companiaHabilitadaOculta(page), true)
  const elegidas: string[][] = []
  const diferidos: never[] = []
  const hechos = await rellenarMatSelects(page, PLAN, ctxElegir(elegidas), { page, formador: undefined } as never, 0, diferidos as never)
  assert.deepEqual(hechos, [])
  assert.equal(diferidos.length, 1)
  assert.deepEqual(elegidas, [])
})

test('diferida: al hacerse visible (paso Coberturas) se elige con el MISMO helper y casado exacto (opciones del plan, sin difuso)', async () => {
  const page = await pagina(OCULTA)
  const diferidos: unknown[] = []
  await rellenarMatSelects(page, PLAN, ctxElegir([]), { page, formador: undefined } as never, 0, diferidos as never)
  await page.evaluate(() => { (document.getElementById('cob') as HTMLElement).style.display = 'block' })
  const elegidas: string[][] = []
  const hechos = await rellenarMatSelects(page, { escribibles: diferidos, pendientes: [] } as never, ctxElegir(elegidas), { page, formador: undefined } as never, 0)
  assert.deepEqual(hechos, ['compañía anterior'])
  assert.deepEqual(elegidas, [['ZZ Seguros']])
})

test('diferida: si en el segundo paso TAMPOCO es visible → hueco «no aparece» con el diagnóstico OCULTO (nunca se omite)', async () => {
  const page = await pagina(OCULTA)
  const diferidos: unknown[] = []
  await rellenarMatSelects(page, PLAN, ctxElegir([]), { page, formador: undefined } as never, 0, diferidos as never)
  await assert.rejects(
    rellenarMatSelects(page, { escribibles: diferidos, pendientes: [] } as never, ctxElegir([]), { page, formador: undefined } as never, 0),
    (e: unknown) => /no aparece/.test(String((e as Error).message)) && /OCULTO por app-info-descuentos display:none/.test(String((e as Error).message)),
  )
})

test('diferida: sin `diferidos` o con el control visible/ausente el comportamiento es el de siempre (hueco / elección directa)', async () => {
  const oculta = await pagina(OCULTA)
  await assert.rejects(rellenarMatSelects(oculta, PLAN, ctxElegir([]), { page: oculta, formador: undefined } as never, 0), /no aparece/)
  const visible = await pagina(`<body><app-figuras>${CAMPO(SEL)}</app-figuras></body>`)
  assert.equal(await companiaHabilitadaOculta(visible), false)
  const diferidos: unknown[] = []
  const elegidas: string[][] = []
  await rellenarMatSelects(visible, PLAN, ctxElegir(elegidas), { page: visible, formador: undefined } as never, 0, diferidos as never)
  assert.equal(diferidos.length, 0)
  assert.deepEqual(elegidas, [['ZZ Seguros']])
  const vacia = await pagina(`<body>${FIGURAS}</body>`)
  assert.equal(await companiaHabilitadaOculta(vacia), false)
  await assert.rejects(rellenarMatSelects(vacia, PLAN, ctxElegir([]), { page: vacia, formador: undefined } as never, 0, [] as never), /no aparece/)
})

test('cableado: precioDesdeObjetoAsegurado pasa `diferidos` en Figuras y los elige tras las primas, volviendo a leerlas', () => {
  const src = readFileSync(new URL('../src/adapters/mapfre/auto.ts', import.meta.url), 'utf8')
  assert.match(src, /ESPERA_OPCIONAL_MS, diferidos\)/)
  assert.match(src, /if \(diferidos\.length > 0\) \{\s*await rellenarMatSelects\(nsei, \{ escribibles: diferidos, pendientes: \[\] \}, ctx, respaldo\)[\s\S]*?primas = await esperarPrimasMapfre/)
})
