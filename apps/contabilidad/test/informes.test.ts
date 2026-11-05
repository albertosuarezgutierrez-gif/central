// Informes estándar: catálogo declarativo, generación sobre una fuente inyectada, CSV (Excel español), HTML imprimible y Excel.
// Cepos vistos fallar el 05/11/2026: (1) en `centimosACsv` usar `c / 100` (float) → rojo en «2162,49»; (2) quitar `neutralizarFormula`
// → rojo en «inyección de fórmulas»; (3) quitar `escaparHtml` de `celdaHtml` → rojo en «HTML escapado». Restaurados → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asientoDesdeHecho, sumasDeAsientos, type Asiento, type HechoContable, type PartidaDoc } from '@central/module-contabilidad'
import { INFORMES, informePorClave } from '../lib/informes/catalogo.ts'
import { generarInforme, parametrosDe, type FuenteInforme } from '../lib/informes/generar.ts'
import { aCsv, aHtmlImprimible, centimosACsv, neutralizarFormula } from '../lib/informes/exportar.ts'
import { aXlsx, type ModuloXlsx } from '../lib/informes/exportar-xlsx.ts'

const H = (h: HechoContable, numero: number): Asiento => ({ ...asientoDesdeHecho(h), numero })
const asientos: Asiento[] = [
  H({ tipo: 'venta', fecha: '2026-01-10', ref: 'F-1', desglose: [{ base: 100000, tipoIva: 21 }] }, 1),
  H({ tipo: 'cobro', fecha: '2026-01-20', ref: 'K-1', documento: 'F-1', importe: 50000 }, 2),
  H({ tipo: 'compra', fecha: '2026-02-05', ref: 'C-1', desglose: [{ base: 30000, tipoIva: 21 }] }, 3),
  H({ tipo: 'venta', fecha: '2026-03-15', ref: 'F-2', desglose: [{ base: 216249, tipoIva: 21 }] }, 4),
]

function fuente(as: Asiento[], truncarEn = Infinity): FuenteInforme {
  const enPeriodo = (a: Asiento, o: { desde?: string; hasta: string }) => (!o.desde || a.fecha >= o.desde) && a.fecha <= o.hasta
  return {
    async asientos(o) { const xs = as.filter((a) => enPeriodo(a, o)); return { asientos: xs.slice(0, truncarEn), truncado: xs.length > truncarEn } },
    async sumas(o) { return sumasDeAsientos(as, o) },
    async partidas(prefijos, hasta): Promise<PartidaDoc[]> {
      const m = new Map<string, PartidaDoc>()
      for (const a of as) for (const p of a.apuntes) {
        if (a.fecha > hasta || !prefijos.some((x) => p.cuenta.startsWith(x))) continue
        const k = `${p.cuenta}|${p.documento ?? ''}`
        const x = m.get(k) ?? { cuenta: p.cuenta, documento: p.documento ?? null, desde: a.fecha, debe: 0, haber: 0 }
        x.debe += p.debe; x.haber += p.haber; if (a.fecha < x.desde) x.desde = a.fecha
        m.set(k, x)
      }
      return [...m.values()]
    },
  }
}
const P = { desde: '2026-01-01', hasta: '2026-12-31', cuenta: null }

test('catálogo: claves únicas y cada informe se genera (lista blanca; clave desconocida → null)', async () => {
  assert.equal(new Set(INFORMES.map((i) => i.clave)).size, INFORMES.length)
  for (const i of INFORMES) assert.ok(await generarInforme(i.clave, { ...P, cuenta: '430' }, fuente(asientos)), i.clave)
  assert.equal(informePorClave('drop table'), undefined)
  assert.equal(await generarInforme('drop table', P, fuente(asientos)), null)
})

test('parámetros: fechas inválidas → año en curso (reloj inyectado), desde > hasta se ordena, cuenta no numérica → null', () => {
  const hoy = new Date(Date.UTC(2027, 5, 15))
  assert.deepEqual(parametrosDe({}, hoy), { desde: '2027-01-01', hasta: '2027-06-15', cuenta: null })
  assert.deepEqual(parametrosDe({ desde: '2026-13-40', hasta: 'x', cuenta: "430'; --" }, hoy), { desde: '2027-01-01', hasta: '2027-06-15', cuenta: null })
  assert.deepEqual(parametrosDe({ desde: '2026-05-01', hasta: '2026-02-01', cuenta: ['572'] }, hoy), { desde: '2026-02-01', hasta: '2026-05-01', cuenta: '572' })
})

test('diario: apuntes por asiento con totales Debe = Haber; truncado se avisa; vacío dice «sin datos»', async () => {
  const t = (await generarInforme('diario', P, fuente(asientos)))!
  assert.equal(t.filas[0].numero, 1)
  assert.equal(t.totales!.debe, t.totales!.haber)
  const corto = (await generarInforme('diario', P, fuente(asientos, 2)))!
  assert.match(corto.avisos.join(), /primeros/)
  const vacio = (await generarInforme('diario', P, fuente([])))!
  assert.match(vacio.avisos.join(), /Sin datos/)
  assert.equal(vacio.totales, null)
})

test('mayor: saldo inicial arrastrado, saldo acumulado y totales; sin cuenta pide una', async () => {
  const t = (await generarInforme('mayor', { desde: '2026-02-01', hasta: '2026-12-31', cuenta: '430' }, fuente(asientos)))!
  assert.equal(t.filas[0].concepto, 'Saldo inicial')
  assert.equal(t.filas[0].saldo, 121000 - 50000)
  assert.equal(t.filas.at(-1)!.saldo, 121000 - 50000 + 261661)
  assert.match((await generarInforme('mayor', P, fuente(asientos)))!.avisos.join(), /Indica una cuenta/)
})

test('sumas y saldos cuadran; balance cuadra (Activo = PN + Pasivo); PyG da el resultado', async () => {
  const s = (await generarInforme('sumas_saldos', P, fuente(asientos)))!
  assert.equal(s.totales!.debe, s.totales!.haber)
  assert.equal(s.totales!.saldoDeudor, s.totales!.saldoAcreedor)
  assert.equal(s.avisos.some((a) => /no cuadran/.test(a)), false)
  const b = (await generarInforme('balance', P, fuente(asientos)))!
  const tot = (r: string) => b.filas.find((f) => f.rubrica === r)!.importe
  assert.equal(tot('TOTAL ACTIVO'), tot('TOTAL PATRIMONIO NETO Y PASIVO'))
  assert.equal(b.avisos.some((a) => /no cuadra/.test(a)), false)
  const y = (await generarInforme('pyg', P, fuente(asientos)))!
  assert.equal(y.filas.find((f) => f.rubrica === 'Resultado del ejercicio')!.importe, 100000 + 216249 - 30000)
  assert.deepEqual((await generarInforme('pyg', P, fuente([])))!.filas, [])
})

test('antigüedad de clientes: partida casada por documento (cobro parcial) y reparto por tramos a la fecha de corte', async () => {
  const t = (await generarInforme('antiguedad_clientes', { desde: '2026-01-01', hasta: '2026-04-20', cuenta: null }, fuente(asientos)))!
  const f1 = t.filas.find((f) => f.documento === 'F-1')!
  assert.equal(f1.importe, 121000 - 50000)
  assert.equal(f1.dias, 100); assert.equal(f1.tramo, '+90')
  assert.equal(t.filas.find((f) => f.documento === 'F-2')!.tramo, '31-60')
  assert.equal(t.totales!.importe, 121000 - 50000 + 261661)
  assert.match((await generarInforme('antiguedad_proveedores', P, fuente([])))!.avisos.join(), /Sin datos/)
})

test('CSV: BOM, «;», coma decimal sin floats, fechas dd/mm/aaaa, comillas y totales', async () => {
  assert.equal(centimosACsv(216249), '2162,49')
  assert.equal(centimosACsv(-5), '-0,05')
  assert.equal(centimosACsv(0), '0,00')
  const t = (await generarInforme('diario', P, fuente(asientos)))!
  const csv = aCsv(t)
  assert.ok(csv.startsWith('﻿Nº;Fecha;Concepto;Cuenta;Documento;Debe;Haber\r\n'))
  assert.match(csv, /^1;10\/01\/2026;Factura emitida F-1;430;F-1;1210,00;0,00\r$/m)
  assert.ok(aCsv({ ...t, filas: [{ ...t.filas[0], concepto: 'a;"b"\nc' }], totales: null }).includes(';"a;""b""\nc";'))
})

test('CSV: inyección de fórmulas neutralizada', () => {
  for (const x of ['=1+1', '+SUMA(A1)', '-2', '@cmd', '\tx']) assert.equal(neutralizarFormula(x), `'${x}`)
  assert.equal(neutralizarFormula('Factura'), 'Factura')
  const t = { clave: 'x', titulo: 't', subtitulo: '', columnas: [{ clave: 'c', etiqueta: 'C', tipo: 'texto' as const }], filas: [{ c: '=HYPERLINK("http://x")' }], totales: null, avisos: [] }
  assert.match(aCsv(t), /'=HYPERLINK/)
})

test('HTML imprimible: escapado, marca de la empresa y botón de imprimir, sin recursos externos', async () => {
  const t = (await generarInforme('diario', P, fuente(asientos)))!
  const malo = { ...t, filas: [{ ...t.filas[0], concepto: '<script>alert(1)</script>' }] }
  const html = aHtmlImprimible(malo, { nombre: 'Talleres "G2" <b>', color: '#1f3d99', sello: 'con Grupo ASegura' }, '2026-11-05')
  assert.doesNotMatch(html, /<script>alert/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /Talleres &quot;G2&quot; &lt;b&gt;/)
  assert.match(html, /window\.print\(\)/)
  assert.match(html, /con Grupo ASegura/)
  assert.doesNotMatch(html, /(src|href)=["']https?:/)
  assert.match(html, /1\.210,00€/)
  assert.doesNotMatch(aHtmlImprimible(t, { nombre: 'x', color: 'red;}</style><script>', sello: 's' }, '2026-11-05'), /red;\}/)
})

test('Excel: importes en euros con formato €, texto como texto, hoja con título válido (SheetJS inyectado)', async () => {
  let hojaGuardada: unknown[][] = []
  let nombre = ''
  const doble: ModuloXlsx = {
    utils: { aoa_to_sheet: (d) => { hojaGuardada = d; return {} }, book_new: () => ({}), book_append_sheet: (_l, _h, n) => { nombre = n } },
    write: () => new Uint8Array([1]),
  }
  const t = (await generarInforme('diario', P, fuente(asientos)))!
  assert.deepEqual(aXlsx(t, doble), new Uint8Array([1]))
  const fila = hojaGuardada[4] as { t: string; v: unknown; z?: string }[]
  assert.deepEqual(fila[5], { t: 'n', v: 1210, z: '#,##0.00 "€"' })
  assert.deepEqual(fila[1], { t: 's', v: '10/01/2026' })
  assert.equal(hojaGuardada[3][0], 'Nº')
  assert.ok(nombre.length > 0 && nombre.length <= 31 && !/[\\/?*[\]:]/.test(nombre))
})
