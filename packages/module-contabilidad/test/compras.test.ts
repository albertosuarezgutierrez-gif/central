// Facturas recibidas: totales, duplicado, hecho → asiento CUADRADO (con y sin retención, varios tipos de IVA) y puerto de ingesta.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  totalesFactura, hechoDeFacturaRecibida, asientoDesdeHecho, claveFacturaRecibida, normalizarNumeroFactura, validarFormaFacturaRecibida,
  cuentaGastoDeCategoria, reglasEfectivasDeSector, totalesAsiento, crearAsiento, planDeSector, ejercicioNatural, fuenteFacturasNoConectada,
  sugerenciaProveedor, type EntradaFacturaRecibida,
} from '../src/index.ts'

const base: EntradaFacturaRecibida = {
  proveedor: { nif: 'B12345674', nombre: 'Recambios Sur SL' }, numero: '2026/0045', fecha: '2026-11-03',
  lineas: [{ base: 10000, tipoIva: 21, categoria: 'mercaderias' }, { base: 5000, tipoIva: 10, categoria: 'suministros' }],
}
const reglas = reglasEfectivasDeSector('generico', {})
const apunte = (a: ReturnType<typeof asientoDesdeHecho>, cuenta: string) => a.apuntes.filter((p) => p.cuenta === cuenta)

test('totales por tipo de IVA en céntimos, sin float', () => {
  const t = totalesFactura(base.lineas)
  assert.deepEqual(t.porTipo, [{ tipoIva: 21, base: 10000, cuota: 2100 }, { tipoIva: 10, base: 5000, cuota: 500 }])
  assert.equal(t.base, 15000); assert.equal(t.cuota, 2600); assert.equal(t.total, 17600); assert.equal(t.retencion, 0); assert.equal(t.aPagar, 17600)
})

test('asiento de compra: gasto por categoría + 472 / 400, cuadrado', () => {
  const h = hechoDeFacturaRecibida(base, reglas)
  const a = asientoDesdeHecho(h, reglas)
  const t = totalesAsiento(a)
  assert.equal(t.debe, t.haber)
  assert.equal(apunte(a, '600')[0].debe, 10000)
  assert.equal(apunte(a, '628')[0].debe, 5000)
  assert.equal(apunte(a, '472')[0].debe, 2600)
  assert.equal(apunte(a, '400')[0].haber, 17600)
  assert.equal(h.fecha, '2026-11-03')
  assert.match(h.ref, /^fr:B12345674\|2026\/45$/)
})

test('compra con retención IRPF: 623 + 472 / 410 (neto) + 4751 (retención), cuadrado', () => {
  const f: EntradaFacturaRecibida = { ...base, proveedor: { nif: '12345678Z', nombre: 'Ana Gestora' }, numero: 'F-7', lineas: [{ base: 20000, tipoIva: 21, categoria: 'profesionales' }], retencionPct: 15 }
  const a = asientoDesdeHecho(hechoDeFacturaRecibida(f, reglas), reglas)
  const t = totalesAsiento(a)
  assert.equal(t.debe, t.haber)
  assert.equal(apunte(a, '623')[0].debe, 20000)
  assert.equal(apunte(a, '472')[0].debe, 4200)
  assert.equal(apunte(a, '4751')[0].haber, 3000)
  assert.equal(apunte(a, '410')[0].haber, 20000 + 4200 - 3000)
  assert.equal(apunte(a, '400').length, 0, 'con retención el tercero es un acreedor (410), no un proveedor')
})

test('varias líneas del mismo tipo: la cuota se calcula sobre la base agregada y el asiento cuadra aunque haya céntimos de redondeo', () => {
  const f: EntradaFacturaRecibida = { ...base, lineas: [{ base: 1050, tipoIva: 21 }, { base: 1050, tipoIva: 21 }, { base: 1050, tipoIva: 21 }] }
  const a = asientoDesdeHecho(hechoDeFacturaRecibida(f, reglas), reglas)
  const t = totalesAsiento(a)
  assert.equal(t.debe, t.haber)
  assert.equal(apunte(a, '472')[0].debe, 662) // 21 % de 3.150 = 661,5 → 662; línea a línea saldría 3 × 221 = 663
  assert.equal(totalesFactura(f.lineas).cuota, 662)
})

test('el asiento de compra es válido contra el plan y el ejercicio (cuentas hoja existentes)', () => {
  const h = hechoDeFacturaRecibida({ ...base, proveedor: { ...base.proveedor, tipo: 'acreedor' } }, reglas)
  const ej = ejercicioNatural(2026)
  const a = crearAsiento(asientoDesdeHecho(h, reglas), planDeSector('generico'), ej)
  assert.equal(apunte(a, '410').length, 1)
})

test('plantilla del taller: la categoría «recambio» va a 600 y «trabajos_terceros» a 607; la empresa manda sobre todo', () => {
  const rt = reglasEfectivasDeSector('taller', {})
  assert.equal(cuentaGastoDeCategoria(rt, 'trabajos_terceros'), '607')
  assert.equal(cuentaGastoDeCategoria(rt, 'seguros'), '625')
  const propia = reglasEfectivasDeSector('taller', { compra: { 'categoria:seguros': '629' } })
  assert.equal(cuentaGastoDeCategoria(propia, 'seguros'), '629')
  assert.equal(cuentaGastoDeCategoria(reglas, 'categoria_rara'), '600') // sin dato: la cuenta de gasto de la regla, no una inventada
  assert.equal(cuentaGastoDeCategoria(reglas, undefined), '600')
})

test('duplicado: misma clave con espacios, mayúsculas y ceros a la izquierda; otro proveedor u otro número no chocan', () => {
  const k = claveFacturaRecibida('b-12345674', ' 2026/0045 ')
  assert.equal(k, claveFacturaRecibida('B12345674', '2026/45'))
  assert.notEqual(k, claveFacturaRecibida('B12345675', '2026/45'))
  assert.notEqual(k, claveFacturaRecibida('B12345674', '2026/46'))
  assert.equal(normalizarNumeroFactura('a 001 / 007'), 'A1/7')
  assert.equal(normalizarNumeroFactura('000'), '0')
})

test('validación de forma: lista TODOS los problemas; fecha futura rechazada', () => {
  assert.deepEqual(validarFormaFacturaRecibida(base, '2026-11-05'), [])
  const mala = { proveedor: { nif: '', nombre: '' }, numero: '', fecha: '2026-12-31', lineas: [], retencionPct: 120 } as unknown as EntradaFacturaRecibida
  const p = validarFormaFacturaRecibida(mala, '2026-11-05')
  assert.ok(p.length >= 5, p.join(' | '))
  assert.ok(p.some((x) => /futura/.test(x)))
  assert.ok(validarFormaFacturaRecibida({ ...base, lineas: [{ base: 0, tipoIva: 21 }] }, '2026-11-05').some((x) => /sin importe|no tiene importe/.test(x)))
  assert.ok(validarFormaFacturaRecibida({ ...base, lineas: [{ base: 12.5 as number, tipoIva: 21 }] }, '2026-11-05').some((x) => /entero/.test(x)))
})

test('proveedor recordado: sugiere su categoría y retención; desconocido = null (no se inventa)', () => {
  assert.deepEqual(sugerenciaProveedor({ nif: 'X', nombre: 'Y', tipo: 'acreedor', categoria: 'profesionales', retencionPct: 15 }), { categoria: 'profesionales', tipo: 'acreedor', retencionPct: 15 })
  assert.deepEqual(sugerenciaProveedor(null), { categoria: null, tipo: 'proveedor', retencionPct: null })
})

test('ingesta automática: solo el puerto, sin ninguna fuente conectada', async () => {
  assert.deepEqual(await fuenteFacturasNoConectada.siguientes(null), { borradores: [], cursor: null })
})
