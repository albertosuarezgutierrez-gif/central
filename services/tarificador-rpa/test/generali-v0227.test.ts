// Generali Turismos v0.2.27 (26/10/2026, prueba real con 0.2.26): tras el tomador, «Garantías y Resultados» no daba precio y la pantalla seguía siendo el
// formulario de «Valoración Riesgo» (pestañas + botones siguiente/cancelar, sin ningún «€»). El lector entiende tablas y el atasco vuelca pestañas/tablas/botones.
// Fixtures SINTÉTICAS fieles al DOM visto (ningún dato real).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { leerPrecioGenerali, resumenVolcadoResultadosGenerali } from '../src/adapters/generali/reglas.ts'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsar, pulsarSiguienteValoracionGenerali, textoEmisionGenerali, MAX_SIGUIENTE_VALORACION_GENERALI, type GuardEmision } from '../src/guard.ts'
import { VERSION_GENERALI_AUTO, textoPagina, volcarResultadosGenerali } from '../src/adapters/generali/auto.ts'

test('v0.2.27 · versión (>= 0.2.27)', () => assert.match(VERSION_GENERALI_AUTO, /^0\.2\.(2[7-9]|[3-9]\d)$/))

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

/** Lo visto en la prueba real: pestañas, formulario y botones, SIN importes. */
const PANTALLA_VISTA = `<ul class="tabs"><li><a href="#">Valoración Riesgo</a></li><li class="current"><a href="#">Datos de Valoración</a></li><li><a href="#">Garantías y Resultados</a></li></ul>
  <a href="#" onclick="return false">Paso con datos incompletos</a>
  <input id="reg1063A_vehiculo_identVehiculo_matveh" type="text" value="">
  <input id="cancelar" type="button" value="Cancelar"><input id="siguiente" type="button" value="Siguiente">`

test('v0.2.27 · pantalla vista en la prueba real: sin precio y el volcado dice qué pestaña sigue marcada y qué botones hay', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(`<html><body>${PANTALLA_VISTA}</body></html>`)
    assert.equal(leerPrecioGenerali(await textoPagina(page)).tipo, 'ninguno')
    const v = await volcarResultadosGenerali(page)
    assert.equal(v.length, 1)
    const r = resumenVolcadoResultadosGenerali(v)
    assert.match(r, /Datos de Valoración\*/, r)
    assert.doesNotMatch(r, /Garantías y Resultados\*/, r)
    assert.match(r, /botones Cancelar,Siguiente/, r)
  } finally {
    await page.close()
  }
})

const RESULTADOS = (importes: [string, string][]) => `<ul><li class="current"><a href="#">Garantías y Resultados</a></li></ul>
  <table><tr><th>Modalidad</th><th>Prima anual</th><th>Franquicia</th></tr>
  ${importes.map(([m, p]) => `<tr><td>${m}</td><td>${p}</td><td>300,00 €</td></tr>`).join('')}</table>`

test('v0.2.27 · tabla de resultados con UNA modalidad: la prima de la columna «Prima» (no la franquicia)', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(`<html><body>${RESULTADOS([['Terceros Ampliado', '412,35 €']])}</body></html>`)
    const l = leerPrecioGenerali(await textoPagina(page))
    assert.deepEqual(l.tipo === 'unico' ? l.eur : null, 412.35, JSON.stringify(l))
    const r = resumenVolcadoResultadosGenerali(await volcarResultadosGenerali(page))
    assert.match(r, /Garantías y Resultados\*/, r)
    assert.match(r, /\[Modalidad\|Prima anual\|Franquicia\]/, r)
    assert.match(r, /412,35 €/, r)
  } finally {
    await page.close()
  }
})

test('v0.2.27 · varias modalidades: no se elige a ciegas (varios, con su modalidad en la línea)', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(`<html><body>${RESULTADOS([['Terceros', '300,10 €'], ['Todo Riesgo', '650,40 €']])}</body></html>`)
    const l = leerPrecioGenerali(await textoPagina(page))
    assert.equal(l.tipo, 'varios')
    if (l.tipo === 'varios') assert.ok(l.candidatos.some((c) => /Todo Riesgo/.test(c.linea) && c.eur === 650.4), JSON.stringify(l.candidatos))
  } finally {
    await page.close()
  }
})

// ───────────────────────── puerta del guard: «Siguiente» de la valoración ─────────────────────────
const B028 = 'https://www.generali.es/emi_genAutosFormWeb/emiAutosGenB028.do'
const OTRA = 'https://www.generali.es/emi_genAutosFormWeb/otraPantalla.do'
const PORTAL = 'https://www.generali.es/arq_genernetPortalFormWeb/CorredorPortal.po'

type Op = { sinPestanas?: boolean; nif?: string; confirmar?: boolean; extra?: string; pestana?: string; url?: string; boton?: string }
const pantalla = (o: Op) => `${o.sinPestanas ? '' : `<ul><li><a href="#">Valoración Riesgo</a></li><li class="current"><a href="#">${o.pestana ?? 'Datos de Valoración'}</a></li><li><a href="#">Garantías y Resultados</a></li></ul>`}
  <a href="#" id="incompleto" onclick="parent.__incompleto=1;return false">Paso con datos incompletos</a>
  <input id="reg1063A_personas_interesado_nifcif" type="text" value="${o.nif ?? '00000000T'}" readonly>
  ${o.confirmar ? '<input id="confirmar" type="button" value="Confirmar">' : ''}
  ${o.extra ?? ''}
  <input id="cancelar" type="button" value="Cancelar">${o.boton ?? '<input id="siguiente" type="button" value="Siguiente" onclick="parent.__sig=(parent.__sig||0)+1">'}`

async function abrirSig(o: Op = {}): Promise<{ page: Page; guard: GuardEmision; cerrar: () => Promise<void> }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://www.generali.es/**', async (r) => {
    const u = r.request().url()
    const cuerpo = u.startsWith(PORTAL) ? `<iframe name="mainFrame" src="${o.url ?? B028}" style="width:900px;height:600px"></iframe>` : pantalla(o)
    await r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><body>${cuerpo}</body>` })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.goto(PORTAL)
  for (let i = 0; i < 40 && !page.frames().some((f) => f.url().startsWith(o.url ?? B028) && f.name() === 'mainFrame'); i++) await new Promise((x) => setTimeout(x, 100))
  await page.frames().find((f) => f.name() === 'mainFrame')!.locator('#cancelar').waitFor()
  return { page, guard, cerrar: () => context.close() }
}
const clics = (page: Page) => page.evaluate(() => (window as unknown as { __sig?: number }).__sig ?? 0)
const bloquea = (re: RegExp) => (e: unknown) => e instanceof EmisionBloqueadaError && re.test((e as Error).message)

test('v0.2.27 · textoEmisionGenerali: emitir/contratar/grabar póliza/pagar/firmar sí; el menú «Emisión» y «Garantías» no', () => {
  for (const t of ['Emitir póliza', 'Contratar ahora', 'Grabar la póliza', 'Pagar recibo', 'Firmar']) assert.ok(textoEmisionGenerali(t), t)
  for (const t of ['Emisión', 'Contratación', 'Garantías y Resultados', 'Datos de Valoración']) assert.ok(!textoEmisionGenerali(t), t)
})

test('v0.2.27 · puerta «Siguiente»: pulsa #siguiente en la valoración con el tomador relleno, máx. 3 veces; «Paso con datos incompletos» nunca', async () => {
  const { page, guard, cerrar } = await abrirSig()
  try {
    for (let i = 0; i < MAX_SIGUIENTE_VALORACION_GENERALI; i++) await pulsarSiguienteValoracionGenerali(page, guard, 50)
    assert.equal(await clics(page), MAX_SIGUIENTE_VALORACION_GENERALI)
    await assert.rejects(() => pulsarSiguienteValoracionGenerali(page, guard, 50), bloquea(/ya se pulsó 3 veces/))
    assert.equal(await clics(page), 3)
    assert.equal(await page.evaluate(() => (window as unknown as { __incompleto?: number }).__incompleto ?? 0), 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.27 · cepo de la puerta: fuera del marco emiAutosGenB028.do, con el tomador vacío, con «Datos personas» abierto, fuera de la valoración o con texto de emisión → BLOQUEA y no pulsa', async () => {
  const casos: [string, Op, RegExp][] = [
    ['otro marco', { url: OTRA }, /fuera de emiAutosGenB028\.do/],
    ['tomador vacío', { nif: '' }, /sin confirmar/],
    ['datos personas abierto', { confirmar: true }, /Datos personas/],
    ['otra pestaña', { sinPestanas: true }, /fuera de «Valoración Riesgo»/],
    ['texto de emisión', { extra: '<p>Pulse para emitir la póliza</p>' }, /textos de emisión/],
    ['diálogo de pago', { extra: '<div role="dialog">Debe pagar ahora</div>' }, /textos de emisión/],
  ]
  for (const [nombre, o, re] of casos) {
    const { page, guard, cerrar } = await abrirSig(o)
    try {
      await assert.rejects(() => pulsarSiguienteValoracionGenerali(page, guard, 50), bloquea(re), nombre)
      assert.equal(await clics(page), 0, nombre)
    } finally {
      await cerrar()
    }
  }
})

test('v0.2.27 · el «Siguiente» de la puerta no es un «Confirmar»: un botón que se llama distinto no pasa, y el pulsar genérico sigue rechazando «Confirmar» de Generali', async () => {
  const { page, guard, cerrar } = await abrirSig({ boton: '<input id="siguiente" type="button" value="Emitir" onclick="parent.__sig=1">' })
  try {
    await assert.rejects(() => pulsarSiguienteValoracionGenerali(page, guard, 50), EmisionBloqueadaError)
    assert.equal(await clics(page), 0)
  } finally {
    await cerrar()
  }
  const g2 = await abrirSig({ confirmar: true })
  try {
    const marco = g2.page.frames().find((f) => f.name() === 'mainFrame')!
    await assert.rejects(() => pulsar(marco.locator('#confirmar'), g2.guard), bloquea(/Confirmar \(Generali: solo por su puerta/))
  } finally {
    await g2.cerrar()
  }
})
