// Explorador 0.3.22 (29/10/2026) · worker, DOM VIVO. Páginas SINTÉTICAS (sin PII) servidas por `page.route` en los orígenes reales.
// 1) Allianz VMP «Figuras Intervinientes» (6b3176de…): [elegir tipoDoc {texto «DNI/NIF/NIE/CIF»} (value="", ya puesta), elegir otro
//    tipoDoc «Pasaporte» (cadena)] → el primero no se ejecuta, el segundo deja value «P»; antes el lote entero caía.
// 2) Mapfre NSE (dbf8ef0e…): `formDG:panelConfirmCTOpenedState` en el POST a datosGenerales.jsf (ruta tolerada) no se aborta; con
//    valor de acción o con botones de acción en el cuerpo, sí, y el error nombra TODOS los parámetros (nunca valores).
// 3) Fidelidade (530656a4…): «Datos Cliente» (Simualtion.aspx) envía su formulario a ClientData.aspx: la regla sin texto es una LISTA CERRADA
//    exacta de pantallas de la simulación; el destino del formulario tiene que ser una de ellas y sin query (si no, se para ANTES del clic).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { EmisionBloqueadaError, rutasAppTolerablesDe, type InventarioDom } from '@central/module-tarificacion'
import { capturarInventarioExploracion } from '../src/inventario-dom.ts'
import { clavesQueryDiagnostico, instalarGuardEmision, pulsar, pulsarExploracionAutorizada, pulsarGuardadoDialogoAutorizado, pulsarGuardadoPresupuesto, tolerarRutasApp, type GuardEmision } from '../src/guard.ts'
import { bucleExploracion, EXPLORADOR_VERSION, type ContextoBucle } from '../src/explorador.ts'
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
async function abrir(html: string, url: string): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  peticiones = []
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(5_000)
  page.on('request', (r) => { peticiones.push({ metodo: r.method(), url: r.url(), cuerpo: r.postData() ?? '', fallo: null }) })
  page.on('requestfailed', (r) => { const p = peticiones.find((x) => x.url === r.url() && x.metodo === r.method() && x.fallo === null); if (p) p.fallo = r.failure()?.errorText ?? '?' })
  await page.route('https://**/*', async (route) => {
    if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
    else await route.fallback()
  })
  await page.goto(url)
  return { context, page, guard }
}
const posts = () => peticiones.filter((p) => p.metodo === 'POST')
const elementos = (inv: InventarioDom) => inv.marcos.flatMap((m) => m.elementos)
const refDe = (inv: InventarioDom, id: string) => elementos(inv).find((e) => e.id === id && e.ref)!.ref!
const respuesta = (acciones: unknown[]) => ({ version: 1, pantalla: { nombre: 'Pantalla', tipo: 'formulario' }, acciones, mapeo: [], motivo: null })

function contexto(page: Page, guard: GuardEmision, entrada: string, ramo: string, compania: string, guion: (inv: InventarioDom, n: number) => unknown): ContextoBucle {
  let n = 0
  return {
    trabajoId: '00000000-0000-4000-8000-000000000322', compania, ramo, entrada,
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
  }
}

test('versión del explorador 0.3.22', () => assert.equal(EXPLORADOR_VERSION, '0.3.22'))

// ─── 1) Allianz VMP: opción de elegir en forma inequívoca ───────────────────────────────────────────────────────────────────────────
const MP = 'allianz:autos:movilidad_personal'
const URL_SEA = 'https://www.e-pacallianz.com/drvp00/SEAServlet'
const TIPOS = '<option value="">DNI/NIF/NIE/CIF</option><option value="P">Pasaporte</option><option value="O">Otros</option>'
const PAGINA_AZ = `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body><form id="f" method="post" action="/drvp00/SEAServlet" onsubmit="return false">
  <h3>Figuras Intervinientes</h3>
  <label for="IntervinientesBean$nifTomador_tipoDoc">Tipo de documento</label><select id="IntervinientesBean$nifTomador_tipoDoc" name="IntervinientesBean$nifTomador_tipoDoc" onchange="window.__cambios=(window.__cambios||0)+1">${TIPOS}</select>
  <label for="IntervinientesBean$nifConductor_tipoDoc">Tipo de documento</label><select id="IntervinientesBean$nifConductor_tipoDoc" name="IntervinientesBean$nifConductor_tipoDoc">${TIPOS}</select>
  </form></body></html>`

test('0.3.22 · Allianz VMP: [elegir {texto} de la opción vacía ya puesta, elegir «Pasaporte» como cadena] → se ejecuta solo el segundo', async () => {
  const { context, page, guard } = await abrir(PAGINA_AZ, URL_SEA)
  try {
    let pasos = 0
    const fin = await bucleExploracion(page, contexto(page, guard, MP, 'patinete', 'allianz', (inv, n) => {
      pasos = n
      if (n === 1) {
        return respuesta([
          { accion: 'elegir', ref: refDe(inv, 'IntervinientesBean$nifTomador_tipoDoc'), opcion: { texto: 'DNI/NIF/NIE/CIF' } },
          { accion: 'elegir', ref: refDe(inv, 'IntervinientesBean$nifConductor_tipoDoc'), opcion: 'Pasaporte' },
        ])
      }
      return respuesta([{ accion: 'parar', motivo: 'ambiguo' }])
    }))
    assert.equal(pasos, 2, `el lote del paso 1 se validó y ejecutó: ${JSON.stringify(fin)}`)
    assert.equal(await page.locator('[id="IntervinientesBean$nifTomador_tipoDoc"]').inputValue(), '')
    assert.equal(await page.evaluate(() => (window as unknown as { __cambios?: number }).__cambios ?? 0), 0, 'la opción ya puesta NO se vuelve a elegir')
    assert.equal(await page.locator('[id="IntervinientesBean$nifConductor_tipoDoc"]').inputValue(), 'P')
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

test('0.3.22 · Allianz VMP: una cadena que no es exactamente una opción → el lote no toca el portal', async () => {
  const { context, page, guard } = await abrir(PAGINA_AZ, URL_SEA)
  try {
    const fin = await bucleExploracion(page, contexto(page, guard, MP, 'patinete', 'allianz', (inv, n) =>
      n === 1 ? respuesta([{ accion: 'elegir', ref: refDe(inv, 'IntervinientesBean$nifConductor_tipoDoc'), opcion: 'pasaporte' }]) : respuesta([{ accion: 'parar', motivo: 'ambiguo' }])))
    assert.equal(await page.locator('[id="IntervinientesBean$nifConductor_tipoDoc"]').inputValue(), '', JSON.stringify(fin))
  } finally {
    await context.close()
  }
})

// ─── 2) Mapfre NSE: estado de modal en el cuerpo ────────────────────────────────────────────────────────────────────────────────────
const MF = 'mapfre:automoviles:patinetes'
const ORIGEN_NSE = 'https://wmediadores.mapfre.com'
const URL_DG = `${ORIGEN_NSE}/EVT21_NSE_FWEB/app/emision/informacionGeneral/datosGenerales.jsf`
async function postNse(cuerpo: string, tolerar = true) {
  const { context, page, guard } = await abrir('<!doctype html><html><body><form id="formDG"><h2>Datos generales</h2></form></body></html>', `${ORIGEN_NSE}/EVT21_NSE_FWEB/app/emision/busquedaProductos/busquedaProductos.jsf`)
  try {
    if (tolerar) tolerarRutasApp(guard, rutasAppTolerablesDe(MF))
    await page.evaluate(([u, c]) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: c }).catch(() => undefined), [URL_DG, cuerpo])
    await page.waitForTimeout(200)
    return { violacion: guard.violacion(), fallo: posts()[0]?.fallo ?? null }
  } finally {
    await context.close()
  }
}
const REAL_DG = 'formDG=formDG&formDG%3AfechaFirmaInputDate=29%2F10%2F2026&formDG%3AlocalidadFirma=SEVILLA&formDG%3ApanelConfirmCTOpenedState=&formDG%3AbtnSiguiente=formDG%3AbtnSiguiente&javax.faces.ViewState=j_id3'

test('0.3.22 · Mapfre NSE: POST a datosGenerales con panelConfirmCTOpenedState (vacío/true/false) → no se aborta (antes: «confirm»)', async () => {
  for (const v of ['', 'true', 'false']) {
    const cuerpo = REAL_DG.replace('OpenedState=', `OpenedState=${v}`) + '&formDG%3AmodalLocalidadOpenedState=false'
    const r = await postNse(cuerpo)
    assert.equal(r.violacion, null, `${cuerpo}: ${String(r.violacion)}`)
    assert.ok(!String(r.fallo).startsWith('net::ERR_BLOCKED_BY_CLIENT'), `${cuerpo}: ${r.fallo}`)
  }
})

test('0.3.22 · Mapfre NSE: OpenedState con valor de acción, botones de acción o ruta NO tolerada → abortado; el error nombra TODOS (sin valores)', async () => {
  for (const [cuerpo, tolerar] of [['formDG%3ApanelConfirmCTOpenedState=confirmar', true], [REAL_DG.replace('OpenedState=', 'OpenedState=TRUE'), true], [REAL_DG, false]] as const) {
    const r = await postNse(cuerpo, tolerar)
    assert.ok(r.violacion instanceof EmisionBloqueadaError, `${cuerpo} (tolerada=${tolerar})`)
    assert.match(String(r.fallo), /^net::ERR_BLOCKED_BY_CLIENT/, cuerpo)
  }
  const r = await postNse(`${REAL_DG}&formDG%3AbtnConfirmarX=SECRETO_A&formDG%3AbtnFirmar=SECRETO_B`)
  assert.ok(r.violacion instanceof EmisionBloqueadaError)
  const msg = r.violacion!.message
  assert.match(msg, /parámetros \(2\): «formDG:btnConfirmarX» casa con «confirm», «formDG:btnFirmar» casa con «firm»/)
  assert.doesNotMatch(msg, /SECRETO|SEVILLA|panelConfirmCTOpenedState/)
})

// ─── 3) Fidelidade: lista cerrada de pantallas de la simulación ─────────────────────────────────────────────────────────────────────
const FI = 'fidelidade:particulares:vivienda'
const ORIGEN_FI = 'https://mediadores.fidelidade.es'
const NAME_FI = 'OPI_Theme_wt25$block$wtMainContent$FID_B2B_SIM_Pat_wt22$block$wtForm$FID_B2B_SIM_Pat_wtNextButton$block$wtNextButton2'
const ID_FI = NAME_FI.replace(/\$/g, '_')
const ONCLICK_FI = `OsAjax(arguments[0] || window.event,'${ID_FI}','${NAME_FI}','','__OSVSTATE,',''); return false;`
/** `accion`: action del formulario; `destino`: adónde manda OsAjax el POST; `cuerpo`: su cuerpo. */
const PAGINA_FI = (o: { accion: string; destino?: string; cuerpo?: string }) => `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body>
  <form id="f" method="post" action="${o.accion}">
    <h2>Datos Cliente</h2>
    <label for="nom">Nombre</label><input type="text" id="nom" name="OPI_Theme_wt25$block$wtMainContent$Nombre">
    <input type="submit" id="${ID_FI}" name="${NAME_FI}" class="Button First Is_Default" onclick="${ONCLICK_FI}">
  </form>
  <script>
    function OsAjax() {
      fetch(${JSON.stringify(o.destino ?? o.accion)}, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: ${JSON.stringify(o.cuerpo ?? `__EVENTTARGET=${encodeURIComponent(NAME_FI)}&__EVENTARGUMENT=&__OSVSTATE=abc`)} })
        .catch(function () {}).then(function () { var x = document.getElementById(${JSON.stringify(ID_FI)}); if (x) x.remove(); });
    }
  </script></body></html>`

async function avanceFi(pagina: string, ruta: string): Promise<{ error: unknown; violacion: Error | null; posts: Pet[] }> {
  const { context, page, guard } = await abrir(pagina, `${ORIGEN_FI}${ruta}`)
  try {
    const cap = (await capturarInventarioExploracion(page))!
    const marco = cap.inventario.marcos.find((m) => m.elementos.some((e) => e.tag === 'input' && e.type === 'submit'))!
    const el = marco.elementos.find((e) => e.tag === 'input' && e.type === 'submit')!
    const error = await pulsarExploracionAutorizada(page, guard, page.locator(`[id="${ID_FI}"]`), { entrada: FI, el, marco }).then(() => null, (x: unknown) => x)
    await cap.liberar()
    await page.waitForTimeout(300)
    return { error, violacion: guard.violacion(), posts: posts() }
  } finally {
    await context.close()
  }
}
const SIM = '/OPI_ES_Vivienda/Simualtion.aspx'
const CD = '/OPI_ES_Vivienda/ClientData.aspx'

test('0.3.22 · Fidelidade real (530656a4): Simualtion.aspx con formulario a ClientData.aspx → UN POST a ClientData que el guard deja pasar', async () => {
  // [pantalla, action del formulario, destino del POST de OsAjax]: el último, la SIGUIENTE pantalla de la lista (repinta con su propio POST).
  for (const [ruta, accion, destino] of [[SIM, CD, CD], [CD, CD, CD], [SIM, SIM, SIM], [SIM, SIM, CD]] as const) {
    const r = await avanceFi(PAGINA_FI({ accion, destino }), ruta)
    assert.equal(r.error, null, `${ruta}→${accion}→${destino}: ${String(r.error)}`)
    assert.equal(r.violacion, null, `${ruta}→${accion}→${destino}: ${String(r.violacion)}`)
    assert.equal(r.posts.length, 1)
    assert.equal(r.posts[0].url, `${ORIGEN_FI}${destino}`)
    assert.ok(!String(r.posts[0].fallo).startsWith('net::ERR_BLOCKED_BY_CLIENT'), `${ruta}→${accion}→${destino}: ${r.posts[0].fallo}`)
  }
})

test('0.3.22 · Fidelidade: formulario a una pantalla fuera de la lista, o con query → se para ANTES del clic (sin POST, sin valores)', async () => {
  for (const [accion, re] of [
    ['/OPI_ES_Vivienda/Emision.aspx', /fuera de la lista de la simulación/],
    ['/OPI_ES_Vivienda/Contratacion.aspx', /fuera de la lista de la simulación/],
    ['/OPI_ES_Vivienda/clientdata.aspx', /fuera de la lista de la simulación/],
    [`${CD}?ProjectId=VALOR_SECRETO&x=1`, /con query \(claves: ProjectId,x\)/],
  ] as const) {
    const r = await avanceFi(PAGINA_FI({ accion }), SIM)
    assert.ok(r.error instanceof EmisionBloqueadaError && re.test(r.error.message), `${accion}: ${String(r.error)}`)
    assert.doesNotMatch((r.error as Error).message, /VALOR_SECRETO/)
    assert.equal(r.posts.length, 0, accion)
  }
})

test('0.3.22 · Fidelidade: el control en una pantalla fuera de la lista → ruta_distinta (sin POST)', async () => {
  const r = await avanceFi(PAGINA_FI({ accion: '/OPI_ES_Vivienda/Emision.aspx' }), '/OPI_ES_Vivienda/Emision.aspx')
  assert.ok(r.error instanceof EmisionBloqueadaError && /no autorizado/.test(r.error.message), String(r.error))
  assert.equal(r.posts.length, 0)
})

test('0.3.22 · Fidelidade: POST de OsAjax a otra ruta, con query, o con acción final en el cuerpo (también a ClientData) → abortado', async () => {
  for (const o of [
    { accion: CD, destino: '/OPI_ES_Vivienda/Emision.aspx' },
    { accion: CD, destino: `${CD}?accion=1` },
    { accion: SIM, destino: CD, cuerpo: `__EVENTTARGET=${encodeURIComponent('OPI_Theme_wt25$block$wtMainContent$wtBtnContratar')}&__EVENTARGUMENT=&__OSVSTATE=abc` },
    { accion: CD, cuerpo: '__OSVSTATE=abc&IBAN=ES0000000000000000000000' },
    { accion: CD, cuerpo: '__OSVSTATE=abc&paso=Confirmar' },
  ]) {
    const r = await avanceFi(PAGINA_FI(o), SIM)
    assert.ok(r.violacion instanceof EmisionBloqueadaError, JSON.stringify(o))
    assert.equal(r.posts.length, 1, JSON.stringify(o))
    assert.match(String(r.posts[0].fallo), /^net::ERR_BLOCKED_BY_CLIENT/, JSON.stringify(o))
  }
  // El diagnóstico de la query: solo NOMBRES de clave.
  const r = await avanceFi(PAGINA_FI({ accion: CD, destino: `${CD}?Token=VALOR_SECRETO` }), SIM)
  assert.match(r.violacion!.message, /ClientData\.aspx \[ruta en la lista, pero con query: claves Token\]/)
  assert.doesNotMatch(r.violacion!.message, /VALOR_SECRETO/)
})

test('0.3.22 · clavesQueryDiagnostico: solo nombres con forma de identificador; un NIF/NIE o id largo como clave no sale', () => {
  assert.equal(clavesQueryDiagnostico(new URL('https://x.test/a?ProjectId=9&x=1&x=2')), 'ProjectId,x')
  const t = clavesQueryDiagnostico(new URL('https://x.test/a?12345678Z=1&X1234567L&a%20b=1&id_12345=1'))
  assert.equal(t, '?')
  assert.doesNotMatch(t, /\d{4}/)
  assert.equal(clavesQueryDiagnostico(new URL('https://x.test/a?a=1&b=1&c=1&d=1&e=1&f=1&g=1')).split(',').length, 6)
})
