// Explorador 0.3.21 (29/10/2026) · worker, DOM VIVO. Páginas SINTÉTICAS (sin PII) servidas por `page.route` en los orígenes reales (el
// navegador de pruebas no sale a la red: los POST caen al guard del contexto, que los deja seguir —y fallan en el proxy muerto— o los aborta
// con `ERR_BLOCKED_BY_CLIENT`). Cada brazo que debe fallar, en rojo.
// 1) Fidelidade «Simulación» (b8e871fe…): [rellenar, marcar, avanzar DESHABILITADO] → se rellena y marca, el avanzar NO se pulsa; el paso
//    siguiente ve el botón habilitado.
// 2) Allianz VMP (3c888bba…): 56 marcas (XIAOMI la 55ª) → el inventario las lleva; con 300 la pista del catálogo rescata XIAOMI.
// 3) Mapfre NSE (e6b08ea8…): `formDG:localidadFirma` en el POST a la ruta tolerada no se aborta; con valor de acción, sí; fuera de la ruta
//    tolerada, todo igual (bloquea).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { EmisionBloqueadaError, rutasAppTolerablesDe, type InventarioDom } from '@central/module-tarificacion'
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
const elementos = (inv: InventarioDom) => inv.marcos.flatMap((m) => m.elementos)
/** El id real del avance de Fidelidade supera los 80 car. del saneado (sale recortado): se busca por tag/type. */
const submitDe = (inv: InventarioDom) => elementos(inv).find((e) => e.tag === 'input' && e.type === 'submit' && e.ref)
const refDe = (inv: InventarioDom, id: string) => elementos(inv).find((e) => e.id === id && e.ref)!.ref!
const respuesta = (acciones: unknown[]) => ({ version: 1, pantalla: { nombre: 'Pantalla', tipo: 'formulario' }, acciones, mapeo: [], motivo: null })

function contexto(page: Page, guard: GuardEmision, entrada: string, ramo: string, compania: string, guion: (inv: InventarioDom, n: number) => unknown): ContextoBucle {
  let n = 0
  return {
    trabajoId: '00000000-0000-4000-8000-000000000321', compania, ramo, entrada,
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

test('versión del explorador 0.3.25', () => assert.equal(EXPLORADOR_VERSION, '0.3.25'))

// ─── 1) Fidelidade ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const FI = 'fidelidade:particulares:vivienda'
const URL_FI = 'https://mediadores.fidelidade.es/OPI_ES_Vivienda/Simualtion.aspx'
const NAME = 'OPI_Theme_wt25$block$wtMainContent$FID_B2B_SIM_Pat_wt22$block$wtForm$FID_B2B_SIM_Pat_wtNextButton$block$wtInput$wtNextButton2'
const ID = NAME.replace(/\$/g, '_')
// Como el real: el botón de avance nace DESHABILITADO y el portal lo habilita al rellenar el nombre.
const PAGINA_FI = `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body>
  <form id="f" method="post" action="/OPI_ES_Vivienda/Simualtion.aspx" onsubmit="return false">
    <h2>Simulación</h2>
    <label for="nom">Nombre y apellidos/Razón Social</label><input type="text" id="nom" name="OPI_Theme_wt25$block$wtMainContent$Nom" oninput="document.getElementById('${ID}').disabled = this.value === ''">
    <input type="radio" id="reg1" name="OPI_Theme_wt25$block$wtMainContent$Regimen" value="1"><label for="reg1">Propietario</label>
    <input type="submit" id="${ID}" name="${NAME}" class="Button First Is_Default" value="" disabled onclick="window.__pulsado = (window.__pulsado || 0) + 1">
  </form></body></html>`

test('0.3.21 · Fidelidade: [rellenar, marcar, avanzar DESHABILITADO] → se rellena y marca, el avanzar no se pulsa y el paso 2 lo ve habilitado', async () => {
  const { context, page, guard } = await abrir(PAGINA_FI, URL_FI)
  try {
    let pasos = 0
    let deshabilitadoEnPaso2: boolean | undefined | null = null
    const fin = await bucleExploracion(page, contexto(page, guard, FI, 'hogar', 'fidelidade', (inv, n) => {
      pasos = n
      if (n === 1) {
        assert.equal(submitDe(inv)?.deshabilitado, true, 'paso 1: el botón está deshabilitado')
        return respuesta([{ accion: 'rellenar', ref: refDe(inv, 'nom'), dato: 'tomador.nombre_completo' }, { accion: 'marcar', ref: refDe(inv, 'reg1') }, { accion: 'avanzar', ref: submitDe(inv)!.ref, efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }])
      }
      deshabilitadoEnPaso2 = submitDe(inv)?.deshabilitado
      return respuesta([{ accion: 'parar', motivo: 'ambiguo' }])
    }))
    assert.equal(pasos, 2, `el lote del paso 1 se ejecutó (sin el avanzar) y hubo paso 2: ${JSON.stringify(fin)}`)
    assert.equal(deshabilitadoEnPaso2, undefined, 'paso 2: el botón ya está habilitado')
    assert.notEqual(await page.locator('#nom').inputValue(), '')
    assert.equal(await page.locator('#reg1').isChecked(), true)
    assert.equal(await page.evaluate(() => (window as unknown as { __pulsado?: number }).__pulsado ?? 0), 0, 'el avanzar NO se pulsó')
    assert.equal(posts().length, 0)
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

// ─── 2) Allianz VMP: opciones del select ───────────────────────────────────────────────────────────────────────────────────────────
const MP = 'allianz:autos:movilidad_personal'
const URL_VMP = 'https://www.e-pacallianz.com/drvp00/main/control.do'
const SP = (id: string, opciones: string) => `<select id="${id}" name="${id}" class="selectpicker" style="display:none" onchange="alCambiar(this)">${opciones}</select>
  <div class="btn-group bootstrap-select"><button type="button" class="btn dropdown-toggle selectpicker" data-id="${id}"><span class="filter-option"></span></button>
  <div class="dropdown-menu" style="display:none"><ul><li><a>Seleccione</a></li></ul></div></div>`
const marcas = (n: number) => ['<option value="">Seleccione</option>', ...Array.from({ length: n }, (_, k) => `<option value="${100 + k}">MARCA ${String(k).padStart(3, '0')}</option>`), '<option value="999">XIAOMI</option>'].join('')
const PAGINA_VMP = (n: number) => `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body><form id="f" method="post" action="/drvp00/main/control.do" onsubmit="return false">
  <h3>Datos del Vehículo</h3>
  <label id="VMPBean$marca_label" for="VMPBean$marca">Marca</label>${SP('VMPBean$marca', marcas(n))}
  <label id="VMPBean$modelo_label" for="VMPBean$modelo">Modelo</label>${SP('VMPBean$modelo', '<option value="">Seleccione</option>')}
  </form><script>
  function alCambiar(s) {
    var b = s.nextElementSibling.querySelector('button'); b.querySelector('span').textContent = s.options[s.selectedIndex].text;
    if (s.id === 'VMPBean$marca' && s.value === '999') document.getElementById('VMPBean$modelo').innerHTML = '<option value="">Seleccione</option><option value="7">ELECTRIC SCOOTER 4 PRO</option>';
  }
  </script></body></html>`

async function elegirXiaomi(n: number) {
  const { context, page, guard } = await abrir(PAGINA_VMP(n), URL_VMP)
  try {
    let vista = false
    let modelos: string[] = []
    const fin = await bucleExploracion(page, contexto(page, guard, MP, 'patinete', 'allianz', (inv, paso) => {
      const marca = elementos(inv).find((e) => e.id === 'VMPBean$marca')!
      if (paso === 1) {
        vista = (marca.opciones ?? []).some((o) => o.texto === 'XIAOMI' && o.valor === '999')
        return vista ? respuesta([{ accion: 'elegir', ref: marca.ref, opcion: { valor: '999' } }]) : respuesta([{ accion: 'parar', motivo: 'ambiguo' }])
      }
      modelos = (elementos(inv).find((e) => e.id === 'VMPBean$modelo')?.opciones ?? []).map((o) => o.texto ?? '')
      return respuesta([{ accion: 'parar', motivo: 'ambiguo' }])
    }))
    return { fin, vista, modelos, marca: await page.locator('[id="VMPBean$marca"]').inputValue(), violacion: guard.violacion() }
  } finally {
    await context.close()
  }
}

test('0.3.21 · Allianz VMP: 56 marcas (XIAOMI la 55ª, como el real) → el inventario la lleva, se elige y el paso 2 ve los modelos', async () => {
  const r = await elegirXiaomi(54)
  assert.equal(r.vista, true, 'XIAOMI está en el inventario')
  assert.equal(r.marca, '999')
  assert.ok(r.modelos.includes('ELECTRIC SCOOTER 4 PRO'), r.modelos.join('|'))
  assert.equal(r.violacion, null)
})

test('0.3.21 · Allianz VMP: 300 marcas → sin pistas el inventario corta en 200; el bucle (pistas del catálogo) rescata XIAOMI', async () => {
  const { context, page } = await abrir(PAGINA_VMP(299), URL_VMP)
  try {
    const cap = (await capturarInventarioExploracion(page))!
    const marca = elementos(cap.inventario).find((e) => e.id === 'VMPBean$marca')!
    assert.equal(marca.opciones?.length, 200)
    assert.equal(marca.opcionesTotal, 301)
    assert.ok(!(marca.opciones ?? []).some((o) => o.texto === 'XIAOMI'))
    await cap.liberar()
  } finally {
    await context.close()
  }
  const r = await elegirXiaomi(299)
  assert.equal(r.vista, true, 'con la pista «Xiaomi» la opción entra')
  assert.equal(r.marca, '999')
})

// ─── 3) Mapfre NSE: lugar de firma en el cuerpo ─────────────────────────────────────────────────────────────────────────────────────
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
const REAL_DG = 'formDG=formDG&formDG%3AfechaFirmaInputDate=29%2F10%2F2026&formDG%3AfechaFirmaInputCurrentDate=10%2F2026&formDG%3AlocalidadFirma=SEVILLA&formDG%3AbtnSiguiente=formDG%3AbtnSiguiente&javax.faces.ViewState=j_id3'

test('0.3.21 · Mapfre NSE: POST a datosGenerales con la LOCALIDAD de firma (lugar o vacía) → el guard no lo aborta (antes: «firm»)', async () => {
  for (const cuerpo of [REAL_DG, 'formDG=formDG&formDG%3AlocalidadFirma=&javax.faces.ViewState=j_id3']) {
    const r = await postNse(cuerpo)
    assert.equal(r.violacion, null, `${cuerpo}: ${String(r.violacion)}`)
    assert.ok(!String(r.fallo).startsWith('net::ERR_BLOCKED_BY_CLIENT'), `${cuerpo}: ${r.fallo}`)
  }
})

test('0.3.21 · Mapfre NSE: localidad con acción final, botón de cargar localidad o ruta NO tolerada → abortado', async () => {
  for (const [cuerpo, tolerar] of [['formDG%3AlocalidadFirma=Firmar', true], ['formDG%3AlocalidadFirma=Sevilla+emitir', true],
    ['formDG%3AbtnCargaLocalidadFirmaSuscriptor=formDG%3AbtnCargaLocalidadFirmaSuscriptor&formDG%3AlocalidadFirma=SEVILLA', true],
    ['formDG%3AlocalidadFirma=ES9121000418450200051332', true], [REAL_DG, false]] as const) {
    const r = await postNse(cuerpo, tolerar)
    assert.ok(r.violacion instanceof EmisionBloqueadaError, `${cuerpo} (tolerada=${tolerar})`)
    assert.match(String(r.fallo), /^net::ERR_BLOCKED_BY_CLIENT/, cuerpo)
  }
})
