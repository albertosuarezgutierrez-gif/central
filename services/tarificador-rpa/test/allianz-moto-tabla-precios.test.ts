// Allianz MOTO v0.7.20 (21/10/2026, captura de Alberto de «PRECIOS MODALIDADES»): prima comparable = «Anual sucesivos» del recibo
// bancario; ⚠ Normas de Contratación, texto rojo de TIREA y CUESTIONARIO (Cliente Alto Potencial / CAP) SOLO se leen. DOM sintético
// con la FORMA de la captura; ids, importes y datos personales INVENTADOS (para comprobar que no salen).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { CONFIRMS_AVANCE_ACEPTABLES } from '../src/guard.ts'
import {
  AVISO_PRIMA_SUCESIVOS,
  avisoCuestionarioPedido,
  avisosCuestionarioMoto,
  avisosTextoPortalTarificar,
  eurEs,
  extrasTarificarMotoSeguros,
  leerExtrasTarificarMoto,
  leerPrimasTarificar,
  ofertasMotoDesdePrimas,
  type ControlCandidato,
  type PrimaModalidad,
} from '../src/adapters/allianz/auto.ts'
import type { FormularioAuto } from '@central/module-tarificacion'

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

const SUP_PERIODO = CONFIRMS_AVANCE_ACEPTABLES['td#datosBasicos']!.supuesto
const form = { ramo: 'moto', matricula: '0000XXX', codigoPostal: '41003', conductor: { fechaNacimiento: '1980-01-01', fechaCarne: '2000-01-01' } } as unknown as FormularioAuto
const sup = (delPortal: string[] = [SUP_PERIODO]) => ({ supuestoVersion: null, form, delPortal, supuestoPeriodo: SUP_PERIODO })
const prima = (modalidad: string, nombre: string, primerReciboEur: number, sucesivosEur: number | null): PrimaModalidad => ({ modalidad, nombre, primerReciboEur, sucesivosEur })

test('eurEs: formato español con puntos de miles también en 4 cifras', () => {
  assert.equal(eurEs(182.23), '182,23€')
  assert.equal(eurEs(2162.49), '2.162,49€')
  assert.equal(eurEs(1234567), '1.234.567,00€')
})

test('con «Anual sucesivos»: ESA es la prima anual, el 1er recibo va en avisos y se QUITA el supuesto de periodo no comparable', () => {
  const [o] = ofertasMotoDesdePrimas([prima('0', 'G. Básicas', 182.23, 275.82)], null, sup())
  assert.equal(o.primaAnualEur, 275.82)
  assert.equal(o.importeReciboEur, 275.82)
  assert.equal(o.avisos[0], AVISO_PRIMA_SUCESIVOS)
  assert.ok(o.avisos.includes('1er recibo: 182,23€ (primer periodo distinto de un año)'), o.avisos.join('\n'))
  assert.ok(!o.avisos.some((a) => a.includes('no es directamente comparable')), 'el supuesto de periodo ya no aplica')
  assert.ok(!o.avisos.some((a) => a.startsWith('Importe del primer recibo anual')))
})

test('sin «sucesivos»: como antes (1er recibo como prima + supuesto de periodo); los demás supuestos se conservan en ambos casos', () => {
  const otros = [SUP_PERIODO, 'fecha de adquisición: la del portal']
  const [sinSuc, conSuc] = ofertasMotoDesdePrimas([prima('0', 'G. Básicas', 182.23, null), prima('4', 'Todo Riesgo', 900, 950)], null, sup(otros))
  assert.equal(sinSuc.primaAnualEur, 182.23)
  assert.ok(sinSuc.avisos.some((a) => a.includes('no es directamente comparable')))
  assert.ok(!sinSuc.avisos.some((a) => a.startsWith('1er recibo')))
  assert.ok(sinSuc.avisos.some((a) => a.includes('fecha de adquisición')))
  assert.ok(conSuc.avisos.some((a) => a.includes('fecha de adquisición')))
  assert.ok(!conSuc.avisos.some((a) => a.includes('no es directamente comparable')))
})

test('1er recibo IGUAL a sucesivos → sin aviso de 1er recibo; ⚠ solo en la modalidad marcada', () => {
  const ofs = ofertasMotoDesdePrimas([prima('0', 'G. Básicas', 275.82, 275.82), prima('3', 'T.R. Franquicia 300', 600, 610)], null, sup([]), ['3'])
  assert.ok(!ofs[0].avisos.some((a) => a.startsWith('1er recibo')))
  assert.ok(!ofs[0].avisos.some((a) => a.includes('Normas de Contratación')))
  assert.ok(ofs[1].avisos.includes('Modalidad «T.R. Franquicia 300»: opción sujeta a Normas de Contratación de la Compañía (⚠ en la tabla).'))
})

test('texto rojo de TIREA → aviso saneado (sin NIF ni correo), sin duplicados', () => {
  const a = avisosTextoPortalTarificar(['-Tomador no disponible en TIREA. Para aplicar bonificación indexar condiciones particulares y recibo', '-Tomador no disponible en TIREA. Para aplicar bonificación indexar condiciones particulares y recibo', 'TIREA 12345678Z ficticio@example.com'])
  assert.equal(a.length, 2)
  assert.equal(a[0], 'Allianz (texto del portal bajo la tabla de precios): Tomador no disponible en TIREA. Para aplicar bonificación indexar condiciones particulares y recibo')
  assert.ok(!a[1].includes('12345678Z') && !a[1].includes('ficticio@example.com'), a[1])
})

const base: ControlCandidato = {
  tag: 'SELECT', tipo: null, id: null, name: null, etiquetas: [], valor: null,
  opciones: [], min: null, max: null, maxLength: null, step: null, deshabilitado: false, soloLectura: false, botonesCerca: [],
}

test('cuestionario: cada campo se queda con el control de etiqueta MÁS específica (una fila con los dos no los confunde); no encontrado se dice', () => {
  const fila = 'Cliente Alto Potencial CAP'
  const cliente = { ...base, id: 'altoPot', etiquetas: ['Cliente Alto Potencial', fila], valor: 'N', opciones: [{ valor: 'S', texto: 'Sí' }, { valor: 'N', texto: 'No' }] }
  const cap = { ...base, id: 'cap', etiquetas: ['CAP', fila], valor: '', deshabilitado: true }
  const capital = { ...base, tag: 'INPUT', tipo: 'text', id: 'capital', etiquetas: ['Capital asegurado'], valor: '1000' }
  const [aCliente, aCap] = avisosCuestionarioMoto([cap, capital, cliente])
  assert.match(aCliente, /^Allianz «Cliente Alto Potencial» .*NO se cambia.*id=altoPot .*opciones \[S«Sí», N«No»\] · valor actual N/)
  assert.match(aCap, /^Allianz «CAP» .*id=cap .*valor actual vacío · deshabilitado/)
  const [noCliente, noCap] = avisosCuestionarioMoto([capital])
  assert.match(noCliente, /no se encontró/)
  assert.match(noCap, /no se encontró/, '«Capital» no es «CAP»')
})

test('lo PEDIDO en el formulario (capAllianz / clienteAltoPotencialAllianz) NO se aplica: se dice; sin pedido, nada', () => {
  assert.equal(avisoCuestionarioPedido({}), null)
  const a = avisoCuestionarioPedido({ capAllianz: '10', clienteAltoPotencialAllianz: 'si' })
  assert.match(a ?? '', /^Pedido Cliente Alto Potencial=si, CAP=10: NO aplicado/)
})

const TABLA = (normasEn: string) => {
  const col = (m: string, nombre: string, p0: string, p1: string) =>
    `<td><table><tr><td><input id="modality_${m}" name="numModality" type="hidden"></td></tr><tr><td><label>${nombre}</label></td></tr></table></td>` +
    `<td><table><tr><td id="${m}_F_A_0_0">${p0}</td></tr><tr><td id="${m}_F_A_1_0">${p1}</td></tr>` +
    `<tr><td id="${m}_B_A_0_0">${p0}${m === normasEn ? '<img src="x.gif" title="Opción sujeta a Normas de Contratación de la Compañía">' : ''}</td></tr><tr><td id="${m}_B_A_1_0">${p1}</td></tr></table></td>`
  return `<body><script>window.pulsado = 0</script>
    <table><tr>${col('0', 'G. Básicas', '182,23', '275,82')}${col('3', 'T.R. Franquicia 300', '501,10', '760,40')}</tr></table>
    <p style="color:red">-Tomador no disponible en TIREA. Para aplicar bonificación indexar condiciones particulares y recibo</p>
    <table id="cuestionario"><tr><th colspan="4">CUESTIONARIO</th></tr>
      <tr><td>Sucursal</td><td><input id="sucursal" value="0001"></td><td>Agente</td><td><input id="agente" value="Pepe Ficticio"></td></tr>
      <tr><td>Colaborador</td><td><input id="colab" value="Ana Inventada"></td><td>Localidad</td><td><input id="loc" value="SEVILLA"></td></tr>
      <tr><td>Cliente Alto Potencial</td><td><select id="cliAltoPot"><option value="S">Sí</option><option value="N" selected>No</option></select></td>
          <td>CAP</td><td><select id="capSel" disabled><option value="">--</option><option value="05">5%</option></select></td></tr>
      <tr><td colspan="4"><input type="button" value="Aceptar" onclick="window.pulsado++"></td></tr>
    </table></body>`
}

test('DOM con la forma de la captura: primas sucesivos, ⚠ en su columna, TIREA y cuestionario; NO se pulsa nada ni sale ningún dato personal', async () => {
  await page.setContent(TABLA('3'))
  const primas = await leerPrimasTarificar(page.mainFrame())
  assert.deepEqual(primas.map((p) => [p.modalidad, p.primerReciboEur, p.sucesivosEur]), [['0', 182.23, 275.82], ['3', 501.1, 760.4]])
  const extras = await leerExtrasTarificarMoto(page.mainFrame(), primas.map((p) => p.modalidad))
  assert.deepEqual(extras.normas, ['3'])
  const { avisos } = await extrasTarificarMotoSeguros(page.mainFrame(), ['0', '3'])
  const todo = avisos.join('\n')
  assert.match(todo, /Tomador no disponible en TIREA/)
  assert.match(todo, /Allianz «Cliente Alto Potencial».*id=cliAltoPot .*opciones \[S«Sí», N«No»\] · valor actual N/)
  assert.match(todo, /Allianz «CAP».*id=capSel .*opciones \[vacío«--», 05«5%»\] · valor actual vacío · deshabilitado · botones cerca: «Aceptar»/)
  for (const personal of ['Pepe', 'Ana Inventada']) assert.ok(!todo.includes(personal), personal)
  const ofertas = ofertasMotoDesdePrimas(primas, null, sup(), extras.normas)
  assert.deepEqual(ofertas.map((o) => o.primaAnualEur), [275.82, 760.4])
  assert.equal(await page.evaluate(() => (window as unknown as { pulsado: number }).pulsado), 0, 'no se pulsa «Aceptar» ni nada')
})

test('si la lectura falla: «no se pudo leer» (sin comprobar), nunca «no se encontró»; los precios siguen', async () => {
  const raiz = { locator: () => ({ first: () => ({ evaluate: async () => { throw new Error('marco desconectado') } }) }) } as never
  const { extras, avisos } = await extrasTarificarMotoSeguros(raiz, ['0'])
  assert.equal(extras, null)
  assert.equal(avisos.length, 1)
  assert.match(avisos[0], /no se pudo leer/)
  assert.ok(!/no se encontró/.test(avisos[0]))
})

test('el flujo de Moto usa la prima de sucesivos y los avisos de la tabla, leídos en el MISMO marco de Tarificar tras las primas', () => {
  const src = readFileSync(join(import.meta.dirname, '../src/adapters/allianz/auto.ts'), 'utf8')
  const flujo = src.slice(src.indexOf('async function tarificarMoto('), src.indexOf('// ───────────────────────── flujo (con huecos)'))
  const iPrimas = flujo.indexOf('leerPrimasTarificar(tarifa)')
  const iExtras = flujo.indexOf('extrasTarificarMotoSeguros(tarifa,')
  assert.ok(iPrimas > 0 && iExtras > iPrimas)
  assert.match(flujo, /ofertasMotoDesdePrimas\(/)
  assert.ok(!/ofertasDesdePrimas\(/.test(flujo), 'Moto ya no usa el 1er recibo como prima')
  assert.match(flujo, /\.\.\.avisosTabla/)
  assert.match(flujo, /avisoCuestionarioPedido\(form\)/)
})
