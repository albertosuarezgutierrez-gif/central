// Explorador 0.3.2 (28/10/2026, dos fallos reales de la imagen main-57b99d0). Portal SINTÉTICO en 127.0.0.1 (el resto de la red
// sale por un proxy muerto) y asegura FALSO (`pedirPaso` inyectado). Sin datos personales.
//  1) Mapfre Patinetes: «Acceso a NSE» (`javascript:abrirAplicacion('inicio.jsp', 'NUEVO SISTEMA DE EMISI%C3%93N');`) solo por
//     `pulsarAccesoNseMapfre`; `pulsar` genérico lo sigue bloqueando y cualquier otro enlace de emisión también.
//  2) Allianz ePAC `/drvp00/SEAServlet`: radios OCULTOS inventariados por su label (como `input radio`) y el avance de paso
//     `#btnAceptar` + `eventoSiguiente()` autorizado SOLO con esa identidad exacta; checkbox y «Aceptar» genérico, rechazados.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { EmisionBloqueadaError, rutasAppTolerablesDe, type InventarioDom } from '@central/module-tarificacion'
import { tolerarRutasApp, cerrarDialogoTerminoEpac, cerrarFaseEntrada, instalarGuardEmision, pulsarMenuOfertaNseMapfre, MAX_AVANCES_POR_ID, precioVistoEn, registrarPrecioVisto, pulsar, pulsarAccesoNseMapfre, pulsarExploracionAutorizada, pulsarGuardadoDialogoAutorizado, pulsarGuardadoPresupuesto, type GuardEmision } from '../src/guard.ts'
import { capturarInventarioExploracion } from '../src/inventario-dom.ts'
import { bucleExploracion, EXPLORADOR_VERSION, type ContextoBucle } from '../src/explorador.ts'
import type { RespuestaPaso } from '../src/api.ts'

const PAGINA = (cuerpo: string) => `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body>${cuerpo}</body></html>`
const HREF_NSE = "javascript:abrirAplicacion('inicio.jsp', 'NUEVO SISTEMA DE EMISI%C3%93N');"
const LANDING = (href: string, texto = 'Acceso a NSE') => PAGINA(`<p>Patinetes</p><a id="nse" href="${href}">${texto}</a>
  <script>function abrirAplicacion(jsp, app){ window.open('/nse-form?app=nse', '_blank') }</script>`)

/** «Datos Básicos – Figuras Intervinientes» de ePAC: título en una celda (no h1-h6), radios OCULTOS y su label visible. */
const FIGURAS = (onclickAceptar = 'eventoSiguiente()') => PAGINA(`
  <form id="f" method="post" action="/drvp00/SEAServlet">
    <table><tr><td class="titulo">Datos Básicos – Figuras Intervinientes</td></tr>
    <tr><td>Es el Propietario</td><td>
      <input type="radio" id="IntervinientesBean$esPropietario1" name="IntervinientesBean$esPropietario" value="S" style="display:none"><label id="IntervinientesBean$esPropietario1_label" class="radio">Si</label>
      <input type="radio" id="IntervinientesBean$esPropietario2" name="IntervinientesBean$esPropietario" value="N" style="display:none"><label id="IntervinientesBean$esPropietario2_label" class="radio">No</label></td></tr>
    <tr><td>Es el Conductor</td><td>
      <input type="radio" id="IntervinientesBean$esConductor1" name="IntervinientesBean$esConductor" value="S" style="display:none"><label for="IntervinientesBean$esConductor1" id="IntervinientesBean$esConductor1_label">Si</label>
      <input type="radio" id="IntervinientesBean$esConductor2" name="IntervinientesBean$esConductor" value="N" style="display:none"><label for="IntervinientesBean$esConductor2" id="IntervinientesBean$esConductor2_label">No</label></td></tr>
    <tr><td><input type="checkbox" id="casilla" name="casilla" value="1" style="display:none"><label for="casilla">Casilla de prueba</label></td></tr>
    </table>
    <button type="button" id="btnAceptar" onclick="${onclickAceptar}">Aceptar</button>
    <button type="button" id="aceptarGenerico" onclick="document.getElementById('f').submit()">Aceptar</button>
  </form>
  <script>
    function eventoSiguiente(){ document.getElementById('f').submit() }
    // El portal marca el radio al pulsar su etiqueta (las que no llevan «for»).
    for (const l of document.querySelectorAll('label.radio')) l.addEventListener('click', () => { document.getElementById(l.id.slice(0, -6)).checked = true })
  </script>`)
const RESULTADO = PAGINA(`<h1>Resultado</h1><table><tr><td>Prima total</td><td>47,55 €</td></tr></table>`)

type Peticion = { metodo: string; ruta: string; cuerpo: string }
let servidor: Server
let base = ''
let peticiones: Peticion[] = []
let figuras = FIGURAS()
let landing = LANDING(HREF_NSE)
let menuNse = ''
let browser: Browser

before(async () => {
  servidor = createServer((req, res) => {
    let cuerpo = ''
    req.on('data', (c) => { cuerpo += c })
    req.on('end', () => {
      const ruta = (req.url ?? '/').split('?')[0]
      peticiones.push({ metodo: req.method ?? 'GET', ruta, cuerpo })
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      if (ruta === '/drvp00/SEAServlet') return void res.end(req.method === 'POST' ? RESULTADO : figuras)
      if (ruta === '/otro/SEAServlet') return void res.end(figuras)
      if (ruta === '/landing') return void res.end(landing)
      if (ruta === '/EVT21_NSE_FWEB/inicio.jsp' || ruta === '/otra/inicio.jsp') return void res.end(menuNse)
      if (ruta === '/nse-form') return void res.end(PAGINA('<p>Formulario NSE (sintético)</p>'))
      res.end(PAGINA('<h1>404</h1>'))
    })
  })
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
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
  await new Promise<void>((r) => servidor.close(() => r()))
})

async function abrir(ruta: string): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  peticiones = []
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(5_000)
  await page.goto(`${base}${ruta}`)
  return { context, page, guard }
}


// ─── 1) Mapfre «Acceso a NSE» ────────────────────────────────────────────────

test('Mapfre: «Acceso a NSE» con el href real pasa por pulsarAccesoNseMapfre (abre la pestaña, sin violación)', async () => {
  landing = LANDING(HREF_NSE)
  const { context, page, guard } = await abrir('/landing')
  try {
    const nueva = context.waitForEvent('page', { timeout: 5_000 })
    await pulsarAccesoNseMapfre(page.locator('#nse'), guard, 'mapfre')
    const p = await nueva
    await p.waitForLoadState('domcontentloaded')
    assert.match(p.url(), /\/nse-form/)
    assert.equal(guard.violacion(), null)
    // Una vez por trabajo.
    await assert.rejects(pulsarAccesoNseMapfre(page.locator('#nse'), guard, 'mapfre'), /ya se usó/)
  } finally {
    await context.close()
  }
})

test('Mapfre: el MISMO enlace por el `pulsar` genérico sigue bloqueado (el fallo real), sin abrir nada', async () => {
  landing = LANDING(HREF_NSE)
  const { context, page, guard } = await abrir('/landing')
  try {
    await assert.rejects(pulsar(page.locator('#nse'), guard), (e: unknown) => e instanceof EmisionBloqueadaError && /NUEVO SISTEMA DE EMISI/.test(e.message))
    assert.equal(context.pages().length, 1)
  } finally {
    await context.close()
  }
})

test('Mapfre: la puerta NO abre «Emitir», «Emitir póliza», «Contratar», otro texto, otra aplicación, otra compañía ni fuera de la entrada', async () => {
  const casos: [string, string, string][] = [
    ['Emitir', HREF_NSE, 'mapfre'],
    ['Emitir póliza', HREF_NSE, 'mapfre'],
    ['Contratar', HREF_NSE, 'mapfre'],
    ['Abrir NSE', HREF_NSE, 'mapfre'],
    ['Acceso a NSE', "javascript:abrirAplicacion('x','EMITIR');", 'mapfre'],
    ['Acceso a NSE', "javascript:abrirAplicacion('inicio.jsp', 'NUEVO SISTEMA DE EMISION');emitirPoliza();", 'mapfre'],
    ['Acceso a NSE', HREF_NSE, 'allianz'],
  ]
  for (const [texto, href, compania] of casos) {
    landing = LANDING(href, texto)
    const { context, page, guard } = await abrir('/landing')
    try {
      await assert.rejects(pulsarAccesoNseMapfre(page.locator('#nse'), guard, compania), EmisionBloqueadaError, `${texto} / ${href} / ${compania}`)
      assert.equal(context.pages().length, 1, `${texto}: no se abrió nada`)
    } finally {
      await context.close()
    }
  }
  landing = LANDING(HREF_NSE)
  const { context, page, guard } = await abrir('/landing')
  try {
    cerrarFaseEntrada(guard)
    await assert.rejects(pulsarAccesoNseMapfre(page.locator('#nse'), guard, 'mapfre'), /fuera de la fase de entrada/)
  } finally {
    await context.close()
  }
})

// ─── 2) Allianz ePAC drvp00 ──────────────────────────────────────────────────

const MP = 'allianz:autos:movilidad_personal'
const elementos = (inv: InventarioDom) => inv.marcos.flatMap((m) => m.elementos)
function ref(inv: InventarioDom, id: string): string {
  const e = elementos(inv).find((x) => x.id === id && x.ref)
  if (!e) throw new Error(`sin ref para #${id}`)
  return e.ref!
}
const respuesta = (acciones: unknown[], tipo = 'formulario') => ({ version: 1, pantalla: { nombre: 'Figuras', tipo }, acciones, mapeo: [], motivo: null })

function contexto(page: Page, guard: GuardEmision, guion: (inv: InventarioDom, n: number) => unknown): ContextoBucle {
  let n = 0
  return {
    trabajoId: '00000000-0000-4000-8000-000000000032', compania: 'allianz', ramo: 'patinete', entrada: MP,
    conDatosReales: false, riesgo: {}, env: {}, guard,
    pulsar: (b) => pulsar(b, guard),
    pulsarAutorizado: (b, el, marco) => pulsarExploracionAutorizada(page, guard, b, { entrada: MP, el, marco }),
    pulsarGuardado: (b, el, pantalla, trasClic) => pulsarGuardadoPresupuesto(page, guard, b, { el, pantalla }, trasClic),
    pulsarGuardadoDialogo: (b, el, marco) => pulsarGuardadoDialogoAutorizado(page, guard, b, { entrada: MP, el, marco }),
    topePdfMs: 2_000,
    pausaAccion: async () => undefined,
    pedirPaso: async (c): Promise<RespuestaPaso> => ({ estado: 'ok', respuesta: await guion(c.inventario, ++n), leaseHasta: null }),
    log: () => undefined,
  }
}

test('ePAC: el inventario saca las LABEL de radios ocultos como `input radio` (id/name del input); la de un checkbox sigue siendo label', async () => {
  figuras = FIGURAS()
  const { context, page } = await abrir('/drvp00/SEAServlet')
  try {
    const cap = (await capturarInventarioExploracion(page))!
    const els = elementos(cap.inventario)
    const radios = els.filter((e) => e.tag === 'input' && e.type === 'radio')
    assert.deepEqual(radios.map((e) => [e.id, e.name, e.texto]), [
      ['IntervinientesBean$esPropietario1', 'IntervinientesBean$esPropietario', 'Si'],
      ['IntervinientesBean$esPropietario2', 'IntervinientesBean$esPropietario', 'No'],
      ['IntervinientesBean$esConductor1', 'IntervinientesBean$esConductor', 'Si'],
      ['IntervinientesBean$esConductor2', 'IntervinientesBean$esConductor', 'No'],
    ])
    assert.ok(!els.some((e) => e.type === 'checkbox'), 'el checkbox oculto no sale como control')
    assert.ok(els.some((e) => e.tag === 'label' && e.texto === 'Casilla de prueba'), 'su etiqueta sigue siendo label')
    assert.ok(!els.some((e) => e.tag === 'label' && /_label$/.test(e.id ?? '') && /esPropietario|esConductor/.test(e.id ?? '')), 'las labels de radio no salen duplicadas')
    await cap.liberar()
  } finally {
    await context.close()
  }
})

test('ePAC: marca «Propietario: Si» y «Conductor: Si» por su label y avanza por #btnAceptar/eventoSiguiente() (UN POST) hasta el precio', async () => {
  figuras = FIGURAS()
  const { context, page, guard } = await abrir('/drvp00/SEAServlet')
  try {
    const k = contexto(page, guard, (inv, n) => {
      if (n === 1) return respuesta([
        { accion: 'marcar', ref: ref(inv, 'IntervinientesBean$esPropietario1') },
        { accion: 'marcar', ref: ref(inv, 'IntervinientesBean$esConductor1') },
        { accion: 'avanzar', ref: ref(inv, 'btnAceptar'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' },
      ])
      const imp = inv.marcos.flatMap((m) => m.importes ?? [])
      return respuesta([{ accion: 'terminar', refsPrecio: [imp[0].ref] }], 'resultado')
    })
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'resultado', JSON.stringify(fin))
    const posts = peticiones.filter((p) => p.metodo === 'POST' && p.ruta === '/drvp00/SEAServlet')
    assert.equal(posts.length, 1)
    assert.match(posts[0].cuerpo, /IntervinientesBean%24esPropietario=S/)
    assert.match(posts[0].cuerpo, /IntervinientesBean%24esConductor=S/)
    assert.ok(!/casilla/.test(posts[0].cuerpo))
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

for (const [nombre, acciones] of [
  ['marcar el CHECKBOX (por su label)', (inv: InventarioDom) => [{ accion: 'marcar', ref: elementos(inv).find((e) => e.tag === 'label' && e.texto === 'Casilla de prueba')!.ref }]],
  ['avanzar por un «Aceptar» GENÉRICO', (inv: InventarioDom) => [{ accion: 'avanzar', ref: ref(inv, 'aceptarGenerico'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }]],
] as const) {
  test(`ePAC: ${nombre} → rechazado al revalidar, sin POST`, async () => {
    figuras = FIGURAS()
    const { context, page, guard } = await abrir('/drvp00/SEAServlet')
    try {
      const fin = await bucleExploracion(page, contexto(page, guard, (inv) => respuesta(acciones(inv))))
      assert.equal(fin.motivo, 'ambiguo', JSON.stringify(fin))
      assert.equal(fin.detalle, 'lote_no_valido')
      assert.ok(!peticiones.some((p) => p.metodo === 'POST'))
      assert.equal(await page.locator('#casilla').isChecked(), false)
    } finally {
      await context.close()
    }
  })
}

test('ePAC: #btnAceptar con OTRO onclick, o en OTRO marco, no entra por la puerta del avance', async () => {
  for (const [ruta, onclick] of [['/drvp00/SEAServlet', 'eventoSiguiente();emitir()'], ['/otro/SEAServlet', 'eventoSiguiente()']] as const) {
    figuras = FIGURAS(onclick)
    const { context, page, guard } = await abrir(ruta)
    try {
      const cap = (await capturarInventarioExploracion(page))!
      const marco = cap.inventario.marcos[0]
      const el = marco.elementos.find((e) => e.id === 'btnAceptar')!
      await assert.rejects(pulsarExploracionAutorizada(page, guard, page.locator('#btnAceptar'), { entrada: MP, el, marco }), /no autorizado/, `${ruta} ${onclick}`)
      assert.ok(!peticiones.some((p) => p.metodo === 'POST'))
      await cap.liberar()
    } finally {
      await context.close()
    }
  }
})

test('ePAC: si el onclick VIVO cambia tras el inventario, la puerta no pulsa', async () => {
  figuras = FIGURAS()
  const { context, page, guard } = await abrir('/drvp00/SEAServlet')
  try {
    const cap = (await capturarInventarioExploracion(page))!
    const marco = cap.inventario.marcos[0]
    const el = marco.elementos.find((e) => e.id === 'btnAceptar')!
    await page.evaluate(() => document.getElementById('btnAceptar')!.setAttribute('onclick', 'otraCosa()'))
    await assert.rejects(pulsarExploracionAutorizada(page, guard, page.locator('#btnAceptar'), { entrada: MP, el, marco }), /id\/onclick\/marco/)
    assert.ok(!peticiones.some((p) => p.metodo === 'POST'))
    await cap.liberar()
  } finally {
    await context.close()
  }
})

test(`ePAC: el avance de paso por id tiene tope (${MAX_AVANCES_POR_ID} por trabajo)`, async () => {
  figuras = FIGURAS()
  const { context, page, guard } = await abrir('/drvp00/SEAServlet')
  try {
    for (let i = 0; i < MAX_AVANCES_POR_ID; i++) {
      await page.goto(`${base}/drvp00/SEAServlet`)
      const cap = (await capturarInventarioExploracion(page))!
      const marco = cap.inventario.marcos[0]
      const el = marco.elementos.find((e) => e.id === 'btnAceptar')!
      await pulsarExploracionAutorizada(page, guard, page.locator('#btnAceptar'), { entrada: MP, el, marco })
      await cap.liberar()
    }
    await page.goto(`${base}/drvp00/SEAServlet`)
    const cap = (await capturarInventarioExploracion(page))!
    const marco = cap.inventario.marcos[0]
    const el = marco.elementos.find((e) => e.id === 'btnAceptar')!
    await assert.rejects(pulsarExploracionAutorizada(page, guard, page.locator('#btnAceptar'), { entrada: MP, el, marco }), /ya se usó/)
    await cap.liberar()
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

// ─── Revisión de seguridad (28/10/2026) ──────────────────────────────────────

test('seguridad: pulsar una LABEL cuyo radio oculto lleva un handler de emisión → EmisionBloqueadaError (por for y por <x>_label)', async () => {
  for (const html of [
    '<label id="lab" for="r">Sí</label><input id="r" type="radio" style="display:none" onclick="emitir()">',
    '<label id="r_label">Sí</label><input id="r" type="radio" style="display:none" onchange="contratarPoliza()">',
  ]) {
    figuras = PAGINA(html)
    const { context, page, guard } = await abrir('/drvp00/SEAServlet')
    try {
      await assert.rejects(pulsar(page.locator('label').first(), guard), EmisionBloqueadaError, html)
    } finally {
      await context.close()
    }
  }
  // Y una label normal (radio sin handler de emisión) se sigue pulsando.
  figuras = PAGINA('<label for="r">Sí</label><input id="r" name="x" value="S" type="radio" style="display:none">')
  const { context, page, guard } = await abrir('/drvp00/SEAServlet')
  try {
    await pulsar(page.locator('label').first(), guard)
    assert.equal(await page.locator('#r').isChecked(), true)
  } finally {
    await context.close()
  }
})

test('seguridad: si el marco muestra un PRECIO al ir a pulsar, el avance por id no se pulsa; tope = 3', async () => {
  assert.equal(MAX_AVANCES_POR_ID, 3)
  figuras = FIGURAS()
  const { context, page, guard } = await abrir('/drvp00/SEAServlet')
  try {
    const cap = (await capturarInventarioExploracion(page))!
    const marco = cap.inventario.marcos[0]
    const el = marco.elementos.find((e) => e.id === 'btnAceptar')!
    await page.evaluate(() => { const t = document.createElement('td'); t.textContent = '47,55 €'; document.querySelector('tr')!.appendChild(t) })
    await assert.rejects(pulsarExploracionAutorizada(page, guard, page.locator('#btnAceptar'), { entrada: MP, el, marco }), /precio/)
    assert.ok(!peticiones.some((p) => p.metodo === 'POST'))
    await cap.liberar()
  } finally {
    await context.close()
  }
})

// ─── 0.3.3 (real 28/10/2026, main-48f22cd): el botón NO está dentro del form y el marco tiene varios ───────────

const FIGURAS_FUERA = PAGINA(`
  <form id="buscador" method="post" action="/drvp00/OtroServlet"><input name="q" id="q"></form>
  <form id="f" method="post" action="/drvp00/SEAServlet">
    <table><tr><td>Es el Propietario</td><td>
      <input type="radio" id="IntervinientesBean$esPropietario1" name="IntervinientesBean$esPropietario" value="S" style="display:none"><label for="IntervinientesBean$esPropietario1">Si</label></td></tr></table>
  </form>
  <button type="button" id="btnAceptar" onclick="eventoSiguiente()">Aceptar</button>
  <script>function eventoSiguiente(){ document.getElementById('f').submit() }</script>`)

test('0.3.3 · ePAC: #btnAceptar FUERA del form y con varios forms: el destino es el servlet del marco (UN POST) y llega al precio', async () => {
  figuras = FIGURAS_FUERA
  const { context, page, guard } = await abrir('/drvp00/SEAServlet')
  try {
    const k = contexto(page, guard, (inv, n) => {
      if (n === 1) return respuesta([
        { accion: 'marcar', ref: ref(inv, 'IntervinientesBean$esPropietario1') },
        { accion: 'avanzar', ref: ref(inv, 'btnAceptar'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' },
      ])
      const imp = inv.marcos.flatMap((m) => m.importes ?? [])
      return respuesta([{ accion: 'terminar', refsPrecio: [imp[0].ref] }], 'resultado')
    })
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'resultado', JSON.stringify(fin))
    assert.equal(peticiones.filter((p) => p.metodo === 'POST' && p.ruta === '/drvp00/SEAServlet').length, 1)
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

test('0.3.3 · ePAC: la ventana abierta para el avance por id SOLO admite el servlet: un POST a otra ruta durante el clic aborta', async () => {
  figuras = FIGURAS_FUERA.replace("document.getElementById('f').submit()", "document.getElementById('buscador').submit()")
  const { context, page, guard } = await abrir('/drvp00/SEAServlet')
  try {
    const cap = (await capturarInventarioExploracion(page))!
    const marco = cap.inventario.marcos[0]
    const el = marco.elementos.find((e) => e.id === 'btnAceptar')!
    await pulsarExploracionAutorizada(page, guard, page.locator('#btnAceptar'), { entrada: MP, el, marco }).catch(() => undefined)
    assert.ok(!peticiones.some((p) => p.metodo === 'POST' && p.ruta === '/drvp00/OtroServlet'), 'el POST a otra ruta no salió')
    assert.notEqual(guard.violacion(), null)
    await cap.liberar()
  } finally {
    await context.close()
  }
})

// ─── Revisión de seguridad 2 (28/10/2026, PR #5211): precio pegajoso, títulos vivos y capa de parámetros ───────────

async function intentarAvance(page: Page, guard: GuardEmision, antes?: () => Promise<void>): Promise<unknown> {
  const cap = (await capturarInventarioExploracion(page))!
  const marco = cap.inventario.marcos.find((m) => m.elementos.some((e) => e.id === 'btnAceptar'))!
  const el = marco.elementos.find((e) => e.id === 'btnAceptar')!
  await antes?.()
  try {
    await pulsarExploracionAutorizada(page, guard, page.locator('#btnAceptar'), { entrada: MP, el, marco })
    return null
  } catch (e) {
    return e
  } finally {
    await cap.liberar()
  }
}

test('seguridad 2a: precio VIVO en cualquier forma (nodo no hoja, input readonly, OTRO marco) bloquea y queda PEGAJOSO en el trabajo', async () => {
  const inyecciones: [string, (page: Page) => Promise<void>][] = [
    ['nodo no hoja «123,45 <span>€</span>»', (page) => page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = '123,45 <span>€</span>'; document.body.appendChild(d) })],
    ['input readonly con importe', (page) => page.evaluate(() => { const i = document.createElement('input'); i.readOnly = true; i.value = '47,55 €'; document.body.appendChild(i) })],
    ['importe en OTRO marco', (page) => page.evaluate(() => { const f = document.createElement('iframe'); f.srcdoc = '<p>Prima total</p><p>310,20 €</p>'; document.body.appendChild(f) }).then(() => page.waitForTimeout(300))],
  ]
  for (const [nombre, inyectar] of inyecciones) {
    figuras = FIGURAS()
    const { context, page, guard } = await abrir('/drvp00/SEAServlet')
    try {
      const e = await intentarAvance(page, guard, () => inyectar(page))
      assert.ok(e instanceof EmisionBloqueadaError && /precio/.test(e.message), `${nombre}: ${String(e)}`)
      assert.equal(precioVistoEn(guard), true, nombre)
      // Pegajoso: aunque el precio desaparezca (página recargada), el avance por id ya no vuelve.
      await page.goto(`${base}/drvp00/SEAServlet`)
      const e2 = await intentarAvance(page, guard)
      assert.ok(e2 instanceof EmisionBloqueadaError && /ya se vio un precio/.test(e2.message), `${nombre} (pegajoso): ${String(e2)}`)
      assert.ok(!peticiones.some((p) => p.metodo === 'POST'), nombre)
    } finally {
      await context.close()
    }
  }
})

test('seguridad 2a: el bucle registra el precio visto en un paso (cualquier marco) y la revalidación rechaza después el avance por id', async () => {
  figuras = FIGURAS()
  const { context, page, guard } = await abrir('/drvp00/SEAServlet')
  try {
    registrarPrecioVisto(guard)
    const fin = await bucleExploracion(page, contexto(page, guard, (inv) => respuesta([{ accion: 'avanzar', ref: ref(inv, 'btnAceptar'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }])))
    assert.equal(fin.motivo, 'ambiguo', JSON.stringify(fin))
    assert.equal(fin.detalle, 'lote_no_valido')
    assert.ok(!peticiones.some((p) => p.metodo === 'POST'))
  } finally {
    await context.close()
  }
})

test('seguridad 2b: un título VIVO de tarificación/emisión en cualquier marco (tras el inventario) bloquea el avance por id', async () => {
  for (const [nombre, html] of [['h3 Tarificar', '<h3>Tarificar</h3>'], ['th Forma de pago', '<table><tr><th>Forma de pago</th></tr></table>'], ['legend Revisión', '<fieldset><legend>Revisión y emisión</legend></fieldset>']] as const) {
    figuras = FIGURAS()
    const { context, page, guard } = await abrir('/drvp00/SEAServlet')
    try {
      const e = await intentarAvance(page, guard, () => page.evaluate((h) => { const f = document.createElement('iframe'); f.srcdoc = h; document.body.appendChild(f) }, html).then(() => page.waitForTimeout(300)))
      assert.ok(e instanceof EmisionBloqueadaError && /título vivo/.test(e.message), `${nombre}: ${String(e)}`)
      assert.ok(!peticiones.some((p) => p.metodo === 'POST'), nombre)
    } finally {
      await context.close()
    }
  }
})

test('seguridad 2c: durante el avance por id, un POST al MISMO servlet con acción de emisión en el cuerpo se aborta (EmisionBloqueadaError)', async () => {
  for (const cuerpo of ['action=contract', 'evento=emitir', 'validar_aceptar=1']) {
    figuras = FIGURAS().replace("function eventoSiguiente(){ document.getElementById('f').submit() }", `function eventoSiguiente(){ fetch('/drvp00/SEAServlet', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '${cuerpo}' }).catch(() => {}) }`)
    assert.ok(figuras.includes(cuerpo))
    const { context, page, guard } = await abrir('/drvp00/SEAServlet')
    try {
      await intentarAvance(page, guard, async () => undefined)
      await page.waitForTimeout(500)
      assert.ok(guard.violacion() instanceof EmisionBloqueadaError, cuerpo)
      assert.ok(!peticiones.some((p) => p.metodo === 'POST' && p.cuerpo.includes(cuerpo)), `${cuerpo}: no llegó al servidor`)
    } finally {
      await context.close()
    }
  }
})

test('seguridad 2a: el BUCLE marca el precio visto si el inventario de un paso trae importes (en cualquier marco)', async () => {
  figuras = FIGURAS().replace('</form>', '</form><table><tr><td>Prima total</td><td>47,55 €</td></tr></table>')
  const { context, page, guard } = await abrir('/drvp00/SEAServlet')
  try {
    assert.equal(precioVistoEn(guard), false)
    await bucleExploracion(page, contexto(page, guard, () => respuesta([{ accion: 'parar', motivo: 'ambiguo' }])))
    assert.equal(precioVistoEn(guard), true)
  } finally {
    await context.close()
  }
})

// ─── 0.3.4 (real 28/10/2026, main-63b6680) ──────────────────────────────────────────────────────────────────


const DIALOGO = (texto: string, botones: string) => `<div class="modal" role="dialog" aria-labelledby="tt" id="dlg"><h4 id="tt">Atención</h4><p>${texto}</p>${botones}</div>
  <script>window.pulsados = []; document.querySelectorAll('#dlg button').forEach((b) => b.addEventListener('click', () => { window.pulsados.push(b.textContent); document.getElementById('dlg').remove() }))</script>`
const BOTONES = '<button type="button">×</button><button type="button" id="buttonOkPopup">Aceptar</button><button type="button">Cancelar</button>'
const TERMINO = '¿Desea alargar el término 1 mes más?'

test('0.3.4 · ePAC: el diálogo «Atención» de alargar el término se cierra por CÓDIGO con «Cancelar» (nunca Aceptar) antes de preguntar a la IA', async () => {
  figuras = FIGURAS().replace('</form>', `</form>${DIALOGO(TERMINO, BOTONES)}`)
  const { context, page, guard } = await abrir('/drvp00/SEAServlet')
  try {
    let vistoDialogo: boolean | null = null
    const fin = await bucleExploracion(page, contexto(page, guard, (inv) => {
      vistoDialogo = elementos(inv).some((e) => e.dialogo === 'Atención')
      return respuesta([{ accion: 'parar', motivo: 'ambiguo' }])
    }))
    assert.equal(fin.motivo, 'ambiguo')
    assert.equal(vistoDialogo, false, 'la IA ya no ve el diálogo')
    assert.deepEqual(await page.evaluate(() => (window as unknown as { pulsados: string[] }).pulsados), ['Cancelar'])
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

test('0.3.4 · ePAC: sin «Cancelar», cierra con «×»; un «Atención» de OTRA cosa u otra entrada no se toca', async () => {
  figuras = FIGURAS().replace('</form>', `</form>${DIALOGO(TERMINO, '<button type="button" id="buttonOkPopup">Aceptar</button><button type="button">×</button>')}`)
  {
    const { context, page, guard } = await abrir('/drvp00/SEAServlet')
    try {
      assert.equal(await cerrarDialogoTerminoEpac(page, guard), true)
      assert.deepEqual(await page.evaluate(() => (window as unknown as { pulsados: string[] }).pulsados), ['×'])
    } finally {
      await context.close()
    }
  }
  figuras = FIGURAS().replace('</form>', `</form>${DIALOGO('¿Desea emitir la póliza ahora?', BOTONES)}`)
  {
    const { context, page, guard } = await abrir('/drvp00/SEAServlet')
    try {
      assert.equal(await cerrarDialogoTerminoEpac(page, guard), false)
      assert.deepEqual(await page.evaluate(() => (window as unknown as { pulsados: string[] }).pulsados), [])
    } finally {
      await context.close()
    }
  }
  figuras = FIGURAS().replace('</form>', `</form>${DIALOGO(TERMINO, BOTONES)}`)
  {
    const { context, page, guard } = await abrir('/drvp00/SEAServlet')
    try {
      // Otra entrada (Hogar) no tiene `cierraDialogoTermino`: el bucle no lo cierra.
      await bucleExploracion(page, { ...contexto(page, guard, () => respuesta([{ accion: 'parar', motivo: 'ambiguo' }])), entrada: 'allianz:particulares:hogar', ramo: 'hogar' })
      assert.deepEqual(await page.evaluate(() => (window as unknown as { pulsados: string[] }).pulsados), [])
    } finally {
      await context.close()
    }
  }
})

const MENU_NSE = (extra = '') => PAGINA(`<a onclick="toggleFilter()">Ocultar menú</a>
  <a href="#" id="m1">Búsqueda de Respuestas y Gestión</a><a href="#" id="m2">Oferta / Contratación</a><a href="javascript:verMultiprecio()" id="m3">Oferta Multiprecio</a>
  <a href="#" id="m4">Contratar póliza</a>${extra}
  <script>window.ido = []; document.querySelectorAll('a').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); window.ido.push(a.textContent) })); function verMultiprecio(){}</script>`)

test('0.3.4 · Mapfre NSE: «Oferta / Contratación» pasa SOLO por su puerta (texto exacto, app NSE, entrada abierta, una vez); `pulsar` genérico lo bloquea', async () => {
  menuNse = MENU_NSE()
  const { context, page, guard } = await abrir('/EVT21_NSE_FWEB/inicio.jsp')
  try {
    await assert.rejects(pulsar(page.locator('#m2'), guard), EmisionBloqueadaError)
    await pulsarMenuOfertaNseMapfre(page.locator('#m2'), guard, 'mapfre')
    assert.deepEqual(await page.evaluate(() => (window as unknown as { ido: string[] }).ido), ['Oferta / Contratación'])
    await assert.rejects(pulsarMenuOfertaNseMapfre(page.locator('#m2'), guard, 'mapfre'), /ya se usó/)
  } finally {
    await context.close()
  }
  const casos: [string, string, string, string, ((g: GuardEmision) => void)?][] = [
    ['Contratar póliza (otro texto)', '/EVT21_NSE_FWEB/inicio.jsp', '#m4', 'mapfre'],
    ['otra entrada de menú inocua', '/EVT21_NSE_FWEB/inicio.jsp', '#m1', 'mapfre'],
    ['href con contratar', '/EVT21_NSE_FWEB/inicio.jsp', '#m5', 'mapfre'],
    ['fuera de la app NSE', '/otra/inicio.jsp', '#m2', 'mapfre'],
    ['otra compañía', '/EVT21_NSE_FWEB/inicio.jsp', '#m2', 'allianz'],
    ['fase de entrada cerrada', '/EVT21_NSE_FWEB/inicio.jsp', '#m2', 'mapfre', cerrarFaseEntrada],
  ]
  for (const [nombre, ruta, sel, compania, prep] of casos) {
    menuNse = MENU_NSE('<a id="m5" href="javascript:contratarPoliza()">Oferta / Contratación</a>')
    const { context, page, guard } = await abrir(ruta)
    try {
      prep?.(guard)
      await assert.rejects(pulsarMenuOfertaNseMapfre(page.locator(sel), guard, compania), EmisionBloqueadaError, nombre)
      assert.deepEqual(await page.evaluate(() => (window as unknown as { ido: string[] }).ido), [], nombre)
    } finally {
      await context.close()
    }
  }
})

test('0.3.4 · inventario: <a href> de menú sale como role=link y `javascript:` como onclick (para que la IA elija el producto)', async () => {
  menuNse = MENU_NSE('<a id="m6" onclick="marcar()" href="javascript:contratarPoliza()">Seguir</a><a id="m7" href="/EVT21_NSE_FWEB/contratar.do?x=1&cliente=2">Seguir 2</a>')
  const { context, page } = await abrir('/EVT21_NSE_FWEB/inicio.jsp')
  try {
    const cap = (await capturarInventarioExploracion(page))!
    const els = elementos(cap.inventario)
    assert.equal(els.find((e) => e.id === 'm1')?.role, 'link')
    assert.equal(els.find((e) => e.id === 'm3')?.onclick, 'javascript:verMultiprecio()')
    assert.equal(els.find((e) => e.id === 'm1')?.hrefRuta, '/EVT21_NSE_FWEB/inicio.jsp')
    assert.equal(els.find((e) => e.id === 'm6')?.onclick, 'marcar() ; javascript:contratarPoliza()', 'onclick Y href javascript: se concatenan')
    assert.equal(els.find((e) => e.id === 'm7')?.hrefRuta, '/EVT21_NSE_FWEB/contratar.do', 'la ruta sin query')
    await cap.liberar()
  } finally {
    await context.close()
  }
})

// ─── 0.3.5: ruta de aplicación NSE (`/EVT21_NSE_FWEB/app/emision/`) tolerada SOLO en Mapfre patinete ───────────

test('versión 0.3.5', () => assert.equal(EXPLORADOR_VERSION, '0.3.5'))

const CARGA = 'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/cargaOperacion/cargaOperacion.jsf'
const PAG_NSE = (href: string, texto: string) => PAGINA(`<a id="l" href="${href}">${texto}</a><script>document.getElementById('l').addEventListener('click', (e) => { e.preventDefault(); window.pulsado = 1 })</script>`)
async function postA(page: Page, url: string, cuerpo: string): Promise<void> {
  await page.evaluate(([u, c]) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: c }).catch(() => undefined), [url, cuerpo] as const)
  await page.waitForTimeout(300)
}

test('0.3.5 · Mapfre patinete (rutas toleradas): enlace y POST a cargaOperacion.jsf pasan; emitir.jsf, accion=emitir y «Emitir póliza» no', async () => {
  for (const [nombre, prueba, permitido] of [
    ['enlace a cargaOperacion', async (page: Page, guard: GuardEmision) => { landing = PAG_NSE(CARGA, 'Nueva oferta'); await page.goto(`${base}/landing`); await pulsar(page.locator('#l'), guard) }, true],
    ['POST a cargaOperacion', async (page: Page) => postA(page, CARGA, 'paso=2'), true],
    ['POST a emitir.jsf', async (page: Page) => postA(page, 'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/emitir.jsf', 'paso=2'), false],
    ['POST con accion=emitir', async (page: Page) => postA(page, CARGA, 'accion=emitir'), false],
    ['botón «Emitir póliza» bajo NSE', async (page: Page, guard: GuardEmision) => { landing = PAG_NSE(CARGA, 'Emitir póliza'); await page.goto(`${base}/landing`); await pulsar(page.locator('#l'), guard) }, false],
  ] as const) {
    const { context, page, guard } = await abrir('/drvp00/SEAServlet')
    try {
      tolerarRutasApp(guard, rutasAppTolerablesDe('mapfre:automoviles:patinetes'))
      const r = await prueba(page, guard).then(() => null, (e: unknown) => e)
      const bloqueado = r instanceof EmisionBloqueadaError || guard.violacion() !== null
      assert.equal(bloqueado, !permitido, `${nombre}: ${String(r ?? guard.violacion())}`)
    } finally {
      await context.close()
    }
  }
})

test('0.3.5 · la MISMA ruta en Allianz o Mapfre auto (sin reglas): enlace y POST a cargaOperacion.jsf siguen bloqueados; reglas raras se rechazan', async () => {
  for (const entrada of ['allianz:autos:movilidad_personal', 'mapfre:nueva_produccion:auto']) {
    const { context, page, guard } = await abrir('/drvp00/SEAServlet')
    try {
      const reglas = rutasAppTolerablesDe(entrada)
      if (reglas.length > 0) tolerarRutasApp(guard, reglas)
      landing = PAG_NSE(CARGA, 'Nueva oferta')
      await page.goto(`${base}/landing`)
      await assert.rejects(pulsar(page.locator('#l'), guard), EmisionBloqueadaError, entrada)
      await postA(page, CARGA, 'paso=2')
      assert.notEqual(guard.violacion(), null, entrada)
    } finally {
      await context.close()
    }
  }
  const { context, guard } = await abrir('/drvp00/SEAServlet')
  try {
    assert.throws(() => tolerarRutasApp(guard, [{ origen: 'http://wmediadores.mapfre.com', prefijo: '/EVT21_NSE_FWEB/app/emision/' }]), EmisionBloqueadaError)
    assert.throws(() => tolerarRutasApp(guard, [{ origen: 'https://wmediadores.mapfre.com', prefijo: '/' + 'x?y/' }]), EmisionBloqueadaError)
  } finally {
    await context.close()
  }
})

test('0.3.5 · el explorador fija en el guard las rutas tolerables de SU entrada (y solo esas) antes de abrir la página', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../src/explorador.ts', import.meta.url), 'utf8')
  const i = src.indexOf('const guard = await instalarGuardEmision(context)')
  const j = src.indexOf('const tolerables = rutasAppTolerablesDe(exp.entrada)', i)
  const k = src.indexOf('if (tolerables.length > 0) tolerarRutasApp(guard, tolerables)', j)
  const p = src.indexOf('const page = await context.newPage()', i)
  assert.ok(i > 0 && j > i && k > j && p > k, 'tolerarRutasApp con las rutas de la entrada, tras instalar el guard y antes de la página')
  assert.equal(src.match(/tolerarRutasApp\(/g)?.length, 1)
})
