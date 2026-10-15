// Cepos del LOGIN de Mapfre (wmediadores) con portales SINTÉTICOS en 127.0.0.1 (el resto de la red, a un proxy muerto).
// Sin datos personales: usuario y contraseña son literales de prueba que no existen en ningún portal.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { instalarGuardEmision, pulsar, type GuardEmision } from '../src/guard.ts'
import { exigirSinCaptcha } from '../src/captcha.ts'
import { ErrorTarificador, ErrorVerificacionHumana, clasificarIntento } from '../src/errores.ts'
import { ErrorCredenciales } from '../src/credenciales.ts'
import { login, BOTON_ENTRAR, TEXTO_PROHIBIDO } from '../src/adapters/mapfre/login.ts'
import { ErrorMapaIncompleto } from '../src/adapters/mapfre/auto.ts'
import { PORTALES_EXPLORACION } from '../src/explorador.ts'

const USUARIO = 'usuario-prueba'
const CLAVE = ['clave', 'sintetica', 'de', 'prueba'].join('-')

/** Login SPA sintético: el formulario se pinta tras un momento; al enviar, según la ruta, entra / pide SMS / pide CAPTCHA / rechaza. */
const LOGIN = (destino: string) => `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script>
setTimeout(function () {
  document.getElementById('app').innerHTML = '<form id="f"><label>Identificador</label><input type="text" name="u" id="u">'
    + '<label>Contraseña</label><input type="password" name="p" id="p"><a href="#">¿Olvidó su contraseña?</a>'
    + '<button type="button" id="ok">Acceder</button></form>';
  document.getElementById('ok').onclick = function () {
    var u = document.getElementById('u').value, p = document.getElementById('p').value;
    if (!u || !p) return;
    var d = ${JSON.stringify(destino)};
    document.getElementById('app').innerHTML = d === 'dentro' ? '<h1>Bienvenido</h1>'
      : d === 'sms' ? '<p>Te hemos enviado un código de verificación</p><input type="text" name="otp">'
      : d === 'captcha' ? '<div class="g-recaptcha"></div>'
      : d === 'bloqueo' ? '<form><input type="password" name="p"><p>Su usuario ha sido bloqueado por demasiados intentos</p></form>'
      : d === 'caducada' ? '<form><input type="password" name="p"><p>Su contraseña ha caducado. Debe cambiar su contraseña para continuar</p></form>'
      : '<form><input type="password" name="p"><p>Datos incorrectos</p></form>';
  };
}, 300);
</script></body></html>`

/** Pantalla REAL sintetizada: «Acceso», etiquetas, «Entrar» deshabilitado hasta rellenar ambos, «Cambiar contraseña». */
const REAL = (habilita: boolean) => `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script>
setTimeout(function () {
  document.getElementById('app').innerHTML = '<h2>Acceso</h2><form id="f"><label>Código de usuario (NUUMA)</label><input type="text" id="u">'
    + '<label>Contraseña:</label><input type="password" id="p"><a href="#" id="cc">Cambiar contraseña</a>'
    + '<button type="button" id="ok" disabled>Entrar</button></form>';
  var u = document.getElementById('u'), p = document.getElementById('p'), ok = document.getElementById('ok');
  window.__cc = 0; document.getElementById('cc').onclick = function () { window.__cc++; };
  function chk() { ok.disabled = !(${habilita} && u.value && p.value); }
  u.addEventListener('input', chk); p.addEventListener('input', chk);
  ok.onclick = function () { document.getElementById('app').innerHTML = '<h1>Bienvenido</h1>'; };
}, 300);
</script></body></html>`

const SIN_CAMPOS = '<!doctype html><html><body><p>Mantenimiento</p></body></html>'

let servidor: Server
let base = ''
let browser: Browser
before(async () => {
  servidor = createServer((req, res) => {
    const ruta = (req.url ?? '/').split('?')[0]!.slice(1)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(ruta === 'vacio' ? SIN_CAMPOS : ruta === 'real' ? REAL(true) : ruta === 'real-nunca' ? REAL(false) : LOGIN(ruta))
  })
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
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
  await new Promise<void>((r) => servidor.close(() => r()))
})

async function abrir(): Promise<{ context: BrowserContext; page: Page; ctx: Parameters<typeof login>[1] }> {
  const context = await browser.newContext()
  const guard: GuardEmision = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  const ctx = {
    credenciales: { usuario: USUARIO, contrasena: CLAVE },
    pausa: async () => undefined,
    pulsar: (b: Parameters<typeof pulsar>[0]) => pulsar(b, guard),
    exigirSinCaptcha: () => exigirSinCaptcha(page),
    log: () => undefined,
  } as Parameters<typeof login>[1]
  return { context, page, ctx }
}

test('éxito: rellena, pulsa «Acceder» y el formulario desaparece', async () => {
  const { context, page, ctx } = await abrir()
  try {
    await login(page, ctx, `${base}/dentro`)
    assert.match(await page.locator('body').innerText(), /Bienvenido/)
  } finally {
    await context.close()
  }
})

test('sin campos de login → ErrorMapaIncompleto (fail-closed, nada se rellena)', async () => {
  const { context, page, ctx } = await abrir()
  try {
    await assert.rejects(
      () => login(page, { ...ctx }, `${base}/vacio`),
      (e: unknown) => e instanceof ErrorMapaIncompleto,
    )
  } finally {
    await context.close()
  }
})

test('pantalla de SMS/código tras enviar → ErrorVerificacionHumana (no se automatiza el código)', async () => {
  const { context, page, ctx } = await abrir()
  try {
    await assert.rejects(
      () => login(page, ctx, `${base}/sms`),
      (e: unknown) => e instanceof ErrorVerificacionHumana && /Mapfre pide verificación/.test((e as Error).message),
    )
    // No se tocó el campo del código.
    assert.equal(await page.locator('input[name="otp"]').inputValue(), '')
  } finally {
    await context.close()
  }
})

test('CAPTCHA tras enviar → ErrorTarificador(captcha)', async () => {
  const { context, page, ctx } = await abrir()
  try {
    await assert.rejects(
      () => login(page, ctx, `${base}/captcha`),
      (e: unknown) => e instanceof ErrorTarificador && (e as ErrorTarificador).tipo === 'captcha',
    )
  } finally {
    await context.close()
  }
})

test('credenciales rechazadas → ErrorTarificador(credenciales), un solo intento', { timeout: 60_000 }, async () => {
  const { context, page, ctx } = await abrir()
  let pulsaciones = 0
  const pul = ctx.pulsar
  ctx.pulsar = async (b) => { pulsaciones++; await pul(b) }
  try {
    await assert.rejects(
      () => login(page, ctx, `${base}/rechazo`),
      (e: unknown) => e instanceof ErrorTarificador && (e as ErrorTarificador).tipo === 'credenciales',
    )
    assert.equal(pulsaciones, 1)
  } finally {
    await context.close()
  }
})

for (const [ruta, motivo] of [['rechazo', 'rechazadas'], ['bloqueo', 'bloqueada'], ['caducada', 'caducada']] as const) {
  test(`login rechazado (${motivo}) → ErrorCredenciales(${motivo}), NO reintentable, un solo envío, sin usuario ni clave en el mensaje`, { timeout: 60_000 }, async () => {
    const { context, page, ctx } = await abrir()
    let pulsaciones = 0
    const pul = ctx.pulsar
    ctx.pulsar = async (b) => { pulsaciones++; await pul(b) }
    try {
      await assert.rejects(
        () => login(page, ctx, `${base}/${ruta}`),
        (e: unknown) => {
          if (!(e instanceof ErrorCredenciales) || e.tipo !== 'credenciales' || e.motivo !== motivo) return false
          assert.equal(clasificarIntento(e, { logueado: true, loginVisible: true, ultimo5xx: 503 }).transitorio, null)
          return !e.message.includes(USUARIO) && !e.message.includes(CLAVE)
        },
      )
      assert.equal(pulsaciones, 1)
    } finally {
      await context.close()
    }
  })
}

test('pantalla real: etiquetas, «Entrar» se habilita al rellenar ambos, entra y «Cambiar contraseña» no se toca', async () => {
  const { context, page, ctx } = await abrir()
  const pulsados: string[] = []
  const pul = ctx.pulsar
  ctx.pulsar = async (b) => { pulsados.push((await b.innerText()).trim()); await pul(b) }
  try {
    await login(page, ctx, `${base}/real`)
    assert.match(await page.locator('body').innerText(), /Bienvenido/)
    assert.deepEqual(pulsados, ['Entrar'])
    assert.equal(await page.evaluate(() => (window as unknown as { __cc: number }).__cc), 0)
  } finally {
    await context.close()
  }
})

test('«Entrar» que nunca se habilita → ErrorMapaIncompleto y no se pulsa nada', { timeout: 30_000 }, async () => {
  const { context, page, ctx } = await abrir()
  let pulsaciones = 0
  const pul = ctx.pulsar
  ctx.pulsar = async (b) => { pulsaciones++; await pul(b) }
  try {
    await assert.rejects(
      () => login(page, ctx, `${base}/real-nunca`),
      (e: unknown) => e instanceof ErrorMapaIncompleto && /Entrar/.test((e as Error).message),
    )
    assert.equal(pulsaciones, 0)
  } finally {
    await context.close()
  }
})

test('«Cambiar contraseña» nunca puede ser el objetivo', () => {
  for (const t of ['Cambiar contraseña', 'Cambiar la contraseña', '¿Olvidó su contraseña?']) {
    assert.equal(BOTON_ENTRAR.test(t), false, t)
    assert.equal(TEXTO_PROHIBIDO.test(t), true, t)
  }
  assert.equal(BOTON_ENTRAR.test('Entrar'), true)
  assert.equal(TEXTO_PROHIBIDO.test('Entrar'), false)
})

test('PORTALES_EXPLORACION registra mapfre con la credencial MAPFRE_WMEDIADORES', () => {
  assert.equal(PORTALES_EXPLORACION.mapfre?.credencial, 'MAPFRE_WMEDIADORES')
  assert.equal(typeof PORTALES_EXPLORACION.mapfre?.entrar, 'function')
})
