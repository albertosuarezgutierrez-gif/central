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
import { EmisionBloqueadaError, type InventarioDom } from '@central/module-tarificacion'
import { cerrarFaseEntrada, instalarGuardEmision, MAX_AVANCES_POR_ID, precioVistoEn, registrarPrecioVisto, pulsar, pulsarAccesoNseMapfre, pulsarExploracionAutorizada, pulsarGuardadoDialogoAutorizado, pulsarGuardadoPresupuesto, type GuardEmision } from '../src/guard.ts'
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

test('versión del explorador 0.3.3', () => assert.equal(EXPLORADOR_VERSION, '0.3.3'))

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
