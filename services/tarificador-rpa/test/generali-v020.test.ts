// Generali Turismos v0.2.0 (19/10/2026): verificación de matrícula OPCIONAL (0/1/>1), scroll + registro de la pantalla, mapa
// provisional de tomador/conductor/antecedentes, compuerta de «Garantías y Resultados» (lista blanca del guard) y lector
// tolerante del precio. Fixtures SINTÉTICAS (ningún dato real; los valores «SECRETO-…» comprueban que no salen).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { EmisionBloqueadaError, validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import {
  MEDIADOR_GENERALI,
  PRIMA_MAX_GENERALI_EUR,
  claveEtiquetaRiesgoGenerali,
  decidirVerificacionMatricula,
  importeEspanolEur,
  leerPrecioGenerali,
  resumenPantallaGenerali,
  valorRiesgoGenerali,
} from '../src/adapters/generali/reglas.ts'
import {
  ErrorMapaIncompletoGenerali,
  SUBPESTANA_PRECIO_GENERALI,
  hastaPrecioGenerali,
  leerPantalla,
  recorrerScroll,
  rellenarMapaProvisionalGenerali,
  rellenarValoracionGenerali,
} from '../src/adapters/generali/auto.ts'
import { ErrorMapaGuardGenerali, SUBPESTANAS_GENERALI, instalarGuardEmision, pulsar, pulsarSubpestanaGenerali, subpestanaGeneraliPermitida, type GuardEmision } from '../src/guard.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

const HOY = new Date()

const coche = (extra: Record<string, unknown> = {}): FormularioAuto => {
  const v = validarFormularioAuto({
    ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
    conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01' },
    tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null,
    seleccionVehiculo: { marca: 'SEAT', modelo: 'IBIZA', descripcion: '1.0 TSI STYLE' },
    fechaMatriculacion: '2019-05-02',
    ...extra,
  }, HOY)
  assert.ok(v.ok, v.ok ? '' : v.errores.join('; '))
  return v.formulario
}

// ───────────────────────── reglas puras ─────────────────────────

test('verificación de matrícula OPCIONAL: 0 → sigue, 1 → rellena, >1 → para con motivo claro', () => {
  assert.deepEqual(decidirVerificacionMatricula(0), { tipo: 'ninguna' })
  assert.deepEqual(decidirVerificacionMatricula(1), { tipo: 'rellenar' })
  const d = decidirVerificacionMatricula(3)
  assert.equal(d.tipo, 'parar')
  assert.match(d.tipo === 'parar' ? d.motivo : '', /3 candidatos/)
  assert.equal(decidirVerificacionMatricula(-1).tipo, 'parar')
})

test('importes en formato español: miles con punto, coma decimal, € delante o detrás; sin € ni decimales no es importe', () => {
  assert.equal(importeEspanolEur('1.234,56 €'), 1234.56)
  assert.equal(importeEspanolEur('1.234,56€'), 1234.56)
  assert.equal(importeEspanolEur('€ 1.234,56'), 1234.56)
  assert.equal(importeEspanolEur('456,7'), 456.7)
  assert.equal(importeEspanolEur('1.234 €'), 1234)
  assert.equal(importeEspanolEur('2019'), null)
  assert.equal(importeEspanolEur('12/05/2019'), null)
})

test('lector tolerante del precio: total en la misma línea o en la siguiente; ignora franquicias, capitales, valores e importes previos', () => {
  assert.deepEqual(leerPrecioGenerali('Garantías\nPRIMA TOTAL 1.234,56 €\nFranquicia 300,00 €'), { tipo: 'unico', eur: 1234.56, linea: 'PRIMA TOTAL 1.234,56 €' })
  const sig = leerPrecioGenerali('Prima total anual\n456,70€\nCapital asegurado\n12.000,00 €')
  assert.equal(sig.tipo === 'unico' ? sig.eur : null, 456.7)
  // Sin «total», vale «prima»/«importe»; «total» manda si lo hay.
  assert.equal((leerPrecioGenerali('Prima neta 400,00 €\nTotal recibo 480,00 €') as { eur?: number }).eur, 480)
  assert.deepEqual(leerPrecioGenerali('Valor resto de accesorios 0\nKM anuales 15.000\nAño 2019'), { tipo: 'ninguno' })
  assert.deepEqual(leerPrecioGenerali('Prima total 5,00 €'), { tipo: 'ninguno' }, 'fuera de la horquilla')
  assert.deepEqual(leerPrecioGenerali(`Prima total ${PRIMA_MAX_GENERALI_EUR + 1},00 €`), { tipo: 'ninguno' })
  assert.deepEqual(leerPrecioGenerali('Prima total 480,00 €', [480]), { tipo: 'ninguno' }, 'el importe que ya estaba antes del clic no es el precio')
  const varios = leerPrecioGenerali('Total Terceros 300,00 €\nTotal Todo Riesgo 900,00 €')
  assert.equal(varios.tipo, 'varios', 'varias modalidades: no se elige una a ciegas')
  assert.deepEqual(varios.tipo === 'varios' ? varios.candidatos.map((c) => c.eur) : [], [300, 900])
})

test('mapa provisional: etiqueta EXACTA normalizada → clave; valor del riesgo en el formato del portal; antecedentes favorables', () => {
  assert.equal(claveEtiquetaRiesgoGenerali('Fecha de nacimiento:'), 'fechaNacimiento')
  assert.equal(claveEtiquetaRiesgoGenerali('Fecha expedición carné *'), 'fechaCarne')
  assert.equal(claveEtiquetaRiesgoGenerali('Código Postal'), 'codigoPostal')
  assert.equal(claveEtiquetaRiesgoGenerali('Años asegurado'), 'aniosAsegurado')
  assert.equal(claveEtiquetaRiesgoGenerali('Nº siniestros últimos 5 años'), 'siniestros')
  assert.equal(claveEtiquetaRiesgoGenerali('Fecha de nacimiento del propietario'), null, 'nunca por contención')
  const f = { ...coche(), aniosAseguradoAnterior: 10, siniestrosUltimos5Anios: 0 }
  assert.equal(valorRiesgoGenerali('fechaNacimiento', f), '10/03/1985')
  assert.equal(valorRiesgoGenerali('fechaCarne', f), '01/06/2005')
  assert.equal(valorRiesgoGenerali('codigoPostal', f), '41003')
  assert.equal(valorRiesgoGenerali('aniosAsegurado', f), '10')
  assert.equal(valorRiesgoGenerali('siniestros', f), '0')
})

test('resumen de la pantalla: etiqueta [tipo*] = valor, botones y avisos, con tope', () => {
  const r = resumenPantallaGenerali({
    campos: [{ etiqueta: 'Fecha de nacimiento', tipo: 'text', obligatorio: true, valor: 'vacío' }, { etiqueta: 'Uso del Vehículo', tipo: 'select', obligatorio: false, valor: 'PARTICULAR' }],
    botones: ['Garantías y Resultados'],
    avisos: ['Campo obligatorio'],
  })
  assert.match(r, /2 campos \(1 obligatorios vacíos\): Fecha de nacimiento \[text\*\] = vacío; Uso del Vehículo \[select\] = PARTICULAR \| botones: Garantías y Resultados \| avisos: Campo obligatorio/)
  const largo = resumenPantallaGenerali({ campos: Array.from({ length: 200 }, (_, i) => ({ etiqueta: `Campo ${i}`, tipo: 'text', obligatorio: false, valor: 'vacío' })), botones: [], avisos: [] }, 500)
  assert.ok(largo.length <= 500)
})

test('compuerta de subpestañas: SOLO «Garantías y Resultados» y «Historial Siniestral» exactas; nada con emitir/contratar/grabar/firmar/pagar/aceptar póliza', () => {
  assert.deepEqual([...SUBPESTANAS_GENERALI], ['Garantías y Resultados', 'Historial Siniestral'])  // v0.2.58 añade la pestaña de solo lectura de antecedentes
  assert.equal(subpestanaGeneraliPermitida('Garantías y Resultados'), true)
  assert.equal(subpestanaGeneraliPermitida('  Garantías   y Resultados '), true, 'espacios tolerados')
  for (const t of ['Emitir', 'Emisión', 'Contratar', 'Contratación', 'Grabar póliza', 'Grabar', 'Firmar', 'Pagar', 'Ir al pago', 'Aceptar póliza', 'Aceptar',
    'Garantías y Resultados y emitir', 'Garantías y Resultados - Contratar', 'garantías y resultados', 'Datos de Valoración', 'Garantías', '']) {
    assert.equal(subpestanaGeneraliPermitida(t), false, t)
  }
})

// ───────────────────────── con navegador (fixtures sintéticas) ─────────────────────────

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

const PORTAL = `https://www.generali.es/arq_genernetPortalFormWeb/CorredorPortal.po?mediatorCode=${MEDIADOR_GENERALI}`
const INICIO = 'https://www.generali.es/arq_genernetPortalFormWeb/CorredorInicio.po'

async function abrir(url: string, html: string): Promise<{ page: Page; guard: GuardEmision; cerrar: () => Promise<void> }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.route('https://www.generali.es/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: r.request().url().startsWith(url.split('?')[0]!) ? `<!doctype html><body>${html}</body>` : '<body>otra</body>' }))
  await page.goto(url)
  return { page, guard, cerrar: () => context.close() }
}

const ctxCon = (page: Page, guard: GuardEmision, extra: Partial<ContextoPortal> = {}) => ({
  pausaAccion: async () => {},
  pulsar: (b: Parameters<ContextoPortal['pulsar']>[0]) => pulsar(b, guard),
  log: () => {},
  pulsarSubpestanaGenerali: (t: string) => pulsarSubpestanaGenerali(page, guard, t),
  ...extra,
}) as unknown as ContextoPortal

const valoracion = (verificacion: '' | 'tras-salir' | 'doble') => `<fieldset><legend>Identificación del vehículo</legend>
  <label for="mat">Matrícula</label><input id="mat">
  <span id="hueco"></span>
  ${verificacion === 'doble' ? '<label for="v1">Verificación matrícula</label><input id="v1"><label for="v2">Confirmar matrícula</label><input id="v2">' : ''}
  <label for="uso">Uso del Vehículo</label><select id="uso"><option>Seleccione un uso</option><option>PARTICULAR</option></select>
  <label for="gar">Garaje</label><select id="gar"><option>Garaje colectivo</option><option>Calle</option></select>
  <label for="f1">Fecha 1ª matriculación</label><input id="f1">
</fieldset>
${verificacion === 'tras-salir' ? `<script>document.getElementById('mat').addEventListener('blur', () => setTimeout(() => {
  if (!document.getElementById('v')) document.getElementById('hueco').innerHTML = '<label for="v">Repetir matrícula</label><input id="v">'
}, 300))</script>` : ''}`

test('verificación tras salir del campo: el portal la pinta tarde → el bot espera, la ve y la rellena IGUAL («1234*BCD»)', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, valoracion('tras-salir'))
  try {
    await rellenarValoracionGenerali(page, coche(), ctxCon(page, guard), HOY)
    assert.equal(await page.locator('#mat').inputValue(), '1234*BCD')
    assert.equal(await page.locator('#v').inputValue(), '1234*BCD')
    assert.equal(await page.locator('#uso').inputValue(), 'PARTICULAR')
  } finally {
    await cerrar()
  }
})

test('verificación con DOS candidatos → PARA con error claro y no toca nada más', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, valoracion('doble'))
  try {
    await assert.rejects(rellenarValoracionGenerali(page, coche(), ctxCon(page, guard), HOY), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /2 candidatos/.test(e.message) && e.pideInventarioDom && !/1234/.test(e.message))
    assert.equal(await page.locator('#v1').inputValue(), '')
    assert.equal(await page.locator('#uso').inputValue(), 'Seleccione un uso')
  } finally {
    await cerrar()
  }
})

const PANEL = (resultado: string, extraTab = '') => `<div><span>Datos de Valoración</span>
  <span role="tab" id="tab" onclick="window.__tab=(window.__tab||0)+1;document.getElementById('res').innerHTML=${JSON.stringify(resultado).replace(/"/g, '&quot;')}">Garantías y Resultados</span>${extraTab}</div>
  <div id="panel" style="height:140px;overflow:auto">
    <fieldset><legend>Identificación del vehículo</legend>
      <label for="mat">Matrícula</label><input id="mat" value="SECRETO-MAT">
      <label for="uso">Uso del Vehículo</label><select id="uso"><option>PARTICULAR</option></select>
    </fieldset>
    <fieldset><legend>Roles</legend>
      <label for="fn">Fecha de nacimiento</label><input id="fn" required>
      <label for="fc">Fecha expedición carné</label><input id="fc" value="01/01/2000">
      <label for="aa">Años asegurado</label><input id="aa">
      <label for="cp1">Código postal</label><input id="cp1"><label for="cp2">Código postal</label><input id="cp2">
      <label for="nom">Nombre</label><input id="nom" value="SECRETO-NOMBRE">
    </fieldset>
    <div style="height:700px"></div><div id="fin"></div>
  </div>
  <div id="res"></div>
  <script>document.getElementById('panel').addEventListener('scroll', (e) => { const p = e.target;
    if (p.scrollTop + p.clientHeight >= p.scrollHeight - 5 && !document.getElementById('sin')) document.getElementById('fin').innerHTML = '<label for="sin">Nº siniestros últimos 5 años</label><input id="sin" aria-required="true">' })</script>`

test('scroll del panel + registro: lee los campos que aparecen al bajar (etiqueta, tipo, obligatorio, valor) sin sacar valores de texto', async () => {
  const { page, cerrar } = await abrir(PORTAL, PANEL(''))
  try {
    const antes = await leerPantalla(page)
    assert.ok(!antes.campos.some((c) => /siniestros/i.test(c.etiqueta)), 'antes del scroll no está')
    assert.ok((await recorrerScroll(page, page)) > 0)
    const p = await leerPantalla(page)
    const sin = p.campos.find((c) => /siniestros/i.test(c.etiqueta))
    assert.deepEqual(sin, { etiqueta: 'Nº siniestros últimos 5 años', tipo: 'text', obligatorio: true, valor: 'vacío' })
    assert.deepEqual(p.campos.find((c) => c.etiqueta === 'Fecha de nacimiento'), { etiqueta: 'Fecha de nacimiento', tipo: 'text', obligatorio: true, valor: 'vacío' })
    assert.deepEqual(p.campos.find((c) => c.etiqueta === 'Uso del Vehículo'), { etiqueta: 'Uso del Vehículo', tipo: 'select', obligatorio: false, valor: 'PARTICULAR' })
    assert.ok(p.botones.includes('Garantías y Resultados'))
    assert.ok(!JSON.stringify(p).includes('SECRETO'), 'nunca el valor de un campo de texto')
  } finally {
    await cerrar()
  }
})

test('mapa provisional: rellena SOLO campos de texto vacíos y únicos por etiqueta exacta; no pisa lo que ya tiene valor', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, PANEL(''))
  try {
    await recorrerScroll(page, page)
    const p = await leerPantalla(page)
    const hechos = await rellenarMapaProvisionalGenerali(page, p, { ...coche(), aniosAseguradoAnterior: 10, siniestrosUltimos5Anios: 0 }, ctxCon(page, guard))
    assert.deepEqual(hechos.sort(), ['aniosAsegurado', 'fechaNacimiento', 'siniestros'])
    assert.equal(await page.locator('#fn').inputValue(), '10/03/1985')
    assert.equal(await page.locator('#aa').inputValue(), '10')
    assert.equal(await page.locator('#sin').inputValue(), '0')
    assert.equal(await page.locator('#fc').inputValue(), '01/01/2000', 'con valor: no se pisa')
    assert.equal(await page.locator('#cp1').inputValue(), '', 'etiqueta repetida: no se adivina cuál')
    assert.equal(await page.locator('#cp2').inputValue(), '')
  } finally {
    await cerrar()
  }
})

test('guard · «Garantías y Resultados»: se pulsa por la compuerta UNA vez; un texto peligroso se rechaza sin pulsar', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, PANEL('') + '<button onclick="window.__emitir=1">Emitir</button>')
  try {
    await assert.rejects(pulsarSubpestanaGenerali(page, guard, 'Emitir'), EmisionBloqueadaError)
    await assert.rejects(pulsarSubpestanaGenerali(page, guard, 'Aceptar póliza'), EmisionBloqueadaError)
    assert.equal(await page.evaluate(() => (window as unknown as { __emitir?: number }).__emitir ?? 0), 0)
    await pulsarSubpestanaGenerali(page, guard, SUBPESTANA_PRECIO_GENERALI)
    assert.equal(await page.evaluate(() => (window as unknown as { __tab?: number }).__tab), 1)
    await assert.rejects(pulsarSubpestanaGenerali(page, guard, SUBPESTANA_PRECIO_GENERALI), EmisionBloqueadaError, 'una vez por trabajo')
  } finally {
    await cerrar()
  }
})

test('guard · «Garantías y Resultados»: manejador con verbo de emisión, dos controles o fuera del portal → no se pulsa', async () => {
  const a = await abrir(PORTAL, '<span role="tab" onclick="emitirPoliza();window.__tab=1">Garantías y Resultados</span>')
  try {
    await assert.rejects(pulsarSubpestanaGenerali(a.page, a.guard, SUBPESTANA_PRECIO_GENERALI), EmisionBloqueadaError)
    assert.equal(await a.page.evaluate(() => (window as unknown as { __tab?: number }).__tab ?? 0), 0)
  } finally {
    await a.cerrar()
  }
  const b = await abrir(PORTAL, '<span role="tab" onclick="window.__tab=1">Garantías y Resultados</span><a onclick="window.__tab=2">Garantías y Resultados</a>')
  try {
    await assert.rejects(pulsarSubpestanaGenerali(b.page, b.guard, SUBPESTANA_PRECIO_GENERALI), (e: unknown) => e instanceof ErrorMapaGuardGenerali && /2 controles/.test(e.message))
    assert.equal(await b.page.evaluate(() => (window as unknown as { __tab?: number }).__tab ?? 0), 0)
  } finally {
    await b.cerrar()
  }
  const c = await abrir(INICIO, '<span role="tab" onclick="window.__tab=1">Garantías y Resultados</span>')
  try {
    await assert.rejects(pulsarSubpestanaGenerali(c.page, c.guard, SUBPESTANA_PRECIO_GENERALI), ErrorMapaGuardGenerali)
    assert.equal(await c.page.evaluate(() => (window as unknown as { __tab?: number }).__tab ?? 0), 0)
  } finally {
    await c.cerrar()
  }
})

test('hasta el precio: scroll + mapa + subpestaña por la compuerta + lector → OFERTA con avisos y supuestos declarados', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, PANEL('<table><tr><td>Prima total anual</td><td>1.234,56 €</td></tr><tr><td>Franquicia</td><td>300,00 €</td></tr></table>'))
  try {
    const r = await hastaPrecioGenerali(page, coche(), ['el tomador es el propietario'], ctxCon(page, guard), { esperaPrecioMs: 3_000 })
    assert.equal(r.ofertas.length, 1)
    const o = r.ofertas[0]!
    assert.equal(o.compania, 'generali')
    assert.equal(o.primaAnualEur, 1234.56)
    assert.match(o.avisos.join(' '), /lector tolerante/)
    assert.match(o.avisos.join(' '), /el tomador es el propietario/)
    assert.match(o.avisos.join(' '), /siniestros|años/i, 'antecedentes favorables declarados')
    assert.equal(await page.evaluate(() => (window as unknown as { __tab?: number }).__tab), 1)
  } finally {
    await cerrar()
  }
})

test('hasta el precio: sin importe legible → PARA con el registro de esa pantalla (inventario + HTML los guarda el runner)', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, PANEL('<p>Seleccione las garantías</p><label for="mod">Modalidad</label><select id="mod"><option>TERCEROS</option></select><button>Calcular</button>'))
  try {
    await assert.rejects(hastaPrecioGenerali(page, coche(), [], ctxCon(page, guard), { esperaPrecioMs: 1_500 }), (e: unknown) =>
      e instanceof ErrorMapaIncompletoGenerali && e.pideInventarioDom && /ningún importe legible/.test(e.message) && /Modalidad \[select\] = TERCEROS/.test(e.message) && /Calcular/.test(e.message) && !/SECRETO/.test(e.message))
  } finally {
    await cerrar()
  }
})

test('hasta el precio: varias modalidades con importe → PARA con la lista (no elige una)', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, PANEL('<p>Total Terceros 300,00 €</p><p>Total Todo Riesgo 900,00 €</p>'))
  try {
    await assert.rejects(hastaPrecioGenerali(page, coche(), [], ctxCon(page, guard), { esperaPrecioMs: 2_500 }), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /2 importes candidatos/.test(e.message))
  } finally {
    await cerrar()
  }
})

test('hasta el precio: sin la puerta del guard en el contexto → PARA con el registro de «Datos de Valoración», sin pulsar', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, PANEL('<p>Prima total 500,00 €</p>'))
  try {
    const ctx = ctxCon(page, guard, { pulsarSubpestanaGenerali: undefined })
    await assert.rejects(hastaPrecioGenerali(page, coche(), [], ctx, { esperaPrecioMs: 500 }), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /puerta guardada/.test(e.message) && /Datos de Valoración: \d+ campos/.test(e.message))
    assert.equal(await page.evaluate(() => (window as unknown as { __tab?: number }).__tab ?? 0), 0)
  } finally {
    await cerrar()
  }
})
