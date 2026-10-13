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
import {
  AVANCES_PESTANA_AUTORIZADOS,
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
        const pet = ${JSON.stringify(e.peticion ?? null)}
        const llegar = () => document.getElementById('formulari').setAttribute('action', ${JSON.stringify(e.destino)})
        if (!pet) return llegar()
        fetch(pet.url, { method: 'POST', body: pet.body, headers: { 'content-type': 'application/x-www-form-urlencoded' } }).catch(() => {}).finally(llegar)
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
