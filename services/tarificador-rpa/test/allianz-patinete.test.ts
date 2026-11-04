// Allianz «Movilidad Personal» (patinete / VMP) v0.1.0: PORTAL FALSO (HTML inventado con los ids VISTOS en las exploraciones del
// 28-31/10/2026; no es HTML real). Datos SINTÉTICOS (DNI de prueba 00000000T, marcas y modelos inventados). Comprueba que el adaptador
// rellena lo mapeado, falla cerrado en lo no mapeado, no se registra (flag APAGADO) y declara los huecos (avance de /drvp00/ y precio).
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { faltanParaTarificar, validarFormularioPatinete, type FormularioPatinete } from '@central/module-tarificacion'
import { adaptadores } from '../src/adapters/index.ts'
import {
  ALLIANZ_PATINETE_ACTIVO,
  allianzPatinete,
  avanzarVmp,
  casarOpcionVmp,
  ErrorEleccionVmp,
  ErrorMapaIncompleto,
  leerOfertasVmp,
  ofertaVmp,
  planIntervinientes,
  planRiesgo,
  rellenarIntervinientes,
  rellenarRiesgo,
  SEL_INTERVINIENTES,
  SEL_RIESGO,
} from '../src/adapters/allianz/patinete.ts'
import { ErrorTarificador } from '../src/errores.ts'
import { prepararTrabajo } from '../src/ramo.ts'

const HOY = new Date('2026-11-03T10:00:00Z')
const crudo = (): Record<string, unknown> => ({
  ramo: 'patinete',
  vmp: { marca: 'Marca Uno', modelo: 'Scooter 4 Pro', usoProfesional: false, homologado: true, velocidadLimitada25: true },
  codigoPostal: '41001',
  poblacion: 'SEVILLA',
  conductor: { fechaNacimiento: '1985-03-10' },
  tomador: { documentoIdentidad: '00000000T' },
})
const form = (cambio: (o: Record<string, unknown>) => void = () => undefined): FormularioPatinete => {
  const o = crudo()
  cambio(o)
  const v = validarFormularioPatinete(o, HOY)
  assert.ok(v.ok, v.ok ? '' : v.errores.join('; '))
  return v.formulario
}
const ctx = { formador: undefined } as never

// ───────── portal falso ─────────
const OPCIONES_MODELO: Record<string, string[]> = {
  MARCA_UNO: ['SCOOTER 4 PRO ABCDE12F', 'SCOOTER 4 LITE ABCDE12G', 'SCOOTER 4 PRO MAX ZZZ999'],
  MARCA_DOS: ['SCOOTER 4 PRO', 'SCOOTER 4 PRO ABCDE12F'],
}
const htmlBasicos = (tipoDoc = 'NIF', segundo = '') => `<body><form>
  <input type="text" id="DatosGeneralesBean$fechaEfecto" value="04/11/2026">
  <select id="IntervinientesBean$nifTomador_tipoDoc"><option value="N" selected>${tipoDoc}</option><option value="E">NIE</option></select>
  <input type="text" id="IntervinientesBean$nifTomador_doc">
  <input type="radio" name="p" id="IntervinientesBean$esPropietario1"><input type="radio" name="p" id="IntervinientesBean$esPropietario2" checked>
  <input type="radio" name="c" id="IntervinientesBean$esConductor1"><input type="radio" name="c" id="IntervinientesBean$esConductor2" checked>
  <input type="text" id="IntervinientesBean$nifSegConductor_doc" value="${segundo}">
  <button type="button" id="btnAceptar" onclick="eventoSiguiente()">Aceptar</button></form></body>`
const htmlRiesgo = (conIva = false, modelos = OPCIONES_MODELO) => `<body><form>
  <input type="text" id="VMPBean$matricula">
  <select id="VMPBean$marca" onchange="cargar(this.value)"><option value="">--</option><option value="MARCA_UNO">Marca Uno</option><option value="MARCA_DOS">Marca Dos</option></select>
  <select id="VMPBean$modelo" disabled><option value="">--</option></select>
  <input type="radio" name="u" id="VMPBean$uso1"><input type="radio" name="u" id="VMPBean$uso2">
  <input type="radio" name="h" id="VMPBean$homologado1"><input type="radio" name="h" id="VMPBean$homologado2">
  <input type="checkbox" id="VMPBean$checkIva" ${conIva ? 'checked' : ''}><input type="checkbox" id="VMPBean$checkVMP">
  <input type="tel" id="MunicipioVMPBean$codigoPostal"><input type="text" id="MunicipioVMPBean$poblacion">
  <input type="text" id="ConductorVMPBean$fechaNaci">
  <button type="button" onclick="eventoSiguienteDialog()">Aceptar</button></form>
  <script>window.M=${JSON.stringify(modelos)}; // document.write reutiliza el global: nada de const/function de nivel superior
  window.cargar=function(m){const s=document.getElementById('VMPBean$modelo');s.innerHTML='<option value="">--</option>';
   setTimeout(()=>{(M[m]||[]).forEach(x=>{const o=document.createElement('option');o.value=x;o.textContent=x;s.appendChild(o)});s.disabled=false},50)}</script></body>`

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

// ───────── registro y contrato ─────────
test('APAGADO por defecto: el flag es false y el registro NO lo trae', () => {
  assert.equal(ALLIANZ_PATINETE_ACTIVO, false)
  assert.equal(allianzPatinete.ramo, 'patinete')
  assert.equal(adaptadores.obtener('allianz', 'patinete'), null)
})

test('prepararTrabajo valida con el validador de patinete y exige los obligatorios', () => {
  const ok = prepararTrabajo(allianzPatinete as never, crudo(), HOY)
  assert.equal(ok.ok, true)
  const sinCp = crudo()
  delete sinCp.codigoPostal
  const mal = prepararTrabajo(allianzPatinete as never, sinCp, HOY)
  assert.equal(mal.ok, false)
  assert.deepEqual(faltanParaTarificar('allianz', 'patinete', crudo()), [])
  assert.deepEqual(faltanParaTarificar('allianz', 'patinete', sinCp)!.map((f) => f.clave), ['codigoPostal'])
})

test('uso profesional / no homologado / sin límite 25 km/h: el validador y los planes los rechazan (a Alberto)', () => {
  for (const [campo, valor] of [['usoProfesional', true], ['homologado', false], ['velocidadLimitada25', false]] as const) {
    const o = crudo()
    ;(o.vmp as Record<string, unknown>)[campo] = valor
    assert.equal(validarFormularioPatinete(o, HOY).ok, false, campo)
    const hecho = { ...form(), vmp: { ...form().vmp, [campo]: valor } } as FormularioPatinete
    assert.throws(() => planRiesgo(hecho), (e) => e instanceof ErrorTarificador && e.tipo === 'datos', campo)
    assert.throws(() => planIntervinientes(hecho), (e) => e instanceof ErrorTarificador && e.tipo === 'datos', campo)
  }
})

// ───────── casado de marca / modelo ─────────
const opc = (...v: string[]) => v.map((x) => ({ valor: x, etiqueta: x }))
test('casarOpcionVmp: igualdad normalizada; el código final de catálogo solo si deja UNA y se marca aproximada', () => {
  assert.deepEqual(casarOpcionVmp(opc('', 'XIAOMI', 'SEGWAY'), 'xiaomi'), { tipo: 'unica', opcion: { valor: 'XIAOMI', etiqueta: 'XIAOMI' }, aproximada: false })
  const c = casarOpcionVmp(opc('SCOOTER 4 PRO ABCDE12F', 'SCOOTER 4 LITE ABCDE12G'), 'Scooter 4 Pro')
  assert.equal(c.tipo, 'unica')
  assert.equal(c.tipo === 'unica' && c.aproximada, true)
})
test('casarOpcionVmp: ni «lo más parecido» ni la primera (ninguna / ambigua)', () => {
  assert.equal(casarOpcionVmp(opc('SCOOTER 4 PRO MAX ZZZ999'), 'Scooter 4 Pro').tipo, 'ninguna', 'un sufijo que no es código no casa')
  assert.equal(casarOpcionVmp(opc('SCOOTER 4 PRO ABCDE12F', 'SCOOTER 4 PRO QWERT99Z'), 'Scooter 4 Pro').tipo, 'ambigua')
  assert.equal(casarOpcionVmp(opc('A', 'a'), 'A').tipo, 'ambigua')
  assert.equal(casarOpcionVmp(opc('A'), '  ').tipo, 'ninguna')
})

// ───────── pantalla 1 ─────────
test('rellenarIntervinientes: documento, tomador = propietario = conductor; sin efecto en el riesgo → declara la del portal', async () => {
  await page.setContent(htmlBasicos())
  const supuestos = await rellenarIntervinientes(page.mainFrame(), form(), ctx)
  assert.equal(await page.locator(SEL_INTERVINIENTES.docTomador).inputValue(), '00000000T')
  assert.equal(await page.locator(SEL_INTERVINIENTES.propietarioSi).isChecked(), true)
  assert.equal(await page.locator(SEL_INTERVINIENTES.conductorSi).isChecked(), true)
  assert.deepEqual(supuestos, ['fecha de efecto la que propone el portal (04/11/2026)'])
})
test('rellenarIntervinientes: con efecto en el riesgo lo escribe (dd/mm/aaaa) y no declara supuesto', async () => {
  await page.setContent(htmlBasicos())
  const supuestos = await rellenarIntervinientes(page.mainFrame(), form((o) => { o.efecto = '2026-11-10' }), ctx)
  assert.equal(await page.locator(SEL_INTERVINIENTES.fechaEfecto).inputValue(), '10/11/2026')
  assert.deepEqual(supuestos, [])
})
test('rellenarIntervinientes: tipo de documento que no es el del documento → hueco con las opciones (no se cambia a ciegas)', async () => {
  await page.setContent(htmlBasicos('PASAPORTE'))
  await assert.rejects(rellenarIntervinientes(page.mainFrame(), form(), ctx), (e) => e instanceof ErrorMapaIncompleto && /Tipo Doc/.test(e.message) && e.pideInventarioDom && e.transitorio === false)
  assert.equal(await page.locator(SEL_INTERVINIENTES.docTomador).inputValue(), '', 'no escribió nada')
})
test('rellenarIntervinientes: un 2.º conductor que ya trae el portal aborta (no es del riesgo)', async () => {
  await page.setContent(htmlBasicos('NIF', 'X1234567L'))
  await assert.rejects(rellenarIntervinientes(page.mainFrame(), form(), ctx), (e) => e instanceof ErrorTarificador && e.tipo === 'portal' && !/X1234567L/.test(e.message))
})
test('rellenarIntervinientes: el mensaje de error nunca lleva el documento', async () => {
  await page.setContent('<body><select id="IntervinientesBean$nifTomador_tipoDoc"><option value="N" selected>NIF</option></select></body>')
  await assert.rejects(rellenarIntervinientes(page.mainFrame(), form(), ctx), (e) => e instanceof ErrorTarificador && !/00000000T/.test(e.message))
})

// ───────── pantalla 2 ─────────
test('rellenarRiesgo: marca → modelo dependiente (por código de catálogo, declarado) → radios, casilla 25 km/h, CP, población y nacimiento', async () => {
  await page.setContent(htmlRiesgo(true))
  const supuestos = await rellenarRiesgo(page.mainFrame(), form(), ctx)
  assert.equal(await page.locator(SEL_RIESGO.marca).inputValue(), 'MARCA_UNO')
  assert.equal(await page.locator(SEL_RIESGO.modelo).inputValue(), 'SCOOTER 4 PRO ABCDE12F')
  assert.equal(await page.locator(SEL_RIESGO.usoNo).isChecked(), true)
  assert.equal(await page.locator(SEL_RIESGO.homologadoSi).isChecked(), true)
  assert.equal(await page.locator(SEL_RIESGO.velocidad25).isChecked(), true)
  assert.equal(await page.locator(SEL_RIESGO.codigoPostal).inputValue(), '41001')
  assert.equal(await page.locator(SEL_RIESGO.poblacion).inputValue(), 'SEVILLA')
  assert.equal(await page.locator(SEL_RIESGO.nacimientoConductor).inputValue(), '10/03/1985')
  assert.equal(await page.locator(SEL_RIESGO.matricula).inputValue(), '', 'un VMP no tiene matrícula: no se inventa')
  assert.ok(supuestos.some((s) => /código de homologación/.test(s)), 'el modelo casado por código se declara')
  assert.ok(supuestos.some((s) => /Incluir IVA.*marcado.*tal como lo trae/.test(s)), 'Incluir IVA se declara, no se toca')
  assert.equal(await page.locator(SEL_RIESGO.incluirIva).isChecked(), true, 'Incluir IVA intacto')
})
test('rellenarRiesgo: sin población en el riesgo no la escribe y lo declara', async () => {
  await page.setContent(htmlRiesgo(false))
  const supuestos = await rellenarRiesgo(page.mainFrame(), form((o) => { o.poblacion = null }), ctx)
  assert.equal(await page.locator(SEL_RIESGO.poblacion).inputValue(), '')
  assert.ok(supuestos.includes('población la que resuelve el portal para el CP'))
  assert.ok(supuestos.some((s) => /sin marcar/.test(s)))
})
test('rellenarRiesgo: modelo que no está en el catálogo → ErrorEleccionVmp (datos), nada más se rellena', async () => {
  await page.setContent(htmlRiesgo())
  await assert.rejects(
    rellenarRiesgo(page.mainFrame(), form((o) => { (o.vmp as Record<string, unknown>).modelo = 'Modelo Inexistente' }), ctx),
    (e) => e instanceof ErrorEleccionVmp && e.tipo === 'datos',
  )
  assert.equal(await page.locator(SEL_RIESGO.codigoPostal).inputValue(), '')
})
test('rellenarRiesgo: modelo ambiguo → ErrorEleccionVmp con las candidatas, sin elegir la primera', async () => {
  await page.setContent(htmlRiesgo(false, { MARCA_UNO: ['SCOOTER 4 PRO ABCDE12F', 'SCOOTER 4 PRO QWERT99Z'] }))
  await assert.rejects(rellenarRiesgo(page.mainFrame(), form(), ctx), (e) => e instanceof ErrorEleccionVmp && e.candidatas.length === 2)
  assert.equal(await page.locator(SEL_RIESGO.modelo).inputValue(), '')
})
test('rellenarRiesgo: si el portal no deja marcada la casilla de 25 km/h, falla (no se da por hecho)', async () => {
  await page.setContent(htmlRiesgo() + '<script>document.getElementById("VMPBean$checkVMP").addEventListener("change",e=>{e.target.checked=false})</script>')
  await assert.rejects(rellenarRiesgo(page.mainFrame(), form(), ctx), (e) => e instanceof ErrorTarificador && e.tipo === 'portal' && /25 km\/h/.test(e.message))
})

// ───────── huecos declarados ─────────
test('avanzarVmp: no pulsa nada y declara el hueco del guard (Datos Básicos y Riesgo)', async () => {
  await page.setContent(htmlBasicos())
  await page.evaluate(() => { (window as unknown as { pulsado: number }).pulsado = 0; (window as unknown as Record<string, unknown>).eventoSiguiente = () => { (window as unknown as { pulsado: number }).pulsado++ } })
  await assert.rejects(avanzarVmp(page.mainFrame(), 'datos_basicos'), (e) => e instanceof ErrorMapaIncompleto && /guard/.test(e.message) && e.pideInventarioDom && e.transitorio === false)
  assert.equal(await page.evaluate(() => (window as unknown as { pulsado: number }).pulsado), 0, 'el «Aceptar» no se pulsó')
  await page.setContent(htmlRiesgo())
  await assert.rejects(avanzarVmp(page.mainFrame(), 'riesgo'), (e) => e instanceof ErrorMapaIncompleto)
})
test('avanzarVmp: si la pantalla no es la esperada es un fallo de portal, no el hueco', async () => {
  await page.setContent('<body><p>otra pantalla</p></body>')
  await assert.rejects(avanzarVmp(page.mainFrame(), 'datos_basicos'), (e) => e instanceof ErrorTarificador && e.tipo === 'portal' && !(e instanceof ErrorMapaIncompleto))
})
test('leerOfertasVmp: la pantalla de precio no está mapeada → hueco con inventario (no inventa ofertas)', async () => {
  await page.setContent('<body>Prima total 12,34 €</body>')
  await assert.rejects(leerOfertasVmp(page.mainFrame(), []), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /precio/.test(e.message))
})

// ───────── oferta ─────────
test('ofertaVmp: prima válida → oferta con avisos (coberturas sin leer, supuestos); sin prima válida falla cerrado', () => {
  const o = ofertaVmp({ primaAnualEur: 59.9, primaNetaEur: 55.5, avisosPortal: ['aviso del portal'], supuestos: ['modelo X'] })
  assert.equal(o.compania, 'allianz')
  assert.equal(o.primaAnualEur, 59.9)
  assert.equal(o.primaNetaEur, 55.5)
  assert.deepEqual(o.coberturas, [])
  assert.equal(o.avisos[0], 'aviso del portal')
  assert.ok(o.avisos.some((a) => /Coberturas no leídas/.test(a)))
  assert.ok(o.avisos.some((a) => a === 'Precio con supuestos: modelo X'))
  for (const p of [0, -1, NaN, Infinity, 1_000_000]) assert.throws(() => ofertaVmp({ primaAnualEur: p }), (e) => e instanceof ErrorTarificador && e.tipo === 'portal', String(p))
  assert.throws(() => ofertaVmp({ primaAnualEur: 50, primaNetaEur: 80 }), (e) => e instanceof ErrorTarificador)
})
