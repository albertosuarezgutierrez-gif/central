// Mapfre NSEI AUTO: mapa de pantallas, lector de primas y plan de campos. Fixture SINTÉTICA: la estructura (componentes,
// name/formcontrolname, clases) es la de la grabación del 13/10/2026; TODOS los valores son inventados (matrícula, fechas,
// importes, denominaciones). Nada de este fichero sale de la grabación salvo nombres de componente y etiquetas del portal.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import {
  ErrorMapaIncompleto,
  exigirPasoCompleto,
  importeDePrimaTotal,
  indiceFilaVehiculo,
  leerFilasDialogoVehiculo,
  leerPrimasMapfre,
  leerResumenVehiculo,
  mapfreAuto,
  pasoDatosBasicos,
  planDelPaso,
  precioDesdeObjetoAsegurado,
  ofertasDesdePrimasMapfre,
  PANTALLAS_GRABACION,
  planObjetoYFiguras,
  primasDesdeTarjetas,
  rellenarCamposTexto,
  resumenDesdePares,
  SEL_CONDUCTOR,
  SEL_HISTORIAL,
  SEL_OBJETO,
  SEL_TOMADOR,
  TOTAL_PANTALLAS_GRABACION,
} from '../src/adapters/mapfre/auto.ts'
import { adaptadores } from '../src/adapters/index.ts'
import { ErrorEleccionVersion } from '../src/adapters/allianz/auto.ts'
import { ErrorTarificador } from '../src/errores.ts'
import { comprobarBoton, EmisionBloqueadaError, type FormularioAuto } from '@central/module-tarificacion'

const form: FormularioAuto = {
  ramo: 'auto',
  matricula: '0000BBB',
  codigoPostal: '00001',
  conductor: { fechaNacimiento: '1980-02-03', fechaCarne: '2005-06-07', sexo: null },
  tomadorEsConductor: null,
  tomadorEsPropietario: null,
  aniosAseguradoAnterior: 3,
  siniestrosUltimos5Anios: 0,
  garajeNoche: null,
  tomador: null,
  eleccionVersion: null,
  seleccionVehiculo: null,
}

const TARJETA = (producto: string, periodicidad: string, prima: string, aviso: boolean) => `<prima-producto>
<header><mat-checkbox disabled></mat-checkbox></header>
<section><mat-select><div class="mat-select-value"><span class="mat-select-value-text"><span class="mat-select-min-line">${producto}</span></span></div></mat-select>
<mat-select><div class="mat-select-value"><span class="mat-select-value-text"><span class="mat-select-min-line">${periodicidad}</span></span></div></mat-select></section>
<section><div class="caja-primas"><div><p><strong> ${prima}  </strong></p></div>
<div class="botoneria"><div class="ccttVerificacion">${aviso ? '<span class="material-icons warning-color">warning</span>' : ''}</div></div></div></section>
</prima-producto>`

const PRIMAS = `<body><app-primas>
${TARJETA('PRODUCTO UNO', 'ANUAL', 'PRIMA TOTAL: 100,10 €', false)}
${TARJETA('PRODUCTO DOS', 'ANUAL', 'PRIMA TOTAL: 200,20 €', true)}
${TARJETA('PRODUCTO TRES', 'ANUAL', 'PRIMA TOTAL: 1.300,30 €', true)}
</app-primas></body>`

const DIALOGO = (filas: Array<[string, string]>) => `<body><app-matricula-dialog><table><thead><tr><th></th><th>Matrícula</th><th>Nº Bastidor</th><th>Denominación comercial</th><th>CV/KW</th><th>CC</th><th>Nº Puertas</th><th>Fecha Inicio</th></tr></thead><tbody>
${filas.map(([d, i]) => `<tr><td><input type="checkbox"></td><td>MATRICULA-FICTICIA</td><td>BASTIDOR-FICTICIO</td><td> ${d} </td><td>100</td><td>1500</td><td>5</td><td>${i}</td></tr>`).join('\n')}
</tbody></table></app-matricula-dialog></body>`

const RESUMEN = `<body><app-datos-vehiculo><mat-expansion-panel-header><mat-panel-description><span> MARCA PRUEBA MODELO X ACABADO Y </span></mat-panel-description></mat-expansion-panel-header>
<div role="region"><div><div><div><div><span>Combustible:</span><span> GASOLINA </span></div><div><span>Tipo Vehículo:</span><span> TURISMO </span></div></div>
<div><div><span>Potencia:</span><span> 110,00 </span></div><div><span>Cod. Mapfre:</span><span> 000000 </span></div></div></div></div></div></app-datos-vehiculo></body>`

// Campos con los names reales; `siniestros` también existe en otro componente (descuentos) y NO debe tocarse.
const CAMPOS = (extra = '') => `<body>
<app-datos-vehiculo><input name="matricula" formcontrolname="matricula"><input name="cpCirculacion" formcontrolname="codPostal"></app-datos-vehiculo>
<app-conductor-habitual><input name="fechaNacimiento"><input name="fechaExpedicion"><input name="codigoDocumento"></app-conductor-habitual>
<app-historial-siniestralidad><input formcontrolname="siniestros" ${extra}><input formcontrolname="tiempoAntComp" disabled></app-historial-siniestralidad>
<app-info-descuentos><input name="siniestros" formcontrolname="siniestros"></app-info-descuentos>
</body>`

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

test('Mapfre está REGISTRADO siempre (coche y moto) y el registro no lee ningún interruptor del entorno', () => {
  // 14/10/2026 (Alberto): el worker de Fly no recibe secretos nuevos; la puerta es la fila companias_integracion (asegura).
  assert.equal(adaptadores.obtener('mapfre', 'auto'), mapfreAuto)
  assert.equal(adaptadores.obtener('mapfre', 'moto')?.ramo, 'moto')
  const idx = readFileSync(join(import.meta.dirname, '../src/adapters/index.ts'), 'utf8')
  assert.ok(!/TARIFICADOR_MAPFRE_ACTIVO|mapfreActivo/.test(idx), 'sin interruptor de máquina para Mapfre')
  assert.match(idx, /^adaptadores\.registrar\(mapfreAuto\)$/m)
  assert.match(idx, /^adaptadores\.registrar\(mapfreMoto\)$/m)
})

test('el mapa de pantallas cubre 1..19 sin huecos ni solapes', () => {
  let siguiente = 1
  for (const p of PANTALLAS_GRABACION) {
    assert.equal(p.desde, siguiente, `hueco o solape antes de la pantalla ${p.desde}`)
    assert.ok(p.hasta >= p.desde)
    siguiente = p.hasta + 1
  }
  assert.equal(siguiente - 1, TOTAL_PANTALLAS_GRABACION)
})

test('importeDePrimaTotal: formato español, y fail-closed con el placeholder, basura o cero', () => {
  assert.equal(importeDePrimaTotal(' PRIMA TOTAL: 1.234,56 € '), 1234.56)
  assert.equal(importeDePrimaTotal('PRIMA TOTAL: 123,45 €'), 123.45)
  assert.equal(importeDePrimaTotal('PRIMA TOTAL: {{primaTotal}} €'), null)
  assert.equal(importeDePrimaTotal('PRIMA TOTAL: 0,00 €'), null)
  assert.equal(importeDePrimaTotal('123,45 €'), null)
  assert.equal(importeDePrimaTotal(null), null)
})

test('primasDesdeTarjetas: una tarjeta ilegible o sin tarjetas es error, no omisión; periodicidad no vista es hueco', () => {
  const ok = { producto: 'P', periodicidad: 'ANUAL', textoPrima: 'PRIMA TOTAL: 10,00 €', avisoVerificacion: false }
  assert.deepEqual(primasDesdeTarjetas([ok]), [{ producto: 'P', periodicidad: 'anual', primaTotalEur: 10, requiereVerificacionVehiculo: false }])
  assert.throws(() => primasDesdeTarjetas([]), ErrorTarificador)
  assert.throws(() => primasDesdeTarjetas([ok, { ...ok, textoPrima: 'PRIMA TOTAL: {{primaTotal}} €' }]), /prima ilegible/)
  assert.throws(() => primasDesdeTarjetas([{ ...ok, producto: ' ' }]), /no trae nombre/)
  assert.throws(() => primasDesdeTarjetas([{ ...ok, periodicidad: 'MENSUAL' }]), ErrorMapaIncompleto)
})

test('leerPrimasMapfre lee las 3 tarjetas y marca las que piden verificación', async () => {
  await page.setContent(PRIMAS)
  const p = await leerPrimasMapfre(page)
  assert.deepEqual(
    p.map((x) => [x.producto, x.primaTotalEur, x.requiereVerificacionVehiculo]),
    [['PRODUCTO UNO', 100.1, false], ['PRODUCTO DOS', 200.2, true], ['PRODUCTO TRES', 1300.3, true]],
  )
  const o = ofertasDesdePrimasMapfre(p, null)
  assert.equal(o.length, 3)
  assert.equal(o[0]!.compania, 'mapfre')
  assert.equal(o[2]!.producto, 'Auto · PRODUCTO TRES')
  assert.equal(o[2]!.primaAnualEur, 1300.3)
  assert.ok(o[1]!.avisos.some((a) => /verificación del vehículo/.test(a)))
  assert.ok(!o[0]!.avisos.some((a) => /verificación del vehículo/.test(a)))
})

test('leerPrimasMapfre: sin tarjetas (paso sin calcular) → error portal, nunca lista vacía', async () => {
  await page.setContent('<body><app-primas></app-primas></body>')
  await assert.rejects(() => leerPrimasMapfre(page), ErrorTarificador)
})

test('diálogo de vehículos: lee denominación y datos de catálogo, NUNCA matrícula ni bastidor', async () => {
  await page.setContent(DIALOGO([['Marca Prueba Modelo X Version A', '01/01/2020'], ['Marca Prueba Modelo X Version B', '01/01/2021']]))
  const filas = await leerFilasDialogoVehiculo(page)
  assert.equal(filas.length, 2)
  assert.deepEqual(filas[0], { denominacion: 'Marca Prueba Modelo X Version A', cvKw: '100', cc: '1500', puertas: '5', fechaInicio: '01/01/2020' })
  assert.ok(!JSON.stringify(filas).includes('FICTICI'), 'la matrícula y el bastidor no salen de la lectura')
})

test('indiceFilaVehiculo: una fila → ella; varias sin elección → ErrorEleccionVersion; con elección exacta → su índice', () => {
  const f = (d: string) => ({ denominacion: d, cvKw: '', cc: '', puertas: '', fechaInicio: '' })
  assert.equal(indiceFilaVehiculo([f('A')], null), 0)
  const dos = [f('Version A'), f('Version B')]
  assert.throws(() => indiceFilaVehiculo(dos, null), ErrorEleccionVersion)
  assert.equal(indiceFilaVehiculo(dos, { etiqueta: 'Version B' }), 1)
  assert.throws(() => indiceFilaVehiculo([], null), ErrorTarificador)
  assert.throws(() => indiceFilaVehiculo([f('Misma'), f('misma')], { etiqueta: 'Misma' }), ErrorEleccionVersion, 'misma denominación en dos filas: no se distingue por etiqueta')
})

test('resumen del vehículo: pares etiqueta/valor; vacío o ausente → null (no 0 ni cajón)', async () => {
  await page.setContent(RESUMEN)
  const r = await leerResumenVehiculo(page)
  assert.deepEqual(r, { denominacion: 'MARCA PRUEBA MODELO X ACABADO Y', combustible: 'GASOLINA', tipoVehiculo: 'TURISMO', potencia: '110,00', codigoMapfre: '000000', cambio: null })
  assert.deepEqual(resumenDesdePares(null, [['Combustible:', ' ']]), { denominacion: null, combustible: null, tipoVehiculo: null, potencia: null, codigoMapfre: null, cambio: null })
})

test('planObjetoYFiguras: escribe solo lo conocido y deja el resto como pendiente; fail-closed sin siniestros / CP', () => {
  const plan = planObjetoYFiguras(form)
  assert.deepEqual(plan.escribibles.map((o) => [o.sel, o.valor]), [
    [SEL_OBJETO.matricula, '0000BBB'],
    [SEL_OBJETO.cpCirculacion, '00001'],
    [SEL_CONDUCTOR.fechaNacimiento, '03/02/1980'],
    [SEL_CONDUCTOR.fechaCarne, '07/06/2005'],
    [SEL_HISTORIAL.siniestrosRc5, '0'],
  ])
  assert.ok(plan.pendientes.some((o) => o.sel === SEL_HISTORIAL.companiaAnterior), 'con años asegurado > 0 hay compañía anterior pendiente')
  assert.ok(!plan.escribibles.some((o) => o.sel === SEL_HISTORIAL.aniosCompaniaAnterior), 'el campo deshabilitado nunca se escribe')
  assert.throws(() => planObjetoYFiguras({ ...form, siniestrosUltimos5Anios: null }), /siniestros/)
  assert.throws(() => planObjetoYFiguras({ ...form, aniosAseguradoAnterior: null }), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && /compañía anterior/.test(e.message))
  assert.throws(() => planObjetoYFiguras({ ...form, codigoPostal: '123' }), /5 dígitos/)
  assert.throws(() => planObjetoYFiguras({ ...form, ramo: 'moto' }), /moto/)
})

test('rellenarCamposTexto escribe con ámbito (no toca el homónimo de otro componente) y devuelve lo pendiente', async () => {
  await page.setContent(CAMPOS())
  const pendientes = await rellenarCamposTexto(page, planObjetoYFiguras(form))
  assert.ok(pendientes.includes('uso del vehículo'))
  assert.equal(await page.locator(SEL_OBJETO.matricula).inputValue(), '0000BBB')
  assert.equal(await page.locator(SEL_CONDUCTOR.fechaCarne).inputValue(), '07/06/2005')
  assert.equal(await page.locator(SEL_HISTORIAL.siniestrosRc5).inputValue(), '0')
  assert.equal(await page.locator('app-info-descuentos input').inputValue(), '', 'el campo homónimo de descuentos queda intacto')
  assert.equal(await page.locator(SEL_HISTORIAL.aniosCompaniaAnterior).inputValue(), '')
})

test('rellenarCamposTexto: un campo con manejador de emisión para ANTES de escribir (comprobarCampo)', async () => {
  await page.setContent(CAMPOS('onchange="emitirPoliza()"'))
  await assert.rejects(() => rellenarCamposTexto(page, planObjetoYFiguras(form)), EmisionBloqueadaError)
  assert.equal(await page.locator(SEL_HISTORIAL.siniestrosRc5).inputValue(), '', 'no se escribió en el campo bloqueado')
})

test('campo ausente → error portal con la etiqueta, sin valores', async () => {
  await page.setContent('<body><app-datos-vehiculo></app-datos-vehiculo></body>')
  await assert.rejects(() => rellenarCamposTexto(page, planObjetoYFiguras(form)), (e: Error) => /matrícula/.test(e.message) && !e.message.includes('0000BBB'))
})

const NIF = '00000000T'
const conNif: FormularioAuto = { ...form, documentoTomador: NIF }
const ctxFalso = (registro: string[] = []) => ({
  pulsar: async () => { registro.push('pulsar') },
  pausa: async () => {},
  log: () => {},
  pulsarEnlaceEntrada: async () => { registro.push('entrada') },
  confirmarVehiculoMapfre: async () => { registro.push('vehiculo') },
  continuarMapfre: async (_p: Page, paso: string) => { registro.push(`continuar:${paso}`) },
}) as unknown as Parameters<typeof mapfreAuto.tarificar>[2]

test('tarificar: sin funciones guardadas o sin NIF del tomador para ANTES de navegar; otro ramo → datos', async () => {
  let navego = false
  const pagina = { goto: async () => { navego = true; return null } } as unknown as Page
  const sinGuardadas = { pulsar: async () => {}, pausa: async () => {}, log: () => {} } as unknown as Parameters<typeof mapfreAuto.tarificar>[2]
  await assert.rejects(() => mapfreAuto.tarificar(pagina, conNif, sinGuardadas), ErrorMapaIncompleto)
  const sinContinuar = { ...ctxFalso(), continuarMapfre: undefined } as unknown as Parameters<typeof mapfreAuto.tarificar>[2]
  await assert.rejects(() => mapfreAuto.tarificar(pagina, conNif, sinContinuar), ErrorMapaIncompleto)
  await assert.rejects(() => mapfreAuto.tarificar(pagina, form, ctxFalso()), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && /NIF/.test(e.message))
  assert.equal(navego, false)
  await assert.rejects(() => mapfreAuto.tarificar(pagina, { ...conNif, ramo: 'comunidades' } as unknown as FormularioAuto, ctxFalso()), (e) => e instanceof ErrorTarificador && e.tipo === 'datos')
})

test('paso 1: con NIF y campo mapeado, la LUPA es hueco con inventario y el NIF NO se teclea (ni sale en el error)', async () => {
  await page.setContent('<body><app-datos-basicos><input name="codigoDocumento"><mat-icon>search</mat-icon></app-datos-basicos></body>')
  const r: string[] = []
  await assert.rejects(() => pasoDatosBasicos(page, conNif, ctxFalso(r)), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /lupa/.test(e.message) && !e.message.includes(NIF))
  assert.equal(await page.locator(SEL_TOMADOR.documento).inputValue(), '', 'el NIF no queda en la pantalla')
  assert.deepEqual(r, [], 'no se pulsa ni se continúa')
  // Sin NIF → datos; sin campo → hueco con inventario.
  await assert.rejects(() => pasoDatosBasicos(page, form, ctxFalso()), (e) => e instanceof ErrorTarificador && e.tipo === 'datos')
  await page.setContent('<body><app-datos-basicos></app-datos-basicos></body>')
  await assert.rejects(() => pasoDatosBasicos(page, conNif, ctxFalso()), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /campo NIF/.test(e.message))
})

test('paso 1: un campo NIF con manejador de emisión para ANTES (comprobarCampo)', async () => {
  await page.setContent('<body><app-datos-basicos><input name="codigoDocumento" onchange="emitirPoliza()"></app-datos-basicos></body>')
  await assert.rejects(() => pasoDatosBasicos(page, conNif, ctxFalso()), EmisionBloqueadaError)
})

test('del paso 2 al precio: escribe el CP y PARA antes de «Continuar» si quedan mat-select sin mapear (nada supuesto)', async () => {
  await page.setContent(CAMPOS())
  const r: string[] = []
  const veh = { origen: 'mapfre', denominacion: 'MARCA PRUEBA', cv: null, cc: null, puertas: null, fechaInicio: null } as unknown as Parameters<typeof precioDesdeObjetoAsegurado>[2]
  await assert.rejects(() => precioDesdeObjetoAsegurado(page, conNif, veh, ctxFalso(r)), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /uso del vehículo/.test(e.message))
  assert.equal(await page.locator(SEL_OBJETO.cpCirculacion).inputValue(), '00001')
  assert.equal(await page.locator(SEL_OBJETO.matricula).inputValue(), '', 'la matrícula no se vuelve a teclear (ya la tecleó la consulta del vehículo)')
  assert.deepEqual(r, [], 'sin «Continuar» con controles pendientes')
  await assert.rejects(() => precioDesdeObjetoAsegurado(page, { ...conNif, ramo: 'moto' }, veh, ctxFalso()), (e) => e instanceof ErrorMapaIncompleto && /MOTO/.test(e.message))
})

test('planDelPaso / exigirPasoCompleto: cada operación es de su paso; un paso con pendientes no se completa', () => {
  const plan = planObjetoYFiguras(form)
  assert.deepEqual(planDelPaso(plan, 'objetoAsegurado', [SEL_OBJETO.matricula]).escribibles.map((o) => o.sel), [SEL_OBJETO.cpCirculacion])
  assert.deepEqual(planDelPaso(plan, 'figuras').escribibles.map((o) => o.sel), [SEL_CONDUCTOR.fechaNacimiento, SEL_CONDUCTOR.fechaCarne, SEL_HISTORIAL.siniestrosRc5])
  assert.throws(() => exigirPasoCompleto(plan, 'figuras'), (e) => e instanceof ErrorMapaIncompleto && /clase del permiso/.test(e.message))
  assert.doesNotThrow(() => exigirPasoCompleto({ escribibles: plan.escribibles, pendientes: [] }, 'figuras'))
})

test('el guard rechaza los botones peligrosos de NSEI y el adaptador no pulsa nada', () => {
  for (const t of ['Contratar', 'Contratación', 'Aceptar', 'Aceptar Obs. y Cláusulas']) assert.throws(() => comprobarBoton([t]), EmisionBloqueadaError, t)
  const src = readFileSync(join(import.meta.dirname, '../src/adapters/mapfre/auto.ts'), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join('\n')
  assert.ok(!/\.click\s*\(|pulsar\s*\(|\.check\s*\(|setChecked|dispatchEvent|keyboard|\.press\s*\(/.test(src), 'el adaptador de Mapfre no pulsa, marca ni teclea teclas')
  assert.ok(!/aceptar|emitir|archivar|formalizar|has-text|text=/i.test(src), 'ningún selector por texto ni verbo de acción peligrosa en el código')
})

// ───────────── mat-select: mapeo explícito + capa común (pieza 4, 14/10/2026) ─────────────
import { MAPEO_MAPFRE_AUTO, rellenarMatSelects, textosMapfreDe } from '../src/adapters/mapfre/auto.ts'

test('MAPEO_MAPFRE_AUTO: datos explícitos y congelados; sin valor o sin mapeo → null (no se supone nada)', () => {
  assert.deepEqual(textosMapfreDe('uso', 'Particular'), ['Particular', 'Privado'])
  assert.deepEqual(textosMapfreDe('ambito', 'espana'), ['España', 'Nacional'])
  assert.deepEqual(textosMapfreDe('clasePermiso', 'B'), ['B'])
  for (const v of [null, undefined, '', 'taxi', '__proto__', 'toString']) assert.equal(textosMapfreDe('uso', v), null, String(v))
  assert.ok(Object.isFrozen(MAPEO_MAPFRE_AUTO) && Object.isFrozen(MAPEO_MAPFRE_AUTO.uso.particular))
})

test('planObjetoYFiguras: con los valores del formulario los mat-select pasan a escribibles (con sus textos de Mapfre); sin ellos, pendientes como antes', () => {
  const sin = planObjetoYFiguras(form)
  assert.deepEqual(sin.pendientes.map((o) => o.etiqueta).slice(0, 3), ['uso del vehículo', 'ámbito de circulación', 'clase del permiso'])
  const con = planObjetoYFiguras({ ...form, usoVehiculo: 'particular', ambitoCirculacion: 'espana', clasePermiso: 'b', companiaAnterior: 'Aseguradora Ficticia' } as FormularioAuto)
  const selects = con.escribibles.filter((o) => o.tipo === 'mat-select')
  assert.deepEqual(selects.map((o) => [o.etiqueta, o.opciones]), [
    ['uso del vehículo', ['Particular', 'Privado']],
    ['ámbito de circulación', ['España', 'Nacional']],
    ['clase del permiso', ['B']],
    ['compañía anterior', ['Aseguradora Ficticia']],
  ])
  assert.deepEqual(con.pendientes.map((o) => o.etiqueta), ['¿tiene compañía anterior?'], 'el interruptor sigue sin DOM: pendiente')
  // Un valor sin mapeo NO se inventa: sigue pendiente.
  const raro = planObjetoYFiguras({ ...form, usoVehiculo: 'taxi' } as unknown as FormularioAuto)
  assert.ok(raro.pendientes.some((o) => o.etiqueta === 'uso del vehículo'))
})

test('rellenarMatSelects: cada mat-select del plan por ctx.elegirMatSelect con sus textos; sin la función o sin desplegable → hueco con inventario', async () => {
  const plan = planDelPaso(planObjetoYFiguras({ ...form, usoVehiculo: 'particular', ambitoCirculacion: 'espana', clasePermiso: 'b' } as FormularioAuto), 'objetoAsegurado')
  await page.setContent(`<body><app-datos-vehiculo><mat-select formcontrolname="uso">x</mat-select><mat-select formcontrolname="ambitoCirculacion">y</mat-select></app-datos-vehiculo></body>`)
  const vistos: unknown[] = []
  const hechos = await rellenarMatSelects(page, plan, { elegirMatSelect: async (_s, valores, o) => { vistos.push([o.etiqueta, valores]); return { texto: 'x', origen: 'coincidencia' as const } } })
  assert.deepEqual(hechos, ['uso del vehículo', 'ámbito de circulación'])
  assert.deepEqual(vistos, [['uso del vehículo', ['Particular', 'Privado']], ['ámbito de circulación', ['España', 'Nacional']]])
  await assert.rejects(() => rellenarMatSelects(page, plan, {}), (e) => e instanceof ErrorMapaIncompleto)
  await page.setContent('<body></body>')
  await assert.rejects(() => rellenarMatSelects(page, plan, { elegirMatSelect: async () => ({ texto: '', origen: 'ia' as const }) }), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom)
  assert.deepEqual(await rellenarMatSelects(page, { escribibles: [], pendientes: [] }, {}), [])
})
