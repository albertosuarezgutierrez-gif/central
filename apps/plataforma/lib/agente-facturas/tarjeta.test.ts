import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clasificarTarjeta, clasificarCargo, tarjetaDeRaw, divisaEfectiva, planificarAvisoTarjeta, textoAvisoTarjeta, type FacturaTarjeta } from './tarjeta.ts'
import { asignarCargos, ratioTarjeta, enVentanaCargo, toleranciaFactura } from './casar-cargos.ts'
import { sumaDias } from './domiciliados.ts'

const hoy = new Date().toISOString().slice(0, 10)
const base = { proveedor: 'Acme SL', tarjetaExplicita: null, cargosTarjetaPrevios: 0, cargosOtrosPrevios: 0 }

// ── Clasificación (3 estados) ──
test('explícita tarjeta → true', () => assert.equal(clasificarTarjeta({ ...base, tarjetaExplicita: true }), true))
test('explícita otra forma → false, aunque el proveedor sea conocido', () => assert.equal(clasificarTarjeta({ ...base, proveedor: 'Fly.io', tarjetaExplicita: false }), false))
test('historial solo en tarjeta → true', () => assert.equal(clasificarTarjeta({ ...base, cargosTarjetaPrevios: 2 }), true))
test('historial solo en otras cuentas → false', () => assert.equal(clasificarTarjeta({ ...base, cargosOtrosPrevios: 1 }), false))
test('historial mixto → null', () => assert.equal(clasificarTarjeta({ ...base, cargosTarjetaPrevios: 1, cargosOtrosPrevios: 1 }), null))
test('proveedor conocido sin historial → true', () => assert.equal(clasificarTarjeta({ ...base, proveedor: 'Fly.io Inc' }), true))
test('proveedor conocido pero pagado antes por transferencia → false', () => assert.equal(clasificarTarjeta({ ...base, proveedor: 'Vercel', cargosOtrosPrevios: 1 }), false))
test('sin ninguna señal → null (nunca se asume)', () => assert.equal(clasificarTarjeta(base), null))
test('cargos en corriente con concepto de tarjeta → tarjeta → true', () => {
  const c = ['Fly.io · Pago con tarjeta', 'COMPRA EN COMERCIO EXTRANJERO-COMISIÓN 3 % INCLUÍDA // PAGO CON TARJETA // VERCEL INC.']
    .map((x) => clasificarCargo('corriente', x))
  assert.deepEqual(c, ['tarjeta', 'tarjeta'])
  const t = c.filter((x) => x === 'tarjeta').length, o = c.filter((x) => x === 'otro').length
  assert.equal(clasificarTarjeta({ ...base, proveedor: 'Fly.io', cargosTarjetaPrevios: t, cargosOtrosPrevios: o }), true)
})
test('cargos en corriente como transferencia/recibo → otro → false', () => {
  assert.equal(clasificarCargo('corriente', 'TRANSF. 2100 factura septiembre'), 'otro')
  assert.equal(clasificarCargo('corriente', 'RECIBO DIGI SPAIN TELECO FACTURA DIGI'), 'otro')
  assert.equal(clasificarTarjeta({ ...base, proveedor: 'Vercel', cargosOtrosPrevios: 1 }), false)
})
test('cargo en corriente sin patrón (concepto «VERCEL INC.») es ambiguo: no cuenta; proveedor conocido → true', () => {
  assert.equal(clasificarCargo('corriente', 'VERCEL INC.'), null)
  assert.equal(clasificarCargo('tarjeta', 'COMPRA EN WWW.AMAZON'), 'tarjeta')
  assert.equal(clasificarCargo('corriente', null), null)
  assert.equal(clasificarTarjeta({ ...base, proveedor: 'Vercel' }), true)
  assert.equal(clasificarTarjeta({ ...base, proveedor: 'Acme SL' }), null)
})
test('raw: tarjeta / transferencia / ausente / basura', () => {
  assert.equal(tarjetaDeRaw({ forma_pago: 'Visa **** 1234' }), true)
  assert.equal(tarjetaDeRaw({ metodo_pago: 'Transferencia SEPA' }), false)
  assert.equal(tarjetaDeRaw({}), null)
  assert.equal(tarjetaDeRaw({ forma_pago: 'xyz' }), null)
  assert.equal(tarjetaDeRaw(null), null)
})
test('divisa efectiva: guardada manda; Fly sin divisa = USD; desconocido = null', () => {
  assert.equal(divisaEfectiva('Acme', 'eur'), 'EUR')
  assert.equal(divisaEfectiva('Fly.io', null), 'USD')
  assert.equal(divisaEfectiva('Acme', null), null)
})

// ── Casación con divisa ──
const par = (importe: number, divisa: string | null, cargo: number, dias: number, cambio?: number) => {
  if (!enVentanaCargo(dias)) return 0
  const r = ratioTarjeta(importe, divisa, cargo, cambio)
  return r ? asignarCargos([{ factura_id: 'f', movimiento_id: 'm', dist: Math.abs(dias), ratio: r.ratio, tolerancia: r.tolerancia }]).length : 0
}
test('USD con cambio guardado: dentro de ±3 % casa', () => assert.equal(par(100, 'USD', 92 * 1.02, 2, 0.92), 1))
test('USD con cambio guardado: fuera de ±3 % no casa', () => assert.equal(par(100, 'USD', 92 * 1.05, 2, 0.92), 0))
test('USD sin cambio (aprox.): 6,68 USD → 5,95 € casa', () => assert.equal(par(6.68, 'USD', 5.95, 2), 1))
test('USD sin cambio: cargo absurdo no casa', () => assert.equal(par(6.68, 'USD', 9.5, 2), 0))
test('divisa sin cambio conocido (ej. JPY) → no casa, no se inventa', () => assert.equal(par(1000, 'JPY', 6, 2), 0))
test('ventana: −3 y +10 dentro; −4 y +11 fuera', () => {
  assert.equal(par(10, 'EUR', 10, -3), 1)
  assert.equal(par(10, 'EUR', 10, 10), 1)
  assert.equal(par(10, 'EUR', 10, -4), 0)
  assert.equal(par(10, 'EUR', 10, 11), 0)
})
test('EUR sin cambios: ±3 % como antes', () => {
  assert.equal(par(100, 'EUR', 102.9, 0), 1)
  assert.equal(par(100, 'EUR', 103.5, 0), 0)
  assert.equal(toleranciaFactura('Acme', 'EUR'), 0.03)
})
test('un cargo solo paga una factura de tarjeta', () => {
  const r = ratioTarjeta(10, 'EUR', 10)!
  assert.equal(asignarCargos([{ factura_id: 'a', movimiento_id: 'm', dist: 1, ...r }, { factura_id: 'b', movimiento_id: 'm', dist: 2, ...r }]).length, 1)
})

// ── Aviso a los 10 días ──
const fac = (dias: number): FacturaTarjeta => ({ id: 'x' + dias, proveedor: 'Fly <io>', importe: 6.68, divisa: 'USD', fecha_factura: sumaDias(hoy, -dias) })
test('aviso: a los 10 días entra; a los 9 no', () => {
  const p = planificarAvisoTarjeta([fac(10), fac(9)], hoy)
  assert.deepEqual(p.sinCargo.map((f) => f.id), ['x10'])
  assert.deepEqual(p.enPlazo.map((f) => f.id), ['x9'])
})
test('aviso: sin vencidas no hay texto', () => assert.equal(textoAvisoTarjeta(planificarAvisoTarjeta([fac(3)], hoy)), ''))
test('aviso: no afirma impago y escapa el proveedor', () => {
  const t = textoAvisoTarjeta(planificarAvisoTarjeta([fac(12)], hoy), (s) => s.replace('<', '&lt;'))
  assert.match(t, /falte subir el extracto/)
  assert.match(t, /no es un impago confirmado/)
  assert.match(t, /Fly &lt;io>/)
})

// ── Cableado en pagos (pagos.ts usa estos puros) ──
import { notaTarjeta, pagableAMano, sinFacturasTarjeta, NOTA_TARJETA } from './tarjeta.ts'

test('cableado: tarjeta true → nota 💳 y no se puede pagar a mano', () => {
  assert.equal(notaTarjeta(true), NOTA_TARJETA)
  assert.match(NOTA_TARJETA, /se cobra con tarjeta · pendiente del cargo/)
})
test('cableado: tarjeta true → pagableAMano false', () => assert.equal(pagableAMano(true), false))
test('cableado: tarjeta false → pagable y sin nota', () => { assert.equal(pagableAMano(false), true); assert.equal(notaTarjeta(false), '') })
test('cableado: tarjeta null (no se sabe) → comportamiento actual', () => { assert.equal(pagableAMano(null), true); assert.equal(notaTarjeta(null), '') })
test('cableado: error de lectura (undefined) → como null, nunca bloquea ni anota', () => { assert.equal(pagableAMano(undefined), true); assert.equal(notaTarjeta(undefined), '') })
test('cableado: no duplica la nota si ya «se cobra sola»', () => assert.equal(notaTarjeta(true, true), ''))
test('cableado: pagarTodo salta las de tarjeta=true y conserva false/null/ausentes', () => {
  const fs = [{ proveedor: 'A' }, { proveedor: 'B' }, { proveedor: 'C' }, { proveedor: 'D' }]
  const formas = new Map<string, boolean | null>([['A', true], ['B', false], ['C', null]])
  assert.deepEqual(sinFacturasTarjeta(fs, formas).map((f) => f.proveedor), ['B', 'C', 'D'])
})
test('cableado: mapa vacío (lectura fallida) → no salta ninguna', () => {
  assert.equal(sinFacturasTarjeta([{ proveedor: 'A' }], new Map()).length, 1)
})

// ── Aviso semanal sin estado + nombre de cuenta ──────────────────────────────────
import { tocaAvisoTarjetaSemanal, textoAvisoTarjeta as textoAviso } from './tarjeta.ts'
test('tocaAvisoTarjetaSemanal: lunes sí', () => assert.equal(tocaAvisoTarjetaSemanal('2026-11-02'), true))
test('tocaAvisoTarjetaSemanal: martes no', () => assert.equal(tocaAvisoTarjetaSemanal('2026-11-03'), false))
test('tocaAvisoTarjetaSemanal: fecha ilegible no', () => assert.equal(tocaAvisoTarjetaSemanal('xx'), false))
test('textoAvisoTarjeta: incluye el nombre de la cuenta', () => {
  const t = textoAviso({ sinCargo: [{ id: '1', proveedor: 'X', importe: 5, divisa: null, cambio: null, fecha_factura: '2026-10-01' } as never], enPlazo: [] }, (s) => s, 'Mi cuenta')
  assert.match(t, /cuenta Mi cuenta/)
})

const leer = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')
const tc = leer('./tarjeta-cargos.ts')
const cuerpoDe = (src: string, marca: string) => { const i = src.indexOf(marca); assert.ok(i >= 0, marca); return src.slice(i, src.indexOf('\n}\n', i)) }
test('tarjeta-cargos: avisar concilia ANTES de avisar', () => {
  const c = cuerpoDe(tc, 'export async function avisarTarjetaSinCargo')
  assert.ok(c.indexOf('conciliarFacturasTarjeta(cuentaId)') >= 0)
  assert.ok(c.indexOf('conciliarFacturasTarjeta(cuentaId)') < c.indexOf('avisaTarjetaSinCargo('))
})
test('tarjeta-cargos: avisar solo toca los lunes', () => assert.match(cuerpoDe(tc, 'export async function avisarTarjetaSinCargo'), /tocaAvisoTarjetaSemanal\(hoy\)/))
test('tarjeta-cargos: cierra la factura con su cargo (atómico)', () => assert.match(cuerpoDe(tc, 'export async function conciliarFacturasTarjeta'), /cerrarFacturaConCargo\(/))
test('tarjeta-cargos: la casación excluye cargos ya conciliados', () => assert.match(cuerpoDe(tc, 'export async function conciliarFacturasTarjeta'), /mb\.conciliado IS NOT TRUE/))
test('tarjeta-cargos: quita botones del 🧾 viejo', () => assert.match(cuerpoDe(tc, 'export async function conciliarFacturasTarjeta'), /actualizarMensajeTg\(/))
const scan = leer('../../app/api/sivra/expenses/agent/scan/route.ts')
test('scan: excluye cuentas [seed-demo]', () => assert.match(scan, /nombre NOT ILIKE '%\[seed-demo\]%'/))
test('scan: pasa el nombre de la cuenta al aviso', () => assert.match(scan, /avisarTarjetaSinCargo\(c\.id, .*c\.nombre\)/))
const cp = leer('./conciliar-par.ts')
test('conciliar-par: marca el movimiento solo si conciliado IS NOT TRUE y con factura_ref fp:', () => {
  assert.match(cp, /WHERE id = \$\{par\.movimiento_id\}::uuid AND conciliado IS NOT TRUE/)
  assert.match(cp, /'fp:' \+ par\.factura_id/)
})
test('conciliar-par: movimiento sin filas → no cierra factura; todo en transacción', () => {
  assert.match(cp, /prisma\.\$transaction/)
  assert.match(cp, /mov\.length === 0\) throw new SinCambio/)
  assert.ok(cp.indexOf('UPDATE movimientos_bancarios') < cp.indexOf('UPDATE facturas_proveedor'))
})
