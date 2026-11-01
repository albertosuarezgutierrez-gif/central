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
  elegirModeloGenerali,
  dataLabelDeOpcionGenerali,
  estadoTrasOtrosModeloGenerali,
  opcionPuestaPrimeFaces,
  camposNuevosSelectorGenerali,
  cvDePotenciaGenerali,
  grupoPotenciaGenerali,
  resumenCoincideConFilaGenerali,
  resumenCamposSelectorGenerali,
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
import { ErrorMapaIncompletoGenerali, decidirFilaVersionGenerali, decidirPotenciaGenerali, clasificarPostConfirmarGenerali, fijarEsperaPostConfirmarGenerali, fijarEsperasTrasOtrosGenerali, modeloVerificadoGenerali, GENERALI_AUTO_ACTIVO, VERSION_GENERALI_AUTO, elegirMediadorGenerali, generaliAuto, menuPrimeFaces, rellenarValoracionGenerali, seleccionarVehiculoGenerali } from '../src/adapters/generali/auto.ts'
import { adaptadores } from '../src/adapters/index.ts'
import { ErrorMapaGuardGenerali, abrirDesplegableMarcaGenerali, elegirMarcaListaGenerali, abrirDesplegableModeloGenerali, elegirModeloListaGenerali, botonSelectorVehiculosGeneraliPermitido, cerrarAvisoSabiasQueGenerali, marcarPlacasEspecialesGenerali, pulsarConfirmarVehiculoGenerali, elegirPotenciaGenerali, elegirFilaVersionGenerali, elegirCombustibleGenerali, abrirDesplegableVersionGenerali, elegirVersionListaGenerali, pulsarAvanzarSelectorVehiculosGenerali, urlSelectorVehiculosGenerali, pulsarMediadorGenerali, entrarTurismosGenerali, instalarGuardEmision, MENU_TURISMOS_GENERALI, type GuardEmision } from '../src/guard.ts'
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
  assert.equal(generaliAuto.version, VERSION_GENERALI_AUTO)
  assert.match(VERSION_GENERALI_AUTO, /^0\.2\.(2[7-9]|[3-9]\d)$/)
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

const SELECTOR_HTML = (marcas: string[], conModelo: boolean, versiones: string[] = ['1.0 TSI STYLE', '1.0 TSI FR']) => `<button onclick="document.getElementById('sel').style.display='block'">Vehículo</button>
  <div id="sel" style="display:none"><h2>Selector de vehículos</h2>
  <label for="tm">Todas las marcas</label><select id="tm"><option>Seleccione una</option>${marcas.map((m) => `<option>${m}</option>`).join('')}</select>
  ${conModelo ? '<label>Modelo</label><select id="mo"><option>Seleccione uno</option><option>IBIZA</option><option>IBIZA ST</option></select><label>Versión</label><select id="ve">' + versiones.map((v) => `<option>${v}</option>`).join('') + '</select>' : ''}
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

test('selector de vehículos: modelo exacto y versión de la oportunidad; sin versión confirmada: varias equivalentes → elige sola (v0.2.10); materiales → elige una persona', async () => {
  const a = await abrir(PORTAL, SELECTOR_HTML(['SEAT'], true))
  try {
    // Llega a la versión y para porque la fixture no lleva a «Identificación del vehículo» (paso sin captura).
    await assert.rejects(seleccionarVehiculoGenerali(a.page, a.page, coche(), ctxSimple(a.page, a.guard)), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /cómo se confirma/.test(e.message))
    assert.equal(await a.page.locator('#mo').inputValue(), 'IBIZA')
    assert.equal(await a.page.locator('#ve').inputValue(), '1.0 TSI STYLE')
  } finally {
    await a.cerrar()
  }
  // v0.2.10: sin versión confirmada y varias EQUIVALENTES (mismo texto de acabado, sin diferencias materiales) → elige SOLA la primera y la declara.
  const b = await abrir(PORTAL, SELECTOR_HTML(['SEAT'], true))
  try {
    const sinVersion = coche({ seleccionVehiculo: { marca: 'SEAT', modelo: 'IBIZA' } })
    const avisos: string[] = []
    await assert.rejects(seleccionarVehiculoGenerali(b.page, b.page, sinVersion, ctxSimple(b.page, b.guard), avisos), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /cómo se confirma/.test(e.message))
    assert.equal(await b.page.locator('#ve').inputValue(), '1.0 TSI STYLE', 'la primera del portal')
    assert.deepEqual(avisos, ['Versión elegida automáticamente: 1.0 TSI STYLE (había 2 equivalentes; revisar en la emisión)'])
  } finally {
    await b.cerrar()
  }
  // Diferencias MATERIALES (combustible distinto) → sigue preguntando con todas, sin tocar el desplegable.
  const c = await abrir(PORTAL, SELECTOR_HTML(['SEAT'], true, ['1.0 TSI 95 CV Gasolina', '1.6 TDI 95 CV Diésel']))
  try {
    const sinVersion = coche({ seleccionVehiculo: { marca: 'SEAT', modelo: 'IBIZA' } })
    const antes = await c.page.locator('#ve').inputValue()
    await assert.rejects(seleccionarVehiculoGenerali(c.page, c.page, sinVersion, ctxSimple(c.page, c.guard), []), (e: unknown) => e instanceof ErrorEleccionVersion && e.opcionesVersion.length === 2)
    assert.equal(await c.page.locator('#ve').inputValue(), antes)
  } finally {
    await c.cerrar()
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

fijarEsperaPostConfirmarGenerali(1_500) // producción: 25 s
fijarEsperasTrasOtrosGenerali(3_000, 1_000) // producción: 10 s y 3 s
const SEL_VEHICULOS = 'https://www.generali.es/mot_motorWeb/mvc/selVehiculo'

/** Estructura del inventario real (ids `buscamarca*`, `placaesp:0/1`, `#cancelar`/`#confirmar`); marcas y valores de prueba. */
const PRIMEFACES_HTML = (marcas: string[], boton = 'Confirmar', modelos?: string[], nuevos = '') => `<button type="button">Vehículo</button><h2>Selector de vehículos</h2>
  <span>Placas especiales</span>
  <table><tr><td><input type="radio" id="placaesp:0" name="placaesp" value="S" style="position:absolute;left:-999px"><label for="placaesp:0">Sí</label></td>
  <td><input type="radio" id="placaesp:1" name="placaesp" value="N" style="position:absolute;left:-999px"><label for="placaesp:1">No</label></td></tr></table>
  <span>Principales marcas</span>
  <span>Todas las marcas</span>
  <div id="buscamarca" role="combobox" tabindex="0" onclick="document.getElementById('buscamarca_panel').style.display='block'"><div class="ui-helper-hidden-accessible" style="position:absolute;width:0;height:0;overflow:hidden"><select id="buscamarca_input" name="buscamarca_input" style="width:0;height:0;border:0;padding:0"><option value="null">Seleccione una</option>${marcas.map((m, i) => `<option value="${i}">${m}</option>`).join('')}</select></div><label id="buscamarca_label" class="ui-selectonemenu-label">Seleccione una</label><div class="ui-selectonemenu-trigger"><span class="ui-icon ui-icon-triangle-1-s"></span></div></div>
  <div id="buscamarca_panel" style="display:none"><ul id="buscamarca_items">${marcas.map((m) => `<li data-label="${m}" class="ui-selectonemenu-item" onclick="var s=document.getElementById('buscamarca_input');s.selectedIndex=Array.from(s.options).findIndex(o=>o.textContent==='${m}');document.getElementById('buscamarca_label').textContent='${m}';s.dispatchEvent(new Event('change'));window.__cambios=(window.__cambios||0)+1;document.getElementById('buscamarca_panel').style.display='none';var bm=document.getElementById('bloque_modelo');if(bm)bm.style.display='block'">${m}</li>`).join('')}</ul></div>
  ${modelos ? MODELO_PF(modelos, nuevos) : ''}
  <button type="submit" id="cancelar" onclick="window.__cancelar=1">Cancelar</button>
  <button type="submit" id="confirmar" onclick="window.__confirmado=(window.__confirmado||0)+1;return false">${boton}</button>`

/** Bloque «Modelo» (otro SelectOneMenu de PrimeFaces, id de prueba `selmodelo`): oculto hasta elegir la marca; `nuevos` = campos que salen al elegir el modelo. */
const MODELO_PF = (modelos: string[], nuevos: string) => `<div id="bloque_modelo" style="display:none"><span>Modelo</span>
  <div id="selmodelo" role="combobox" tabindex="0" onclick="document.getElementById('selmodelo_panel').style.display='block'"><div class="ui-helper-hidden-accessible" style="position:absolute;width:0;height:0;overflow:hidden"><select id="selmodelo_input" name="selmodelo_input" style="width:0;height:0;border:0;padding:0"><option value="null">Seleccione uno</option>${modelos.map((m, i) => `<option value="${i}">${m}</option>`).join('')}</select></div><label id="selmodelo_label" class="ui-selectonemenu-label">Seleccione uno</label><div class="ui-selectonemenu-trigger"><span class="ui-icon ui-icon-triangle-1-s"></span></div></div>
  <div id="selmodelo_panel" style="display:none"><ul id="selmodelo_items">${modelos.map((m) => `<li data-label="${m}" class="ui-selectonemenu-item" onclick="var s=document.getElementById('selmodelo_input');s.selectedIndex=Array.from(s.options).findIndex(o=>o.textContent==='${m}');document.getElementById('selmodelo_label').textContent='${m}';s.dispatchEvent(new Event('change'));window.__modelo=(window.__modelo||[]).concat('${m}');document.getElementById('selmodelo_panel').style.display='none';var nv=document.getElementById('nuevos');if(nv)nv.style.display='block'">${m}</li>`).join('')}</ul></div>
  </div><div id="nuevos" style="display:none">${nuevos}</div>`

const ctxPF = (page: Page, guard: GuardEmision) => ({
  pausaAccion: async () => {},
  pulsar: async (b: Parameters<ContextoPortal['pulsar']>[0]) => { const { pulsar } = await import('../src/guard.ts'); await pulsar(b, guard) },
  marcarPlacasEspecialesGenerali: () => marcarPlacasEspecialesGenerali(page, guard, 'No'),
  confirmarVehiculoGenerali: () => pulsarConfirmarVehiculoGenerali(page, guard),
  elegirPotenciaGenerali: (g: string, t: string) => elegirPotenciaGenerali(page, guard, g, t),
  elegirFilaVersionGenerali: (c: string | null, v: string) => elegirFilaVersionGenerali(page, guard, c, v),
  abrirDesplegableMarcaGenerali: (base: string) => abrirDesplegableMarcaGenerali(page, guard, base),
  elegirMarcaListaGenerali: (base: string, texto: string) => elegirMarcaListaGenerali(page, guard, base, texto),
  abrirDesplegableModeloGenerali: (base: string) => abrirDesplegableModeloGenerali(page, guard, base),
  elegirModeloListaGenerali: (base: string, texto: string) => elegirModeloListaGenerali(page, guard, base, texto),
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
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT', 'SEAT CUPRA'], 'Confirmar', ['IBIZA', 'IBIZA ST', 'LEON']))
  try {
    await assert.rejects(seleccionarVehiculoGenerali(page, page, coche(), ctxPF(page, guard)), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /sigue a «Confirmar»/.test(e.message) && !/SIN CAPTURA/.test(e.message) && (e as { pideInventarioDom?: boolean }).pideInventarioDom === true)
    assert.equal(await page.locator('#selmodelo_input').inputValue(), '0', 'IBIZA exacto, no «IBIZA ST»')
    assert.deepEqual(await page.evaluate(() => (window as unknown as { __modelo?: string[] }).__modelo), ['IBIZA'])
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

// ───────────── v0.2.11: «Modelo» tras la marca (SelectOneMenu), «Otros», ambigüedad y campos nuevos antes de «Confirmar» ─────────────

test('v0.2.11 · modelo: igualdad EXACTA normalizada; repetido → varias; sin coincidencia → «Otros» declarado; sin «Otros» → ninguna con cercanas', () => {
  const ops = ['Seleccione uno', 'IBIZA', 'IBIZA ST', 'LEÓN', 'ARONA', 'Otros']
  assert.deepEqual(elegirModeloGenerali(ops, ' ibiza '), { tipo: 'unica', indice: 1 })
  assert.deepEqual(elegirModeloGenerali(ops, 'Leon'), { tipo: 'unica', indice: 3 })
  const otros = elegirModeloGenerali(ops, 'TARRACO')
  assert.equal(otros.tipo, 'otros')
  assert.ok(otros.tipo === 'otros' && otros.indice === 5 && /TARRACO/.test(otros.supuesto) && /Otros/.test(otros.supuesto))
  // «IBI» no es «IBIZA»: sin contención → «Otros» (no se adivina), nunca «la más parecida».
  assert.equal(elegirModeloGenerali(ops, 'IBI').tipo, 'otros')
  // Repetido: una persona elige (aunque haya «Otros»).
  const rep = elegirModeloGenerali(['Seleccione uno', 'IBIZA', 'IBIZA', 'Otros'], 'ibiza')
  assert.equal(rep.tipo, 'varias')
  assert.ok(rep.tipo === 'varias' && rep.cercanas.length === 2)
  // Sin «Otros»: ninguna, con las cercanas para la bandeja.
  const sin = elegirModeloGenerali(['Seleccione uno', 'IBIZA', 'IBIZA ST'], 'IBIZA SC')
  assert.equal(sin.tipo, 'ninguna')
  assert.ok(sin.tipo === 'ninguna' && sin.cercanas.includes('IBIZA'))
  // Dos «Otros» (ambiguo) o buscado vacío: tampoco se elige.
  assert.equal(elegirModeloGenerali(['Otros', 'OTROS', 'IBIZA'], 'TARRACO').tipo, 'ninguna')
  assert.equal(elegirModeloGenerali(ops, '').tipo, 'ninguna')
  // v0.2.12 · denominación completa: el modelo como palabra entera, el más largo gana; ninguno → «Otros».
  assert.deepEqual(elegirModeloGenerali(ops, 'SEAT IBIZA 1.0 TSI STYLE', 'denominacion'), { tipo: 'unica', indice: 1 })
  assert.equal(elegirModeloGenerali(ops, 'SEAT TARRACO 2.0 TDI', 'denominacion').tipo, 'otros')
  const largo = elegirModeloGenerali(['I20', 'I20 ACTIVE', 'Otros modelos ...'], 'HYUNDAI I20 ACTIVE 1.0', 'denominacion')
  assert.deepEqual(largo, { tipo: 'unica', indice: 1 })
  assert.equal(elegirModeloGenerali(['IBIZA', 'LEON', 'Otros'], 'SEAT IBIZA LEON', 'denominacion').tipo, 'varias')
})

test('v0.2.12 · la opción real de Generali es «Otros modelos ...»: cuenta como «Otros»', () => {
  const ops = ['Seleccione uno', 'I10', 'I20', 'TUCSON', 'Otros modelos ...']
  const e = elegirModeloGenerali(ops, 'TERRACAN')
  assert.ok(e.tipo === 'otros' && e.indice === 4)
  // «OTRO» suelto o algo que solo contiene «otros» en medio no es la opción de cierre.
  assert.equal(elegirModeloGenerali(['I10', 'Modelos otros'], 'TERRACAN').tipo, 'ninguna')
})

test('v0.2.11 · campos nuevos del selector: lo que no estaba antes y no es un menú del bot; resumen con etiquetas y opciones', () => {
  const c = (clave: string, etiqueta: string, opciones: string[] = []) => ({ clave, etiqueta, tipo: opciones.length ? 'desplegable' : 'texto', opciones, total: opciones.length })
  const ahora = [c('buscamarca', 'Todas las marcas', ['SEAT']), c('selmodelo', 'Modelo', ['IBIZA']), c('combustible', 'Combustible', ['Gasolina', 'Diésel']), c('texto|Cilindrada', 'Cilindrada')]
  const nuevos = camposNuevosSelectorGenerali(['buscamarca'], ahora, ['selmodelo'])
  assert.deepEqual(nuevos.map((x) => x.clave), ['combustible', 'texto|Cilindrada'])
  const r = resumenCamposSelectorGenerali(nuevos)
  assert.match(r, /«Combustible» \[desplegable\] \(2\): Gasolina \| Diésel/)
  assert.match(r, /«Cilindrada» \[texto\]/)
  assert.deepEqual(camposNuevosSelectorGenerali(['buscamarca', 'selmodelo'], ahora.slice(0, 2)), [])
})

test('v0.2.11 · selector: modelo que NO está en la lista → «Otros» (declarado como supuesto) y se sigue a «Confirmar»', async () => {
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['LEON', 'ARONA', 'Otros']))
  try {
    const avisos: string[] = []
    const f = coche({ seleccionVehiculo: { marca: 'SEAT', modelo: 'TARRACO' } })
    await assert.rejects(seleccionarVehiculoGenerali(page, page, f, ctxPF(page, guard), avisos), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /sigue a «Confirmar»/.test(e.message))
    assert.equal(await page.locator('#selmodelo_label').innerText(), 'Otros')
    assert.deepEqual(await page.evaluate(() => (window as unknown as { __modelo?: string[] }).__modelo), ['Otros'])
    assert.equal(avisos.length, 1)
    assert.match(avisos[0]!, /TARRACO/)
    assert.equal(await page.evaluate(() => (window as unknown as { __confirmado?: number }).__confirmado ?? 0), 1)
  } finally {
    await cerrar()
  }
})

test('v0.2.11 · selector: modelo ambiguo o sin «Otros» → atasco `eleccion` con la lista, sin elegir modelo ni pulsar «Confirmar»', async () => {
  for (const modelos of [['IBIZA', 'IBIZA', 'Otros'], ['LEON', 'ARONA']]) {
    const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', modelos))
    try {
      await assert.rejects(seleccionarVehiculoGenerali(page, page, coche(), ctxPF(page, guard)), (e: unknown) => e instanceof ErrorEleccionVersion && e.tipo === 'eleccion' && e.opcionesVersion.length >= 2)
      assert.equal(await page.locator('#selmodelo_input').inputValue(), 'null', 'no se eligió ningún modelo')
      assert.equal(await page.evaluate(() => (window as unknown as { __confirmado?: number }).__confirmado ?? 0), 0, 'no se confirmó')
    } finally {
      await cerrar()
    }
  }
})

test('v0.2.56 · selector: la elección de la bandeja que casa con UN modelo se elige en «Modelo»; sin ella, atasco que dice «modelos»', async () => {
  {
    const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['LEON', 'ARONA']))
    try {
      await assert.rejects(seleccionarVehiculoGenerali(page, page, coche({ eleccionVersion: { etiqueta: 'arona' } }), ctxPF(page, guard)), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /sigue a «Confirmar»/.test(e.message))
      assert.equal(await page.locator('#selmodelo_input').inputValue(), '1', 'ARONA, la elegida por la persona')
      assert.deepEqual(await page.evaluate(() => (window as unknown as { __modelo?: string[] }).__modelo), ['ARONA'])
    } finally {
      await cerrar()
    }
  }
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['LEON', 'ARONA']))
  try {
    await assert.rejects(seleccionarVehiculoGenerali(page, page, coche({ eleccionVersion: { etiqueta: '1.0 TSI STYLE' } }), ctxPF(page, guard)), (e: unknown) => e instanceof ErrorEleccionVersion && e.tipo === 'eleccion' && /2 modelos/.test(e.message) && !/versiones/.test(e.message))
    assert.equal(await page.locator('#selmodelo_input').inputValue(), 'null', 'una elección de versión no elige modelo')
  } finally {
    await cerrar()
  }
})

test('v0.2.11 · selector: si tras el modelo salen campos NUEVOS, NO se pulsa «Confirmar» y el hueco lista etiquetas y opciones', async () => {
  const nuevos = '<span>Combustible</span><select id="combustible"><option>Seleccione uno</option><option>Gasolina</option><option>Diésel</option></select><span>Potencia</span><input id="potencia" type="text">'
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['IBIZA', 'LEON'], nuevos))
  try {
    await assert.rejects(seleccionarVehiculoGenerali(page, page, coche(), ctxPF(page, guard)), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && e.pideInventarioDom === true && /campos nuevos/.test(e.message) && /Gasolina \| Diésel/.test(e.message) && /Potencia|combustible/i.test(e.message) && !/SIN CAPTURA/.test(e.message))
    assert.equal(await page.locator('#selmodelo_input').inputValue(), '0')
    assert.equal(await page.evaluate(() => (window as unknown as { __confirmado?: number }).__confirmado ?? 0), 0, 'no se pulsó «Confirmar»')
  } finally {
    await cerrar()
  }
})

test('v0.2.11 · las puertas de modelo: URL selVehiculo, id de menú válido (no el de marcas ni sus elementos internos) y UNA vez por trabajo', async () => {
  const a = await abrir(PORTAL, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['IBIZA']))
  try {
    await assert.rejects(abrirDesplegableModeloGenerali(a.page, a.guard, 'selmodelo'), (e: unknown) => e instanceof ErrorTarificador)
    await assert.rejects(elegirModeloListaGenerali(a.page, a.guard, 'selmodelo', 'IBIZA'), (e: unknown) => e instanceof ErrorTarificador)
  } finally {
    await a.cerrar()
  }
  const b = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['IBIZA', 'LEON']))
  try {
    await b.page.evaluate(() => { document.getElementById('bloque_modelo')!.style.display = 'block' })
    for (const id of ['buscamarca', 'selmodelo_input', 'selmodelo_panel', '', 'a b', '1x']) {
      await assert.rejects(abrirDesplegableModeloGenerali(b.page, b.guard, id), EmisionBloqueadaError, id)
      await assert.rejects(elegirModeloListaGenerali(b.page, b.guard, id, 'IBIZA'), EmisionBloqueadaError, id)
    }
    // Las puertas de MARCA siguen exigiendo el id exacto `buscamarca`.
    await assert.rejects(abrirDesplegableMarcaGenerali(b.page, b.guard, 'selmodelo'), EmisionBloqueadaError)
    await abrirDesplegableModeloGenerali(b.page, b.guard, 'selmodelo')
    assert.equal(await b.page.locator('#selmodelo_panel').evaluate((el) => (el as HTMLElement).style.display), 'block')
    await assert.rejects(abrirDesplegableModeloGenerali(b.page, b.guard, 'selmodelo'), EmisionBloqueadaError)
    await elegirModeloListaGenerali(b.page, b.guard, 'selmodelo', 'IBIZA')
    assert.deepEqual(await b.page.evaluate(() => (window as unknown as { __modelo?: string[] }).__modelo), ['IBIZA'])
    await assert.rejects(elegirModeloListaGenerali(b.page, b.guard, 'selmodelo', 'LEON'), EmisionBloqueadaError)
    assert.deepEqual(await b.page.evaluate(() => (window as unknown as { __modelo?: string[] }).__modelo), ['IBIZA'], 'la segunda elección no pulsó nada')
  } finally {
    await b.cerrar()
  }
})

test('v0.2.11 · un modelo que casa con el patrón de emisión (BAJAJ ← «baja») se BLOQUEA al elegirlo (fail-closed); «Otros» no', async () => {
  const a = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['BAJAJ', 'Otros']))
  try {
    await a.page.evaluate(() => { document.getElementById('bloque_modelo')!.style.display = 'block' })
    await abrirDesplegableModeloGenerali(a.page, a.guard, 'selmodelo')
    await assert.rejects(elegirModeloListaGenerali(a.page, a.guard, 'selmodelo', 'BAJAJ'), EmisionBloqueadaError)
    assert.equal(await a.page.evaluate(() => (window as unknown as { __modelo?: string[] }).__modelo ?? []).then((x) => x.length), 0)
  } finally {
    await a.cerrar()
  }
  const b = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['BAJAJ', 'Otros']))
  try {
    await b.page.evaluate(() => { document.getElementById('bloque_modelo')!.style.display = 'block' })
    await abrirDesplegableModeloGenerali(b.page, b.guard, 'selmodelo')
    await elegirModeloListaGenerali(b.page, b.guard, 'selmodelo', 'Otros')
    assert.deepEqual(await b.page.evaluate(() => (window as unknown as { __modelo?: string[] }).__modelo), ['Otros'])
  } finally {
    await b.cerrar()
  }
})

// ───────────── v0.2.16: «Otros modelos ...» que vuelve a «Seleccione uno» (fallo real de la 0.2.15) ─────────────

test('v0.2.16 · puesta = valor Y texto de la opción; `li` emparejado normalizado («…» vs «...», espacios); estado tras «Otros»', () => {
  // Un valor compartido con el placeholder ya no «casa» si el texto seleccionado es «Seleccione uno».
  assert.equal(opcionPuestaPrimeFaces('', 'Seleccione uno', { valor: '', texto: 'Otros modelos ...' }), false)
  assert.equal(opcionPuestaPrimeFaces('7', 'Otros modelos ...', { valor: '7', texto: 'Otros modelos ...' }), true)
  assert.equal(opcionPuestaPrimeFaces('7', 'Otros modelos ...', { valor: '8', texto: 'Otros modelos ...' }), false)
  // data-label exacto si existe; si no, el ÚNICO que casa normalizado; 0 o varios → null.
  assert.equal(dataLabelDeOpcionGenerali(['IBIZA', 'Otros modelos ...'], 'Otros modelos ...'), 'Otros modelos ...')
  assert.equal(dataLabelDeOpcionGenerali(['IBIZA', 'Otros modelos\u2026'], 'Otros  modelos ...'), 'Otros modelos\u2026')
  assert.equal(dataLabelDeOpcionGenerali(['IBIZA', 'Otros modelos\u00a0...'], 'Otros modelos ...'), 'Otros modelos\u00a0...')
  assert.equal(dataLabelDeOpcionGenerali(['Otros modelos', 'OTROS MODELOS ...'], 'Otros modelos …'), null)
  assert.equal(dataLabelDeOpcionGenerali(['IBIZA'], 'LEON'), null)
  // Tras «Otros»: puesto → puesta; lista igual y «Seleccione uno» → esperar; lista recargada → elección en la nueva.
  const antes = ['Seleccione uno', 'I10', 'I20', 'Otros modelos ...']
  assert.deepEqual(estadoTrasOtrosModeloGenerali(antes, antes, 'Otros modelos ...', 'Otros modelos ...', 'Otros modelos ...', 'TERRACAN'), { tipo: 'puesta' })
  assert.deepEqual(estadoTrasOtrosModeloGenerali(antes, antes, 'Otros modelos ...', 'Seleccione uno', 'Seleccione uno', 'TERRACAN'), { tipo: 'esperar' })
  const ampliada = ['Seleccione uno', 'I10', 'I20', 'TERRACAN', 'TRAJET']
  assert.deepEqual(estadoTrasOtrosModeloGenerali(antes, ampliada, 'Otros modelos ...', 'Seleccione uno', 'Seleccione uno', 'TERRACAN'), { tipo: 'ampliada', eleccion: { tipo: 'unica', indice: 3 } })
  // En la lista nueva no está y vuelve a haber «Otros»: NO se elige otra vez (bucle) → ninguna con cercanas.
  const r = estadoTrasOtrosModeloGenerali(antes, [...ampliada, 'Otros modelos ...'], 'Otros modelos ...', 'Seleccione uno', 'Seleccione uno', 'TERRANO')
  assert.ok(r.tipo === 'ampliada' && r.eleccion.tipo === 'ninguna' && r.eleccion.cercanas.includes('TERRACAN'))
})

/** «Otros modelos ...» que, como un «ver más», recarga la lista con `extra` y devuelve el menú a «Seleccione uno» (AJAX simulado). */
const RECARGA_OTROS = (extra: string[]) => `<script>
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.getElementById('selmodelo_input');
    s.addEventListener('change', () => {
      if (s.selectedOptions[0]?.textContent !== 'Otros modelos ...' || window.__recargado) return;
      window.__recargado = 1;
      setTimeout(() => {
        const ul = document.getElementById('selmodelo_items');
        for (const m of ${JSON.stringify(extra)}) {
          const o = document.createElement('option'); o.value = 'x' + m; o.textContent = m; s.appendChild(o);
          const li = document.createElement('li'); li.setAttribute('data-label', m); li.className = 'ui-selectonemenu-item'; li.textContent = m;
          li.onclick = () => { s.value = 'x' + m; document.getElementById('selmodelo_label').textContent = m; s.dispatchEvent(new Event('change')); window.__modelo = (window.__modelo || []).concat(m); document.getElementById('selmodelo_panel').style.display = 'none' };
          ul.appendChild(li);
        }
        s.selectedIndex = 0; document.getElementById('selmodelo_label').textContent = 'Seleccione uno';
      }, 300);
    });
  });
</script>`

test('v0.2.16 · «Otros modelos ...» recarga la lista y vuelve a «Seleccione uno»: se elige el modelo en la lista nueva (segunda ronda) y se confirma', async () => {
  fijarEsperasTrasOtrosGenerali(3_000, 1_200)
  const html = RECARGA_OTROS(['TERRACAN', 'TRAJET']) + PRIMEFACES_HTML(['HYUNDAI'], 'Confirmar', ['I10', 'I20', 'Otros modelos ...'])
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, html)
  try {
    const avisos: string[] = []
    const f = coche({ seleccionVehiculo: { marca: 'HYUNDAI', modelo: 'TERRACAN' } })
    await assert.rejects(seleccionarVehiculoGenerali(page, page, f, ctxPF(page, guard), avisos), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && !/no quedó seleccionado/.test(e.message))
    assert.deepEqual(await page.evaluate(() => (window as unknown as { __modelo?: string[] }).__modelo), ['Otros modelos ...', 'TERRACAN'])
    assert.equal(await page.locator('#selmodelo_label').innerText(), 'TERRACAN')
    assert.equal(avisos.filter((a) => /se eligió «Otros»/.test(a)).length, 0, 'el modelo real no es un supuesto «Otros»')
    assert.equal(await page.evaluate(() => (window as unknown as { __confirmado?: number }).__confirmado ?? 0), 1)
    // La segunda ronda también es UNA vez, y «Otros» no se vuelve a elegir.
    await assert.rejects(elegirModeloListaGenerali(page, guard, 'selmodelo', 'TRAJET'), EmisionBloqueadaError)
  } finally {
    fijarEsperasTrasOtrosGenerali(3_000, 1_000)
    await cerrar()
  }
})

test('v0.2.16 · «Otros modelos ...» que vuelve a «Seleccione uno» sin recargar nada → hueco claro y NO se pulsa «Confirmar»', async () => {
  fijarEsperasTrasOtrosGenerali(2_000, 800)
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['HYUNDAI'], 'Confirmar', ['I10', 'Otros modelos ...']))
  try {
    await page.evaluate(() => { const s = document.getElementById('selmodelo_input') as HTMLSelectElement; s.addEventListener('change', () => setTimeout(() => { s.selectedIndex = 0; document.getElementById('selmodelo_label')!.textContent = 'Seleccione uno' }, 200)) })
    const f = coche({ seleccionVehiculo: { marca: 'HYUNDAI', modelo: 'TERRACAN' } })
    await assert.rejects(seleccionarVehiculoGenerali(page, page, f, ctxPF(page, guard)), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /ni quedó puesto ni cambió la lista/.test(e.message))
    assert.equal(await page.evaluate(() => (window as unknown as { __confirmado?: number }).__confirmado ?? 0), 0, 'no se pulsó «Confirmar»')
  } finally {
    fijarEsperasTrasOtrosGenerali(3_000, 1_000)
    await cerrar()
  }
})

test('v0.2.16 · guard: segunda ronda de modelo SOLO tras «Otros», una vez y nunca «Otros» otra vez', async () => {
  const a = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['IBIZA', 'LEON', 'Otros']))
  try {
    await a.page.evaluate(() => { document.getElementById('bloque_modelo')!.style.display = 'block' })
    await abrirDesplegableModeloGenerali(a.page, a.guard, 'selmodelo')
    await elegirModeloListaGenerali(a.page, a.guard, 'selmodelo', 'Otros')
    await abrirDesplegableModeloGenerali(a.page, a.guard, 'selmodelo')
    await assert.rejects(elegirModeloListaGenerali(a.page, a.guard, 'selmodelo', 'Otros'), EmisionBloqueadaError)
    await elegirModeloListaGenerali(a.page, a.guard, 'selmodelo', 'LEON')
    await assert.rejects(abrirDesplegableModeloGenerali(a.page, a.guard, 'selmodelo'), EmisionBloqueadaError)
    await assert.rejects(elegirModeloListaGenerali(a.page, a.guard, 'selmodelo', 'IBIZA'), EmisionBloqueadaError)
    assert.deepEqual(await a.page.evaluate(() => (window as unknown as { __modelo?: string[] }).__modelo), ['Otros', 'LEON'])
  } finally {
    await a.cerrar()
  }
})

// ───────────── v0.2.13: modelo verificado antes de «Confirmar» y espera clasificada después ─────────────

test('v0.2.13 · modeloVerificadoGenerali: label E input deben decir el modelo elegido (normalizado)', () => {
  assert.equal(modeloVerificadoGenerali('IBIZA', 'Ibiza', 'IBIZA'), true)
  assert.equal(modeloVerificadoGenerali('IBIZA', 'Seleccione uno', 'IBIZA'), false)
  assert.equal(modeloVerificadoGenerali('IBIZA', 'IBIZA', 'Seleccione uno'), false)
  assert.equal(modeloVerificadoGenerali('IBIZA', 'IBIZA ST', 'IBIZA ST'), false)
  assert.equal(modeloVerificadoGenerali('', '', ''), false)
})

test('v0.2.13 · clasificarPostConfirmarGenerali: siguiente / validación / desconocida / esperar', () => {
  const base = { identificacion: false, selectorAbierto: true, mensajes: [] as string[], transcurridoMs: 0, esperaMs: 25_000 }
  assert.equal(clasificarPostConfirmarGenerali({ ...base, identificacion: true, selectorAbierto: false }), 'siguiente')
  assert.equal(clasificarPostConfirmarGenerali({ ...base, identificacion: true }), 'esperar', 'Identificación con el selector aún abierto: espera')
  assert.equal(clasificarPostConfirmarGenerali({ ...base, transcurridoMs: 10_000 }), 'esperar')
  assert.equal(clasificarPostConfirmarGenerali({ ...base, mensajes: ['Campo obligatorio'], transcurridoMs: 1_000 }), 'esperar', 'gracia mínima')
  assert.equal(clasificarPostConfirmarGenerali({ ...base, mensajes: ['Campo obligatorio'], transcurridoMs: 5_000 }), 'validacion')
  assert.equal(clasificarPostConfirmarGenerali({ ...base, transcurridoMs: 25_000 }), 'validacion')
  assert.equal(clasificarPostConfirmarGenerali({ ...base, selectorAbierto: false, transcurridoMs: 25_000 }), 'desconocida')
  assert.equal(clasificarPostConfirmarGenerali({ ...base, selectorAbierto: false, transcurridoMs: 3_000 }), 'esperar')
})

test('v0.2.13 · modelo que no queda en el label: reintento y, si sigue sin casar, hueco SIN pulsar «Confirmar»', async () => {
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['IBIZA', 'LEON']))
  try {
    // El portal "revierte" el label del modelo tras cada elección (el select queda bien, el label no).
    await page.evaluate(() => { const l = document.getElementById('selmodelo_label')!; new MutationObserver(() => { if (l.textContent !== 'Seleccione uno') l.textContent = 'Seleccione uno' }).observe(l, { childList: true, characterData: true, subtree: true }) })
    await assert.rejects(seleccionarVehiculoGenerali(page, page, coche(), ctxPF(page, guard)), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /el modelo no quedó seleccionado: label=«Seleccione uno», input=«IBIZA»/.test(e.message) && (e as { pideInventarioDom?: boolean }).pideInventarioDom === true)
    assert.equal(await page.evaluate(() => (window as unknown as { __confirmado?: number }).__confirmado ?? 0), 0, 'no se pulsó «Confirmar»')
  } finally {
    await cerrar()
  }
})

test('v0.2.13 · tras «Confirmar» con el selector abierto: hueco que cita los mensajes de validación visibles', async () => {
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['IBIZA']) + '<div class="ui-messages ui-messages-error"><ul><li><span class="ui-messages-error-summary">Debe seleccionar un modelo</span></li></ul></div>')
  try {
    await assert.rejects(seleccionarVehiculoGenerali(page, page, coche(), ctxPF(page, guard)), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /SIGUE ABIERTO/.test(e.message) && /«Debe seleccionar un modelo»/.test(e.message) && (e as { pideInventarioDom?: boolean }).pideInventarioDom === true)
    assert.equal(await page.evaluate(() => (window as unknown as { __confirmado?: number }).__confirmado ?? 0), 1)
  } finally {
    await cerrar()
  }
})

// ───────────── v0.2.14: Potencia · Versión · tabla · «Resumen» · «Siguiente» ─────────────

type FilaFixture = { codigo: string; modelo: string; version: string; cv: number }
/** Ficha real del selector tras el modelo (datos de catálogo de prueba): grupo de potencias, tabla Código | Modelo | Versión y «Resumen» que se pinta al elegir la fila (AJAX simulado). */
const FICHA_PF = (potencias: string[], filas: FilaFixture[], resumenMal = false) => `<span>Potencia</span>
  <table><tr>${potencias.map((p, i) => `<td><input type="radio" id="pot:${i}" name="pot" style="position:absolute;left:-999px" onchange="window.__pot=(window.__pot||[]).concat('${p}');var cv=${parseFloat(p)};document.querySelectorAll('#tabla tbody tr').forEach(function(r){r.style.display=(Number(r.dataset.cv)===cv)?'':'none'})"><label for="pot:${i}">${p}</label></td>`).join('')}</tr></table>
  <span>Versión</span>
  <table id="tabla"><thead><tr><th>Código</th><th>Modelo</th><th>Versión</th></tr></thead><tbody>${filas.map((f) => `<tr data-ri="${f.codigo}" data-cv="${f.cv}" onclick="window.__sel(this,'${f.codigo}','${f.version}')"><td>${f.codigo}</td><td>${f.modelo}</td><td>${f.version}</td></tr>`).join('')}</tbody></table>
  <div id="resumen"><b>Resumen</b><div>Vehículo: TODO TERRENO</div><div>Código y descripción: <span id="res"></span></div></div>
  <script>window.__sel=function(tr,c,v){document.querySelectorAll('#tabla tbody tr').forEach(function(r){r.classList.remove('ui-state-highlight')});tr.classList.add('ui-state-highlight');window.__fila=(window.__fila||[]).concat(c);setTimeout(function(){document.getElementById('res').textContent=${resumenMal ? "'99999 OTRO COCHE'" : "c+' HYUNDAI TUCSON '+v+' ...'"}},150)}</script>`

const FILAS_TUCSON: FilaFixture[] = [
  { codigo: '41001', modelo: 'TUCSON', version: '1.6 GDI BD NLINE LITE 4X2', cv: 116 },
  { codigo: '41002', modelo: 'TUCSON', version: '1.6 GDI BD KLASS 4X2', cv: 116 },
  { codigo: '41003', modelo: 'TUCSON', version: '1.6 T-GDI 48V MAXX 4X2', cv: 131 },
]
const VC_TUCSON = { origen: 'mapfre' as const, denominacion: 'HYUNDAI TUCSON 1.6 GDI', cv: 116, cc: 1598, puertas: 5, fechaInicio: null, combustible: 'gasolina' as const }
const POTENCIAS = ['116.0 CV', '131.0 CV', '185.0 CV', '190.0 CV', '265.0 CV', '288.0 CV']
const contador = (page: Page, k: string) => page.evaluate((n) => (window as unknown as Record<string, unknown>)[n] ?? null, k)

test('v0.2.14 · helpers puros: CV de «116.0 CV», grupo de potencias (no «Placas especiales») y «Resumen» contra la fila elegida', () => {
  assert.equal(cvDePotenciaGenerali('116.0 CV'), 116)
  assert.equal(cvDePotenciaGenerali('131 cv'), 131)
  assert.equal(cvDePotenciaGenerali('Gasolina'), null)
  const g = (clave: string, opciones: string[], total = opciones.length) => ({ clave, etiqueta: clave, tipo: 'grupo', opciones, total })
  assert.deepEqual(grupoPotenciaGenerali([g('grupo|placaesp', ['Sí', 'No']), g('grupo|pot', POTENCIAS)]), { grupo: 'pot', opciones: POTENCIAS })
  assert.equal(grupoPotenciaGenerali([g('grupo|placaesp', ['Sí', 'No'])]), null)
  assert.equal(grupoPotenciaGenerali([g('grupo|pot', ['116.0 CV', 'otra'])]), null, 'todas las opciones tienen que ser «NNN CV»')
  assert.equal(grupoPotenciaGenerali([g('grupo|pot', POTENCIAS), g('grupo|pot2', ['120 CV'])]), null, 'dos grupos: ambiguo')
  const f = { codigo: '41001', version: '1.6 GDI BD NLINE LITE 4X2' }
  assert.equal(resumenCoincideConFilaGenerali('41001 HYUNDAI TUCSON 1.6 GDI …', f), true, 'por código, aunque la descripción venga recortada')
  assert.equal(resumenCoincideConFilaGenerali('410010 HYUNDAI TUCSON', f), false, 'el código es palabra entera')
  assert.equal(resumenCoincideConFilaGenerali('99999 OTRO COCHE', f), false)
  assert.equal(resumenCoincideConFilaGenerali('', f), false)
  assert.equal(resumenCoincideConFilaGenerali('HYUNDAI TUCSON 1.6 GDI BD NLINE LITE 4X2', { codigo: '', version: f.version }), true, 'sin código, la versión entera')
  assert.equal(resumenCoincideConFilaGenerali('HYUNDAI TUCSON 1.6 GDI', { codigo: '', version: f.version }), false)
})

test('v0.2.14 · potencia: la que casa con el CV del vehículo (±10 %); varias materialmente distintas o sin CV → `eleccion` con todas; equivalentes → la primera, declarada', () => {
  const form = (cv: number | null) => coche(cv === null ? {} : { vehiculoConfirmado: { ...VC_TUCSON, cv } })
  const a = decidirPotenciaGenerali(POTENCIAS, form(116))
  assert.equal(a.texto, '116.0 CV')
  assert.throws(() => decidirPotenciaGenerali(POTENCIAS, form(120)), (e: unknown) => e instanceof ErrorEleccionVersion && e.tipo === 'eleccion' && e.opcionesVersion.length === 6, '116 y 131 caben en ±10 % de 120 pero difieren entre sí: se pregunta')
  assert.throws(() => decidirPotenciaGenerali(POTENCIAS, form(null)), (e: unknown) => e instanceof ErrorEleccionVersion && e.opcionesVersion.length === 6)
  assert.throws(() => decidirPotenciaGenerali(POTENCIAS, form(400)), ErrorEleccionVersion, 'ninguna compatible')
  const eq = decidirPotenciaGenerali(['116.0 CV', '118.0 CV'], form(null))
  assert.equal(eq.texto, '116.0 CV')
  assert.match(eq.supuesto ?? '', /Versión elegida automáticamente/)
  const humano = coche({ eleccionVersion: { codigo: null, etiqueta: '131.0 CV' } })
  assert.equal(decidirPotenciaGenerali(POTENCIAS, humano).texto, '131.0 CV', 'la elección de una persona manda')
})

test('v0.2.14 · versión: equivalentes → una, declarada; diferencia material (combustible) → `eleccion`; el combustible del vehículo confirmado la resuelve; una elección de potencia no cuenta como versión', () => {
  const eq = decidirFilaVersionGenerali(FILAS_TUCSON.slice(0, 2).map((f) => ({ ...f, seleccionada: false })), coche())
  assert.equal(eq.fila.codigo, '41001')
  assert.match(eq.supuesto ?? '', /Versión elegida automáticamente: 1\.6 GDI BD NLINE LITE 4X2/)
  const mat = [
    { codigo: '1', modelo: 'X', version: '1.6 GASOLINA 4X2', seleccionada: false },
    { codigo: '2', modelo: 'X', version: '1.6 DIESEL 4X2', seleccionada: false },
  ]
  assert.throws(() => decidirFilaVersionGenerali(mat, coche()), (e: unknown) => e instanceof ErrorEleccionVersion && e.opcionesVersion.length === 2 && e.opcionesVersion[1]!.codigo === '2')
  assert.equal(decidirFilaVersionGenerali(mat, coche({ vehiculoConfirmado: VC_TUCSON })).fila.codigo, '1', 'combustible exacto del vehículo confirmado')
  const persona = coche({ eleccionVersion: { codigo: '2', etiqueta: '1.6 DIESEL 4X2' } })
  assert.equal(decidirFilaVersionGenerali(mat, persona).fila.codigo, '2')
  const deLaPotencia = coche({ vehiculoConfirmado: VC_TUCSON, eleccionVersion: { codigo: null, etiqueta: '116.0 CV' } })
  assert.equal(decidirFilaVersionGenerali(mat, deLaPotencia, ['116.0 CV']).fila.codigo, '1', 'una potencia elegida por la persona no se toma por versión')
})

const NUEVOS_FICHA = (resumenMal = false, filas = FILAS_TUCSON, potencias = POTENCIAS) => FICHA_PF(potencias, filas, resumenMal)

test('v0.2.14 · selector con Potencia + tabla: marca la potencia que casa, elige la fila, verifica el «Resumen» y avanza con «Siguiente» (una vez)', async () => {
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Siguiente', ['IBIZA', 'LEON'], NUEVOS_FICHA()))
  try {
    const avisos: string[] = []
    await assert.rejects(seleccionarVehiculoGenerali(page, page, coche({ vehiculoConfirmado: VC_TUCSON }), ctxPF(page, guard), avisos), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /sigue a «Confirmar»/.test(e.message), 'sin «Identificación del vehículo» en la fixture: hueco POSTERIOR a avanzar')
    assert.deepEqual(await contador(page, '__pot'), ['116.0 CV'])
    assert.deepEqual(await contador(page, '__fila'), ['41001'], 'las dos versiones de 116 CV son equivalentes: la primera')
    assert.equal(await contador(page, '__confirmado'), 1, '«Siguiente» pulsado una vez, con el resumen ya verificado')
    assert.equal(await contador(page, '__cancelar'), null)
    assert.ok(avisos.some((a) => /Versión elegida automáticamente: 1\.6 GDI BD NLINE LITE 4X2/.test(a)), 'la versión elegida sola se declara')
    assert.equal(guard.violacion(), null)
  } finally {
    await cerrar()
  }
})

test('v0.2.14 · el «Resumen» no coincide con la fila elegida → hueco y NO se pulsa «Siguiente»', async () => {
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Siguiente', ['IBIZA'], NUEVOS_FICHA(true)))
  try {
    await assert.rejects(seleccionarVehiculoGenerali(page, page, coche({ vehiculoConfirmado: VC_TUCSON }), ctxPF(page, guard)), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /«Resumen» del selector no coincide/.test(e.message) && /99999/.test(e.message))
    assert.deepEqual(await contador(page, '__fila'), ['41001'])
    assert.equal(await contador(page, '__confirmado'), null, 'no se avanzó')
  } finally {
    await cerrar()
  }
})

test('v0.2.14 · versiones materialmente distintas: `eleccion` con todas las filas y NI fila NI «Siguiente»; potencias ambiguas: `eleccion` y ni potencia', async () => {
  const mat: FilaFixture[] = [
    { codigo: '1', modelo: 'X', version: '1.6 GASOLINA 4X2', cv: 116 },
    { codigo: '2', modelo: 'X', version: '1.6 DIESEL 4X2', cv: 116 },
  ]
  const a = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Siguiente', ['IBIZA'], NUEVOS_FICHA(false, mat, ['116.0 CV'])))
  try {
    await assert.rejects(seleccionarVehiculoGenerali(a.page, a.page, coche(), ctxPF(a.page, a.guard)), (e: unknown) => e instanceof ErrorEleccionVersion && e.tipo === 'eleccion' && e.opcionesVersion.length === 2)
    assert.deepEqual(await contador(a.page, '__pot'), ['116.0 CV'], 'la potencia única sí se marcó')
    assert.equal(await contador(a.page, '__fila'), null)
    assert.equal(await contador(a.page, '__confirmado'), null)
  } finally {
    await a.cerrar()
  }
  const b = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Siguiente', ['IBIZA'], NUEVOS_FICHA()))
  try {
    await assert.rejects(seleccionarVehiculoGenerali(b.page, b.page, coche(), ctxPF(b.page, b.guard)), (e: unknown) => e instanceof ErrorEleccionVersion && e.opcionesVersion.length === 6)
    assert.equal(await contador(b.page, '__pot'), null, 'sin CV del vehículo y potencias distintas: no se marca ninguna')
    assert.equal(await contador(b.page, '__confirmado'), null)
  } finally {
    await b.cerrar()
  }
})

test('v0.2.14 · puertas del guard: potencia (solo «NNN CV», nunca «Placas especiales», una vez), fila de la tabla (texto exacto, una vez) y «Siguiente»/«Confirmar» exactos', async () => {
  assert.equal(botonSelectorVehiculosGeneraliPermitido('Siguiente'), true)
  assert.equal(botonSelectorVehiculosGeneraliPermitido(' siguiente '), true)
  for (const t of ['Siguiente paso', 'Anterior', 'Cancelar', 'Siguiente y emitir']) assert.equal(botonSelectorVehiculosGeneraliPermitido(t), false, t)
  const html = PRIMEFACES_HTML(['SEAT'], 'Siguiente', ['IBIZA'], NUEVOS_FICHA())
  const a = await abrir(SEL_VEHICULOS, html)
  try {
    await assert.rejects(elegirPotenciaGenerali(a.page, a.guard, 'placaesp', 'No'), EmisionBloqueadaError, 'el grupo de «Placas especiales» no es de potencia')
    await assert.rejects(elegirPotenciaGenerali(a.page, a.guard, 'pot', 'Sí'), EmisionBloqueadaError, 'solo textos «NNN CV»')
    await assert.rejects(elegirPotenciaGenerali(a.page, a.guard, 'pot', '999.0 CV'), (e: unknown) => e instanceof ErrorMapaGuardGenerali, 'que no existe')
    await a.page.evaluate(() => { (document.getElementById('bloque_modelo') as HTMLElement).style.display = 'block'; (document.getElementById('nuevos') as HTMLElement).style.display = 'block' })
    await elegirPotenciaGenerali(a.page, a.guard, 'pot', '131.0 CV')
    assert.deepEqual(await contador(a.page, '__pot'), ['131.0 CV'])
    await assert.rejects(elegirPotenciaGenerali(a.page, a.guard, 'pot', '116.0 CV'), EmisionBloqueadaError, 'una vez por trabajo')
    await assert.rejects(elegirFilaVersionGenerali(a.page, a.guard, '41001', '1.6 GDI BD'), (e: unknown) => e instanceof ErrorMapaGuardGenerali, 'texto exacto, no parcial')
    await assert.rejects(elegirFilaVersionGenerali(a.page, a.guard, '99999', '1.6 T-GDI 48V MAXX 4X2'), (e: unknown) => e instanceof ErrorMapaGuardGenerali, 'el código también tiene que casar')
    await elegirFilaVersionGenerali(a.page, a.guard, '41003', '1.6 T-GDI 48V MAXX 4X2')
    assert.deepEqual(await contador(a.page, '__fila'), ['41003'])
    await assert.rejects(elegirFilaVersionGenerali(a.page, a.guard, '41003', '1.6 T-GDI 48V MAXX 4X2'), (e: unknown) => e instanceof EmisionBloqueadaError || e instanceof ErrorMapaGuardGenerali, 'una vez por trabajo')
    await pulsarAvanzarSelectorVehiculosGenerali(a.page, a.guard)
    assert.equal(await contador(a.page, '__confirmado'), 1)
    await assert.rejects(pulsarAvanzarSelectorVehiculosGenerali(a.page, a.guard), EmisionBloqueadaError, 'una vez')
  } finally {
    await a.cerrar()
  }
  const b = await abrir(PORTAL, html)
  try {
    await assert.rejects(elegirPotenciaGenerali(b.page, b.guard, 'pot', '116.0 CV'), (e: unknown) => e instanceof ErrorTarificador, 'otra URL: no es el selector')
    await assert.rejects(elegirFilaVersionGenerali(b.page, b.guard, null, '1.6 GDI BD NLINE LITE 4X2'), (e: unknown) => e instanceof ErrorTarificador)
  } finally {
    await b.cerrar()
  }
  const c = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Siguiente paso', ['IBIZA']))
  try {
    await assert.rejects(pulsarAvanzarSelectorVehiculosGenerali(c.page, c.guard), (e: unknown) => e instanceof ErrorMapaGuardGenerali)
    assert.equal(await contador(c.page, '__confirmado'), null)
  } finally {
    await c.cerrar()
  }
})

// ───────────── v0.2.17: combustible · potencia con «No lo sé» · «Versión» desplegable con textos REPETIDOS (prueba real 22/10/2026) ─────────────

const VERSIONES_0217 = ['2.5 TCI', '2.9 CRDI 163 FULL', '2.9 CRDI 163 FULL', '2.9 CRDI 163 FULL AUTO', '2.9 CRDI 163 GL', '2.9 CRDI 163 GLS', '3.5 V6 195']
/** Grupos «combustible» y «potencia» (con «No lo sé») y SelectOneMenu «Versión» (id de prueba `selversion`); la potencia FILTRA la lista por AJAX (300 ms). `extra` sale al elegir la versión. */
const FICHA_0217 = (extra = '') => {
  const grupo = (name: string, ops: string[]) => `<table><tr>${ops.map((o, i) => `<td><input type="radio" id="${name}:${i}" name="${name}" style="position:absolute;left:-999px" onchange="window.__${name}=(window.__${name}||[]).concat('${o}');${name === 'potencia' ? `setTimeout(function(){window.__filtrar('${o}')},300)` : ''}"><label for="${name}:${i}">${o}</label></td>`).join('')}</tr></table>`
  return `<span>combustible</span>${grupo('combustible', ['Diésel', 'Gasolina', 'No lo sé'])}
  <span>potencia</span>${grupo('potencia', ['100.0 CV', '150.0 CV', '163.0 CV', '195.0 CV', 'No lo sé'])}
  <span>Versión</span>
  <div id="selversion" role="combobox" tabindex="0" onclick="document.getElementById('selversion_panel').style.display='block'"><div class="ui-helper-hidden-accessible" style="position:absolute;width:0;height:0;overflow:hidden"><select id="selversion_input" name="selversion_input" style="width:0;height:0;border:0;padding:0"></select></div><label id="selversion_label" class="ui-selectonemenu-label">Seleccione una</label><div class="ui-selectonemenu-trigger"><span class="ui-icon ui-icon-triangle-1-s"></span></div></div>
  <div id="selversion_panel" style="display:none"><ul id="selversion_items"></ul></div>
  <div id="extra" style="display:none">${extra}</div>
  <script>
    window.__pintar=function(vs){var s=document.getElementById('selversion_input');s.innerHTML='<option value="null">Seleccione una</option>'+vs.map(function(v,i){return '<option value="V'+i+'">'+v+'</option>'}).join('');
      document.getElementById('selversion_items').innerHTML=vs.map(function(v){return '<li data-label="'+v+'" class="ui-selectonemenu-item">'+v+'</li>'}).join('');
      Array.from(document.querySelectorAll('#selversion_items li')).forEach(function(li,i){li.onclick=function(){s.selectedIndex=i+1;document.getElementById('selversion_label').textContent=li.dataset.label;window.__version=(window.__version||[]).concat(i);document.getElementById('selversion_panel').style.display='none';document.getElementById('extra').style.display='block'}})};
    window.__filtrar=function(p){var n=parseFloat(p);window.__pintar(${JSON.stringify(VERSIONES_0217)}.filter(function(v){return isNaN(n)||v.split(' ').indexOf(String(n))>=0}))};
    window.__pintar(${JSON.stringify(VERSIONES_0217)});
  </script>`
}
const ctx0217 = (page: Page, guard: GuardEmision) => ({
  ...(ctxPF(page, guard) as unknown as Record<string, unknown>),
  elegirCombustibleGenerali: (g: string, t: string) => elegirCombustibleGenerali(page, guard, g, t),
  abrirDesplegableVersionGenerali: (base: string) => abrirDesplegableVersionGenerali(page, guard, base),
  elegirVersionListaGenerali: (base: string, texto: string) => elegirVersionListaGenerali(page, guard, base, texto),
}) as unknown as ContextoPortal

test('v0.2.17 · combustible → potencia (CV exacto) → recarga → versión repetida: la PRIMERA de las idénticas, declarada, verificada y «Confirmar» una vez', async () => {
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['IBIZA', 'LEON'], FICHA_0217()))
  try {
    const avisos: string[] = []
    const form = coche({ seleccionVehiculo: { marca: 'SEAT', modelo: 'IBIZA', descripcion: '2.9 CRDI 163 FULL' }, vehiculoConfirmado: { origen: 'mapfre', denominacion: 'SEAT IBIZA 2.9 CRDI 163 FULL', cv: 163, cc: 2902, puertas: 5, fechaInicio: null, combustible: 'diesel' } })
    await assert.rejects(seleccionarVehiculoGenerali(page, page, form, ctx0217(page, guard), avisos), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /sigue a «Confirmar»/.test(e.message), 'sin «Identificación del vehículo» en la fixture: hueco POSTERIOR a «Confirmar»')
    assert.deepEqual(await contador(page, '__combustible'), ['Diésel'])
    assert.deepEqual(await contador(page, '__potencia'), ['163.0 CV'])
    assert.deepEqual(await contador(page, '__version'), [0], 'lista filtrada a las de 163: la primera «2.9 CRDI 163 FULL»')
    assert.equal(await page.locator('#selversion_input').inputValue(), 'V0')
    assert.equal(await page.locator('#selversion_label').textContent(), '2.9 CRDI 163 FULL')
    assert.equal(await contador(page, '__confirmado'), 1)
    assert.ok(avisos.some((a) => /Versión elegida automáticamente: 2\.9 CRDI 163 FULL \(había 2 equivalentes; revisar en la emisión\)/.test(a)), avisos.join(' | '))
    assert.equal(guard.violacion(), null)
  } finally {
    await cerrar()
  }
})

test('v0.2.17 · sin combustible ni CV en el riesgo: «No lo sé» declarado en los dos grupos y la versión se PREGUNTA (sin «Confirmar»)', async () => {
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['IBIZA'], FICHA_0217()))
  try {
    const avisos: string[] = []
    const form = coche({ seleccionVehiculo: { marca: 'SEAT', modelo: 'IBIZA' } })
    await assert.rejects(seleccionarVehiculoGenerali(page, page, form, ctx0217(page, guard), avisos), (e: unknown) => e instanceof ErrorEleccionVersion && e.tipo === 'eleccion' && e.opcionesVersion.length === 6, 'la lista sin repetidos')
    assert.deepEqual(await contador(page, '__combustible'), ['No lo sé'])
    assert.deepEqual(await contador(page, '__potencia'), ['No lo sé'])
    assert.equal(await contador(page, '__version'), null)
    assert.equal(await contador(page, '__confirmado'), null)
    assert.ok(avisos.some((a) => /combustible del vehículo no consta.*«No lo sé»/.test(a)) && avisos.some((a) => /potencia del vehículo no consta.*«No lo sé»/.test(a)), avisos.join(' | '))
  } finally {
    await cerrar()
  }
})

test('v0.2.36 · sin combustible ni CV en el riesgo: se DEDUCEN de la versión («2.9 CRDI 163 FULL» → Diésel, 163.0 CV) con aviso de supuesto, sin «No lo sé»', async () => {
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['IBIZA'], FICHA_0217()))
  try {
    const avisos: string[] = []
    const form = coche({ seleccionVehiculo: { marca: 'SEAT', modelo: 'IBIZA', descripcion: '2.9 CRDI 163 FULL' } })
    await assert.rejects(seleccionarVehiculoGenerali(page, page, form, ctx0217(page, guard), avisos), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali)
    assert.deepEqual(await contador(page, '__combustible'), ['Diésel'])
    assert.deepEqual(await contador(page, '__potencia'), ['163.0 CV'])
    assert.ok(avisos.some((a) => /combustible\/potencia deducidos de la versión «2\.9 CRDI 163 FULL» \(supuesto; revisar en la emisión\)/.test(a)), avisos.join(' | '))
    assert.ok(!avisos.some((a) => /«No lo sé»/.test(a)), avisos.join(' | '))
  } finally {
    await cerrar()
  }
})

test('v0.2.17 · un campo nuevo que sale tras elegir la versión sigue PARANDO antes de «Confirmar»', async () => {
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['IBIZA'], FICHA_0217('<span>Valor venal</span><input type="text" id="valorvenal">')))
  try {
    const form = coche({ seleccionVehiculo: { marca: 'SEAT', modelo: 'IBIZA', descripcion: '3.5 V6 195' }, vehiculoConfirmado: { origen: 'mapfre', denominacion: 'SEAT IBIZA 3.5 V6 195', cv: 195, cc: 3497, puertas: 5, fechaInicio: null, combustible: 'gasolina' } })
    await assert.rejects(seleccionarVehiculoGenerali(page, page, form, ctx0217(page, guard)), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /tras elegir combustible, potencia y versión/.test(e.message) && /Valor venal/.test(e.message))
    assert.deepEqual(await contador(page, '__version'), [0], 'filtrada a «3.5 V6 195»')
    assert.equal(await contador(page, '__confirmado'), null, 'NO se pulsa «Confirmar»')
  } finally {
    await cerrar()
  }
})

test('v0.2.17 · puertas del guard: combustible (lista blanca, grupo «combustible», una vez), potencia «No lo sé», versión (ni el menú de modelos, repetida → la primera, una vez)', async () => {
  const a = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['IBIZA'], FICHA_0217()))
  try {
    await a.page.evaluate(() => { (document.getElementById('bloque_modelo') as HTMLElement).style.display = 'block'; (document.getElementById('nuevos') as HTMLElement).style.display = 'block' })
    await assert.rejects(elegirCombustibleGenerali(a.page, a.guard, 'potencia', 'No lo sé'), EmisionBloqueadaError, 'el grupo tiene que ser de combustible')
    await assert.rejects(elegirCombustibleGenerali(a.page, a.guard, 'placaesp', 'No'), EmisionBloqueadaError)
    await assert.rejects(elegirCombustibleGenerali(a.page, a.guard, 'combustible', 'Aceptar'), EmisionBloqueadaError, 'solo combustibles o «No lo sé»')
    await elegirCombustibleGenerali(a.page, a.guard, 'combustible', 'Gasolina')
    assert.deepEqual(await contador(a.page, '__combustible'), ['Gasolina'])
    await assert.rejects(elegirCombustibleGenerali(a.page, a.guard, 'combustible', 'Diésel'), EmisionBloqueadaError, 'una vez por trabajo')
    await elegirPotenciaGenerali(a.page, a.guard, 'potencia', 'No lo sé')
    assert.deepEqual(await contador(a.page, '__potencia'), ['No lo sé'])
    await abrirDesplegableModeloGenerali(a.page, a.guard, 'selmodelo')
    await assert.rejects(abrirDesplegableVersionGenerali(a.page, a.guard, 'selmodelo'), EmisionBloqueadaError, 'la puerta de versión no abre el menú de modelos')
    await assert.rejects(abrirDesplegableVersionGenerali(a.page, a.guard, 'buscamarca'), EmisionBloqueadaError, 'ni el de marcas')
    await a.page.waitForTimeout(400)
    await abrirDesplegableVersionGenerali(a.page, a.guard, 'selversion')
    await assert.rejects(abrirDesplegableVersionGenerali(a.page, a.guard, 'selversion'), EmisionBloqueadaError, 'una vez')
    await assert.rejects(elegirVersionListaGenerali(a.page, a.guard, 'selversion', '2.9 CRDI'), (e: unknown) => e instanceof ErrorMapaGuardGenerali, 'texto exacto, no parcial')
    await elegirVersionListaGenerali(a.page, a.guard, 'selversion', '2.9 CRDI 163 FULL')
    assert.deepEqual(await contador(a.page, '__version'), [1], 'repetida: el PRIMER `li` de los idénticos')
    await assert.rejects(elegirVersionListaGenerali(a.page, a.guard, 'selversion', '2.5 TCI'), EmisionBloqueadaError, 'una vez')
    await assert.rejects(elegirModeloListaGenerali(a.page, a.guard, 'selmodelo', '2.9 CRDI 163 FULL'), (e: unknown) => e instanceof ErrorTarificador, 'la puerta de modelo no elige versiones repetidas')
  } finally {
    await a.cerrar()
  }
  const b = await abrir(PORTAL, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['IBIZA'], FICHA_0217()))
  try {
    await assert.rejects(elegirCombustibleGenerali(b.page, b.guard, 'combustible', 'Gasolina'), (e: unknown) => e instanceof ErrorTarificador, 'otra URL: no es el selector')
    await assert.rejects(abrirDesplegableVersionGenerali(b.page, b.guard, 'selversion'), (e: unknown) => e instanceof ErrorTarificador)
    assert.equal(await contador(b.page, '__combustible'), null)
  } finally {
    await b.cerrar()
  }
})
