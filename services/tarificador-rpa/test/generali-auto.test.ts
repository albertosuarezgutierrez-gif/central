// Generali Turismos (v0.1.1, 18/10/2026). Reglas de Alberto: matrícula con ASTERISCO (y su verificación igual), mediador de la
// correduría EXACTO, vehículo de catálogo confirmado por Allianz/Mapfre casado sin elegir a ciegas, flag APAGADO, y puertas del
// guard para «ACEPTAR» del mediador y el menú EMISIÓN › CONTRATACIÓN. Fixtures SINTÉTICAS (estructura de las capturas 2-6;
// valores de prueba, ningún dato real).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { EmisionBloqueadaError, validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import {
  AVISO_MATRICULA_PROVINCIAL,
  MEDIADOR_GENERALI,
  buscadoEnNivel,
  contieneFrase,
  elegirGarajeGenerali,
  elegirMarcaExactaGenerali,
  elegirOpcionCatalogo,
  elegirUsoGenerali,
  esEtiquetaVerificacionMatricula,
  fechaGenerali,
  matriculaGenerali,
  mensajeAtascoCatalogo,
  normalizarCatalogo,
  opcionMediadorGenerali,
  rolesGenerali,
  urlConMediador,
  vehiculoBuscadoGenerali,
} from '../src/adapters/generali/reglas.ts'
import { ErrorMapaIncompletoGenerali, GENERALI_AUTO_ACTIVO, VERSION_GENERALI_AUTO, elegirMediadorGenerali, generaliAuto, menuPrimeFaces, rellenarValoracionGenerali, seleccionarVehiculoGenerali } from '../src/adapters/generali/auto.ts'
import { adaptadores } from '../src/adapters/index.ts'
import { ErrorMapaGuardGenerali, abrirDesplegableMarcaGenerali, elegirMarcaListaGenerali, botonSelectorVehiculosGeneraliPermitido, cerrarAvisoSabiasQueGenerali, marcarPlacasEspecialesGenerali, pulsarConfirmarVehiculoGenerali, urlSelectorVehiculosGenerali, pulsarMediadorGenerali, entrarTurismosGenerali, instalarGuardEmision, MENU_TURISMOS_GENERALI, type GuardEmision } from '../src/guard.ts'
import { ErrorTarificador } from '../src/errores.ts'
import { prepararTrabajo, type AdaptadorRegistrado } from '../src/ramo.ts'
import { vehiculoDelResultado } from '../src/api.ts'
import { ErrorEleccionVersion } from '../src/adapters/allianz/auto.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

const HOY = new Date()

// ───────────────────────── reglas puras ─────────────────────────

test('matrícula: actual → «1234*BCD» (con espacios, guiones o minúsculas); la verificación usa el mismo valor', () => {
  assert.deepEqual(matriculaGenerali('1234BCD'), { ok: true, valor: '1234*BCD', formato: 'actual' })
  assert.deepEqual(matriculaGenerali(' 1234-bcd '), { ok: true, valor: '1234*BCD', formato: 'actual' })
  assert.deepEqual(matriculaGenerali('1234 BCD'), { ok: true, valor: '1234*BCD', formato: 'actual' })
  assert.deepEqual(matriculaGenerali('1234*BCD'), { ok: true, valor: '1234*BCD', formato: 'actual' }, 'idempotente')
})

test('matrícula provincial antigua: asterisco en cada cambio cifra/letra y marcada como provincial (se declara)', () => {
  assert.deepEqual(matriculaGenerali('SE1234AB'), { ok: true, valor: 'SE*1234*AB', formato: 'provincial' })
  assert.deepEqual(matriculaGenerali('M-1234-Z'), { ok: true, valor: 'M*1234*Z', formato: 'provincial' })
  assert.deepEqual(matriculaGenerali('B1234'), { ok: true, valor: 'B*1234', formato: 'provincial' })
  assert.ok(!/1234|SE|AB/.test(AVISO_MATRICULA_PROVINCIAL), 'el aviso no lleva la matrícula')
})

test('matrícula que no encaja → error de DATOS sin repetir la matrícula (nunca se inventa)', () => {
  for (const m of ['', 'C1234BCD', '1234BAE', '123456', 'M123456', 'XX1234AB', '12345BCD', '1234BCDF', 'ABC']) {
    const r = matriculaGenerali(m)
    assert.equal(r.ok, false, m)
    if (!r.ok && m) assert.ok(!r.motivo.includes(m), `el motivo no repite «${m}»`)
  }
})

test('mediador: casa EXACTO por código (valor o «65792 - …»); 0 o varios → no se elige', () => {
  assert.equal(MEDIADOR_GENERALI, '65792')
  const op = (valor: string, texto: string) => ({ valor, texto })
  assert.deepEqual(opcionMediadorGenerali([op('', 'Seleccionar...'), op('11111', '11111 - OTRO'), op('65792', '65792 - CORREDURIA')]), { tipo: 'unica', indice: 2 })
  assert.deepEqual(opcionMediadorGenerali([op('x1', '65792 - CORREDURIA'), op('x2', '657921 - OTRO')]), { tipo: 'unica', indice: 0 }, '657921 no es 65792')
  assert.deepEqual(opcionMediadorGenerali([op('', 'Seleccionar...'), op('1', '165792 - OTRO')]), { tipo: 'ninguna' })
  assert.deepEqual(opcionMediadorGenerali([op('65792', 'A'), op('z', '65792 - B')]), { tipo: 'varias', n: 2 })
  assert.equal(urlConMediador(`https://www.generali.es/arq_genernetPortalFormWeb/CorredorPortal.po?mediatorCode=${MEDIADOR_GENERALI}#`), true)
  assert.equal(urlConMediador('https://www.generali.es/arq_genernetPortalFormWeb/CorredorPortal.po?mediatorCode=11111'), false)
  assert.equal(urlConMediador('https://www.generali.es/arq_genernetPortalFormWeb/CorredorInicio.po'), null)
})

test('catálogo: exacto normalizado → dato; contención por palabra entera única → similitud; 0 o varios → no elige', () => {
  const marcas = ['Seleccione una', 'SEAT', 'SEAT SPORT', 'Citroën', 'VOLKSWAGEN']
  assert.deepEqual(elegirOpcionCatalogo(marcas, 'seat'), { tipo: 'unica', indice: 1, porSimilitud: false })
  assert.deepEqual(elegirOpcionCatalogo(marcas, 'CITROEN'), { tipo: 'unica', indice: 3, porSimilitud: false }, 'sin tildes ni mayúsculas')
  assert.deepEqual(elegirOpcionCatalogo(marcas, 'VOLKSWAGEN AG'), { tipo: 'unica', indice: 4, porSimilitud: true })
  assert.deepEqual(elegirOpcionCatalogo(['IBIZA', 'IBIZA ST', 'LEON'], 'IBIZA ST 1.0'), { tipo: 'varias', indices: [0, 1] }, 'IBIZA e IBIZA ST están las dos dentro: atasco')
})

test('catálogo: «IBIZA» buscando «IBIZA 1.0» casa con IBIZA e IBIZA ST no (palabra entera, no prefijo)', () => {
  assert.deepEqual(elegirOpcionCatalogo(['IBIZA', 'IBIZA ST', 'LEON'], 'IBIZA 1.0'), { tipo: 'unica', indice: 0, porSimilitud: true })
  assert.deepEqual(elegirOpcionCatalogo(['GOLF', 'GOLF VARIANT'], 'GOLF VARIANT 1.5 TSI'), { tipo: 'varias', indices: [0, 1] }, 'varias → atasco, nunca la más larga')
  assert.deepEqual(elegirOpcionCatalogo(['POLO', 'GOLF'], 'PASSAT'), { tipo: 'ninguna' })
  assert.deepEqual(elegirOpcionCatalogo(['SEAT', 'SEAT'], 'SEAT'), { tipo: 'varias', indices: [0, 1] })
  assert.equal(contieneFrase('IBIZASTYLE 1.0', 'IBIZA'), false, 'palabra entera')
  assert.equal(normalizarCatalogo(' 1,5  tsi-Évo '), '1.5 TSI EVO')
})

test('catálogo con la denominación de Mapfre: solo «la denominación contiene la opción», siempre por similitud', () => {
  const den = 'VOLKSWAGEN GOLF 1.5 TSI EVO'
  assert.deepEqual(elegirOpcionCatalogo(['SEAT', 'VOLKSWAGEN', 'VOLVO'], den, 'denominacion'), { tipo: 'unica', indice: 1, porSimilitud: true })
  assert.deepEqual(elegirOpcionCatalogo(['VOLKSWAGEN'], 'VOLKSWAGEN', 'denominacion'), { tipo: 'unica', indice: 0, porSimilitud: true })
  assert.deepEqual(elegirOpcionCatalogo(['GOLF 1.5 TSI EVO 150CV'], den, 'denominacion'), { tipo: 'ninguna' }, 'la opción más larga que la denominación no casa en este modo')
})

test('vehículo buscado: manda el separado (Allianz/seleccionVehiculo); si no, la denominación de Mapfre; sin nada, null', () => {
  const den = { origen: 'mapfre' as const, denominacion: 'SEAT IBIZA 1.0 TSI', cv: 95, cc: 999, puertas: 5, fechaInicio: null }
  assert.deepEqual(vehiculoBuscadoGenerali({ seleccionVehiculo: { marca: 'SEAT', modelo: 'IBIZA', descripcion: '1.0 TSI' }, vehiculoConfirmado: den }), { tipo: 'separado', marca: 'SEAT', modelo: 'IBIZA', version: '1.0 TSI' })
  assert.deepEqual(vehiculoBuscadoGenerali({ seleccionVehiculo: null, vehiculoConfirmado: den }), { tipo: 'denominacion', denominacion: 'SEAT IBIZA 1.0 TSI' })
  assert.equal(vehiculoBuscadoGenerali({ seleccionVehiculo: { marca: 'SEAT', modelo: ' ' }, vehiculoConfirmado: null }), null)
  assert.deepEqual(buscadoEnNivel({ tipo: 'separado', marca: 'A', modelo: 'B', version: null }, 'version'), null)
  assert.deepEqual(buscadoEnNivel({ tipo: 'denominacion', denominacion: 'X Y' }, 'modelo'), { texto: 'X Y', modo: 'denominacion' })
})

test('mensaje de atasco del catálogo: opciones (catálogo) y nunca más de 25', () => {
  const ops = Array.from({ length: 40 }, (_, i) => `MARCA${i}`)
  const m = mensajeAtascoCatalogo('marca', 'NINGUNA', ops, { tipo: 'ninguna' })
  assert.match(m, /ninguna opción casa/)
  assert.equal((m.match(/MARCA\d+/g) ?? []).length, 25)
})

test('Datos de Valoración: verificación de matrícula, uso particular, garaje, fecha y roles', () => {
  assert.ok(esEtiquetaVerificacionMatricula('Verificación matrícula'))
  assert.ok(esEtiquetaVerificacionMatricula('Repetir Matrícula'))
  assert.ok(!esEtiquetaVerificacionMatricula('Matrícula'))
  assert.ok(!esEtiquetaVerificacionMatricula('Fecha Matriculación'))
  assert.deepEqual(elegirUsoGenerali(['Seleccione un uso', 'PARTICULAR', 'ALQUILER SIN CONDUCTOR', 'TAXI'], 'particular'), { tipo: 'unica', indice: 1, porSimilitud: false })
  assert.deepEqual(elegirUsoGenerali(['PARTICULAR', 'PARTICULAR CON ALQUILER'], null), { tipo: 'unica', indice: 0, porSimilitud: false })
  assert.equal(elegirUsoGenerali(['PARTICULAR'], 'profesional').tipo, 'ninguna', 'otro uso: sin mapa')
  assert.deepEqual(elegirGarajeGenerali(['Garaje colectivo', 'Garaje individual', 'Calle'], 'colectivo'), { tipo: 'unica', indice: 0, porSimilitud: false })
  assert.deepEqual(elegirGarajeGenerali(['Garaje colectivo', 'Garaje individual', 'Calle'], 'calle'), { tipo: 'unica', indice: 2, porSimilitud: false })
  assert.equal(fechaGenerali('2015-03-09'), '09/03/2015')
  assert.equal(fechaGenerali(null), null)
  assert.deepEqual(rolesGenerali({ tomadorEsPropietario: true, tomadorEsConductor: true }), { ok: true, supuestos: [] })
  assert.deepEqual(rolesGenerali({ tomadorEsPropietario: null, tomadorEsConductor: null }), { ok: true, supuestos: ['el tomador es el propietario', 'conductor habitual: el tomador (supuesto)'] })
  assert.equal(rolesGenerali({ tomadorEsPropietario: false, tomadorEsConductor: true }).ok, false)
  assert.equal(rolesGenerali({ tomadorEsPropietario: true, tomadorEsConductor: false }).ok, false)
})

// ───────────────────────── registro, flag y datos previos ─────────────────────────

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

test('flag GENERALI_AUTO_ACTIVO ENCENDIDO (Alberto, 18/10/2026): la imagen registra Generali; la puerta de BD sigue siendo la fila de integración', () => {
  assert.equal(GENERALI_AUTO_ACTIVO, true)
  assert.equal(adaptadores.obtener('generali', 'auto'), generaliAuto)
  assert.equal(generaliAuto.version, '0.2.8')
  assert.equal(VERSION_GENERALI_AUTO, '0.2.8')
  assert.equal(generaliAuto.credencial, 'GENERALI_MEDIADORES')
  assert.equal(generaliAuto.ramo, 'auto', 'solo turismos')
})

test('prepararTrabajo: Generali sin vehículo confirmado no arranca; con él, sí', () => {
  const a = generaliAuto as unknown as AdaptadorRegistrado
  const sin = { ...coche(), seleccionVehiculo: null }
  const r = prepararTrabajo(a, sin, HOY)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.errores.join(' '), /confirmados por Allianz o Mapfre/)
  assert.equal(prepararTrabajo(a, coche(), HOY).ok, true)
  assert.equal(prepararTrabajo(a, { ...sin, vehiculoConfirmado: { origen: 'mapfre', denominacion: 'SEAT IBIZA 1.0 TSI', cv: 95, cc: 999, puertas: 5, fechaInicio: null } }, HOY).ok, true)
})

test('tarificar: matrícula sin formato o sin vehículo → `datos` ANTES de abrir el portal (la página ni se toca)', async () => {
  const pagina = new Proxy({}, { get: () => { throw new Error('la página no se toca') } }) as unknown as Page
  const ctx = { confirmarMediadorGenerali: async () => {}, entrarTurismosGenerali: async () => {} } as unknown as ContextoPortal
  await assert.rejects(generaliAuto.tarificar(pagina, { ...coche(), matricula: 'C1234BCD' }, ctx), (e: unknown) => e instanceof ErrorTarificador && e.tipo === 'datos')
  await assert.rejects(generaliAuto.tarificar(pagina, { ...coche(), seleccionVehiculo: null }, ctx), (e: unknown) => e instanceof ErrorTarificador && e.tipo === 'datos' && /vehículo confirmado/.test(e.message))
  await assert.rejects(generaliAuto.tarificar(pagina, { ...coche(), ramo: 'moto' }, ctx), (e: unknown) => e instanceof ErrorTarificador && e.tipo === 'datos')
})

test('resultado ok: viaja el vehículo de catálogo (sin vacíos); nada si no lo hay', () => {
  assert.deepEqual(vehiculoDelResultado({}), {})
  assert.deepEqual(vehiculoDelResultado({ seleccionVehiculo: { marca: ' SEAT ', modelo: 'IBIZA', descripcion: ' ' } }), { seleccionVehiculo: { marca: 'SEAT', modelo: 'IBIZA' } })
  assert.deepEqual(vehiculoDelResultado({ seleccionVehiculo: { marca: 'SEAT', modelo: '' } }), {})
  const vc = { origen: 'mapfre' as const, denominacion: 'SEAT IBIZA', cv: null, cc: null, puertas: null, fechaInicio: null }
  assert.deepEqual(vehiculoDelResultado({ vehiculoConfirmado: vc }), { vehiculoConfirmado: vc })
})

test('cepo de forma: el adaptador no nombra el botón del mediador ni el menú de emisión (eso solo vive en guard.ts)', () => {
  const src = readFileSync(new URL('../src/adapters/generali/auto.ts', import.meta.url), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
  assert.ok(!/aceptar|emisi[oó]n|contrataci|\.click\(/i.test(src), 'generali/auto.ts no puede nombrar ACEPTAR/EMISIÓN/CONTRATACIÓN ni hacer click')
  assert.deepEqual([...MENU_TURISMOS_GENERALI], ['NEGOCIO', 'EMISIÓN', 'CONTRATACIÓN', 'AUTOMÓVILES', 'TURISMOS (RAMO UV)'])
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

const INICIO = 'https://www.generali.es/arq_genernetPortalFormWeb/CorredorInicio.po'
const PORTAL = `https://www.generali.es/arq_genernetPortalFormWeb/CorredorPortal.po?mediatorCode=${MEDIADOR_GENERALI}`

/** Página en `url` con `html`, servida por la propia prueba (sin red), con el guard de emisión instalado. */
async function abrir(url: string, html: string): Promise<{ page: Page; guard: GuardEmision; cerrar: () => Promise<void> }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.route('https://www.generali.es/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: r.request().url().startsWith(url.split('?')[0]!) ? `<!doctype html><body>${html}</body>` : '<body>otra</body>' }))
  await page.goto(url)
  return { page, guard, cerrar: () => context.close() }
}

const MEDIADOR_HTML = (opciones: string) => `<h3>SELECCIONAR MEDIADOR</h3>
  <label for="t">Territorial</label><select id="t"><option>08 - SUROESTE/CANARIAS</option></select>
  <label for="m">Mediador</label><select id="m"><option value="">Seleccionar...</option>${opciones}</select>
  <button onclick="window.__aceptado=(window.__aceptado||0)+1">ACEPTAR</button>`

test('guard · ACEPTAR del mediador: solo con el mediador de la correduría puesto, y una vez', async () => {
  const { page, guard, cerrar } = await abrir(INICIO, MEDIADOR_HTML(`<option value="11111">11111 - OTRO</option><option value="${MEDIADOR_GENERALI}">${MEDIADOR_GENERALI} - PRUEBA</option>`))
  try {
    const sel = page.locator('#m')
    await assert.rejects(pulsarMediadorGenerali(page, guard, sel), EmisionBloqueadaError, 'sin mediador elegido no se acepta')
    await sel.selectOption('11111')
    await assert.rejects(pulsarMediadorGenerali(page, guard, sel), EmisionBloqueadaError, 'otro mediador no se acepta')
    assert.equal(await page.evaluate(() => (window as unknown as { __aceptado?: number }).__aceptado ?? 0), 0)
    await sel.selectOption(MEDIADOR_GENERALI)
    await pulsarMediadorGenerali(page, guard, sel)
    assert.equal(await page.evaluate(() => (window as unknown as { __aceptado?: number }).__aceptado), 1)
    await assert.rejects(pulsarMediadorGenerali(page, guard, sel), EmisionBloqueadaError, 'una sola vez por trabajo')
  } finally {
    await cerrar()
  }
})

test('adaptador · mediador: elige el de la correduría en la cascada y pasa por la puerta del guard; si no está, PARA sin pulsar', async () => {
  const llamadas: string[] = []
  const ctxCon = (page: Page, guard: GuardEmision) => ({
    pausaAccion: async () => {},
    confirmarMediadorGenerali: async (s: Parameters<NonNullable<ContextoPortal['confirmarMediadorGenerali']>>[0]) => { llamadas.push('aceptar'); await pulsarMediadorGenerali(page, guard, s) },
  }) as unknown as ContextoPortal
  const a = await abrir(INICIO, MEDIADOR_HTML(`<option value="${MEDIADOR_GENERALI}">${MEDIADOR_GENERALI} - PRUEBA</option>`))
  try {
    // La fixture no navega al portal: tras el ACEPTAR, el adaptador espera la URL con el mediador y para (hueco), pero ya aceptó UNA vez.
    await assert.rejects(elegirMediadorGenerali(a.page, ctxCon(a.page, a.guard), { esperaMs: 1_500, pausaMs: 150 }), ErrorMapaIncompletoGenerali)
    assert.deepEqual(llamadas, ['aceptar'])
    assert.equal(await a.page.locator('#m').inputValue(), MEDIADOR_GENERALI)
  } finally {
    await a.cerrar()
  }
  llamadas.length = 0
  const b = await abrir(INICIO, MEDIADOR_HTML('<option value="11111">11111 - OTRO</option>'))
  try {
    await assert.rejects(elegirMediadorGenerali(b.page, ctxCon(b.page, b.guard), { esperaMs: 1_500, pausaMs: 150 }), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /no aparece/.test(e.message) && !/OTRO/.test(e.message))
    assert.deepEqual(llamadas, [], 'sin el mediador no se pulsa nada')
  } finally {
    await b.cerrar()
  }
})

const MENU_HTML = (hrefTurismos: string) => `<style>.sub{display:none} li:hover>.sub{display:block}</style>
  <nav><ul><li><span>NEGOCIO</span><ul class="sub">
    <li><span>EMISIÓN</span><ul class="sub"><li><span>CONTRATACIÓN</span><ul class="sub"><li><span>AUTOMÓVILES</span><ul class="sub">
      <li><a href="${hrefTurismos}" onclick="window.__turismos=1;return false">TURISMOS (RAMO UV)</a></li>
      <li><a href="#uy" onclick="window.__otro=1;return false">VEHÍCULOS COMERCIALES Y RESTO (RAMO UY)</a></li>
    </ul></li><li><a href="#" onclick="window.__otro=1">ALTA DE PÓLIZA</a></li></ul></li></ul></li>
    <li><span>EMISIÓN (NUEVO)</span></li>
  </ul></li></ul></nav>`

test('guard · menú de Turismos: sobrevuela NEGOCIO › EMISIÓN › CONTRATACIÓN › AUTOMÓVILES y pulsa SOLO «TURISMOS (RAMO UV)»', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, MENU_HTML('#uv'))
  try {
    await entrarTurismosGenerali(page, guard, 500)
    assert.equal(await page.evaluate(() => (window as unknown as { __turismos?: number }).__turismos), 1)
    assert.equal(await page.evaluate(() => (window as unknown as { __otro?: number }).__otro ?? 0), 0)
    await assert.rejects(entrarTurismosGenerali(page, guard), EmisionBloqueadaError, 'una sola vez por trabajo')
  } finally {
    await cerrar()
  }
})

test('guard · menú de Turismos: si el enlace de TURISMOS lleva un VERBO de emisión en el href («contratar», «emitir»), se BLOQUEA sin pulsar (fail-closed; «contratación» como sustantivo pasa desde v0.1.1, ver generali-red-turismos.test.ts)', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, MENU_HTML('/contratacion/contratarTurismos'))
  try {
    await assert.rejects(entrarTurismosGenerali(page, guard, 500), EmisionBloqueadaError)
    assert.equal(await page.evaluate(() => (window as unknown as { __turismos?: number }).__turismos ?? 0), 0)
  } finally {
    await cerrar()
  }
})

test('guard · menú de Turismos: fuera de CorredorPortal.po no hace nada (hueco con inventario)', async () => {
  const { page, guard, cerrar } = await abrir(INICIO, MENU_HTML('#uv'))
  try {
    await assert.rejects(entrarTurismosGenerali(page, guard), (e: unknown) => e instanceof ErrorTarificador && (e as { pideInventarioDom?: boolean }).pideInventarioDom === true)
    assert.equal(await page.evaluate(() => (window as unknown as { __turismos?: number }).__turismos ?? 0), 0)
  } finally {
    await cerrar()
  }
})

const ctxSimple = (page: Page, guard: GuardEmision) => ({
  pausaAccion: async () => {},
  pulsar: async (b: Parameters<ContextoPortal['pulsar']>[0]) => { const { pulsar } = await import('../src/guard.ts'); await pulsar(b, guard) },
  log: () => {},
}) as unknown as ContextoPortal

const VALORACION_HTML = (verif: boolean) => `<fieldset><legend>Identificación del vehículo</legend>
  <label for="mat">Matrícula</label><input id="mat">
  ${verif ? '<label for="mat2">Verificación matrícula</label><input id="mat2">' : ''}
  <label for="uso">Uso del Vehículo</label><select id="uso"><option>Seleccione un uso</option><option>PARTICULAR</option><option>TAXI</option></select>
  <label for="gar">Garaje</label><select id="gar"><option>Garaje colectivo</option><option>Garaje individual</option><option>Calle</option></select>
  <label for="f1">Fecha 1ª matriculación</label><input id="f1">
</fieldset>`

test('Datos de Valoración: matrícula «1234*BCD» en el campo Y en su verificación; uso particular; supuestos declarados', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, VALORACION_HTML(true))
  try {
    const sup = await rellenarValoracionGenerali(page, coche({ tomadorEsPropietario: null }), ctxSimple(page, guard), HOY)
    assert.equal(await page.locator('#mat').inputValue(), '1234*BCD')
    assert.equal(await page.locator('#mat2').inputValue(), '1234*BCD')
    assert.equal(await page.locator('#uso').inputValue(), 'PARTICULAR')
    assert.equal(await page.locator('#f1').inputValue(), '02/05/2019')
    assert.ok(sup.includes('garaje colectivo'), 'garaje sin dato: supuesto declarado')
    assert.ok(sup.includes('el tomador es el propietario'))
  } finally {
    await cerrar()
  }
})

test('Datos de Valoración: sin el campo de verificación de la matrícula (captura 6) → v0.2.0 SIGUE y rellena el resto', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, VALORACION_HTML(false))
  try {
    await rellenarValoracionGenerali(page, coche(), ctxSimple(page, guard), HOY)
    assert.equal(await page.locator('#mat').inputValue(), '1234*BCD')
    assert.equal(await page.locator('#uso').inputValue(), 'PARTICULAR')
    assert.equal(await page.locator('#f1').inputValue(), '02/05/2019')
  } finally {
    await cerrar()
  }
})

const SELECTOR_HTML = (marcas: string[], conModelo: boolean) => `<button onclick="document.getElementById('sel').style.display='block'">Vehículo</button>
  <div id="sel" style="display:none"><h2>Selector de vehículos</h2>
  <label for="tm">Todas las marcas</label><select id="tm"><option>Seleccione una</option>${marcas.map((m) => `<option>${m}</option>`).join('')}</select>
  ${conModelo ? '<label>Modelo</label><select id="mo"><option>Seleccione uno</option><option>IBIZA</option><option>IBIZA ST</option></select><label>Versión</label><select id="ve"><option>1.0 TSI STYLE</option><option>1.0 TSI FR</option></select>' : ''}
  </div>`

test('selector de vehículos: marca exacta y, sin captura de lo que sigue, PARA con inventario', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, SELECTOR_HTML(['SEAT', 'SKODA'], false))
  try {
    await assert.rejects(seleccionarVehiculoGenerali(page, page, coche(), ctxSimple(page, guard)), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /SIN CAPTURA/.test(e.message))
    assert.equal(await page.locator('#tm').inputValue(), 'SEAT')
  } finally {
    await cerrar()
  }
})

test('selector de vehículos: dos marcas casan → atasco con las opciones, sin elegir ninguna', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, SELECTOR_HTML(['SEAT', 'SEAT'], false))
  try {
    await assert.rejects(seleccionarVehiculoGenerali(page, page, coche(), ctxSimple(page, guard)), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /2 opciones casan/.test(e.message))
    assert.equal(await page.locator('#tm').inputValue(), 'Seleccione una')
  } finally {
    await cerrar()
  }
})

test('selector de vehículos: modelo exacto y versión de la oportunidad; sin versión confirmada y varias → elige una persona', async () => {
  const a = await abrir(PORTAL, SELECTOR_HTML(['SEAT'], true))
  try {
    // Llega a la versión y para porque la fixture no lleva a «Identificación del vehículo» (paso sin captura).
    await assert.rejects(seleccionarVehiculoGenerali(a.page, a.page, coche(), ctxSimple(a.page, a.guard)), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /cómo se confirma/.test(e.message))
    assert.equal(await a.page.locator('#mo').inputValue(), 'IBIZA')
    assert.equal(await a.page.locator('#ve').inputValue(), '1.0 TSI STYLE')
  } finally {
    await a.cerrar()
  }
  const b = await abrir(PORTAL, SELECTOR_HTML(['SEAT'], true))
  try {
    const sinVersion = coche({ seleccionVehiculo: { marca: 'SEAT', modelo: 'IBIZA' } })
    await assert.rejects(seleccionarVehiculoGenerali(b.page, b.page, sinVersion, ctxSimple(b.page, b.guard)), (e: unknown) => e instanceof ErrorEleccionVersion && e.opcionesVersion.length === 2)
  } finally {
    await b.cerrar()
  }
})

// ───────────── v0.2.4: modal «¿Sabías qué…?» del portal (inventario real: span#closeModalSabiasQueIntro role=button «×») ─────────────

const MODAL_SABIAS = (cierre = '<span id="closeModalSabiasQueIntro" role="button" aria-label="Cerrar" onclick="document.getElementById(\'m\').remove();window.__cerrado=1">×</span>') =>
  `<h1>Portal del Corredor</h1><div id="m" class="modal in" style="display:block"><h4>¿Sabías qué...?</h4>${cierre}<p>vídeo</p></div><a>NEGOCIO</a>`

test('v0.2.4 · modal «¿Sabías qué…?»: se cierra por la compuerta (una vez) y no se toca nada más', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, MODAL_SABIAS())
  try {
    assert.equal(await cerrarAvisoSabiasQueGenerali(page, guard), 'cerrado')
    assert.equal(await page.evaluate(() => (window as unknown as { __cerrado?: number }).__cerrado), 1)
    assert.equal(guard.violacion(), null)
    assert.equal(await cerrarAvisoSabiasQueGenerali(page, guard), 'sin_aviso', 'una vez por trabajo: la segunda no hace nada')
  } finally {
    await cerrar()
  }
})

test('v0.2.4 · modal «¿Sabías qué…?»: sin modal no hace nada y no es error', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, '<h1>Portal del Corredor</h1><a>NEGOCIO</a>')
  try {
    assert.equal(await cerrarAvisoSabiasQueGenerali(page, guard, 0), 'sin_aviso')
  } finally {
    await cerrar()
  }
})

test('v0.2.4 · modal «¿Sabías qué…?»: fail-closed (fuera del portal, dos cierres, o un control que no es un cierre → no se pulsa)', async () => {
  const fuera = await abrir(INICIO, MODAL_SABIAS())
  try {
    assert.equal(await cerrarAvisoSabiasQueGenerali(fuera.page, fuera.guard, 0), 'sin_aviso', 'fuera de CorredorPortal.po no se pulsa')
    assert.equal(await fuera.page.evaluate(() => (window as unknown as { __cerrado?: number }).__cerrado ?? 0), 0)
  } finally {
    await fuera.cerrar()
  }
  const malos = [
    MODAL_SABIAS('<span id="closeModalSabiasQueIntro" role="button" onclick="window.__cerrado=1">Aceptar</span>'),
    MODAL_SABIAS('<span id="closeModalSabiasQueIntro" role="button" onclick="window.__cerrado=1">×</span><span id="closeModalSabiasQueIntro" role="button" onclick="window.__cerrado=1">×</span>'),
    MODAL_SABIAS('<span id="closeModalSabiasQueIntro" role="button" onclick="window.__cerrado=1;emitirPoliza()">×</span>'),
  ]
  for (const html of malos) {
    const p = await abrir(PORTAL, html)
    try {
      await assert.rejects(cerrarAvisoSabiasQueGenerali(p.page, p.guard), (e: unknown) => e instanceof ErrorTarificador || e instanceof EmisionBloqueadaError)
      assert.equal(await p.page.evaluate(() => (window as unknown as { __cerrado?: number }).__cerrado ?? 0), 0)
    } finally {
      await p.cerrar()
    }
  }
})

// ───────────── v0.2.5 (prueba real c8838c26): el overlay `div.modalOverlay#modalSabiasQueIntro` llega TARDE y tapa el menú ─────────────

/** Overlay real (inventario de la prueba): capa fija a pantalla completa, id `modalSabiasQueIntro`, con el «×» `#closeModalSabiasQueIntro`. */
const OVERLAY_SABIAS = `<div class="modalOverlay" id="modalSabiasQueIntro" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:rgba(0,0,0,.5)"><div style="background:#fff;margin:40px"><h4>¿Sabías qué...?</h4><span id="closeModalSabiasQueIntro" role="button" aria-label="Cerrar" onclick="document.getElementById('modalSabiasQueIntro').remove();window.__cerrado=1">×</span></div></div>`
const TARDE = (ms: number) => `<script>setTimeout(function(){document.body.insertAdjacentHTML('beforeend', ${JSON.stringify(OVERLAY_SABIAS)})}, ${ms})</script>`

test('v0.2.5 · el aviso que aparece DESPUÉS de llegar al portal se espera y se cierra por la compuerta', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, `<h1>Portal del Corredor</h1><a>NEGOCIO</a>${TARDE(1200)}`)
  try {
    assert.equal(await page.locator('#modalSabiasQueIntro').count(), 0, 'al empezar aún no está')
    assert.equal(await cerrarAvisoSabiasQueGenerali(page, guard), 'cerrado')
    assert.equal(await page.locator('#modalSabiasQueIntro').count(), 0)
    assert.equal(guard.violacion(), null)
  } finally {
    await cerrar()
  }
})

test('v0.2.5 · el menú no se sobrevuela con el overlay encima: entrarTurismosGenerali lo cierra antes (si no lo cerró nadie)', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, MENU_HTML('#uv') + OVERLAY_SABIAS)
  try {
    await entrarTurismosGenerali(page, guard, 500)
    assert.equal(await page.evaluate(() => (window as unknown as { __cerrado?: number }).__cerrado), 1)
    assert.equal(await page.evaluate(() => (window as unknown as { __turismos?: number }).__turismos), 1)
    assert.equal(guard.violacion(), null)
  } finally {
    await cerrar()
  }
})

// Menú Bootstrap real: toggle `<a href="#" class="dropdown-toggle disabled" data-hover="dropdown">`; aquí SOLO se abre con clic.
const MENU_CLIC_HTML = `<style>.sub{display:none} .abierto>.sub{display:block}</style>
  <nav><ul>
  <li id="n0"><a href="#" class="dropdown-toggle disabled" data-hover="dropdown" data-toggle="dropdown" onclick="this.parentNode.classList.add('abierto');return false">Negocio</a><ul class="sub">
    <li id="n1"><a href="#" onclick="this.parentNode.classList.add('abierto');return false">EMISIÓN</a><ul class="sub">
    <li id="n2"><a href="#" onclick="this.parentNode.classList.add('abierto');return false">CONTRATACIÓN</a><ul class="sub">
    <li id="n3"><a href="#" onclick="this.parentNode.classList.add('abierto');return false">AUTOMÓVILES</a><ul class="sub">
      <li><a href="#uv" onclick="window.__turismos=1;return false">TURISMOS (RAMO UV)</a></li>
      <li><a href="#uy" onclick="window.__otro=1;return false">VEHÍCULOS COMERCIALES Y RESTO (RAMO UY)</a></li>
    </ul></li></ul></li></ul></li></ul></li></ul></nav>`

test('v0.2.5 · si el sobrevuelo no despliega el menú, se pulsa el toggle del nivel (compuerta) y solo ese; nunca otra opción', async () => {
  const { page, guard, cerrar } = await abrir(PORTAL, MENU_CLIC_HTML)
  try {
    await entrarTurismosGenerali(page, guard, 500)
    assert.equal(await page.evaluate(() => (window as unknown as { __turismos?: number }).__turismos), 1)
    assert.equal(await page.evaluate(() => (window as unknown as { __otro?: number }).__otro ?? 0), 0)
    assert.equal(guard.violacion(), null)
  } finally {
    await cerrar()
  }
})

test('v0.2.5 · menú que no se despliega ni con clic → hueco con inventario, sin pulsar TURISMOS', async () => {
  const roto = MENU_CLIC_HTML.replace(/this\.parentNode\.classList\.add\('abierto'\);/g, '')
  const { page, guard, cerrar } = await abrir(PORTAL, roto)
  try {
    await assert.rejects(entrarTurismosGenerali(page, guard, 500), (e: unknown) => e instanceof ErrorTarificador && (e as { pideInventarioDom?: boolean }).pideInventarioDom === true)
    assert.equal(await page.evaluate(() => (window as unknown as { __turismos?: number }).__turismos ?? 0), 0)
  } finally {
    await cerrar()
  }
})

// ───────────── v0.2.6: «Selector de vehículos» PrimeFaces (marco `selVehiculo`; select OCULTO + div combobox) ─────────────

const SEL_VEHICULOS = 'https://www.generali.es/mot_motorWeb/mvc/selVehiculo'

/** Estructura del inventario real (ids `buscamarca*`, `placaesp:0/1`, `#cancelar`/`#confirmar`); marcas y valores de prueba. */
const PRIMEFACES_HTML = (marcas: string[], boton = 'Confirmar') => `<button type="button">Vehículo</button><h2>Selector de vehículos</h2>
  <span>Placas especiales</span>
  <table><tr><td><input type="radio" id="placaesp:0" name="placaesp" value="S" style="position:absolute;left:-999px"><label for="placaesp:0">Sí</label></td>
  <td><input type="radio" id="placaesp:1" name="placaesp" value="N" style="position:absolute;left:-999px"><label for="placaesp:1">No</label></td></tr></table>
  <span>Principales marcas</span>
  <span>Todas las marcas</span>
  <div id="buscamarca" role="combobox" tabindex="0" onclick="document.getElementById('buscamarca_panel').style.display='block'"><div class="ui-helper-hidden-accessible" style="position:absolute;width:0;height:0;overflow:hidden"><select id="buscamarca_input" name="buscamarca_input" style="width:0;height:0;border:0;padding:0"><option value="null">Seleccione una</option>${marcas.map((m, i) => `<option value="${i}">${m}</option>`).join('')}</select></div><label id="buscamarca_label" class="ui-selectonemenu-label">Seleccione una</label><div class="ui-selectonemenu-trigger"><span class="ui-icon ui-icon-triangle-1-s"></span></div></div>
  <div id="buscamarca_panel" style="display:none"><ul id="buscamarca_items">${marcas.map((m) => `<li data-label="${m}" class="ui-selectonemenu-item" onclick="var s=document.getElementById('buscamarca_input');s.selectedIndex=Array.from(s.options).findIndex(o=>o.textContent==='${m}');document.getElementById('buscamarca_label').textContent='${m}';s.dispatchEvent(new Event('change'));window.__cambios=(window.__cambios||0)+1;document.getElementById('buscamarca_panel').style.display='none'">${m}</li>`).join('')}</ul></div>
  <button type="submit" id="cancelar" onclick="window.__cancelar=1">Cancelar</button>
  <button type="submit" id="confirmar" onclick="window.__confirmado=(window.__confirmado||0)+1;return false">${boton}</button>`

const ctxPF = (page: Page, guard: GuardEmision) => ({
  pausaAccion: async () => {},
  pulsar: async (b: Parameters<ContextoPortal['pulsar']>[0]) => { const { pulsar } = await import('../src/guard.ts'); await pulsar(b, guard) },
  marcarPlacasEspecialesGenerali: () => marcarPlacasEspecialesGenerali(page, guard, 'No'),
  confirmarVehiculoGenerali: () => pulsarConfirmarVehiculoGenerali(page, guard),
  abrirDesplegableMarcaGenerali: (base: string) => abrirDesplegableMarcaGenerali(page, guard, base),
  elegirMarcaListaGenerali: (base: string, texto: string) => elegirMarcaListaGenerali(page, guard, base, texto),
  log: () => {},
}) as unknown as ContextoPortal

test('v0.2.6 · SelectOneMenu de PrimeFaces: se reconoce el select OCULTO `<id>_input` con su div combobox; un select nativo visible no lo es', async () => {
  const a = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT', 'SKODA']))
  try {
    assert.equal(await a.page.locator('#buscamarca_input').isVisible(), false, 'la fixture lo oculta como PrimeFaces')
    const m = await menuPrimeFaces(a.page, 'Todas las marcas')
    assert.ok(m)
    assert.equal(m!.base, 'buscamarca')
    assert.equal((await m!.select.evaluate((el) => el.id)), 'buscamarca_input')
  } finally {
    await a.cerrar()
  }
  const b = await abrir(PORTAL, SELECTOR_HTML(['SEAT'], false))
  try {
    assert.equal(await menuPrimeFaces(b.page, 'Todas las marcas'), null, 'select nativo sin div combobox: no es PrimeFaces')
  } finally {
    await b.cerrar()
  }
})

test('v0.2.6 · marca: igualdad EXACTA normalizada (tildes, mayúsculas, espacios dobles); contención o repetida NO se elige', () => {
  const ops = ['Seleccione una', 'SEAT', 'SEAT CUPRA', 'MERCEDES-BENZ', 'CITROËN', 'SKODA', 'SKODA']
  assert.deepEqual(elegirMarcaExactaGenerali(ops, ' seat '), { tipo: 'unica', indice: 1 })
  assert.deepEqual(elegirMarcaExactaGenerali(ops, 'Mercedes  Benz'), { tipo: 'unica', indice: 3 })
  assert.deepEqual(elegirMarcaExactaGenerali(ops, 'citroen'), { tipo: 'unica', indice: 4 })
  const rep = elegirMarcaExactaGenerali(ops, 'skoda')
  assert.equal(rep.tipo, 'varias')
  const parcial = elegirMarcaExactaGenerali(ops, 'CUPRA')
  assert.notEqual(parcial.tipo, 'unica', '«CUPRA» no es «SEAT CUPRA»: sin similitud')
  assert.ok('cercanas' in parcial && parcial.cercanas.includes('SEAT CUPRA'))
  assert.equal(elegirMarcaExactaGenerali(ops, '').tipo, 'ninguna')
})

test('v0.2.6 · selector PrimeFaces: marca exacta por el panel (change disparado), placas «No», «Confirmar» pulsado una vez y hueco con la pantalla siguiente sin mapa', async () => {
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT', 'SEAT CUPRA']))
  try {
    await assert.rejects(seleccionarVehiculoGenerali(page, page, coche(), ctxPF(page, guard)), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /sigue a «Confirmar»/.test(e.message) && (e as { pideInventarioDom?: boolean }).pideInventarioDom === true)
    assert.equal(await page.locator('#buscamarca_input').inputValue(), '0', 'SEAT (índice 0 de la fixture), no «SEAT CUPRA»')
    assert.equal(await page.locator('#buscamarca_label').innerText(), 'SEAT')
    assert.equal(await page.evaluate(() => (window as unknown as { __cambios?: number }).__cambios ?? 0), 1, 'por el li del panel de PrimeFaces')
    assert.equal(await page.locator('#placaesp\\:1').isChecked(), true)
    assert.equal(await page.locator('#placaesp\\:0').isChecked(), false)
    assert.equal(await page.evaluate(() => (window as unknown as { __confirmado?: number }).__confirmado ?? 0), 1)
    assert.equal(await page.evaluate(() => (window as unknown as { __cancelar?: number }).__cancelar ?? 0), 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.6 · marca ambigua o sin coincidencia exacta: atasco `eleccion` con las cercanas y NO selecciona ni confirma', async () => {
  for (const [marcas, marcaRiesgo] of [[['SEAT', 'SEAT'], 'SEAT'], [['SEAT CUPRA', 'SKODA'], 'SEAT']] as const) {
    const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML([...marcas]))
    try {
      const f = coche({ seleccionVehiculo: { marca: marcaRiesgo, modelo: 'IBIZA' } })
      await assert.rejects(seleccionarVehiculoGenerali(page, page, f, ctxPF(page, guard)), (e: unknown) => e instanceof ErrorEleccionVersion && e.opcionesVersion.length >= 1 && e.tipo === 'eleccion')
      assert.equal(await page.locator('#buscamarca_input').inputValue(), 'null', 'no se eligió ninguna marca')
      assert.equal(await page.evaluate(() => (window as unknown as { __confirmado?: number }).__confirmado ?? 0), 0, 'no se confirmó')
    } finally {
      await cerrar()
    }
  }
})

test('v0.2.6 · puerta de «Confirmar»: solo el texto exacto, solo en la URL selVehiculo y una vez', async () => {
  assert.equal(botonSelectorVehiculosGeneraliPermitido('Confirmar'), true)
  assert.equal(botonSelectorVehiculosGeneraliPermitido(' confirmar '), true)
  for (const t of ['Confirmar pago', 'Emitir', 'Cancelar', 'Contratar', 'Confirmar y emitir', '', null]) assert.equal(botonSelectorVehiculosGeneraliPermitido(t), false, String(t))
  assert.equal(urlSelectorVehiculosGenerali(SEL_VEHICULOS), true)
  assert.equal(urlSelectorVehiculosGenerali(`${SEL_VEHICULOS};jsessionid=abc?x=1`), true)
  for (const u of ['https://www.generali.es/mot_motorWeb/mvc/otraCosa', 'https://otro.example/mot_motorWeb/mvc/selVehiculo', PORTAL, 'x']) assert.equal(urlSelectorVehiculosGenerali(u), false, u)

  // Otro texto en el mismo botón: no se pulsa.
  const a = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Emitir póliza'))
  try {
    await assert.rejects(pulsarConfirmarVehiculoGenerali(a.page, a.guard), (e: unknown) => e instanceof ErrorTarificador)
    assert.equal(await a.page.evaluate(() => (window as unknown as { __confirmado?: number }).__confirmado ?? 0), 0)
  } finally {
    await a.cerrar()
  }
  // Otra URL con un «Confirmar» idéntico: no se pulsa.
  const b = await abrir(PORTAL, PRIMEFACES_HTML(['SEAT']))
  try {
    await assert.rejects(pulsarConfirmarVehiculoGenerali(b.page, b.guard), (e: unknown) => e instanceof ErrorTarificador)
    await assert.rejects(marcarPlacasEspecialesGenerali(b.page, b.guard, 'No'), (e: unknown) => e instanceof ErrorTarificador)
    assert.equal(await b.page.evaluate(() => (window as unknown as { __confirmado?: number }).__confirmado ?? 0), 0)
    assert.equal(await b.page.locator('#placaesp\\:1').isChecked(), false)
  } finally {
    await b.cerrar()
  }
  // Texto y URL correctos: una vez, y la segunda se bloquea. «Sí» de placas nunca.
  const c = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT']))
  try {
    await assert.rejects(marcarPlacasEspecialesGenerali(c.page, c.guard, 'Sí' as unknown as 'No'), EmisionBloqueadaError)
    await pulsarConfirmarVehiculoGenerali(c.page, c.guard)
    assert.equal(await c.page.evaluate(() => (window as unknown as { __confirmado?: number }).__confirmado ?? 0), 1)
    await assert.rejects(pulsarConfirmarVehiculoGenerali(c.page, c.guard), EmisionBloqueadaError)
    assert.equal(await c.page.evaluate(() => (window as unknown as { __confirmado?: number }).__confirmado ?? 0), 1)
  } finally {
    await c.cerrar()
  }
})

// ───────────── v0.2.8: «Confirmar» tapado por capas del padre → clic por DOM sobre el mismo control ─────────────

const CAPA_TAPA = '<div id="capa" style="position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:9999"></div>'

test('v0.2.8 · «Confirmar» tapado por una capa: el clic normal agota y se pulsa por DOM (una vez); sin capa, clic normal', async () => {
  const a = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT']) + CAPA_TAPA)
  try {
    await pulsarConfirmarVehiculoGenerali(a.page, a.guard)
    assert.equal(await a.page.evaluate(() => (window as unknown as { __confirmado?: number }).__confirmado ?? 0), 1, 'pulsado por DOM pese a la capa')
    await assert.rejects(pulsarConfirmarVehiculoGenerali(a.page, a.guard), EmisionBloqueadaError)
    assert.equal(await a.page.evaluate(() => (window as unknown as { __confirmado?: number }).__confirmado ?? 0), 1)
  } finally {
    await a.cerrar()
  }
})

test('v0.2.8 · cepo: con la capa puesta, texto distinto o URL distinta NO pulsan ni por clic ni por DOM', async () => {
  const a = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Emitir póliza') + CAPA_TAPA)
  const b = await abrir(PORTAL, PRIMEFACES_HTML(['SEAT']) + CAPA_TAPA)
  try {
    await assert.rejects(pulsarConfirmarVehiculoGenerali(a.page, a.guard), (e: unknown) => e instanceof ErrorTarificador)
    await assert.rejects(pulsarConfirmarVehiculoGenerali(b.page, b.guard), (e: unknown) => e instanceof ErrorTarificador)
    for (const p of [a.page, b.page]) assert.equal(await p.evaluate(() => (window as unknown as { __confirmado?: number }).__confirmado ?? 0), 0)
  } finally {
    await a.cerrar()
    await b.cerrar()
  }
})

// ───────────── v0.2.7: el desplegable de marcas se abre por su DISPARADOR (el `div#buscamarca` lleva todas las opciones dentro) ─────────────

const cambiosPF = (page: Page) => page.evaluate(() => (window as unknown as { __cambios?: number }).__cambios ?? 0)

test('v0.2.7 · la descripción del disparador NO incluye las opciones; la del `div#buscamarca` sí (el fallo real de la 0.2.6)', async () => {
  const { page, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT', 'BAJAJ']))
  try {
    const div = await page.locator('#buscamarca').evaluate((el) => (el as HTMLElement).innerText)
    assert.match(div, /BAJAJ/, 'el contenedor arrastra el texto de TODAS las marcas')
    for (const sel of ['#buscamarca .ui-selectonemenu-trigger', '#buscamarca_label']) {
      const d = await page.locator(sel).evaluate((el) => (el as HTMLElement).innerText + '|' + el.outerHTML)
      assert.doesNotMatch(d, /BAJAJ|SEAT/, sel)
    }
  } finally {
    await cerrar()
  }
})

test('v0.2.7 · una marca que casa con el patrón de emisión (BAJAJ ← «baja») NO bloquea la apertura, pero SÍ su elección (fail-closed)', async () => {
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT', 'BAJAJ']))
  try {
    const f = coche({ seleccionVehiculo: { marca: 'BAJAJ', modelo: 'X' } })
    await assert.rejects(seleccionarVehiculoGenerali(page, page, f, ctxPF(page, guard)), (e: unknown) => e instanceof EmisionBloqueadaError)
    assert.equal(await page.locator('#buscamarca_panel').evaluate((el) => (el as HTMLElement).style.display), 'block', 'el desplegable SÍ se abrió (el disparador no arrastra las opciones)')
    assert.equal(await cambiosPF(page), 0, 'no se pulsó el li de BAJAJ')
    assert.equal(await page.locator('#buscamarca_input').inputValue(), 'null')
    assert.equal(await page.evaluate(() => (window as unknown as { __confirmado?: number }).__confirmado ?? 0), 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.7 · la puerta de apertura exige la URL selVehiculo y el id EXACTO `buscamarca`', async () => {
  const a = await abrir(PORTAL, PRIMEFACES_HTML(['SEAT']))
  try {
    await assert.rejects(abrirDesplegableMarcaGenerali(a.page, a.guard, 'buscamarca'), (e: unknown) => e instanceof ErrorTarificador)
    await assert.rejects(elegirMarcaListaGenerali(a.page, a.guard, 'buscamarca', 'SEAT'), (e: unknown) => e instanceof ErrorTarificador)
    assert.equal(await a.page.locator('#buscamarca_panel').evaluate((el) => (el as HTMLElement).style.display), 'none', 'no se abrió')
  } finally {
    await a.cerrar()
  }
  const b = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT']))
  try {
    for (const id of ['buscamarca_input', 'buscamodelo', 'BUSCAMARCA', '']) {
      await assert.rejects(abrirDesplegableMarcaGenerali(b.page, b.guard, id), EmisionBloqueadaError, id)
      await assert.rejects(elegirMarcaListaGenerali(b.page, b.guard, id, 'SEAT'), EmisionBloqueadaError, id)
    }
    assert.equal(await b.page.locator('#buscamarca_panel').evaluate((el) => (el as HTMLElement).style.display), 'none')
    assert.equal(await cambiosPF(b.page), 0)
  } finally {
    await b.cerrar()
  }
})

test('v0.2.7 · las puertas de apertura y de elección de marca se usan UNA sola vez por trabajo', async () => {
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT', 'SKODA']))
  try {
    await abrirDesplegableMarcaGenerali(page, guard, 'buscamarca')
    assert.equal(await page.locator('#buscamarca_panel').evaluate((el) => (el as HTMLElement).style.display), 'block')
    await assert.rejects(abrirDesplegableMarcaGenerali(page, guard, 'buscamarca'), EmisionBloqueadaError)
    await elegirMarcaListaGenerali(page, guard, 'buscamarca', 'SEAT')
    assert.equal(await cambiosPF(page), 1)
    await assert.rejects(elegirMarcaListaGenerali(page, guard, 'buscamarca', 'SKODA'), EmisionBloqueadaError)
    assert.equal(await cambiosPF(page), 1, 'la segunda elección no pulsó nada')
  } finally {
    await cerrar()
  }
})

test('v0.2.7 · sin disparador visible y único (ni trigger ni label) → hueco con inventario, sin pulsar; `li` repetido o ausente → hueco', async () => {
  const sinDisparador = PRIMEFACES_HTML(['SEAT']).replace('<div class="ui-selectonemenu-trigger"><span class="ui-icon ui-icon-triangle-1-s"></span></div>', '').replace('<label id="buscamarca_label" class="ui-selectonemenu-label">Seleccione una</label>', '')
  const a = await abrir(SEL_VEHICULOS, sinDisparador)
  try {
    await assert.rejects(abrirDesplegableMarcaGenerali(a.page, a.guard, 'buscamarca'), (e: unknown) => e instanceof ErrorMapaGuardGenerali && e.pideInventarioDom)
    assert.equal(await a.page.locator('#buscamarca_panel').evaluate((el) => (el as HTMLElement).style.display), 'none')
  } finally {
    await a.cerrar()
  }
  const b = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT', 'SEAT']))
  try {
    await assert.rejects(elegirMarcaListaGenerali(b.page, b.guard, 'buscamarca', 'SEAT'), (e: unknown) => e instanceof ErrorMapaGuardGenerali)
    await assert.rejects(elegirMarcaListaGenerali(b.page, b.guard, 'buscamarca', 'NOEXISTE'), (e: unknown) => e instanceof ErrorMapaGuardGenerali)
    assert.equal(await cambiosPF(b.page), 0)
  } finally {
    await b.cerrar()
  }
})
