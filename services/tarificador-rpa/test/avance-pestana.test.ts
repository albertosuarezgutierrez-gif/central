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
  AVANCES_PESTANA_AUTORIZADOS,
  ErrorAvanceSinLlegar,
  ajaxValidacionAvancePermitida,
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

test('ajaxValidacion: SOLO td#datosBasicos lleva la lista negra del NIF; td#rate, ninguna', () => {
  assert.deepEqual(AVANCES_PESTANA_AUTORIZADOS['td#datosBasicos'].ajaxValidacion, [AJAX_LISTA_NEGRA_NIF_ALLIANZ])
  assert.deepEqual(AVANCES_PESTANA_AUTORIZADOS['td#rate'].ajaxValidacion, [])
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
