// Fidelidade Vivienda (28/10/2026) · ENTRADA del explorador: login → OFICINA VIRTUAL › PROYECTO › Nuevo proyecto → tarjeta 4216 →
// «Simulación» → formulario. Portal SINTÉTICO servido sobre el origen real con `page.route` (sin red, sin datos personales).
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { ENTRADAS_EXPLORACION, nombresCredencial } from '@central/module-tarificacion'
import { ErrorCredenciales } from '../src/credenciales.ts'
import { instalarGuardEmision, pulsar, pulsarEnlaceEntradaAutorizado } from '../src/guard.ts'
import { PORTALES_EXPLORACION, problemaTrabajoExploracion, type CtxEntrada } from '../src/explorador.ts'
import { abrirFormularioViviendaFidelidade, esTarjetaViviendaFidelidade, etiquetaExactaFidelidade, loginFidelidade, URL_INTRANET_FIDELIDADE } from '../src/adapters/fidelidade/entrada.ts'
import type { Trabajo } from '../src/api.ts'

let browser: Browser
before(async () => {
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
after(async () => { await browser.close() })

type Variante = { sinVivienda?: boolean; formularioNunca?: boolean; rechazo?: boolean; botonLogin?: string }
/** Intranet sintética: login → menú con submenús de ratón → página de tarjetas (EMPRESAS 4215 y VIVIENDA 4216) → formulario lento. */
const portal = (v: Variante = {}) => `<!doctype html><html><head><meta charset="utf-8"><style>
  .sub{display:none} .m:hover > .sub{display:block} [hidden]{display:none !important}
</style></head><body>
<div id="login"><form onsubmit="return false"><label for="u">Usuario</label><input id="u" type="text"><label for="p">Clave</label><input id="p" type="password">
  <button id="entrar" type="${v.botonLogin ? 'submit' : 'button'}" onclick="hacerLogin()">${v.botonLogin ?? 'Entrar'}</button></form><p id="err" hidden>Usuario o contraseña incorrectos</p></div>
<div id="home" hidden>
  <nav>
    <div class="m"><a onclick="reg('ov')">OFICINA VIRTUAL</a>
      <div class="sub"><div class="m"><a onclick="reg('proyecto')">PROYECTO</a>
        <div class="sub"><a onclick="reg('nuevo');tarjetas()">Nuevo proyecto</a><a onclick="reg('buscar')">Buscar proyecto</a></div></div></div></div>
    <a onclick="reg('infogestion')">INFORMACIÓN DE GESTIÓN</a><a onclick="reg('productos')">PRODUCTOS</a><a onclick="reg('normas')">NORMAS</a><a onclick="reg('condicionados')">CONDICIONADOS</a>
    <div class="m"><a onclick="reg('novida')">NO VIDA</a><div class="sub"><a onclick="reg('verpoliza')">Ver póliza</a><a onclick="reg('versiniestro')">Ver siniestro</a></div></div>
  </nav>
  <div id="tarjetas" hidden><h1>PARTICULARES - Crear nuevo proyecto</h1>
    <div class="card" id="empresas"><h3>Producto 4215 · Gama Comercio</h3><p>EMPRESAS</p><button type="button" onclick="reg('SIM-EMPRESAS')">Simulación</button></div>
    ${v.sinVivienda ? '' : '<div class="card" id="vivienda"><h3>Producto 4216 · Fidelidade Vivienda</h3><button type="button" onclick="reg(\'SIM-VIVIENDA\');formulario()">Simulación</button></div>'}
  </div>
  <div id="form" hidden><label for="f1">Fecha de efecto</label><input id="f1"></div>
</div>
<script>
  window.pulsados = []; function reg(x){ window.pulsados.push(x) }
  function hacerLogin(){ if (${v.rechazo ? 'true' : 'false'}) { document.getElementById('err').hidden = false; return } setTimeout(()=>{ document.getElementById('login').hidden = true; document.getElementById('home').hidden = false }, 200) }
  function tarjetas(){ setTimeout(()=>{ document.getElementById('tarjetas').hidden = false }, 300) }
  function formulario(){ ${v.formularioNunca ? '' : "setTimeout(()=>{ document.getElementById('tarjetas').hidden = true; document.getElementById('form').hidden = false }, 600)"} }
</script></body></html>`

async function abrir(v: Variante = {}) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(5_000)
  await page.route('https://mediadores.fidelidade.es/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: portal(v) }))
  const ctx = {
    credenciales: { usuario: 'USUARIO_FICTICIO', contrasena: 'CLAVE_FICTICIA' },
    log: () => undefined,
    pausa: async () => undefined,
    pulsar: (b: Parameters<typeof pulsar>[0]) => pulsar(b, guard),
    exigirSinCaptcha: async () => undefined,
    pulsarEnlaceEntrada: (b: Parameters<typeof pulsar>[0]) => pulsarEnlaceEntradaAutorizado(b, guard, 'fidelidade'),
  } satisfies CtxEntrada
  return { context, page, ctx, guard }
}
const pulsados = (p: Page) => p.evaluate(() => (window as unknown as { pulsados: string[] }).pulsados)
const ESPERAS = { menuMs: 2_000, paginaMs: 3_000, formularioMs: 3_000, loginMs: 3_000 }
const trabajo = (compania: string, ramo: string, entrada: string) => ({ id: 't', compania, ramo, exploracion: { entrada, conDatosReales: false } }) as unknown as Trabajo

test('recorrido completo: login, ruta de menú EXACTA, tarjeta 4216, «Simulación» y formulario; EMPRESAS y el resto de menús intactos', async () => {
  const { context, page, ctx } = await abrir()
  try {
    await loginFidelidade(page, ctx, ESPERAS)
    const destino = await abrirFormularioViviendaFidelidade(page, ctx, ESPERAS)
    assert.equal(destino, page)
    assert.equal(await destino.locator('label').filter({ hasText: 'Fecha de efecto' }).isVisible(), true)
    assert.deepEqual(await pulsados(page), ['ov', 'proyecto', 'nuevo', 'SIM-VIVIENDA'])
  } finally {
    await context.close()
  }
})

test('PORTALES_EXPLORACION.fidelidade.entrar hace todo el camino y devuelve la página del formulario', async () => {
  const { context, page, ctx } = await abrir()
  try {
    const dest = await PORTALES_EXPLORACION.fidelidade!.entrar(page, ctx, ENTRADAS_EXPLORACION['fidelidade:particulares:vivienda']!)
    const p = (dest ?? page) as Page
    assert.equal(await p.locator('label').filter({ hasText: 'Fecha de efecto' }).isVisible(), true)
    assert.ok(!(await pulsados(p)).includes('SIM-EMPRESAS'))
  } finally {
    await context.close()
  }
})

test('sin tarjeta de Vivienda NO se pulsa la de EMPRESAS: hueco explícito', async () => {
  const { context, page, ctx } = await abrir({ sinVivienda: true })
  try {
    await loginFidelidade(page, ctx, ESPERAS)
    await assert.rejects(() => abrirFormularioViviendaFidelidade(page, ctx, ESPERAS), /no se localiza la tarjeta «Producto 4216/)
    assert.ok(!(await pulsados(page)).some((x) => x.startsWith('SIM-')), JSON.stringify(await pulsados(page)))
  } finally {
    await context.close()
  }
})

test('si el formulario no llega (portal lento de verdad) es un hueco con el tiempo esperado, no un éxito', async () => {
  const { context, page, ctx } = await abrir({ formularioNunca: true })
  try {
    await loginFidelidade(page, ctx, ESPERAS)
    await assert.rejects(() => abrirFormularioViviendaFidelidade(page, ctx, { ...ESPERAS, formularioMs: 1_500 }), /no mostró ninguna etiqueta/)
  } finally {
    await context.close()
  }
})

test('login rechazado: ErrorCredenciales y sin reintento', async () => {
  const { context, page, ctx } = await abrir({ rechazo: true })
  try {
    await assert.rejects(() => loginFidelidade(page, ctx, ESPERAS), ErrorCredenciales)
  } finally {
    await context.close()
  }
})

test('login con un botón «Aceptar»: el guard genérico lo bloquea (no se ensanchó) y no se entra', async () => {
  const { context, page, ctx } = await abrir({ botonLogin: 'Aceptar' })
  try {
    await assert.rejects(() => loginFidelidade(page, ctx, ESPERAS), /guard_emision/)
  } finally {
    await context.close()
  }
})

test('la tarjeta de Vivienda se reconoce solo por su producto: 4215/EMPRESAS/Gama Comercio nunca', () => {
  assert.equal(esTarjetaViviendaFidelidade('Producto 4216 · Fidelidade Vivienda Simulación'), true)
  assert.equal(esTarjetaViviendaFidelidade('Producto 4215 · Gama Comercio EMPRESAS Simulación'), false)
  assert.equal(esTarjetaViviendaFidelidade('Producto 4216 · Fidelidade Vivienda Producto 4215 · Gama Comercio'), false)
  assert.equal(esTarjetaViviendaFidelidade('Producto 4217 · Fidelidade Vivienda'), false)
})

test('etiquetaExactaFidelidade: exacta (sin sufijos ni prefijos), tolera mayúsculas, espacios y tildes', () => {
  const re = etiquetaExactaFidelidade('Simulación')
  for (const ok of ['Simulación', '  SIMULACIÓN ', 'simulacion']) assert.match(ok, re)
  for (const mal of ['Simulación y emisión', 'Nueva Simulación', 'Simulaciones']) assert.doesNotMatch(mal, re)
})

test('portal registrado: credencial FIDELIDADE_MEDIADORES (fly secrets CRED_FIDELIDADE_MEDIADORES_USER/_PASS) y trabajo casado con su entrada', () => {
  assert.equal(PORTALES_EXPLORACION.fidelidade?.credencial, 'FIDELIDADE_MEDIADORES')
  assert.deepEqual(nombresCredencial('FIDELIDADE_MEDIADORES'), { usuario: 'CRED_FIDELIDADE_MEDIADORES_USER', contrasena: 'CRED_FIDELIDADE_MEDIADORES_PASS' })
  assert.equal(problemaTrabajoExploracion(trabajo('fidelidade', 'hogar', 'fidelidade:particulares:vivienda')), null)
  assert.match(problemaTrabajoExploracion(trabajo('fidelidade', 'auto', 'fidelidade:particulares:vivienda')) ?? '', /no casa/)
  assert.match(problemaTrabajoExploracion(trabajo('fidelidade', 'hogar', 'fidelidade:particulares:empresas')) ?? '', /desconocida/)
})

test('la URL de entrada es la de la intranet de mediadores', () => {
  assert.equal(URL_INTRANET_FIDELIDADE, 'https://mediadores.fidelidade.es/OPI_ES_Mediadores/')
})
