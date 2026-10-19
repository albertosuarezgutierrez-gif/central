// Relevo del código SMS de Okta (Generali) por Telegram (19/10/2026). Puros + portal SINTÉTICO (ningún dato real; el código
// «482913» es inventado y se comprueba que no sale en logs, mensajes ni pantalla tras un fallo).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { chromium, type Browser, type Page } from 'playwright'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import { ParCodigoSms, sellarCodigoSms } from '@central/module-tarificacion/servidor'
import { CodigoSms, esperarCodigoSms, relevarCodigoSmsGenerali, type PuertoCodigoSms, type RespuestaRecoger } from '../src/relevo-sms.ts'
import { ErrorMapaGuardGenerali, esUrlOktaSmsGenerali, instalarGuardEmision, pulsarEnviarSmsGenerali, verificarCodigoSmsGenerali, type GuardEmision } from '../src/guard.ts'
import { ErrorCodigoSmsPendiente, ErrorVerificacionHumana, MOTIVO_VERIFICACION_HUMANA, clasificar } from '../src/errores.ts'

const TRABAJO = '11111111-2222-4333-8444-555555555555'
const CODIGO = '482913'

// ───────────────────────── puros ─────────────────────────

test('la pantalla del SMS: origen y ruta EXACTOS de Okta de Generali', () => {
  assert.equal(esUrlOktaSmsGenerali('https://access.generali.es/signin/verify/okta/sms'), true)
  assert.equal(esUrlOktaSmsGenerali('https://access.generali.es/signin/verify/okta/sms/'), true)
  assert.equal(esUrlOktaSmsGenerali('https://access.generali.es/signin/verify/okta/push'), false)
  assert.equal(esUrlOktaSmsGenerali('https://access.generali.es.evil.com/signin/verify/okta/sms'), false)
  assert.equal(esUrlOktaSmsGenerali('http://access.generali.es/signin/verify/okta/sms'), false)
  assert.equal(esUrlOktaSmsGenerali('https://u:p@access.generali.es/signin/verify/okta/sms'), false)
  assert.equal(esUrlOktaSmsGenerali('no es url'), false)
})

test('el error de «SMS pendiente» es, para todo lo demás, una verificación humana (requiere_humano)', () => {
  const e = new ErrorCodigoSmsPendiente('generali')
  assert.ok(e instanceof ErrorVerificacionHumana)
  assert.equal(clasificar(e).tipo, 'captcha')
  assert.ok(e.message.startsWith(`${MOTIVO_VERIFICACION_HUMANA}:`))
})

test('el código abierto no se serializa', () => {
  const c = new CodigoSms(CODIGO)
  assert.equal(JSON.stringify({ c }), '{"c":"[codigo-sms]"}')
  assert.equal(inspect(c), '[codigo-sms]')
  assert.equal(`${c}`, '[codigo-sms]')
  assert.equal(c.valor, CODIGO)
})

/** Puerto falso: guarda el orden de las llamadas; `entregas` dice qué devuelve cada sondeo. */
function puertoFalso(o: { pedir?: 'ok' | 'no' | 'lanza'; entregas: (RespuestaRecoger | 'lanza')[]; orden?: string[] }): PuertoCodigoSms & { publica: string | null; sondeos: number } {
  const p = {
    publica: null as string | null,
    sondeos: 0,
    async pedir(publica: string) {
      o.orden?.push('pedir')
      p.publica = publica
      if (o.pedir === 'lanza') throw new Error('red')
      return o.pedir === 'no' ? { estado: 'no_disponible' as const, motivo: 'codigo_sms_sin_activar' } : { estado: 'pedido' as const, leaseHasta: '2099-01-01T00:00:00.000Z' }
    },
    async recoger() {
      const r = o.entregas[Math.min(p.sondeos++, o.entregas.length - 1)]!
      if (r === 'lanza') throw new Error('red')
      return r
    },
  }
  return p
}

function reloj() {
  let t = 0
  return { ahora: () => t, dormir: async (ms: number) => { t += ms } }
}

test('esperar: canal no disponible → NO se manda el SMS (antesDeEsperar no corre)', async () => {
  for (const pedir of ['no', 'lanza'] as const) {
    let enviado = 0
    const r = await esperarCodigoSms({ puerto: puertoFalso({ pedir, entregas: [{ estado: 'esperando' }] }), par: { publica: 'x', abrir: () => null }, antesDeEsperar: async () => { enviado++ }, ...reloj() })
    assert.deepEqual(r, { ok: false, motivo: 'canal_no_disponible' })
    assert.equal(enviado, 0)
  }
})

test('esperar: la red caída al sondear NO es «no hay código»; llega a los 3 sondeos y se abre con el par', async () => {
  const par = new ParCodigoSms()
  const prorrogas: (string | null)[] = []
  const puerto = puertoFalso({ entregas: ['lanza', { estado: 'esperando' }, { estado: 'listo', sello: 'PENDIENTE', leaseHasta: '2099-01-02T00:00:00.000Z' }] })
  const orig = puerto.recoger.bind(puerto)
  puerto.recoger = async () => {
    const r = await orig()
    return r.estado === 'listo' ? { ...r, sello: sellarCodigoSms(CODIGO, puerto.publica!, TRABAJO) } : r
  }
  const r = await esperarCodigoSms({ puerto, par: { publica: par.publica, abrir: (s) => par.abrir(s, TRABAJO) }, prorrogar: (l) => prorrogas.push(l), ...reloj() })
  assert.ok(r.ok)
  assert.equal(r.ok && r.codigo.valor, CODIGO)
  assert.equal(puerto.sondeos, 3)
  assert.deepEqual(prorrogas, ['2099-01-01T00:00:00.000Z', '2099-01-02T00:00:00.000Z'], 'el lease se prorroga al pedir y al recibir')
})

test('esperar: sin código en el tope → sin_respuesta; petición cerrada → fin; sello ajeno → sello_invalido', async () => {
  const sin = await esperarCodigoSms({ puerto: puertoFalso({ entregas: [{ estado: 'esperando' }] }), par: { publica: 'x', abrir: () => null }, esperaMs: 20_000, cadaMs: 4_000, ...reloj() })
  assert.deepEqual(sin, { ok: false, motivo: 'sin_respuesta' })
  const fin = await esperarCodigoSms({ puerto: puertoFalso({ entregas: [{ estado: 'fin', motivo: 'caducada' }] }), par: { publica: 'x', abrir: () => null }, ...reloj() })
  assert.deepEqual(fin, { ok: false, motivo: 'fin' })
  const otro = new ParCodigoSms()
  const ajeno = sellarCodigoSms(CODIGO, otro.publica, TRABAJO)
  const par = new ParCodigoSms()
  const mal = await esperarCodigoSms({ puerto: puertoFalso({ entregas: [{ estado: 'listo', sello: ajeno, leaseHasta: null }] }), par: { publica: par.publica, abrir: (s) => par.abrir(s, TRABAJO) }, ...reloj() })
  assert.deepEqual(mal, { ok: false, motivo: 'sello_invalido' })
})

// ───────────────────────── portal sintético ─────────────────────────

let browser: Browser
before(async () => {
  try {
    browser = await chromium.launch({ headless: true })
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'chrome') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ headless: true, executablePath: exe })
  }
})
after(async () => {
  await browser?.close()
})

const SMS = 'https://access.generali.es/signin/verify/okta/sms'
const PORTAL = 'https://www.generali.es/arq_genernetPortalFormWeb/CorredorInicio.po'

/** La pantalla de la captura de Alberto: «Introducir código», casilla de 30 días, «Verificar» y el enlace «Enviar». */
const OKTA = (o: { enviar?: string; casilla?: boolean } = {}) => `<h2>Autenticación por SMS</h2>
  <a href="#" onclick="window.__enviado=(window.__enviado||0)+1;window.__orden=(window.__orden||[]).concat('enviar');return false">${o.enviar ?? 'Enviar'}</a>
  <label for="c">Introducir código</label><input id="c" name="answer" type="text">
  ${o.casilla === false ? '' : '<input id="r" type="checkbox"><label for="r">No volver a solicitar en este dispositivo en 30 días</label>'}
  <input type="submit" value="Verificar" onclick="window.__casilla=document.getElementById('r')?.checked;if(document.getElementById('c').value==='${CODIGO}'){location.href='${PORTAL}'}else{document.body.insertAdjacentHTML('beforeend','<p>Código incorrecto</p>')};return false">`

async function abrirOkta(html: string): Promise<{ page: Page; guard: GuardEmision; cerrar: () => Promise<void> }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.route('https://access.generali.es/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><body>${html}</body>` }))
  await page.route('https://www.generali.es/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><body><h3>SELECCIONAR MEDIADOR</h3></body>' }))
  await page.goto(SMS)
  return { page, guard, cerrar: () => context.close() }
}

/** Puerto que entrega el código SELLADO para la pública que le pidieron, en el `n`-ésimo sondeo. */
function puertoQueEntrega(codigo: string | null, n = 2, orden?: string[]) {
  const p = puertoFalso({ entregas: [{ estado: 'esperando' }], orden })
  let vistos = 0
  p.recoger = async () => {
    vistos++
    if (codigo === null || vistos < n) return { estado: 'esperando' }
    return { estado: 'listo', sello: sellarCodigoSms(codigo, p.publica!, TRABAJO), leaseHasta: null }
  }
  return p
}

test('relevo (portal sintético): pide ANTES de enviar, «Enviar» una vez, marca los 30 días, escribe, «Verificar» y sale', async () => {
  const { page, guard, cerrar } = await abrirOkta(OKTA())
  const logs: string[] = []
  const orden: string[] = []
  try {
    const puerto = puertoQueEntrega(CODIGO, 2, orden)
    const pedirOrig = puerto.pedir.bind(puerto)
    puerto.pedir = async (pub) => {
      const r = await pedirOrig(pub)
      assert.equal(await page.evaluate(() => (window as unknown as { __enviado?: number }).__enviado ?? 0), 0, 'el SMS no se manda antes de apuntar la petición')
      return r
    }
    const r = await relevarCodigoSmsGenerali(page, guard, { compania: 'generali', trabajoId: TRABAJO, puerto, log: (m, d) => logs.push(JSON.stringify({ m, d })), cadaMs: 10, esperaMs: 5_000 })
    assert.deepEqual(r, { ok: true, recordado: true })
    assert.equal(page.url(), PORTAL)
    assert.ok(!logs.join('\n').includes(CODIGO), 'el código no va a los logs')
  } finally {
    await cerrar()
  }
})

test('relevo: la casilla está MARCADA en el momento de «Verificar» y «Enviar» se pulsa una sola vez', async () => {
  // Variante que no navega: así se puede leer lo que había al pulsar.
  const html = OKTA().replace(`location.href='${PORTAL}'`, "window.__ok=true")
  const { page, guard, cerrar } = await abrirOkta(html)
  try {
    assert.equal(await pulsarEnviarSmsGenerali(page, guard), true)
    await assert.rejects(pulsarEnviarSmsGenerali(page, guard), EmisionBloqueadaError, '«Enviar» una vez por trabajo')
    const v = await verificarCodigoSmsGenerali(page, guard, CODIGO)
    assert.equal(v.recordado, true)
    const w = await page.evaluate(() => ({ casilla: (window as unknown as { __casilla?: boolean }).__casilla, ok: (window as unknown as { __ok?: boolean }).__ok, enviado: (window as unknown as { __enviado?: number }).__enviado }))
    assert.deepEqual(w, { casilla: true, ok: true, enviado: 1 })
    await assert.rejects(verificarCodigoSmsGenerali(page, guard, CODIGO), EmisionBloqueadaError, '«Verificar» una vez por trabajo')
  } finally {
    await cerrar()
  }
})

test('relevo: código rechazado → requiere_humano claro, sin el código en el mensaje y con el campo VACÍO', async () => {
  const { page, guard, cerrar } = await abrirOkta(OKTA())
  try {
    const r = await relevarCodigoSmsGenerali(page, guard, { compania: 'generali', trabajoId: TRABAJO, puerto: puertoQueEntrega('111111', 1), log: () => undefined, cadaMs: 10, esperaMs: 5_000, esperaVerificarMs: 800 })
    assert.equal(r.ok, false)
    const e = r.ok ? null : r.error
    assert.ok(e instanceof ErrorVerificacionHumana)
    assert.match(e!.message, /^requiere_verificacion_humana: Generali no aceptó el código SMS/)
    assert.ok(!e!.message.includes('111111'))
    assert.equal(await page.locator('#c').inputValue(), '', 'el código no se queda en la pantalla (captura/HTML de evidencia)')
  } finally {
    await cerrar()
  }
})

test('relevo: sin código a tiempo → requiere_humano «no llegó por Telegram», «Enviar» pulsado una vez y nada escrito', async () => {
  const { page, guard, cerrar } = await abrirOkta(OKTA())
  try {
    const r = await relevarCodigoSmsGenerali(page, guard, { compania: 'generali', trabajoId: TRABAJO, puerto: puertoQueEntrega(null), log: () => undefined, cadaMs: 20, esperaMs: 150 })
    assert.equal(r.ok, false)
    assert.match(r.ok ? '' : r.error.message, /no llegó por Telegram a tiempo/)
    assert.equal(await page.evaluate(() => (window as unknown as { __enviado?: number }).__enviado), 1)
    assert.equal(await page.locator('#c').inputValue(), '')
  } finally {
    await cerrar()
  }
})

test('guard Okta: fuera de la pantalla del SMS no pulsa; dos «Enviar» = hueco; otro texto no es «Enviar»; sin «Enviar» no pulsa nada', async () => {
  const { page, guard, cerrar } = await abrirOkta(OKTA())
  try {
    await page.goto(PORTAL)
    await assert.rejects(pulsarEnviarSmsGenerali(page, guard), ErrorMapaGuardGenerali)
    await assert.rejects(verificarCodigoSmsGenerali(page, guard, CODIGO), ErrorMapaGuardGenerali)
  } finally {
    await cerrar()
  }
  const dos = await abrirOkta(OKTA() + '<a href="#">Enviar</a>')
  try {
    await assert.rejects(pulsarEnviarSmsGenerali(dos.page, dos.guard), ErrorMapaGuardGenerali)
    assert.equal(await dos.page.evaluate(() => (window as unknown as { __enviado?: number }).__enviado ?? 0), 0)
  } finally {
    await dos.cerrar()
  }
  const otro = await abrirOkta(OKTA({ enviar: 'Enviar y contratar' }))
  try {
    assert.equal(await pulsarEnviarSmsGenerali(otro.page, otro.guard), false, 'texto distinto = no es el control de la lista blanca')
    assert.equal(await otro.page.evaluate(() => (window as unknown as { __enviado?: number }).__enviado ?? 0), 0)
  } finally {
    await otro.cerrar()
  }
})

test('guard Okta: un código sin forma no se escribe; sin casilla se verifica igual pero no se recuerda', async () => {
  const { page, guard, cerrar } = await abrirOkta(OKTA({ casilla: false }).replace(`location.href='${PORTAL}'`, 'window.__ok=true'))
  try {
    await assert.rejects(verificarCodigoSmsGenerali(page, guard, '12 34'), /4-8 dígitos/)
    assert.equal(await page.locator('#c').inputValue(), '')
  } finally {
    await cerrar()
  }
  const sin = await abrirOkta(OKTA({ casilla: false }).replace(`location.href='${PORTAL}'`, 'window.__ok=true'))
  try {
    assert.deepEqual(await verificarCodigoSmsGenerali(sin.page, sin.guard, CODIGO), { recordado: false })
    assert.equal(await sin.page.evaluate(() => (window as unknown as { __ok?: boolean }).__ok), true)
  } finally {
    await sin.cerrar()
  }
})
