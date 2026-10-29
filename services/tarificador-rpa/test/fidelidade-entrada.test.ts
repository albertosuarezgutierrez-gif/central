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
import { describirSondaSimulacion, elegirCandidatoFidelidade, type InfoCandidatoFidelidade, abrirFormularioViviendaFidelidade, cerrarDialogoRgpdFidelidade, esTarjetaViviendaFidelidade, etiquetaExactaFidelidade, loginFidelidade, URL_INTRANET_FIDELIDADE } from '../src/adapters/fidelidade/entrada.ts'
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

type Variante = { dobleSim?: boolean; repetidos?: 'equivalentes' | 'distintos' | 'fuera'; sinVivienda?: boolean; formularioNunca?: boolean; rechazo?: boolean; botonLogin?: string; dialogo?: string[] }
/** Intranet sintética: login → menú con submenús de ratón → página de tarjetas (EMPRESAS 4215 y VIVIENDA 4216) → formulario lento. */
const portal = (v: Variante = {}) => `<!doctype html><html><head><meta charset="utf-8"><style>
  .sub{display:none} .m:hover > .sub{display:block} [hidden]{display:none !important}
</style></head><body>
${v.dialogo ? `<os-internal-ui-dialog id="dlg" style="position:fixed;inset:0;background:#fff;z-index:99;display:block"><iframe src="https://mediadores.fidelidade.es/OPI_ES_Mediadores/RGPD.aspx" style="width:100px;height:50px"></iframe>${v.dialogo.map((b) => `<button type="button" onclick="reg('DLG-${b}')" data-cierra="${b === 'Aceptar' ? 'no' : 'si'}">${b}</button>`).join('')}</os-internal-ui-dialog>` : ''}
<div id="login"><form onsubmit="return false"><label for="u">Usuario</label><input id="u" type="text"><label for="p">Clave</label><input id="p" type="password">
  <button id="entrar" type="${v.botonLogin ? 'submit' : 'button'}" onclick="hacerLogin()">${v.botonLogin ?? 'Entrar'}</button></form><p id="err" hidden>Usuario o contraseña incorrectos</p></div>
<div id="home" hidden>
  ${v.repetidos && v.repetidos !== 'fuera' ? `<div id="pie"><a onclick="reg('ov-pie')">Oficina Virtual</a></div>` : ''}
  ${v.repetidos === 'fuera' ? '' : '<nav>'}
    <div class="m"><a onclick="reg('ov')">OFICINA VIRTUAL</a>
      <div class="sub"><div class="m"><a onclick="reg('proyecto')">PROYECTO</a>
        <div class="sub"><a onclick="reg('nuevo');tarjetas()">Nuevo proyecto</a><a onclick="reg('buscar')">Buscar proyecto</a></div></div></div></div>
    <a onclick="reg('infogestion')">INFORMACIÓN DE GESTIÓN</a><a onclick="reg('productos')">PRODUCTOS</a><a onclick="reg('normas')">NORMAS</a><a onclick="reg('condicionados')">CONDICIONADOS</a>
    <div class="m"><a onclick="reg('novida')">NO VIDA</a><div class="sub"><a onclick="reg('verpoliza')">Ver póliza</a><a onclick="reg('versiniestro')">Ver siniestro</a></div></div>
  ${v.repetidos === 'fuera' ? '' : '</nav>'}
  ${v.repetidos === 'fuera' ? `<div id="pie"><a onclick="reg('ov-pie')">Oficina Virtual</a></div>` : ''}
  <div id="tarjetas" hidden><h1>PARTICULARES - Crear nuevo proyecto</h1>
    <div class="card" id="empresas"><h3>Producto 4215 · Gama Comercio</h3><p>EMPRESAS</p><button type="button" onclick="reg('SIM-EMPRESAS')">Simulación</button></div>
    ${v.sinVivienda ? '' : '<div class="card" id="vivienda"><h3>Producto 4216 · Fidelidade Vivienda</h3><button type="button" onclick="reg(\'SIM-VIVIENDA\');formulario()">Simulación</button>' + (v.dobleSim ? '<button type="button" onclick="reg(\'SIM-VIVIENDA-2\');formulario()">Simulación</button>' : '') + '</div>'}
  </div>
  <div id="form" hidden><label for="f1">Fecha de efecto</label><input id="f1"></div>
</div>
<script>
  window.pulsados = []; document.addEventListener('click', (ev) => { const t = ev.target; if (t && t.dataset && t.dataset.cierra === 'si') document.getElementById('dlg').remove() }); function reg(x){ window.pulsados.push(x) }
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
  await page.route('**/RGPD.aspx', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><p>Protección de datos</p>' }))
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

test('0.3.11 · diálogo RGPD con «Cerrar»: se pulsa, desaparece y el login continúa', async () => {
  const { context, page, ctx } = await abrir({ dialogo: ['Cerrar'] })
  try {
    await loginFidelidade(page, ctx, ESPERAS)
    assert.deepEqual((await pulsados(page)).filter((x) => x.startsWith('DLG-')), ['DLG-Cerrar'])
    assert.equal(await page.locator('#home').isVisible(), true)
  } finally {
    await context.close()
  }
})

test('0.3.11 · diálogo RGPD solo con «Aceptar»: error con los textos de botón y «Aceptar» NO se pulsa', async () => {
  const { context, page, ctx } = await abrir({ dialogo: ['Aceptar'] })
  try {
    await assert.rejects(() => loginFidelidade(page, ctx, ESPERAS), /fidelidade\/login: diálogo de cookies\/RGPD tapa el login; botones: \[«Aceptar»\]/)
    assert.deepEqual((await pulsados(page)).filter((x) => x.startsWith('DLG-')), [])
    await cerrarDialogoRgpdFidelidade(page, ctx, 500).then(() => assert.fail('debía lanzar'), () => undefined)
  } finally {
    await context.close()
  }
})

test('0.3.11 · diálogo RGPD solo con «Continuar»: error con el texto del botón y NO se pulsa', async () => {
  const { context, page, ctx } = await abrir({ dialogo: ['Continuar'] })
  try {
    await assert.rejects(() => loginFidelidade(page, ctx, ESPERAS), /fidelidade\/login: diálogo de cookies\/RGPD tapa el login; botones: \[«Continuar»\]/)
    assert.deepEqual((await pulsados(page)).filter((x) => x.startsWith('DLG-')), [])
  } finally {
    await context.close()
  }
})

test('0.3.13 · diálogo de cookies real: «Sí, acepto cookies» cierra y el login continúa; «No acepto cookies», «aquí» y vacío no se pulsan', async () => {
  const { context, page, ctx } = await abrir({ dialogo: ['', 'aquí', 'No acepto cookies', 'Sí, acepto cookies'] })
  try {
    await loginFidelidade(page, ctx, ESPERAS)
    assert.deepEqual((await pulsados(page)).filter((x) => x.startsWith('DLG-')), ['DLG-Sí, acepto cookies'])
    assert.equal(await page.locator('#home').isVisible(), true)
  } finally {
    await context.close()
  }
})

test('0.3.13 · «No acepto cookies» a solas: error con nombre y NO se pulsa (rechazar lleva a SemCookies)', async () => {
  const { context, page, ctx } = await abrir({ dialogo: ['No acepto cookies'] })
  try {
    await assert.rejects(() => loginFidelidade(page, ctx, ESPERAS), /diálogo de cookies\/RGPD tapa el login; botones: \[«No acepto cookies»\]/)
    assert.deepEqual((await pulsados(page)).filter((x) => x.startsWith('DLG-')), [])
  } finally {
    await context.close()
  }
})

test('0.3.13 · «Aceptar» y «Continuar» junto a «Sí, acepto cookies»: solo se pulsa el de cookies', async () => {
  const { context, page, ctx } = await abrir({ dialogo: ['Aceptar', 'Continuar', 'Sí, acepto cookies'] })
  try {
    await loginFidelidade(page, ctx, ESPERAS)
    assert.deepEqual((await pulsados(page)).filter((x) => x.startsWith('DLG-')), ['DLG-Sí, acepto cookies'])
  } finally {
    await context.close()
  }
})

test('0.3.13 · fuera del origen de mediadores no se pulsa ni «Sí, acepto cookies»', async () => {
  const { context, page, ctx } = await abrir({ dialogo: ['Sí, acepto cookies'] })
  try {
    await page.route('https://otro.example.test/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: portal({ dialogo: ['Sí, acepto cookies'] }) }))
    await page.goto('https://otro.example.test/')
    await assert.rejects(() => cerrarDialogoRgpdFidelidade(page, ctx, 800), /diálogo de cookies\/RGPD tapa el login/)
    assert.deepEqual((await pulsados(page)).filter((x) => x.startsWith('DLG-')), [])
  } finally {
    await context.close()
  }
})

test('0.3.13 · URL con SemCookies.aspx: error con nombre claro', async () => {
  const { context, page, ctx } = await abrir()
  try {
    await page.goto('https://mediadores.fidelidade.es/OPI_ES_Mediadores/SemCookies.aspx')
    await assert.rejects(() => cerrarDialogoRgpdFidelidade(page, ctx, 800), /fidelidade: portal en SemCookies \(cookies rechazadas\)/)
  } finally {
    await context.close()
  }
})

const inf = (o: Partial<InfoCandidatoFidelidade> = {}): InfoCandidatoFidelidade => ({ tag: 'a', href: null, hrefRuta: null, onclick: null, enNav: false, ancestro: '', ...o })
test('elegirCandidatoFidelidade: único; varios sin nav → el primero; varios con alguno en la barra → ese; ninguno → ninguno', () => {
  assert.deepEqual(elegirCandidatoFidelidade([]), { tipo: 'ninguno' })
  assert.deepEqual(elegirCandidatoFidelidade([inf()]), { tipo: 'uno', indice: 0, motivo: 'unico' })
  assert.deepEqual(elegirCandidatoFidelidade([inf(), inf(), inf()]), { tipo: 'uno', indice: 0, motivo: 'primero' })
  assert.deepEqual(elegirCandidatoFidelidade([inf(), inf({ enNav: true }), inf({ enNav: true })]), { tipo: 'uno', indice: 1, motivo: 'en_navegacion' })
})

test('«Oficina Virtual» repetida 3 veces: se pulsa la de la barra de navegación (una vez) y la ruta sigue', async () => {
  const { context, page, ctx } = await abrir({ repetidos: 'equivalentes' })
  try {
    await loginFidelidade(page, ctx, ESPERAS)
    await abrirFormularioViviendaFidelidade(page, ctx, ESPERAS)
    const p = await pulsados(page)
    assert.deepEqual(p, ['ov', 'proyecto', 'nuevo', 'SIM-VIVIENDA'])
  } finally {
    await context.close()
  }
})

test('«Oficina Virtual» repetida sin barra de navegación: el primero visible (en orden de documento); nunca un texto distinto', async () => {
  const { context, page, ctx } = await abrir({ repetidos: 'fuera' })
  try {
    await loginFidelidade(page, ctx, ESPERAS)
    await abrirFormularioViviendaFidelidade(page, ctx, ESPERAS)
    const p = await pulsados(page)
    assert.equal(p[0], 'ov')
    assert.ok(!p.includes('ov-pie'))
    assert.ok(!p.some((x) => ['infogestion', 'productos', 'normas', 'condicionados', 'novida', 'SIM-EMPRESAS'].includes(x)), JSON.stringify(p))
  } finally {
    await context.close()
  }
})

test('dos «Simulación» equivalentes en la tarjeta de Vivienda: el primero; el de EMPRESAS (4215) jamás', async () => {
  const { context, page, ctx } = await abrir({ dobleSim: true })
  try {
    await loginFidelidade(page, ctx, ESPERAS)
    await abrirFormularioViviendaFidelidade(page, ctx, ESPERAS)
    assert.deepEqual(await pulsados(page), ['ov', 'proyecto', 'nuevo', 'SIM-VIVIENDA'])
  } finally {
    await context.close()
  }
})

/** Portal de menú REAL del 29/10/2026: las etiquetas son `<span>` sin manejador propio dentro de un contenedor del menú entero con `onclick`. */
const portalContenedor = (conHoja: boolean) => `<!doctype html><html><body>
<div id="menu" class="menu" onclick="reg('CONTENEDOR')">
  <ul><li><span class="hoja">OFICINA VIRTUAL</span></li><li><span class="hoja">PROYECTO</span></li>
  <li><span class="hoja">Nuevo proyecto</span></li><li><span class="hoja">Ver proyecto</span></li><li><span class="hoja">NO VIDA</span></li><li><span class="hoja">Ver póliza</span></li></ul>
</div>
<div id="tarjetas" hidden><h1>PARTICULARES - Crear nuevo proyecto</h1>
  <div class="card"><h3>Producto 4216 · Fidelidade Vivienda</h3><button type="button" onclick="reg('SIM-VIVIENDA');formulario()">Simulación</button></div></div>
<div id="form" hidden><label for="f1">Fecha de efecto</label><input id="f1"></div>
<script>
  window.pulsados = []; function reg(x){ window.pulsados.push(x) }
  function formulario(){ setTimeout(()=>{ document.getElementById('tarjetas').hidden = true; document.getElementById('form').hidden = false }, 300) }
  ${conHoja ? `document.addEventListener('click', (ev) => { const t = ev.target; if (t && t.classList && t.classList.contains('hoja')) { const x = t.textContent.trim(); reg(x); ev.stopPropagation(); if (x === 'Nuevo proyecto') setTimeout(()=>{ document.getElementById('tarjetas').hidden = false }, 200) } }, true)` : ''}
</script></body></html>`

async function abrirContenedor(conHoja: boolean) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(5_000)
  await page.route('https://mediadores.fidelidade.es/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: portalContenedor(conHoja) }))
  const ctx = {
    credenciales: { usuario: 'USUARIO_FICTICIO', contrasena: 'CLAVE_FICTICIA' },
    log: () => undefined,
    pausa: async () => undefined,
    pulsar: (b: Parameters<typeof pulsar>[0]) => pulsar(b, guard),
    exigirSinCaptcha: async () => undefined,
    pulsarEnlaceEntrada: (b: Parameters<typeof pulsar>[0]) => pulsarEnlaceEntradaAutorizado(b, guard, 'fidelidade'),
  } satisfies CtxEntrada
  await page.goto(URL_INTRANET_FIDELIDADE)
  return { context, page, ctx }
}

test('0.3.16 · menú con CONTENEDOR (onclick) y hojas sin manejador: se pulsa la HOJA exacta de cada etiqueta, nunca el contenedor', async () => {
  const { context, page, ctx } = await abrirContenedor(true)
  try {
    await abrirFormularioViviendaFidelidade(page, ctx, ESPERAS)
    assert.deepEqual(await pulsados(page), ['OFICINA VIRTUAL', 'PROYECTO', 'Nuevo proyecto', 'SIM-VIVIENDA'])
  } finally {
    await context.close()
  }
})

// ─── 0.3.17 · la tarjeta 4216/Vivienda se localiza en cualquier marco, con otros textos y botones; si falla, el error dice qué hay ───────

/** Portal con el menú de hojas (como el real) y una página de tarjetas libre; `marco` = HTML servido en `/tarjetas.aspx` (iframe). */
const portalTarjetas = (tarjetas: string, opciones: { retardoMs?: number } = {}) => `<!doctype html><html><body>
<div id="menu" class="menu"><ul><li><span class="hoja">OFICINA VIRTUAL</span></li><li><span class="hoja">PROYECTO</span></li><li><span class="hoja">Nuevo proyecto</span></li></ul></div>
<div id="tarjetas" hidden><h1>PARTICULARES - Crear nuevo proyecto</h1><div id="contenido"></div></div>
<div id="form" hidden><label for="f1">Fecha de efecto</label><input id="f1"></div>
<template id="plantilla">${tarjetas}</template>
<script>
  window.pulsados = []; function reg(x){ window.pulsados.push(x) }
  function formulario(){ setTimeout(()=>{ document.getElementById('tarjetas').hidden = true; document.getElementById('form').hidden = false }, 300) }
  document.addEventListener('click', (ev) => { const t = ev.target; if (t && t.classList && t.classList.contains('hoja')) { const x = t.textContent.trim(); reg(x); if (x === 'Nuevo proyecto') setTimeout(()=>{ document.getElementById('contenido').appendChild(document.getElementById('plantilla').content.cloneNode(true)); document.getElementById('tarjetas').hidden = false }, ${opciones.retardoMs ?? 200}) } }, true)
</script></body></html>`

async function abrirTarjetas(principal: string, marco?: string) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(5_000)
  await page.route('https://mediadores.fidelidade.es/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: r.request().url().includes('/tarjetas.aspx') && marco !== undefined ? marco : principal }))
  const ctx = {
    credenciales: { usuario: 'USUARIO_FICTICIO', contrasena: 'CLAVE_FICTICIA' },
    log: () => undefined,
    pausa: async () => undefined,
    pulsar: (b: Parameters<typeof pulsar>[0]) => pulsar(b, guard),
    exigirSinCaptcha: async () => undefined,
    pulsarEnlaceEntrada: (b: Parameters<typeof pulsar>[0]) => pulsarEnlaceEntradaAutorizado(b, guard, 'fidelidade'),
  } satisfies CtxEntrada
  await page.goto(URL_INTRANET_FIDELIDADE)
  return { context, page, ctx }
}

const EMPRESAS = `<div class="card"><h3>Producto 4215 · Gama Comercio</h3><p>EMPRESAS</p><input type="button" value="Simulación" onclick="reg('SIM-EMPRESAS')"></div>`

test('0.3.17 · «4216» y «FIDELIDADE VIVIENDA» en elementos separados y botón <input value=Simulación>: se pulsa el de Vivienda, nunca el de EMPRESAS', async () => {
  const viv = `<div class="card"><span class="cod">PRODUCTO 4216</span><span class="nom">FIDELIDADE VIVIENDA</span><input type="button" value="Simulación" onclick="reg('SIM-VIVIENDA');formulario()"></div>`
  const { context, page, ctx } = await abrirTarjetas(portalTarjetas(EMPRESAS + viv))
  try {
    const destino = await abrirFormularioViviendaFidelidade(page, ctx, ESPERAS)
    assert.equal(await destino.locator('label').filter({ hasText: 'Fecha de efecto' }).isVisible(), true)
    const p = await pulsados(page)
    assert.ok(p.includes('SIM-VIVIENDA') && !p.includes('SIM-EMPRESAS'), JSON.stringify(p))
  } finally {
    await context.close()
  }
})

test('0.3.17 · tarjeta sin «4216» (solo «Vivienda»), botón <a><span>Simulación</span></a>: se pulsa el enlace de Vivienda y no el de EMPRESAS', async () => {
  const viv = `<div class="card"><h3>Fidelidade Vivienda</h3><a href="#" onclick="reg('SIM-VIVIENDA');formulario();return false"><span>Simulación</span></a></div>`
  const { context, page, ctx } = await abrirTarjetas(portalTarjetas(EMPRESAS + viv))
  try {
    await abrirFormularioViviendaFidelidade(page, ctx, ESPERAS)
    const p = await pulsados(page)
    assert.ok(p.includes('SIM-VIVIENDA') && !p.includes('SIM-EMPRESAS'), JSON.stringify(p))
  } finally {
    await context.close()
  }
})

test('0.3.17 · la tarjeta vive en un IFRAME del mismo origen: se localiza y se pulsa', async () => {
  const marco = `<!doctype html><html><body>${EMPRESAS.replace(/reg\(/g, 'parent.reg(')}<div class="card"><h3>Producto 4216 · Fidelidade Vivienda</h3><button type="button" onclick="parent.reg('SIM-VIVIENDA');parent.formulario()">Simulación</button></div></body></html>`
  const principal = portalTarjetas('<iframe src="https://mediadores.fidelidade.es/tarjetas.aspx" style="width:600px;height:300px"></iframe>')
  const { context, page, ctx } = await abrirTarjetas(principal, marco)
  try {
    await abrirFormularioViviendaFidelidade(page, ctx, ESPERAS)
    const p = await pulsados(page)
    assert.ok(p.includes('SIM-VIVIENDA') && !p.includes('SIM-EMPRESAS'), JSON.stringify(p))
  } finally {
    await context.close()
  }
})

test('0.3.17 · carga perezosa: las tarjetas aparecen 1,5 s después y se encuentran', async () => {
  const viv = `<div class="card"><h3>Producto 4216 · Fidelidade Vivienda</h3><button type="button" onclick="reg('SIM-VIVIENDA');formulario()">Simulación</button></div>`
  const { context, page, ctx } = await abrirTarjetas(portalTarjetas(EMPRESAS + viv, { retardoMs: 1_500 }))
  try {
    await abrirFormularioViviendaFidelidade(page, ctx, ESPERAS)
    assert.ok((await pulsados(page)).includes('SIM-VIVIENDA'))
  } finally {
    await context.close()
  }
})

test('0.3.17 · una tarjeta «Producto 4217 · … Vivienda» NO es la de Vivienda 4216; solo EMPRESAS: nunca se pulsa «Simulación» y el error describe lo que hay sin PII', async () => {
  const otra = `<div class="card"><h3>Producto 4217 · Otro Vivienda</h3><button type="button" onclick="reg('SIM-4217')">Simulación</button></div>`
  const { context, page, ctx } = await abrirTarjetas(portalTarjetas(EMPRESAS + otra + '<a href="#">usuario@ejemplo.invalid</a><a href="#">Mis datos</a>'))
  try {
    await assert.rejects(
      () => abrirFormularioViviendaFidelidade(page, ctx, { ...ESPERAS, paginaMs: 1_500 }),
      (e: Error) => {
        assert.match(e.message, /no se localiza la tarjeta «Producto 4216/)
        assert.match(e.message, /marcos=1/)
        assert.match(e.message, /«4216» no/)
        assert.match(e.message, /«vivienda» sí/)
        assert.match(e.message, /«simulacion»/)
        assert.match(e.message, /«mis datos»/)
        assert.doesNotMatch(e.message, /ejemplo\.invalid|@/)
        return true
      },
    )
    const p = await pulsados(page)
    assert.ok(!p.some((x) => x.startsWith('SIM-')), JSON.stringify(p))
  } finally {
    await context.close()
  }
})

test('0.3.17 · esTarjetaViviendaFidelidade: 4216 o «vivienda» sin tildes ni mayúsculas; 4215/Gama Comercio/EMPRESAS y códigos distintos jamás', () => {
  assert.equal(esTarjetaViviendaFidelidade('PRODUCTO 4216 FIDELIDADE VIVIENDA'), true)
  assert.equal(esTarjetaViviendaFidelidade('Fidelidade Vivienda'), true)
  assert.equal(esTarjetaViviendaFidelidade('Producto 4216'), true)
  assert.equal(esTarjetaViviendaFidelidade('Producto 4216 · Vivienda para Empresas'), false)
  assert.equal(esTarjetaViviendaFidelidade('Producto 4217 · Vivienda'), false)
  assert.equal(esTarjetaViviendaFidelidade('Gama Comercio'), false)
})

test('0.3.17 · describirSondaSimulacion: ≤30 textos de NAVEGACIÓN de ≤40 car.; nombres, pólizas y datos personales solo se cuentan', () => {
  const muchos = Array.from({ length: 45 }, (_, i) => `Proyecto ${i}`)
  const ajenos = ['a'.repeat(80), 'persona@ejemplo.invalid', 'tel 000000000', 'Juan Pérez García', 'Póliza AB-12-34', 'Bienvenido, Mediador Ejemplo']
  const txt = describirSondaSimulacion(3, [{ botones: [...ajenos, ...muchos], v4216: false, vivienda: true, tarjetas: 0 }, null])
  assert.match(txt, /marcos=3 \(1 ilegibles\)/)
  assert.match(txt, /«4216» no; «vivienda» sí/)
  assert.equal(txt.split('Proyecto ').length - 1, 30)
  assert.doesNotMatch(txt, /ejemplo\.invalid|000000000|Juan|P[eé]rez|AB-12|Mediador Ejemplo|a{41}/)
  assert.match(txt, /otros=6$/)
})

test('0.3.17 · guard de entrada: un <input> sin texto propio se identifica por value/aria-label/title EXACTOS; otro texto, no', async () => {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  await page.route('https://mediadores.fidelidade.es/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><button id="m1">Oficina Virtual</button><button id="m2">Proyecto</button><button id="m3">Nuevo proyecto</button><input id="a" type="button" value="Simulación" onclick="window.x=1"><input id="b" type="button" value="Simulación avanzada" onclick="window.y=1"><input id="c" type="button" value="Emitir" onclick="window.z=1">' }))
  try {
    await page.goto(URL_INTRANET_FIDELIDADE)
    for (const id of ['#m1', '#m2', '#m3']) await pulsarEnlaceEntradaAutorizado(page.locator(id), guard, 'fidelidade')
    await pulsarEnlaceEntradaAutorizado(page.locator('#a'), guard, 'fidelidade')
    assert.equal(await page.evaluate(() => (window as unknown as { x?: number }).x), 1)
    await assert.rejects(() => pulsarEnlaceEntradaAutorizado(page.locator('#b'), guard, 'fidelidade'), /Simulación avanzada/)
    await assert.rejects(() => pulsarEnlaceEntradaAutorizado(page.locator('#c'), guard, 'fidelidade'), /Emitir/)
    assert.equal(await page.evaluate(() => { const w = window as unknown as { y?: number; z?: number }; return w.y ?? w.z ?? null }), null)
  } finally {
    await context.close()
  }
})
