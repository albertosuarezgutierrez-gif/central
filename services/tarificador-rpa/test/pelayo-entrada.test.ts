// Pelayo (03/11/2026) · alta: puertas EXACTAS de la entrada del explorador (guard), login + ruta «Contratación › Presupuestos › Nuevo
// Presupuesto › ramo», entrada de SOLO LECTURA en el bucle y adaptadores de tarificación sin implementar. Portal SINTÉTICO servido por
// `page.route` sobre el origen real (sin red, sin datos personales).
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { ENTRADAS_EXPLORACION, entradaSoloLectura, nombresCredencial, type InventarioDom } from '@central/module-tarificacion'
import { ErrorCredenciales } from '../src/credenciales.ts'
import { ENLACES_ENTRADA_AUTORIZADOS, instalarGuardEmision, pulsar, pulsarEnlaceEntradaAutorizado, pulsarExploracionAutorizada, pulsarGuardadoDialogoAutorizado, pulsarGuardadoPresupuesto, type GuardEmision } from '../src/guard.ts'
import { bucleExploracion, PORTALES_EXPLORACION, problemaTrabajoExploracion, type ContextoBucle, type CtxEntrada } from '../src/explorador.ts'
import { abrirNuevoPresupuestoPelayo, esHostLoginPelayo, etiquetaExactaPelayo, HOSTS_LOGIN_PELAYO, loginPelayo, RE_HOST_SSO_PELAYO, opcionRamoPelayo, rotulosRamoPelayo, rotulosSeguros, URL_PORTAL_PELAYO } from '../src/adapters/pelayo/entrada.ts'
import { PELAYO_ACTIVO, pelayoAuto, pelayoHogar } from '../src/adapters/pelayo/ramos.ts'
import { adaptadores } from '../src/adapters/index.ts'
import type { RespuestaPaso, Trabajo } from '../src/api.ts'

const ORIGEN = 'https://mediadores.pelayo.com'
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

// ─── Guard: puerta exacta de la entrada ──────────────────────────────────────────────────────────────────────────────────────────
const html = (textos: string[]) => `<!doctype html><html><body>${textos.map((t, i) => `<a id="e${i}" href="#x">${t}</a>`).join('')}</body></html>`
async function probar(textos: string[], fn: (p: Page, g: GuardEmision) => Promise<void>, origen = ORIGEN) {
  const context = await browser.newContext()
  try {
    const guard = await instalarGuardEmision(context)
    const page = await context.newPage()
    page.setDefaultTimeout(2_000)
    await page.route(`${origen}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html(textos) }))
    await page.goto(`${origen}/portalmediador-pagina-inicio/`)
    try {
      await fn(page, guard)
      return null
    } catch (e) {
      return e as Error
    }
  } finally {
    await context.close()
  }
}

test('guard: la lista de Pelayo es EXACTAMENTE la ruta y los rótulos de ramo acordados', () => {
  assert.deepEqual([...ENLACES_ENTRADA_AUTORIZADOS.pelayo], ['Contratación', 'Presupuestos', 'Nuevo Presupuesto', 'Auto', 'Autos', 'Automóvil', 'Automóviles', 'Hogar'])
})

test('guard: «Contratación» (casa con contrat) pasa SOLO por la puerta exacta; la ruta completa en orden, en el origen de Pelayo', async () => {
  const e = await probar(['Contratación', 'Presupuestos', 'Nuevo Presupuesto', 'Auto'], async (p, g) => {
    for (let i = 0; i < 4; i++) await pulsarEnlaceEntradaAutorizado(p.locator(`#e${i}`), g, 'pelayo')
  })
  assert.equal(e, null, String(e))
  // El `pulsar` genérico NO se ensancha: «Contratación» sigue bloqueado fuera de la puerta.
  assert.match(String(await probar(['Contratación'], (p, g) => pulsar(p.locator('#e0'), g))), /guard_emision/)
})

for (const t of ['Contratar', 'Emitir', 'Emitir póliza', 'Nuevo Presupuesto y emisión', 'Contratación de pólizas', 'Pólizas', 'Siniestros', 'Auto y Moto']) {
  test(`guard: «${t}» NO pasa por la excepción de Pelayo`, async () => {
    const e = await probar([t], (p, g) => pulsarEnlaceEntradaAutorizado(p.locator('#e0'), g, 'pelayo'))
    assert.match(String(e), /guard_emision/)
  })
}

test('guard: fuera del origen de Pelayo, fuera de orden o con «emitir» en el id → bloqueado', async () => {
  for (const origen of ['https://otro.example.com', 'https://mediadores.pelayo.com.evil.example', 'http://mediadores.pelayo.com']) {
    assert.match(String(await probar(['Contratación'], (p, g) => pulsarEnlaceEntradaAutorizado(p.locator('#e0'), g, 'pelayo'), origen)), /fuera de https:\/\/mediadores\.pelayo\.com/, origen)
  }
  assert.match(String(await probar(['Presupuestos'], (p, g) => pulsarEnlaceEntradaAutorizado(p.locator('#e0'), g, 'pelayo'))), /va después de «contratación»/)
  assert.match(String(await probar(['Hogar'], (p, g) => pulsarEnlaceEntradaAutorizado(p.locator('#e0'), g, 'pelayo'))), /va después de «nuevo presupuesto»/)
  const context = await browser.newContext()
  try {
    const guard = await instalarGuardEmision(context)
    const page = await context.newPage()
    page.setDefaultTimeout(2_000)
    await page.route(`${ORIGEN}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<a id="emitirPoliza" href="#x">Contratación</a>' }))
    await page.goto(`${ORIGEN}/portalmediador-pagina-inicio/`)
    await assert.rejects(() => pulsarEnlaceEntradaAutorizado(page.locator('#emitirPoliza'), guard, 'pelayo'), /guard_emision/)
  } finally {
    await context.close()
  }
})

// ─── Login + ruta (portal sintético) ─────────────────────────────────────────────────────────────────────────────────────────────
type Variante = { ramo?: 'select' | 'botones' | 'ninguno' | 'doble'; rechazo?: boolean }
const portal = (v: Variante = {}) => `<!doctype html><html><head><meta charset="utf-8"><style>.sub{display:none} .m.abierto > .sub{display:block}</style></head><body>
<div id="login"><form onsubmit="return false"><label for="u">Usuario</label><input id="u" type="text"><label for="p">Contraseña</label><input id="p" type="password">
  <button id="entrar" type="button" onclick="hacerLogin()">Entrar</button></form><p id="err" hidden>Usuario o contraseña incorrectos</p></div>
<div id="home" hidden>
  <nav><div class="m" id="menu"><a onclick="reg('menu');document.getElementById('menu').classList.add('abierto')">Contratación</a>
    <div class="sub"><a onclick="reg('presupuestos');presupuestos()">Presupuestos</a><a onclick="reg('polizas')">Pólizas</a></div></div>
    <a onclick="reg('siniestros')">Siniestros</a></nav>
  <div id="pres" hidden><h1>Presupuestos</h1><label for="idp">Id proyecto/presupuesto</label><input id="idp">
    <button type="button" onclick="reg('nuevo');nuevo()">Nuevo Presupuesto</button></div>
  <div id="ramo" hidden><h2>Seleccione el ramo</h2>
    ${v.ramo === 'botones' ? '<button type="button" onclick="reg(\'AUTO\');formulario()">Auto</button><button type="button" onclick="reg(\'HOGAR\');formulario()">Hogar</button>' : ''}
    ${v.ramo === 'doble' ? '<button type="button" onclick="reg(\'HOGAR-1\')">Hogar</button><button type="button" onclick="reg(\'HOGAR-2\')">Hogar</button>' : ''}
    ${v.ramo === 'ninguno' ? '<p>Sin ramos</p>' : ''}
    ${!v.ramo || v.ramo === 'select' ? '<label for="selramo">Ramo</label><select id="selramo" onchange="formulario()"><option value="">Seleccione</option><option value="A">Auto</option><option value="H">Hogar</option></select>' : ''}
  </div>
  <div id="form" hidden><h2>Datos del riesgo</h2><label for="f1">Matrícula</label><input id="f1"><label for="f2">Código postal</label><input id="f2">
    <button type="button" onclick="reg('SIGUIENTE')">Siguiente</button></div>
</div>
<script>
  window.pulsados = []; function reg(x){ window.pulsados.push(x) }
  function hacerLogin(){ if (${v.rechazo ? 'true' : 'false'}) { document.getElementById('err').hidden = false; return } setTimeout(()=>{ document.getElementById('login').hidden = true; document.getElementById('home').hidden = false }, 100) }
  function presupuestos(){ setTimeout(()=>{ document.getElementById('pres').hidden = false }, 200) }
  function nuevo(){ setTimeout(()=>{ document.getElementById('pres').hidden = true; document.getElementById('ramo').hidden = false }, 200) }
  function formulario(){ setTimeout(()=>{ document.getElementById('form').hidden = false }, 200) }
</script></body></html>`

async function abrir(v: Variante = {}) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(5_000)
  await page.route(`${ORIGEN}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: portal(v) }))
  const logs: string[] = []
  const ctx = {
    credenciales: { usuario: 'USUARIO_FICTICIO', contrasena: 'CLAVE_FICTICIA' },
    log: (m: string) => { logs.push(m) },
    pausa: async () => undefined,
    pulsar: (b: Parameters<typeof pulsar>[0]) => pulsar(b, guard),
    exigirSinCaptcha: async () => undefined,
    pulsarEnlaceEntrada: (b: Parameters<typeof pulsar>[0]) => pulsarEnlaceEntradaAutorizado(b, guard, 'pelayo'),
  } satisfies CtxEntrada
  return { context, page, ctx, guard, logs }
}
const pulsados = (p: Page) => p.evaluate(() => (window as unknown as { pulsados: string[] }).pulsados)
const ESPERAS = { loginMs: 3_000, menuMs: 2_000, paginaMs: 3_000, formularioMs: 2_000 }

test('PORTALES_EXPLORACION.pelayo.entrar (auto, <select>): login, ruta EXACTA, ramo elegido sin clic y primer formulario SIN rellenar ni avanzar', async () => {
  const { context, page, ctx, logs } = await abrir()
  try {
    const dest = (await PORTALES_EXPLORACION.pelayo!.entrar(page, ctx, ENTRADAS_EXPLORACION['pelayo:presupuestos:auto']!)) ?? page
    assert.equal(await dest.locator('#f1').isVisible(), true)
    assert.equal(await dest.locator('#selramo').inputValue(), 'A')
    assert.equal(await dest.locator('#f1').inputValue(), '')
    assert.deepEqual(await pulsados(dest), ['menu', 'presupuestos', 'nuevo'])
    const volcados = logs.filter((l) => l.startsWith('pelayo_estructura'))
    assert.equal(volcados.length, 2, JSON.stringify(logs))
    assert.match(volcados[0], /seleccion_ramo .*"opciones":\["Seleccione","Auto","Hogar"\]/)
    assert.match(volcados[1], /formulario_ramo .*Datos del riesgo/)
    assert.ok(!logs.join('\n').includes('USUARIO_FICTICIO') && !logs.join('\n').includes('CLAVE_FICTICIA'), 'sin credenciales en el log')
  } finally {
    await context.close()
  }
})

test('ramo pulsable (hogar): se pulsa SOLO «Hogar» por la puerta; nunca «Auto», «Pólizas» ni «Siniestros»', async () => {
  const { context, page, ctx } = await abrir({ ramo: 'botones' })
  try {
    await loginPelayo(page, ctx, ESPERAS)
    const dest = await abrirNuevoPresupuestoPelayo(page, ctx, 'hogar', ESPERAS)
    assert.deepEqual(await pulsados(dest), ['menu', 'presupuestos', 'nuevo', 'HOGAR'])
  } finally {
    await context.close()
  }
})

test('sin control del ramo o con dos iguales: no se elige nada y se queda en la pantalla de selección (volcada)', async () => {
  for (const ramo of ['ninguno', 'doble'] as const) {
    const { context, page, ctx, logs } = await abrir({ ramo })
    try {
      await loginPelayo(page, ctx, ESPERAS)
      await abrirNuevoPresupuestoPelayo(page, ctx, 'hogar', ESPERAS)
      assert.deepEqual(await pulsados(page), ['menu', 'presupuestos', 'nuevo'], ramo)
      assert.ok(logs.some((l) => l.startsWith('pelayo_ramo') && l.includes('no_elegido')), ramo)
    } finally {
      await context.close()
    }
  }
})

test('login rechazado: ErrorCredenciales (sin reintento)', async () => {
  const { context, page, ctx } = await abrir({ rechazo: true })
  try {
    await assert.rejects(() => loginPelayo(page, ctx, ESPERAS), ErrorCredenciales)
  } finally {
    await context.close()
  }
})

test('login en un host fuera de la lista: hueco y NO se escriben credenciales', async () => {
  const OTRO = 'https://sso.otro.example.com'
  const { context, page, ctx } = await abrir()
  try {
    await page.route(`${OTRO}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: portal() }))
    await assert.rejects(() => loginPelayo(page, ctx, ESPERAS, `${OTRO}/login`), /host fuera de la lista \(sso\.otro\.example\.com/)
    assert.equal(await page.locator('#u').inputValue(), '')
    assert.equal(await page.locator('#p').inputValue(), '')
  } finally {
    await context.close()
  }
})

test('0.3.29 · login en el SSO de Pelayo (acceso12.pelayo.com, exploración real): se escriben las credenciales y entra; un host ajeno sigue en hueco', async () => {
  const SSO = 'https://acceso12.pelayo.com'
  const { context, page, ctx, logs } = await abrir()
  try {
    await page.route(`${SSO}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: portal() }))
    await loginPelayo(page, ctx, ESPERAS, `${SSO}/nidp/app/login`)
    assert.ok(logs.includes('login ok'))
    assert.equal(await page.locator('#home').isVisible(), true)
  } finally {
    await context.close()
  }
  for (const AJENO of ['https://acceso12.pelayo.com.evil.example', 'https://acceso.pelayo.com', 'https://sso.pelayo.com']) {
    const x = await abrir()
    try {
      await x.page.route(`${AJENO}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: portal() }))
      await assert.rejects(() => loginPelayo(x.page, x.ctx, ESPERAS, `${AJENO}/login`), /host fuera de la lista/, AJENO)
      assert.equal(await x.page.locator('#u').inputValue(), '', AJENO)
      assert.equal(await x.page.locator('#p').inputValue(), '', AJENO)
    } finally {
      await x.context.close()
    }
  }
})

test('0.3.29 · puras: host del SSO de Pelayo — acceso12 (y accesoN) solo por https; nada más', () => {
  assert.ok(HOSTS_LOGIN_PELAYO.includes('acceso12.pelayo.com'))
  for (const u of ['https://acceso12.pelayo.com/nidp/app/login?id=x', 'https://acceso1.pelayo.com/', 'https://acceso999.pelayo.com/']) assert.equal(esHostLoginPelayo(u), true, u)
  for (const u of [
    'http://acceso12.pelayo.com/', 'https://acceso12.pelayo.com.evil.example/', 'https://evil.acceso12.pelayo.com/', 'https://xacceso12.pelayo.com/',
    'https://acceso.pelayo.com/', 'https://acceso012.pelayo.com/', 'https://acceso1234.pelayo.com/', 'https://acceso12-pelayo.com/', 'https://acceso12.pelayo.co/',
    'https://u:p@acceso12.pelayo.com/', 'https://acceso12.pelayo.com:8443/', 'https://sso.pelayo.com/', 'https://pelayo.com/',
  ]) assert.equal(esHostLoginPelayo(u), false, u)
  assert.equal(RE_HOST_SSO_PELAYO.test('acceso12.pelayo.com'), true)
  assert.equal(RE_HOST_SSO_PELAYO.test('acceso12.pelayo.com.evil'), false)
})

test('puras: host de login, etiqueta exacta, opción de ramo, rótulos sin PII, ramo sin recorrido', () => {
  assert.equal(esHostLoginPelayo(URL_PORTAL_PELAYO), true)
  for (const u of ['http://mediadores.pelayo.com/', 'https://mediadores.pelayo.com.evil.example/', 'https://u:p@mediadores.pelayo.com/', 'https://pelayo.com/']) assert.equal(esHostLoginPelayo(u), false, u)
  const re = etiquetaExactaPelayo('Nuevo Presupuesto')
  for (const ok of ['Nuevo Presupuesto', '  NUEVO   presupuesto ']) assert.match(ok, re)
  for (const mal of ['Nuevo Presupuesto y emisión', 'Nuevos Presupuestos']) assert.doesNotMatch(mal, re)
  assert.equal(opcionRamoPelayo(['Seleccione', 'Auto', 'Hogar'], rotulosRamoPelayo('auto')), 1)
  assert.equal(opcionRamoPelayo(['Seleccione', 'AUTOMÓVILES', 'Hogar'], rotulosRamoPelayo('auto')), 1)
  assert.equal(opcionRamoPelayo(['Auto', 'Autos'], rotulosRamoPelayo('auto')), null, 'dos opciones del ramo = ambiguo')
  assert.equal(opcionRamoPelayo(['Auto y Moto', 'Hogar Plus'], rotulosRamoPelayo('hogar')), null)
  assert.throws(() => rotulosRamoPelayo('vida'), /sin recorrido/)
  assert.deepEqual(rotulosSeguros(['Auto', 'Auto', '', 'x'.repeat(41), '12345678Z', 'Póliza 1234567', 'Hogar']), ['Auto', 'Hogar'])
})

test('alta: credencial PELAYO_MEDIADORES (fly secrets CRED_PELAYO_MEDIADORES_USER/_PASS) y trabajos casados con su entrada', () => {
  assert.equal(PORTALES_EXPLORACION.pelayo?.credencial, 'PELAYO_MEDIADORES')
  assert.deepEqual(nombresCredencial('PELAYO_MEDIADORES'), { usuario: 'CRED_PELAYO_MEDIADORES_USER', contrasena: 'CRED_PELAYO_MEDIADORES_PASS' })
  const trabajo = (compania: string, ramo: string, entrada: string) => ({ id: 't', compania, ramo, exploracion: { entrada, conDatosReales: false } }) as unknown as Trabajo
  assert.equal(problemaTrabajoExploracion(trabajo('pelayo', 'auto', 'pelayo:presupuestos:auto')), null)
  assert.equal(problemaTrabajoExploracion(trabajo('pelayo', 'hogar', 'pelayo:presupuestos:hogar')), null)
  assert.match(problemaTrabajoExploracion(trabajo('pelayo', 'hogar', 'pelayo:presupuestos:auto')) ?? '', /no casa/)
})

test('tarificar: auto y hogar «aún no implementado» (sin tocar el portal); apagados y fuera del registro', async () => {
  const nada = null as never
  await assert.rejects(() => pelayoAuto.tarificar(nada, nada, nada), /^ErrorTarificador: Pelayo: ramo auto aún no implementado$|Pelayo: ramo auto aún no implementado/)
  await assert.rejects(() => pelayoHogar.tarificar(nada, nada, nada), (e: Error & { tipo?: string }) => e.message === 'Pelayo: ramo hogar aún no implementado' && e.tipo === 'datos')
  assert.equal(PELAYO_ACTIVO, false)
  assert.equal(adaptadores.obtener('pelayo', 'auto'), null)
  assert.equal(adaptadores.obtener('pelayo', 'hogar'), null)
})

// ─── Bucle: SOLO LECTURA ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function contexto(page: Page, guard: GuardEmision, entrada: string, ramo: string, compania: string, guion: (inv: InventarioDom, n: number) => unknown): ContextoBucle {
  let n = 0
  return {
    trabajoId: '00000000-0000-4000-8000-000000000328', compania, ramo, entrada,
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
const PAGINA_FORM = `<!doctype html><html><head><meta charset="utf-8"></head><body><form><h2>Datos del riesgo</h2>
  <input type="checkbox" id="garaje" name="garaje"><label for="garaje">Garaje</label></form></body></html>`

test('bucle: SOLO LECTURA (forzada en el contexto) → manda UN inventario y para con `tope` SIN ejecutar el lote (la casilla sigue sin marcar)', async () => {
  // 0.3.36: las entradas de Pelayo ya son explorables; el mecanismo se prueba con la solo lectura FORZADA del contexto del bucle.
  assert.equal(entradaSoloLectura('pelayo:presupuestos:auto'), false)
  assert.equal(entradaSoloLectura('fidelidade:particulares:vivienda'), false)
  const context = await browser.newContext()
  try {
    const guard = await instalarGuardEmision(context)
    const page = await context.newPage()
    page.setDefaultTimeout(2_000)
    await page.route(`${ORIGEN}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGINA_FORM }))
    await page.goto(`${ORIGEN}/portalmediador-presupuestos/nuevo`)
    let inventarios = 0
    const fin = await bucleExploracion(page, { ...contexto(page, guard, 'pelayo:presupuestos:auto', 'auto', 'pelayo', (inv, n) => {
      inventarios++
      const ref = inv.marcos.flatMap((m) => m.elementos).find((e) => e.id === 'garaje')!.ref!
      return { version: 1, pantalla: { nombre: 'Datos', tipo: 'formulario' }, acciones: n === 1 ? [{ accion: 'marcar', ref }] : [{ accion: 'parar', motivo: 'ambiguo' }], mapeo: [], motivo: null }
    }), soloLectura: true })
    assert.equal(fin.motivo, 'tope', JSON.stringify(fin))
    assert.equal(inventarios, 1)
    assert.equal(fin.acciones, 0)
    assert.equal(await page.locator('#garaje').isChecked(), false)
  } finally {
    await context.close()
  }
})
