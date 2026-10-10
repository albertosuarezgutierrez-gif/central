// Allianz Autos/Moto: consulta por matrícula → vehículo canónico, Datos básicos y lector de primas. Fixture SINTÉTICA
// (estructura inventada con los ids del mapa de Moto del 09/10/2026; marcas, matrícula, fechas e importes ficticios).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import {
  allianzAuto,
  allianzMoto,
  AUTO_ACTIVO,
  consultarMatricula,
  ErrorEleccionVersion,
  ErrorMapaIncompleto,
  idCeldaPrima,
  leerPrimasTarificar,
  ofertasDesdePrimas,
  planDatosBasicos,
  primasDesdeCeldas,
  rellenarDatosBasicos,
  resolverVehiculo,
} from '../src/adapters/allianz/auto.ts'
import { adaptadores } from '../src/adapters/index.ts'
import { ErrorTarificador } from '../src/errores.ts'
import { clasificar } from '../src/errores.ts'
import { comprobarBoton, EmisionBloqueadaError, estadoTrasError, motivoLegible, type FormularioAuto } from '@central/module-tarificacion'

const form: FormularioAuto = {
  ramo: 'auto',
  matricula: '0000BBB',
  codigoPostal: '41003',
  conductor: { fechaNacimiento: '1985-04-02', fechaCarne: '2004-06-01', sexo: null },
  tomadorEsConductor: true,
  tomadorEsPropietario: null,
  aniosAseguradoAnterior: null,
  siniestrosUltimos5Anios: 0,
  garajeNoche: true,
  tomador: null,
  eleccionVersion: null,
}

// `versiones`: lo que el «catálogo» devuelve; `fijada`: si el portal deja una seleccionada.
const HTML = (versiones: string[], fijada = false) => `<body><form>
<input id="licensePlate" type="text">
<select id="marca"><option value="">Seleccione</option></select><select id="modelo"><option value="">Seleccione</option></select>
<select id="version"><option value="">Seleccione</option></select>
<input id="motorPower" type="text"><input id="fechaMatriculacion" type="text"><input id="mobileCode" type="hidden">
<input id="_cpostalCode"><input id="driverBirthDate"><input id="driverLicenseDate"><input id="numDisasters"><input id="garageNight" type="checkbox">
<table><tr><td id="store" onclick="window.archivado=1">Archivar</td><td id="contract" onclick="validar_aceptar()">Emitir</td></tr></table>
</form><script>
document.getElementById('licensePlate').addEventListener('change', () => setTimeout(() => {
  const op = (s, v, t, sel) => { const o = new Option(t, v); o.selected = !!sel; document.getElementById(s).add(o) }
  op('marca', 'M1', 'MARCA PRUEBA', true); op('modelo', 'X1', 'MODELO X', true);
  ;${JSON.stringify(versiones)}.forEach((t, i) => op('version', 'C00' + (i + 1), t, ${fijada} && i === 0))
  document.getElementById('motorPower').value = '150';
  document.getElementById('fechaMatriculacion').value = '05/03/2019';
  ${fijada} && (document.getElementById('mobileCode').value = 'C001')
}, 50))
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

test('inactivo y sin registrar', () => {
  assert.equal(AUTO_ACTIVO, false)
  for (const a of [allianzAuto, allianzMoto]) assert.equal(adaptadores.obtener(a.compania, a.ramo), null)
})

test('consulta por matrícula con VARIAS versiones y sin elección → requiere_humano con las opciones (no elige)', async () => {
  await page.setContent(HTML(['1.5 TSI Style', '1.5 TSI Sport']))
  const l = await consultarMatricula(page.mainFrame(), form.matricula, page, 3_000)
  assert.equal(l.marca, 'MARCA PRUEBA')
  await assert.rejects(resolverVehiculo(page.mainFrame(), l, form), (e) => {
    assert.ok(e instanceof ErrorEleccionVersion)
    assert.deepEqual(e.opciones.map((o) => o.etiqueta), ['1.5 TSI Style', '1.5 TSI Sport'])
    const c = clasificar(e)
    assert.equal(estadoTrasError(c.tipo, 1), 'requiere_humano')
    assert.match(motivoLegible(c, 'requiere_humano'), /versión del vehículo.*1\.5 TSI Sport/)
    assert.ok(!c.mensaje.includes(form.matricula), 'la matrícula no sale en el mensaje')
    return true
  })
  assert.equal(await page.locator('#version').inputValue(), '', 'no ha tocado el desplegable de versión')
})

test('con la elección de la bandeja → vehículo canónico y la versión fijada en el <select>', async () => {
  await page.setContent(HTML(['1.5 TSI Style', '1.5 TSI Sport']))
  const l = await consultarMatricula(page.mainFrame(), form.matricula, page, 3_000)
  const v = await resolverVehiculo(page.mainFrame(), l, { eleccionVersion: { codigo: 'C002' } })
  assert.deepEqual(v, { marca: 'MARCA PRUEBA', modelo: 'MODELO X', version: '1.5 TSI Sport', combustible: null, potenciaCv: null, fechaMatriculacion: '2019-03-05', codigoCatalogo: 'C002' })
  assert.equal(await page.locator('#version').inputValue(), 'C002')
})

test('una sola versión fijada por el portal → ok sin persona', async () => {
  await page.setContent(HTML(['1.5 TSI Style'], true))
  const l = await consultarMatricula(page.mainFrame(), form.matricula, page, 3_000)
  const v = await resolverVehiculo(page.mainFrame(), l, form)
  assert.equal(v.version, '1.5 TSI Style')
  assert.equal(v.codigoCatalogo, 'C001')
})

test('matrícula sin respuesta del catálogo → error datos (sin la matrícula en el mensaje)', async () => {
  await page.setContent('<input id="licensePlate"><select id="marca"></select><select id="modelo"></select>')
  await assert.rejects(consultarMatricula(page.mainFrame(), form.matricula, page, 600), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && !e.message.includes(form.matricula))
})

test('Datos básicos: plan puro y escritura; los prohibidos del portal siguen bloqueados', async () => {
  assert.deepEqual(planDatosBasicos(form), [['#_cpostalCode', '41003'], ['#driverBirthDate', '02/04/1985'], ['#driverLicenseDate', '01/06/2004'], ['#numDisasters', '0']])
  assert.deepEqual(planDatosBasicos({ ...form, siniestrosUltimos5Anios: null }).length, 3)
  await page.setContent(HTML(['x']))
  await rellenarDatosBasicos(page.mainFrame(), form)
  assert.equal(await page.locator('#driverBirthDate').inputValue(), '02/04/1985')
  assert.equal(await page.locator('#garageNight').isChecked(), true)
  for (const id of ['#store', '#contract']) {
    const desc = await page.locator(id).evaluate((el) => [el.textContent, el.id, el.getAttribute('onclick')])
    assert.throws(() => comprobarBoton(desc, { permitirAceptar: true }), EmisionBloqueadaError)
  }
})

test('primasDesdeCeldas: B_A primer recibo y sucesivos; modalidad sin celda no es oferta; fail-closed', () => {
  const mods = [{ modalidad: '0', nombre: 'G. Básicas' }, { modalidad: '1', nombre: 'Robo + Incendio' }, { modalidad: '2', nombre: 'Todo Riesgo' }]
  const celdas = { [idCeldaPrima('0', 0)]: '100,10', [idCeldaPrima('0', 1)]: '102,20', [idCeldaPrima('1', 0)]: '1.200,50', [idCeldaPrima('1', 1)]: '--' }
  assert.deepEqual(primasDesdeCeldas(celdas, mods), [
    { modalidad: '0', nombre: 'G. Básicas', primerReciboEur: 100.1, sucesivosEur: 102.2 },
    { modalidad: '1', nombre: 'Robo + Incendio', primerReciboEur: 1200.5, sucesivosEur: null },
  ])
  assert.throws(() => primasDesdeCeldas({}, mods), (e) => e instanceof ErrorTarificador && e.tipo === 'portal')
  assert.throws(() => primasDesdeCeldas({ [idCeldaPrima('0', 0)]: 'n/d' }, mods), (e) => e instanceof ErrorTarificador && e.tipo === 'portal')
  const of = ofertasDesdePrimas(primasDesdeCeldas(celdas, mods), 'Allianz Autos', null)
  assert.equal(of.length, 2)
  assert.equal(of[0].primaAnualEur, 100.1)
  assert.equal(of[0].desglose?.sucesivos.primaTotalEur, 102.2)
})

test('leerPrimasTarificar lee la tabla (DOM sintético)', async () => {
  const col = (m: string, nombre: string, p0: string, p1: string) =>
    `<td><table><tr><td><input id="modality_${m}" name="numModality" type="hidden"></td></tr><tr><td><label class="label-text">${nombre}</label></td></tr></table></td>` +
    `<td><table><tr id="row_0_${m}_B_A"><td id="${m}_B_A_0_0">${p0}</td></tr><tr><td id="${m}_B_A_1_0">${p1}</td></tr></table></td>`
  await page.setContent(`<table><tr>${col('0', 'G. Básicas', '183,73', '187,84')}${col('4', 'Sólo Pérdida Total', '445,53', '455,50')}</tr></table>`)
  const p = await leerPrimasTarificar(page.mainFrame())
  assert.deepEqual(p.map((x) => [x.modalidad, x.nombre, x.primerReciboEur, x.sucesivosEur]), [['0', 'G. Básicas', 183.73, 187.84], ['4', 'Sólo Pérdida Total', 445.53, 455.5]])
})

test('el avance a Tarificar es un hueco declarado (no se intenta pulsar nada)', async () => {
  const { avanzarATarificarAutos } = await import('../src/adapters/allianz/auto.ts')
  await assert.rejects(avanzarATarificarAutos(page, {} as never), (e) => e instanceof ErrorMapaIncompleto && clasificar(e).tipo === 'portal')
})
