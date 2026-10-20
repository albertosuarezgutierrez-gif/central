// Cepos del AVANCE DE PESTAÑA autorizado de Allianz ePAC Moto (Alberto, 13/10/2026). DOM mínimo con los `td` y el
// `form#formulari` de la grabación del 13/10 (solo ids, textos y manejadores; ningún dato de persona). SIN RED REAL: el
// navegador sale por un proxy muerto (127.0.0.1:9), así que lo que el guard deja pasar falla en el proxy y nunca llega a
// Allianz; lo que el guard aborta falla con ERR_BLOCKED_BY_CLIENT.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import { ErrorTarificador } from '../src/errores.ts'
import { avanzarPestanaGuardada } from '../src/adapters/allianz/auto.ts'
import {
  AJAX_LISTA_NEGRA_NIF_ALLIANZ,
  AJAX_AYUDA_APLICACIONES_ALLIANZ,
  AJAX_LECTURA_ALLIANZ,
  AVANCES_PESTANA_AUTORIZADOS,
  ErrorAvanceSinLlegar,
  ajaxValidacionAvancePermitida,
  motivoAjaxRechazado,
  destinoAvancePermitido,
  instalarGuardEmision,
  pulsarAvancePestanaAutorizado,
  type GuardEmision,
  type SelectorAvancePestana,
} from '../src/guard.ts'

const EPAC = 'https://www.e-pacallianz.com'
const RIESGO = '/drpc18/riesgoMunicipio/control.do'
const DATOS = '/drpc18/datosBasicos/control.do'
const TARIFA = '/drpc18/tarifa/control.do'

let browser: Browser
before(async () => {
  const opciones = { headless: true, args: ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>'] }
  try {
    browser = await chromium.launch(opciones)
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ ...opciones, executablePath: exe })
  }
})
after(async () => browser?.close())

type Escenario = {
  /** `action` del form#formulari de la pantalla actual. */
  origen: string
  /** `action` que pone el «portal» cuando termina la petición del clic (la pantalla de destino). */
  destino: string
  /** El `td` de la pestaña. */
  td: string
  /** Petición que dispara `aceptar_onclick()` (como el envío del formulario del portal). */
  peticion?: { url: string; body: string }
  /** POST que sale ANTES de `peticion` (como el `onchange` de un campo que pierde el foco al pulsar la pestaña). */
  previa?: { url: string; body: string }
  /** JS propio de `aceptar_onclick()` en lugar de petición + llegada (el portal rechaza, pide confirmación, navega…). */
  alClic?: string
}

/** El evento `requestfailed` llega asíncrono: espera (≤ 2 s) a que alguno cumpla `pred`. */
async function hayFallo(page: Page, fallos: () => string[], pred: (f: string) => boolean): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    if (fallos().some(pred)) return true
    await page.waitForTimeout(100)
  }
  return false
}

const TD_DATOS = `<td id="datosBasicos" title="" class="optionMenuUnselected" onclick="goSelected('datosBasicos'); aceptar_onclick();">Datos básicos</td>`
const TD_RATE = `<td id="rate" title="" class="optionMenuUnselected" onclick="goSelected('rate'); aceptar_onclick();">Tarificar</td>`

async function pantalla(e: Escenario): Promise<{ page: Page; guard: GuardEmision; pulsados: () => Promise<string[]>; fallos: () => string[] }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  const fallos: string[] = []
  page.on('requestfailed', (r) => fallos.push(`${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`))
  await page.setContent(`
    <form id="formulari" name="formulari" method="post" action="${e.origen}"></form>
    <table><tr>${e.td}<td id="contract" onclick="goSelected('contract'); validar_aceptar();">Emitir</td></tr></table>
    <script>
      window.p = []
      function goSelected(x) { window.sel = x }
      function validar_aceptar() { window.p.push('emitir') }
      function aceptar_onclick() {
        window.p.push('avance')
        ${e.alClic ?? ''}
        if (${e.alClic ? 'true' : 'false'}) return
        const pet = ${JSON.stringify(e.peticion ?? null)}
        const llegar = () => document.getElementById('formulari').setAttribute('action', ${JSON.stringify(e.destino)})
        const enviar = () => {
          if (!pet) return llegar()
          fetch(pet.url, { method: 'POST', body: pet.body, headers: { 'content-type': 'application/x-www-form-urlencoded' } }).catch(() => {}).finally(llegar)
        }
        const previa = ${JSON.stringify(e.previa ?? null)}
        if (!previa) return enviar()
        fetch(previa.url, { method: 'POST', body: previa.body, headers: { 'content-type': 'application/x-www-form-urlencoded' } }).catch(() => {}).finally(enviar)
      }
    </script>`)
  return { page, guard, pulsados: () => page.evaluate(() => (window as unknown as { p: string[] }).p), fallos: () => fallos }
}

test('lista blanca de selectores: EXACTAMENTE td#datosBasicos y td#rate, con sus destinos de red', () => {
  assert.deepEqual(Object.keys(AVANCES_PESTANA_AUTORIZADOS), ['td#datosBasicos', 'td#rate'])
  assert.deepEqual(AVANCES_PESTANA_AUTORIZADOS['td#datosBasicos'].endpoints, [`${EPAC}${RIESGO}`])
  assert.deepEqual(AVANCES_PESTANA_AUTORIZADOS['td#rate'].endpoints, [`${EPAC}${DATOS}`])
  assert.ok(Object.isFrozen(AVANCES_PESTANA_AUTORIZADOS) && Object.isFrozen(AVANCES_PESTANA_AUTORIZADOS['td#rate'].endpoints))
})

// --- Validación AJAX de la lista negra del NIF (Moto 0.7.7, 20/10/2026) ------------------------------------------------
const AJAX = `${EPAC}/drpc18/AJAXServlet`
const Q_TOKENS = 'com.ats.webbeans.struts.thread=T1&com.ats.webbeans.struts.synch=S1'
const URL_LISTA_NEGRA = `${AJAX}?resource=pt.allianz.clientes.negocio.BlackListOperationsAjax&${Q_TOKENS}`
const CUERPO_NIF = 'idNumberBL=00000000T'

test('ajaxValidacion: SOLO td#datosBasicos lleva la lista negra del NIF; la ayuda (lectura) va en ambos', () => {
  assert.deepEqual(AVANCES_PESTANA_AUTORIZADOS['td#datosBasicos'].ajaxValidacion, [AJAX_LISTA_NEGRA_NIF_ALLIANZ, AJAX_AYUDA_APLICACIONES_ALLIANZ])
  assert.deepEqual(AVANCES_PESTANA_AUTORIZADOS['td#rate'].ajaxValidacion, [AJAX_AYUDA_APLICACIONES_ALLIANZ])
  assert.deepEqual(AJAX_LECTURA_ALLIANZ, [AJAX_AYUDA_APLICACIONES_ALLIANZ])
  assert.ok(Object.isFrozen(AJAX_LISTA_NEGRA_NIF_ALLIANZ) && Object.isFrozen(AVANCES_PESTANA_AUTORIZADOS['td#datosBasicos'].ajaxValidacion))
})

test('ajaxValidacionAvancePermitida: POST exacto a la lista negra del NIF sí; cualquier variación, no', () => {
  const l = [AJAX_LISTA_NEGRA_NIF_ALLIANZ]
  assert.equal(ajaxValidacionAvancePermitida('POST', URL_LISTA_NEGRA, CUERPO_NIF, l), true)
  assert.equal(ajaxValidacionAvancePermitida('POST', `${AJAX}?com.ats.webbeans.struts.synch=S1&resource=pt.allianz.clientes.negocio.BlackListOperationsAjax&com.ats.webbeans.struts.thread=`, 'idNumberBL=', l), true, 'orden libre, tokens/NIF vacíos')
  for (const [metodo, url, cuerpo] of [
    ['GET', URL_LISTA_NEGRA, CUERPO_NIF],
    ['PUT', URL_LISTA_NEGRA, CUERPO_NIF],
    ['POST', URL_LISTA_NEGRA, null],
    ['POST', URL_LISTA_NEGRA, `${CUERPO_NIF}&action=aceptar`],
    ['POST', URL_LISTA_NEGRA, `${CUERPO_NIF}&idNumberBL=1`],
    ['POST', URL_LISTA_NEGRA, 'idNumberBL=00000000T;store'],
    ['POST', URL_LISTA_NEGRA, 'action=store'],
    ['POST', `${URL_LISTA_NEGRA}&action=store`, CUERPO_NIF],
    ['POST', `${URL_LISTA_NEGRA}&resource=x`, CUERPO_NIF],
    ['POST', `${URL_LISTA_NEGRA}#x`, CUERPO_NIF],
    ['POST', `${AJAX}?resource=pt.allianz.clientes.negocio.BlackListOperationsAjax`, CUERPO_NIF],
    ['POST', `${AJAX}?resource=pt.allianz.emision.EmitirPolizaAjax&${Q_TOKENS}`, CUERPO_NIF],
    ['POST', `${AJAX}?resource=com.ats.sea.visuals.util.AyudaAplicacionesAjax&${Q_TOKENS}`, CUERPO_NIF],
    ['POST', `${AJAX}?resource=pt.allianz.clientes.negocio.BlackListOperationsAjax&com.ats.webbeans.struts.thread=a%26action%3Dstore&com.ats.webbeans.struts.synch=S1`, CUERPO_NIF],
    ['POST', URL_LISTA_NEGRA.replace('/drpc18/', '/drpc17/'), CUERPO_NIF],
    ['POST', URL_LISTA_NEGRA.replace('https:', 'http:'), CUERPO_NIF],
    ['POST', URL_LISTA_NEGRA.replace('www.e-pacallianz.com', 'x@www.e-pacallianz.com'), CUERPO_NIF],
    ['POST', URL_LISTA_NEGRA.replace('AJAXServlet', 'AJAXServlet/'), CUERPO_NIF],
    ['POST', 'no es una url', CUERPO_NIF],
  ] as const) assert.equal(ajaxValidacionAvancePermitida(metodo, url, cuerpo, l), false, `${metodo} ${url} ${cuerpo}`)
  assert.equal(ajaxValidacionAvancePermitida('POST', URL_LISTA_NEGRA, CUERPO_NIF, []), false, 'sin reglas, nada')
})

const URL_AYUDA = `${AJAX}?resource=com.ats.sea.visuals.util.AyudaAplicacionesAjax`
// Forma REAL capturada (0.7.9): el PAGEID de ePAC es `<pantalla>$<pantalla>` y lleva «$»; el cuerpo va sin codificar.
const CUERPO_AYUDA = 'pageId=datosBasicos$datosBasicos&codCia=9'

test('ajaxValidacionAvancePermitida (ayuda de aplicaciones, solo lectura): exacta sí; variaciones y recursos de escritura, no', () => {
  const l = AJAX_LECTURA_ALLIANZ
  assert.equal(ajaxValidacionAvancePermitida('POST', URL_AYUDA, CUERPO_AYUDA, l), true)
  assert.equal(ajaxValidacionAvancePermitida('POST', URL_AYUDA, 'pageId=riesgoMunicipio%24riesgoMunicipio&codCia=9', l), true, '«$» codificado también')
  for (const raro of ['pageId=a b&codCia=9', 'pageId=a%20b&codCia=9', 'pageId=a;b&codCia=9', 'pageId=a$$$b%27&codCia=9', 'pageId=a/b&codCia=9', 'pageId=a&codCia=9%0A']) assert.equal(ajaxValidacionAvancePermitida('POST', URL_AYUDA, raro, l), false, raro)
  assert.equal(ajaxValidacionAvancePermitida('POST', `${URL_AYUDA}&${Q_TOKENS}`, CUERPO_AYUDA, l), true, 'tokens opcionales')
  const escritura = ['EmitirPolizaAjax', 'GrabarProyectoAjax', 'ContratarAjax', 'GuardarPresupuestoAjax', 'PagoAjax', 'FirmaAjax', 'AyudaAplicacionesAjax2']
  for (const r of escritura) assert.equal(ajaxValidacionAvancePermitida('POST', `${AJAX}?resource=com.ats.sea.visuals.util.${r}`, CUERPO_AYUDA, l), false, r)
  for (const [metodo, url, cuerpo] of [
    ['GET', URL_AYUDA, CUERPO_AYUDA],
    ['POST', URL_AYUDA, null],
    ['POST', URL_AYUDA, `${CUERPO_AYUDA}&action=aceptar`],
    ['POST', URL_AYUDA, 'pageId=x;store&codCia=1'],
    ['POST', URL_AYUDA, 'pageId=x'],
    ['POST', `${URL_AYUDA}&action=store`, CUERPO_AYUDA],
    ['POST', `${URL_AYUDA}&${Q_TOKENS}&com.ats.webbeans.struts.thread=2`, CUERPO_AYUDA],
    ['POST', `${AJAX}?${Q_TOKENS}`, CUERPO_AYUDA],
    ['POST', URL_AYUDA.replace('https:', 'http:'), CUERPO_AYUDA],
    ['POST', URL_AYUDA.replace('/drpc18/', '/drpc17/'), CUERPO_AYUDA],
  ] as const) assert.equal(ajaxValidacionAvancePermitida(metodo, url, cuerpo, l), false, `${metodo} ${url} ${cuerpo}`)
})

test('POSITIVO: la ayuda de aplicaciones que dispara la pantalla de destino pasa dentro de la ventana (td#datosBasicos y td#rate)', async () => {
  for (const escenario of [
    { origen: RIESGO, destino: DATOS, td: TD_DATOS, peticion: { url: `${EPAC}${RIESGO}`, body: 'vista=riesgoMunicipio&action=aceptar&aceptar=S' }, sel: 'td#datosBasicos' as const },
    { origen: DATOS, destino: TARIFA, td: TD_RATE, peticion: { url: `${EPAC}${DATOS}`, body: 'vista=datosBasicos&action=aceptar' }, sel: 'td#rate' as const },
  ]) {
    const { sel, ...resto } = escenario
    const { page, guard, pulsados, fallos } = await pantalla({ ...resto, previa: { url: URL_AYUDA, body: CUERPO_AYUDA } })
    await pulsarAvancePestanaAutorizado(page, guard, sel)
    assert.deepEqual(await pulsados(), ['avance'])
    assert.equal(guard.violacion(), null, sel)
    assert.ok(await hayFallo(page, fallos, (f) => f.includes('/AJAXServlet') && !/BLOCKED_BY_CLIENT/.test(f)), fallos().join(' | '))
    await page.context().close()
  }
})

test('POSITIVO td#datosBasicos: la consulta de lista negra del NIF al perder el foco pasa dentro de la ventana y se llega', async () => {
  const { page, guard, pulsados, fallos } = await pantalla({
    origen: RIESGO,
    destino: DATOS,
    td: TD_DATOS,
    previa: { url: URL_LISTA_NEGRA, body: CUERPO_NIF },
    peticion: { url: `${EPAC}${RIESGO}`, body: 'vista=riesgoMunicipio&action=aceptar&aceptar=S' },
  })
  await pulsarAvancePestanaAutorizado(page, guard, 'td#datosBasicos')
  assert.deepEqual(await pulsados(), ['avance'])
  assert.equal(guard.violacion(), null)
  assert.equal(guard.avance.abierta(), false)
  assert.ok(await hayFallo(page, fallos, (f) => f.includes('/AJAXServlet') && !/BLOCKED_BY_CLIENT/.test(f)), fallos().join(' | '))
  await page.context().close()
})

test('NEGATIVO: en el avance, un POST al AJAXServlet que NO es la lista negra del NIF (emisión, otra clase, «aceptar» en el cuerpo) o en td#rate → abortado', async () => {
  const casos: Array<{ previa: { url: string; body: string }; td: 'td#datosBasicos' | 'td#rate' }> = [
    { previa: { url: `${AJAX}?resource=pt.allianz.emision.EmitirPolizaAjax&${Q_TOKENS}`, body: CUERPO_NIF }, td: 'td#datosBasicos' },
    { previa: { url: `${AJAX}?resource=pt.allianz.poliza.GrabarProyectoAjax&${Q_TOKENS}`, body: CUERPO_NIF }, td: 'td#datosBasicos' },
    { previa: { url: URL_LISTA_NEGRA, body: `${CUERPO_NIF}&action=aceptar` }, td: 'td#datosBasicos' },
    { previa: { url: `${URL_LISTA_NEGRA}&action=store`, body: CUERPO_NIF }, td: 'td#datosBasicos' },
    { previa: { url: URL_LISTA_NEGRA, body: CUERPO_NIF }, td: 'td#rate' },
    { previa: { url: `${AJAX}?resource=com.ats.sea.visuals.util.GuardarAyudaAjax`, body: CUERPO_AYUDA }, td: 'td#rate' },
    { previa: { url: URL_AYUDA, body: `${CUERPO_AYUDA}&action=aceptar` }, td: 'td#datosBasicos' },
  ]
  for (const c of casos) {
    const escenario = c.td === 'td#rate'
      ? { origen: DATOS, destino: TARIFA, td: TD_RATE, peticion: { url: `${EPAC}${DATOS}`, body: 'vista=datosBasicos&action=aceptar' } }
      : { origen: RIESGO, destino: DATOS, td: TD_DATOS, peticion: { url: `${EPAC}${RIESGO}`, body: 'vista=riesgoMunicipio&action=aceptar&aceptar=S' } }
    const { page, guard, fallos } = await pantalla({ ...escenario, previa: c.previa })
    const etiqueta = `${c.td} ${c.previa.url} ${c.previa.body}`
    await assert.rejects(pulsarAvancePestanaAutorizado(page, guard, c.td), EmisionBloqueadaError, etiqueta)
    assert.ok(guard.violacion(), etiqueta)
    // Capa (b) (`fase`): al mensaje solo origen + ruta + `resource`; ni tokens ni NIF. (La capa (a) `url` cita la URL, como siempre.)
    if (guard.violacion()?.donde === 'fase') assert.ok(!/T1|S1|00000000T/.test(guard.violacion()?.message ?? ''), 'ni tokens ni NIF en el mensaje')
    assert.ok(!/00000000T/.test(guard.violacion()?.message ?? ''), 'el NIF (cuerpo) nunca va al mensaje')
    assert.equal(guard.avance.abierta(), false, etiqueta)
    assert.ok(await hayFallo(page, fallos, (f) => f.includes('/AJAXServlet') && /BLOCKED_BY_CLIENT/.test(f)), `${etiqueta}: ${fallos().join(' | ')}`)
    await page.context().close()
  }
})

test('destinoAvancePermitido: origen + ruta exactos, sin query/fragmento/credenciales', () => {
  const l = [`${EPAC}${DATOS}`]
  assert.equal(destinoAvancePermitido(`${EPAC}${DATOS}`, l), true)
  for (const malo of [
    `${EPAC}${DATOS}?action=store`,
    `${EPAC}${DATOS}#x`,
    `${EPAC}${DATOS};jsessionid=abc`,
    `http://www.e-pacallianz.com${DATOS}`,
    `https://e-pacallianz.com${DATOS}`,
    `https://x@www.e-pacallianz.com${DATOS}`,
    `${EPAC}${TARIFA}`,
    `${EPAC}/drpc18/MotoServlet`,
    `${EPAC}${DATOS}/`,
    'no es una url',
  ]) assert.equal(destinoAvancePermitido(malo, l), false, malo)
})

test('POSITIVO td#datosBasicos (Riesgo municipio → Datos básicos) con red limpia: pulsa una vez, llega y cierra la ventana', async () => {
  const { page, guard, pulsados, fallos } = await pantalla({ origen: RIESGO, destino: DATOS, td: TD_DATOS, peticion: { url: `${EPAC}${RIESGO}`, body: 'vista=riesgoMunicipio&action=aceptar&aceptar=S' } })
  await pulsarAvancePestanaAutorizado(page, guard, 'td#datosBasicos')
  assert.deepEqual(await pulsados(), ['avance'])
  assert.equal(guard.violacion(), null)
  assert.equal(guard.avance.abierta(), false)
  // La petición la dejó pasar el guard (falla en el proxy muerto, NO por bloqueo del cliente).
  assert.ok(await hayFallo(page, fallos, (f) => f.includes(RIESGO) && !/BLOCKED_BY_CLIENT/.test(f)), fallos().join(' | '))
  await page.context().close()
})

test('POSITIVO td#rate (Datos básicos → Tarificar) con red limpia', async () => {
  const { page, guard, pulsados, fallos } = await pantalla({ origen: DATOS, destino: TARIFA, td: TD_RATE, peticion: { url: `${EPAC}${DATOS}`, body: 'vista=datosBasicos&action=aceptar' } })
  await pulsarAvancePestanaAutorizado(page, guard, 'td#rate')
  assert.deepEqual(await pulsados(), ['avance'])
  assert.equal(guard.violacion(), null)
  assert.equal(guard.avance.abierta(), false)
  assert.ok(await hayFallo(page, fallos, (f) => f.includes(DATOS) && !/BLOCKED_BY_CLIENT/.test(f)), fallos().join(' | '))
  // Una vez por trabajo.
  await assert.rejects(pulsarAvancePestanaAutorizado(page, guard, 'td#rate'), EmisionBloqueadaError)
  await page.context().close()
})

test('NEGATIVO: selector fuera de la lista blanca → rechazado sin pulsar', async () => {
  const { page, guard, pulsados } = await pantalla({ origen: DATOS, destino: TARIFA, td: TD_RATE })
  for (const s of ['td#contract', 'td#store', 'td#riesgoMunicipio', 'td#IPID', '#rate', 'td#rate ', '__proto__', 'constructor', 'toString']) {
    await assert.rejects(pulsarAvancePestanaAutorizado(page, guard, s as SelectorAvancePestana), EmisionBloqueadaError, s)
  }
  assert.deepEqual(await pulsados(), [])
  await page.context().close()
})

test('NEGATIVO: el control dice «Emitir» o lleva el manejador de emitir → rechazado sin pulsar', async () => {
  for (const td of [
    `<td id="rate" onclick="goSelected('rate'); aceptar_onclick();">Emitir</td>`,
    `<td id="rate" onclick="goSelected('rate'); validar_aceptar();">Tarificar</td>`,
    `<td id="rate" onclick="goSelected('rate'); aceptar_onclick(); sendActionEvent('store');">Tarificar</td>`,
    `<div id="rate" onclick="goSelected('rate'); aceptar_onclick();">Tarificar</div>`,
  ]) {
    const { page, guard, pulsados } = await pantalla({ origen: DATOS, destino: TARIFA, td })
    await assert.rejects(pulsarAvancePestanaAutorizado(page, guard, 'td#rate'), EmisionBloqueadaError, td)
    assert.deepEqual(await pulsados(), [], td)
    assert.equal(guard.avance.abierta(), false)
    await page.context().close()
  }
})

test('NEGATIVO: pantalla de origen equivocada (td#rate desde Riesgo municipio) → rechazado sin pulsar', async () => {
  const { page, guard, pulsados } = await pantalla({ origen: RIESGO, destino: TARIFA, td: TD_RATE })
  await assert.rejects(pulsarAvancePestanaAutorizado(page, guard, 'td#rate'), EmisionBloqueadaError)
  assert.deepEqual(await pulsados(), [])
  await page.context().close()
})

test('NEGATIVO capa (a): la petición del clic lleva un parámetro de emisión → abortada, el trabajo cae y la ventana se cierra', async () => {
  for (const body of ['action=store', 'action=contract', 'evento=emitir', 'cmd=formalizarPoliza', "x=sendActionEvent('store')", 'x=validar_aceptar()']) {
    const { page, guard, fallos } = await pantalla({ origen: DATOS, destino: TARIFA, td: TD_RATE, peticion: { url: `${EPAC}${DATOS}`, body } })
    await assert.rejects(pulsarAvancePestanaAutorizado(page, guard, 'td#rate'), EmisionBloqueadaError, body)
    assert.ok(guard.violacion(), body)
    assert.equal(guard.avance.abierta(), false, body)
    assert.ok(await hayFallo(page, fallos, (f) => f.includes(DATOS) && /BLOCKED_BY_CLIENT/.test(f)), body)
    await page.context().close()
  }
})

test('NEGATIVO capa (b): POST a un destino no listado → abortado y el trabajo cae', async () => {
  for (const url of [`${EPAC}${TARIFA}`, `${EPAC}/drpc18/MotoServlet`, `${EPAC}${DATOS}?x=1`, 'https://otro.example/drpc18/datosBasicos/control.do']) {
    const { page, guard, fallos } = await pantalla({ origen: DATOS, destino: TARIFA, td: TD_RATE, peticion: { url, body: 'vista=datosBasicos' } })
    await assert.rejects(pulsarAvancePestanaAutorizado(page, guard, 'td#rate'), (e) => e instanceof EmisionBloqueadaError && e.donde === 'fase' && /lista blanca/.test(e.message), url)
    assert.ok(!/\?x=1/.test(guard.violacion()?.message ?? ''), 'la query no va al mensaje')
    assert.ok(await hayFallo(page, fallos, (f) => /BLOCKED_BY_CLIENT/.test(f)), url)
    await page.context().close()
  }
})

test('ventana CERRADA tras el error: después, un POST con «aceptar» al mismo destino vuelve a estar bloqueado', async () => {
  const { page, guard, fallos } = await pantalla({ origen: DATOS, destino: TARIFA, td: TD_RATE, peticion: { url: `${EPAC}${TARIFA}`, body: 'vista=x' } })
  await assert.rejects(pulsarAvancePestanaAutorizado(page, guard, 'td#rate'), EmisionBloqueadaError)
  assert.equal(guard.avance.abierta(), false)
  const antes = fallos().length
  await page.evaluate((u) => fetch(u, { method: 'POST', body: 'action=aceptar' }).catch(() => {}), `${EPAC}${DATOS}`)
  assert.ok(await hayFallo(page, () => fallos().slice(antes), (f) => f.includes(DATOS) && /BLOCKED_BY_CLIENT/.test(f)), fallos().join(' | '))
  await page.context().close()
})

test('NEGATIVO capa (a) acotada: durante la ventana, una NAVEGACIÓN GET con «aceptar» a otra ruta (o a la de la lista con query) se bloquea', async () => {
  for (const url of [`${EPAC}/drpc18/otra/control.do?action=aceptar`, `${EPAC}${DATOS}?action=aceptar`, 'https://otro.example/x?accion=aceptar']) {
    const { page, guard, fallos } = await pantalla({
      origen: DATOS,
      destino: TARIFA,
      td: TD_RATE,
      alClic: `const f = document.createElement('iframe'); f.src = ${JSON.stringify(url)}; document.body.appendChild(f); f.onerror = f.onload = () => document.getElementById('formulari').setAttribute('action', ${JSON.stringify(TARIFA)})`,
    })
    await assert.rejects(pulsarAvancePestanaAutorizado(page, guard, 'td#rate'), EmisionBloqueadaError, url)
    assert.ok(guard.violacion(), url)
    assert.ok(await hayFallo(page, fallos, (f) => /^GET /.test(f) && /BLOCKED_BY_CLIENT/.test(f)), `${url}: ${fallos().join(' | ')}`)
    assert.equal(guard.avance.abierta(), false)
    await page.context().close()
  }
})

test('NEGATIVO: el portal pide confirmación (confirm) → NO se acepta, el trabajo cae y la ventana se cierra; un alert → datos', async () => {
  {
    const { page, guard } = await pantalla({ origen: DATOS, destino: TARIFA, td: TD_RATE, alClic: `window.confirmado = confirm('¿Desea grabar el proyecto?')` })
    await assert.rejects(pulsarAvancePestanaAutorizado(page, guard, 'td#rate'), (e) => e instanceof EmisionBloqueadaError && /confirmaci/.test(e.message))
    assert.equal(await page.evaluate(() => (window as unknown as { confirmado?: boolean }).confirmado), false, 'el confirm se descartó')
    assert.equal(guard.avance.abierta(), false)
    await page.context().close()
  }
  {
    const { page, guard } = await pantalla({ origen: DATOS, destino: TARIFA, td: TD_RATE, alClic: `alert('Falta la fecha de carné del conductor 12345678Z')` })
    await assert.rejects(pulsarAvancePestanaAutorizado(page, guard, 'td#rate'), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && /fecha de carn/.test(e.message) && !/12345678Z/.test(e.message))
    assert.equal(guard.avance.abierta(), false)
    await page.context().close()
  }
})

test('el portal RECHAZA el avance (informe de incidencias, el form no cambia) → enseguida ErrorAvanceSinLlegar; el adaptador lo da como datos con el mensaje del portal', async () => {
  const informe = `document.body.insertAdjacentHTML('beforeend', '<div id="errorSection"><div id="dataErrorSection"><table><tbody><tr class="rowAppErrorTextBlock"><td>&nbsp;01&nbsp;<b>sexo</b></td><td>&nbsp;El sexo del conductor es obligatorio</td></tr></tbody></table></div></div>')`
  {
    const { page, guard } = await pantalla({ origen: DATOS, destino: TARIFA, td: TD_RATE, alClic: informe })
    const t0 = Date.now()
    await assert.rejects(pulsarAvancePestanaAutorizado(page, guard, 'td#rate'), (e) => e instanceof ErrorAvanceSinLlegar && e.tipo === 'portal' && e.marcos.length === 1)
    assert.ok(Date.now() - t0 < 5_000, 'no espera al tope de 20 s')
    assert.equal(guard.avance.abierta(), false)
    await page.context().close()
  }
  {
    const { page, guard } = await pantalla({ origen: DATOS, destino: TARIFA, td: TD_RATE, alClic: informe })
    const ctx = { avanzarPestanaAutorizada: (s: SelectorAvancePestana) => pulsarAvancePestanaAutorizado(page, guard, s) }
    await assert.rejects(avanzarPestanaGuardada(page, ctx as never, 'tarificar', 'moto'), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && /sexo del conductor es obligatorio/.test(e.message))
    await page.context().close()
  }
})

test('al llegar devuelve el marco del formulario de DESTINO', async () => {
  const { page, guard } = await pantalla({ origen: RIESGO, destino: DATOS, td: TD_DATOS })
  const f = await pulsarAvancePestanaAutorizado(page, guard, 'td#datosBasicos')
  assert.equal(await f.locator('form#formulari').getAttribute('action'), DATOS)
  await page.context().close()
})

test('motivoAjaxRechazado: dice QUÉ no cuadró (método/host/ruta/query/cuerpo/forma) y NUNCA un valor', () => {
  const l = AJAX_LECTURA_ALLIANZ
  assert.equal(motivoAjaxRechazado('POST', URL_AYUDA, CUERPO_AYUDA, l), null)
  const casos: Array<[string, string, string | null, RegExp]> = [
    ['GET', URL_AYUDA, CUERPO_AYUDA, /método GET/],
    ['POST', URL_AYUDA.replace('www.', ''), CUERPO_AYUDA, /host distinto.*www/],
    ['POST', URL_AYUDA.replace('e-pacallianz.com', 'otro.example'), CUERPO_AYUDA, /host distinto.*otro dominio/],
    ['POST', URL_AYUDA.replace('/AJAXServlet', '/Otro'), CUERPO_AYUDA, /ruta distinta/],
    ['POST', URL_AYUDA.replace('https:', 'http:'), CUERPO_AYUDA, /protocolo/],
    ['POST', `${AJAX}?resource=pt.allianz.EmitirPolizaAjax`, CUERPO_AYUDA, /resource fuera de la lista blanca/],
    ['POST', `${URL_AYUDA}&accionSecreta=1`, CUERPO_AYUDA, /clave de query no permitida: accionSecreta/],
    ['POST', URL_AYUDA, 'pageId=x&codCia=9&nif=00000000T', /clave de cuerpo no permitida: nif/],
    ['POST', URL_AYUDA, 'pageId=x', /falta clave de cuerpo: codCia/],
    ['POST', URL_AYUDA, 'pageId=a b c&codCia=9', /forma de valor de cuerpo no permitida en «pageId» \(longitud 5, letras\+espacios\)/],
    ['POST', URL_AYUDA, '{"pageId":"x","codCia":"9"}', /no urlencoded/],
    ['POST', URL_AYUDA, '--b\r\nContent-Disposition: form-data; name="pageId"', /no urlencoded/],
    ['POST', URL_AYUDA, null, /cuerpo vacío/],
  ]
  for (const [m, u, c, re] of casos) {
    const motivo = motivoAjaxRechazado(m, u, c, l)
    assert.match(motivo ?? '', re, `${m} ${u}`)
    assert.ok(!/00000000T|a b c|accionSecreta=1|riesgoMunicipio|datosBasicos\$/.test(motivo ?? '') || /accionSecreta/.test(motivo ?? ''), 'ningún valor en el motivo')
  }
  assert.doesNotMatch(motivoAjaxRechazado('POST', URL_AYUDA, 'pageId=00000000T x&codCia=9', l) ?? '', /00000000T/)
})

test('NEGATIVO: el mensaje del guard para un AJAX rechazado lleva el motivo y la pestaña de origen, sin valores', async () => {
  const { page, guard } = await pantalla({
    origen: RIESGO,
    destino: DATOS,
    td: TD_DATOS,
    previa: { url: URL_AYUDA, body: 'pageId=00000000T x&codCia=9' },
    peticion: { url: `${EPAC}${RIESGO}`, body: 'vista=riesgoMunicipio&action=aceptar&aceptar=S' },
  })
  await assert.rejects(pulsarAvancePestanaAutorizado(page, guard, 'td#datosBasicos'), EmisionBloqueadaError)
  const msg = guard.violacion()?.message ?? ''
  assert.match(msg, /resource=com\.ats\.sea\.visuals\.util\.AyudaAplicacionesAjax\)/)
  assert.match(msg, /\[motivo: forma de valor de cuerpo no permitida en «pageId» \(longitud 11, letras\+dígitos\+espacios\)\]/)
  assert.match(msg, /\[pestaña de origen: \/drpc18\/riesgoMunicipio\/control\.do\]/)
  assert.ok(!/00000000T/.test(msg), 'ni el valor del cuerpo')
  await page.context().close()
})
