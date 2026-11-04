// Pelayo · explorador 0.3.38: MODAL INFORMATIVO. Un `.pelayo-modal.no-footer` PERSISTENTE tapa las tarjetas de ramo (hecho real, pilotaje 608504fd).
//   · el diagnóstico (`inspeccionar` y la nota del clic) describe el interceptor sin PII y en forma cerrada;
//   · el inventario incluye el control de cierre de un modal visible aunque no tenga texto;
//   · `cerrar_modal` y el cierre automático en la entrada: Escape › botón de cierre › fondo, SOLO si el modal no tiene campos ni términos de acción final.
// Portal SINTÉTICO. Nunca force/dispatchEvent.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import type { InventarioDom } from '@central/module-tarificacion'
import { AJUSTES_CLIC_TARJETA, cerrarModalInformativo, instalarGuardEmision, pulsar, pulsarEnlaceEntradaAutorizado } from '../src/guard.ts'
import type { CtxEntrada } from '../src/explorador.ts'
import { EXPLORADOR_VERSION } from '../src/explorador.ts'
import { abrirNuevoPresupuestoPelayo } from '../src/adapters/pelayo/entrada.ts'
import { RE_CUERPO_DIAGNOSTICO_CLIC, RE_NOTA_CLIC_PELAYO, cuerpoDiagnosticoClic, leerDiagnosticoClic } from '../src/diagnostico-clic.ts'
import { evaluarModal, fragmentoInterceptor, lineasInterceptor, veredictoModal } from '../src/modal-informativo.ts'
import { buclePilotaje, type ContextoPilotaje } from '../src/pilotaje.ts'
import { leerComando } from '../src/pilotaje-reglas.ts'
import type { ResultadoComandoPilotaje } from '../src/api.ts'
import { capturarInventarioExploracion } from '../src/inventario-dom.ts'

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
  AJUSTES_CLIC_TARJETA.pasoMs = 1_500
  AJUSTES_CLIC_TARJETA.hoverMs = 500
})
after(async () => { await browser.close() })

const HOME = `<!doctype html><html><body><a href="#" id="c" onclick="document.getElementById('m').style.display='block';return false">Contratación</a>
  <div id="m" style="display:none"><a href="/portalmediador-presupuestos/">Presupuestos</a></div></body></html>`
const PRESUP = '<!doctype html><html><body><h1>Presupuestos</h1><button type="button" onclick="location.href=\'/portalmediador-nuevo-presupuesto/\'">Nuevo Presupuesto</button></body></html>'
const FORM = '<h2>Datos del vehículo</h2><label>Matrícula <input name="mat"></label><label>Fecha <input name="f"></label><select name="u"><option>Uso</option></select>'
const REPINTA = `document.getElementById('r').innerHTML='${FORM.replace(/'/g, "\\'")}'`
const CUENTA = `window.__clics=(window.__clics||0)+1;${REPINTA}`

const ESTILO_MODAL = 'position:fixed;left:0;top:0;right:0;bottom:0;background:#fff;z-index:99'
const CERRAR = "this.closest('.pelayo-modal').remove()"
type Modo = 'cierre_x' | 'escape' | 'con_aceptar' | 'con_input' | 'backdrop' | 'texto_dni'
const MODALES: Record<Modo, string> = {
  // Persistente, sin Escape ni fondo: solo se cierra con el «×».
  cierre_x: `<div class="pelayo-modal no-footer" style="${ESTILO_MODAL}"><p>Aviso informativo del portal.</p><button type="button" class="close" aria-label="Cerrar" onclick="window.__cierre=(window.__cierre||0)+1;${CERRAR}">×</button></div>`,
  // Se cierra con Escape (el «×» cuenta si se pulsa: no debe pulsarse).
  escape: `<div class="pelayo-modal no-footer" style="${ESTILO_MODAL}"><p>Aviso informativo del portal.</p><button type="button" class="close" aria-label="Cerrar" onclick="window.__cierre=(window.__cierre||0)+1;${CERRAR}">×</button></div><script>document.addEventListener('keydown',function(e){if(e.key==='Escape'){window.__esc=(window.__esc||0)+1;var m=document.querySelector('.pelayo-modal');if(m)m.remove()}})</script>`,
  // Con un texto de acción final: no se toca (ni Escape, ni «×», ni fondo).
  con_aceptar: `<div class="pelayo-modal no-footer" style="${ESTILO_MODAL}"><p>Para continuar debe leer el documento.</p><button type="button" id="acep" onclick="window.__acepto=1">Aceptar condiciones</button><button type="button" class="close" aria-label="Cerrar" onclick="window.__cierre=(window.__cierre||0)+1;${CERRAR}">×</button></div><script>document.addEventListener('keydown',function(e){if(e.key==='Escape'){window.__esc=(window.__esc||0)+1}})</script>`,
  // Con un campo de formulario: no se toca.
  con_input: `<div class="pelayo-modal no-footer" style="${ESTILO_MODAL}"><p>Indique el motivo.</p><input name="motivo" id="mot"><button type="button" class="close" aria-label="Cerrar" onclick="window.__cierre=(window.__cierre||0)+1;${CERRAR}">×</button></div><script>document.addEventListener('keydown',function(e){if(e.key==='Escape'){window.__esc=(window.__esc||0)+1}})</script>`,
  // Sin «×» ni Escape: solo el fondo cierra.
  backdrop: `<div class="modal-backdrop" style="position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.4);z-index:90" onclick="window.__fondo=(window.__fondo||0)+1;this.nextElementSibling.remove();this.remove()"></div><div class="pelayo-modal" role="dialog" style="position:fixed;left:30%;top:30%;width:40%;height:40%;background:#fff;z-index:99"><p>Aviso informativo del portal.</p></div>`,
  // Con un texto que parece un NIF: el texto sale redactado.
  texto_dni: `<div class="pelayo-modal no-footer" style="${ESTILO_MODAL}"><p>Titular 12345678Z pendiente.</p><button type="button" class="close" aria-label="Cerrar" onclick="${CERRAR}">×</button></div>`,
}
const nuevoPresupuesto = (modal: Modo | null): string =>
  `<!doctype html><html><body><h1>Nuevo presupuesto</h1><div id="r"><a class="card" id="a">AUTOS</a><a class="card" id="b">COMERCIO</a></div>${modal ? MODALES[modal] : ''}<script>window.__clics=0;document.getElementById('a').onclick=function(){${CUENTA}}</script></body></html>`

async function abrir(modal: Modo | null) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await context.route(`${ORIGEN}/**`, (r) => {
    const p = new URL(r.request().url()).pathname
    const body = p === '/portalmediador-presupuestos/' ? PRESUP : p === '/portalmediador-nuevo-presupuesto/' ? nuevoPresupuesto(modal) : HOME
    return r.fulfill({ contentType: 'text/html; charset=utf-8', body })
  })
  await page.goto(`${ORIGEN}/portalmediador-pagina-inicio/`)
  const notas: string[] = []
  const logs: string[] = []
  const ctx = {
    credenciales: { usuario: 'U', contrasena: 'C' },
    log: (l: string) => { logs.push(l) },
    pausa: async () => undefined,
    pulsar: (b: Parameters<typeof pulsar>[0]) => pulsar(b, guard),
    exigirSinCaptcha: async () => undefined,
    pulsarEnlaceEntrada: (b: Parameters<typeof pulsar>[0], o?: { reintento?: boolean }) => pulsarEnlaceEntradaAutorizado(b, guard, 'pelayo', o),
    diagnostico: (n: string) => { notas.push(n) },
    cerrarModal: (p: Page) => cerrarModalInformativo(p, guard, 250),
  } satisfies CtxEntrada
  const ctxSinCierre = { ...ctx, cerrarModal: undefined }
  return { context, page, ctx, ctxSinCierre, notas, logs, guard }
}
const ESP = { menuMs: 4_000, paginaMs: 4_000, formularioMs: 4_000, reintentoMs: 1_500 }
const hayFormulario = async (p: Page) => (await p.getByText('Datos del vehículo').count()) > 0
const gv = <T>(p: Page, k: string) => p.evaluate((n) => (window as unknown as Record<string, T>)[n], k)

/** Una página suelta en el origen de Pelayo con el cuerpo dado (para probar `cerrarModalInformativo` y el inventario sin la entrada). */
async function pagina(cuerpo: string) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await context.route(`${ORIGEN}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><body>${cuerpo}</body></html>` }))
  await page.goto(`${ORIGEN}/portalmediador-nuevo-presupuesto/`)
  return { context, page, guard }
}

// ─── Puras ───────────────────────────────────────────────────────────────────

test('versión del explorador 0.3.39', () => {
  assert.equal(EXPLORADOR_VERSION, '0.3.39')
})

test('evaluarModal: forma cerrada, texto redactado ≤160, veredicto (campos / términos prohibidos), fragmento de la nota', () => {
  const base = {
    tag: 'DIV', cls: 'pelayo-modal no-footer EXTRA<script>', vis: true, w: 800.4, h: 600, z: 99, dlg: false, amodal: false, esM: true,
    texto: 'Aviso informativo.', campos: 0, nCierre: 1, attrs: ['pelayo-modal no-footer', 'Cerrar'],
    ctl: [{ i: 3, tag: 'button', type: 'button', cls: 'close btn', aria: 'Cerrar', title: '', txt: '×', cierre: true }],
  }
  const m = evaluarModal(base)!
  assert.equal(m.cls, 'pelayo-modal.no-footer')
  assert.deepEqual(veredictoModal(m), { ok: true })
  assert.equal(fragmentoInterceptor(m), 'int=div/pelayo-modal.no-footer/d0m1f0x1/z99')
  assert.deepEqual(veredictoModal(evaluarModal({ ...base, campos: 1 })!), { ok: false, motivo: 'con_campos' })
  assert.deepEqual(veredictoModal(evaluarModal({ ...base, texto: 'Aceptar condiciones del contrato' })!), { ok: false, motivo: 'termino_prohibido' })
  assert.deepEqual(veredictoModal(evaluarModal({ ...base, attrs: ['onclick:emitirPoliza()'] })!), { ok: false, motivo: 'termino_prohibido' })
  assert.deepEqual(veredictoModal(evaluarModal({ ...base, ctl: [{ ...base.ctl[0], txt: 'Contratar' }] })!), { ok: false, motivo: 'termino_prohibido' })
  assert.deepEqual(veredictoModal(evaluarModal({ ...base, esM: false })!), { ok: false, motivo: 'no_es_modal' })
  const largo = evaluarModal({ ...base, texto: 'palabra '.repeat(100) })!
  assert.ok(largo.texto.length <= 160)
  assert.equal(evaluarModal({ ...base, texto: 'DNI 12345678Z del titular' })!.texto, '(texto redactado)')
  assert.equal(evaluarModal(null), null)
  for (const l of lineasInterceptor(m)) assert.ok(l.length <= 160, l)
  assert.ok(lineasInterceptor(m).length <= 9)
})

test('leerComando: `cerrar_modal` no lleva más claves', () => {
  assert.deepEqual(leerComando({ accion: 'cerrar_modal' }), { ok: true, c: { accion: 'cerrar_modal' } })
  assert.equal(leerComando({ accion: 'cerrar_modal', ref: 'm0e1' }).ok, false)
  assert.equal(leerComando({ accion: 'cerrar_modal', forzar: true }).ok, false)
})

// ─── Entrada de Pelayo: cierre automático ────────────────────────────────────

test('modal PERSISTENTE con «×» que tapa las tarjetas: se cierra por el botón de cierre y la tarjeta se pulsa (no se fuerza nada)', async () => {
  const { context, page, ctx, notas, logs, guard } = await abrir('cierre_x')
  try {
    const dest = await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', ESP)
    assert.equal(await hayFormulario(dest), true, 'la tarjeta se pulsó tras cerrar el modal')
    assert.equal(await gv<number>(dest, '__clics'), 1)
    assert.equal(await gv<number>(dest, '__cierre'), 1, 'el «×» se pulsó una vez')
    assert.equal(await dest.locator('.pelayo-modal').count(), 0)
    assert.ok(logs.includes('pelayo_modal cerrado boton'), logs.join(' | '))
    assert.equal(notas.length, 0)
    assert.equal(guard.violacion(), null)
  } finally { await context.close() }
})

test('Escape cierra un modal informativo: se prueba primero y el «×» no se llega a pulsar', async () => {
  const { context, page, ctx, logs } = await abrir('escape')
  try {
    const dest = await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', ESP)
    assert.equal(await hayFormulario(dest), true)
    assert.equal(await gv<number>(dest, '__esc'), 1)
    assert.equal(await gv<number>(dest, '__cierre') ?? 0, 0, 'el «×» no se pulsó')
    assert.ok(logs.includes('pelayo_modal cerrado escape'), logs.join(' | '))
  } finally { await context.close() }
})

test('modal con «Aceptar condiciones»: NO se toca (ni Escape, ni «×», ni «Aceptar») y la nota del clic describe al interceptor', async () => {
  const { context, page, ctx, notas, logs } = await abrir('con_aceptar')
  try {
    const dest = await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', ESP)
    assert.equal(await hayFormulario(dest), false)
    assert.equal(await gv<number>(dest, '__clics'), 0)
    assert.equal(await gv<number>(dest, '__esc') ?? 0, 0, 'ni Escape')
    assert.equal(await gv<number>(dest, '__cierre') ?? 0, 0, 'ni el «×»')
    assert.equal(await gv<number>(dest, '__acepto') ?? 0, 0, 'ni «Aceptar condiciones»')
    assert.equal(await dest.locator('.pelayo-modal').count(), 1)
    assert.ok(logs.includes('pelayo_modal no_cerrable termino_prohibido'), logs.join(' | '))
    const nota = notas.at(-1)!
    assert.ok(RE_NOTA_CLIC_PELAYO.test(nota), nota)
    assert.match(nota, / hit=otro\/div\/pelayo-modal cookie=0 ifr=0 shd=0 anim=0 int=div\/pelayo-modal\.no-footer\/d0m1f0x1\/z99$/)
  } finally { await context.close() }
})

test('modal con un campo (input): NO se toca', async () => {
  const { context, page, ctx, logs } = await abrir('con_input')
  try {
    const dest = await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', ESP)
    assert.equal(await hayFormulario(dest), false)
    assert.equal(await gv<number>(dest, '__esc') ?? 0, 0)
    assert.equal(await gv<number>(dest, '__cierre') ?? 0, 0)
    assert.equal(await dest.locator('.pelayo-modal').count(), 1)
    assert.ok(logs.includes('pelayo_modal no_cerrable con_campos'), logs.join(' | '))
  } finally { await context.close() }
})

// ─── cerrarModalInformativo ──────────────────────────────────────────────────

test('sin modal visible: no hace nada; un modal oculto no cuenta', async () => {
  const { context, page, guard } = await pagina('<h1>Hola</h1><div class="modal" style="display:none">oculto</div>')
  try {
    assert.deepEqual(await cerrarModalInformativo(page, guard, 100), { estado: 'sin_modal' })
  } finally { await context.close() }
})

test('el fondo (backdrop) cierra un modal sin «×» ni Escape; antes se probaron las otras dos vías', async () => {
  const { context, page, guard } = await pagina(MODALES.backdrop)
  try {
    const r = await cerrarModalInformativo(page, guard, 250)
    assert.equal(r.estado, 'cerrado', JSON.stringify(r))
    if (r.estado === 'cerrado') {
      assert.equal(r.via, 'backdrop')
      assert.deepEqual(r.intentos, ['escape', 'boton:sin_control', 'backdrop'])
    }
    assert.equal(await gv<number>(page, '__fondo'), 1)
  } finally { await context.close() }
})

test('«Cerrar sesión» no es un cierre neutro: no se pulsa; dos modales visibles = no se toca nada', async () => {
  const sesion = await pagina(`<div class="pelayo-modal" style="${ESTILO_MODAL}"><p>Aviso.</p><button type="button" class="close" aria-label="Cerrar sesión" onclick="window.__sesion=1">×</button></div>`)
  try {
    const r = await cerrarModalInformativo(sesion.page, sesion.guard, 150)
    assert.notEqual(r.estado, 'cerrado', JSON.stringify(r))
    assert.equal(await gv<number>(sesion.page, '__sesion') ?? 0, 0)
  } finally { await sesion.context.close() }
  const dos = await pagina(`<div class="modal" style="position:fixed;left:0;top:0;width:100px;height:100px">uno</div><div class="modal" style="position:fixed;left:200px;top:0;width:100px;height:100px">dos</div>`)
  try {
    assert.deepEqual(await cerrarModalInformativo(dos.page, dos.guard, 100), { estado: 'no_cerrable', motivo: 'varios_modales', modal: null })
  } finally { await dos.context.close() }
})

test('un `<body class="modal-open">` no es un modal', async () => {
  const { context, page, guard } = await pagina('<h1>Hola</h1>')
  try {
    await page.evaluate(() => { document.body.className = 'modal-open' })
    assert.deepEqual(await cerrarModalInformativo(page, guard, 100), { estado: 'sin_modal' })
  } finally { await context.close() }
})

// ─── Diagnóstico, inventario y pilotaje ──────────────────────────────────────

test('leerDiagnosticoClic describe al interceptor: clases, role=dialog, texto redactado, controles hijos y su cierre típico', async () => {
  const { context, page } = await pagina(`<a class="card" id="a" style="position:absolute;left:10px;top:10px;width:200px;height:100px">AUTOS</a>
    <div class="pelayo-modal no-footer" role="dialog" aria-modal="true" style="${ESTILO_MODAL}"><p>Titular 12345678Z pendiente de revisión.</p><button type="button" class="btn-close" aria-label="Cerrar"></button><a href="#" id="mas">Más información</a></div>`)
  try {
    const d = await leerDiagnosticoClic(page.locator('#a'))
    assert.ok(d?.int, JSON.stringify(d))
    assert.equal(d.int.cls, 'pelayo-modal.no-footer')
    assert.equal(d.int.dlg, true)
    assert.equal(d.int.amodal, true)
    assert.equal(d.int.z, 99)
    assert.equal(d.int.texto, '(texto redactado)', 'el texto con forma de NIF sale redactado')
    assert.equal(d.int.nCierre, 1)
    assert.deepEqual(d.int.ctl.map((c) => [c.tag, c.cls, c.aria, c.cierre]), [['button', 'btn-close', 'Cerrar', true], ['a', '-', '-', false]])
    assert.match(cuerpoDiagnosticoClic(d), / int=div\/pelayo-modal\.no-footer\/d1m1f0x1\/z99$/)
    assert.ok(RE_CUERPO_DIAGNOSTICO_CLIC.test(cuerpoDiagnosticoClic(d)))
    // Un modal con el «Aceptar condiciones» en un control: el veredicto lo marca (no se cerraría).
    assert.deepEqual(veredictoModal(d.int), { ok: true })
  } finally { await context.close() }
})

test('el inventario incluye el control de cierre de un modal visible aunque no tenga texto («×» en un span, botón con aria-label)', async () => {
  const { context, page } = await pagina(`<h1>Pantalla</h1><span class="close" id="xx">×</span>
    <div class="pelayo-modal" role="dialog" style="${ESTILO_MODAL}"><p>Aviso.</p><span class="cerrar-aviso close">×</span><button type="button" aria-label="Cerrar ventana"></button><i class="btn-close" data-bs-dismiss="modal" style="display:inline-block;width:10px;height:10px"></i></div>`)
  try {
    const cap = await capturarInventarioExploracion(page)
    assert.ok(cap)
    const els = cap.inventario.marcos.flatMap((m) => m.elementos)
    const cierres = els.filter((e) => (e.tag === 'span' && e.texto === '×') || (e.tag === 'button' && e.ariaLabel === 'Cerrar ventana') || e.tag === 'i')
    assert.equal(cierres.length, 3, JSON.stringify(els))
    assert.ok(cierres.every((e) => e.ref), 'con ref')
    // El «×» de FUERA del modal no se añade (solo los de un modal visible).
    assert.equal(els.filter((e) => e.id === 'xx').length, 0)
    await cap.liberar()
  } finally { await context.close() }
})

const PAGINA_PILOTAJE = (modal: Modo) => `<!doctype html><html><body><script>window.__clics=0</script><h1>Nuevo presupuesto</h1><a class="card" id="a" onclick="window.__clics++">AUTOS</a>${MODALES[modal]}</body></html>`

async function pilotar(modal: Modo, guion: (inv: InventarioDom, n: number) => unknown) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route(`${ORIGEN}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGINA_PILOTAJE(modal) }))
  const page = await context.newPage()
  page.setDefaultTimeout(2_500)
  await page.goto(`${ORIGEN}/portalmediador-nuevo-presupuesto/`)
  const publicados: { n: number; inventario: InventarioDom; resultadoAnterior?: ResultadoComandoPilotaje }[] = []
  let reloj = 0
  const k: ContextoPilotaje = {
    trabajoId: '00000000-0000-4000-8000-000000000001', compania: 'pelayo', ramo: 'auto', entrada: 'pelayo:presupuestos:auto', env: {}, guard,
    pulsar: (b) => pulsar(b, guard),
    pausaAccion: async () => undefined,
    publicar: async (c) => { publicados.push(c); return 'ok' },
    pedirComando: async (n) => ({ estado: 'ok', comando: guion(publicados[publicados.length - 1].inventario, n) }),
    log: () => undefined,
    sinCaptura: true,
    ahora: () => reloj,
    dormir: async (ms) => { reloj += ms },
  }
  const fin = await buclePilotaje(page, k)
  return { context, page, guard, publicados, fin }
}
const refAutos = (inv: InventarioDom): string => {
  for (const m of inv.marcos) for (const e of m.elementos) if (e.texto === 'AUTOS' && e.ref) return e.ref
  throw new Error('sin ref de AUTOS')
}

test('pilotaje: `inspeccionar` la tarjeta tapada describe al interceptor (sin PII) y `cerrar_modal` lo cierra; después la tarjeta se pulsa', async () => {
  const { context, page, publicados, fin, guard } = await pilotar('cierre_x', (inv, n) => (n === 1 ? { accion: 'inspeccionar', ref: refAutos(inv) } : n === 2 ? { accion: 'cerrar_modal' } : n === 3 ? { accion: 'pulsar', ref: refAutos(inv) } : { accion: 'fin' }))
  try {
    assert.equal(fin.motivo, 'fin')
    const insp = publicados[1].resultadoAnterior!
    assert.equal(insp.estado, 'hecho', JSON.stringify(insp))
    const det = insp.detalle!
    assert.ok(RE_CUERPO_DIAGNOSTICO_CLIC.test(det[0].replace(/^diag: /, '')), det[0])
    assert.ok(det.some((l) => /^int: div cls=pelayo-modal\.no-footer vis=1 bb=\d+x\d+ z=99 dlg=0 amodal=0 modal=1 campos=0 cierre=1 bloqueo=-$/.test(l)), det.join('\n'))
    assert.ok(det.some((l) => l === 'int-texto: «Aviso informativo del portal. ×»'), det.join('\n'))
    assert.ok(det.some((l) => /^int-ctl: button\/button\/close cierre=1 aria=«Cerrar» title=«-» txt=«×»$/.test(l)), det.join('\n'))
    assert.ok(det.length <= 10)
    // El inventario de la pantalla ya traía el «×» del modal.
    assert.ok(publicados[0].inventario.marcos.some((m) => m.elementos.some((e) => e.texto === '×')))
    const cm = publicados[2].resultadoAnterior!
    assert.equal(cm.estado, 'hecho', JSON.stringify(cm))
    assert.equal(cm.motivo, 'modal cerrado (boton)')
    const pul = publicados[3].resultadoAnterior!
    assert.equal(pul.estado, 'hecho', JSON.stringify(pul))
    assert.equal(await gv<number>(page, '__clics'), 1)
    assert.equal(guard.violacion(), null)
  } finally { await context.close() }
})

test('pilotaje: `cerrar_modal` sobre un modal con «Aceptar condiciones» se RECHAZA sin tocar nada y diagnostica; sin modal visible no hace nada', async () => {
  const { context, page, publicados } = await pilotar('con_aceptar', (_inv, n) => (n === 1 ? { accion: 'cerrar_modal' } : { accion: 'fin' }))
  try {
    const r = publicados[1].resultadoAnterior!
    assert.equal(r.estado, 'rechazado', JSON.stringify(r))
    assert.equal(r.motivo, 'modal_no_cerrable_termino_prohibido')
    assert.ok(r.detalle!.some((l) => l.startsWith('int: div cls=pelayo-modal.no-footer')), r.detalle!.join('\n'))
    assert.equal(await gv<number>(page, '__esc') ?? 0, 0)
    assert.equal(await gv<number>(page, '__cierre') ?? 0, 0)
    assert.equal(await gv<number>(page, '__acepto') ?? 0, 0)
  } finally { await context.close() }
  const sin = await pilotar('texto_dni', (_inv, n) => (n === 1 ? { accion: 'cerrar_modal' } : n === 2 ? { accion: 'cerrar_modal' } : { accion: 'fin' }))
  try {
    assert.equal(sin.publicados[1].resultadoAnterior!.estado, 'hecho')
    assert.equal(sin.publicados[1].resultadoAnterior!.motivo, 'modal cerrado (boton)')
    assert.equal(sin.publicados[2].resultadoAnterior!.motivo, 'sin modal visible')
  } finally { await sin.context.close() }
})
