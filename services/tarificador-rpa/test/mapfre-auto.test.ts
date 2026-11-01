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
  SEL_LICENCIA,
  SEL_OBJETO,
  SEL_TOMADOR,
  TOTAL_PANTALLAS_GRABACION,
} from '../src/adapters/mapfre/auto.ts'
import { adaptadores } from '../src/adapters/index.ts'
import { ErrorEleccionVersion } from '../src/adapters/allianz/auto.ts'
import { ErrorTarificador } from '../src/errores.ts'
import { ErrorOpcionSinResolver } from '../src/mat-select.ts'
import { comprobarBoton, EmisionBloqueadaError, supuestosDeAvisos, textoSupuestos, type FormularioAuto } from '@central/module-tarificacion'

const form: FormularioAuto = {
  ramo: 'auto',
  matricula: '0000BBB',
  codigoPostal: '00001',
  conductor: { fechaNacimiento: '1980-02-03', fechaCarne: '2005-06-07', sexo: null },
  tomadorEsConductor: true,
  tomadorEsPropietario: null,
  aniosAseguradoAnterior: 3,
  siniestrosUltimos5Anios: 0,
  garajeNoche: null,
  tomador: null,
  eleccionVersion: null,
  seleccionVehiculo: null,
  companiaAnterior: 'ASEGURADORA FICTICIA',
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
<app-conductor-habitual><input name="fechaNacimiento"><input name="codigoDocumento"></app-conductor-habitual>
<datos-licencia><input name="fechaExpedicion"></datos-licencia>
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

test('ofertasDesdePrimasMapfre (v0.8.6): el supuesto de la versión llega a los avisos de CADA oferta con el prefijo «Precio con supuestos»; sin supuesto, ninguno', async () => {
  await page.setContent(PRIMAS)
  const p = await leerPrimasMapfre(page)
  const sup = textoSupuestos(['vehículo/versión: el primero de la lista (supuesto, había 5)'])
  const con = ofertasDesdePrimasMapfre(p, null, sup)
  for (const o of con) assert.ok(o.avisos.includes('Precio con supuestos: vehículo/versión: el primero de la lista (supuesto, había 5).'))
  assert.equal(supuestosDeAvisos(con[0]!.avisos), 'Precio con supuestos: vehículo/versión: el primero de la lista (supuesto, había 5).')
  for (const o of ofertasDesdePrimasMapfre(p, null)) assert.equal(supuestosDeAvisos(o.avisos), null)
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

test('planObjetoYFiguras: escribe solo lo conocido y deja el resto como pendiente; fail-closed sin CP; antecedentes sin dato = supuesto favorable', () => {
  const plan = planObjetoYFiguras(form)
  assert.deepEqual(plan.escribibles.map((o) => [o.sel, o.valor]), [
    [SEL_OBJETO.matricula, '0000BBB'],
    [SEL_OBJETO.cpCirculacion, '00001'],
    [SEL_LICENCIA.fechaCarne, '07/06/2005'],
    [SEL_HISTORIAL.siniestrosRc5, '0'],
    [SEL_HISTORIAL.companiaAnterior, 'ASEGURADORA FICTICIA'],
  ])
  assert.ok(!plan.escribibles.some((o) => o.sel === SEL_CONDUCTOR.fechaNacimiento), 'v0.8.0: la fecha de nacimiento es la del tomador (paso 1); en Figuras no se teclea')
  assert.deepEqual(plan.pendientes.map((o) => o.etiqueta), ['uso del vehículo', 'ámbito de circulación', 'clase del permiso'], 'sin valor en el formulario: pendientes (no se suponen)')
  assert.throws(() => planObjetoYFiguras({ ...form, companiaAnterior: null }), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && /compañía anterior/.test(e.message))
  assert.ok(!plan.escribibles.some((o) => o.sel === SEL_HISTORIAL.aniosCompaniaAnterior), 'el campo deshabilitado nunca se escribe')
  // 18/10/2026 «supuesto favorable»: sin siniestros → 0; sin años → 5 o más, y entonces la compañía anterior SÍ hace falta.
  assert.equal(planObjetoYFiguras({ ...form, siniestrosUltimos5Anios: null }).escribibles.find((o) => o.sel === SEL_HISTORIAL.siniestrosRc5)?.valor, '0')
  assert.ok(planObjetoYFiguras({ ...form, aniosAseguradoAnterior: null }).escribibles.some((o) => o.sel === SEL_HISTORIAL.companiaAnterior))
  assert.throws(() => planObjetoYFiguras({ ...form, aniosAseguradoAnterior: null, companiaAnterior: null }), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && /compañía anterior/.test(e.message))
  assert.throws(() => planObjetoYFiguras({ ...form, codigoPostal: '123' }), /5 dígitos/)
  // v0.8.7: moto ya tiene plan (el del coche); un ramo ajeno sigue siendo `datos`.
  assert.doesNotThrow(() => planObjetoYFiguras({ ...form, ramo: 'moto' }))
  assert.throws(() => planObjetoYFiguras({ ...form, ramo: 'hogar' } as unknown as FormularioAuto), /hogar/)
})

test('rellenarCamposTexto escribe con ámbito (no toca el homónimo de otro componente) y devuelve lo pendiente', async () => {
  await page.setContent(CAMPOS())
  const pendientes = await rellenarCamposTexto(page, planObjetoYFiguras(form))
  assert.ok(pendientes.includes('uso del vehículo'))
  assert.equal(await page.locator(SEL_OBJETO.matricula).inputValue(), '0000BBB')
  assert.equal(await page.locator(SEL_LICENCIA.fechaCarne).inputValue(), '07/06/2005')
  assert.equal(await page.locator(SEL_CONDUCTOR.fechaNacimiento).inputValue(), '', 'el conductor habitual (grabación 13/10) ya no se teclea')
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
  cerrarClubMapfre: async () => { registro.push('club'); return 'cerrado' },
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

// ── Paso 1 SIN LUPA (14/10/2026): Mapfre busca sola al salir del campo del NIF. Fixtures SINTÉTICAS; todo dato es un placeholder. ──
const AVISO_SIN_REGISTRO = 'NO EXISTE NINGUN REGISTRO PARA ESA CONDICION DE BUSQUEDA'
const TOMADOR_HTML = (o: { alAbandonar?: string; campos?: boolean; lupa?: boolean; razon?: boolean; alTeclearNombre?: string; alSalirFecha?: string } = {}) => `<body><app-datos-basicos>
  <input name="codigoDocumento" onblur="${o.alAbandonar ?? ''}">
  ${o.lupa === false ? '' : '<button id="lupa" aria-label="Buscar" onclick="window.__lupa=(window.__lupa||0)+1"><mat-icon>search</mat-icon></button>'}
  ${o.campos === false ? '' : `<input name="nombre" oninput="${o.alTeclearNombre ?? ''}"><input name="primerApellido"><input name="segundoApellido"><input name="fechaNacimiento" onblur="${o.alSalirFecha ?? ''}">`}
  ${o.razon ? '<input name="razonSocial">' : ''}
  <mat-error id="err"></mat-error><span id="res"></span>
</app-datos-basicos></body>`
const AUTORRELLENO = `setTimeout(()=>{for(const [n,v] of [['nombre','NOMBRE AUTO'],['primerApellido','APELLIDO AUTO'],['fechaNacimiento','01/01/1990']])document.querySelector('[name='+n+']').value=v},80)`
const SIN_REGISTRO = `setTimeout(()=>{document.getElementById('res').textContent='${AVISO_SIN_REGISTRO}'},80)`
const lupaPulsada = () => page.evaluate(() => (window as unknown as { __lupa?: number }).__lupa ?? 0)
const valor = (n: string) => page.locator(`app-datos-basicos input[name="${n}"]`).inputValue()
const conTomador = { ...conNif, tomador: { tipo: 'fisica', nombre: 'NOMBRE FICHA', apellido1: 'APELLIDO1 FICHA', apellido2: 'APELLIDO2 FICHA', documentoIdentidad: NIF, fechaNacimiento: '1985-03-07', razonSocial: null, codigoPostal: null, poblacion: null, direccion: null, telefono: null, email: null } } as FormularioAuto

test('paso 1 SIN LUPA: tomador que EXISTE (Mapfre autorrellena al salir del campo) → no se teclea ni sobrescribe nada y se continúa', async () => {
  await page.setContent(TOMADOR_HTML({ alAbandonar: AUTORRELLENO }))
  const r: string[] = []
  await pasoDatosBasicos(page, conTomador, ctxFalso(r), 3_000)
  assert.equal(await page.locator(SEL_TOMADOR.documento).inputValue(), NIF)
  assert.equal(await valor('nombre'), 'NOMBRE AUTO', 'lo autorrellenado por Mapfre no se toca')
  assert.equal(await valor('primerApellido'), 'APELLIDO AUTO')
  assert.equal(await valor('segundoApellido'), '', 'ni se añade lo que Mapfre no puso')
  assert.equal(await valor('fechaNacimiento'), '01/01/1990')
  assert.equal(await lupaPulsada(), 0, 'la lupa NO se pulsa')
  assert.deepEqual(r, ['continuar:datosBasicos'])
})

test('paso 1 SIN LUPA: tomador NUEVO (aviso «no existe ningún registro» + campos vacíos) → se da de alta con la ficha y se continúa; NO es error', async () => {
  await page.setContent(TOMADOR_HTML({ alAbandonar: SIN_REGISTRO }))
  const r: string[] = []
  await pasoDatosBasicos(page, conTomador, ctxFalso(r), 3_000)
  assert.equal(await valor('nombre'), 'NOMBRE FICHA')
  assert.equal(await valor('primerApellido'), 'APELLIDO1 FICHA')
  assert.equal(await valor('segundoApellido'), 'APELLIDO2 FICHA')
  assert.equal(await valor('fechaNacimiento'), '07/03/1985', 'dd/mm/aaaa')
  assert.equal(await lupaPulsada(), 0)
  assert.deepEqual(r, ['continuar:datosBasicos'])
})

test('paso 1 SIN LUPA: sin aviso ni autorrelleno tras la espera → INDETERMINADO (hueco con inventario), nunca «nuevo»: nada tecleado salvo el NIF', async () => {
  await page.setContent(TOMADOR_HTML())
  const r: string[] = []
  await assert.rejects(() => pasoDatosBasicos(page, conTomador, ctxFalso(r), 700), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /reacción de Mapfre/.test(e.message))
  for (const n of ['nombre', 'primerApellido', 'segundoApellido', 'fechaNacimiento']) assert.equal(await valor(n), '', `${n} intacto`)
  assert.deepEqual(r, [], 'sin «Continuar»')
})

test('paso 1 SIN LUPA: tomador nuevo sin segundo apellido en la ficha → no se teclea', async () => {
  await page.setContent(TOMADOR_HTML({ alAbandonar: SIN_REGISTRO }))
  const r: string[] = []
  const sin2 = { ...conTomador, tomador: { ...conTomador.tomador!, apellido2: null } } as FormularioAuto
  await pasoDatosBasicos(page, sin2, ctxFalso(r), 3_000)
  assert.equal(await valor('segundoApellido'), '')
  assert.equal(await valor('fechaNacimiento'), '07/03/1985')
  assert.deepEqual(r, ['continuar:datosBasicos'])
})

test('paso 1 SIN LUPA: tomador nuevo y tras el alta queda un «Campo obligatorio» → hueco con inventario, SIN «Continuar»', async () => {
  await page.setContent(TOMADOR_HTML({ alAbandonar: SIN_REGISTRO }))
  await page.evaluate(() => { document.getElementById('err')!.textContent = 'Campo obligatorio' })
  const r: string[] = []
  await assert.rejects(() => pasoDatosBasicos(page, conTomador, ctxFalso(r), 3_000), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /Campo obligatorio/.test(e.message) && !e.message.includes(NIF))
  assert.deepEqual(r, [])
})

test('paso 1 SIN LUPA: tomador nuevo sin nombre/apellido/nacimiento en la ficha → `datos` explícito (nada tecleado salvo el NIF, sin «Continuar»)', async () => {
  await page.setContent(TOMADOR_HTML({ alAbandonar: SIN_REGISTRO }))
  const r: string[] = []
  await assert.rejects(() => pasoDatosBasicos(page, conNif, ctxFalso(r), 3_000), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && /no trae/.test(e.message) && !e.message.includes(NIF))
  assert.equal(await valor('nombre'), '')
  assert.deepEqual(r, [])
})

test('paso 1 SIN LUPA: Mapfre no muestra los campos del tomador, o abre un diálogo de selección → hueco con inventario, sin teclear ni elegir', async () => {
  await page.setContent(TOMADOR_HTML({ campos: false, alAbandonar: SIN_REGISTRO }))
  const r: string[] = []
  await assert.rejects(() => pasoDatosBasicos(page, conTomador, ctxFalso(r), 600), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /reacción de Mapfre/.test(e.message))
  await page.setContent(TOMADOR_HTML({ alAbandonar: "document.body.insertAdjacentHTML('beforeend','<mat-dialog-container><button id=p1 onclick=window.__elegido=1>PERSONA 1</button></mat-dialog-container>')" }))
  await assert.rejects(() => pasoDatosBasicos(page, conTomador, ctxFalso(r), 3_000), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /diálogo/.test(e.message))
  assert.equal(await page.evaluate(() => (window as unknown as { __elegido?: number }).__elegido ?? 0), 0)
  assert.deepEqual(r, [])
})

test('paso 1: sin NIF → datos; sin campo NIF → hueco con inventario', async () => {
  await page.setContent(TOMADOR_HTML())
  await assert.rejects(() => pasoDatosBasicos(page, form, ctxFalso()), (e) => e instanceof ErrorTarificador && e.tipo === 'datos')
  await page.setContent('<body><app-datos-basicos></app-datos-basicos></body>')
  await assert.rejects(() => pasoDatosBasicos(page, conNif, ctxFalso()), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /campo NIF/.test(e.message))
})

test('paso 1: un campo NIF con manejador de emisión para ANTES (comprobarCampo)', async () => {
  await page.setContent('<body><app-datos-basicos><input name="codigoDocumento" onchange="emitirPoliza()"></app-datos-basicos></body>')
  await assert.rejects(() => pasoDatosBasicos(page, conNif, ctxFalso()), EmisionBloqueadaError)
})

test('del paso 2 al precio: escribe el CP y PARA antes de «Continuar» si quedan mat-select sin mapear (nada supuesto)', async () => {
  // v0.8.1: el «uso» SOLO cuenta como pendiente si la pantalla lo pinta (aquí sí: mat-select VISIBLE —v0.8.2: con contenido; uno
  // vacío mide 0×0 y no es visible— y sin valor en el riesgo).
  await page.setContent(CAMPOS().replace('</app-datos-vehiculo>', '<mat-select formcontrolname="uso">Uso</mat-select></app-datos-vehiculo>'))
  const r: string[] = []
  const veh = { origen: 'mapfre', denominacion: 'MARCA PRUEBA', cv: null, cc: null, puertas: null, fechaInicio: null } as unknown as Parameters<typeof precioDesdeObjetoAsegurado>[2]
  await assert.rejects(() => precioDesdeObjetoAsegurado(page, conNif, veh, ctxFalso(r)), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /uso del vehículo/.test(e.message))
  assert.equal(await page.locator(SEL_OBJETO.cpCirculacion).inputValue(), '00001')
  assert.equal(await page.locator(SEL_OBJETO.matricula).inputValue(), '', 'la matrícula no se vuelve a teclear (ya la tecleó la consulta del vehículo)')
  assert.deepEqual(r, [], 'sin «Continuar» con controles pendientes')
  // v0.8.7: moto ya no es hueco de mapa «plan de campos de MOTO»: para por lo mismo que el coche (el «uso» sin mapear).
  await assert.rejects(() => precioDesdeObjetoAsegurado(page, { ...conNif, ramo: 'moto' }, veh, ctxFalso()), (e) => e instanceof ErrorMapaIncompleto && !/MOTO/.test(e.message) && /uso del vehículo/.test(e.message))
})

test('v0.8.1 (trabajo real 39c8016e): sin mat-select «uso» ni «ámbito» en la pantalla, el paso 2 NO para: CP → «Continuar» y sigue a Figuras', async () => {
  await page.setContent(CAMPOS())
  const r: string[] = []
  const veh = { origen: 'mapfre', denominacion: 'MARCA PRUEBA', cv: null, cc: null, puertas: null, fechaInicio: null } as unknown as Parameters<typeof precioDesdeObjetoAsegurado>[2]
  // Se para MÁS ADELANTE (Figuras: el contexto falso no trae la función de mat-select), nunca por el «uso».
  await assert.rejects(() => precioDesdeObjetoAsegurado(page, { ...conNif, usoVehiculo: 'particular', ambitoCirculacion: 'espana' } as FormularioAuto, veh, ctxFalso(r)), (e) => e instanceof ErrorMapaIncompleto && !/uso del vehículo|ámbito/.test(e.message))
  assert.equal(await page.locator(SEL_OBJETO.cpCirculacion).inputValue(), '00001')
  assert.deepEqual(r, ['continuar:objetoAsegurado'], 'el paso 2 se completa sin uso/ámbito')
})

test('v0.8.1 (revisión): uso/ámbito ausentes solo se saltan con valor nulo o defecto; otro valor → atasco + hueco; aparecer tarde se rellena', async () => {
  const sinPantalla = '<body><button>Continuar</button></body>'
  const ctx = { elegirMatSelect: async () => ({ texto: 'x', origen: 'coincidencia' as const }) }
  // (a) ausente + defecto/nulo → sigue.
  await page.setContent(sinPantalla)
  for (const ex of [{}, { usoVehiculo: 'particular', ambitoCirculacion: 'espana' }]) {
    const plan = planDelPaso(planObjetoYFiguras({ ...form, ...ex, clasePermiso: 'b' } as FormularioAuto), 'objetoAsegurado')
    assert.deepEqual(await rellenarMatSelects(page, plan, ctx, undefined, 300), [])
    assert.deepEqual((await sinOpcionalesAusentes(page, plan, 300)).pendientes, [])
  }
  // (b) ausente + NO defecto → atasco + hueco (no se tarifica con el valor implícito de Mapfre).
  const alquiler = planDelPaso(planObjetoYFiguras({ ...form, usoVehiculo: 'alquiler', ambitoCirculacion: 'internacional' } as unknown as FormularioAuto), 'objetoAsegurado')
  assert.ok(alquiler.pendientes.every((o) => !o.opcional))
  // Sin mapeo → pendiente NO opcional: `sinOpcionalesAusentes` lo conserva aunque no aparezca y el paso para con inventario.
  const tras = await sinOpcionalesAusentes(page, alquiler, 300)
  assert.deepEqual(tras.pendientes.map((o) => o.etiqueta), ['uso del vehículo', 'ámbito de circulación'])
  assert.throws(() => exigirPasoCompleto(tras, 'objetoAsegurado'), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /uso del vehículo/.test(e.message))
  // Un escribible NO opcional ausente (camino de `rellenarMatSelects`) → atasco + hueco.
  const noOpc = { escribibles: [{ ...planObjetoYFiguras({ ...form, usoVehiculo: 'particular' } as FormularioAuto).escribibles.find((o) => o.etiqueta === 'uso del vehículo')!, opcional: false }], pendientes: [] }
  await assert.rejects(() => rellenarMatSelects(page, noOpc, ctx, undefined, 300), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /uso del vehículo/.test(e.message))
  const profesional = planDelPaso(planObjetoYFiguras({ ...form, usoVehiculo: 'profesional' } as unknown as FormularioAuto), 'objetoAsegurado')
  assert.ok(profesional.pendientes.some((o) => o.etiqueta === 'uso del vehículo' && !o.opcional))
  // (c) aparece TARDE dentro de la espera → se rellena (espera activa, no count() instantáneo).
  const plan = planDelPaso(planObjetoYFiguras({ ...form, usoVehiculo: 'particular', ambitoCirculacion: 'espana' } as FormularioAuto), 'objetoAsegurado')
  await page.setContent(sinPantalla)
  const vistos: string[] = []
  setTimeout(() => { void page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<app-datos-vehiculo><mat-select formcontrolname="uso">x</mat-select><mat-select formcontrolname="ambitoCirculacion">y</mat-select></app-datos-vehiculo>') }) }, 600)
  const hechos = await rellenarMatSelects(page, plan, { elegirMatSelect: async (_s, _v, o) => { vistos.push(o.etiqueta); return { texto: 'x', origen: 'coincidencia' as const } } }, undefined, 3_000)
  assert.deepEqual(hechos, ['uso del vehículo', 'ámbito de circulación'])
  assert.deepEqual(vistos, ['uso del vehículo', 'ámbito de circulación'])
  // Y la espera por omisión es la de ~2,5 s.
  assert.equal(ESPERA_OPCIONAL_MS, 2_500)
})

test('v0.8.2 (trabajo real con uso null): uso/ámbito en el DOM pero OCULTOS (0 visibles) = ausentes → se saltan sin abrir el desplegable', async () => {
  // El riesgo trae uso = null; el validador pone el defecto «particular» (`USO_VEHICULO_POR_DEFECTO`) → escribible OPCIONAL.
  // La pantalla `app-datos-vehiculo` tiene los mat-select en el DOM pero sin pintar: `count()` > 0 y 0 visibles. Antes se
  // abría la capa común («no aparece (o hay 0 visibles)») → atasco «ninguna opción clara» con las etiquetas de la pantalla.
  const oculto = '<body><app-datos-vehiculo><input name="matricula"><div style="display:none"><mat-select formcontrolname="uso">x</mat-select><mat-select formcontrolname="ambitoCirculacion">y</mat-select></div></app-datos-vehiculo></body>'
  const noAbrir = { elegirMatSelect: async (_s: unknown, _v: unknown, o: { etiqueta: string }) => { throw new ErrorOpcionSinResolver(`el desplegable «${o.etiqueta}» no aparece (o hay 0 visibles)`) } }
  for (const ex of [{ usoVehiculo: null, ambitoCirculacion: null }, { usoVehiculo: 'particular', ambitoCirculacion: 'espana' }]) {
    await page.setContent(oculto)
    const plan = planDelPaso(planObjetoYFiguras({ ...form, ...ex, clasePermiso: 'b' } as FormularioAuto), 'objetoAsegurado')
    assert.deepEqual(await rellenarMatSelects(page, plan, noAbrir as never, undefined, 300), [], JSON.stringify(ex))
    assert.deepEqual((await sinOpcionalesAusentes(page, plan, 300)).pendientes, [], JSON.stringify(ex))
  }
  // Regla dura intacta: con un valor NO por defecto, el desplegable oculto NO se salta (pendiente no opcional → para).
  await page.setContent(oculto)
  const alquiler = planDelPaso(planObjetoYFiguras({ ...form, usoVehiculo: 'alquiler', ambitoCirculacion: 'internacional' } as unknown as FormularioAuto), 'objetoAsegurado')
  assert.throws(() => exigirPasoCompleto(alquiler, 'objetoAsegurado'), (e) => e instanceof ErrorMapaIncompleto && /uso del vehículo/.test(e.message))
  // Y un escribible NO opcional oculto → atasco + hueco por «no aparece» (no por la capa común).
  const noOpc = { escribibles: [{ ...planObjetoYFiguras({ ...form, usoVehiculo: 'particular' } as FormularioAuto).escribibles.find((o) => o.etiqueta === 'uso del vehículo')!, opcional: false }], pendientes: [] }
  await assert.rejects(() => rellenarMatSelects(page, noOpc, noAbrir as never, undefined, 300), (e) => e instanceof ErrorMapaIncompleto && /uso del vehículo/.test(e.message))
})

test('planDelPaso / exigirPasoCompleto: cada operación es de su paso; un paso con pendientes no se completa', () => {
  const plan = planObjetoYFiguras(form)
  assert.deepEqual(planDelPaso(plan, 'objetoAsegurado', [SEL_OBJETO.matricula]).escribibles.map((o) => o.sel), [SEL_OBJETO.cpCirculacion])
  assert.deepEqual(planDelPaso(plan, 'figuras').escribibles.map((o) => o.sel), [SEL_LICENCIA.fechaCarne, SEL_HISTORIAL.siniestrosRc5, SEL_HISTORIAL.companiaAnterior])
  assert.throws(() => exigirPasoCompleto(plan, 'figuras'), (e) => e instanceof ErrorMapaIncompleto && /clase del permiso/.test(e.message))
  assert.doesNotThrow(() => exigirPasoCompleto({ escribibles: plan.escribibles, pendientes: [] }, 'figuras'))
})

test('el guard rechaza los botones peligrosos de NSEI y el adaptador no pulsa nada', () => {
  for (const t of ['Contratar', 'Contratación', 'Aceptar', 'Aceptar Obs. y Cláusulas']) assert.throws(() => comprobarBoton([t]), EmisionBloqueadaError, t)
  let src = readFileSync(join(import.meta.dirname, '../src/adapters/mapfre/auto.ts'), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join('\n')
  // Única excepción (v0.8.27): UNA llamada, dentro de `desplegarAcordeonGuardado`, que solo recibe la cabecera `mat-expansion-panel-header`.
  const permitida = "await pulsar(raiz.locator('mat-expansion-panel-header').nth(indiceCabecera))"
  assert.equal(src.split(permitida).length - 1, 1, 'exactamente una llamada permitida a pulsar')
  assert.match(src, /async function desplegarAcordeonGuardado\([^\n]*\): Promise<void> \{\n  await pulsar\(raiz\.locator\('mat-expansion-panel-header'\)\.nth\(indiceCabecera\)\)\n\}/)
  src = src.replace(permitida, '')
  assert.ok(!/\.click\s*\(|pulsar\s*\(|\.check\s*\(|setChecked|dispatchEvent|keyboard|\.press\s*\(/.test(src), 'el adaptador de Mapfre no pulsa, marca ni teclea teclas')
  assert.ok(!/aceptar|emitir|archivar|formalizar|has-text|text=/i.test(src), 'ningún selector por texto ni verbo de acción peligrosa en el código')
})

// ───────────── mat-select: mapeo explícito + capa común (pieza 4, 14/10/2026) ─────────────
import { ESPERA_OPCIONAL_MS, MAPEO_MAPFRE_AUTO, rellenarMatSelects, sinOpcionalesAusentes, textosMapfreDe } from '../src/adapters/mapfre/auto.ts'

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
  assert.deepEqual(con.pendientes.map((o) => o.etiqueta), [], 'v0.8.0: el interruptor no se pulsa; se comprueba en pantalla (`historialAnterior`)')
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
  // v0.8.1: uso y ámbito son OPCIONALES: si el flujo no los pinta, se sigue sin tocar nada (trabajo real 39c8016e).
  assert.deepEqual(await rellenarMatSelects(page, plan, { elegirMatSelect: async () => { throw new Error('no debe abrirse') } }), [])
  assert.deepEqual(await rellenarMatSelects(page, { escribibles: [], pendientes: [] }, {}), [])
})

test('v0.8.1: un mat-select OBLIGATORIO que no aparece → atasco + hueco; uso/ámbito opcionales ausentes no paran el paso', async () => {
  const completo = planObjetoYFiguras({ ...form, usoVehiculo: 'particular', ambitoCirculacion: 'espana', clasePermiso: 'b' } as FormularioAuto)
  const clase = { escribibles: planDelPaso(completo, 'figuras').escribibles.filter((o) => o.sel === SEL_LICENCIA.clasePermiso), pendientes: [] }
  await page.setContent('<body><button>Continuar</button></body>')
  const registros: string[] = []
  const formador = { trabajoId: 't', compania: 'mapfre', ramo: 'auto', apiUrl: 'http://127.0.0.1:9', secreto: 'x', activo: true, acompanado: false, conocimiento: [], resueltos: new Map(), redactar: (t: string) => t, log: (m: string) => { registros.push(m) }, atasco: null as unknown }
  await assert.rejects(() => rellenarMatSelects(page, clase, { elegirMatSelect: async () => ({ texto: 'B', origen: 'coincidencia' as const }) }, { page, formador: formador as never }), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /clase del permiso/.test(e.message))
  assert.ok(registros.includes('atasco_preparado') || registros.includes('atasco_sin_candidatos'), 'pasa por el checkpoint de atasco de la capa común')
  // Pendientes: el uso/ámbito sin valor y AUSENTE no impide «Continuar»; PRESENTE sigue pendiente (para con inventario).
  const sinValor = planDelPaso(planObjetoYFiguras(form), 'objetoAsegurado')
  assert.ok(sinValor.pendientes.every((o) => o.opcional === true))
  assert.deepEqual((await sinOpcionalesAusentes(page, sinValor)).pendientes, [])
  await page.setContent('<body><app-datos-vehiculo><mat-select formcontrolname="uso">x</mat-select></app-datos-vehiculo></body>')
  const conUso = await sinOpcionalesAusentes(page, sinValor)
  assert.deepEqual(conUso.pendientes.map((o) => o.etiqueta), ['uso del vehículo'])
  assert.throws(() => exigirPasoCompleto(conUso, 'objetoAsegurado'), (e) => e instanceof ErrorMapaIncompleto && /uso del vehículo/.test(e.message))
  // La clase del permiso NO es opcional: sin valor sigue pendiente aunque no se vea.
  assert.ok(planObjetoYFiguras(form).pendientes.some((o) => o.etiqueta === 'clase del permiso' && !o.opcional))
})

// ───────────── Revisión PR #4710 (14/10/2026): datos de la ficha, «nuevo» solo con aviso, nada se sobrescribe, atascos ─────────────
import { compararFechaEs, planAltaTomador } from '../src/adapters/mapfre/auto.ts'
import { fechaEs } from '../src/adapters/allianz/intranet/index.ts'
import type { ContextoFormador } from '../src/formador.ts'

/** Formador ACTIVO de prueba: sin IA (el fetch falla) → lo que no se resuelve deja checkpoint de atasco en `atasco`. */
const formadorPrueba = (): ContextoFormador => ({
  trabajoId: 't', compania: 'mapfre', ramo: 'auto', apiUrl: 'http://127.0.0.1:9', secreto: 'x', activo: true, acompanado: false,
  conocimiento: [], resueltos: new Map(), redactar: (t) => t, log: () => {}, fetchImpl: (async () => new Response(null, { status: 503 })) as typeof fetch,
})
const ctxConFormador = (r: string[] = []) => {
  const formador = formadorPrueba()
  return { ctx: { ...ctxFalso(r), formador } as unknown as Parameters<typeof pasoDatosBasicos>[2], formador }
}
/** Lo que pone asegura al entregar (placeholders): sin bloque `tomador`, con `datosTomador`. */
const conDatosFicha = { ...conNif, datosTomador: { tipo: 'fisica', nombre: 'NOMBRE FICHA', apellido1: 'APELLIDO1 FICHA', apellido2: null, fechaNacimiento: '1985-03-07' } } as FormularioAuto

test('planAltaTomador: con `datosTomador` (lo que inyecta asegura) ya NO da `datos`; empresa → razón social; sin nada → datos', () => {
  const p = planAltaTomador(conDatosFicha)
  assert.deepEqual(p.escribibles.map((o) => o.etiqueta), ['Nombre', 'Primer Apellido', 'Fecha de Nacimiento'])
  assert.equal(p.escribibles.at(-1)!.valor, '07/03/1985')
  const emp = planAltaTomador({ ...conNif, datosTomador: { tipo: 'juridica', razonSocial: 'EMPRESA PRUEBA SL' } } as FormularioAuto)
  assert.deepEqual(emp.escribibles.map((o) => o.sel), [SEL_TOMADOR.razonSocial])
  assert.throws(() => planAltaTomador(conNif), (e) => e instanceof ErrorTarificador && e.tipo === 'datos')
})

test('paso 1: tomador nuevo con los datos que inyecta asegura (`datosTomador`) → alta y «Continuar»', async () => {
  await page.setContent(TOMADOR_HTML({ alAbandonar: SIN_REGISTRO }))
  const r: string[] = []
  await pasoDatosBasicos(page, conDatosFicha, ctxFalso(r), 3_000)
  assert.equal(await valor('nombre'), 'NOMBRE FICHA')
  assert.equal(await valor('fechaNacimiento'), '07/03/1985')
  assert.deepEqual(r, ['continuar:datosBasicos'])
})

test('paso 1: autorrelleno que llega TARDE (tras decidir «nuevo») → no se sobrescribe y acaba en hueco con atasco, sin «Continuar»', async () => {
  // Al teclear el nombre, Mapfre rellena el primer apellido (después de la espera y del aviso).
  await page.setContent(TOMADOR_HTML({ alAbandonar: SIN_REGISTRO, alTeclearNombre: "document.querySelector('[name=primerApellido]').value='APELLIDO TARDE'" }))
  const r: string[] = []
  const { ctx, formador } = ctxConFormador(r)
  await assert.rejects(() => pasoDatosBasicos(page, conTomador, ctx, 3_000), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /no se sobrescribe/.test(e.message) && !e.message.includes('FICHA'))
  assert.equal(await valor('primerApellido'), 'APELLIDO TARDE', 'lo que puso Mapfre no se toca')
  assert.equal(await valor('fechaNacimiento'), '', 'se para ahí: nada más tecleado')
  assert.ok(formador.atasco && formador.atasco.candidatos.length > 0, 'deja checkpoint de atasco (aviso por Telegram)')
  assert.deepEqual(r, [])
})

test('paso 1: la máscara del portal invierte día y mes al salir de la fecha → hueco (sin la fecha en el mensaje), sin «Continuar»', async () => {
  const invertir = "const m=this.value.split('/');this.value=m[1]+'/'+m[0]+'/'+m[2]"
  await page.setContent(TOMADOR_HTML({ alAbandonar: SIN_REGISTRO, alSalirFecha: invertir }))
  const r: string[] = []
  const { ctx, formador } = ctxConFormador(r)
  await assert.rejects(() => pasoDatosBasicos(page, conTomador, ctx, 3_000), (e) => e instanceof ErrorMapaIncompleto && /día y el mes/.test(e.message) && !/1985/.test(e.message))
  assert.ok(formador.atasco)
  assert.deepEqual(r, [])
  assert.equal(compararFechaEs('07/03/1985', '07/03/1985'), 'ok')
  assert.equal(compararFechaEs('7/3/1985', '07/03/1985'), 'ok')
  assert.equal(compararFechaEs('03/07/1985', '07/03/1985'), 'invertida')
  assert.equal(compararFechaEs('03/03/1985', '03/03/1985'), 'ok')
  assert.equal(compararFechaEs('1985-03-07', '07/03/1985'), 'distinta')
  assert.equal(compararFechaEs('', '07/03/1985'), 'distinta')
})

test('paso 1: indeterminado, diálogo y «Campo obligatorio» pendiente dejan checkpoint de ATASCO (Telegram) además del hueco', async () => {
  for (const [html, espera, re] of [
    [TOMADOR_HTML(), 600, /reacción de Mapfre/],
    [TOMADOR_HTML({ alAbandonar: "document.body.insertAdjacentHTML('beforeend','<mat-dialog-container><button>PERSONA 1</button></mat-dialog-container>')" }), 3_000, /diálogo/],
    [TOMADOR_HTML({ alAbandonar: SIN_REGISTRO }).replace('<mat-error id="err"></mat-error>', '<mat-error id="err">Campo obligatorio</mat-error>'), 3_000, /Campo obligatorio/],
  ] as const) {
    await page.setContent(html)
    const { ctx, formador } = ctxConFormador()
    await assert.rejects(() => pasoDatosBasicos(page, conTomador, ctx, espera), (e) => e instanceof ErrorMapaIncompleto && re.test(e.message))
    assert.ok(formador.atasco && formador.atasco.candidatos.length > 0, String(re))
    assert.ok(!JSON.stringify(formador.atasco).includes(NIF), 'el atasco no lleva el NIF')
  }
})

test('paso 1: tomador que EXISTE pero con un «Campo obligatorio» pendiente → hueco, sin «Continuar»', async () => {
  await page.setContent(TOMADOR_HTML({ alAbandonar: AUTORRELLENO }).replace('<mat-error id="err"></mat-error>', '<mat-error id="err">Campo obligatorio</mat-error>'))
  const r: string[] = []
  await assert.rejects(() => pasoDatosBasicos(page, conTomador, ctxFalso(r), 3_000), (e) => e instanceof ErrorMapaIncompleto && /autorrellenado/.test(e.message))
  assert.equal(await valor('nombre'), 'NOMBRE AUTO')
  assert.deepEqual(r, [])
})

test('paso 1: EMPRESA autorrellenada (razón social) → «existe», no se pisa ni se teclea nada', async () => {
  await page.setContent(TOMADOR_HTML({ razon: true, alAbandonar: "setTimeout(()=>{document.querySelector('[name=razonSocial]').value='EMPRESA AUTO'},80)" }))
  const r: string[] = []
  await pasoDatosBasicos(page, conTomador, ctxFalso(r), 3_000)
  assert.equal(await page.locator(SEL_TOMADOR.razonSocial).inputValue(), 'EMPRESA AUTO')
  assert.equal(await valor('nombre'), '', 'no se dio de alta encima')
  assert.deepEqual(r, ['continuar:datosBasicos'])
})

test('fechaEs: el error no lleva la fecha cruda ni el prefijo de Allianz fuera de Allianz', () => {
  assert.equal(fechaEs('1985-03-07'), '07/03/1985')
  assert.throws(() => fechaEs('07-03-1985', 'mapfre/auto: la fecha de nacimiento del tomador'), (e: Error) => /^mapfre\/auto: la fecha de nacimiento del tomador/.test(e.message) && !e.message.includes('1985') && !/allianz/.test(e.message))
  assert.throws(() => fechaEs('1985/03/07'), (e: Error) => !e.message.includes('1985'))
})

// ───────────── v0.8.7 (18/10/2026): MOTO por el plan del coche; clase de permiso de moto ─────────────
import { clasePermisoNsei, SUPUESTO_CLASE_PERMISO_MOTO } from '../src/adapters/mapfre/auto.ts'

test('v0.8.7 moto: el plan sale (ya no es hueco de mapa); sin clase de permiso → «A» DECLARADA; con A2 del riesgo, A2 sin supuesto', () => {
  const moto = { ...form, ramo: 'moto', clasePermiso: null } as unknown as FormularioAuto
  assert.deepEqual(clasePermisoNsei(moto), { clase: 'a', supuesto: SUPUESTO_CLASE_PERMISO_MOTO })
  const plan = planObjetoYFiguras(moto)
  assert.equal(plan.escribibles.find((o) => o.sel === SEL_LICENCIA.clasePermiso)?.valor, 'A')
  assert.ok(!plan.pendientes.some((o) => o.etiqueta === 'clase del permiso'))
  assert.deepEqual(clasePermisoNsei({ ramo: 'moto', clasePermiso: 'a2' }), { clase: 'a2', supuesto: null })
  assert.throws(() => clasePermisoNsei({ ramo: 'moto', clasePermiso: 'b' }), (e) => e instanceof ErrorTarificador && e.tipo === 'datos')
  assert.deepEqual(clasePermisoNsei({ ramo: 'auto', clasePermiso: null }), { clase: null, supuesto: null }, 'coche: sin supuesto (pendiente, como siempre)')
})

// ───────────────────────── v0.8.8 · nunca «la primera» ─────────────────────────
import { filaVehiculoPorEquivalencia, indiceFilaVehiculoMapfre as indiceFilaMapfre88, opcionesFilasVehiculo } from '../src/adapters/mapfre/auto.ts'

test('v0.8.8 · opcionesFilasVehiculo: una opción por fila con denominación · CV · cc · fecha; la etiqueta elegida vuelve y casa EXACTA con una sola fila', () => {
  const filas = [
    { denominacion: 'MARCA X 1.6 TDI', cvKw: '90', cc: '1598', puertas: '5', fechaInicio: '01/2018' },
    { denominacion: 'MARCA X 1.6 TDI', cvKw: '115', cc: '1598', puertas: '5', fechaInicio: '01/2019' },
    { denominacion: 'MARCA X 2.0 TDI', cvKw: '150', cc: '1968', puertas: '5', fechaInicio: '01/2019' },
  ]
  const ops = opcionesFilasVehiculo(filas)
  assert.deepEqual(ops.map((o) => o.etiqueta), ['MARCA X 1.6 TDI · 90 CV · 1598 cc · 01/2018', 'MARCA X 1.6 TDI · 115 CV · 1598 cc · 01/2019', 'MARCA X 2.0 TDI · 150 CV · 1968 cc · 01/2019'])
  assert.equal(indiceFilaMapfre88(filas, null), null, 'sin dato: no se elige (nunca la primera)')
  assert.equal(indiceFilaMapfre88(filas, { seleccionVehiculo: { marca: 'MARCA', modelo: 'X' } }), null, 'marca+modelo casan con las 3: ambiguo')
  assert.equal(indiceFilaMapfre88(filas, { eleccionVersion: { codigo: null, etiqueta: ops[1]!.etiqueta } }), 1, 'la etiqueta de la bandeja distingue la fila')
  assert.equal(indiceFilaMapfre88(filas, { seleccionVehiculo: { marca: 'MARCA', modelo: 'X', cilindradaCc: 1968 } }), 2, 'una única candidata por cilindrada: inequívoca')
  assert.equal(mapfreAuto.version, '0.8.39')
})
