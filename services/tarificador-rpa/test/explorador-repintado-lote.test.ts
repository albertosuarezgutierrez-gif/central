// Explorador · rellenado tras repintado dentro de un lote (Fidelidade Vivienda real 03/11/2026, Domicilio.aspx: elegir provincia/municipio/tipo
// de vía repinta la página OutSystems y `nombre_via` quedaba como `lote_cortado_por_repintado`). Páginas SINTÉTICAS (sin PII) en el origen real.
// Un `rellenar` cuyo nodo desaparece TRAS acciones hechas del lote se re-localiza sobre el DOM nuevo (misma identidad y huella) y se rellena;
// con identidad ambigua o pantalla distinta NO se adivina (se corta como siempre). Cada brazo que debe fallar, en rojo.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import type { InventarioDom } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsar, pulsarExploracionAutorizada, pulsarGuardadoDialogoAutorizado, pulsarGuardadoPresupuesto, type GuardEmision } from '../src/guard.ts'
import { bucleExploracion, MAX_RELOCALIZACIONES_LOTE, type ContextoBucle } from '../src/explorador.ts'
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

const FI = 'fidelidade:particulares:vivienda'
const URL_DOM = 'https://mediadores.fidelidade.es/OPI_ES_Vivienda/Domicilio.aspx'
const INPUT = (valor = '') => `<input type="text" id="via" name="wt$via" value="${valor}">`

/** `variante`: 'igual' = el repintado deja el mismo control; 'otroName' = el control repintado cambia de name (otra identidad);
 *  'otraPantalla' = el repintado cambia la estructura (otra huella). */
const PAGINA = (variante: 'igual' | 'otroName' | 'otraPantalla') => `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body>
  <form id="f" onsubmit="return false"><h2>Domicilio</h2>
    <label for="prov">Provincia</label>
    <select id="prov" name="wt$prov" onchange="repintar()"><option value="">--</option><option value="41">SEVILLA</option></select>
    <div id="caja"><label for="via">Nombre de la vía</label>${INPUT()}</div>
  </form>
  <script>
    function repintar() {
      var c = document.getElementById('caja')
      ${variante === 'igual' ? `c.innerHTML = '<label for="via">Nombre de la vía</label>${INPUT()}'` : ''}
      ${variante === 'otroName' ? `c.innerHTML = '<label for="via">Nombre de la vía</label><input type="text" id="via" name="wt$otra">'` : ''}
      ${variante === 'otraPantalla' ? `c.innerHTML = '<label for="via">Nombre de la vía</label>${INPUT()}<input type="text" id="extra" name="wt$extra">'` : ''}
    }
  </script></body></html>`

const elementos = (inv: InventarioDom) => inv.marcos.flatMap((m) => m.elementos)
const refDe = (inv: InventarioDom, id: string) => elementos(inv).find((e) => e.id === id && e.ref)!.ref!
const respuesta = (acciones: unknown[]) => ({ version: 1, pantalla: { nombre: 'Domicilio', tipo: 'formulario' }, acciones, mapeo: [], motivo: null })

async function ejecutar(variante: 'igual' | 'otroName' | 'otraPantalla') {
  const context: BrowserContext = await browser.newContext()
  const guard: GuardEmision = await instalarGuardEmision(context)
  const page: Page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.route('https://**/*', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGINA(variante) }))
  await page.goto(URL_DOM)
  try {
    let n = 0
    const pedidos: { incidencias: unknown }[] = []
    const eventos: { ev: string; datos: Record<string, unknown> }[] = []
    const k: ContextoBucle = {
      trabajoId: '00000000-0000-4000-8000-000000000334', compania: 'fidelidade', ramo: 'hogar', entrada: FI,
      conDatosReales: false, riesgo: {}, env: {}, guard,
      pulsar: (b) => pulsar(b, guard),
      pulsarAutorizado: (b, el, marco) => pulsarExploracionAutorizada(page, guard, b, { entrada: FI, el, marco }),
      pulsarGuardado: (b, el, pantalla, trasClic) => pulsarGuardadoPresupuesto(page, guard, b, { el, pantalla }, trasClic),
      pulsarGuardadoDialogo: (b, el, marco) => pulsarGuardadoDialogoAutorizado(page, guard, b, { entrada: FI, el, marco }),
      topePdfMs: 2_000,
      esperaRepintadoMs: 50,
      pausaAccion: async () => undefined,
      pedirPaso: async (c): Promise<RespuestaPaso> => {
        pedidos.push({ incidencias: c.incidencias ?? null })
        const inv = c.inventario
        const r = ++n === 1
          ? respuesta([
            { accion: 'elegir', ref: refDe(inv, 'prov'), opcion: { valor: '41' } },
            { accion: 'rellenar', ref: refDe(inv, 'via'), dato: 'inmueble.nombre_via' },
          ])
          : respuesta([{ accion: 'parar', motivo: 'ambiguo' }])
        return { estado: 'ok', respuesta: r, leaseHasta: null }
      },
      log: (ev: string, datos?: unknown) => { eventos.push({ ev, datos: (datos ?? {}) as Record<string, unknown> }) },
    }
    const fin = await bucleExploracion(page, k)
    const via = await page.locator('#via').inputValue()
    return { fin, pedidos, eventos, via, violacion: guard.violacion() }
  } finally {
    await context.close()
  }
}

test('el tope de re-localizaciones por lote es 3', () => assert.equal(MAX_RELOCALIZACIONES_LOTE, 3))

test('elegir repinta el formulario: el rellenar del mismo lote se re-localiza y el campo queda relleno (sin lote_cortado)', async () => {
  const r = await ejecutar('igual')
  assert.equal(r.fin.error, null, JSON.stringify(r.fin))
  assert.equal(r.via, 'PRUEBA', 'nombre_via relleno sobre el DOM nuevo')
  assert.ok(r.eventos.some((e) => e.ev === 'exploracion_relocalizacion' && e.datos.estado === 'ok' && e.datos.tras === 'acciones_del_lote'))
  assert.equal(JSON.stringify(r.pedidos[1]?.incidencias ?? null).includes('lote_cortado'), false, 'ninguna incidencia lote_cortado')
  assert.equal(r.violacion, null)
})

test('BRAZO el control repintado cambió de identidad (otro name) → NO se rellena y el lote se corta como siempre', async () => {
  const r = await ejecutar('otroName')
  assert.equal(r.via, '', 'no se escribe en un control de otra identidad')
  assert.ok(r.eventos.some((e) => e.ev === 'exploracion_relocalizacion' && e.datos.estado === 'no_encontrado'))
  assert.match(JSON.stringify(r.pedidos[1]?.incidencias), /"causa":"lote_cortado"/)
})

test('BRAZO el repintado cambia la estructura de la pantalla (otra huella) → NO se rellena, se corta', async () => {
  const r = await ejecutar('otraPantalla')
  assert.equal(r.via, '')
  assert.match(JSON.stringify(r.pedidos[1]?.incidencias), /"causa":"lote_cortado"/)
})
