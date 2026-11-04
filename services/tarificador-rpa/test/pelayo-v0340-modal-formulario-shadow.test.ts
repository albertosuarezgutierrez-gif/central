// Pelayo · explorador 0.3.40 (pilotaje real 0a3ffed6): lo que tapa las tarjetas de ramo NO es un aviso sino el FORMULARIO de presupuesto, un web component
// (`<pelayo-modal class="no-footer">`, shadowRoot ABIERTO, z-index 1040) con inputs dentro de otros web components (`pelayo-input`…). El inventario no veía nada ahí.
//   · el inventario atraviesa shadow roots abiertos (recursivo) y lista campos/botones con refs; `localizar` + rellenar/elegir por ref funcionan dentro;
//   · un modal de web component con campos que cubre la ventana ES la pantalla actual (las tarjetas de detrás no se inventarían);
//   · la entrada de Pelayo marca cambio=1 cuando aparece ese modal; `cerrarModalInformativo` NO lo cierra (tiene campos);
//   · PRIVACIDAD: el nombre/NIF/móvil del mediador (MEDIADOR) y «Identidad actual <X>» se tapan en todo texto saliente.
// Portal SINTÉTICO por `page.route`. Sin datos reales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { MEDIADOR } from '../../../packages/module-seguros/src/mediador.ts'
import { cerrarModalInformativo, instalarGuardEmision, pulsar, pulsarEnlaceEntradaAutorizado } from '../src/guard.ts'
import { EXPLORADOR_VERSION, localizar, type CtxEntrada } from '../src/explorador.ts'
import { abrirNuevoPresupuestoPelayo, cambioPantallaPelayo, estructuraPantallaPelayo } from '../src/adapters/pelayo/entrada.ts'
import { capturarInventarioExploracion } from '../src/inventario-dom.ts'
import { redactarMediador, redactarMediadorProfundo, MARCA_MEDIADOR } from '../src/privacidad-mediador.ts'
import { textoModalRedactado } from '../src/modal-informativo.ts'
import { crearLog } from '../src/log.ts'

const ORIGEN = 'https://mediadores.pelayo.com'
const NOMBRE = MEDIADOR.identidad.nombre.toUpperCase()
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

const gv = <T>(p: Page, k: string) => p.evaluate((n) => (window as unknown as Record<string, T>)[n], k)

/** Contenido del shadow del modal: título, identidad, pelayo-input anidado (su input vive en OTRO shadow), label[for]+input, select, radio, botones. */
const SHADOW_FORM = `<style>.caja{background:#fff;padding:20px;margin:40px}</style><div class="caja">
  <h3 class="modal-title">Nueva contratación</h3>
  <p>Identidad actual ${NOMBRE}</p>
  <label for="tdoc">Tipo de documento</label>
  <select id="tdoc"><option value="">Seleccionar tipo de documento</option><option value="nif">NIF</option><option value="nie">NIE</option></select>
  <pelayo-input label="Nº de documento"></pelayo-input>
  <label for="nom">Nombre</label><input id="nom" class="ng-untouched" type="text">
  <input type="radio" name="g" id="rh"><label for="rh">Hombre</label>
  <button type="button" id="sig">Siguiente</button>
  <pelayo-button class="close-button" aria-label="Close"></pelayo-button>
</div>`
const DEFINIR = `<script>
customElements.define('pelayo-input', class extends HTMLElement { constructor(){ super(); const r = this.attachShadow({mode:'open'}); r.innerHTML = '<label for="i">'+(this.getAttribute('label')||'')+'</label><input id="i" type="text" class="ng-untouched">' } });
customElements.define('pelayo-button', class extends HTMLElement { constructor(){ super(); const r = this.attachShadow({mode:'open'}); r.innerHTML = '<button type="button" class="b" aria-label="Close">x</button>'; r.querySelector('button').onclick = () => { window.__cierre = (window.__cierre||0)+1; this.closest('pelayo-modal') && this.closest('pelayo-modal').remove() } } });
customElements.define('pelayo-modal', class extends HTMLElement { constructor(){ super(); const r = this.attachShadow({mode:'open'}); r.innerHTML = ${JSON.stringify(SHADOW_FORM)}; r.getElementById('sig').onclick = () => { window.__sig = (window.__sig||0)+1 } } });
</script>`
const CAJA = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:1040;background:#fff'
const TARJETAS = `<h1>Nuevo presupuesto</h1><div id="r"><a class="card" id="a" onclick="document.body.appendChild(document.createElement('pelayo-modal')).setAttribute('style','${CAJA}')">AUTOS</a><a class="card" id="b">COMERCIO</a></div>${DEFINIR}`
/** Página con el modal YA abierto (sin tarjeta que lo abra). */
const CON_MODAL = `<h1>Nuevo presupuesto</h1><a class="card" id="a" style="position:absolute;left:10px;top:10px">AUTOS</a><pelayo-modal class="no-footer" style="${CAJA}"></pelayo-modal>${DEFINIR}`

async function pagina(cuerpo: string) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await context.route(`${ORIGEN}/**`, (r) => {
    const p = new URL(r.request().url()).pathname
    const body = p === '/portalmediador-presupuestos/' ? '<!doctype html><html><body><h1>Presupuestos</h1><button type="button" onclick="location.href=\'/portalmediador-nuevo-presupuesto/\'">Nuevo Presupuesto</button></body></html>'
      : p === '/portalmediador-nuevo-presupuesto/' ? `<!doctype html><html><body>${cuerpo}</body></html>`
      : '<!doctype html><html><body><a href="#" id="c" onclick="document.getElementById(\'m\').style.display=\'block\';return false">Contratación</a><div id="m" style="display:none"><a href="/portalmediador-presupuestos/">Presupuestos</a></div></body></html>'
    return r.fulfill({ contentType: 'text/html; charset=utf-8', body })
  })
  await page.goto(`${ORIGEN}/portalmediador-nuevo-presupuesto/`)
  return { context, page, guard }
}

test('versión del explorador 0.3.50', () => assert.equal(EXPLORADOR_VERSION, '0.3.50'))

test('inventario: atraviesa el shadow (y el shadow anidado) y lista campos y botones con ref y etiqueta; las tarjetas de detrás NO', async () => {
  const { context, page } = await pagina(CON_MODAL)
  const inv = await capturarInventarioExploracion(page)
  try {
    assert.ok(inv)
    const els = inv!.inventario.marcos.flatMap((m) => m.elementos)
    const por = (f: (e: (typeof els)[number]) => boolean) => els.filter(f)
    const sel = por((e) => e.tag === 'select')
    assert.equal(sel.length, 1, JSON.stringify(els.map((e) => e.tag)))
    assert.equal(sel[0].etiqueta, 'Tipo de documento')
    assert.ok(sel[0].ref && (sel[0].opciones ?? []).length >= 2)
    const textos = por((e) => e.tag === 'input' && e.type === 'text')
    assert.equal(textos.length, 2, 'el input del pelayo-input anidado y el de label[for]')
    assert.ok(textos.some((e) => e.etiqueta === 'Nombre'))
    assert.ok(textos.some((e) => e.etiqueta === 'Nº de documento'), JSON.stringify(textos.map((e) => e.etiqueta)))
    assert.ok(por((e) => e.tag === 'input' && e.type === 'radio').length === 1)
    assert.ok(por((e) => e.tag === 'button' && e.texto === 'Siguiente').length === 1)
    assert.ok(por((e) => /close/i.test(String(e.ariaLabel ?? ''))).length >= 1, 'el botón de cierre del shadow')
    assert.ok(els.every((e) => e.ref), 'todos con ref')
    assert.equal(por((e) => e.texto === 'AUTOS').length, 0, 'la tarjeta tapada no es accionable')
    const titulos = inv!.inventario.marcos.flatMap((m) => m.titulos ?? [])
    assert.ok(titulos.includes('Nueva contratación'), JSON.stringify(titulos))
    // PRIVACIDAD: ni el nombre ni sus apellidos salen en el inventario
    const json = JSON.stringify(inv!.inventario)
    assert.ok(!/su[aá]rez|guti[eé]rrez/i.test(json), 'el nombre del mediador no sale')
  } finally { await inv?.liberar(); await context.close() }
})

test('localizar(ref) y rellenar / elegir por ref funcionan DENTRO del shadow (la marca temporal se ve por CSS de Playwright dentro del shadow)', async () => {
  const { context, page } = await pagina(CON_MODAL)
  const inv = await capturarInventarioExploracion(page)
  try {
    const els = inv!.inventario.marcos.flatMap((m) => m.elementos)
    const nom = els.find((e) => e.etiqueta === 'Nombre')!
    const ndoc = els.find((e) => e.etiqueta === 'Nº de documento')!
    const sel = els.find((e) => e.tag === 'select')!
    for (const [el, accion] of [[nom, 'fill'], [ndoc, 'fill'], [sel, 'select']] as const) {
      const l = await localizar(inv!.nodos.get(el.ref!)!, el)
      assert.ok('loc' in l, JSON.stringify(l))
      if (!('loc' in l)) return
      if (accion === 'fill') await l.loc.fill(el === nom ? 'PRUEBA' : 'X123')
      else await l.loc.selectOption('nif')
    }
    assert.equal(await page.locator('pelayo-modal').locator('#nom').inputValue(), 'PRUEBA')
    assert.equal(await page.locator('pelayo-modal').locator('pelayo-input input').inputValue(), 'X123')
    assert.equal(await page.locator('pelayo-modal').locator('#tdoc').inputValue(), 'nif')
  } finally { await inv?.liberar(); await context.close() }
})

test('la entrada de Pelayo marca cambio=1 cuando tras pulsar la tarjeta aparece el modal con campos (sin cambio de URL)', async () => {
  const { context, page, guard } = await pagina(TARJETAS)
  try {
    await page.goto(`${ORIGEN}/portalmediador-pagina-inicio/`)
    const notas: string[] = []
    const ctx = {
      credenciales: { usuario: 'U', contrasena: 'C' },
      log: (m: string) => { notas.push(m) },
      pausa: async () => undefined,
      pulsar: (b: Parameters<typeof pulsar>[0]) => pulsar(b, guard),
      exigirSinCaptcha: async () => undefined,
      pulsarEnlaceEntrada: (b: Parameters<typeof pulsar>[0]) => pulsarEnlaceEntradaAutorizado(b, guard, 'pelayo'),
    } satisfies CtxEntrada
    const dest = await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', { menuMs: 4_000, paginaMs: 4_000, formularioMs: 8_000 })
    assert.equal(await dest.locator('pelayo-modal').count(), 1)
    const nota = notas.find((n) => n.startsWith('pelayo_diagnostico_ramo'))
    assert.ok(nota && /cambio=1/.test(nota), nota)
    assert.equal(guard.violacion(), null)
  } finally { await context.close() }
})

test('estructura de pantalla: con el modal-formulario, el cambio respecto a las tarjetas es detectable', async () => {
  const a = await pagina(TARJETAS)
  const b = await pagina(CON_MODAL)
  try {
    const antes = await estructuraPantallaPelayo(a.page)
    const despues = await estructuraPantallaPelayo(b.page)
    assert.ok((despues.modal ?? 0) >= 4, JSON.stringify(despues))
    assert.ok(despues.campos >= 4)
    assert.ok(despues.titulos.includes('Nueva contratación'))
    assert.ok(!JSON.stringify(despues).match(/su[aá]rez|guti[eé]rrez/i))
    assert.equal(cambioPantallaPelayo({ ...antes, ruta: despues.ruta }, despues), true)
  } finally { await a.context.close(); await b.context.close() }
})

test('cerrarModalInformativo NO cierra el modal con campos: no_cerrable con_campos, sin Escape, sin «Close», el host sigue', async () => {
  const { context, page, guard } = await pagina(CON_MODAL + "<script>document.addEventListener('keydown',function(e){if(e.key==='Escape')window.__esc=(window.__esc||0)+1})</script>")
  try {
    const r = await cerrarModalInformativo(page, guard, 150)
    assert.equal(r.estado, 'no_cerrable', JSON.stringify(r))
    if (r.estado === 'no_cerrable') assert.equal(r.motivo, 'con_campos')
    assert.equal((await gv<number>(page, '__esc')) ?? 0, 0)
    assert.equal((await gv<number>(page, '__cierre')) ?? 0, 0)
    assert.equal(await page.locator('pelayo-modal').count(), 1)
  } finally { await context.close() }
})

// ─── PRIVACIDAD ──────────────────────────────────────────────────────────────

test('redactarMediador: nombre completo (cualquier orden/tildes/caso), NIF, móvil y «Identidad actual <X>» ajeno', () => {
  const n = MEDIADOR.identidad.nombre
  const [nombre, ap1, ap2] = n.split(' ')
  for (const t of [`Identidad actual ${n.toUpperCase()}`, `hola ${n} fin`, `${ap1} ${ap2}, ${nombre}`, `${n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}`]) {
    const r = redactarMediador(t)
    assert.ok(!new RegExp(`${ap1}|${ap2}|su[aá]rez|guti[eé]rrez`, 'i').test(r), `${t} → ${r}`)
  }
  assert.ok(!redactarMediador(`NIF ${MEDIADOR.identidad.nif} y ${MEDIADOR.identidad.nif.slice(0, 8)}-${MEDIADOR.identidad.nif.slice(8)}`).includes(MEDIADOR.identidad.nif.slice(0, 8)))
  const tlf = MEDIADOR.identidad.telefono.replace('+34', '')
  for (const t of [tlf, `+34 ${tlf.slice(0, 3)} ${tlf.slice(3, 6)} ${tlf.slice(6)}`, MEDIADOR.identidad.telefono]) assert.ok(!redactarMediador(`tel ${t}.`).includes(tlf.slice(3)), t)
  // «Identidad actual» con OTRO nombre: se tapa igual, y no se come el rótulo que sigue
  const ajeno = redactarMediador('Identidad actual JUAN PEREZ LOPEZ Datos del Tomador Tipo de documento')
  assert.ok(!/JUAN|PEREZ|LOPEZ/.test(ajeno), ajeno)
  assert.ok(ajeno.includes(MARCA_MEDIADOR) && ajeno.includes('Datos del Tomador'), ajeno)
  // textos neutros intactos
  assert.equal(redactarMediador('Nueva contratación · Datos del Tomador · Alberto'), 'Nueva contratación · Datos del Tomador · Alberto')
  assert.equal(redactarMediadorProfundo({ a: ['x', { b: `Identidad actual ${n}` }], c: 3 }).c, 3)
  assert.ok(!JSON.stringify(redactarMediadorProfundo({ a: [{ b: `Identidad actual ${n}` }] })).match(/su[aá]rez/i))
})

test('el texto del interceptor, el log y el inventario crudo no sacan el nombre del mediador', () => {
  assert.ok(!/su[aá]rez/i.test(textoModalRedactado(`Identidad actual ${NOMBRE}`, 160)))
  const salida: string[] = []
  const w = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((s: string) => { salida.push(String(s)); return true }) as typeof process.stdout.write
  try { crearLog({}, 'j').log(`modal Identidad actual ${NOMBRE}`, { nota: MEDIADOR.identidad.nombre }) } finally { process.stdout.write = w }
  assert.equal(salida.length, 1)
  assert.ok(!/su[aá]rez|guti[eé]rrez/i.test(salida[0]), salida[0])
  assert.ok(JSON.parse(salida[0]).msg.includes(MARCA_MEDIADOR))
})
