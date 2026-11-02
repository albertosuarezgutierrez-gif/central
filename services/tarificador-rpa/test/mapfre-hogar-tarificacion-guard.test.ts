// Mapfre hogar 0.3.2 (02/11/2026, run real): «SIGUIENTE» en «Datos de riesgo - Hogar» lanza la XHR que CALCULA el precio y Mapfre la sirve
// bajo `/api/emision/…`. TARIFICAR ≠ EMITIR: solo la ruta EXACTA de tarificación pasa el guard; cualquier variante con emitir, contratar,
// póliza, confirmar o pago sigue bloqueada. Sin red real: el guard decide en `context.route` y lo que pasa muere en un proxy local cerrado.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { instalarGuardEmision, neutralizarTarificacionProyectoMapfre, URL_TARIFICACION_PROYECTO_MAPFRE } from '../src/guard.ts'

const ORIGEN = 'https://wmediadores.mapfre.com'
const BASE = `${ORIGEN}/PortalMediadores_fe-web/api/emision`
const REAL = `${URL_TARIFICACION_PROYECTO_MAPFRE}?200305&primeraTarificacion=true`

const BLOQUEADAS = [
  `${BASE}/proyectos/emitir`,
  `${BASE}/proyectos/tarificacion/emitir`,
  `${BASE}/proyectos/contratar`,
  `${BASE}/proyectos/tarificacion/contratar?200305`,
  `${BASE}/polizas`,
  `${BASE}/proyectos/poliza`,
  `${BASE}/proyectos/confirmar`,
  `${BASE}/proyectos/tarificacion/confirmar`,
  `${BASE}/proyectos/pago`,
  `${BASE}/proyectos/pagar`,
  `${BASE}/proyectos/tarificacion2`,
  `${BASE}/proyectos/tarificacionYEmision`,
  `${BASE}/proyectos`,
  `${BASE}/tarificacion`,
  `${URL_TARIFICACION_PROYECTO_MAPFRE}?accion=emitir`,
  `${URL_TARIFICACION_PROYECTO_MAPFRE}?200305&contratar=true`,
  `${URL_TARIFICACION_PROYECTO_MAPFRE}?emitirPoliza=1`,
  `${URL_TARIFICACION_PROYECTO_MAPFRE}?paso=confirmar`,
  `${URL_TARIFICACION_PROYECTO_MAPFRE}?formaPago=tarjeta`,
  `${URL_TARIFICACION_PROYECTO_MAPFRE}?poliza=1`,
  `${URL_TARIFICACION_PROYECTO_MAPFRE}?iban=ES00`,
  `${URL_TARIFICACION_PROYECTO_MAPFRE};jsessionid=abc`,
  `${URL_TARIFICACION_PROYECTO_MAPFRE}#emitir`,
  `${URL_TARIFICACION_PROYECTO_MAPFRE.replace('tarificacion', 'tarificaci%6Fn')}`,
  'https://otro.mapfre.com/PortalMediadores_fe-web/api/emision/proyectos/tarificacion',
  'http://wmediadores.mapfre.com/PortalMediadores_fe-web/api/emision/proyectos/tarificacion',
  'https://u:p@wmediadores.mapfre.com/PortalMediadores_fe-web/api/emision/proyectos/tarificacion',
]

test('0.3.2 · pura: la URL real de tarificar se neutraliza (solo la ruta); la query se conserva', () => {
  const n = neutralizarTarificacionProyectoMapfre(REAL)
  assert.ok(n)
  assert.doesNotMatch(n!, /emisi/i)
  assert.match(n!, /\?200305&primeraTarificacion=true$/)
  assert.ok(neutralizarTarificacionProyectoMapfre(URL_TARIFICACION_PROYECTO_MAPFRE))
})

test('0.3.2 · pura: variantes con emitir/contratar/póliza/confirmar/pago u otra ruta NO se neutralizan', () => {
  for (const u of BLOQUEADAS) assert.equal(neutralizarTarificacionProyectoMapfre(u), null, u)
})

let browser: Browser
before(async () => {
  try {
    browser = await chromium.launch({ headless: true })
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ headless: true, executablePath: exe })
  }
})
after(async () => browser?.close())

/**
 * POST a `url`; devuelve la violación del guard (o null) y el error de red. El contexto va por un proxy MUERTO (127.0.0.1:9): lo que el
 * guard deja pasar falla con ERR_PROXY_*, nunca sale a Internet (no se toca Mapfre); lo que aborta el guard falla con ERR_BLOCKED_BY_CLIENT.
 */
async function postDesdeMapfre(url: string, cuerpo = 'cp=41003'): Promise<{ violacion: string | null; error: string }> {
  const context = await browser.newContext({ proxy: { server: 'http://127.0.0.1:9' } })
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  const fallo = page.waitForEvent('requestfailed', { predicate: (r) => r.url() === url, timeout: 10_000 })
  await page.evaluate(([u, b]) => { void fetch(u, { method: 'POST', mode: 'no-cors', body: b }).catch(() => null) }, [url, cuerpo] as const)
  const error = (await fallo).failure()?.errorText ?? ''
  const v = guard.violacion()
  await context.close()
  return { violacion: v ? v.message : null, error }
}

test('0.3.2 · guard de red: el POST real de tarificar de hogar PASA', async () => {
  const r = await postDesdeMapfre(REAL)
  assert.equal(r.violacion, null)
  assert.doesNotMatch(r.error, /BLOCKED_BY_CLIENT/)
})

test('0.3.2 · guard de red: variantes de emitir/contratar/póliza/confirmar/pago siguen ABORTADAS', async () => {
  for (const u of [
    `${BASE}/proyectos/emitir`,
    `${BASE}/proyectos/tarificacion/contratar?200305`,
    `${BASE}/polizas`,
    `${BASE}/proyectos/tarificacion/confirmar`,
    `${BASE}/proyectos/pagar`,
    `${URL_TARIFICACION_PROYECTO_MAPFRE}?accion=emitir`,
    `${URL_TARIFICACION_PROYECTO_MAPFRE}?paso=confirmar`,
    `${URL_TARIFICACION_PROYECTO_MAPFRE}?formaPago=tarjeta`,
  ]) {
    const r = await postDesdeMapfre(u)
    assert.match(r.violacion ?? '', /^guard_emision: url bloqueada/, u)
    assert.match(r.error, /BLOCKED_BY_CLIENT/, u)
  }
})

test('0.3.2 · guard de red: la ruta exacta con una ACCIÓN de emisión en el cuerpo sigue ABORTADA', async () => {
  const r = await postDesdeMapfre(REAL, 'accion=emitir')
  assert.match(r.violacion ?? '', /acción en el cuerpo/)
  assert.match(r.error, /BLOCKED_BY_CLIENT/)
})
