// Explorador 0.3.20 (29/10/2026) · worker, DOM VIVO. Páginas SINTÉTICAS (sin PII) servidas por `page.route` en los orígenes reales (el
// navegador de pruebas no sale a la red: los POST caen al guard del contexto, que los deja seguir —y fallan en el proxy muerto— o los aborta
// con `ERR_BLOCKED_BY_CLIENT`). Cada brazo que debe fallar, en rojo.
// 1) Fidelidade «Simulación»: el input submit «sin rótulo» lleva `value` VIVO («Siguiente»): lista cerrada de rótulos neutros.
// 2) Mapfre NSE: POST a `datosGenerales.jsf` con `formDG:fechaFirmaInputDate` (fecha) ya no se aborta; firmar de verdad, sí.
// 3) Allianz VMP: marca/modelo en un bootstrap-select (select OCULTO + botón sin texto): se inventaría el select y se elige.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { EmisionBloqueadaError, rutasAppTolerablesDe, validarRespuestaExplorador, type ElementoInventario, type InventarioDom, type MarcoInventario } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsar, pulsarExploracionAutorizada, pulsarGuardadoDialogoAutorizado, pulsarGuardadoPresupuesto, tolerarRutasApp, type GuardEmision } from '../src/guard.ts'
import { capturarInventarioExploracion } from '../src/inventario-dom.ts'
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

test('versión del explorador 0.3.25', () => assert.equal(EXPLORADOR_VERSION, '0.3.25'))

// ─── 1) Fidelidade ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const FI = 'fidelidade:particulares:vivienda'
const ORIGEN_FI = 'https://mediadores.fidelidade.es'
const RUTA_FI = '/OPI_ES_Vivienda/Simualtion.aspx'
const NAME = 'OPI_Theme_wt25$block$wtMainContent$FID_B2B_SIM_Pat_wt22$block$wtForm$FID_B2B_SIM_Pat_wtNextButton$block$wtInput$wtNextButton2'
const ID = NAME.replace(/\$/g, '_')
const ONCLICK = `OsAjax(arguments[0] || window.event,'${ID}','${NAME}','','__OSVSTATE,',''); return false;`
// Como el real: el `value` lo pone el servidor (el inventario solo ve `conValor`).
const PAGINA_FI = (value: string) => `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body>
  <form id="f" method="post" action="${RUTA_FI}">
    <h2>Simulación</h2>
    <label for="nom">Nombre y apellidos/Razón Social</label><input type="text" id="nom" name="OPI_Theme_wt25$block$wtMainContent$Nom">
    <input type="submit" id="${ID}" name="${NAME}" class="Button First Is_Default" value="${value}" onclick="${ONCLICK}">
  </form>
  <script>
    function OsAjax() {
      fetch(${JSON.stringify(RUTA_FI)}, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '__OSVSTATE=abc&__AJAX=1' })
        .catch(function () {}).then(function () { var x = document.getElementById(${JSON.stringify(ID)}); if (x) x.remove(); });
    }
  </script></body></html>`
const BOTON_FI = (page: Page) => page.locator(`[id="${ID}"]`)

async function capturaFi(page: Page): Promise<{ inventario: InventarioDom; marco: MarcoInventario; el: ElementoInventario; liberar: () => Promise<void> }> {
  const cap = (await capturarInventarioExploracion(page))!
  const marco = cap.inventario.marcos.find((m) => m.elementos.some((e) => e.tag === 'input' && e.type === 'submit'))!
  return { inventario: cap.inventario, marco, el: marco.elementos.find((e) => e.tag === 'input' && e.type === 'submit')!, liberar: cap.liberar }
}

test('0.3.20 · Fidelidade: input submit con value VIVO «Siguiente» → el validador lo acepta y el guard vivo deja UN clic y UN POST', async () => {
  const { context, page, guard } = await abrir(PAGINA_FI('Siguiente'), `${ORIGEN_FI}${RUTA_FI}`)
  try {
    const { inventario, marco, el, liberar } = await capturaFi(page)
    assert.equal(el.texto, undefined, 'el inventario no ve el value (como en real: solo conValor)')
    const v = validarRespuestaExplorador({ version: 1, pantalla: { nombre: 'X', tipo: 'formulario' }, acciones: [{ accion: 'avanzar', ref: el.ref, efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }], mapeo: [], motivo: null },
      { inventario, ramo: 'hogar', entrada: FI, datosReales: null, presupuestoEnCurso: false })
    assert.ok(v.ok, JSON.stringify(v))
    await pulsarExploracionAutorizada(page, guard, BOTON_FI(page), { entrada: FI, el, marco })
    await liberar()
    await page.waitForTimeout(300)
    assert.equal(posts().length, 1)
    assert.ok(!String(posts()[0].fallo).startsWith('net::ERR_BLOCKED_BY_CLIENT'), String(posts()[0].fallo))
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

test('0.3.20 · Fidelidade: rótulo vivo FUERA de la lista cerrada (o con acción final, en value/title/aria-label) → con_rotulo, sin POST', async () => {
  const prueba = async (nombre: string, value: string, antes: (p: Page) => Promise<unknown> = async () => undefined) => {
    const { context, page, guard } = await abrir(PAGINA_FI(value), `${ORIGEN_FI}${RUTA_FI}`)
    try {
      const { marco, el, liberar } = await capturaFi(page)
      await antes(page)
      const e = await pulsarExploracionAutorizada(page, guard, BOTON_FI(page), { entrada: FI, el, marco }).then(() => null, (x: unknown) => x)
      await liberar()
      assert.ok(e instanceof EmisionBloqueadaError && /con_rotulo/.test(e.message), `${nombre}: ${String(e)}`)
      assert.equal(posts().length, 0, nombre)
    } finally {
      await context.close()
    }
  }
  for (const v of ['Siguiente >>', 'Tarificar y contratar', 'Contratar', 'Guardar', 'Siguiente y confirmar', 'Simulación']) await prueba(`value «${v}»`, v)
  const set = (a: string, v: string) => (p: Page) => p.evaluate(([id, x, y]) => { document.getElementById(id)!.setAttribute(x, y) }, [ID, a, v])
  await prueba('title «Confirmar» con value neutro', 'Siguiente', set('title', 'Confirmar'))
  await prueba('aria-label «Emitir» con value neutro', 'Siguiente', set('aria-label', 'Emitir'))
})

// ─── 2) Mapfre NSE: fecha de firma en el cuerpo ─────────────────────────────────────────────────────────────────────────────────────
const MF = 'mapfre:automoviles:patinetes'
const ORIGEN_NSE = 'https://wmediadores.mapfre.com'
const URL_DG = `${ORIGEN_NSE}/EVT21_NSE_FWEB/app/emision/informacionGeneral/datosGenerales.jsf`
async function postNse(cuerpo: string) {
  const { context, page, guard } = await abrir('<!doctype html><html><body><form id="formDG"><h2>Datos generales</h2></form></body></html>', `${ORIGEN_NSE}/EVT21_NSE_FWEB/app/emision/busquedaProductos/busquedaProductos.jsf`)
  try {
    tolerarRutasApp(guard, rutasAppTolerablesDe(MF))
    await page.evaluate(([u, c]) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: c }).catch(() => undefined), [URL_DG, cuerpo])
    await page.waitForTimeout(200)
    return { violacion: guard.violacion(), fallo: posts()[0]?.fallo ?? null }
  } finally {
    await context.close()
  }
}

test('0.3.20 · Mapfre NSE: POST a datosGenerales con la FECHA de firma (fecha o vacía) → el guard no lo aborta (antes: «firm»)', async () => {
  for (const cuerpo of ['formDG=formDG&formDG%3AfechaFirmaInputDate=29%2F10%2F2026&formDG%3AfechaFirmaInputCurrentDate=10%2F2026&javax.faces.ViewState=j_id3',
    'formDG=formDG&formDG%3AfechaFirmaInputDate=&javax.faces.ViewState=j_id3']) {
    const r = await postNse(cuerpo)
    assert.equal(r.violacion, null, `${cuerpo}: ${String(r.violacion)}`)
    assert.ok(!String(r.fallo).startsWith('net::ERR_BLOCKED_BY_CLIENT'), `${cuerpo}: ${r.fallo}`)
  }
})

test('0.3.20 · Mapfre NSE: firmar de verdad en el cuerpo (botón, nombre o valor) → abortado', async () => {
  for (const cuerpo of ['formDG%3AbtnFirmar=1&formDG%3AfechaFirmaInputDate=29%2F10%2F2026', 'formDG%3AfechaFirmaInputDate=Firmar', 'formDG%3Afirma=1',
    'btnFirmar%3AfechaFirma=29%2F10%2F2026', 'formDG%3AfechaFirmaInputDate=29%2F10%2F2026&javax.faces.source=formDG%3AbtnFirmar']) {
    const r = await postNse(cuerpo)
    assert.ok(r.violacion instanceof EmisionBloqueadaError, cuerpo)
    assert.match(String(r.fallo), /^net::ERR_BLOCKED_BY_CLIENT/, cuerpo)
  }
})

// ─── 3) Allianz VMP: bootstrap-select (marca/modelo) ───────────────────────────────────────────────────────────────────────────────
const MP = 'allianz:autos:movilidad_personal'
const URL_VMP = 'https://www.e-pacallianz.com/drvp00/main/control.do'
/** bootstrap-select 1.6 (como el real: el botón hereda la clase `selectpicker`, el contenedor va JUSTO DESPUÉS del select oculto). */
const SP = (id: string, opciones: string) => `<select id="${id}" name="${id}" class="selectpicker" style="display:none" onchange="alCambiar(this)">${opciones}</select>
  <div class="btn-group bootstrap-select"><button type="button" class="btn dropdown-toggle selectpicker" data-id="${id}"><span class="filter-option"></span></button>
  <div class="dropdown-menu" style="display:none"><ul><li><a>Seleccione</a></li></ul></div></div>`
const PAGINA_VMP = `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body><form id="f" method="post" action="/drvp00/main/control.do">
  <h3>Datos del Vehículo</h3>
  <label id="VMPBean$matricula_label" for="VMPBean$matricula">Matrícula</label><input type="text" id="VMPBean$matricula" name="VMPBean$matricula">
  <label id="VMPBean$marca_label" for="VMPBean$marca">Marca</label>${SP('VMPBean$marca', '<option value="">Seleccione</option><option value="101">SEGWAY</option><option value="102">XIAOMI</option>')}
  <label id="VMPBean$modelo_label" for="VMPBean$modelo">Modelo</label>${SP('VMPBean$modelo', '<option value="">Seleccione</option>')}
  <select id="oculto" name="oculto" style="display:none"><option value="1">x</option></select>
  </form><script>
  function alCambiar(s) {
    var b = s.nextElementSibling.querySelector('button'); b.querySelector('span').textContent = s.options[s.selectedIndex].text;
    if (s.id === 'VMPBean$marca' && s.value === '102') document.getElementById('VMPBean$modelo').innerHTML = '<option value="">Seleccione</option><option value="7">ELECTRIC SCOOTER 4 PRO</option><option value="8">ELECTRIC SCOOTER 4</option>';
  }
  </script></body></html>`
const elementos = (inv: InventarioDom) => inv.marcos.flatMap((m) => m.elementos)
const refDe = (inv: InventarioDom, id: string) => elementos(inv).find((e) => e.id === id && e.ref)!.ref!
const respuesta = (acciones: unknown[]) => ({ version: 1, pantalla: { nombre: 'Datos del Vehículo', tipo: 'formulario' }, acciones, mapeo: [], motivo: null })

function contexto(page: Page, guard: GuardEmision, guion: (inv: InventarioDom, n: number) => unknown): ContextoBucle {
  let n = 0
  return {
    trabajoId: '00000000-0000-4000-8000-000000000320', compania: 'allianz', ramo: 'patinete', entrada: MP,
    conDatosReales: false, riesgo: {}, env: {}, guard,
    pulsar: (b) => pulsar(b, guard),
    pulsarAutorizado: (b, el, marco) => pulsarExploracionAutorizada(page, guard, b, { entrada: MP, el, marco }),
    pulsarGuardado: (b, el, pantalla, trasClic) => pulsarGuardadoPresupuesto(page, guard, b, { el, pantalla }, trasClic),
    pulsarGuardadoDialogo: (b, el, marco) => pulsarGuardadoDialogoAutorizado(page, guard, b, { entrada: MP, el, marco }),
    topePdfMs: 2_000,
    esperaRepintadoMs: 50,
    pausaAccion: async () => undefined,
    pedirPaso: async (c): Promise<RespuestaPaso> => ({ estado: 'ok', respuesta: await guion(c.inventario, ++n), leaseHasta: null }),
    log: () => undefined,
  }
}

test('0.3.20 · Allianz VMP: el inventario saca el select OCULTO del bootstrap-select (selectpicker, opciones) y no su botón sin texto; otro select oculto, no', async () => {
  const { context, page } = await abrir(PAGINA_VMP, URL_VMP)
  try {
    const cap = (await capturarInventarioExploracion(page))!
    const els = elementos(cap.inventario)
    const marca = els.find((e) => e.id === 'VMPBean$marca')!
    assert.equal(marca.tag, 'select')
    assert.equal(marca.selectpicker, true)
    assert.equal(marca.etiqueta, 'Marca')
    assert.deepEqual(marca.opciones?.map((o) => o.texto), ['Seleccione', 'SEGWAY', 'XIAOMI'])
    assert.ok(!els.some((e) => e.tag === 'button' && /dropdown-toggle/.test(e.clase ?? '')), 'los botones del bootstrap-select no salen')
    assert.ok(!els.some((e) => e.id === 'oculto'), 'un select oculto suelto no sale')
    await cap.liberar()
  } finally {
    await context.close()
  }
})

test('0.3.20 · Allianz VMP: elegir marca (XIAOMI) → el portal carga los modelos → elegir modelo; sin violación', async () => {
  const { context, page, guard } = await abrir(PAGINA_VMP, URL_VMP)
  try {
    let modelosVistos: string[] = []
    const fin = await bucleExploracion(page, contexto(page, guard, (inv, n) => {
      if (n === 1) return respuesta([{ accion: 'elegir', ref: refDe(inv, 'VMPBean$marca'), opcion: { valor: '102' } }, { accion: 'rellenar', ref: refDe(inv, 'VMPBean$matricula'), dato: 'tomador.nombre' }])
      if (n === 2) {
        modelosVistos = (elementos(inv).find((e) => e.id === 'VMPBean$modelo')?.opciones ?? []).map((o) => o.texto ?? '')
        return respuesta([{ accion: 'elegir', ref: refDe(inv, 'VMPBean$modelo'), opcion: { valor: '7' } }])
      }
      return respuesta([{ accion: 'parar', motivo: 'ambiguo' }])
    }))
    assert.equal(fin.motivo, 'ambiguo', JSON.stringify(fin))
    assert.ok(modelosVistos.includes('ELECTRIC SCOOTER 4 PRO'), `tras cortar el lote, el paso 2 ve los modelos: ${modelosVistos.join('|')}`)
    assert.equal(await page.locator('[id="VMPBean$marca"]').inputValue(), '102')
    assert.equal(await page.locator('[id="VMPBean$matricula"]').inputValue(), '', 'el lote se cortó tras el selectpicker: lo que seguía no se ejecutó')
    assert.equal(await page.locator('[id="VMPBean$modelo"]').inputValue(), '7')
    assert.equal(await page.locator('[data-id="VMPBean$marca"] span').textContent(), 'XIAOMI')
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

test('0.3.20 · Allianz VMP: si VIVO el select ya no es el de un bootstrap-select (botón quitado, select visible o dos botones) → no se elige', async () => {
  const cambios: [string, (p: Page) => Promise<unknown>][] = [
    ['sin contenedor', (p) => p.evaluate(() => document.querySelector('[id="VMPBean$marca"]')!.nextElementSibling!.remove())],
    ['select visible', (p) => p.evaluate(() => { (document.querySelector('[id="VMPBean$marca"]') as HTMLElement).style.display = 'block' })],
    ['botón oculto', (p) => p.evaluate(() => { (document.querySelector('[data-id="VMPBean$marca"]') as HTMLElement).style.display = 'none' })],
    ['dos botones', (p) => p.evaluate(() => { const c = document.querySelector('[id="VMPBean$marca"]')!.nextElementSibling!; c.appendChild(c.querySelector('button')!.cloneNode(true)) })],
  ]
  for (const [nombre, cambio] of cambios) {
    const { context, page, guard } = await abrir(PAGINA_VMP, URL_VMP)
    try {
      const fin = await bucleExploracion(page, contexto(page, guard, async (inv, n) => {
        if (n === 1) {
          await cambio(page)
          return respuesta([{ accion: 'elegir', ref: refDe(inv, 'VMPBean$marca'), opcion: { valor: '102' } }])
        }
        return respuesta([{ accion: 'parar', motivo: 'ambiguo' }])
      }))
      assert.notEqual(fin.motivo, 'resultado', nombre)
      assert.equal(await page.locator('[id="VMPBean$marca"]').inputValue(), '', `${nombre}: no se eligió`)
    } finally {
      await context.close()
    }
  }
})
