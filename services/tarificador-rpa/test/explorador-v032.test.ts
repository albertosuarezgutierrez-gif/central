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
import { EmisionBloqueadaError, esAvanceAutorizado, MAX_TITULOS_MARCO, rutasAppTolerablesDe, type InventarioDom } from '@central/module-tarificacion'
import { descripcionParaTest, INDICES_URL_DESCRIPCION, tolerarRutasApp, cerrarDialogoTerminoEpac, cerrarFaseEntrada, instalarGuardEmision, pulsarMenuOfertaNseMapfre, MAX_AVANCES_POR_ID, precioVistoEn, registrarPrecioVisto, pulsar, pulsarAccesoNseMapfre, pulsarExploracionAutorizada, pulsarGuardadoDialogoAutorizado, pulsarGuardadoPresupuesto, type GuardEmision } from '../src/guard.ts'
import { capturarInventarioExploracion } from '../src/inventario-dom.ts'
import { ErrorFronteraEmision } from '../src/guard.ts'
import { bucleExploracion, EXPLORADOR_VERSION, finDeError, notaFronteraBancaria, type ContextoBucle } from '../src/explorador.ts'
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
let validarNif = false
let validarTipoDoc = false
let browser: Browser

before(async () => {
  servidor = createServer((req, res) => {
    let cuerpo = ''
    req.on('data', (c) => { cuerpo += c })
    req.on('end', () => {
      const ruta = (req.url ?? '/').split('?')[0]
      peticiones.push({ metodo: req.method ?? 'GET', ruta, cuerpo })
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      if (ruta === '/valida-nif') return void setTimeout(() => res.end('ok'), 300)
      if (ruta === '/drvp00/SEAServlet') return void res.end(req.method === 'POST' ? ((validarNif && !/tomadorValidado=1/.test(cuerpo)) || (validarTipoDoc && !/IntervinientesBean%24nifTomador_tipoDoc=N(&|$)/.test(cuerpo)) ? PAGINA('<p>NIF del tomador no válido</p>') : RESULTADO) : figuras)
      if (ruta === '/drvp00/main/control.do') return void res.end(RESULTADO)
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

/** 0.3.13: el «Aceptar» de ePAC envía el POST a `/drvp00/main/control.do` (real 28/10/2026). `action` y campos ocultos del cuerpo variables. */
async function avanzarHacia(action: string, ocultos = ''): Promise<{ violacion: unknown; posts: Peticion[]; fallo: unknown }> {
  figuras = FIGURAS().replace('action="/drvp00/SEAServlet">', `action="${action}">${ocultos}`)
  const { context, page, guard } = await abrir('/drvp00/SEAServlet')
  try {
    const cap = (await capturarInventarioExploracion(page))!
    const marco = cap.inventario.marcos[0]
    const el = marco.elementos.find((e) => e.id === 'btnAceptar')!
    let fallo: unknown = null
    await pulsarExploracionAutorizada(page, guard, page.locator('#btnAceptar'), { entrada: MP, el, marco }).catch((e) => { fallo = e })
    await cap.liberar()
    return { violacion: guard.violacion(), posts: peticiones.filter((p) => p.metodo === 'POST'), fallo }
  } finally {
    await context.close()
  }
}

test('0.3.13 · ePAC: POST a /drvp00/main/control.do con cuerpo normal = permitido', async () => {
  const r = await avanzarHacia('/drvp00/main/control.do', '<input type="hidden" name="paso" value="2">')
  assert.equal(r.violacion, null, String(r.fallo))
  assert.equal(r.posts.length, 1)
  assert.equal(r.posts[0].ruta, '/drvp00/main/control.do')
})

for (const [nombre, oculto] of [
  ['emitir', '<input type="hidden" name="accion" value="emitir">'],
  ['confirmar', '<input type="hidden" name="accion" value="confirmar">'],
  ['firmar', '<input type="hidden" name="accion" value="firmar">'],
  ['contratar', '<input type="hidden" name="accion" value="contratar">'],
  ['validar_aceptar', '<input type="hidden" name="evento" value="validar_aceptar()">'],
  ['op=emitir (clave que no es de acción)', '<input type="hidden" name="op" value="emitir">'],
  ['btnEmitir (nombre del botón)', '<input type="hidden" name="btnEmitir" value="1">'],
] as const) {
  test(`0.3.13 · ePAC: POST a control.do con cuerpo de ${nombre} = bloqueado, no llega al servidor`, async () => {
    const r = await avanzarHacia('/drvp00/main/control.do', oculto)
    assert.notEqual(r.violacion, null, 'debía registrarse una violación')
    assert.equal(r.posts.length, 0)
  })
}

test('0.3.13 · ePAC: control.do en OTRO host = bloqueado; otra ruta del mismo host (/drvp00/main/otro.do) también', async () => {
  const otroHost = await avanzarHacia(`${base.replace('127.0.0.1', 'localhost')}/drvp00/main/control.do`, '<input type="hidden" name="paso" value="2">')
  assert.notEqual(otroHost.violacion, null)
  assert.equal(otroHost.posts.length, 0)
  const otraRuta = await avanzarHacia('/drvp00/main/otro.do', '<input type="hidden" name="paso" value="2">')
  assert.notEqual(otraRuta.violacion, null)
  assert.equal(otraRuta.posts.length, 0)
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

test('0.3.14 · títulos RECORTADOS en el inventario: el validador tolera #btnAceptar, pero un título prohibido MÁS ALLÁ del nº20 (mismo marco) lo bloquea VIVO', async () => {
  for (const prohibido of ['<h2>Revisión y emisión</h2>', '<h3>Resumen</h3>', '<table><tr><th>Forma de pago</th></tr></table>', '<legend>Formalización</legend>']) {
    figuras = FIGURAS()
    const { context, page, guard } = await abrir('/drvp00/SEAServlet')
    try {
      // 25 cabeceras inocentes ANTES (orden del DOM) → la lista del inventario llega en el tope y el prohibido no entra en ella.
      await page.evaluate((p) => { const d = document.createElement('div'); d.innerHTML = '<table>' + Array.from({ length: 25 }, (_, k) => `<tr><th>Cabecera ${k}</th></tr>`).join('') + '</table>' + p; document.body.appendChild(d) }, prohibido)
      const cap = (await capturarInventarioExploracion(page))!
      const marco = cap.inventario.marcos.find((m) => m.elementos.some((e) => e.id === 'btnAceptar'))!
      const el = marco.elementos.find((e) => e.id === 'btnAceptar')!
      assert.ok((marco.titulos?.length ?? 0) >= MAX_TITULOS_MARCO, `${prohibido}: inventario recortado`)
      assert.ok(!(marco.titulos ?? []).some((t) => /revisi|resumen|pago|formaliz/i.test(t)), `${prohibido}: el prohibido no llegó al inventario`)
      assert.equal(esAvanceAutorizado(MP, el, marco), true, `${prohibido}: el validador tolera el recorte`)
      const e = await pulsarExploracionAutorizada(page, guard, page.locator('#btnAceptar'), { entrada: MP, el, marco }).then(() => null, (x: unknown) => x)
      await cap.liberar()
      assert.ok(e instanceof EmisionBloqueadaError && /título vivo/.test(e.message), `${prohibido}: ${String(e)}`)
      assert.ok(!peticiones.some((p) => p.metodo === 'POST'), prohibido)
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

// ─── Revisión 0.3.5 (PR #5217) ───────────────────────────────────────────────────────────────────────────

test('0.3.5b · ruta tolerada: cuerpo con botón JSF / nombre de parámetro de emisión → abortado; navegación NSE normal → pasa', async () => {
  for (const [cuerpo, permitido] of [
    ['formEmision:btnEmitir=formEmision:btnEmitir', false],
    ['javax.faces.source=form:btnContratar', false],
    ['javax.faces.source=form:btnSiguiente&formEmision:campo=1&javax.faces.partial.render=formEmision', true],
  ] as const) {
    const { context, page, guard } = await abrir('/drvp00/SEAServlet')
    try {
      tolerarRutasApp(guard, rutasAppTolerablesDe('mapfre:automoviles:patinetes'))
      await postA(page, CARGA, cuerpo)
      assert.equal(guard.violacion() === null, permitido, `${cuerpo}: ${String(guard.violacion())}`)
    } finally {
      await context.close()
    }
  }
})

test('0.3.5b · solo los descriptores URL se neutralizan: posiciones de href/formaction/ancestros, y un texto o title con la URL sigue bloqueando', async () => {
  landing = PAGINA(`<a id="a0" href="${CARGA}">x</a>
    <button id="b0" formaction="${CARGA}">y</button>
    <a href="${CARGA}"><span id="s1">uno</span></a>
    <a href="${CARGA}"><b><span id="s2">dos</span></b></a>
    <a href="${CARGA}"><b><i><span id="s3">tres</span></i></b></a>
    <a id="t1" href="#">${CARGA}</a><a id="t2" href="#" title="${CARGA}">z</a>`)
  const { context, page, guard } = await abrir('/landing')
  try {
    const pos = async (sel: string) => (await descripcionParaTest(page.locator(sel))).map((d, i) => (d === CARGA ? i : -1)).filter((i) => i >= 0)
    assert.deepEqual(await pos('#a0'), [6])
    assert.deepEqual(await pos('#b0'), [8])
    assert.deepEqual(await pos('#s1'), [15])
    assert.deepEqual(await pos('#s2'), [19])
    assert.deepEqual(await pos('#s3'), [23])
    assert.deepEqual([...INDICES_URL_DESCRIPCION], [6, 8, 15, 19, 23])
    tolerarRutasApp(guard, rutasAppTolerablesDe('mapfre:automoviles:patinetes'))
    await page.evaluate(() => document.querySelectorAll('a,button').forEach((x) => x.addEventListener('click', (e) => e.preventDefault())))
    for (const sel of ['#a0', '#s3']) await pulsar(page.locator(sel), guard)
    for (const sel of ['#t1', '#t2']) await assert.rejects(pulsar(page.locator(sel), guard), EmisionBloqueadaError, sel)
  } finally {
    await context.close()
  }
})

// ─── 0.3.6 (real 28/10/2026 15:17, main-301931b) ────────────────────────────────────────────────────────────

test('versión 0.3.15', () => assert.equal(EXPLORADOR_VERSION, '0.3.15'))

/** ePAC valida el NIF al SALIR del campo (change → petición asíncrona → campo oculto); «Aceptar» en el mismo lote llegaba antes. */
const FIGURAS_NIF = PAGINA(`
  <form id="f" method="post" action="/drvp00/SEAServlet">
    <table><tr><td>Tipo Doc. Tomador</td><td><input type="text" id="IntervinientesBean$nifTomador_doc" name="nif"><input type="hidden" id="tv" name="tomadorValidado" value="0"></td></tr></table>
  </form>
  <button type="button" id="btnAceptar" onclick="eventoSiguiente()">Aceptar</button>
  <script>
    document.getElementById('IntervinientesBean$nifTomador_doc').addEventListener('change', () => { fetch('/valida-nif').then(() => { document.getElementById('tv').value = '1' }) })
    function eventoSiguiente(){ document.getElementById('f').submit() }
  </script>`)

test('0.3.6 · Allianz: el NIF del tomador se valida (blur + espera de red) ANTES de «Aceptar» del mismo lote', async () => {
  figuras = FIGURAS_NIF
  validarNif = true
  const { context, page, guard } = await abrir('/drvp00/SEAServlet')
  try {
    const k = { ...contexto(page, guard, (inv) => {
      const imp = inv.marcos.flatMap((m) => m.importes ?? [])
      if (imp.length > 0) return respuesta([{ accion: 'terminar', refsPrecio: [imp[0].ref] }], 'resultado')
      const nif = elementos(inv).find((e) => e.id === 'IntervinientesBean$nifTomador_doc')
      const btn = elementos(inv).find((e) => e.id === 'btnAceptar')
      if (!nif || !btn) return respuesta([{ accion: 'parar', motivo: 'ambiguo' }])
      return respuesta([
        ...(nif.conValor ? [] : [{ accion: 'rellenar', ref: nif.ref, dato: 'tomador.nif' }]),
        { accion: 'avanzar', ref: btn.ref, efectoEsperado: 'siguiente_pantalla', confianza: 'alta' },
      ])
    }), riesgo: { tomador: { nif: '00000000T' } }, esperaRepintadoMs: 600 }
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'resultado', JSON.stringify(fin))
    assert.match(peticiones.filter((p) => p.metodo === 'POST').map((p) => p.cuerpo).join('|'), /tomadorValidado=1/)
  } finally {
    validarNif = false
    await context.close()
  }
})

test('0.3.6 · Mapfre NSE (real 15:19): «Oferta / Contratación» con href a cargaOperacion.jsf pasa por su puerta con las rutas toleradas', async () => {
  menuNse = MENU_NSE(`<a id="m8" href="${CARGA}">Oferta / Contratación</a>`).replace('<a href="#" id="m2">Oferta / Contratación</a>', '')
  const { context, page, guard } = await abrir('/EVT21_NSE_FWEB/inicio.jsp')
  try {
    tolerarRutasApp(guard, rutasAppTolerablesDe('mapfre:automoviles:patinetes'))
    await pulsarMenuOfertaNseMapfre(page.locator('#m8'), guard, 'mapfre')
    assert.deepEqual(await page.evaluate(() => (window as unknown as { ido: string[] }).ido), ['Oferta / Contratación'])
  } finally {
    await context.close()
  }
})

test('0.3.6 · con la MISMA URL tolerada: «Contratar», «Confirmar», «Firmar»… y otro origen siguen bloqueados', async () => {
  const casos: [string, string, (page: Page, guard: GuardEmision) => Promise<void>][] = [
    ['Contratar', CARGA, (page, guard) => pulsar(page.locator('#l'), guard)],
    ['Confirmar', CARGA, (page, guard) => pulsar(page.locator('#l'), guard)],
    ['Grabar', CARGA, (page, guard) => pulsar(page.locator('#l'), guard)],
    ['Nueva oferta', 'https://otro.example.test/EVT21_NSE_FWEB/app/emision/cargaOperacion/cargaOperacion.jsf', (page, guard) => pulsar(page.locator('#l'), guard)],
  ]
  for (const [texto, href, accion] of casos) {
    landing = PAG_NSE(href, texto)
    const { context, page, guard } = await abrir('/landing')
    try {
      tolerarRutasApp(guard, rutasAppTolerablesDe('mapfre:automoviles:patinetes'))
      await assert.rejects(accion(page, guard), EmisionBloqueadaError, texto)
      assert.equal(await page.evaluate(() => (window as unknown as { pulsado?: number }).pulsado ?? 0), 0, texto)
    } finally {
      await context.close()
    }
  }
  // Menú «Oferta / Contratación» con href de OTRO origen: bloqueado.
  menuNse = MENU_NSE('<a id="m9" href="https://otro.example.test/EVT21_NSE_FWEB/app/emision/cargaOperacion/cargaOperacion.jsf">Oferta / Contratación</a>').replace('<a href="#" id="m2">Oferta / Contratación</a>', '')
  const { context, page, guard } = await abrir('/EVT21_NSE_FWEB/inicio.jsp')
  try {
    tolerarRutasApp(guard, rutasAppTolerablesDe('mapfre:automoviles:patinetes'))
    await assert.rejects(pulsarMenuOfertaNseMapfre(page.locator('#m9'), guard, 'mapfre'), EmisionBloqueadaError)
  } finally {
    await context.close()
  }
})

test('0.3.7 · inventario: un campo INVÁLIDO lleva su mensaje de error y el marco los avisos del portal (informe de incidencias de ePAC)', async () => {
  figuras = PAGINA(`<table><tr><td><input type="text" id="IntervinientesBean$nifTomador_doc" class="ui-state-error" aria-invalid="true"><span class="errorMessage">El tomador no existe en cartera</span></td></tr></table>
    <div id="dataErrorSection"><table><tr class="rowAppErrorTextBlock"><td>Debe seleccionar el tipo de documento del tomador</td></tr></table></div>
    <input type="text" id="otro">`)
  const { context, page } = await abrir('/drvp00/SEAServlet')
  try {
    const cap = (await capturarInventarioExploracion(page))!
    const m = cap.inventario.marcos[0]
    const nif = m.elementos.find((e) => e.id === 'IntervinientesBean$nifTomador_doc')!
    assert.equal(nif.invalido, true)
    assert.equal(nif.mensajeError, 'El tomador no existe en cartera')
    assert.equal(m.elementos.find((e) => e.id === 'otro')!.mensajeError, undefined)
    assert.deepEqual(m.avisosPortal, ['Debe seleccionar el tipo de documento del tomador'])
    await cap.liberar()
  } finally {
    await context.close()
  }
})

// ─── 0.3.8 (real 28/10/2026 18:31-18:33, main-4549992) ──────────────────────────────────────────────────────

/** ePAC «Figuras Intervinientes»: «Tipo Doc. Tomador» es un select OCULTO (`<x>_tipoDoc`) tras un botón sin texto; vacío → NIF inválido. */
const FIGURAS_TIPODOC = PAGINA(`
  <form id="f" method="post" action="/drvp00/SEAServlet">
    <label id="IntervinientesBean$nifTomador_tipoDoc_label">Tipo Doc. Tomador</label>
    <select id="IntervinientesBean$nifTomador_tipoDoc" name="IntervinientesBean$nifTomador_tipoDoc" style="display:none"><option value="">Seleccione</option><option value="N">NIF</option><option value="E">NIE</option><option value="C">CIF</option><option value="P">Pasaporte</option></select>
    <button type="button" class="dropdown-toggle"><span class="filter-option"></span></button>
    <input type="text" id="IntervinientesBean$nifTomador_doc" name="IntervinientesBean$nifTomador_doc">
  </form>
  <button type="button" id="btnAceptar" onclick="eventoSiguiente()">Aceptar</button>
  <script>function eventoSiguiente(){ document.getElementById('f').submit() }</script>`)

test('0.3.8 · Allianz: antes de teclear el NIF se elige su «Tipo Doc.» (NIF por la forma del documento) en el desplegable pareado', async () => {
  figuras = FIGURAS_TIPODOC
  validarTipoDoc = true
  const { context, page, guard } = await abrir('/drvp00/SEAServlet')
  try {
    const k = { ...contexto(page, guard, (inv) => {
      const imp = inv.marcos.flatMap((m) => m.importes ?? [])
      if (imp.length > 0) return respuesta([{ accion: 'terminar', refsPrecio: [imp[0].ref] }], 'resultado')
      const nif = elementos(inv).find((e) => e.id === 'IntervinientesBean$nifTomador_doc')
      const btn = elementos(inv).find((e) => e.id === 'btnAceptar')
      if (!nif || !btn) return respuesta([{ accion: 'parar', motivo: 'ambiguo' }])
      return respuesta([{ accion: 'rellenar', ref: nif.ref, dato: 'tomador.nif' }, { accion: 'avanzar', ref: btn.ref, efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }])
    }), riesgo: { tomador: { nif: '00000000T' } }, esperaRepintadoMs: 200 }
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'resultado', JSON.stringify(fin))
    assert.match(peticiones.filter((p) => p.metodo === 'POST').map((p) => p.cuerpo).join('|'), /nifTomador_tipoDoc=N/)
  } finally {
    validarTipoDoc = false
    await context.close()
  }
})

test('0.3.8 · Mapfre NSE: el error del guard en la ruta tolerada dice QUÉ parámetro del cuerpo casó (nunca su valor)', async () => {
  const { context, page, guard } = await abrir('/drvp00/SEAServlet')
  try {
    tolerarRutasApp(guard, rutasAppTolerablesDe('mapfre:automoviles:patinetes'))
    await postA(page, 'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/busquedaProductos/busquedaProductos.jsf', 'javax.faces.partial.render=formBusqueda%3AdlgConfirmacion&secreto=12345678Z')
    const v = guard.violacion()
    assert.ok(v instanceof EmisionBloqueadaError)
    assert.match(v!.message, /parámetro «javax\.faces\.partial\.render» casa con «confirm»/)
    assert.ok(!/12345678Z|dlgConfirmacion/.test(v!.message), 'ni valores ni el id completo')
  } finally {
    await context.close()
  }
})

test('0.3.11 · frontera bancaria: la ETIQUETA del campo (≤60, nunca el valor) sale en la nota del fin', () => {
  const f = finDeError(new ErrorFronteraEmision('IBAN'))
  assert.equal(f.motivo, 'cerca_de_emision')
  assert.equal(f.detalle, 'frontera_cuenta_bancaria')
  assert.equal(f.nota, 'frontera bancaria: campo «IBAN»')
  assert.equal(notaFronteraBancaria('x'.repeat(200)), null)
})

test('0.3.11 · frontera bancaria: la nota lleva SOLO el nombre canónico, nunca el texto libre (IBAN en pantalla)', () => {
  const libre = 'Domiciliar en ES91 2100 0418 4502 0005 1332'
  assert.equal(notaFronteraBancaria(libre), 'frontera bancaria: campo «Domiciliación»')
  const f = finDeError(new ErrorFronteraEmision(libre))
  assert.equal(f.nota, 'frontera bancaria: campo «Domiciliación»')
  assert.ok(!/\d/.test(f.nota ?? ''), f.nota)
  assert.equal(finDeError(new ErrorFronteraEmision('algo sin campo conocido')).nota, undefined)
})

test('0.3.12 · parada por TÍTULO (titulo:contrat): el log lleva SOLO el código del detalle, nunca el texto de la página', async () => {
  figuras = PAGINA('<h3>Contratar el seguro de Juan Pérez García</h3><table><tr><td>Prima</td><td>1</td></tr></table>')
  const { context, page, guard } = await abrir('/drvp00/SEAServlet')
  try {
    const logs: [string, Record<string, unknown> | undefined][] = []
    const k = { ...contexto(page, guard, () => respuesta([{ accion: 'parar', motivo: 'ambiguo' }])), log: (ev: string, datos?: Record<string, unknown>) => { logs.push([ev, datos]) } }
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'cerca_de_emision', JSON.stringify(fin))
    assert.equal(fin.detalle, 'titulo:contrat')
    const parada = logs.find(([ev]) => ev === 'exploracion_parada')
    assert.equal(parada?.[1]?.detalle, 'titulo:contrat')
    const linea = JSON.stringify(logs)
    // El texto de la página llega normalizado (minúsculas, sin tildes): se compara así.
    assert.ok(!/juan|perez|contrataci/.test(linea.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()), linea)
  } finally {
    await context.close()
  }
})
