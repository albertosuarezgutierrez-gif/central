// Explorador 0.3.19 (29/10/2026) · worker, DOM VIVO. Páginas SINTÉTICAS (sin PII) servidas por `page.route` en los orígenes reales (el
// navegador de pruebas no sale a la red). Cada brazo que debe fallar, en rojo.
// 1) Fidelidade Vivienda: el input submit sin rótulo con onclick `OsAjax(…); return false;` (forma cerrada; name VIVO entero === B). El POST
//    de OsAjax va al propio formulario: los GET los sirve la página; los POST caen (`fallback`) al guard del contexto, que los inspecciona
//    (lista blanca de destino + cuerpo ESTRICTO) y los deja seguir (y fallan en el proxy de pruebas) o los aborta (`ERR_BLOCKED_BY_CLIENT`).
// 2) Mapfre NSE: el «Siguiente >>» de `formDG` con `mostrarModalPanelConfirmarLimpiezaPolizaPorDias(…)` en el oncomplete, por `pulsar()`.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { EmisionBloqueadaError, neutralizacionesOnclickDe, rutasAppTolerablesDe, type ElementoInventario, type MarcoInventario } from '@central/module-tarificacion'
import { AJAX_AYUDA_APLICACIONES_ALLIANZ_DRVP00, AJAX_LECTURA_ALLIANZ, ajaxValidacionAvancePermitida, instalarGuardEmision, motivoAjaxRechazado, neutralizarOnclicksEntrada, pulsar, pulsarExploracionAutorizada, tolerarRutasApp, type GuardEmision } from '../src/guard.ts'
import { capturarInventarioExploracion } from '../src/inventario-dom.ts'
import { EXPLORADOR_VERSION } from '../src/explorador.ts'

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
    // Los GET (la página) los sirve la prueba; lo demás pasa al guard del CONTEXTO (que es lo que se prueba).
    if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
    else await route.fallback()
  })
  await page.goto(url)
  return { context, page, guard }
}
const posts = () => peticiones.filter((p) => p.metodo === 'POST')

test('versión del explorador 0.3.19', () => assert.equal(EXPLORADOR_VERSION, '0.3.19'))

// ─── 1) Fidelidade ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const FI = 'fidelidade:particulares:vivienda'
const ORIGEN_FI = 'https://mediadores.fidelidade.es'
const RUTA_FI = '/OPI_ES_Vivienda/Simualtion.aspx'
const NAME = 'OPI_Theme_wt25$block$wtMainContent$FID_B2B_SIM_Pat_wtNextButton$block$wtNextButton2'
const ID = NAME.replace(/\$/g, '_')
const osajax = (a: string, b: string) => `OsAjax(arguments[0] || window.event,'${a}','${b}','','__OSVSTATE,',''); return false;`
const ONCLICK = osajax(ID, NAME)

/** `cuerpo`: cuerpo del POST de OsAjax (por defecto, uno inocuo); `destino`: adónde lo manda. */
const PAGINA_FI = (opts: { cuerpo?: string; destino?: string } = {}) => `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body>
  <form id="f" method="post" action="${RUTA_FI}">
    <h2>Simulación</h2><h3>Datos de la vivienda</h3>
    <label for="cp">Código postal</label><input type="text" id="cp" name="OPI_Theme_wt25$block$wtMainContent$CP">
    <input type="submit" id="${ID}" name="${NAME}" class="Button First Is_Default" onclick="${ONCLICK}">
  </form>
  <script>
    function OsAjax(e, a, b) {
      var cuerpo = ${JSON.stringify(opts.cuerpo ?? '__OSVSTATE=abc&__AJAX=1')};
      fetch(${JSON.stringify(opts.destino ?? RUTA_FI)}, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: cuerpo })
        .catch(function () {}).then(function () { var x = document.getElementById(${JSON.stringify(ID)}); if (x) x.remove(); });
    }
  </script></body></html>`

async function capturaFi(page: Page): Promise<{ marco: MarcoInventario; el: ElementoInventario; liberar: () => Promise<void> }> {
  const cap = (await capturarInventarioExploracion(page))!
  const marco = cap.inventario.marcos.find((m) => m.elementos.some((e) => e.tag === 'input' && e.type === 'submit'))!
  return { marco, el: marco.elementos.find((e) => e.tag === 'input' && e.type === 'submit')!, liberar: cap.liberar }
}
const BOTON_FI = (page: Page) => page.locator(`[id="${ID}"]`)

test('0.3.19 · Fidelidade: el inventario del worker guarda el onclick OsAjax entero (y el name recortado)', async () => {
  const { context, page } = await abrir(PAGINA_FI(), `${ORIGEN_FI}${RUTA_FI}`)
  try {
    const { el, liberar } = await capturaFi(page)
    assert.equal(el.onclick, ONCLICK)
    assert.ok(el.name?.endsWith('…'), String(el.name))
    await liberar()
  } finally {
    await context.close()
  }
})

test('0.3.19 · Fidelidade: input submit con onclick OsAjax de forma cerrada → UN clic, UN POST al propio formulario, que el guard deja pasar', async () => {
  const { context, page, guard } = await abrir(PAGINA_FI(), `${ORIGEN_FI}${RUTA_FI}`)
  try {
    const { marco, el, liberar } = await capturaFi(page)
    await pulsarExploracionAutorizada(page, guard, BOTON_FI(page), { entrada: FI, el, marco })
    await liberar()
    await page.waitForTimeout(300)
    assert.equal(posts().length, 1)
    assert.equal(posts()[0].url, `${ORIGEN_FI}${RUTA_FI}`)
    assert.ok(!String(posts()[0].fallo).startsWith('net::ERR_BLOCKED_BY_CLIENT'), `el guard no lo abortó: ${posts()[0].fallo}`)
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

test('0.3.19 · Fidelidade: vigilancia VIVA del onclick → otro onclick, name vivo ≠ B, otros manejadores o form* → no se pulsa', async () => {
  const prueba = async (nombre: string, antes: (p: Page) => Promise<unknown>, esperado: RegExp) => {
    const { context, page, guard } = await abrir(PAGINA_FI(), `${ORIGEN_FI}${RUTA_FI}`)
    try {
      const { marco, el, liberar } = await capturaFi(page)
      await antes(page)
      const e = await pulsarExploracionAutorizada(page, guard, BOTON_FI(page), { entrada: FI, el, marco }).then(() => null, (x: unknown) => x)
      await liberar()
      assert.ok(e instanceof EmisionBloqueadaError && esperado.test(e.message), `${nombre}: ${String(e)}`)
      assert.equal(posts().length, 0, nombre)
    } finally {
      await context.close()
    }
  }
  const set = (a: string, v: string) => (p: Page) => p.evaluate(([id, x, y]) => { document.getElementById(id)!.setAttribute(x, y) }, [ID, a, v])
  await prueba('llamada extra en el onclick', set('onclick', `${ONCLICK} emitir();`), /onclick_fuera_de_forma/)
  await prueba('submit en el onclick', set('onclick', 'document.forms[0].submit(); return false;'), /onclick_fuera_de_forma/)
  await prueba('B de otro widget', set('onclick', osajax('OPI_Theme_wt25_block_wtMainContent_FID_Otro', 'OPI_Theme_wt25$block$wtMainContent$FID_Otro')), /onclick_fuera_de_forma/)
  // El inventario recorta el name (83 car.) y el módulo compara por prefijo: el name VIVO ENTERO tiene que ser B.
  await prueba('name vivo con más que B', set('name', `${NAME}X`), /onclick_fuera_de_forma/)
  await prueba('B con más que el name vivo', set('onclick', osajax(`${ID}X`, `${NAME}X`)), /onclick_fuera_de_forma/)
  for (const a of ['onpointerdown', 'onpointerup', 'onmousedown', 'formaction', 'form', 'formmethod', 'formtarget', 'formenctype', 'ng-click']) await prueba(a, set(a, 'x'), /con_manejador/)
  await prueba('formnovalidate (vacío)', set('formnovalidate', ''), /con_manejador/)
})

test('0.3.19 · Fidelidade: el POST de OsAjax pasa la inspección ESTRICTA del cuerpo (acción final, IBAN/tarjeta → abortado, no llega)', async () => {
  for (const cuerpo of ['__OSVSTATE=abc&paso=Confirmar', '__OSVSTATE=abc&btnEmitir=1', '__OSVSTATE=abc&accion=contratar', '__OSVSTATE=abc&IBAN=ES0000000000000000000000', `__OSVSTATE=abc&${encodeURIComponent('OPI_Theme_wt25$block$wtMainContent$wtTarjeta')}=1`]) {
    const { context, page, guard } = await abrir(PAGINA_FI({ cuerpo }), `${ORIGEN_FI}${RUTA_FI}`)
    try {
      const { marco, el, liberar } = await capturaFi(page)
      await pulsarExploracionAutorizada(page, guard, BOTON_FI(page), { entrada: FI, el, marco }).catch(() => undefined)
      await liberar()
      await page.waitForTimeout(300)
      assert.ok(guard.violacion() instanceof EmisionBloqueadaError, cuerpo)
      assert.equal(posts().length, 1, cuerpo)
      assert.match(String(posts()[0].fallo), /^net::ERR_BLOCKED_BY_CLIENT/, `${cuerpo}: abortado por el guard`)
    } finally {
      await context.close()
    }
  }
})

test('0.3.19 · Fidelidade: un POST de OsAjax a otra ruta u otro origen se aborta (lista blanca = el formulario)', async () => {
  for (const destino of ['/OPI_ES_Vivienda/Emision.aspx', '/OPI_ES_Vivienda/Simualtion.aspx?accion=1', 'https://otro.fidelidade.es/OPI_ES_Vivienda/Simualtion.aspx']) {
    const { context, page, guard } = await abrir(PAGINA_FI({ destino }), `${ORIGEN_FI}${RUTA_FI}`)
    try {
      const { marco, el, liberar } = await capturaFi(page)
      await pulsarExploracionAutorizada(page, guard, BOTON_FI(page), { entrada: FI, el, marco }).catch(() => undefined)
      await liberar()
      await page.waitForTimeout(300)
      assert.ok(guard.violacion() instanceof EmisionBloqueadaError, destino)
      assert.match(String(posts()[0]?.fallo), /^net::ERR_BLOCKED_BY_CLIENT/, destino)
    } finally {
      await context.close()
    }
  }
})

// ─── 2) Mapfre NSE ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const MF = 'mapfre:automoviles:patinetes'
const ORIGEN_NSE = 'https://wmediadores.mapfre.com'
const RUTA_BP = '/EVT21_NSE_FWEB/app/emision/busquedaProductos/busquedaProductos.jsf'
const SUB = 'mostrarModalPanelConfirmarLimpiezaPolizaPorDias'
const a4j = (oncomplete = `${SUB}('false','formDG:btnSiguiente')`) =>
  `A4J.AJAX.Submit('formDG',event,{'similarityGroupingId':'formDG:btnSiguiente','parameters':{'irSiguiente':'true','formDG:btnSiguiente':'formDG:btnSiguiente','valorAgente':'1'},'oncomplete':function(request,event,data){${oncomplete}}});return false;`
const PAGINA_NSE = (onclick = a4j()) => `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body>
  <form id="formDG"><h2>Oferta / contratación</h2>
    <a href="#" id="formDG:btnSiguiente" name="formDG:btnSiguiente" class="boton red S" onclick="${onclick.replace(/"/g, '&quot;')}">Siguiente &gt;&gt;</a>
  </form>
  <script>var A4J = { AJAX: { Submit: function () {} } };</script></body></html>`
const SIG = (page: Page) => page.locator('[id="formDG:btnSiguiente"]')

async function abrirNse(html: string, url = `${ORIGEN_NSE}${RUTA_BP}`, conRegla = true) {
  const r = await abrir(html, url)
  // Como el runner: rutas tolerables y neutralizaciones de la ENTRADA.
  tolerarRutasApp(r.guard, rutasAppTolerablesDe(MF))
  if (conRegla) neutralizarOnclicksEntrada(r.guard, neutralizacionesOnclickDe(MF))
  return r
}

test('0.3.19 · Mapfre NSE: «Siguiente >>» con el modal de limpieza en el oncomplete pasa `pulsar()` con la regla de la entrada; sin ella, bloqueado', async () => {
  {
    const { context, page, guard } = await abrirNse(PAGINA_NSE())
    try {
      await pulsar(SIG(page), guard)
      assert.equal(guard.violacion(), null)
    } finally {
      await context.close()
    }
  }
  {
    const { context, page, guard } = await abrirNse(PAGINA_NSE(), undefined, false)
    try {
      const e = await pulsar(SIG(page), guard).then(() => null, (x: unknown) => x)
      assert.ok(e instanceof EmisionBloqueadaError, String(e))
    } finally {
      await context.close()
    }
  }
})

test('0.3.19 · Mapfre NSE: vigilancia VIVA de la neutralización → otro id/name/texto/tag, otra ruta u origen, o emisión en el resto → bloqueado', async () => {
  const prueba = async (nombre: string, html: string, antes: (p: Page) => Promise<unknown> = async () => undefined, url?: string) => {
    const { context, page, guard } = await abrirNse(html, url)
    try {
      await antes(page)
      const e = await pulsar(SIG(page), guard).then(() => null, (x: unknown) => x)
      assert.ok(e instanceof EmisionBloqueadaError, `${nombre}: ${String(e)}`)
    } finally {
      await context.close()
    }
  }
  const set = (a: string, v: string) => (p: Page) => p.evaluate(([x, y]) => { document.querySelector('a.boton')!.setAttribute(x, y) }, [a, v])
  await prueba('name vivo distinto', PAGINA_NSE(), set('name', 'formDG:btnConfirmar'))
  await prueba('texto vivo distinto', PAGINA_NSE(), (p) => p.evaluate(() => { document.querySelector('a.boton')!.textContent = 'Siguiente >> y confirmar' }))
  await prueba('otra ruta', PAGINA_NSE(), undefined, `${ORIGEN_NSE}/EVT21_NSE_FWEB/app/emision/cargaOperacion.jsf`)
  await prueba('otro origen', PAGINA_NSE(), undefined, `https://otro.mapfre.com${RUTA_BP}`)
  await prueba('emitir además', PAGINA_NSE(a4j(`${SUB}('false','formDG:btnSiguiente');emitirPoliza()`)))
  await prueba('confirmar además', PAGINA_NSE(a4j(`${SUB}('false','formDG:btnSiguiente');confirmarPoliza()`)))
  await prueba('la subcadena dos veces', PAGINA_NSE(a4j(`${SUB}('false');${SUB}('true')`)))
  await prueba('identificador más largo', PAGINA_NSE(a4j(`${SUB}YConfirmar('false')`)))
  // El id cambia y el localizador ya no lo encuentra por id: se localiza por clase.
  {
    const { context, page, guard } = await abrirNse(PAGINA_NSE())
    try {
      await set('id', 'formDG:btnOtro')(page)
      const e = await pulsar(page.locator('a.boton'), guard).then(() => null, (x: unknown) => x)
      assert.ok(e instanceof EmisionBloqueadaError, `id vivo distinto: ${String(e)}`)
    } finally {
      await context.close()
    }
  }
})

test('0.3.19 · neutralizarOnclicksEntrada rechaza reglas mal formadas', async () => {
  const { context, guard } = await abrir('<p>x</p>', `${ORIGEN_NSE}/x`)
  try {
    const base = neutralizacionesOnclickDe(MF)[0]
    for (const malo of [{ ...base, origen: 'http://wmediadores.mapfre.com' }, { ...base, prefijoRuta: '/EVT21_NSE_FWEB/app' }, { ...base, prefijoRuta: '/a/../b/' }, { ...base, subcadena: 'x(' }, { ...base, subcadena: 'ab' }]) {
      assert.throws(() => neutralizarOnclicksEntrada(guard, [malo]), EmisionBloqueadaError, JSON.stringify(malo))
    }
  } finally {
    await context.close()
  }
})

// ─── 3) Allianz drvp00: la ayuda contextual (AyudaAplicacionesAjax) de la pantalla de destino, dentro de la ventana del avance por id ────
// Regresión real 29/10/2026 15:45 (bafa9248…): «Figuras Intervinientes» → «Aceptar» (#btnAceptar, eventoSiguiente()) → la pantalla de destino
// pide su ayuda en el `ready` a /drvp00/AJAXServlet antes de que el robot vea desaparecer el botón → capa (b) → error_definitivo.
const MP = 'allianz:autos:movilidad_personal'
const ORIGEN_EPAC = 'https://www.e-pacallianz.com'
const AYUDA_DRVP00 = `${ORIGEN_EPAC}/drvp00/AJAXServlet?resource=com.ats.sea.visuals.util.AyudaAplicacionesAjax`
const CUERPO_AYUDA = 'pageId=datosVehiculo$datosVehiculo&codCia=9'

test('0.3.19 · ayuda drvp00 (pura): exacta y de solo lectura sí; otra ruta, otro resource, claves de más o valores de acción final/bancarios, no', () => {
  const l = [AJAX_AYUDA_APLICACIONES_ALLIANZ_DRVP00]
  assert.equal(ajaxValidacionAvancePermitida('POST', AYUDA_DRVP00, CUERPO_AYUDA, l), true)
  assert.equal(ajaxValidacionAvancePermitida('POST', `${AYUDA_DRVP00}&com.ats.webbeans.struts.thread=1&com.ats.webbeans.struts.synch=2`, CUERPO_AYUDA, l), true, 'tokens opcionales')
  for (const [nombre, url, cuerpo] of [
    ['ruta drpc18', AYUDA_DRVP00.replace('/drvp00/', '/drpc18/'), CUERPO_AYUDA],
    ['otro origen', AYUDA_DRVP00.replace('www.e-pacallianz.com', 'e-pacallianz.com'), CUERPO_AYUDA],
    ['otro resource', AYUDA_DRVP00.replace('AyudaAplicacionesAjax', 'EmitirPolizaAjax'), CUERPO_AYUDA],
    ['resource de lista negra', `${ORIGEN_EPAC}/drvp00/AJAXServlet?resource=pt.allianz.clientes.negocio.BlackListOperationsAjax`, CUERPO_AYUDA],
    ['clave de más', AYUDA_DRVP00, `${CUERPO_AYUDA}&accion=x`],
    ['pageId de emisión', AYUDA_DRVP00, 'pageId=emision$emision&codCia=9'],
    ['pageId de confirmar', AYUDA_DRVP00, 'pageId=datos$confirmarPoliza&codCia=9'],
    ['pageId de pago', AYUDA_DRVP00, 'pageId=formaPago$formaPago&codCia=9'],
    ['pageId bancario', AYUDA_DRVP00, 'pageId=datosIban$datosIban&codCia=9'],
    ['token de query con acción', `${AYUDA_DRVP00}&com.ats.webbeans.struts.thread=emitir`, CUERPO_AYUDA],
    ['GET', AYUDA_DRVP00, null],
  ] as const) {
    const metodo = nombre === 'GET' ? 'GET' : 'POST'
    assert.equal(ajaxValidacionAvancePermitida(metodo, url, cuerpo, l), false, nombre)
  }
  // La regla de drpc18 (sin `estricto`) no cambia: un pageId con «emision» sigue pasando AHÍ (solo lectura; fuera del alcance de 0.3.19).
  assert.equal(ajaxValidacionAvancePermitida('POST', `${ORIGEN_EPAC}/drpc18/AJAXServlet?resource=com.ats.sea.visuals.util.AyudaAplicacionesAjax`, 'pageId=emision$emision&codCia=9', AJAX_LECTURA_ALLIANZ), true)
  assert.match(String(motivoAjaxRechazado('POST', AYUDA_DRVP00, 'pageId=emision$emision&codCia=9', l)), /acción final/)
})

/** «Figuras Intervinientes» en /drvp00/SEAServlet: el avance envía el formulario y, ANTES de que se vaya el botón, la ayuda de destino. */
const FIGURAS_EPAC = (ayuda: { url: string; cuerpo: string } | null) => `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body>
  <form id="f" method="post" action="/drvp00/SEAServlet">
    <table><tr><td class="titulo">Datos Básicos – Figuras Intervinientes</td></tr></table>
    <button type="button" id="btnAceptar" onclick="eventoSiguiente()">Aceptar</button>
  </form>
  <script>
    function eventoSiguiente() {
      var b = document.getElementById('btnAceptar');
      ${ayuda ? `fetch(${JSON.stringify(ayuda.url)}, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: ${JSON.stringify(ayuda.cuerpo)} }).catch(function () {}).then(function () { b.remove() });` : 'b.remove();'}
    }
  </script></body></html>`

async function avanceFiguras(ayuda: { url: string; cuerpo: string } | null) {
  const { context, page, guard } = await abrir(FIGURAS_EPAC(ayuda), `${ORIGEN_EPAC}/drvp00/SEAServlet`)
  try {
    const cap = (await capturarInventarioExploracion(page))!
    const marco = cap.inventario.marcos.find((m) => m.elementos.some((e) => e.id === 'btnAceptar'))!
    const el = marco.elementos.find((e) => e.id === 'btnAceptar')!
    const e = await pulsarExploracionAutorizada(page, guard, page.locator('#btnAceptar'), { entrada: MP, el, marco }).then(() => null, (x: unknown) => x)
    await cap.liberar()
    await page.waitForTimeout(300)
    return { e, violacion: guard.violacion(), posts: posts() }
  } finally {
    await context.close()
  }
}

test('0.3.19 · Allianz drvp00: la ayuda de la pantalla de destino dentro de la ventana del avance por id PASA (antes: error_definitivo)', async () => {
  const r = await avanceFiguras({ url: AYUDA_DRVP00, cuerpo: CUERPO_AYUDA })
  assert.equal(r.e, null, String(r.e))
  assert.equal(r.violacion, null, String(r.violacion))
  assert.equal(r.posts.length, 1)
  assert.ok(!String(r.posts[0].fallo).startsWith('net::ERR_BLOCKED_BY_CLIENT'), String(r.posts[0].fallo))
})

test('0.3.19 · Allianz drvp00: brazos de la ayuda tolerada → abortado por el guard (otra ruta, otro resource, pageId de acción final, clave de más)', async () => {
  for (const [nombre, ayuda] of [
    ['ruta drpc18', { url: AYUDA_DRVP00.replace('/drvp00/', '/drpc18/'), cuerpo: CUERPO_AYUDA }],
    ['otro resource', { url: AYUDA_DRVP00.replace('AyudaAplicacionesAjax', 'GrabarProyectoAjax'), cuerpo: CUERPO_AYUDA }],
    ['pageId de emisión', { url: AYUDA_DRVP00, cuerpo: 'pageId=emision$emision&codCia=9' }],
    ['clave de más', { url: AYUDA_DRVP00, cuerpo: `${CUERPO_AYUDA}&iban=ES00` }],
  ] as const) {
    const r = await avanceFiguras(ayuda)
    assert.ok(r.violacion instanceof EmisionBloqueadaError, nombre)
    assert.match(String(r.posts[0]?.fallo), /^net::ERR_BLOCKED_BY_CLIENT/, nombre)
  }
})

test('0.3.19 · la ayuda drvp00 NO se abre en un avance que no es por id de drvp00 (Fidelidade sin texto) → abortada', async () => {
  const html = PAGINA_FI({ destino: AYUDA_DRVP00, cuerpo: CUERPO_AYUDA })
  const { context, page, guard } = await abrir(html, `${ORIGEN_FI}${RUTA_FI}`)
  try {
    const { marco, el, liberar } = await capturaFi(page)
    await pulsarExploracionAutorizada(page, guard, BOTON_FI(page), { entrada: FI, el, marco }).catch(() => undefined)
    await liberar()
    await page.waitForTimeout(300)
    assert.ok(guard.violacion() instanceof EmisionBloqueadaError)
    assert.match(String(posts()[0]?.fallo), /^net::ERR_BLOCKED_BY_CLIENT/)
  } finally {
    await context.close()
  }
})
