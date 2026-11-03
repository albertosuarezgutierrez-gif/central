// Explorador 0.3.24 (30/10/2026) · worker, DOM VIVO. Páginas SINTÉTICAS (sin PII) servidas por `page.route` en los orígenes reales.
// 1) Mapfre NSE (a13b990c…): tras un avance JSF el portal repintó y el nodo marcado ya no existía: `locator.evaluate: Timeout 30000ms`
//    (la descripción del guard en `pulsar`) → error_portal. Ahora: comprobación corta de existencia antes de actuar y, si un timeout llega
//    con el nodo ya desaparecido, se corta el lote y se re-inventaría la pantalla actual (nada se pulsó). Ni una violación del guard ni un
//    timeout con el nodo presente se tragan.
// 2) Fidelidade (2f0d9b15…): tras `marcar`, comprobación VIVA de que quedó marcado; si no, UN clic en su <label for> por el guard.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { EmisionBloqueadaError, type InventarioDom } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsar, pulsarExploracionAutorizada, pulsarGuardadoDialogoAutorizado, pulsarGuardadoPresupuesto, type GuardEmision } from '../src/guard.ts'
import { asegurarMarcado, bucleExploracion, esTimeoutPlaywright, EXPLORADOR_VERSION, refDesaparecida, type ContextoBucle } from '../src/explorador.ts'
import { sondearOverlaysCarga } from '../src/overlay-carga.ts'
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
    trabajoId: '00000000-0000-4000-8000-000000000324', compania, ramo, entrada,
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

test('versión del explorador 0.3.27', () => assert.equal(EXPLORADOR_VERSION, '0.3.27'))

// ─── 1) Mapfre NSE: el nodo marcado desaparece (repintado JSF) ──────────────────────────────────────────────────────────────────────
const MF = 'mapfre:automoviles:patinetes'
const URL_OBJ = 'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/infObjetoAsegurado/infObjetoAseguradoAutos.jsf'
/** `repintarConOverlay`: un overlay de carga tapa la pantalla y, 1 s después de que el explorador MARQUE el botón, el portal lo sustituye por
 *  uno nuevo (mismo id, sin la marca) y quita el overlay. Determinista: arranca con la marca, no por reloj absoluto. */
const PAGINA_NSE = (repintarConOverlay: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body>
  <form id="formObjAseg" onsubmit="return false"><h2>Datos del vehículo (patinete)</h2>
    <label for="cp">Código postal</label><input type="text" id="cp" name="formObjAseg:cp">
    <span id="caja"><button type="button" id="sig" onclick="window.__clics=(window.__clics||0)+1">Siguiente</button></span>
  </form>
  ${repintarConOverlay ? `<footer><div id="ov" class="Feedback_AjaxWait loading_overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.2);z-index:9999"></div></footer>
  <script>
    var hecho = false
    new MutationObserver(function () {
      if (hecho || !document.querySelector('#sig[data-explorador-ref]')) return
      hecho = true
      setTimeout(function () {
        document.getElementById('caja').innerHTML = '<button type="button" id="sig" onclick="window.__clics=(window.__clics||0)+1">Siguiente</button>'
        document.getElementById('ov').remove()
      }, 1000)
    }).observe(document.body, { attributes: true, subtree: true })
  </script>` : ''}
  </body></html>`

type Ev = { ev: string; datos: Record<string, unknown> }
/** `pulsarEnvuelto`: sustituye a `k.pulsar` (recibe el botón y el pulsar real del guard). */
async function avanzarNse(repintarConOverlay: boolean, pulsarEnvuelto?: (p: Page, b: Parameters<ContextoBucle['pulsar']>[0], real: ContextoBucle['pulsar']) => Promise<void>) {
  const { context, page, guard } = await abrir(PAGINA_NSE(repintarConOverlay), URL_OBJ)
  try {
    page.setDefaultTimeout(2_000)
    const eventos: Ev[] = []
    const pedidos: { n: number; incidencias: unknown }[] = []
    const real: ContextoBucle['pulsar'] = (b) => pulsar(b, guard)
    const k = contexto(page, guard, MF, 'patinete', 'mapfre', (inv, n) =>
      n === 1 ? respuesta([{ accion: 'avanzar', ref: refDe(inv, 'sig'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }]) : respuesta([{ accion: 'parar', motivo: 'ambiguo' }]), {
      topeOverlayMs: 10_000,
      log: (ev: string, datos?: unknown) => { eventos.push({ ev, datos: (datos ?? {}) as Record<string, unknown> }) },
      ...(pulsarEnvuelto ? { pulsar: (b) => pulsarEnvuelto(page, b, real) } : {}),
    })
    const pedir = k.pedirPaso
    k.pedirPaso = async (c) => { pedidos.push({ n: pedidos.length + 1, incidencias: c.incidencias ?? null }); return pedir(c) }
    const fin = await bucleExploracion(page, k)
    return { fin, eventos, pedidos, clics: await page.evaluate(() => (window as unknown as { __clics?: number }).__clics ?? 0), violacion: guard.violacion() }
  } finally {
    await context.close()
  }
}
const desaparecidas = (e: Ev[]) => e.filter((x) => x.ev === 'exploracion_ref_desaparecida').map((x) => x.datos.momento)

test('0.3.24 · Mapfre NSE: el botón se repinta mientras se espera al overlay → se comprueba ANTES de actuar, se re-inventaría y sigue (sin error_portal)', async () => {
  const r = await avanzarNse(true)
  assert.equal(r.fin.error, null, JSON.stringify(r.fin))
  assert.equal(r.fin.motivo, 'ambiguo', JSON.stringify(r.fin))
  assert.deepEqual(desaparecidas(r.eventos), ['antes'])
  assert.equal(r.pedidos.length, 2, 'la pantalla actual se re-inventaría y se pide otro paso')
  assert.match(JSON.stringify(r.pedidos[1].incidencias), /"accion":"avanzar".*"causa":"lote_cortado".*"corte":"repintado"/)
  assert.equal(r.clics, 0, 'no se pulsó ni el viejo ni el nuevo')
  assert.equal(r.violacion, null)
})

test('0.3.24 · Mapfre NSE real: el nodo desaparece DURANTE la acción (timeout de la evaluate del guard) → se re-inventaría, nada pulsado', async () => {
  const r = await avanzarNse(false, async (p, b, real) => {
    await p.evaluate(() => { document.getElementById('caja')!.innerHTML = '<button type="button" id="sig" onclick="window.__clics=(window.__clics||0)+1">Siguiente</button>' })
    await real(b)
  })
  assert.equal(r.fin.error, null, JSON.stringify(r.fin))
  assert.equal(r.fin.motivo, 'ambiguo', JSON.stringify(r.fin))
  assert.deepEqual(desaparecidas(r.eventos), ['durante'])
  assert.equal(r.pedidos.length, 2)
  assert.equal(r.clics, 0)
})

test('0.3.24 · un timeout con el nodo TODAVÍA presente no se traga (error como siempre)', async () => {
  const r = await avanzarNse(false, async () => {
    const e = new Error('locator.evaluate: Timeout 2000ms exceeded.')
    e.name = 'TimeoutError'
    throw e
  })
  assert.equal(r.fin.motivo, 'error_portal', JSON.stringify(r.fin))
  assert.equal(r.pedidos.length, 1)
  assert.deepEqual(desaparecidas(r.eventos), [])
})

test('0.3.24 · una violación del guard con el nodo desaparecido NO se convierte en re-inventario', async () => {
  const r = await avanzarNse(false, async (p) => {
    await p.evaluate(() => { document.getElementById('caja')!.innerHTML = '' })
    throw new EmisionBloqueadaError('boton', 'Emitir')
  })
  assert.notEqual(r.fin.error, null, JSON.stringify(r.fin))
  assert.equal(r.pedidos.length, 1)
  assert.deepEqual(desaparecidas(r.eventos), [])
})

test('0.3.24 · sondeo del overlay sobre un nodo desaparecido: tope corto (null en ≤ ~5 s, no los 30 s por defecto)', async () => {
  const { context, page } = await abrir(PAGINA_NSE(false), URL_OBJ)
  try {
    page.setDefaultTimeout(30_000)
    const loc = page.locator('[data-explorador-ref="no-existe"]')
    assert.equal(await refDesaparecida(loc), true)
    assert.equal(await refDesaparecida(page.locator('#sig')), false)
    const t0 = Date.now()
    assert.equal(await sondearOverlaysCarga(loc, page.mainFrame()), null)
    assert.ok(Date.now() - t0 < 7_000, `${Date.now() - t0} ms`)
  } finally {
    await context.close()
  }
})

test('0.3.24 · esTimeoutPlaywright: solo por el nombre de la clase', () => {
  const t = new Error('x')
  t.name = 'TimeoutError'
  assert.equal(esTimeoutPlaywright(t), true)
  assert.equal(esTimeoutPlaywright(new Error('Timeout 30000ms exceeded')), false)
  assert.equal(esTimeoutPlaywright(null), false)
})

// ─── 2) Fidelidade: marcar comprobado VIVO; si no, UN clic en su <label for> por el guard ───────────────────────────────────────────
const URL_FI = 'https://mediadores.fidelidade.es/OPI_ES_Vivienda/Simualtion.aspx'
const FI = 'fidelidade:particulares:vivienda'
/** El radio SOLO se marca desde su etiqueta (el clic directo se cancela, como un control OutSystems que no atiende al input). */
const RADIO_ETIQUETA = (etiqueta: string) => `<input type="radio" id="reg1" name="regimen" value="P" onclick="if(!window.__porEtiqueta){return false}">${etiqueta}
  <input type="radio" id="reg2" name="regimen" value="I"><label for="reg2">Inquilino</label>`
const PAGINA_FI = (radios: string) => `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body>
  <form id="f" onsubmit="return false"><h2>Datos Cliente - Nombre y régimen</h2><fieldset><legend>Régimen</legend>${radios}</fieldset></form></body></html>`
const ETQ_OK = '<label for="reg1" onclick="window.__porEtiqueta=true">Propietario</label>'

test('0.3.24 · Fidelidade: marcar que no queda marcado → UN clic en su <label for> por el guard y queda marcado', async () => {
  const { context, page, guard } = await abrir(PAGINA_FI(RADIO_ETIQUETA(ETQ_OK)), URL_FI)
  try {
    page.setDefaultTimeout(2_000)
    const eventos: Ev[] = []
    const fin = await bucleExploracion(page, contexto(page, guard, FI, 'hogar', 'fidelidade', (inv, n) =>
      n === 1 ? respuesta([{ accion: 'marcar', ref: refDe(inv, 'reg1') }]) : respuesta([{ accion: 'parar', motivo: 'ambiguo' }]), {
      log: (ev: string, datos?: unknown) => { eventos.push({ ev, datos: (datos ?? {}) as Record<string, unknown> }) },
    }))
    assert.equal(fin.error, null, JSON.stringify(fin))
    assert.equal(await page.locator('#reg1').isChecked(), true)
    assert.deepEqual(eventos.filter((e) => e.ev === 'exploracion_marcar').map((e) => e.datos.estado), ['por_etiqueta'])
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

test('0.3.24 · asegurarMarcado: ya marcado → no pulsa nada; sin <label for>, envolvente o dos etiquetas → no pulsa; la etiqueta pasa por el guard', async () => {
  const casos: [string, string][] = [
    ['sin_etiqueta', '<span>Propietario</span>'],
    ['sin_etiqueta', '<label onclick="window.__porEtiqueta=true">Propietario <input type="checkbox" id="otro"></label>'],
    ['sin_etiqueta', ETQ_OK + '<label for="reg1" onclick="window.__porEtiqueta=true">Otra</label>'],
  ]
  for (const [esperado, etq] of casos) {
    const { context, page, guard } = await abrir(PAGINA_FI(RADIO_ETIQUETA(etq)), URL_FI)
    try {
      let pulsados = 0
      const r = await asegurarMarcado(page.locator('#reg1'), page.mainFrame(), async (b) => { pulsados++; await pulsar(b, guard) })
      assert.equal(r, esperado, etq)
      assert.equal(pulsados, 0, etq)
      assert.equal(await page.locator('#reg1').isChecked(), false, etq)
    } finally {
      await context.close()
    }
  }
  const { context, page, guard } = await abrir(PAGINA_FI('<input type="radio" id="reg1" name="regimen" checked><label for="reg1">Propietario</label>'), URL_FI)
  try {
    let pulsados = 0
    assert.equal(await asegurarMarcado(page.locator('#reg1'), page.mainFrame(), async (b) => { pulsados++; await pulsar(b, guard) }), 'marcado')
    assert.equal(pulsados, 0)
  } finally {
    await context.close()
  }
})

test('0.3.24 · asegurarMarcado: una <label for> con texto de ACCIÓN FINAL → el guard la bloquea y el radio sigue sin marcar', async () => {
  for (const etq of ['<label for="reg1" onclick="window.__porEtiqueta=true">Emitir póliza</label>', '<label for="reg1" onclick="window.__porEtiqueta=true">Acepto y contrato</label>']) {
    const { context, page, guard } = await abrir(PAGINA_FI(RADIO_ETIQUETA(etq)), URL_FI)
    try {
      await assert.rejects(asegurarMarcado(page.locator('#reg1'), page.mainFrame(), (b) => pulsar(b, guard)), EmisionBloqueadaError, etq)
      assert.equal(await page.locator('#reg1').isChecked(), false, etq)
    } finally {
      await context.close()
    }
  }
})
