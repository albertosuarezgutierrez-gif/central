// Explorador 0.3.23 (30/10/2026) · worker, DOM VIVO. Páginas SINTÉTICAS (sin PII) servidas por `page.route` en los orígenes reales.
// 1) Mapfre NSE «Datos del vehículo (patinete)»: POST a …/infObjetoAsegurado/infObjetoAseguradoAutos.jsf con `formObjAseg:confirmarGuardado`
//    (confirmar el guardado de los datos del objeto asegurado) → no se aborta; el botón JSF, javax.faces.source u otra pantalla → abortado,
//    y el error lista TODOS los nombres con la clase de su valor (nunca valores), sin cortarse.
// 2) Fidelidade «Datos Cliente - Nombre y régimen»: un overlay de carga (`Feedback_AjaxWait loading_overlay`) interceptaba el clic del radio
//    los 30 s del timeout. Antes de cada acción se espera a que se vaya (≤90 s); si sigue, error REINTENTABLE (infra), nunca clic forzado.
// 3) Allianz ePAC: «Nueva Alta» (#link_new_policy) deshabilitado en el home: espera ≤90 s, UNA recarga del home y otra espera; si sigue,
//    error REINTENTABLE (infra) con el motivo.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { EmisionBloqueadaError, rutasAppTolerablesDe, type InventarioDom } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsar, pulsarExploracionAutorizada, pulsarGuardadoDialogoAutorizado, pulsarGuardadoPresupuesto, tolerarRutasApp, type GuardEmision } from '../src/guard.ts'
import { bucleExploracion, EXPLORADOR_VERSION, type ContextoBucle } from '../src/explorador.ts'
import { decisionOverlay, esClaseOverlayCarga, esperarSinOverlayCarga, overlayBloquea, sondearOverlaysCarga, type OverlayCarga } from '../src/overlay-carga.ts'
import { abrirNuevaAlta } from '../src/adapters/allianz/entrada.ts'
import { esperarHabilitadoConRecarga } from '../src/adapters/allianz/intranet/entrada.ts'
import { ErrorTarificador, clasificar } from '../src/errores.ts'
import type { RespuestaPaso } from '../src/api.ts'

let browser: Browser
before(async () => {
  const opciones = { headless: true, args: ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1'] }
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
after(async () => {
  await browser?.close()
})

type Pet = { metodo: string; url: string; cuerpo: string; fallo: string | null }
let peticiones: Pet[] = []
async function abrir(html: string, url: string): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision; gets: () => number }> {
  peticiones = []
  let nGets = 0
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(5_000)
  page.on('request', (r) => { peticiones.push({ metodo: r.method(), url: r.url(), cuerpo: r.postData() ?? '', fallo: null }) })
  page.on('requestfailed', (r) => { const p = peticiones.find((x) => x.url === r.url() && x.metodo === r.method() && x.fallo === null); if (p) p.fallo = r.failure()?.errorText ?? '?' })
  await page.route('https://**/*', async (route) => {
    if (route.request().method() === 'GET') {
      nGets++
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
    } else await route.fallback()
  })
  await page.goto(url)
  return { context, page, guard, gets: () => nGets }
}
const posts = () => peticiones.filter((p) => p.metodo === 'POST')
const elementos = (inv: InventarioDom) => inv.marcos.flatMap((m) => m.elementos)
const refDe = (inv: InventarioDom, id: string) => elementos(inv).find((e) => e.id === id && e.ref)!.ref!
const respuesta = (acciones: unknown[]) => ({ version: 1, pantalla: { nombre: 'Pantalla', tipo: 'formulario' }, acciones, mapeo: [], motivo: null })

function contexto(page: Page, guard: GuardEmision, entrada: string, ramo: string, compania: string, guion: (inv: InventarioDom, n: number) => unknown, extra: Partial<ContextoBucle> = {}): ContextoBucle {
  let n = 0
  return {
    trabajoId: '00000000-0000-4000-8000-000000000323', compania, ramo, entrada,
    conDatosReales: false, riesgo: {}, env: {}, guard,
    pulsar: (b) => pulsar(b, guard),
    pulsarAutorizado: (b, el, marco) => pulsarExploracionAutorizada(page, guard, b, { entrada, el, marco }),
    pulsarGuardado: (b, el, pantalla, trasClic) => pulsarGuardadoPresupuesto(page, guard, b, { el, pantalla }, trasClic),
    pulsarGuardadoDialogo: (b, el, marco) => pulsarGuardadoDialogoAutorizado(page, guard, b, { entrada, el, marco }),
    topePdfMs: 2_000,
    esperaRepintadoMs: 50,
    pausaAccion: async () => undefined,
    pedirPaso: async (c): Promise<RespuestaPaso> => ({ estado: 'ok', respuesta: await guion(c.inventario, ++n), leaseHasta: null }),
    log: () => undefined,
    ...extra,
  }
}

test('versión del explorador 0.3.23', () => assert.equal(EXPLORADOR_VERSION, '0.3.23'))

// ─── 1) Mapfre NSE: confirmarGuardado del objeto asegurado ──────────────────────────────────────────────────────────────────────────
const MF = 'mapfre:automoviles:patinetes'
const ORIGEN_NSE = 'https://wmediadores.mapfre.com'
const URL_OBJ = `${ORIGEN_NSE}/EVT21_NSE_FWEB/app/emision/infObjetoAsegurado/infObjetoAseguradoAutos.jsf`
const URL_DG = `${ORIGEN_NSE}/EVT21_NSE_FWEB/app/emision/informacionGeneral/datosGenerales.jsf`
async function postNse(cuerpo: string, destino = URL_OBJ) {
  const { context, page, guard } = await abrir('<!doctype html><html><body><form id="formObjAseg"><h2>Datos del vehículo</h2></form></body></html>', URL_OBJ)
  try {
    tolerarRutasApp(guard, rutasAppTolerablesDe(MF))
    await page.evaluate(([u, c]) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: c }).catch(() => undefined), [destino, cuerpo])
    await page.waitForTimeout(200)
    return { violacion: guard.violacion(), fallo: posts()[0]?.fallo ?? null }
  } finally {
    await context.close()
  }
}
const REAL_OBJ = 'formObjAseg=formObjAseg&formObjAseg%3AcodigoPostal=41003&formObjAseg%3AconfirmarGuardado=&javax.faces.ViewState=j_id5'

test('0.3.23 · Mapfre NSE real: POST a infObjetoAseguradoAutos.jsf con confirmarGuardado (vacío/false/true) → no se aborta (antes: «confirm»)', async () => {
  for (const v of ['', 'false', 'true']) {
    const cuerpo = REAL_OBJ.replace('Guardado=', `Guardado=${v}`)
    const r = await postNse(cuerpo)
    assert.equal(r.violacion, null, `${cuerpo}: ${String(r.violacion)}`)
    assert.ok(!String(r.fallo).startsWith('net::ERR_BLOCKED_BY_CLIENT'), `${cuerpo}: ${r.fallo}`)
  }
})

test('0.3.23 · Mapfre NSE: botón JSF, javax.faces.source, valor de acción u otra pantalla → abortado', async () => {
  for (const [cuerpo, destino] of [
    [`${REAL_OBJ}&javax.faces.source=formObjAseg%3AconfirmarGuardado`, URL_OBJ],
    [REAL_OBJ.replace('Guardado=', 'Guardado=formObjAseg%3AconfirmarGuardado'), URL_OBJ],
    [REAL_OBJ.replace('Guardado=', 'Guardado=Confirmar'), URL_OBJ],
    [`${REAL_OBJ}&formObjAseg%3AbtnConfirmar=formObjAseg%3AbtnConfirmar`, URL_OBJ],
    [REAL_OBJ, URL_DG],
  ] as const) {
    const r = await postNse(cuerpo, destino)
    assert.ok(r.violacion instanceof EmisionBloqueadaError, `${cuerpo} → ${destino}`)
    assert.match(String(r.fallo), /^net::ERR_BLOCKED_BY_CLIENT/, cuerpo)
  }
})

test('0.3.23 · Mapfre NSE: el error lista TODOS los nombres con la clase de su valor, sin cortarse ni valores', async () => {
  const extra = Array.from({ length: 8 }, (_, k) => `formObjAseg%3AbtnConfirmarNumero${k}=SECRETO${k}`).join('&')
  const r = await postNse(`${REAL_OBJ}&formObjAseg%3AbtnFirmar=12345678Z&formObjAseg%3AconfirmarX=&formObjAseg%3AconfirmarY=true&formObjAseg%3AconfirmarZ=7&${extra}`)
  assert.ok(r.violacion instanceof EmisionBloqueadaError)
  const msg = r.violacion!.message
  assert.match(msg, /\[acción en el cuerpo de la petición: parámetros \(12\): «formObjAseg:btnFirmar» \[valor: otro\] casa con «firm», «formObjAseg:confirmarX» \[valor: vacío\] casa con «confirm», «formObjAseg:confirmarY» \[valor: true\] casa con «confirm», «formObjAseg:confirmarZ» \[valor: num\] casa con «confirm»/)
  for (let k = 0; k < 8; k++) assert.ok(msg.includes(`«formObjAseg:btnConfirmarNumero${k}» [valor: otro]`), `falta el ${k}: ${msg}`)
  assert.doesNotMatch(msg, /más\)/)
  assert.doesNotMatch(msg, /SECRETO|12345678Z|41003|confirmarGuardado/)
  assert.ok(msg.includes(URL_OBJ), 'la URL va detrás')
})

// ─── 2) Overlay de carga (Fidelidade) ───────────────────────────────────────────────────────────────────────────────────────────────
const o = (x: Partial<OverlayCarga>): OverlayCarga => ({ clase: 'Feedback_AjaxWait loading_overlay', visible: true, cubre: 1, tapaObjetivo: true, ...x })

test('0.3.23 · overlay: clase de carga (loading_overlay / AjaxWait), conservadora', () => {
  for (const c of ['Feedback_AjaxWait loading_overlay', 'loading_overlay', 'x Feedback_AjaxWait', 'OSAjaxWait', 'my-LOADING_OVERLAY']) assert.equal(esClaseOverlayCarga(c), true, c)
  for (const c of ['loading', 'overlay', 'loading overlay', 'modal-backdrop', 'spinner', '', null, undefined]) assert.equal(esClaseOverlayCarga(c), false, String(c))
})

test('0.3.23 · overlay: bloquea solo si es de carga, visible y tapa el control o ≥ la mitad de la pantalla', () => {
  assert.equal(overlayBloquea(o({})), true)
  assert.equal(overlayBloquea(o({ tapaObjetivo: false, cubre: 0.5 })), true)
  assert.equal(overlayBloquea(o({ tapaObjetivo: true, cubre: 0 })), true)
  assert.equal(overlayBloquea(o({ visible: false })), false)
  assert.equal(overlayBloquea(o({ tapaObjetivo: false, cubre: 0.2 })), false)
  assert.equal(overlayBloquea(o({ clase: 'modal-backdrop' })), false)
  assert.equal(overlayBloquea(o({ tapaObjetivo: false, cubre: Number.NaN })), false)
  assert.equal(decisionOverlay(null, 999_999, 90_000), 'seguir')
  assert.equal(decisionOverlay([], 0, 90_000), 'seguir')
  assert.equal(decisionOverlay([o({ visible: false }), o({ cubre: 0.1, tapaObjetivo: false })], 0, 90_000), 'seguir')
  assert.equal(decisionOverlay([o({})], 89_999, 90_000), 'esperar')
  assert.equal(decisionOverlay([o({})], 90_000, 90_000), 'agotado')
})

test('0.3.23 · overlay: espera con reloj falso — se va a tiempo → sigue; nunca se va → error reintentable (infra) al tope', async () => {
  let t = 0
  const dormir = async (ms: number) => { t += ms }
  let n = 0
  const esperado = await esperarSinOverlayCarga('marcar', { sondear: async () => (++n < 4 ? [o({})] : []), dormir, ahora: () => t, topeMs: 90_000, sondeoMs: 500 })
  assert.equal(esperado, 1_500)
  t = 0
  await assert.rejects(esperarSinOverlayCarga('marcar', { sondear: async () => [o({})], dormir, ahora: () => t, topeMs: 90_000, sondeoMs: 500 }), (e: unknown) => {
    assert.ok(e instanceof ErrorTarificador)
    assert.equal(e.tipo, 'infra')
    assert.equal(clasificar(e).tipo, 'infra')
    assert.match(e.message, /overlay de carga.*90 s.*«marcar».*no se fuerza el clic \(reintentable\)/)
    return true
  })
  assert.equal(t, 90_000)
  // Sin poder mirar el DOM: se sigue (la acción tiene su propio timeout, sin force).
  assert.equal(await esperarSinOverlayCarga('marcar', { sondear: async () => { throw new Error('x') }, dormir, ahora: () => t }), 0)
})

const URL_FI = 'https://mediadores.fidelidade.es/OPI_ES_Vivienda/Simualtion.aspx'
const FI = 'fidelidade:particulares:vivienda'
/** `quitarEn`: ms hasta que el overlay desaparece (null = nunca). `estilo`: estilo del overlay. */
const PAGINA_OVERLAY = (quitarEn: number | null, estilo = 'position:fixed;inset:0;background:rgba(0,0,0,.2);z-index:9999') => `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body>
  <form id="f" onsubmit="return false"><h2>Datos Cliente - Nombre y régimen</h2>
    <fieldset><legend>Régimen</legend>
      <input type="radio" id="reg1" name="regimen" value="P"><label for="reg1">Propietario</label>
      <input type="radio" id="reg2" name="regimen" value="I"><label for="reg2">Inquilino</label>
    </fieldset>
  </form>
  <footer><div id="ov" class="Feedback_AjaxWait loading_overlay" style="${estilo}"></div></footer>
  ${quitarEn === null ? '' : `<script>setTimeout(function(){ document.getElementById('ov').remove() }, ${quitarEn})</script>`}
  </body></html>`

async function marcarConOverlay(pagina: string, topeOverlayMs: number) {
  const { context, page, guard } = await abrir(pagina, URL_FI)
  try {
    page.setDefaultTimeout(2_000)
    const fin = await bucleExploracion(page, contexto(page, guard, FI, 'hogar', 'fidelidade', (inv, n) =>
      n === 1 ? respuesta([{ accion: 'marcar', ref: refDe(inv, 'reg1') }]) : respuesta([{ accion: 'parar', motivo: 'ambiguo' }]), { topeOverlayMs }))
    return { fin, marcado: await page.locator('#reg1').isChecked(), violacion: guard.violacion() }
  } finally {
    await context.close()
  }
}

test('0.3.23 · Fidelidade: overlay de carga que se va a los 2,5 s (más que el timeout de 2 s del clic) → espera y marca el radio', async () => {
  const r = await marcarConOverlay(PAGINA_OVERLAY(2_500), 10_000)
  assert.equal(r.marcado, true, JSON.stringify(r.fin))
  assert.equal(r.fin.error, null, JSON.stringify(r.fin))
  assert.equal(r.violacion, null)
})

test('0.3.23 · Fidelidade: overlay que no se va → error reintentable (infra) y el radio SIN marcar (nunca clic forzado)', async () => {
  const r = await marcarConOverlay(PAGINA_OVERLAY(null), 1_500)
  assert.equal(r.marcado, false)
  assert.equal(r.fin.motivo, 'error_portal')
  assert.equal(r.fin.error?.tipo, 'infra')
  assert.match(String(r.fin.error?.mensaje), /overlay de carga.*no se fuerza el clic \(reintentable\)/)
})

test('0.3.23 · Fidelidade: overlay oculto o pequeño que no tapa el control → no se espera', async () => {
  for (const estilo of ['display:none;position:fixed;inset:0', 'position:fixed;right:0;bottom:0;width:20px;height:20px', 'position:fixed;inset:0;pointer-events:none']) {
    const { context, page } = await abrir(PAGINA_OVERLAY(null, estilo), URL_FI)
    try {
      const c = await sondearOverlaysCarga(page.locator('#reg1'), page.mainFrame())
      assert.ok(c !== null && c.length === 1, estilo)
      assert.equal(decisionOverlay(c, 0, 90_000), 'seguir', `${estilo}: ${JSON.stringify(c)}`)
    } finally {
      await context.close()
    }
  }
  const { context, page } = await abrir(PAGINA_OVERLAY(null), URL_FI)
  try {
    const c = await sondearOverlaysCarga(page.locator('#reg1'), page.mainFrame())
    assert.equal(decisionOverlay(c, 0, 90_000), 'esperar', JSON.stringify(c))
    assert.equal(c![0].tapaObjetivo, true)
  } finally {
    await context.close()
  }
})

// ─── 3) Allianz ePAC: «Nueva Alta» deshabilitado ────────────────────────────────────────────────────────────────────────────────────
test('0.3.23 · Allianz: espera a «Nueva Alta» habilitado; si no, UNA recarga y otra espera; si sigue, error reintentable (infra)', async () => {
  let t = 0
  const dormir = async (ms: number) => { t += ms }
  const ahora = () => t
  let recargas = 0
  // Habilitado al momento: ni espera ni recarga.
  assert.equal(await esperarHabilitadoConRecarga({ habilitado: async () => true, recargar: async () => { recargas++; return true }, dormir, ahora }), 'habilitado')
  assert.equal(recargas, 0)
  // Se habilita a los 60 s: sin recarga.
  t = 0
  assert.equal(await esperarHabilitadoConRecarga({ habilitado: async () => t >= 60_000, recargar: async () => { recargas++; return true }, dormir, ahora }), 'habilitado')
  assert.equal(recargas, 0)
  // Solo tras la recarga.
  t = 0
  let recargado = false
  assert.equal(await esperarHabilitadoConRecarga({ habilitado: async () => recargado, recargar: async () => { recargas++; recargado = true; return true }, dormir, ahora }), 'habilitado_tras_recarga')
  assert.equal(recargas, 1)
  assert.ok(t >= 90_000)
  // Nunca: UNA recarga y error reintentable con motivo.
  t = 0
  recargas = 0
  await assert.rejects(esperarHabilitadoConRecarga({ habilitado: async () => false, recargar: async () => { recargas++; return true }, dormir, ahora }), (e: unknown) => {
    assert.ok(e instanceof ErrorTarificador)
    assert.equal(e.tipo, 'infra')
    assert.match(e.message, /«Nueva Alta» \(#link_new_policy\) sigue deshabilitado tras 90 s, una recarga del home y otros 90 s/)
    return true
  })
  assert.equal(recargas, 1)
  assert.ok(t >= 180_000)
  // Fuera del home (no se recarga) o la comprobación que lanza: error reintentable, sin bucle.
  t = 0
  await assert.rejects(esperarHabilitadoConRecarga({ habilitado: async () => { throw new Error('x') }, recargar: async () => false, dormir, ahora }), /no se está en el home de ePAC/)
})

const URL_HOME = 'https://www.e-pacallianz.com/ngx-azs-epac/private/home'
const HOME_AZ = (habilitarEn: number | null) => `<!doctype html><html><head><meta charset="utf-8"><title>home</title></head><body>
  <button id="link_new_policy" disabled onclick="document.getElementById('m').hidden=false">Nueva Alta</button>
  <div id="m" role="dialog" hidden><h2>Nueva Alta</h2><a href="#" onclick="document.getElementById('p').hidden=false;return false">Particulares</a>
    <div id="p" hidden><a href="#" onclick="window.pulsado='comunidades';return false">Comunidades</a></div></div>
  ${habilitarEn === null ? '' : `<script>setTimeout(function(){ document.getElementById('link_new_policy').disabled = false }, ${habilitarEn})</script>`}
  </body></html>`

test('0.3.23 · Allianz real: «Nueva Alta» se habilita a los 3 s (más que el timeout de 2 s del clic) → abrirNuevaAlta entra sin recargar', async () => {
  const { context, page, guard, gets } = await abrir(HOME_AZ(3_000), URL_HOME)
  try {
    page.setDefaultTimeout(2_000)
    await abrirNuevaAlta(page, { pulsar: (b: Parameters<typeof pulsar>[0]) => pulsar(b, guard), pausa: async () => undefined } as never, { pestana: 'Particulares', producto: 'Comunidades' })
    assert.equal(await page.evaluate(() => (window as unknown as { pulsado?: string }).pulsado ?? null), 'comunidades')
    assert.equal(gets(), 1, 'sin recarga')
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})
