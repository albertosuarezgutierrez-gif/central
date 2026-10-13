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
import { instalarGuardEmision, pulsar, pulsarExploracionAutorizada, type GuardEmision } from '../src/guard.ts'
import { capturarInventarioDom, capturarInventarioExploracion } from '../src/inventario-dom.ts'
import {
  bucleExploracion,
  cierreCorrecto,
  cuerpoTrasCierre,
  coincideConInventario,
  finDeError,
  motivoSinDato,
  problemaTrabajoExploracion,
  resultadoDeFin,
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

const OTP = PAGINA(`<h1>Verificación</h1><label for="c">Código</label><input id="c" autocomplete="one-time-code">`)

type Peticion = { metodo: string; ruta: string; cuerpo: string }
let servidor: Server
let base = ''
let peticiones: Peticion[] = []
/** Qué pantalla sirve `/` y a qué lleva `/paso2` (cada test lo fija). */
let inicio = RIESGO
let trasPaso2 = DATOS_BASICOS('Datos básicos')

let browser: Browser
before(async () => {
  servidor = createServer((req, res) => {
    let cuerpo = ''
    req.on('data', (c) => { cuerpo += c })
    req.on('end', () => {
      const ruta = (req.url ?? '/').split('?')[0]
      peticiones.push({ metodo: req.method ?? 'GET', ruta, cuerpo })
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
  const enviados: { inventario: InventarioDom; avancesFallidos: number }[] = []
  const lineas: string[] = []
  const k: ContextoBucle = {
    trabajoId: '00000000-0000-4000-8000-000000000001', compania: 'allianz', ramo: 'hogar', entrada: 'allianz:particulares:hogar',
    conDatosReales: false, riesgo: {}, env: {}, guard,
    pulsar: (b) => pulsar(b, guard),
    pulsarAutorizado: (b, el, marco) => pulsarExploracionAutorizada(page, guard, b, { entrada: 'allianz:particulares:hogar', el, marco }),
    pausaAccion: async () => undefined,
    pedirPaso: async (c): Promise<RespuestaPaso> => {
      enviados.push({ inventario: c.inventario, avancesFallidos: c.avancesFallidos })
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
    assert.ok(!peticiones.some((x) => x.ruta === '/paso2'), 'no se envió el formulario')
  } finally {
    await context.close()
  }
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
  assert.equal(motivoSinDato('dato_no_disponible'), 'dato_sensible_requerido')
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
    assert.deepEqual(r(m), { trabajoId: id, resultado: 'explorado', motivoFin: m, botVersion: '0.1.0' })
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
