// Allianz MOTO: formulario editable (Riesgo municipio + Datos básicos) y pantalla de error. Fixture SINTÉTICA: estructura y
// ids del mapa de la grabación del 13/10/2026, con marcas/modelos/matrícula/fechas/CP ficticios. Los manejadores
// (`onclick`/`onchange`) son literales del código del portal, no datos de nadie.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import {
  allianzMoto,
  AUTO_ACTIVO,
  MOTO_ACTIVO,
  avanzarPestanaGuardada,
  buscarPoblacion,
  ErrorEleccionPoblacion,
  comprobarTitularesMoto,
  consultarMatriculaMoto,
  elegirVehiculoMoto,
  ErrorEleccionVersion,
  ErrorMapaIncompleto,
  incidenciaDesdeFila,
  lanzarSiHayErrores,
  leerIncidencias,
  leerVehiculoPortal,
  planDatosBasicosMoto,
  rellenarDatosBasicosMoto,
  rellenarRiesgoMoto,
  resolverVehiculo,
  valorClaseMoto,
  valorOpcionExacta,
} from '../src/adapters/allianz/auto.ts'
import { clasificarIntento, ErrorTarificador, opcionesPoblacionDe, pideInventarioDom } from '../src/errores.ts'
import { esElementoOpcion, prepararFormador, type ContextoFormador } from '../src/formador.ts'
import { comprobarBoton, EmisionBloqueadaError, type FormularioAuto } from '@central/module-tarificacion'

const form: FormularioAuto = {
  ramo: 'moto',
  matricula: '0000BBB',
  codigoPostal: '00000',
  conductor: { fechaNacimiento: '1990-02-03', fechaCarne: '2010-04-05', sexo: 'mujer' },
  tomadorEsConductor: true,
  tomadorEsPropietario: true,
  aniosAseguradoAnterior: 3,
  siniestrosUltimos5Anios: 0,
  garajeNoche: true,
  tomador: null,
  documentoTomador: '00000000T',
  eleccionVersion: null,
  seleccionVehiculo: { marca: 'Marca Prueba', modelo: 'Modelo X', clase: 1, cilindradaCc: 125 },
}

const OPC = (xs: Array<[string, string]>) => xs.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')

// Riesgo municipio: cascada marca → clase → modelo → versión; la lupa rellena la población.
const RIESGO = (versiones: Array<[string, string]> = [['V1', 'Version unica']], poblacion = true) => `<body><form>
<select id="marca"><option value=""></option>${OPC([['MARCA PRUEBA', 'MARCA PRUEBA'], ['OTRA', 'OTRA']])}</select>
<select id="clase" disabled><option value=""></option></select>
<select id="modelo" disabled><option value=""></option></select>
<select id="version" disabled><option value=""></option></select>
<input id="_cpostalCode" type="tel" onkeyup="javascript:if (onEnterEvent(event)){$(document.getElementById('_cpostalCodeAjaxLocFinderImg')).trigger('click');}">
<input id="_destown" type="text">
<input id="idNifTaker_doc" name="idNifTaker_doc" type="text" onchange="inputChange('idNifTaker_doc','idDocTaker')">
<input type="hidden" name="idDocTaker" id="idDocTaker" data-mask=";mask:hidden;;">
<img id="_cpostalCodeAjaxLocFinderImg" src="data:," onclick="sendRequestLocationFinder({'id':'_cpostalCode'});">
<select id="takerDriver" onchange="displayDriver()"><option value=""></option><option value="S">Si</option><option value="N">No</option></select>
<select id="takerOwner" onchange="displayOwner()"><option value=""></option><option value="S">Si</option><option value="N">No</option></select>
<table><tr><td id="store" onclick="window.archivado=1">Archivar</td><td id="contract" onclick="validar_aceptar()">Emitir</td></tr></table>
</form><script>
var inputChange = (de, a) => { document.getElementById(a).value = document.getElementById(de).value }
var llenar = (id, ops) => { const s = document.getElementById(id); s.length = 1; ops.forEach(([v, t]) => s.add(new Option(t, v))); s.disabled = false }
var sendRequestLocationFinder = () => ${poblacion ? "setTimeout(() => { document.getElementById('_destown').value = 'POBLACION PRUEBA' }, 50)" : '0'}
document.getElementById('marca').addEventListener('change', () => setTimeout(() => llenar('clase', [['1.Hasta 125 c.c.', '1.Hasta 125 c.c.'], ['2.Hasta 350 c.c.', '2.Hasta 350 c.c.']]), 30))
document.getElementById('clase').addEventListener('change', () => setTimeout(() => llenar('modelo', [['MODELO X', 'MODELO X'], ['MODELO Y', 'MODELO Y']]), 30))
document.getElementById('modelo').addEventListener('change', () => setTimeout(() => { llenar('version', ${JSON.stringify(versiones)}); if (${versiones.length} === 1) document.getElementById('version').value = ${JSON.stringify(versiones[0]?.[0] ?? '')} }, 30))
</script></body>`

const DATOS = (revertirAnios = false) => `<body><form>
<select id="use"><option value="1" selected>Particular</option><option value="4">Autoescuela</option></select>
<input id="driverBirthDate" onchange="javascript:menores25();"><input id="driverLicenseDate" onchange="javascript:funcTrue();">
<select id="driverSex"><option value="V" selected>Hombre</option><option value="H">Mujer</option></select>
<input id="licensePlate" type="text" onchange="javascript:eventoMatriculaDatosBasicos();">
<input id="fechaMatriculacion" type="text" disabled>
<input id="garageNight" type="checkbox" value="S">
<select id="aseguradoOtraCia"><option value="N" selected>No</option><option value="S">Si</option></select>
<select id="yearsOrigCompany" onchange="setAniosSinisters()">${OPC([['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', 'Más de 5']])}</select>
<select id="aniosSinSiniestros" onchange="setNumSinisters()">${OPC([['00', '0'], ['01', '1'], ['02', '2'], ['03', '3'], ['04', '4'], ['05', '5']])}</select>
<input id="numDisasters" value="0">
<table><tr><td id="store" onclick="sendActionEvent('store')">Archivar</td></tr></table>
</form><script>
document.getElementById('licensePlate').addEventListener('change', () => setTimeout(() => { document.getElementById('fechaMatriculacion').value = '07/08/2015' }, 30))
${revertirAnios ? "document.getElementById('aniosSinSiniestros').addEventListener('change', (e) => setTimeout(() => (e.target.value = '00'), 0))" : ''}
</script></body>`

// Buscador de poblaciones con VARIAS (inventario de estructura 13/10/2026, datos INVENTADOS): la lupa pinta celdas
// `receivedDataLocationFinder` «CP- NOMBRE»; pulsar una copia su nombre a `#_destown` (o no, si `efecto` = false).
const POBLACIONES = (nombres: string[], efecto = true) => `<body><form>
<input id="_cpostalCode" type="tel"><input id="_destown" type="text">
<img id="_cpostalCodeAjaxLocFinderImg" src="data:," onclick="sendRequestLocationFinder({'id':'_cpostalCode'});">
<table><tbody id="res"></tbody></table>
<table><tr><td id="store" onclick="window.archivado=1">Archivar</td></tr></table>
</form><script>
window.pulsadas = 0; window.archivado = undefined;
var receivedDataLocationFinder = (o) => { window.pulsadas = (window.pulsadas || 0) + 1; ${efecto ? "document.getElementById('_destown').value = o.nombre" : '0'} }
var sendRequestLocationFinder = () => setTimeout(() => {
  const cp = document.getElementById('_cpostalCode').value;
  ${JSON.stringify(nombres)}.forEach((n) => {
    const td = document.createElement('td')
    td.textContent = cp + '- ' + n
    td.setAttribute('onclick', 'receivedDataLocationFinder({"idDesc":"_destown","cp1":"' + cp + '","cia":2,"id":"_cpostalCode","nombre":"' + n + '"})')
    const tr = document.createElement('tr'); tr.appendChild(td); document.getElementById('res').appendChild(tr)
  })
}, 50)
</script></body>`

let browser: Browser
let page: Page
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
  page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(3_000)
})
after(async () => {
  await browser?.close()
})

// pulsar de prueba: mismo control que el real (comprobarBoton sobre texto/id/onclick) y luego clic.
const ctxPulsar = {
  pulsar: async (l: Locator) => {
    const d = await l.evaluate((el) => [el.textContent, el.id, el.getAttribute('onclick')])
    comprobarBoton(d)
    await l.click()
  },
}

test('Flags separados: Turismos y Moto encendidos (Moto 13/10/2026, Turismos 15/10/2026 para explorar; Alberto)', () => {
  assert.equal(AUTO_ACTIVO, true)
  assert.equal(MOTO_ACTIVO, true)
})

test('valorOpcionExacta / valorClaseMoto: exactas o nada (nunca la parecida)', () => {
  const o = [{ valor: '', etiqueta: '' }, { valor: 'A', etiqueta: 'Marca Prueba' }, { valor: 'B', etiqueta: 'MARCA PRUEBA 2' }, { valor: 'C', etiqueta: 'Otra' }, { valor: 'D', etiqueta: 'OTRA ' }]
  assert.equal(valorOpcionExacta(o, 'marca prueba'), 'A')
  assert.equal(valorOpcionExacta(o, 'MARCA'), null)
  assert.equal(valorOpcionExacta(o, 'otra'), null, 'repetida → no elige')
  assert.equal(valorOpcionExacta(o, '  '), null)
  const c = [{ valor: '1.Hasta 125 c.c.', etiqueta: '1.Hasta 125 c.c.' }, { valor: '4.Mas de 750 c.c.', etiqueta: '4.Mas de 750 c.c.' }]
  assert.equal(valorClaseMoto(c, 4), '4.Mas de 750 c.c.')
  assert.equal(valorClaseMoto(c, 2), null)
})

test('cascada marca → clase → modelo y versión única fijada → vehículo canónico', async () => {
  await page.setContent(RIESGO())
  await elegirVehiculoMoto(page.mainFrame(), form.seleccionVehiculo!, page)
  const v = await resolverVehiculo(page.mainFrame(), await leerVehiculoPortal(page.mainFrame()), form)
  assert.deepEqual(v, { marca: 'MARCA PRUEBA', modelo: 'MODELO X', version: 'Version unica', combustible: null, potenciaCv: null, fechaMatriculacion: null, codigoCatalogo: 'V1' })
  assert.equal(await page.locator('#clase').inputValue(), '1.Hasta 125 c.c.')
})

test('varias versiones sin elección → requiere_humano (no elige); con la elección → la fija', async () => {
  await page.setContent(RIESGO([['V1', 'Version A'], ['V2', 'Version B']]))
  await elegirVehiculoMoto(page.mainFrame(), form.seleccionVehiculo!, page)
  const l = await leerVehiculoPortal(page.mainFrame())
  await assert.rejects(resolverVehiculo(page.mainFrame(), l, form), ErrorEleccionVersion)
  const v = await resolverVehiculo(page.mainFrame(), l, { eleccionVersion: { codigo: 'V2' } })
  assert.equal(v.version, 'Version B')
  assert.equal(await page.locator('#version').inputValue(), 'V2')
})

test('marca/modelo que no están en el catálogo o clase sin dar → error datos, sin tocar nada más', async () => {
  await page.setContent(RIESGO())
  await assert.rejects(elegirVehiculoMoto(page.mainFrame(), { marca: 'Inexistente', modelo: 'X', clase: 1, cilindradaCc: 125 }, page), (e) => e instanceof ErrorTarificador && e.tipo === 'datos')
  await assert.rejects(elegirVehiculoMoto(page.mainFrame(), { marca: 'Marca Prueba', modelo: 'X', clase: null }, page), (e) => e instanceof ErrorTarificador && e.tipo === 'datos')
  await page.setContent(RIESGO())
  await assert.rejects(elegirVehiculoMoto(page.mainFrame(), { marca: 'Marca Prueba', modelo: 'Modelo Z', clase: 1, cilindradaCc: 125 }, page), (e) => e instanceof ErrorTarificador && e.tipo === 'datos')
  await page.setContent(RIESGO())
  await assert.rejects(elegirVehiculoMoto(page.mainFrame(), { marca: 'Marca Prueba', modelo: 'Modelo X', clase: 3 }, page), (e) => e instanceof ErrorTarificador && e.tipo === 'datos', 'clase 3 no existe en el catálogo sintético')
})

test('CP → lupa (con pulsar guardado) → población; sin población = hueco declarado; titulares distintos = hueco', async () => {
  await page.setContent(RIESGO())
  await rellenarRiesgoMoto(page.mainFrame(), form, page, ctxPulsar)
  assert.equal(await page.locator('#_cpostalCode').inputValue(), '00000')
  assert.equal(await page.locator('#_destown').inputValue(), 'POBLACION PRUEBA')
  assert.equal(await page.locator('#idNifTaker_doc').inputValue(), '00000000T', 'v0.7.6: escribe el NIF en el input VISIBLE (idDocTaker es hidden)')
  assert.equal(await page.locator('#idDocTaker').inputValue(), '00000000T', 'v0.7.6: el onchange del portal deja el hidden con valor')
  assert.equal(await page.locator('#takerDriver').inputValue(), 'S')
  assert.equal(await page.locator('#takerOwner').inputValue(), 'S')
  assert.equal(await page.evaluate(() => (window as unknown as { archivado?: number }).archivado), undefined, 'no pulsó Archivar')
  await page.setContent(RIESGO([['V1', 'x']], false))
  await assert.rejects(buscarPoblacion(page.mainFrame(), '00000', page, ctxPulsar, 600), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e))
  assert.throws(() => comprobarTitularesMoto({ tomadorEsConductor: false, tomadorEsPropietario: true }), (e: unknown) => e instanceof ErrorMapaIncompleto && !pideInventarioDom(e))
  assert.throws(() => comprobarTitularesMoto({ tomadorEsConductor: true, tomadorEsPropietario: false }), ErrorMapaIncompleto)
  comprobarTitularesMoto({ tomadorEsConductor: null, tomadorEsPropietario: null })
})

test('v0.7.5 · tomador = conductor/propietario sin NIF → para con «falta el NIF del tomador» (datos), sin tocar el portal; con NIF de la ficha, pasa', async () => {
  const sinNif = { ...form, documentoTomador: null }
  assert.throws(() => comprobarTitularesMoto(sinNif), (e: unknown) => e instanceof ErrorTarificador && e.tipo === 'datos' && /falta el NIF del tomador/.test(e.message))
  await page.setContent(RIESGO())
  await assert.rejects(rellenarRiesgoMoto(page.mainFrame(), sinNif, page, ctxPulsar), /falta el NIF del tomador/)
  assert.equal(await page.locator('#takerDriver').inputValue(), '', 'no marcó nada a ciegas')
  comprobarTitularesMoto({ tomadorEsConductor: true, tomadorEsPropietario: true, fichaTomador: { documento: '00000000T' } } as never) // el NIF de fichaTomador vale
  comprobarTitularesMoto({ tomadorEsConductor: null, tomadorEsPropietario: null }) // nada marcado: no hace falta
  await page.setContent(RIESGO().replace(/<input id="idNifTaker_doc"[^>]*>/, ''))
  await assert.rejects(rellenarRiesgoMoto(page.mainFrame(), form, page, ctxPulsar), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e))
})

test('buscador de poblaciones: una celda → la pulsa; varias + poblacion que casa → esa; sin casar → requiere persona con la lista', async () => {
  await page.setContent(POBLACIONES(['VILLA PRUEBA']))
  await buscarPoblacion(page.mainFrame(), '00001', page, ctxPulsar, 2_000)
  assert.equal(await page.locator('#_destown').inputValue(), 'VILLA PRUEBA')

  await page.setContent(POBLACIONES(['VILLA ÁLAMO', 'PUEBLO NUEVO']))
  await buscarPoblacion(page.mainFrame(), '00001', page, ctxPulsar, 2_000, { poblacion: '  pueblo   nuevo ' })
  assert.equal(await page.locator('#_destown').inputValue(), 'PUEBLO NUEVO')
  assert.equal(await page.evaluate(() => (window as unknown as { pulsadas?: number }).pulsadas), 1, 'una sola celda pulsada')

  await page.setContent(POBLACIONES(['VILLA ÁLAMO', 'PUEBLO NUEVO']))
  await buscarPoblacion(page.mainFrame(), '00001', page, ctxPulsar, 2_000, { poblacion: 'villa alamo' })
  assert.equal(await page.locator('#_destown').inputValue(), 'VILLA ÁLAMO', 'sin tildes ni mayúsculas casa')

  for (const eleccion of [{}, { poblacion: 'Otra' }, { poblacion: 'Villa', localidades: ['Pueblo'] }, { poblacion: 'x', localidades: ['PUEBLO NUEVO', 'VILLA ALAMO'] }, { eleccionPoblacion: '00001- OTRA' }]) {
    await page.setContent(POBLACIONES(['VILLA ÁLAMO', 'PUEBLO NUEVO']))
    await assert.rejects(buscarPoblacion(page.mainFrame(), '00001', page, ctxPulsar, 2_000, eleccion), (e: unknown) => {
      assert.ok(e instanceof ErrorEleccionPoblacion)
      assert.equal(e.tipo, 'eleccion', 'código propio: no es un captcha (15/10/2026)')
      assert.deepEqual(opcionesPoblacionDe(e), [{ codigo: '00001- VILLA ÁLAMO', etiqueta: 'VILLA ÁLAMO' }, { codigo: '00001- PUEBLO NUEVO', etiqueta: 'PUEBLO NUEVO' }])
      return true
    })
    assert.equal(await page.evaluate(() => (window as unknown as { pulsadas?: number }).pulsadas), 0, 'no pulsó ninguna celda')
    assert.equal(await page.locator('#_destown').inputValue(), '')
  }
})

test('v0.7.3 · buscador de poblaciones: la localidad del riesgo por contención de palabras enteras, si da UNA sola; varias/contradictorias/elección de bandeja inválida → persona', async () => {
  const ok = async (nombres: string[], eleccion: Parameters<typeof buscarPoblacion>[5], esperado: string) => {
    await page.setContent(POBLACIONES(nombres))
    await buscarPoblacion(page.mainFrame(), '00001', page, ctxPulsar, 2_000, eleccion)
    assert.equal(await page.locator('#_destown').inputValue(), esperado)
  }
  const persona = async (nombres: string[], eleccion: Parameters<typeof buscarPoblacion>[5]) => {
    await page.setContent(POBLACIONES(nombres))
    await assert.rejects(buscarPoblacion(page.mainFrame(), '00001', page, ctxPulsar, 2_000, eleccion), ErrorEleccionPoblacion)
    assert.equal(await page.locator('#_destown').inputValue(), '')
  }
  await ok(['AMBROZ', 'PURCHIL'], { poblacion: 'Purchil (Granada)' }, 'PURCHIL') // la localidad contiene a la población
  await ok(['LA ZUBIA CENTRO', 'PUEBLO NUEVO'], { poblacion: 'la zubia' }, 'LA ZUBIA CENTRO') // la población contiene a la localidad
  await ok(['AMBROZ', 'PURCHIL'], { poblacion: null, localidades: ['purchíl'] }, 'PURCHIL') // localidad del tomador
  await ok(['AMBROZ', 'PURCHIL'], { poblacion: 'Granada', localidades: ['Purchil'] }, 'PURCHIL') // un candidato sin casar no estorba
  await persona(['GRANADA ZONA A', 'GRANADA ZONA B'], { poblacion: 'Granada' }) // solo el municipio, varias pedanías: no a ciegas
  await ok(['GRANADA ZONA A', 'GRANADA ZONA B', 'PURCHIL'], { poblacion: 'Granada', localidades: ['Purchil'] }, 'PURCHIL') // v0.7.4: el candidato ambiguo se descarta y se prueba el siguiente
  await persona(['AMBROZ', 'PURCHIL'], { poblacion: 'Ambroz (Granada)', localidades: ['Purchil'] }) // candidatos contradictorios
  await persona(['AMBROZ', 'PURCHIL'], { poblacion: 'Granada' }) // ninguna casa
  await persona(['VILLA ALAMO', 'PUEBLO NUEVO'], { poblacion: 'Villa', eleccionPoblacion: '00001- OTRA' }) // elección inválida de la bandeja: nunca cae a la localidad
  await persona(['SAN JUAN', 'SAN JUANITO'], { poblacion: 'San Jua' }) // palabra entera, no subcadena
})

test('buscador de poblaciones: eleccionPoblacion de la bandeja manda; si la celda no rellena la población → hueco con inventario', async () => {
  await page.setContent(POBLACIONES(['VILLA ÁLAMO', 'PUEBLO NUEVO']))
  await buscarPoblacion(page.mainFrame(), '00001', page, ctxPulsar, 2_000, { eleccionPoblacion: '00001- VILLA ÁLAMO', poblacion: 'pueblo nuevo' })
  assert.equal(await page.locator('#_destown').inputValue(), 'VILLA ÁLAMO')
  await page.setContent(POBLACIONES(['VILLA PRUEBA'], false))
  await assert.rejects(buscarPoblacion(page.mainFrame(), '00001', page, ctxPulsar, 600), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e))
  assert.equal(await page.evaluate(() => (window as unknown as { archivado?: number }).archivado), undefined, 'no pulsó Archivar')
  // Viaja estructurada: el runner la clasifica como `eleccion` (definitivo → requiere_humano) con la lista.
  const c = clasificarIntento(new ErrorEleccionPoblacion([{ codigo: '00001- A', etiqueta: 'A' }, { codigo: '00001- B', etiqueta: 'B' }]), { logueado: true, loginVisible: false, ultimo5xx: null })
  assert.equal(c.tipo, 'eleccion')
  assert.equal(c.transitorio, null)
  assert.equal(c.opcionesPoblacion?.length, 2)
  assert.match(c.mensaje, /^requiere_eleccion_poblacion: /)
})

test('planDatosBasicosMoto: valores del portal; lo que el portal asumiría por defecto se exige (fail-closed)', () => {
  const p = planDatosBasicosMoto(form)
  assert.deepEqual(p.map((o) => [o.sel, o.valor]), [
    ['#use', '1'], ['#driverBirthDate', '03/02/1990'], ['#driverLicenseDate', '05/04/2010'], ['#driverSex', 'H'], ['#garageNight', true],
    ['#aseguradoOtraCia', 'S'], ['#yearsOrigCompany', '3'], ['#aniosSinSiniestros', '03'],
  ])
  const mas = planDatosBasicosMoto({ ...form, aniosAseguradoAnterior: 9, garajeNoche: null })
  assert.deepEqual(mas.slice(-3).map((o) => o.valor), ['S', '6', '05'])
  assert.ok(!mas.some((o) => o.sel === '#garageNight'), 'null = no se toca')
  const cero = planDatosBasicosMoto({ ...form, aniosAseguradoAnterior: 0 })
  assert.deepEqual(cero.slice(-3).map((o) => o.valor), ['N', '0', '00'])
  const datos = (f: FormularioAuto) => () => planDatosBasicosMoto(f)
  assert.throws(datos({ ...form, conductor: { ...form.conductor, sexo: null } }), (e) => e instanceof ErrorTarificador && e.tipo === 'datos')
  // 18/10/2026 «supuesto favorable»: antecedentes sin dato → tramo máximo (más de 5 años, sin siniestros), no `datos`.
  assert.deepEqual(planDatosBasicosMoto({ ...form, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null }).slice(-3).map((o) => o.valor), ['S', '6', '05'])
  assert.deepEqual(planDatosBasicosMoto({ ...form, siniestrosUltimos5Anios: null }).slice(-3).map((o) => o.valor), ['S', '3', '03'])
  assert.throws(datos({ ...form, siniestrosUltimos5Anios: 2 }), ErrorMapaIncompleto)
})

test('rellenarDatosBasicosMoto escribe y relee; si el portal revierte un select, aborta', async () => {
  await page.setContent(DATOS())
  await rellenarDatosBasicosMoto(page.mainFrame(), form)
  assert.equal(await page.locator('#driverBirthDate').inputValue(), '03/02/1990')
  assert.equal(await page.locator('#driverSex').inputValue(), 'H')
  assert.equal(await page.locator('#yearsOrigCompany').inputValue(), '3')
  assert.equal(await page.locator('#aniosSinSiniestros').inputValue(), '03')
  assert.equal(await page.locator('#garageNight').isChecked(), true)
  await page.setContent(DATOS(true))
  await assert.rejects(rellenarDatosBasicosMoto(page.mainFrame(), form), (e) => e instanceof ErrorTarificador && e.tipo === 'portal')
})

test('matrícula → 1ª matriculación autorrellenada (ISO); sin respuesta → datos sin la matrícula en el mensaje', async () => {
  await page.setContent(DATOS())
  assert.equal(await consultarMatriculaMoto(page.mainFrame(), form.matricula, page), '2015-08-07')
  await page.setContent('<input id="licensePlate"><input id="fechaMatriculacion" disabled>')
  await assert.rejects(consultarMatriculaMoto(page.mainFrame(), form.matricula, page, 500), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && !e.message.includes(form.matricula))
})

const INFORME = (filas: string) => `<div id="errorSection"><div id="dataErrorSection"><table><tbody>${filas}</tbody></table></div></div>`
const FILA_ERROR = (campo: string, msg: string) => `<tr class="rowAppErrorTextBlock"><td class="cellAppErrorTextBlock">&nbsp;01&nbsp;<b>${campo}</b></td><td class="cellAppErrorTextBlock cellNoImage">&nbsp;${msg}</td></tr>`
const FILA_INFO = (msg: string) => `<tr class="rowAppErrorInfoTextBlock"><td class="rowAppErrorInfoTextBlock">&nbsp;01&nbsp;<b>Alerta</b></td><td class="rowAppErrorInfoTextBlock cellNoImage">&nbsp;${msg}</td></tr>`

test('pantalla de error: fila de error → datos con campo y mensaje; fila informativa no es error; datos personales tapados', async () => {
  await page.setContent(INFORME(FILA_ERROR('fechaAdquisicion', 'La fecha de adquisición no puede ser anterior a la de matriculación')))
  assert.deepEqual(await leerIncidencias(page.mainFrame()), [{ tipo: 'error', campo: 'fechaAdquisicion', mensaje: 'La fecha de adquisición no puede ser anterior a la de matriculación' }])
  await assert.rejects(lanzarSiHayErrores(page.mainFrame()), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && /\[fechaAdquisicion\]/.test(e.message))
  await page.setContent(INFORME(FILA_INFO('Proyecto archivado correctamente')))
  assert.deepEqual((await leerIncidencias(page.mainFrame())).map((i) => i.tipo), ['aviso'])
  await lanzarSiHayErrores(page.mainFrame())
  await page.setContent('<p>sin informe</p>')
  await lanzarSiHayErrores(page.mainFrame())
  await page.setContent(INFORME(FILA_ERROR('licensePlate', 'La matrícula 0000 BBB ya existe, DNI 00000000T')))
  await assert.rejects(lanzarSiHayErrores(page.mainFrame()), (e) => e instanceof ErrorTarificador && !/0000 ?BBB|00000000T/.test(e.message))
  assert.equal(incidenciaDesdeFila('otra', 'x', 'y'), null)
  assert.equal(incidenciaDesdeFila('rowAppErrorTextBlock', '<script>', 'm')?.campo, null)
})

test('GUARD: el pulsar() genérico sigue rechazando los avances; Turismos es hueco; Moto va SOLO por ctx.avanzarPestanaAutorizada', async () => {
  for (const h of ["goSelected('datosBasicos'); aceptar_onclick();", "goSelected('rate'); aceptar_onclick();"]) {
    assert.throws(() => comprobarBoton(['Tarificar', 'rate', h]), EmisionBloqueadaError, h)
  }
  for (const d of ['datosBasicos', 'tarificar'] as const) {
    await assert.rejects(avanzarPestanaGuardada(page, {} as never, d), ErrorMapaIncompleto)
    await assert.rejects(avanzarPestanaGuardada(page, { avanzarPestanaAutorizada: async () => {} } as never, d, 'auto'), ErrorMapaIncompleto)
    await assert.rejects(avanzarPestanaGuardada(page, {} as never, d, 'moto'), ErrorMapaIncompleto)
  }
  const pedidos: string[] = []
  const ctx = { avanzarPestanaAutorizada: async (s: string) => void pedidos.push(s) }
  await avanzarPestanaGuardada(page, ctx as never, 'datosBasicos', 'moto')
  await avanzarPestanaGuardada(page, ctx as never, 'tarificar', 'moto')
  assert.deepEqual(pedidos, ['td#datosBasicos', 'td#rate'])
})

test('los manejadores reales de los campos de Moto pasan el guard; los de Archivar/Emitir no', async () => {
  const ok = ['displayDriver()', 'displayOwner()', 'menores25()', 'funcTrue()', 'setAniosSinisters()', 'setNumSinisters()', 'eventoMatriculaDatosBasicos()', 'displayFechasFuncUso(IS_PORTUGAL)', "sendRequestLocationFinder({'idConcejo':'concejo','id':'_cpostalCode'});"]
  for (const h of ok) comprobarBoton([h])
  for (const h of ["sendActionEvent('store')", 'validar_aceptar()']) assert.throws(() => comprobarBoton([h]), EmisionBloqueadaError, h)
})

test('allianzMoto.tarificar rechaza ciclomotor (≤50 cc) y cilindrada ausente con ErrorTarificador datos, antes del portal', async () => {
  for (const cilindradaCc of [50, 49, null, undefined]) {
    const f = { ...form, seleccionVehiculo: { ...form.seleccionVehiculo!, cilindradaCc } }
    await assert.rejects(allianzMoto.tarificar({} as never, f, {} as never), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && /cilindrada|ciclomotor/.test(e.message), String(cilindradaCc))
  }
})

test('allianzMoto.tarificar para ANTES de abrir el portal si faltan datos que el portal asumiría', async () => {
  const sinSel = { ...form, seleccionVehiculo: null }
  const sinSexo = { ...form, conductor: { ...form.conductor, sexo: null } }
  for (const f of [sinSel, sinSexo]) {
    await assert.rejects(allianzMoto.tarificar({} as never, f, {} as never), (e) => e instanceof ErrorTarificador && e.tipo === 'datos')
  }
})


// ───────────── buscador de poblaciones por la CAPA COMÚN (fijo → aprendido → IA `elegir_opcion` → atasco) ─────────────
// Resultados pintados como `li[role=option]` (NO como las celdas `td` que conoce la regla fija): el fijo no los ve, tras el plazo
// entra la capa común. La IA solo señala un índice; el adaptador contrasta el texto «CP- NOMBRE» con el riesgo ANTES de pulsar.
const LISTA = (nombres: string[]) => `<body><input id="_cpostalCode" type="tel"><input id="_destown" type="text">
<img id="_cpostalCodeAjaxLocFinderImg" src="data:," onclick="sendRequestLocationFinder({'id':'_cpostalCode'});">
<ul id="res"></ul>
<table><tr><td id="store" onclick="window.archivado=1">Archivar</td></tr></table>
<script>
window.pulsadas = 0
var sendRequestLocationFinder = () => setTimeout(() => {
  const cp = document.getElementById('_cpostalCode').value;
  ${JSON.stringify(nombres)}.forEach((n) => {
    const li = document.createElement('li'); li.setAttribute('role', 'option'); li.textContent = cp + '- ' + n
    li.onclick = () => { window.pulsadas++; document.getElementById('_destown').value = n }
    document.getElementById('res').appendChild(li)
  })
}, 50)
</script></body>`

async function formadorMoto(elegir: (e: { texto: string | null }[]) => number | null, llamadas: string[], conocimiento: unknown[] = []): Promise<ContextoFormador> {
  return prepararFormador({
    trabajoId: '00000000-0000-4000-8000-000000000000', compania: 'allianz', ramo: 'moto', apiUrl: 'https://asegura.test', secreto: 'x'.repeat(20),
    redactar: (t) => t, log: () => undefined,
    fetchImpl: (async (url: string, init?: { body?: string }) => {
      const ruta = String(url).split('/formador/')[1]!.split('?')[0]!
      llamadas.push(ruta)
      if (ruta === 'conocimiento') return new Response(JSON.stringify({ formadorActivo: true, conocimiento, acompanamiento: { activo: false } }))
      if (ruta === 'sugerir') return new Response(JSON.stringify({ indice: elegir((JSON.parse(init!.body!) as { estructura: { texto: string | null }[] }).estructura) }))
      return new Response('{}')
    }) as unknown as typeof fetch,
  })
}

test('esElementoOpcion: la celda del buscador (td con receivedDataLocationFinder y «CP- NOMBRE») es opción; cualquier otro td, no', () => {
  assert.equal(esElementoOpcion({ tag: 'td', role: null, texto: '41003- SEVILLA', celdaBuscador: true }), true)
  assert.equal(esElementoOpcion({ tag: 'td', role: null, texto: '41003- SEVILLA' }), false, 'td sin la marca del buscador')
  assert.equal(esElementoOpcion({ tag: 'td', role: null, texto: 'Archivar', celdaBuscador: true }), false, 'sin forma «CP- NOMBRE»')
  assert.equal(esElementoOpcion({ tag: 'td', role: null, texto: 'Emitir' }), false)
})

test('buscador por capa común: la IA señala la población del riesgo → se pulsa por ctx.pulsar, se rellena y se CONFIRMA lo aprendido', async () => {
  await page.setContent(LISTA(['VILLA ÁLAMO', 'PUEBLO NUEVO']))
  const llamadas: string[] = []
  const formador = await formadorMoto((e) => e.findIndex((c) => c.texto === '00001- PUEBLO NUEVO'), llamadas)
  await buscarPoblacion(page.mainFrame(), '00001', page, { ...ctxPulsar, formador }, 600, { poblacion: 'pueblo nuevo' })
  assert.equal(await page.locator('#_destown').inputValue(), 'PUEBLO NUEVO')
  assert.ok(llamadas.includes('sugerir'), 'preguntó a la IA')
  assert.equal(llamadas.filter((l) => l === 'confirmar').length, 1)
  assert.equal(await page.evaluate(() => (window as unknown as { archivado?: number }).archivado), undefined, 'no pulsó Archivar')
})

test('buscador por capa común: la IA señala OTRA población (o el riesgo no trae población) → NO se pulsa, atasco y no se aprende', async () => {
  for (const eleccion of [{ poblacion: 'pueblo nuevo' }, {}]) {
    await page.setContent(LISTA(['VILLA ÁLAMO', 'PUEBLO NUEVO']))
    const llamadas: string[] = []
    const formador = await formadorMoto((e) => e.findIndex((c) => c.texto === '00001- VILLA ÁLAMO'), llamadas)
    await assert.rejects(buscarPoblacion(page.mainFrame(), '00001', page, { ...ctxPulsar, formador }, 600, eleccion), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e))
    assert.equal(await page.evaluate(() => (window as unknown as { pulsadas?: number }).pulsadas), 0, 'no pulsó ninguna opción')
    assert.equal(llamadas.filter((l) => l === 'confirmar').length, 0)
    assert.equal(formador.atasco?.clave, 'elegir_opcion_poblacion')
    assert.equal(formador.atasco?.candidatos.length, 2, 'solo las dos opciones (nunca Archivar)')
  }
})

test('buscador: celdas sin la forma «CP- NOMBRE» (la regla fija no halla ninguna población válida) → atasco directo, SIN consultar a la IA', async () => {
  await page.setContent(POBLACIONES(['Texto sin forma']).replace("td.textContent = cp + '- ' + n", 'td.textContent = n'))
  const llamadas: string[] = []
  const formador = await formadorMoto(() => 0, llamadas)
  await assert.rejects(buscarPoblacion(page.mainFrame(), '00001', page, { ...ctxPulsar, formador }, 600), (e: unknown) => e instanceof ErrorMapaIncompleto && /formato de las celdas/.test((e as Error).message))
  assert.ok(!llamadas.includes('sugerir'), 'no se pregunta a la IA')
})

test('buscador por capa común: la IA no resuelve → ATASCO con las opciones visibles (Telegram) y el hueco original', async () => {
  await page.setContent(LISTA(['VILLA ÁLAMO', 'PUEBLO NUEVO']))
  const formador = await formadorMoto(() => null, [])
  await assert.rejects(buscarPoblacion(page.mainFrame(), '00001', page, { ...ctxPulsar, formador }, 600, { poblacion: 'pueblo nuevo' }), (e: unknown) => e instanceof ErrorMapaIncompleto && /buscador de poblaciones/.test((e as Error).message))
  assert.equal(formador.atasco?.clave, 'elegir_opcion_poblacion')
  assert.deepEqual(formador.atasco?.candidatos.map((c) => c.texto), ['00001- VILLA ÁLAMO', '00001- PUEBLO NUEVO'])
})

test('buscador: celda pulsada sin efecto, o buscador ausente → atasco preparado (no error mudo)', async () => {
  await page.setContent(POBLACIONES(['VILLA PRUEBA'], false))
  const f1 = await formadorMoto(() => null, [])
  await assert.rejects(buscarPoblacion(page.mainFrame(), '00001', page, { ...ctxPulsar, formador: f1 }, 600), ErrorMapaIncompleto)
  assert.equal(f1.atasco?.clave, 'elegir_opcion_poblacion')
  assert.deepEqual(f1.atasco?.candidatos.map((c) => c.texto), ['00001- VILLA PRUEBA'])
  await page.setContent(LISTA(['VILLA ÁLAMO']).replace('id="_cpostalCodeAjaxLocFinderImg"', 'id="otra"'))
  const f2 = await formadorMoto(() => null, [])
  await page.evaluate(() => { const li = document.createElement('li'); li.setAttribute('role', 'option'); li.textContent = '00001- X'; document.getElementById('res')!.appendChild(li) })
  await assert.rejects(buscarPoblacion(page.mainFrame(), '00001', page, { ...ctxPulsar, formador: f2 }, 600), (e: unknown) => e instanceof ErrorTarificador && /no aparece el buscador/.test((e as Error).message))
  assert.equal(f2.atasco?.clave, 'elegir_opcion_poblacion')
})

test('allianzMoto.tarificar: un ErrorMapaIncompleto sin atasco previo (siniestros > 0) deja atasco con las opciones visibles; sin formador, el hueco intacto', async () => {
  await page.setContent(LISTA(['VILLA ÁLAMO']))
  await page.evaluate(() => { const li = document.createElement('li'); li.setAttribute('role', 'option'); li.textContent = 'Opcion visible'; document.body.appendChild(li) })
  const formador = await formadorMoto(() => null, [])
  const f = { ...form, siniestrosUltimos5Anios: 2 }
  await assert.rejects(allianzMoto.tarificar(page, f, { formador } as never), ErrorMapaIncompleto)
  assert.equal(formador.atasco, undefined, 'siniestros > 0 es un caso de DATOS: error definitivo, sin atasco de pantalla')
  await assert.rejects(allianzMoto.tarificar(page, f, {} as never), ErrorMapaIncompleto)
})

test('versión del bot de Allianz Moto', () => {
  assert.equal(allianzMoto.version, '0.7.7')
})
