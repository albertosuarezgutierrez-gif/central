// Mapfre NSEI · LUPA del tomador (v0.6.0, 14/10/2026). Trabajo real d7987f90: el bot murió en el paso 1 con «mapa incompleto:
// faltan la lupa…» SIN preguntar a la IA ni atascarse. Ahora: fijo → aprendido → IA → ATASCO F2, y el clic solo por
// `pulsarBuscarTomadorMapfre` (guard.ts). Fixtures SINTÉTICAS (Angular Material simplificado); NIF y valores inventados.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { EmisionBloqueadaError, type FormularioAuto } from '@central/module-tarificacion'
import { esControlBuscarTomador, esIconoBusqueda, instalarGuardEmision, pulsarBuscarTomadorMapfre, pulsarContinuarMapfre, TEXTOS_BUSCAR_TOMADOR, type GuardEmision, type PasoContinuarMapfre } from '../src/guard.ts'
import { ACCIONES_PERMITIDAS, candidatoElegibleAtasco, prepararFormador, proyectarCandidato, validarAccion, type ContextoFormador, type DescripcionElemento } from '../src/formador.ts'
import { ErrorMapaIncompleto, pasoDatosBasicos } from '../src/adapters/mapfre/auto.ts'
import { clasificarIntento, ErrorTarificador, pideInventarioDom } from '../src/errores.ts'

const NIF = '00000000T'
const PASOS = ['Datos básicos', 'Objeto asegurado', 'Figuras', 'Coberturas', 'Proyectos', 'Contratación']
const form = { ramo: 'auto', documentoTomador: NIF } as unknown as FormularioAuto

// Al pulsar la lupa «buena», el portal pinta el tomador dentro de app-datos-basicos (lo que el adaptador espera ver cambiar).
const CARGAR = `window.__busquedas=(window.__busquedas||0)+1;setTimeout(()=>{document.getElementById('res').textContent='Tomador: PERSONA DE PRUEBA'},50)`

/** Pantalla del paso 1. `lupa` = HTML de la lupa; `dentroDelCampo` = dentro del mat-form-field del NIF (sufijo) o fuera. */
const PANTALLA = (lupa: string, o: { dentroDelCampo?: boolean; extra?: string } = {}) => `<mat-horizontal-stepper>
${PASOS.map((p, i) => `<mat-step-header role="tab" aria-selected="${i === 0}">${i + 1} ${p}</mat-step-header>`).join('\n')}
</mat-horizontal-stepper>
<app-datos-basicos>
  <mat-form-field><label for="doc">Documento</label><input id="doc" name="codigoDocumento">${o.dentroDelCampo === false ? '' : lupa}</mat-form-field>
  ${o.dentroDelCampo === false ? `<div class="acciones">${lupa}</div>` : ''}
  <span id="res"></span>
</app-datos-basicos>
${o.extra ?? ''}
<div class="pie"><button id="cont" onclick="const h=[...document.querySelectorAll('mat-step-header')];h[0].setAttribute('aria-selected','false');h[1].setAttribute('aria-selected','true')">Continuar</button></div>`

const LUPA_BUSCAR = `<button id="lupa" aria-label="Buscar" onclick="${CARGAR}"><i class="fa fa-search"></i></button>`

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

async function preparar(html: string): Promise<{ page: Page; guard: GuardEmision }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(`<body>${html}</body>`)
  return { page, guard }
}

const busquedas = (page: Page) => page.evaluate(() => (window as unknown as { __busquedas?: number }).__busquedas ?? 0)

// ───────────── la regla de la lupa (pura) ─────────────

test('tabla: `buscar_tomador` en ACCIONES_PERMITIDAS = TEXTOS_BUSCAR_TOMADOR del guard (una sola lista, dos copias vigiladas)', () => {
  assert.deepEqual([...ACCIONES_PERMITIDAS.buscar_tomador], [...TEXTOS_BUSCAR_TOMADOR])
})

test('esControlBuscarTomador: texto visible → etiquetas accesibles → icono; con texto ajeno, el icono no salva', () => {
  const c = (o: Partial<Parameters<typeof esControlBuscarTomador>[0]>) => ({ textoSinIcono: null, ariaLabel: null, title: null, tooltip: null, icono: null, ...o })
  assert.equal(esControlBuscarTomador(c({ ariaLabel: 'Buscar' })), true, 'aria-label «Buscar» sin texto')
  assert.equal(esControlBuscarTomador(c({ tooltip: 'Buscar', icono: 'search' })), true)
  assert.equal(esControlBuscarTomador(c({ icono: 'fa fa-search' })), true, 'solo icono de lupa')
  assert.equal(esControlBuscarTomador(c({ textoSinIcono: 'Buscar y contratar', icono: 'search' })), false, 'texto que no es ENTERO de la lista')
  assert.equal(esControlBuscarTomador(c({ textoSinIcono: 'Emitir', icono: 'search' })), false)
  assert.equal(esControlBuscarTomador(c({ ariaLabel: 'Buscar', tooltip: 'Limpiar' })), false, 'todas las etiquetas tienen que ser de búsqueda')
  assert.equal(esControlBuscarTomador(c({ icono: 'close' })), false)
  assert.equal(esControlBuscarTomador(c({})), false, 'sin nada, no')
  assert.equal(esIconoBusqueda('researcher'), false, 'por token entero, no por subcadena')
})

const desc = (o: Partial<DescripcionElemento>): DescripcionElemento => ({
  coincidencias: 1, visible: true, tag: 'button', type: null, role: null, texto: null, valorBoton: null, title: null, ariaLabel: null,
  id: null, name: null, href: null, onclick: null, onchange: null, formaction: null, etiquetaFila: null, deshabilitado: false, editableContenido: false, ...o,
})

test('validarAccion(buscar_tomador): la lupa con aria-label «Buscar» se acepta; «Buscar y contratar»/«Emitir» con lupa, no', () => {
  assert.deepEqual(validarAccion(desc({ ariaLabel: 'Buscar', texto: '', textoSinIcono: '', icono: 'fa fa-search' }), 'buscar_tomador'), { ok: true })
  assert.deepEqual(validarAccion(desc({ texto: 'search', textoSinIcono: '', icono: 'search' }), 'buscar_tomador'), { ok: true }, 'mat-icon «search» sin más')
  assert.equal(validarAccion(desc({ texto: 'search Buscar y contratar', textoSinIcono: 'Buscar y contratar', icono: 'search' }), 'buscar_tomador').ok, false)
  assert.equal(validarAccion(desc({ texto: 'search Emitir', textoSinIcono: 'Emitir', icono: 'search' }), 'buscar_tomador').ok, false)
  assert.equal(validarAccion(desc({ ariaLabel: 'Buscar', textoSinIcono: '', tooltip: 'Contratar', icono: 'search' }), 'buscar_tomador').ok, false, 'mattooltip de contratar')
  assert.equal(validarAccion(desc({ ariaLabel: 'Buscar', textoSinIcono: '', icono: 'search', onclick: 'emitirPoliza()' }), 'buscar_tomador').ok, false)
  assert.equal(validarAccion(desc({ tag: 'input', type: 'text', ariaLabel: 'Buscar' }), 'buscar_tomador').ok, false, 'un campo no es una acción')
  assert.deepEqual(validarAccion(desc({ texto: '', textoSinIcono: '', icono: 'fa fa-search' }), 'buscar_tomador'), { ok: true }, 'solo icono, sin etiquetas')
  assert.equal(validarAccion(desc({ texto: 'search Limpiar', textoSinIcono: 'Limpiar', ariaLabel: 'Buscar', icono: 'search' }), 'buscar_tomador').ok, false, 'manda el texto visible, no el aria-label')
})

test('candidatos: un botón de SOLO icono sale con su nombre accesible o «search» (puede ir a la IA y al atasco)', () => {
  const p = { clave: 'buscar_tomador', tipo: 'accion' as const, textoEsperado: null }
  const a = proyectarCandidato({ tag: 'button', texto: '', accesible: 'Buscar', icono: 'fa fa-search', selector: '#l' }, 'accion')!
  assert.equal(a.texto, 'Buscar')
  assert.equal(candidatoElegibleAtasco(a, p), true)
  const b = proyectarCandidato({ tag: 'button', texto: '', accesible: null, icono: 'fa fa-search', selector: '#l2' }, 'accion')!
  assert.equal(b.texto, 'search')
  assert.equal(candidatoElegibleAtasco(b, p), true)
  const c = proyectarCandidato({ tag: 'button', texto: 'search Buscar y contratar', selector: '#mal' }, 'accion')!
  assert.equal(candidatoElegibleAtasco(c, p), false)
})

// ───────────── la puerta del guard (DOM real) ─────────────

test('puerta: la lupa con aria-label «Buscar» en «Datos básicos» se pulsa UNA vez; la segunda, bloqueada', async () => {
  const { page, guard } = await preparar(PANTALLA(LUPA_BUSCAR))
  await pulsarBuscarTomadorMapfre(page, guard, page.locator('#lupa'))
  assert.equal(await busquedas(page), 1)
  await assert.rejects(() => pulsarBuscarTomadorMapfre(page, guard, page.locator('#lupa')), EmisionBloqueadaError)
  assert.equal(await busquedas(page), 1)
  await page.context().close()
})

test('puerta: «Buscar y contratar» / «Emitir» / mattooltip «Contratar» con icono de lupa se RECHAZAN sin pulsar', async () => {
  for (const malo of [
    `<button id="lupa" onclick="${CARGAR}"><mat-icon>search</mat-icon> Buscar y contratar</button>`,
    `<button id="lupa" onclick="${CARGAR}"><mat-icon>search</mat-icon>Emitir</button>`,
    `<button id="lupa" mattooltip="Contratar" onclick="${CARGAR}"><mat-icon>search</mat-icon></button>`,
    `<button id="lupa" onclick="${CARGAR}"><mat-icon>search</mat-icon>Limpiar</button>`,
    `<button id="lupa" aria-label="Buscar" onclick="emitirPoliza();${CARGAR}"><i class="fa fa-search"></i></button>`,
    `<div ng-click="contratar()"><button id="lupa" aria-label="Buscar" onclick="${CARGAR}"><i class="fa fa-search"></i></button></div>`,
  ]) {
    const { page, guard } = await preparar(PANTALLA(malo))
    await assert.rejects(() => pulsarBuscarTomadorMapfre(page, guard, page.locator('#lupa')), EmisionBloqueadaError, malo)
    assert.equal(await busquedas(page), 0, malo)
    await page.context().close()
  }
})

test('puerta: un mat-icon «search» DENTRO de un contenedor pulsable que no es de búsqueda (Emitir) no se pulsa; se juzga el contenedor', async () => {
  for (const malo of [
    `<button aria-label="Emitir" onclick="${CARGAR}"><mat-icon id="lupa">search</mat-icon></button>`,
    `<div ng-click="emitir()" aria-label="Emitir" onclick="${CARGAR}"><mat-icon id="lupa">search</mat-icon></div>`,
  ]) {
    const { page, guard } = await preparar(PANTALLA(malo))
    await assert.rejects(() => pulsarBuscarTomadorMapfre(page, guard, page.locator('#lupa')), EmisionBloqueadaError, malo)
    assert.equal(await busquedas(page), 0, malo)
    await page.context().close()
  }
  const bueno = await preparar(PANTALLA(`<button aria-label="Buscar" onclick="${CARGAR}"><mat-icon id="lupa">search</mat-icon></button>`))
  await pulsarBuscarTomadorMapfre(bueno.page, bueno.guard, bueno.page.locator('#lupa'))
  assert.equal(await busquedas(bueno.page), 1, 'el icono dentro del botón «Buscar» sí')
  await bueno.page.context().close()
})

test('puerta: fuera de «Datos básicos», con otro paso activo o tras el «Continuar» del paso 1 → bloqueada', async () => {
  const fuera = await preparar(PANTALLA('', { extra: `<app-conductor-habitual>${LUPA_BUSCAR}</app-conductor-habitual>` }))
  await assert.rejects(() => pulsarBuscarTomadorMapfre(fuera.page, fuera.guard, fuera.page.locator('#lupa')), EmisionBloqueadaError)
  assert.equal(await busquedas(fuera.page), 0)
  await fuera.page.context().close()
  const orden = await preparar(PANTALLA(LUPA_BUSCAR))
  await pulsarContinuarMapfre(orden.page, orden.guard, 'datosBasicos')
  // El stepper vuelve a «Datos básicos» (p. ej. el portal rebota): aun así la lupa ya no vale (orden del trabajo).
  await orden.page.evaluate(() => { const h = Array.from(document.querySelectorAll('mat-step-header')); h[1]!.setAttribute('aria-selected', 'false'); h[0]!.setAttribute('aria-selected', 'true') })
  await assert.rejects(() => pulsarBuscarTomadorMapfre(orden.page, orden.guard, orden.page.locator('#lupa')), EmisionBloqueadaError)
  assert.equal(await busquedas(orden.page), 0)
  await orden.page.context().close()
})

// ───────────── el flujo del paso 1: hueco → formador → sigue / atasco ─────────────

type Llamada = { ruta: string; cuerpo: Record<string, unknown> | null }

/** Formador ACTIVO con un asegura de mentira: `sugerir` elige con `elegir` (índice de la estructura o null). */
async function formador(elegir: (estructura: { texto: string | null }[]) => number | null, llamadas: Llamada[]): Promise<ContextoFormador> {
  return prepararFormador({
    trabajoId: '00000000-0000-4000-8000-000000000000', compania: 'mapfre', ramo: 'auto', apiUrl: 'https://asegura.test', secreto: 'x'.repeat(20),
    redactar: (t) => t.replaceAll(NIF, '[NIF]'), log: () => undefined,
    fetchImpl: (async (url: string, init?: { body?: string }) => {
      const ruta = String(url).split('/formador/')[1]!.split('?')[0]!
      const cuerpo = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null
      llamadas.push({ ruta, cuerpo })
      if (ruta === 'conocimiento') return new Response(JSON.stringify({ formadorActivo: true, conocimiento: [], acompanamiento: { activo: false } }))
      if (ruta === 'sugerir') return new Response(JSON.stringify({ indice: elegir(cuerpo!.estructura as { texto: string | null }[]) }))
      return new Response('{}')
    }) as unknown as typeof fetch,
  })
}

/** Contexto como el del runner: la lupa y «Continuar» por sus puertas del guard. */
const ctxDe = (page: Page, guard: GuardEmision, f: ContextoFormador, orden: string[]) => ({
  formador: f,
  buscarTomadorMapfre: async (p: Page, b: Locator) => { orden.push('lupa'); await pulsarBuscarTomadorMapfre(p, guard, b) },
  continuarMapfre: async (p: Page, paso: PasoContinuarMapfre) => { orden.push('continuar'); await pulsarContinuarMapfre(p, guard, paso, undefined) },
})

test('hueco → la IA localiza la lupa (fuera del campo, sin selector fijo) → se pulsa por el guard, sigue y se APRENDE tras validar', async () => {
  const { page, guard } = await preparar(PANTALLA(LUPA_BUSCAR, { dentroDelCampo: false }))
  const llamadas: Llamada[] = []
  const f = await formador((e) => e.findIndex((c) => c.texto === 'Buscar'), llamadas)
  const orden: string[] = []
  await pasoDatosBasicos(page, form, ctxDe(page, guard, f, orden))
  assert.equal(await busquedas(page), 1, 'la lupa se pulsó una vez')
  assert.equal(await page.locator('input[name="codigoDocumento"]').inputValue(), NIF)
  assert.deepEqual(orden, ['lupa', 'continuar'])
  const rutas = llamadas.map((l) => l.ruta)
  assert.ok(rutas.includes('sugerir'), 'se preguntó a la IA')
  const conf = llamadas.filter((l) => l.ruta === 'confirmar')
  assert.deepEqual(conf.map((l) => l.cuerpo!.clave), ['buscar_tomador'], 'aprendido SOLO tras llegar al paso 2')
  assert.equal(f.atasco ?? null, null)
  assert.ok(!JSON.stringify(llamadas).includes(NIF), 'el NIF no viaja a asegura/IA')
  await page.context().close()
})

test('hueco → la IA NO localiza la lupa → ATASCO con candidatos (no error definitivo) y el NIF sin teclear', async () => {
  const { page, guard } = await preparar(PANTALLA(LUPA_BUSCAR, { dentroDelCampo: false }))
  const llamadas: Llamada[] = []
  const f = await formador(() => null, llamadas)
  const orden: string[] = []
  let err: unknown
  await pasoDatosBasicos(page, form, ctxDe(page, guard, f, orden)).catch((e) => { err = e })
  assert.ok(err instanceof ErrorMapaIncompleto && pideInventarioDom(err) && /lupa/.test(err.message) && !err.message.includes(NIF))
  assert.equal(f.atasco?.clave, 'buscar_tomador')
  assert.ok(f.atasco!.candidatos.some((c) => c.texto === 'Buscar' && c.selector.length > 0), 'la lupa está entre los candidatos numerados')
  assert.ok(!f.atasco!.candidatos.some((c) => /continuar/i.test(c.texto ?? '')), 'solo candidatos de su fila de la tabla')
  // Lo que hace el runner con esto: portal NO transitorio + checkpoint → `error.atasco` (asegura lo deja `atascado` + Telegram).
  const c = clasificarIntento(err, { logueado: true, loginVisible: false, ultimo5xx: null })
  assert.equal(c.tipo, 'portal')
  assert.equal(c.transitorio, null)
  assert.deepEqual(orden, [], 'ni lupa ni «Continuar»')
  assert.equal(await page.locator('input[name="codigoDocumento"]').inputValue(), '', 'el NIF no queda en la pantalla')
  assert.ok(!JSON.stringify(f.atasco).includes(NIF))
  await page.context().close()
})

test('lupa FIJA (sufijo del campo, solo icono): sigue sin IA; «no existe ningún registro» → datos; diálogo → hueco sin elegir', async () => {
  const llamadas: Llamada[] = []
  const ok = await preparar(PANTALLA(`<button id="lupa" onclick="${CARGAR}"><mat-icon>search</mat-icon></button>`))
  const f = await formador(() => null, llamadas)
  await pasoDatosBasicos(ok.page, form, ctxDe(ok.page, ok.guard, f, []))
  assert.equal(await busquedas(ok.page), 1)
  assert.ok(!llamadas.some((l) => l.ruta === 'sugerir'), 'el fijo no gasta IA')
  await ok.page.context().close()

  const sin = await preparar(PANTALLA(`<button id="lupa" aria-label="Buscar" onclick="document.getElementById('res').textContent='NO EXISTE NINGÚN REGISTRO PARA ESA CONDICIÓN DE BÚSQUEDA'"><i class="fa fa-search"></i></button>`))
  await assert.rejects(() => pasoDatosBasicos(sin.page, form, ctxDe(sin.page, sin.guard, f, [])), (e) => e instanceof ErrorTarificador && e.tipo === 'datos')
  await sin.page.context().close()

  const dlg = await preparar(PANTALLA(`<button id="lupa" aria-label="Buscar" onclick="document.body.insertAdjacentHTML('beforeend','<mat-dialog-container><button id=elegir onclick=window.__elegido=1>PERSONA 1</button></mat-dialog-container>')"><i class="fa fa-search"></i></button>`))
  const orden: string[] = []
  await assert.rejects(() => pasoDatosBasicos(dlg.page, form, ctxDe(dlg.page, dlg.guard, f, orden)), (e) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e) && /diálogo/.test(e.message))
  assert.equal(await dlg.page.evaluate(() => (window as unknown as { __elegido?: number }).__elegido ?? 0), 0, 'nada del diálogo se pulsa')
  assert.deepEqual(orden, ['lupa'], 'sin «Continuar»')
  await dlg.page.context().close()
})

test('lo de la IA NO se aprende si el paso posterior no valida (la lupa no cambia nada → atasco, sin confirmar)', async () => {
  const { page, guard } = await preparar(PANTALLA(`<button id="lupa" aria-label="Buscar" onclick="window.__busquedas=1"><i class="fa fa-search"></i></button>`, { dentroDelCampo: false }))
  const llamadas: Llamada[] = []
  const f = await formador((e) => e.findIndex((c) => c.texto === 'Buscar'), llamadas)
  await assert.rejects(() => pasoDatosBasicos(page, form, ctxDe(page, guard, f, [])).then(() => undefined), (e) => e instanceof ErrorMapaIncompleto && /resultado de la búsqueda/.test(e.message))
  assert.equal(await busquedas(page), 1)
  assert.ok(!llamadas.some((l) => l.ruta === 'confirmar'), 'nada aprendido')
  assert.equal(f.atasco?.clave, 'buscar_tomador', 'atasco para que elija Alberto')
  await page.context().close()
})

test('lo resuelto por la IA NO se aprende si el «Continuar» del paso 1 no llega a «Objeto asegurado»', async () => {
  const { page, guard } = await preparar(PANTALLA(LUPA_BUSCAR, { dentroDelCampo: false }))
  const llamadas: Llamada[] = []
  const f = await formador((e) => e.findIndex((c) => c.texto === 'Buscar'), llamadas)
  const ctx = { ...ctxDe(page, guard, f, []), continuarMapfre: async () => { throw new ErrorMapaIncompleto('la llegada a «Objeto asegurado»', true) } }
  await assert.rejects(() => pasoDatosBasicos(page, form, ctx), ErrorMapaIncompleto)
  assert.equal(await busquedas(page), 1)
  assert.ok(!llamadas.some((l) => l.ruta === 'confirmar'), 'nada aprendido sin validar el paso posterior')
  await page.context().close()
})
