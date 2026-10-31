// Explorador 0.3.25 (30/10/2026) · worker. Páginas y valores SINTÉTICOS (sin PII) servidos por `page.route` en los orígenes reales.
// 1) Allianz ePAC drvp00 (6255c5e7…, «Figuras Intervinientes»): la ayuda contextual (AyudaAplicacionesAjax) llegó con un `pageId` de longitud 26,
//    letras+dígitos+símbolos y un símbolo fuera de `_.:$-` → guard_emision. Alfabeto CERRADO propio para `pageId` (solo esa regla de drvp00),
//    `codCia` corto, el `estricto` intacto, y el diagnóstico NOMBRA los símbolos ASCII (nunca letras ni cifras).
// 2) Fidelidade (56b4b52c…): el mapa marcó PROPIETARIO ANTES de que la IA rellenara el nombre; el portal decide el avance en el `change` del
//    radio y el botón quedó deshabilitado. `marcar` sobre un radio YA marcado → clic por el guard + `input`/`change` sobre el MISMO nodo.
// 3) Mapfre NSE (8951d6f7…): mensajes de RichFaces (`rich-messages-label`/`rich-message-label`) en los avisos del portal.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { EmisionBloqueadaError, RE_ACCION_REAL_TRAS_PREFIJO, type InventarioDom } from '@central/module-tarificacion'
import { AJAX_AYUDA_APLICACIONES_ALLIANZ_DRVP00, AJAX_LECTURA_ALLIANZ, ajaxValidacionAvancePermitida, formaValor, instalarGuardEmision, motivoAjaxRechazado, pulsar, pulsarExploracionAutorizada, pulsarGuardadoDialogoAutorizado, pulsarGuardadoPresupuesto, redispararCambioMarcado, type GuardEmision } from '../src/guard.ts'
import { bucleExploracion, EXPLORADOR_VERSION, type ContextoBucle } from '../src/explorador.ts'
import { capturarInventarioExploracion } from '../src/inventario-dom.ts'
import type { RespuestaPaso } from '../src/api.ts'

test('versión del explorador 0.3.26', () => assert.equal(EXPLORADOR_VERSION, '0.3.26'))

// ─── 1) Allianz drvp00: pageId de la ayuda contextual ──────────────────────────────────────────────────────────────────────────────
const ORIGEN_EPAC = 'https://www.e-pacallianz.com'
const AYUDA = `${ORIGEN_EPAC}/drvp00/AJAXServlet?resource=com.ats.sea.visuals.util.AyudaAplicacionesAjax`
const L = [AJAX_AYUDA_APLICACIONES_ALLIANZ_DRVP00]
const cuerpo = (pageId: string, codCia = '9') => new URLSearchParams({ pageId, codCia }).toString()

test('0.3.25 · ayuda drvp00: pageId de 26 con letras+dígitos+símbolos de id de página (/, #, |, tilde…) pasa; la de drpc18 no cambia', () => {
  for (const p of ['vmp/figurasIntervinientes1', 'VMP#Intervinientes_0001.ab', 'drvp00|Figuras(Interv)[01]', 'intervenção$figuras-01', 'datosVehiculo$datosVehiculo']) {
    assert.equal(ajaxValidacionAvancePermitida('POST', AYUDA, cuerpo(p), L), true, p)
  }
  assert.equal('vmp/figurasIntervinientes1'.length, 26)
  // drpc18 (Moto) sigue con su forma de siempre: la «/» no pasa ahí.
  assert.equal(ajaxValidacionAvancePermitida('POST', AYUDA.replace('/drvp00/', '/drpc18/'), cuerpo('vmp/figurasIntervinientes1'), AJAX_LECTURA_ALLIANZ), false)
})

test('0.3.25 · ayuda drvp00: alfabeto CERRADO — espacio, @, ;, comillas, <>, =, &, ?, {}, \\ , % o >64 → rechazo; codCia corto; acción final/bancario sigue parando', () => {
  for (const [nombre, p] of [
    ['espacio', 'vmp figuras'], ['arroba (forma de correo)', 'nombre@dominio.es'], ['punto y coma', 'a;b'], ['comilla', "a'b"], ['comilla doble', 'a"b'],
    ['menor', 'a<b'], ['igual', 'a=b'], ['ampersand', 'a&b'], ['interrogación', 'a?b'], ['llaves', 'a{b}'], ['barra invertida', 'a\\b'], ['porcentaje', 'a%b'],
    ['vacío', ''], ['65 caracteres', 'a'.repeat(65)], ['emitir', 'vmp/emitirPoliza'], ['confirmar póliza', 'datos$confirmarPoliza'], ['pago', 'formaPago/formaPago'],
    ['IBAN', 'datosIban/datosIban'], ['contratar', 'vmp/contratar01'], ['firmar', 'vmp|firmar'],
  ] as const) {
    assert.equal(ajaxValidacionAvancePermitida('POST', AYUDA, cuerpo(p), L), false, nombre)
  }
  for (const c of ['9/1', '', 'a'.repeat(9), '9 1']) assert.equal(ajaxValidacionAvancePermitida('POST', AYUDA, cuerpo('vmp/figuras', c), L), false, `codCia ${c}`)
  assert.equal(ajaxValidacionAvancePermitida('POST', AYUDA, 'pageId=vmp%2Ffiguras&codCia=9&accion=x', L), false, 'clave de más')
  assert.equal(ajaxValidacionAvancePermitida('POST', AYUDA.replace('AyudaAplicacionesAjax', 'EmitirPolizaAjax'), cuerpo('vmp/figuras'), L), false, 'otro resource')
})

test('0.3.25 · formaValor: nombra los símbolos ASCII (ordenados, sin repetir), nunca letras ni cifras; lo no-ASCII solo como categoría', () => {
  assert.equal(formaValor('vmp/figuras#01/a'), 'longitud 16, letras+dígitos+símbolos «#/»')
  assert.equal(formaValor('12345678Z'), 'longitud 9, letras+dígitos')
  assert.equal(formaValor('Muñoz Peña'), 'longitud 10, letras+espacios+no-ASCII')
  assert.equal(formaValor(''), 'longitud 0, vacío')
  const m = String(motivoAjaxRechazado('POST', AYUDA, cuerpo('nombre@dominio.es'), L))
  assert.match(m, /forma de valor de cuerpo no permitida en «pageId» \(longitud 17, letras\+símbolos «\.@»\)/)
  assert.doesNotMatch(m, /nombre|dominio/)
})

// ─── Navegador (2 y 3) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
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

async function abrir(html: string, url: string): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.route('https://**/*', async (route) => {
    if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
    else await route.fallback()
  })
  await page.goto(url)
  return { context, page, guard }
}
const elementos = (inv: InventarioDom) => inv.marcos.flatMap((m) => m.elementos)
const refDe = (inv: InventarioDom, id: string) => elementos(inv).find((e) => e.id === id && e.ref)!.ref!
const respuesta = (acciones: unknown[]) => ({ version: 1, pantalla: { nombre: 'Pantalla', tipo: 'formulario' }, acciones, mapeo: [], motivo: null })
type Ev = { ev: string; datos: Record<string, unknown> }

function contexto(page: Page, guard: GuardEmision, entrada: string, ramo: string, compania: string, guion: (inv: InventarioDom, n: number) => unknown, extra: Partial<ContextoBucle> = {}): ContextoBucle {
  let n = 0
  return {
    trabajoId: '00000000-0000-4000-8000-000000000325', compania, ramo, entrada,
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

// ─── 2) Fidelidade: radio ya marcado antes del nombre ──────────────────────────────────────────────────────────────────────────────
const URL_FI = 'https://mediadores.fidelidade.es/OPI_ES_Vivienda/Simualtion.aspx'
const FI = 'fidelidade:particulares:vivienda'
/** Réplica del portal: el avance se habilita SOLO en el `change` del régimen y si el nombre ya tiene valor. Arranca con PROPIETARIO marcado
 *  y el nombre escrito DESPUÉS (el orden del mapa real): el botón sigue deshabilitado. */
const PAGINA_FI = `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body>
  <form id="f"><h2>Datos Cliente - Nombre y régimen</h2>
    <label for="nom">Nombre y apellidos/Razón Social</label><input type="text" id="nom" name="nom" value="Cliente Prueba">
    <fieldset><legend>En calidad de quién realiza el seguro</legend>
      <input type="radio" id="reg1" name="regimen" value="P" checked><label for="reg1">PROPIETARIO</label>
      <input type="radio" id="reg2" name="regimen" value="I"><label for="reg2">INQUILINO</label></fieldset>
    <button type="button" id="sig" disabled>Siguiente</button>
  </form>
  <script>
    for (const r of document.querySelectorAll('input[name=regimen]')) r.addEventListener('change', function () {
      window.__cambios = (window.__cambios || 0) + 1
      document.getElementById('sig').disabled = document.getElementById('nom').value.trim() === ''
    })
  </script></body></html>`

test('0.3.25 · Fidelidade: marcar el radio YA marcado → clic por el guard + change sobre el mismo nodo → el avance se habilita', async () => {
  const { context, page, guard } = await abrir(PAGINA_FI, URL_FI)
  try {
    const eventos: Ev[] = []
    const vistos: (boolean | undefined)[] = []
    const fin = await bucleExploracion(page, contexto(page, guard, FI, 'hogar', 'fidelidade', (inv, n) => {
      vistos.push(elementos(inv).find((e) => e.id === 'sig')!.deshabilitado)
      return n === 1 ? respuesta([{ accion: 'marcar', ref: refDe(inv, 'reg1') }]) : respuesta([{ accion: 'parar', motivo: 'ambiguo' }])
    }, { log: (ev: string, datos?: unknown) => { eventos.push({ ev, datos: (datos ?? {}) as Record<string, unknown> }) } }))
    assert.equal(fin.error, null, JSON.stringify(fin))
    assert.deepEqual(vistos, [true, undefined], 'el segundo inventario ve el avance HABILITADO')
    assert.equal(await page.evaluate(() => (window as unknown as { __cambios?: number }).__cambios), 1)
    assert.equal(await page.locator('#reg1').isChecked(), true)
    assert.deepEqual(eventos.filter((e) => e.ev === 'exploracion_marcar').map((e) => e.datos.estado), ['cambio'])
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

test('0.3.25 · redispararCambioMarcado: solo radio marcado, conectado y habilitado; casilla, radio sin marcar o deshabilitado → no_aplica', async () => {
  const { context, page, guard } = await abrir(`<!doctype html><html><body>
    <input type="radio" id="r1" name="a" checked><input type="radio" id="r2" name="a">
    <input type="checkbox" id="c1" checked><input type="radio" id="r3" name="b" checked disabled>
    <script>window.__n = 0; document.addEventListener('change', function () { window.__n++ })</script></body></html>`, URL_FI)
  try {
    assert.equal(await redispararCambioMarcado(page.locator('#r2'), guard), 'no_aplica')
    assert.equal(await redispararCambioMarcado(page.locator('#c1'), guard), 'no_aplica')
    assert.equal(await redispararCambioMarcado(page.locator('#r3'), guard), 'no_aplica')
    assert.equal(await redispararCambioMarcado(page.locator('#noexiste'), guard), 'desaparecido')
    assert.equal(await page.evaluate(() => (window as unknown as { __n: number }).__n), 0)
    assert.equal(await redispararCambioMarcado(page.locator('#r1'), guard), 'cambio')
    assert.equal(await page.evaluate(() => (window as unknown as { __n: number }).__n), 1)
  } finally {
    await context.close()
  }
})

test('0.3.25 · redispararCambioMarcado: un radio de ACCIÓN FINAL (emitir) → el guard lo bloquea; con un campo IBAN en pantalla → frontera bancaria; sin change', async () => {
  for (const [nombre, html, id, clase] of [
    ['emitir', '<input type="radio" id="e1" name="a" checked onclick="emitirPoliza()"><label for="e1">Emitir póliza</label>', '#e1', EmisionBloqueadaError],
    ['IBAN', '<input type="radio" id="e2" name="b" checked><label for="e2">Propietario</label><label for="iban">IBAN</label><input type="text" id="iban" name="iban">', '#e2', Error],
  ] as const) {
    const { context, page, guard } = await abrir(`<!doctype html><html><body>${html}
      <script>window.__n = 0; document.addEventListener('change', function () { window.__n++ })</script></body></html>`, URL_FI)
    try {
      await assert.rejects(redispararCambioMarcado(page.locator(id), guard), clase, nombre)
      assert.equal(await page.evaluate(() => (window as unknown as { __n: number }).__n), 0, nombre)
    } finally {
      await context.close()
    }
  }
})

// Revisión de seguridad (30/10/2026): `input`/`change` BURBUJEAN; la descripción del guard solo ve onclick/ng-click/href. Un onchange/oninput
// de acción final en el radio o en un ancestro, o CUALQUIER onchange/oninput/onsubmit del <form>, → LANZA y no se emite nada.
test('0.3.25 · redispararCambioMarcado: onchange/oninput de acción final en el radio o sus ancestros, o un <form> con manejadores → LANZA sin change', async () => {
  for (const [nombre, html, id] of [
    ['onchange emitir en el radio', '<input type="radio" id="x1" name="a" checked onchange="emitir()"><label for="x1">Propietario</label>', '#x1'],
    ['onchange emision() en el radio', '<input type="radio" id="x0" name="a" checked onchange="emision()">', '#x0'],
    ['oninput pagar en un div ancestro', '<div oninput="pagarRecibo()"><div><div><div><input type="radio" id="x2" name="a" checked></div></div></div></div>', '#x2'],
    ['form onchange submit', '<form onchange="this.submit()"><input type="radio" id="x3" name="a" checked></form>', '#x3'],
    ['form oninput', '<form oninput="recalcular()"><input type="radio" id="x4" name="a" checked></form>', '#x4'],
    ['form onsubmit', '<form onsubmit="return true"><input type="radio" id="x5" name="a" checked></form>', '#x5'],
    ['form por atributo form=', '<form id="f6" onchange="this.submit()"></form><input type="radio" id="x6" name="a" form="f6" checked>', '#x6'],
  ] as const) {
    const { context, page, guard } = await abrir(`<!doctype html><html><body>${html}
      <script>window.__n = 0; document.addEventListener('change', function (e) { window.__n++; e.preventDefault() }, true)</script></body></html>`, URL_FI)
    try {
      await assert.rejects(redispararCambioMarcado(page.locator(id), guard), EmisionBloqueadaError, nombre)
      assert.equal(await page.evaluate(() => (window as unknown as { __n: number }).__n), 0, nombre)
    } finally {
      await context.close()
    }
  }
})

test('0.3.25 · redispararCambioMarcado: radio limpio dentro de un <form> sin manejadores (y onchange neutro en un div) → redispara', async () => {
  const { context, page, guard } = await abrir(`<!doctype html><html><body><form action="/x"><div onchange="recalcularAvance()">
    <input type="radio" id="ok" name="a" checked><label for="ok">Propietario</label></div></form>
    <script>window.__n = 0; document.addEventListener('change', function () { window.__n++ })</script></body></html>`, URL_FI)
  try {
    assert.equal(await redispararCambioMarcado(page.locator('#ok'), guard), 'cambio')
    assert.equal(await page.evaluate(() => (window as unknown as { __n: number }).__n), 1)
  } finally {
    await context.close()
  }
})

test('0.3.25 · vocabulario de acción final: raíces portuguesas (emissão, pagamento, assinatura) casan; rótulos neutros de simulación no', () => {
  for (const t of ['emissaoApolice()', 'meioPagamento', 'assinaturaDigital', 'EMISSÃO']) assert.equal(RE_ACCION_REAL_TRAS_PREFIJO.test(t), true, t)
  for (const t of ['recalcularAvance()', 'simulacao', 'proprietario', 'Simulación', 'OsAjax(arguments[0])']) assert.equal(RE_ACCION_REAL_TRAS_PREFIJO.test(t), false, t)
})

// ─── 3) Mapfre NSE: mensajes de RichFaces en los avisos del portal─────────────────────────────────────────────────────────────────
test('0.3.25 · inventario: los mensajes de RichFaces (rich-messages-label / rich-message-label) entran en los avisos del portal', async () => {
  const { context, page } = await abrir(`<!doctype html><html><body><form id="formObjAseg"><h2>Datos del vehículo</h2>
    <dl class="rich-messages"><dt><span class="rich-messages-label">El campo Uso es obligatorio</span></dt></dl>
    <span class="rich-message"><span class="rich-message-label">Seleccione un vehículo del buscador</span></span>
    <span class="rich-message-label" style="display:none">oculto</span>
    <input type="text" id="formObjAseg:COD_POSTAL_CIRCULACION"></form></body></html>`, 'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/informacionGeneral/datosGenerales.jsf')
  try {
    const cap = (await capturarInventarioExploracion(page))!
    assert.deepEqual(cap.inventario.marcos[0].avisosPortal, ['El campo Uso es obligatorio', 'Seleccione un vehículo del buscador'])
    await cap.liberar()
  } finally {
    await context.close()
  }
})
