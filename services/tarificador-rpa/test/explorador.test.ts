// Cepos del EXPLORADOR IA en el worker (fase B, 13/10/2026). Portal SINTÉTICO servido por un servidor HTTP local
// (127.0.0.1; el resto de la red sale por un proxy muerto) y asegura FALSO (se inyecta `pedirPaso`). Sin datos personales:
// todo lo que se escribe sale del catálogo sintético del módulo. Nada de esto toca un portal real.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { EmisionBloqueadaError, type InventarioDom } from '@central/module-tarificacion'
import { ErrorTarificador, ErrorVerificacionHumana } from '../src/errores.ts'
import { instalarGuardEmision, pulsar, pulsarExploracionAutorizada, pulsarGuardadoPresupuesto, MAX_GUARDADOS_PRESUPUESTO, type GuardEmision } from '../src/guard.ts'
import { capturarInventarioDom, capturarInventarioExploracion } from '../src/inventario-dom.ts'
import {
  bucleExploracion,
  cierreCorrecto,
  cuerpoTrasCierre,
  coincideConInventario,
  cortarLoteTrasRellenar,
  EXPLORADOR_VERSION,
  finDeError,
  motivoSinDato,
  accionSinDato,
  problemaTrabajoExploracion,
  presupuestoParaCierre,
  resultadoDeFin,
  valorAplicado,
  valorParaControl,
  type ContextoBucle,
} from '../src/explorador.ts'
import type { RespuestaPaso } from '../src/api.ts'

// ─── Portal sintético ────────────────────────────────────────────────────────

const PAGINA = (cuerpo: string) => `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body>${cuerpo}</body></html>`

const RIESGO = PAGINA(`
  <h2>Datos del riesgo</h2>
  <form id="f1" method="post" action="/paso2">
    <label for="superficie">Superficie construida</label><input id="superficie" name="superficie" type="text">
    <label for="uso">Uso</label><select id="uso" name="uso"><option value="">--</option><option value="H">Habitual</option><option value="S">Secundaria</option></select>
    <input type="radio" id="tipoPiso" name="tipo" value="piso"><label for="tipoPiso">Piso</label>
    <input type="radio" id="tipoCasa" name="tipo" value="casa"><label for="tipoCasa">Casa</label>
    <button id="siguiente" type="submit">Siguiente</button>
    <button id="emitir" type="button">Emitir</button>
  </form>`)

const DATOS_BASICOS = (titulo: string) => PAGINA(`
  <h1>${titulo}</h1>
  <form id="f2" method="post" action="/tarificar">
    <label for="anio">Año de construcción</label><input id="anio" name="anio" type="text">
    <button id="avanceDB" type="submit">Aceptar</button>
  </form>`)

/** Datos básicos con el «Aceptar» del SERVLET de Allianz (Comunidades): un div con id y onclick, no un button. */
const DATOS_BASICOS_DIV = (titulo: string) => PAGINA(`
  <h1>${titulo}</h1>
  <script>function btnAceptar() { document.getElementById('f3').submit() }</script>
  <form id="f3" method="post" action="/tarificar">
    <label for="anio">Año de construcción</label><input id="anio" name="anio" type="text">
    <div id="aceptar" onclick="btnAceptar();" style="display:inline-block;padding:4px">Aceptar</div>
    <div id="otroDiv" onclick="btnAceptar();" style="display:inline-block;padding:4px">Siguiente</div>
    <div id="aceptarSinOnclick" style="display:inline-block;padding:4px">Aceptar</div>
  </form>`)

const RESULTADO = PAGINA(`<h1>Resultado</h1><table><tr><td>Prima total</td><td>347,55 €</td></tr></table>`)

/** El portal REPINTA un control al escribir en otro (como Allianz tras el CP): el nodo de «anio» se sustituye por un clon. */
const REPINTA_NODO = PAGINA(`
  <h2>Datos del tomador y vivienda</h2>
  <form id="f1" method="post" action="/tarificar">
    <label for="superficie">Superficie construida</label><input id="superficie" name="superficie" type="text">
    <label for="anio">Año de construcción</label><input id="anio" name="anio" type="text">
    <button id="siguiente" type="submit">Siguiente</button>
  </form>
  <script>document.getElementById('superficie').addEventListener('input', () => { const a = document.getElementById('anio'); a.replaceWith(a.cloneNode(true)) })</script>`)

/** Al escribir en «superficie» aparece un control NUEVO (la estructura cambia; los nodos viejos siguen vivos). */
const CRECE = PAGINA(`
  <h2>Datos del tomador y vivienda</h2>
  <form id="f1" method="post" action="/tarificar">
    <label for="superficie">Superficie construida</label><input id="superficie" name="superficie" type="text">
    <label for="anio">Año de construcción</label><input id="anio" name="anio" type="text">
    <span id="hueco"></span>
    <button id="siguiente" type="submit">Siguiente</button>
  </form>
  <script>document.getElementById('superficie').addEventListener('input', () => { document.getElementById('hueco').innerHTML = '<label for="extra">Plantas del edificio</label><input id="extra" name="extra" type="text">' })</script>`)

/** El CP autocompleta la población al perder el foco (`change`), como el portal real. */
const CP_AUTOCOMPLETA = PAGINA(`
  <h2>Datos del tomador y vivienda</h2>
  <form id="f1" method="post" action="/tarificar">
    <label for="cp">Código postal</label><input id="cp" name="cp" type="text">
    <span id="pob"></span>
    <label for="superficie">Superficie construida</label><input id="superficie" name="superficie" type="text">
    <button id="siguiente" type="submit">Siguiente</button>
  </form>
  <script>document.getElementById('cp').addEventListener('change', () => { document.getElementById('pob').innerHTML = '<label for="poblacion">Población</label><select id="poblacion" name="poblacion"><option value="">--</option><option value="P1">Pueblo</option></select>' })</script>`)

/** Datepicker «Angular»: lo que llega de golpe (`fill`, sin teclas) se BORRA al perder el foco; tecleado, se queda. */
const DATEPICKER = PAGINA(`
  <h2>Datos de la póliza</h2>
  <form id="f1" method="post" action="/tarificar">
    <label for="efecto">Fecha de efecto</label><input id="efecto" name="efecto" type="text">
    <button id="siguiente" type="submit">Siguiente</button>
  </form>
  <script>
    const f = document.getElementById('efecto'); let teclas = 0
    f.addEventListener('keydown', () => { teclas++ })
    f.addEventListener('focus', () => { teclas = 0 })
    f.addEventListener('blur', () => { if (teclas === 0) f.value = '' })
  </script>`)

/** Varios campos en la MISMA pantalla, con estado inválido (aria-invalid, ng-invalid, contenedor NDBX con error). */
const VARIOS_CAMPOS = PAGINA(`
  <h2>Datos del tomador y vivienda</h2>
  <form id="f1" method="post" action="/tarificar">
    <label for="superficie">Superficie construida</label><input id="superficie" name="superficie" type="text" aria-invalid="true">
    <label for="anio">Año de construcción</label><input id="anio" name="anio" type="text" class="ng-untouched ng-invalid">
    <nx-formfield class="nx-formfield has-error"><label for="planta">Planta</label><input id="planta" name="planta" type="text"></nx-formfield>
    <label for="capital">Capital</label><input id="capital" name="capital" type="text" class="ng-valid">
    <button id="siguiente" type="submit">Siguiente</button>
  </form>`)

/** Allianz Hogar (14/10/2026): año como `<input type=number>` y superficie como input SIN type. */
const NUMERICO = PAGINA(`
  <h2>Datos del tomador y vivienda</h2>
  <form id="f1" method="post" action="/tarificar">
    <label id="lanio" for="anio">Año de construcción</label><input id="anio" name="anio" type="number">
    <label for="superficie">Superficie de la vivienda</label><input id="superficie" name="superficie">
    <button id="siguiente" type="submit">Siguiente</button>
  </form>`)

/** Un control que el portal VACÍA siempre al perder el foco (ni `fill` ni tecleado se quedan). */
const NO_SE_QUEDA = PAGINA(`
  <h2>Datos del tomador y vivienda</h2>
  <form id="f1" method="post" action="/tarificar">
    <label for="superficie">Superficie de la vivienda</label><input id="superficie" name="superficie">
    <button id="siguiente" type="submit">Siguiente</button>
  </form>
  <script>const s = document.getElementById('superficie'); s.addEventListener('blur', () => { s.value = '' })</script>`)

const OTP = PAGINA(`<h1>Verificación</h1><label for="c">Código</label><input id="c" autocomplete="one-time-code">`)

type Peticion = { metodo: string; ruta: string; cuerpo: string }
let servidor: Server
let base = ''
let peticiones: Peticion[] = []
/** Qué pantalla sirve `/` y a qué lleva `/paso2` (cada test lo fija). */
let inicio = RIESGO
let trasPaso2 = DATOS_BASICOS('Datos básicos')
/** Rutas extra por test (guardado del presupuesto): cuerpo y cabeceras. */
let rutasExtra: Record<string, { tipo: string; cuerpo: string | Buffer; cabeceras?: Record<string, string> }> = {}

let browser: Browser
before(async () => {
  servidor = createServer((req, res) => {
    let cuerpo = ''
    req.on('data', (c) => { cuerpo += c })
    req.on('end', () => {
      const ruta = (req.url ?? '/').split('?')[0]
      peticiones.push({ metodo: req.method ?? 'GET', ruta, cuerpo })
      const extra = rutasExtra[ruta]
      if (extra) {
        res.writeHead(200, { 'Content-Type': extra.tipo, ...(extra.cabeceras ?? {}) })
        res.end(extra.cuerpo)
        return
      }
      const html = ruta === '/' ? inicio : ruta === '/paso2' ? trasPaso2 : ruta === '/tarificar' ? RESULTADO : PAGINA('<h1>404</h1>')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
    })
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

async function nuevaPagina(): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  peticiones = []
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(5_000)
  await page.goto(`${base}/`)
  return { context, page, guard }
}

/** La ref del elemento con ese id en el inventario que manda el worker. */
function ref(inv: InventarioDom, id: string): string {
  for (const m of inv.marcos) for (const e of m.elementos) if (e.id === id && e.ref) return e.ref
  throw new Error(`sin ref para #${id}`)
}
const respuesta = (acciones: unknown[], tipo = 'formulario') => ({ version: 1, pantalla: { nombre: 'P', tipo }, acciones, mapeo: [], motivo: null })

type Guion = (inv: InventarioDom, n: number, page: Page) => unknown | Promise<unknown>

function contexto(page: Page, guard: GuardEmision, guion: Guion, extra: Partial<ContextoBucle> = {}) {
  const enviados: { inventario: InventarioDom; avancesFallidos: number; incidencias?: unknown }[] = []
  const lineas: string[] = []
  const k: ContextoBucle = {
    trabajoId: '00000000-0000-4000-8000-000000000001', compania: 'allianz', ramo: 'hogar', entrada: 'allianz:particulares:hogar',
    conDatosReales: false, riesgo: {}, env: {}, guard,
    pulsar: (b) => pulsar(b, guard),
    pulsarAutorizado: (b, el, marco) => pulsarExploracionAutorizada(page, guard, b, { entrada: 'allianz:particulares:hogar', el, marco }),
    pulsarGuardado: (b, el, pantalla, trasClic) => pulsarGuardadoPresupuesto(page, guard, b, { el, pantalla }, trasClic),
    topePdfMs: 3_000,
    pausaAccion: async () => undefined,
    pedirPaso: async (c): Promise<RespuestaPaso> => {
      enviados.push({ inventario: c.inventario, avancesFallidos: c.avancesFallidos, ...(c.incidencias ? { incidencias: c.incidencias } : {}) })
      return { estado: 'ok', respuesta: await guion(c.inventario, enviados.length, page), leaseHasta: null }
    },
    log: (m, d) => { lineas.push(JSON.stringify({ m, ...(d ?? {}) })) },
    ...extra,
  }
  return { k, enviados, lineas }
}

/** Guion feliz: riesgo (rellenar/elegir/marcar + Siguiente) → Datos básicos (rellenar + avance autorizado) → precio. */
const guionFeliz: Guion = (inv, n) => {
  if (n === 1) return respuesta([
    { accion: 'rellenar', ref: ref(inv, 'superficie'), dato: 'inmueble.superficie_m2' },
    { accion: 'elegir', ref: ref(inv, 'uso'), opcion: { valor: 'H' } },
    { accion: 'marcar', ref: ref(inv, 'tipoPiso') },
    { accion: 'avanzar', ref: ref(inv, 'siguiente'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' },
  ])
  if (n === 2) return respuesta([
    { accion: 'rellenar', ref: ref(inv, 'anio'), dato: 'inmueble.anio_construccion' },
    { accion: 'avanzar', ref: ref(inv, 'avanceDB'), efectoEsperado: 'calcular', confianza: 'alta' },
  ])
  const imp = inv.marcos.flatMap((m) => m.importes ?? [])
  return respuesta([{ accion: 'terminar', refsPrecio: [imp[0].ref] }], 'resultado')
}

// ─── El bucle contra el portal sintético ─────────────────────────────────────

test('exploración feliz: rellena con valores del catálogo, avanza por el guard, el avance autorizado de Datos básicos llega al precio', async () => {
  inicio = RIESGO
  trasPaso2 = DATOS_BASICOS('Datos básicos')
  const { context, page, guard } = await nuevaPagina()
  try {
    const { k, enviados, lineas } = contexto(page, guard, guionFeliz)
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'resultado', JSON.stringify(fin))
    assert.equal(fin.pasos, 3)
    assert.deepEqual(fin.efectos, ['posible_proyecto_guardado'])
    assert.deepEqual(fin.redNoGet.sort(), [`${base}/paso2`, `${base}/tarificar`].sort())
    const p2 = peticiones.find((p) => p.ruta === '/paso2')!
    assert.match(p2.cuerpo, /superficie=90/)
    assert.match(p2.cuerpo, /uso=H/)
    assert.match(p2.cuerpo, /tipo=piso/)
    assert.match(peticiones.find((p) => p.ruta === '/tarificar')!.cuerpo, /anio=1990/)
    // Lo que sale hacia asegura: estructura, refs y `conValor`; nunca el valor escrito. Y el log tampoco lo lleva.
    const cable = JSON.stringify(enviados)
    assert.ok(!/"value"|1990|"90"/.test(cable), 'el inventario no lleva valores')
    assert.ok(!/=90\b|1990/.test(lineas.join('\n')), 'el log no lleva valores')
    assert.ok(enviados[2].inventario.marcos[0].importes?.some((i) => i.eur === 347.55))
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

test('«Aceptar» sin título de Datos básicos: se rechaza ANTES de tocar el portal (ni POST ni clic)', async () => {
  inicio = RIESGO
  trasPaso2 = DATOS_BASICOS('Revisión del riesgo')
  const { context, page, guard } = await nuevaPagina()
  try {
    // «Revisión» en el título ya es parada determinista; con otro título, el validador lo rechaza (aceptar_no_autorizado).
    trasPaso2 = DATOS_BASICOS('Coberturas')
    await page.goto(`${base}/paso2`)
    peticiones = []
    const { k } = contexto(page, guard, (inv) => respuesta([{ accion: 'avanzar', ref: ref(inv, 'avanceDB'), efectoEsperado: 'calcular', confianza: 'alta' }]))
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'ambiguo')
    assert.ok(!peticiones.some((p) => p.ruta === '/tarificar'), 'no salió el POST del avance')
  } finally {
    await context.close()
  }
})

test('la IA pide pulsar «Emitir»: el worker lo rechaza al revalidar y no pulsa', async () => {
  inicio = RIESGO
  const { context, page, guard } = await nuevaPagina()
  try {
    let pulsado = false
    await page.exposeFunction('marcarEmitido', () => { pulsado = true })
    await page.evaluate(() => document.getElementById('emitir')!.addEventListener('click', () => (window as unknown as { marcarEmitido: () => void }).marcarEmitido()))
    const { k } = contexto(page, guard, (inv) => respuesta([{ accion: 'avanzar', ref: ref(inv, 'emitir'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }]))
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'ambiguo')
    assert.equal(fin.detalle, 'lote_no_valido')
    assert.equal(pulsado, false)
  } finally {
    await context.close()
  }
})

test('pantalla de código (SMS/OTP): para SIN preguntar a asegura y sin escribir nada', async () => {
  inicio = OTP
  const { context, page, guard } = await nuevaPagina()
  try {
    const { k, enviados } = contexto(page, guard, () => { throw new Error('no se debía preguntar') })
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'otp')
    assert.equal(enviados.length, 0)
    const cuerpo = resultadoDeFin(k.trabajoId, 'allianz', fin, (t) => t)!
    assert.equal(cuerpo.resultado, 'error')
    assert.ok(cuerpo.resultado === 'error' && cuerpo.error.tipo === 'captcha' && /requiere_verificacion_humana/.test(cuerpo.error.mensaje))
  } finally {
    await context.close()
  }
})

test('anti-TOCTOU: si el control cambia entre el inventario y la acción, no se toca (ambiguo)', async () => {
  inicio = RIESGO
  const { context, page, guard } = await nuevaPagina()
  try {
    const { k } = contexto(page, guard, async (inv, _n, p) => {
      // El portal re-pinta el botón con otro texto antes de que llegue la respuesta.
      await p.evaluate(() => { document.getElementById('siguiente')!.textContent = 'Contratar' })
      return respuesta([{ accion: 'avanzar', ref: ref(inv, 'siguiente'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }])
    })
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'ambiguo')
    assert.equal(fin.detalle, 'nodo_no_localizado', 'primera acción del lote: anti-TOCTOU, no repintado')
    assert.ok(!peticiones.some((x) => x.ruta === '/paso2'), 'no se envió el formulario')
  } finally {
    await context.close()
  }
})

// ─── Repintado de la pantalla a mitad de lote (14/10/2026: Allianz Hogar paró «ambiguo» en el paso 1) ──────────

const tiene = (inv: InventarioDom, id: string) => inv.marcos.some((m) => m.elementos.some((e) => e.id === id))

test('el nodo DESAPARECE tras el primer rellenar (repintado): corta el lote y reinventaría, no para «ambiguo»', async () => {
  inicio = REPINTA_NODO
  const { context, page, guard } = await nuevaPagina()
  try {
    let lotes = 0
    const { k, enviados, lineas } = contexto(page, guard, (inv) => {
      if (!tiene(inv, 'superficie')) return respuesta([{ accion: 'terminar', refsPrecio: [inv.marcos.flatMap((m) => m.importes ?? [])[0].ref] }], 'resultado')
      lotes++
      return lotes === 1
        ? respuesta([
          { accion: 'rellenar', ref: ref(inv, 'superficie'), dato: 'inmueble.superficie_m2' },
          { accion: 'rellenar', ref: ref(inv, 'anio'), dato: 'inmueble.anio_construccion' },
          { accion: 'avanzar', ref: ref(inv, 'siguiente'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' },
        ])
        : respuesta([
          { accion: 'rellenar', ref: ref(inv, 'anio'), dato: 'inmueble.anio_construccion' },
          { accion: 'avanzar', ref: ref(inv, 'siguiente'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' },
        ])
    })
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'resultado', JSON.stringify(fin))
    assert.equal(enviados.length, 3, 'la pantalla repintada se volvió a inventariar y a preguntar')
    assert.equal(fin.acciones, 3, 'la acción que no se pudo hacer no cuenta (superficie + anio + avanzar)')
    const post = peticiones.find((p) => p.ruta === '/tarificar')!
    assert.match(post.cuerpo, /superficie=90/)
    assert.match(post.cuerpo, /anio=1990/)
    assert.ok(lineas.some((l) => /exploracion_lote_cortado/.test(l) && /nodo_no_localizado/.test(l)))
  } finally {
    await context.close()
  }
})

test('rellenar que cambia la ESTRUCTURA (aparece un control): corta el lote aunque el resto siga vivo', async () => {
  inicio = CRECE
  const { context, page, guard } = await nuevaPagina()
  try {
    const { k, enviados } = contexto(page, guard, (inv, n) => {
      if (!tiene(inv, 'superficie')) return respuesta([{ accion: 'terminar', refsPrecio: [inv.marcos.flatMap((m) => m.importes ?? [])[0].ref] }], 'resultado')
      return n === 1
        ? respuesta([
          { accion: 'rellenar', ref: ref(inv, 'superficie'), dato: 'inmueble.superficie_m2' },
          { accion: 'rellenar', ref: ref(inv, 'anio'), dato: 'inmueble.anio_construccion' },
          { accion: 'avanzar', ref: ref(inv, 'siguiente'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' },
        ])
        : respuesta([
          { accion: 'rellenar', ref: ref(inv, 'anio'), dato: 'inmueble.anio_construccion' },
          { accion: 'avanzar', ref: ref(inv, 'siguiente'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' },
        ])
    })
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'resultado', JSON.stringify(fin))
    assert.ok(tiene(enviados[1].inventario, 'extra'), 'el 2.º paso ve el control nuevo')
    assert.equal(fin.acciones, 3, 'tras el corte, «anio» no se rellenó en el lote 1')
  } finally {
    await context.close()
  }
})

test('rellenar el CÓDIGO POSTAL: quita el foco, deja autocompletar y reinventaría antes de seguir con el lote', async () => {
  inicio = CP_AUTOCOMPLETA
  const { context, page, guard } = await nuevaPagina()
  try {
    const { k, enviados } = contexto(page, guard, (inv, n) => {
      if (!tiene(inv, 'cp')) return respuesta([{ accion: 'terminar', refsPrecio: [inv.marcos.flatMap((m) => m.importes ?? [])[0].ref] }], 'resultado')
      return n === 1
        ? respuesta([
          { accion: 'rellenar', ref: ref(inv, 'cp'), dato: 'inmueble.codigo_postal' },
          { accion: 'rellenar', ref: ref(inv, 'superficie'), dato: 'inmueble.superficie_m2' },
          { accion: 'avanzar', ref: ref(inv, 'siguiente'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' },
        ])
        : respuesta([
          { accion: 'elegir', ref: ref(inv, 'poblacion'), opcion: { valor: 'P1' } },
          { accion: 'rellenar', ref: ref(inv, 'superficie'), dato: 'inmueble.superficie_m2' },
          { accion: 'avanzar', ref: ref(inv, 'siguiente'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' },
        ])
    }, { esperaRepintadoMs: 50 })
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'resultado', JSON.stringify(fin))
    assert.ok(tiene(enviados[1].inventario, 'poblacion'), 'el 2.º paso ve la población autocompletada')
    assert.match(peticiones.find((p) => p.ruta === '/tarificar')!.cuerpo, /cp=41001.*poblacion=P1.*superficie=90/)
  } finally {
    await context.close()
  }
})

test('🪤 datepicker que vacía lo escrito con `fill`: blur, relectura y UN reintento tecleando; el valor llega al portal y no al log', async () => {
  inicio = DATEPICKER
  const { context, page, guard } = await nuevaPagina()
  try {
    const { k, lineas } = contexto(page, guard, (inv, n) => n === 1
      ? respuesta([
        { accion: 'rellenar', ref: ref(inv, 'efecto'), dato: 'efecto.fecha' },
        { accion: 'avanzar', ref: ref(inv, 'siguiente'), efectoEsperado: 'calcular', confianza: 'alta' },
      ])
      : respuesta([{ accion: 'terminar', refsPrecio: [inv.marcos.flatMap((m) => m.importes ?? [])[0].ref] }], 'resultado'),
    { hoy: () => new Date('2026-10-14T10:00:00Z') })
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'resultado', JSON.stringify(fin))
    assert.match(peticiones.find((p) => p.ruta === '/tarificar')!.cuerpo, /efecto=15%2F10%2F2026/)
    const log = lineas.join('\n')
    assert.match(log, /"exploracion_valor".*"estado":"reintentado"/)
    assert.ok(!/15\/10\/2026|15%2F10/.test(log), 'el log no lleva el valor')
  } finally {
    await context.close()
  }
})

test('🪤 misma pantalla con MÁS campos rellenos en cada paso (sin avanzar): NO es bucle; y el inventario marca los inválidos', async () => {
  inicio = VARIOS_CAMPOS
  const { context, page, guard } = await nuevaPagina()
  try {
    const claves: [string, string][] = [['superficie', 'inmueble.superficie_m2'], ['anio', 'inmueble.anio_construccion'], ['planta', 'inmueble.planta']]
    const { k, enviados } = contexto(page, guard, (inv, n) => {
      if (n <= 3) return respuesta([{ accion: 'rellenar', ref: ref(inv, claves[n - 1][0]), dato: claves[n - 1][1] }])
      if (n === 4) return respuesta([{ accion: 'avanzar', ref: ref(inv, 'siguiente'), efectoEsperado: 'calcular', confianza: 'alta' }])
      return respuesta([{ accion: 'terminar', refsPrecio: [inv.marcos.flatMap((m) => m.importes ?? [])[0].ref] }], 'resultado')
    })
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'resultado', JSON.stringify(fin))
    assert.equal(fin.pasos, 5)
    const el = (id: string) => enviados[0].inventario.marcos.flatMap((m) => m.elementos).find((e) => e.id === id)!
    assert.equal(el('superficie').invalido, true)
    assert.equal(el('anio').invalido, true)
    assert.equal(el('planta').invalido, true)
    assert.equal(el('capital').invalido, undefined)
  } finally {
    await context.close()
  }
})

test('valorAplicado: tolera el reformateo del portal; vacío o distinto, no', () => {
  assert.equal(valorAplicado('15/10/2026', '15/10/2026'), true)
  assert.equal(valorAplicado('15/10/2026', '15-10-2026'), true)
  assert.equal(valorAplicado('120000', '120.000,00 €'), true)
  assert.equal(valorAplicado('15/10/2026', ''), false)
  assert.equal(valorAplicado('15/10/2026', '10/15/2026'), false)
  assert.equal(valorAplicado('90', '9'), false)
})

test('cortarLoteTrasRellenar: claves de autocompletado o cambio de huella/nº de elementos', () => {
  const a = { huella: 'h1', elementos: 5 }
  assert.equal(cortarLoteTrasRellenar('inmueble.codigo_postal', a, a), true)
  assert.equal(cortarLoteTrasRellenar('inmueble.provincia', a, null), true)
  assert.equal(cortarLoteTrasRellenar('inmueble.municipio', a, a), true)
  assert.equal(cortarLoteTrasRellenar('inmueble.superficie_m2', a, a), false)
  assert.equal(cortarLoteTrasRellenar('inmueble.superficie_m2', a, null), false)
  assert.equal(cortarLoteTrasRellenar('inmueble.superficie_m2', a, { huella: 'h2', elementos: 5 }), true)
  assert.equal(cortarLoteTrasRellenar('inmueble.superficie_m2', a, { huella: 'h1', elementos: 6 }), true)
})

test('dato personal sin valor (NIF en exploración sintética): para dato_sensible_requerido sin escribir', async () => {
  inicio = RIESGO
  const { context, page, guard } = await nuevaPagina()
  try {
    const { k } = contexto(page, guard, (inv) => respuesta([{ accion: 'rellenar', ref: ref(inv, 'superficie'), dato: 'tomador.nif' }]))
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'dato_sensible_requerido')
    assert.equal(await page.inputValue('#superficie'), '')
  } finally {
    await context.close()
  }
})

test('asegura responde 404 (exploración ya no en curso): perdido, sin resultado', async () => {
  inicio = RIESGO
  const { context, page, guard } = await nuevaPagina()
  try {
    const { k } = contexto(page, guard, () => null, { pedirPaso: async () => ({ estado: 'perdido', status: 404 }) })
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'perdido')
    assert.equal(resultadoDeFin(k.trabajoId, 'allianz', fin, (t) => t), null)
  } finally {
    await context.close()
  }
})

test('misma pantalla tras dos avances sin efecto: bucle', async () => {
  inicio = RIESGO
  const { context, page, guard } = await nuevaPagina()
  try {
    // «Siguiente» como botón que no envía: la pantalla no cambia.
    await page.evaluate(() => { document.getElementById('siguiente')!.setAttribute('type', 'button') })
    const { k, enviados } = contexto(page, guard, (inv) => respuesta([{ accion: 'avanzar', ref: ref(inv, 'siguiente'), efectoEsperado: 'siguiente_pantalla', confianza: 'media' }]))
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'bucle')
    assert.ok(enviados.length <= 3)
  } finally {
    await context.close()
  }
})

// ─── El avance autorizado de guard.ts, llamado a pelo (cepo del cepo) ──────────

test('pulsarExploracionAutorizada: se niega sin el título de Datos básicos aunque se la llame directamente', async () => {
  trasPaso2 = DATOS_BASICOS('Tarificar')
  const { context, page, guard } = await nuevaPagina()
  try {
    await page.goto(`${base}/paso2`)
    peticiones = []
    const cap = (await capturarInventarioExploracion(page))!
    const r = ref(cap.inventario, 'avanceDB')
    const marco = cap.inventario.marcos[0]
    const el = marco.elementos.find((e) => e.ref === r)!
    await assert.rejects(pulsarExploracionAutorizada(page, guard, page.locator('#avanceDB'), { entrada: 'allianz:particulares:hogar', el, marco }), EmisionBloqueadaError)
    assert.ok(!peticiones.some((p) => p.ruta === '/tarificar'))
    await cap.liberar()
  } finally {
    await context.close()
  }
})

test('pulsarExploracionAutorizada: un botón que no es el avance autorizado (p. ej. «Siguiente») no entra por esta puerta', async () => {
  inicio = RIESGO
  const { context, page, guard } = await nuevaPagina()
  try {
    const cap = (await capturarInventarioExploracion(page))!
    const marco = cap.inventario.marcos[0]
    const el = marco.elementos.find((e) => e.id === 'siguiente')!
    await assert.rejects(pulsarExploracionAutorizada(page, guard, page.locator('#siguiente'), { entrada: 'allianz:particulares:hogar', el, marco }), /no autorizado/)
    assert.ok(!peticiones.some((p) => p.ruta === '/paso2'))
    await cap.liberar()
  } finally {
    await context.close()
  }
})

test('pulsarExploracionAutorizada: UNA vez por trabajo', async () => {
  trasPaso2 = DATOS_BASICOS('Datos básicos')
  const { context, page, guard } = await nuevaPagina()
  try {
    await page.goto(`${base}/paso2`)
    const cap = (await capturarInventarioExploracion(page))!
    const marco = cap.inventario.marcos[0]
    const el = marco.elementos.find((e) => e.id === 'avanceDB')!
    await pulsarExploracionAutorizada(page, guard, page.locator('#avanceDB'), { entrada: 'allianz:particulares:hogar', el, marco })
    await page.goto(`${base}/paso2`)
    await assert.rejects(pulsarExploracionAutorizada(page, guard, page.locator('#avanceDB'), { entrada: 'allianz:particulares:hogar', el, marco }), /ya se usó/)
    await cap.liberar()
  } finally {
    await context.close()
  }
})

test('div#aceptar (servlet): el inventario de EXPLORACIÓN lo recoge (solo ese div, con texto y onclick); el normal no', async () => {
  trasPaso2 = DATOS_BASICOS_DIV('Datos básicos')
  const { context, page } = await nuevaPagina()
  try {
    await page.goto(`${base}/paso2`)
    const cap = (await capturarInventarioExploracion(page))!
    const divs = cap.inventario.marcos.flatMap((m) => m.elementos).filter((e) => e.tag === 'div')
    assert.deepEqual(divs.map((e) => ({ id: e.id, texto: e.texto, onclick: e.onclick })), [{ id: 'aceptar', texto: 'Aceptar', onclick: 'btnAceptar();' }])
    await cap.liberar()
    const normal = (await capturarInventarioDom(page))!
    assert.ok(!normal.marcos.flatMap((m) => m.elementos).some((e) => e.tag === 'div'), 'el inventario de mapeo no cambia')
  } finally {
    await context.close()
  }
})

test('div#aceptar en Datos básicos: avance autorizado (UNA pulsación, POST al formulario) y llega al precio', async () => {
  trasPaso2 = DATOS_BASICOS_DIV('Datos básicos')
  const { context, page, guard } = await nuevaPagina()
  try {
    await page.goto(`${base}/paso2`)
    peticiones = []
    const { k } = contexto(page, guard, (inv, n) => {
      if (n === 1) return respuesta([{ accion: 'avanzar', ref: ref(inv, 'aceptar'), efectoEsperado: 'calcular', confianza: 'alta' }])
      const imp = inv.marcos.flatMap((m) => m.importes ?? [])
      return respuesta([{ accion: 'terminar', refsPrecio: [imp[0].ref] }], 'resultado')
    })
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'resultado', JSON.stringify(fin))
    assert.deepEqual(fin.efectos, ['posible_proyecto_guardado'])
    assert.equal(peticiones.filter((p) => p.ruta === '/tarificar' && p.metodo === 'POST').length, 1)
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

test('div#aceptar fuera de Datos básicos, u otro div clicable: no se pulsa (ambiguo, sin POST)', async () => {
  for (const [titulo, id] of [['Coberturas', 'aceptar'], ['Datos básicos', 'otroDiv']] as const) {
    trasPaso2 = DATOS_BASICOS_DIV(titulo)
    const { context, page, guard } = await nuevaPagina()
    try {
      await page.goto(`${base}/paso2`)
      peticiones = []
      const { k } = contexto(page, guard, (inv) => {
        // `otroDiv` ni siquiera está en el inventario: la IA solo puede inventarse una ref, que no valida.
        const r = inv.marcos.flatMap((m) => m.elementos).find((e) => e.id === id)?.ref ?? 'm0e99'
        return respuesta([{ accion: 'avanzar', ref: r, efectoEsperado: 'calcular', confianza: 'alta' }])
      })
      const fin = await bucleExploracion(page, k)
      assert.equal(fin.motivo, 'ambiguo', `${titulo}/${id}: ${JSON.stringify(fin)}`)
      assert.ok(!peticiones.some((p) => p.ruta === '/tarificar'), `${titulo}/${id}: salió el POST`)
    } finally {
      await context.close()
    }
  }
})

// ─── Reglas puras ────────────────────────────────────────────────────────────

test('coincideConInventario: tag, id, name, type y texto (con recorte) tienen que casar', () => {
  const el = { tag: 'button', id: 'siguiente', texto: 'Siguiente' }
  const vivo = { tag: 'button', id: 'siguiente', name: null, type: 'submit', texto: 'Siguiente' }
  assert.equal(coincideConInventario(vivo, el), true)
  assert.equal(coincideConInventario({ ...vivo, texto: 'Contratar' }, el), false)
  assert.equal(coincideConInventario({ ...vivo, id: 'otro' }, el), false)
  assert.equal(coincideConInventario({ ...vivo, tag: 'a' }, el), false)
  assert.equal(coincideConInventario(null, el), false)
  assert.equal(coincideConInventario({ ...vivo, texto: 'Un texto muy largo que sigue' }, { tag: 'button', texto: 'Un texto muy…' }), true)
})

test('motivoSinDato, valorParaControl y finDeError', () => {
  assert.equal(motivoSinDato('clave_desconocida'), 'ambiguo')
  assert.equal(motivoSinDato('dato_sensible_requerido'), 'dato_sensible_requerido')
  // 14/10/2026: falta un dato del riesgo (año, m²…) ≠ dato SENSIBLE.
  assert.equal(motivoSinDato('dato_no_disponible'), 'dato_no_disponible')
  assert.equal(valorParaControl('15/01/1980', { tag: 'input', type: 'date' }), '1980-01-15')
  assert.equal(valorParaControl('15/01/1980', { tag: 'input', type: 'text' }), '15/01/1980')
  assert.equal(finDeError(new ErrorVerificacionHumana('allianz')).motivo, 'otp')
  assert.equal(finDeError(new ErrorTarificador('captcha', 'x')).motivo, 'captcha')
  assert.equal(finDeError(new EmisionBloqueadaError('url', 'x')).motivo, 'guard_emision')
  assert.deepEqual(finDeError(new ErrorTarificador('credenciales', 'x')), { motivo: 'error_portal', error: { tipo: 'credenciales', mensaje: 'x' } })
})

test('resultadoDeFin: paradas normales = explorado; OTP/CAPTCHA = captcha; guard = emision', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  const r = (motivo: Parameters<typeof resultadoDeFin>[2]['motivo'], error: Parameters<typeof resultadoDeFin>[2]['error'] = null) => resultadoDeFin(id, 'allianz', { motivo, error }, (t) => t)
  for (const m of ['resultado', 'cerca_de_emision', 'dato_sensible_requerido', 'bucle', 'tope', 'sin_salida', 'ambiguo', 'aceptar_requerido'] as const) {
    assert.deepEqual(r(m), { trabajoId: id, resultado: 'explorado', motivoFin: m, botVersion: EXPLORADOR_VERSION })
  }
  assert.equal(r('captcha')!.resultado, 'error')
  const g = r('guard_emision', { tipo: 'emision', mensaje: 'bloqueado' })!
  assert.ok(g.resultado === 'error' && g.error.tipo === 'emision')
  const p = r('error_portal', { tipo: 'infra', mensaje: 'caído' })!
  assert.ok(p.resultado === 'error' && p.error.tipo === 'infra')
})

test('cuerpoTrasCierre: si la cabecera no se cerró, NUNCA «explorado» (fallo de infra)', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  const f = (st: number, motivo: Parameters<typeof resultadoDeFin>[2]['motivo'] = 'resultado') => cuerpoTrasCierre(id, 'allianz', { motivo, error: null }, st, (t) => t)!
  for (const st of [200, 204, 409]) assert.equal(f(st).resultado, 'explorado')
  for (const st of [0, 400, 401, 404, 503]) {
    const c = f(st)
    assert.ok(c.resultado === 'error' && c.error.tipo === 'infra', `status ${st}`)
  }
  assert.equal(cierreCorrecto(0), false)
  // Un fallo que ya era error se queda como era.
  const c = f(0, 'captcha')
  assert.ok(c.resultado === 'error' && c.error.tipo === 'captcha')
})

test('problemaTrabajoExploracion: entrada cerrada que case con compañía y ramo', () => {
  const t = { id: 'x', compania: 'allianz', ramo: 'hogar', riesgo: {}, modo: 'exploracion' as const }
  assert.equal(problemaTrabajoExploracion({ ...t, exploracion: { entrada: 'allianz:particulares:hogar', conDatosReales: false } }), null)
  assert.match(problemaTrabajoExploracion(t)!, /sin entrada/)
  assert.match(problemaTrabajoExploracion({ ...t, exploracion: { entrada: 'https://otro', conDatosReales: false } })!, /desconocida/)
  assert.match(problemaTrabajoExploracion({ ...t, ramo: 'comunidades', exploracion: { entrada: 'allianz:particulares:hogar', conDatosReales: false } })!, /no casa/)
  assert.match(problemaTrabajoExploracion({ ...t, compania: 'mapfre', exploracion: { entrada: 'allianz:particulares:hogar', conDatosReales: false } })!, /no casa/)
})

test('accionSinDato: con datos reales, una clave ausente solo se salta si el portal ya rellenó el campo; si no, para', () => {
  assert.equal(accionSinDato('dato_no_disponible', true, true), 'saltar')
  assert.equal(accionSinDato('dato_no_disponible', true, false), 'dato_no_disponible')
  assert.equal(accionSinDato('dato_no_disponible', false, true), 'dato_no_disponible')
  assert.equal(accionSinDato('dato_sensible_requerido', true, true), 'dato_sensible_requerido')
  assert.equal(accionSinDato('clave_desconocida', true, true), 'ambiguo')
})

// ─── GUARDAR EL PRESUPUESTO (Alberto, 14/10/2026): sí en resultado; emitir NUNCA ─────────────────────────────────────

const PDF_PRUEBA = Buffer.from('%PDF-1.4\n% presupuesto sintetico de prueba\n%%EOF\n', 'latin1')

/** Resultado con precio y los botones de guardar (POST /guardar) y de emitir. */
const RESULTADO_CON_GUARDAR = PAGINA(`
  <h1>Resultado</h1><table><tr><td>Prima total</td><td>347,55 €</td></tr></table>
  <form id="fg" method="post" action="/guardar"><button id="btnGuardar" type="submit">Guardar presupuesto</button></form>
  <form id="fe" method="post" action="/emitir"><button id="btnEmitir" type="submit" onclick="window.pulsadoEmitir = true">Emitir</button></form>
  <script>function g() { fetch('/control.do', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'action=contract' }).catch(() => {}) }</script>
  <button id="btnGuardarX" type="button" onclick="g()">Guardar</button>`)

/** Tras guardar: la referencia y el enlace al PDF (descarga). Ya no enseña el precio. */
const ARCHIVADO = PAGINA(`
  <h1>Proyecto archivado</h1><p>Referencia del presupuesto: P2026-000123</p>
  <a id="lnkPdf" href="/presupuesto.pdf" role="button">Descargar PDF</a>`)

/** ePAC: td#store «Archivar» que envía `action=store` al control del framework legado. */
const RESULTADO_EPAC = PAGINA(`
  <h1>Tarificación</h1><table><tr><td>Prima total</td><td>347,55 €</td></tr></table>
  <script>function sendActionEvent(a) { document.getElementById('fa').elements.action.value = a; document.getElementById('fa').submit() }</script>
  <form id="fa" method="post" action="/control.do"><input type="hidden" name="action" value=""></form>
  <table><tr><td id="store" onclick="sendActionEvent('store')">Archivar</td><td id="contract" onclick="sendActionEvent('contract')">Emitir</td></tr></table>`)

function rutasGuardado(): void {
  rutasExtra = {
    '/guardar': { tipo: 'text/html; charset=utf-8', cuerpo: ARCHIVADO },
    '/control.do': { tipo: 'text/html; charset=utf-8', cuerpo: ARCHIVADO },
    '/presupuesto.pdf': { tipo: 'application/pdf', cuerpo: PDF_PRUEBA, cabeceras: { 'Content-Disposition': 'attachment; filename="presupuesto.pdf"' } },
    '/emitir': { tipo: 'text/html; charset=utf-8', cuerpo: PAGINA('<h1>Póliza emitida</h1>') },
  }
}

async function paginaEn(html: string): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  peticiones = []
  rutasGuardado()
  rutasExtra['/inicio'] = { tipo: 'text/html; charset=utf-8', cuerpo: html }
  const context = await browser.newContext({ acceptDownloads: true })
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(5_000)
  await page.goto(`${base}/inicio`)
  return { context, page, guard }
}

const importesDe = (inv: InventarioDom) => inv.marcos.flatMap((m) => m.importes ?? [])

test('GUARDAR (b): en el resultado guarda, lee la referencia, descarga el PDF y termina; ni un POST de emisión', async () => {
  const { context, page, guard } = await paginaEn(RESULTADO_CON_GUARDAR)
  try {
    const { k, lineas } = contexto(page, guard, (inv, n) => {
      if (n === 1) return respuesta([{ accion: 'avanzar', ref: ref(inv, 'btnGuardar'), efectoEsperado: 'guardar_presupuesto', confianza: 'alta' }], 'resultado')
      if (n === 2) return respuesta([{ accion: 'avanzar', ref: ref(inv, 'lnkPdf'), efectoEsperado: 'guardar_presupuesto', confianza: 'alta' }], 'resultado')
      return respuesta([{ accion: 'terminar', refsPrecio: importesDe(inv).length ? [importesDe(inv)[0].ref] : [] }], 'resultado')
    })
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'resultado', JSON.stringify({ ...fin, presupuesto: undefined }))
    assert.ok(fin.efectos.includes('presupuesto_guardado'))
    assert.equal(fin.presupuesto?.guardado, true)
    assert.equal(fin.presupuesto?.referencia, 'P2026-000123')
    assert.ok(fin.presupuesto?.pdf && fin.presupuesto.pdf.subarray(0, 5).toString('latin1') === '%PDF-', 'el PDF llegó')
    assert.ok(peticiones.some((p) => p.metodo === 'POST' && p.ruta === '/guardar'))
    assert.ok(!peticiones.some((p) => p.ruta === '/emitir'), 'nada de emitir')
    assert.equal(guard.violacion(), null)
    assert.ok(!lineas.join('\n').includes('P2026-000123'), 'la referencia no va al log')
    // Lo que sale: cierre (tres estados) y resultado (referencia + PDF en base64).
    const cuerpo = resultadoDeFin('00000000-0000-4000-8000-000000000001', 'allianz', fin, (t) => t)
    assert.ok(cuerpo?.resultado === 'explorado' && cuerpo.presupuesto?.referencia === 'P2026-000123' && cuerpo.presupuesto.pdf?.base64 === PDF_PRUEBA.toString('base64'))
  } finally {
    await context.close()
  }
})

test('GUARDAR ePAC: td#store «Archivar» (action=store) pasa SOLO por la puerta del guardado; td#contract «Emitir» nunca', async () => {
  const { context, page, guard } = await paginaEn(RESULTADO_EPAC)
  try {
    const { k } = contexto(page, guard, (inv, n) => {
      if (n === 1) return respuesta([{ accion: 'avanzar', ref: ref(inv, 'store'), efectoEsperado: 'guardar_presupuesto', confianza: 'alta' }], 'resultado')
      return respuesta([{ accion: 'terminar', refsPrecio: [] }], 'resultado')
    })
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'resultado', JSON.stringify({ ...fin, presupuesto: undefined }))
    assert.match(peticiones.find((p) => p.ruta === '/control.do')!.cuerpo, /action=store/)
    assert.equal(guard.violacion(), null)
    assert.equal(fin.presupuesto?.referencia, 'P2026-000123')
    assert.equal(guard.guardado.abierta(), false, 'la ventana se cierra')
    // Fuera de la ventana, la MISMA acción store vuelve a estar bloqueada en la red.
    await page.goto(`${base}/inicio`)
    await page.evaluate(() => (window as unknown as { sendActionEvent: (a: string) => void }).sendActionEvent('store')).catch(() => undefined)
    await page.waitForTimeout(300)
    assert.ok(guard.violacion(), 'store fuera de la ventana: abortado')
  } finally {
    await context.close()
  }
})

test('GUARDAR (a): «Guardar» en un FORMULARIO sin precio → rechazado al revalidar, sin pulsar', async () => {
  const form = PAGINA(`<h2>Datos del riesgo</h2><form method="post" action="/guardar"><label for="s">Superficie</label><input id="s" name="s"><button id="btnGuardar" type="submit">Guardar</button></form>`)
  const { context, page, guard } = await paginaEn(form)
  try {
    const { k } = contexto(page, guard, (inv) => respuesta([{ accion: 'avanzar', ref: ref(inv, 'btnGuardar'), efectoEsperado: 'guardar_presupuesto', confianza: 'alta' }], 'resultado'))
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'ambiguo')
    assert.equal(fin.detalle, 'lote_no_valido')
    assert.ok(!peticiones.some((p) => p.ruta === '/guardar'), 'no se pulsó')
    assert.equal(fin.presupuesto, undefined)
  } finally {
    await context.close()
  }
})

test('GUARDAR (c): la IA pide «Emitir» en el resultado como guardar_presupuesto → rechazado, sin pulsar', async () => {
  const { context, page, guard } = await paginaEn(RESULTADO_CON_GUARDAR)
  try {
    const { k } = contexto(page, guard, (inv) => respuesta([{ accion: 'avanzar', ref: ref(inv, 'btnEmitir'), efectoEsperado: 'guardar_presupuesto', confianza: 'alta' }], 'resultado'))
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'ambiguo')
    assert.ok(!peticiones.some((p) => p.ruta === '/emitir'))
    assert.equal(await page.evaluate(() => (window as unknown as { pulsadoEmitir?: boolean }).pulsadoEmitir ?? false), false, 'Emitir NO se pulsó')
  } finally {
    await context.close()
  }
})

test('GUARDAR (d): el GUARD del worker bloquea Emitir aunque se le llame directamente y la pantalla tenga precio', async () => {
  const { context, page, guard } = await paginaEn(RESULTADO_CON_GUARDAR)
  try {
    const cap = await capturarInventarioExploracion(page)
    const inv = cap!.inventario
    const el = (id: string) => inv.marcos.flatMap((m) => m.elementos).find((e) => e.id === id)!
    const pantalla = { tipoPantalla: 'resultado' as const, hayImportes: true, presupuestoEnCurso: false }
    // 1) El elemento ES «Emitir».
    await assert.rejects(pulsarGuardadoPresupuesto(page, guard, page.locator('#btnEmitir'), { el: el('btnEmitir'), pantalla }), EmisionBloqueadaError)
    // 2) La IA/inventario dice «Guardar», pero el control VIVO es «Emitir» (el texto no casa) → rechazado.
    await assert.rejects(pulsarGuardadoPresupuesto(page, guard, page.locator('#btnEmitir'), { el: el('btnGuardar'), pantalla }), EmisionBloqueadaError)
    // 3) Sin precio en pantalla y sin guardado previo → rechazado.
    await assert.rejects(pulsarGuardadoPresupuesto(page, guard, page.locator('#btnGuardar'), { el: el('btnGuardar'), pantalla: { ...pantalla, hayImportes: false } }), EmisionBloqueadaError)
    assert.ok(!peticiones.some((p) => p.ruta === '/emitir' || p.ruta === '/guardar'), 'no salió nada')
    assert.equal(await page.evaluate(() => (window as unknown as { pulsadoEmitir?: boolean }).pulsadoEmitir ?? false), false, 'Emitir NO se pulsó (ni siquiera con la red cortándolo)')
    // 4) Un «Guardar» cuyo clic manda la acción de EMITIR (action=contract): la red lo aborta y el trabajo cae.
    await pulsarGuardadoPresupuesto(page, guard, page.locator('#btnGuardarX'), { el: el('btnGuardarX'), pantalla }, () => page.waitForTimeout(500)).catch(() => undefined)
    assert.ok(guard.violacion() instanceof EmisionBloqueadaError, 'action=contract abortado por la red')
    assert.ok(!peticiones.some((p) => p.ruta === '/control.do'), 'el POST de contract no salió')
    await cap!.liberar()
  } finally {
    await context.close()
  }
})

/** Controles compuestos: «Guardar y firmar» visible; y dos «Guardar presupuesto» cuyo VIVO lleva emisión (title, onclick pagar()). */
const RESULTADO_COMPUESTOS = PAGINA(`
  <h1>Resultado</h1><table><tr><td>Prima total</td><td>347,55 €</td></tr></table>
  <button id="btnFirma" type="button" onclick="window.pulsadoCompuesto = true">Guardar y firmar</button>
  <button id="btnTitulo" type="button" title="Guardar y firmar" onclick="window.pulsadoCompuesto = true">Guardar presupuesto</button>
  <div id="divPagar" role="button" onclick="pagar('x')">Guardar presupuesto</div>
  <script>function pagar(x) { window.pulsadoCompuesto = true }</script>`)

test('GUARDAR (e): control VIVO con emisión (Guardar y firmar; title o onclick pagar()) → aborta sin hacer click', async () => {
  const { context, page, guard } = await paginaEn(RESULTADO_COMPUESTOS)
  try {
    const cap = await capturarInventarioExploracion(page)
    const elementos = cap!.inventario.marcos.flatMap((m) => m.elementos)
    const el = (id: string) => elementos.find((e) => e.id === id)!
    const pantalla = { tipoPantalla: 'resultado' as const, hayImportes: true, presupuestoEnCurso: false }
    // 1) Texto visible «Guardar y firmar»: el inventario ya lo ve como emisión.
    await assert.rejects(pulsarGuardadoPresupuesto(page, guard, page.locator('#btnFirma'), { el: el('btnFirma'), pantalla }), EmisionBloqueadaError)
    // 2) El inventario dice «Guardar presupuesto»; el VIVO lleva «Guardar y firmar» en el title → lo corta el control vivo.
    await assert.rejects(pulsarGuardadoPresupuesto(page, guard, page.locator('#btnTitulo'), { el: el('btnTitulo'), pantalla }), EmisionBloqueadaError)
    // 3) div con onclick pagar(…) (el inventario no lo vio) → lo corta el control vivo.
    await assert.rejects(pulsarGuardadoPresupuesto(page, guard, page.locator('#divPagar'), { el: el('divPagar'), pantalla }), EmisionBloqueadaError)
    assert.equal(await page.evaluate(() => (window as unknown as { pulsadoCompuesto?: boolean }).pulsadoCompuesto ?? false), false, 'ningún control compuesto se pulsó')
    assert.ok(!peticiones.some((p) => p.ruta === '/guardar' || p.ruta === '/emitir'), 'no salió ninguna petición')
    await cap!.liberar()
  } finally {
    await context.close()
  }
})

test('GUARDAR: como mucho MAX_GUARDADOS_PRESUPUESTO pulsaciones por trabajo', async () => {
  const { context, page, guard } = await paginaEn(ARCHIVADO)
  try {
    const cap = await capturarInventarioExploracion(page)
    const el = cap!.inventario.marcos.flatMap((m) => m.elementos).find((e) => e.id === 'lnkPdf')!
    const pantalla = { tipoPantalla: 'resultado' as const, hayImportes: false, presupuestoEnCurso: true }
    for (let i = 0; i < MAX_GUARDADOS_PRESUPUESTO; i++) await pulsarGuardadoPresupuesto(page, guard, page.locator('#lnkPdf'), { el, pantalla }, () => page.waitForTimeout(200))
    await assert.rejects(pulsarGuardadoPresupuesto(page, guard, page.locator('#lnkPdf'), { el, pantalla }), EmisionBloqueadaError)
    await cap!.liberar()
  } finally {
    await context.close()
  }
})

test('presupuestoParaCierre: tres estados del PDF (null = no se intentó); sin guardado, nada', () => {
  assert.deepEqual(presupuestoParaCierre({ guardado: false, referencia: null, pdf: null, pdfIntentado: false }), { guardado: false, referencia: null, pdf: null })
  assert.deepEqual(presupuestoParaCierre({ guardado: true, referencia: null, pdf: null, pdfIntentado: true }), { guardado: true, referencia: null, pdf: false })
  assert.deepEqual(presupuestoParaCierre({ guardado: true, referencia: 'P1234', pdf: PDF_PRUEBA, pdfIntentado: true }), { guardado: true, referencia: 'P1234', pdf: true })
  // Sin guardado no viaja presupuesto en el resultado.
  const r = resultadoDeFin('00000000-0000-4000-8000-000000000001', 'allianz', { motivo: 'resultado', error: null }, (t) => t)
  assert.ok(r?.resultado === 'explorado' && !('presupuesto' in r))
})

// ─── Año y m² que no se quedaban en Allianz Hogar (14/10/2026). Valores FICTICIOS. ───────────────────────────────────

/** Riesgo ficticio de una exploración con datos reales: año y m² como los deja el Catastro (m² con decimales). */
const RIESGO_REAL = { tomador: { nif: '00000000T' }, inmueble: { anioConstruccion: 1975, superficieM2: 85.5 } }
/** Angular re-renderiza el formulario: cada input se sustituye por un clon (mismo id/name/label, nodo nuevo). */
const repintarInputs = (p: Page) => p.evaluate(() => { for (const id of ['anio', 'superficie']) { const e = document.getElementById(id)!; e.replaceWith(e.cloneNode(true)) } })

test('🪤 repintado ANTES del lote: la 1.ª acción (rellenar año, input type=number) se re-localiza y se escribe entero; m² redondeado', async () => {
  inicio = NUMERICO
  const { context, page, guard } = await nuevaPagina()
  try {
    const { k, lineas } = contexto(page, guard, async (inv, n, p) => {
      if (n === 1) {
        await repintarInputs(p)
        return respuesta([
          { accion: 'rellenar', ref: ref(inv, 'anio'), dato: 'inmueble.anio_construccion' },
          { accion: 'rellenar', ref: ref(inv, 'superficie'), dato: 'inmueble.superficie_m2' },
          { accion: 'avanzar', ref: ref(inv, 'siguiente'), efectoEsperado: 'calcular', confianza: 'alta' },
        ])
      }
      if (n === 2) return respuesta([
        { accion: 'rellenar', ref: ref(inv, 'superficie'), dato: 'inmueble.superficie_m2' },
        { accion: 'avanzar', ref: ref(inv, 'siguiente'), efectoEsperado: 'calcular', confianza: 'alta' },
      ])
      return respuesta([{ accion: 'terminar', refsPrecio: [inv.marcos.flatMap((m) => m.importes ?? [])[0].ref] }], 'resultado')
    }, { conDatosReales: true, riesgo: RIESGO_REAL, esperaRepintadoMs: 50 })
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'resultado', JSON.stringify(fin))
    const post = peticiones.find((x) => x.ruta === '/tarificar')!.cuerpo
    assert.match(post, /anio=1975/)
    assert.match(post, /superficie=86(&|$)/, 'm² entero (85,5 → 86), sin decimales para el input')
    const log = lineas.join('\n')
    assert.match(log, /"exploracion_relocalizacion".*"estado":"ok"/)
    assert.ok(!/1975|85\.5/.test(log), 'el log no lleva valores')
    assert.equal(fin.incidencias, undefined)
  } finally {
    await context.close()
  }
})

test('🪤 repintado que CAMBIA el control (otra etiqueta): no se adivina; para «nodo_no_relocalizado» con la incidencia (sin valor)', async () => {
  inicio = NUMERICO
  const { context, page, guard } = await nuevaPagina()
  try {
    let refAnio = ''
    const { k } = contexto(page, guard, async (inv, _n, p) => {
      refAnio = ref(inv, 'anio')
      await p.evaluate(() => { document.getElementById('lanio')!.textContent = 'Año de reforma' })
      await repintarInputs(p)
      return respuesta([{ accion: 'rellenar', ref: refAnio, dato: 'inmueble.anio_construccion' }])
    }, { conDatosReales: true, riesgo: RIESGO_REAL, esperaRepintadoMs: 50 })
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'ambiguo')
    assert.equal(fin.detalle, 'nodo_no_relocalizado')
    assert.deepEqual(fin.incidencias, [{ accion: 'rellenar', ref: refAnio, dato: 'inmueble.anio_construccion', causa: 'nodo_no_relocalizado' }])
    assert.equal(await page.inputValue('#anio'), '', 'no se escribió nada')
  } finally {
    await context.close()
  }
})

test('🪤 valor que el portal no deja (ni con el reintento tecleando): viaja como incidencia en el SIGUIENTE paso, sin el valor', async () => {
  inicio = NO_SE_QUEDA
  const { context, page, guard } = await nuevaPagina()
  try {
    let refSup = ''
    const { k, enviados, lineas } = contexto(page, guard, (inv, n) => {
      refSup = ref(inv, 'superficie')
      return n === 1 ? respuesta([{ accion: 'rellenar', ref: refSup, dato: 'inmueble.superficie_m2' }]) : respuesta([{ accion: 'parar', motivo: 'ambiguo' }])
    }, { conDatosReales: true, riesgo: RIESGO_REAL })
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'ambiguo')
    assert.equal(enviados[0].incidencias, undefined)
    assert.deepEqual(enviados[1].incidencias, [{ accion: 'rellenar', ref: refSup, dato: 'inmueble.superficie_m2', causa: 'valor_no_aplicado' }])
    assert.equal(fin.incidencias, undefined, 'ya se contó en el paso: no se repite en el cierre')
    assert.ok(!JSON.stringify(enviados[1].incidencias).includes('86'))
    assert.match(lineas.join('\n'), /"exploracion_valor".*"estado":"no_aplicado"/)
  } finally {
    await context.close()
  }
})

test('🪤 frontera de cuenta bancaria sobre el control RELOCALIZADO (revisión PR #4648): el clon trae «IBAN» → para sin escribir', async () => {
  inicio = NUMERICO
  const { context, page, guard } = await nuevaPagina()
  try {
    const { k } = contexto(page, guard, async (inv, _n, p) => {
      const r = ref(inv, 'superficie')
      // Repintado: mismo id/name/etiqueta (misma huella), pero el control nuevo se presenta como IBAN.
      await p.evaluate(() => { const e = document.getElementById('superficie')!; const c = e.cloneNode(true) as HTMLInputElement; c.placeholder = 'IBAN'; e.replaceWith(c) })
      return respuesta([{ accion: 'rellenar', ref: r, dato: 'inmueble.superficie_m2' }])
    }, { conDatosReales: true, riesgo: RIESGO_REAL, esperaRepintadoMs: 50 })
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'cerca_de_emision', JSON.stringify(fin))
    assert.equal(fin.detalle, 'frontera_cuenta_bancaria')
    assert.equal(await page.inputValue('#superficie'), '', 'no se escribió nada')
  } finally {
    await context.close()
  }
})
