// Edificio sin división horizontal con unidades (27/10/2026): jerarquía, reparto en céntimos y rentabilidad por piso.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  nombresUnidades,
  pesosDeReparto,
  puedeColgarDe,
  rentabilidadConEdificios,
  repartirCentimos,
  unidadesPorEdificio,
} from './edificio.ts'
import { rentabilidadPorInmueble, type EntradaRentabilidad } from './rentabilidad.ts'
import type { Contrato, Gasto, Inmueble, PrimaSeguroInmueble, Titular } from './tipos.ts'

const titular: Titular = { id: 't1', tipo: 'persona', nombre: 'A', nif: null, deduceIva: false }
const inm = (id: string, p: Partial<Inmueble> = {}): Inmueble => ({
  id, titularId: 't1', alias: id, uso: 'vivienda', referenciaCatastral: null, suministros: [], cp: null,
  direccion: null, superficieM2: null, anioConstruccion: null, enComunidad: null, ...p,
})
const contrato = (id: string, inmuebleId: string, renta: number): Contrato => ({
  id, inmuebleId, inquilinoIds: [], inicio: '2025-01-01', fin: null, terminadoEn: null,
  rentaMensual: renta, clausula: { tipo: 'ninguna' }, actualizaciones: [], fianza: null, seguroInquilino: null,
})
let n = 0
const gasto = (p: Partial<Gasto> = {}): Gasto => ({
  id: `g${++n}`, titularId: 't1', inmuebleId: 'ed', fecha: '2026-03-10', categoria: 'IMPUESTOS', concepto: null,
  base: 100_000, total: 100_000, estado: 'confirmado', origen: 'manual', clave: null, ...p,
})
const entrada = (p: Partial<EntradaRentabilidad>): EntradaRentabilidad => ({
  titulares: [titular], inmuebles: [], contratos: [], gastos: [], primas: [], desde: '2026-01-01', hasta: '2026-12-31', ...p,
})

// ─── Jerarquía ─────────────────────────────────────────────────────────────────────────────────────────────

test('puedeColgarDe: solo de un EDIFICIO del mismo titular, vivo y de primer nivel', () => {
  const ed = { id: 'ed', titularId: 't1', uso: 'edificio', inmueblePadreId: null, archivado: false }
  assert.deepEqual(puedeColgarDe(ed, { titularId: 't1', uso: 'vivienda' }), { ok: true })
  assert.deepEqual(puedeColgarDe(ed, { titularId: 't2', uso: 'vivienda' }), { ok: false, motivo: 'otro_titular' })
  assert.deepEqual(puedeColgarDe({ ...ed, uso: 'vivienda' }, { titularId: 't1', uso: 'vivienda' }), { ok: false, motivo: 'no_es_edificio' })
  assert.deepEqual(puedeColgarDe({ ...ed, inmueblePadreId: 'x' }, { titularId: 't1', uso: 'vivienda' }), { ok: false, motivo: 'padre_es_unidad' })
  assert.deepEqual(puedeColgarDe({ ...ed, archivado: true }, { titularId: 't1', uso: 'vivienda' }), { ok: false, motivo: 'archivado' })
  assert.deepEqual(puedeColgarDe(ed, { titularId: 't1', uso: 'edificio' }), { ok: false, motivo: 'unidad_no_puede_ser_edificio' })
})

test('nombresUnidades: «Piso 1…N» con tope; fuera de rango, ninguno', () => {
  assert.deepEqual(nombresUnidades(3), ['Piso 1', 'Piso 2', 'Piso 3'])
  assert.equal(nombresUnidades(12).length, 12)
  assert.deepEqual(nombresUnidades(0), [])
  assert.deepEqual(nombresUnidades(201), [])
  assert.deepEqual(nombresUnidades(2.5), [])
})

test('unidadesPorEdificio: no agrupa con un padre de otro titular ni con un padre que no es edificio', () => {
  const g = unidadesPorEdificio([
    inm('ed', { uso: 'edificio' }), inm('a', { inmueblePadreId: 'ed' }),
    inm('b', { inmueblePadreId: 'ed', titularId: 't2' }), inm('v'), inm('c', { inmueblePadreId: 'v' }),
  ])
  assert.deepEqual([...g.keys()], ['ed'])
  assert.deepEqual(g.get('ed')!.map((i) => i.id), ['a'])
})

// ─── Reparto ───────────────────────────────────────────────────────────────────────────────────────────────

test('repartirCentimos: la suma es SIEMPRE el total y el resto va a la de más peso (empate: id menor)', () => {
  const tres = [{ id: 'b', peso: 1 }, { id: 'a', peso: 1 }, { id: 'c', peso: 1 }]
  const r = repartirCentimos(100, tres)
  assert.deepEqual(Object.fromEntries(r), { b: 33, a: 34, c: 33 })
  const m2 = repartirCentimos(100_001, [{ id: 'x', peso: 6_000 }, { id: 'y', peso: 4_000 }])
  assert.deepEqual(Object.fromEntries(m2), { x: 60_001, y: 40_000 })
  // Un abono (negativo) se reparte igual, con signo.
  assert.deepEqual(Object.fromEntries(repartirCentimos(-100, tres)), { b: -33, a: -34, c: -33 })
  // Importes grandes: sin pérdida (BigInt).
  const grande = repartirCentimos(9_007_199_254_740, [{ id: 'p', peso: 9_999_999 }, { id: 'q', peso: 1 }])
  assert.equal([...grande.values()].reduce((a, v) => a + v, 0), 9_007_199_254_740)
  for (let total = 0; total < 300; total += 7) {
    const doce = Array.from({ length: 12 }, (_, k) => ({ id: `u${k}`, peso: 5_000 + k * 137 }))
    assert.equal([...repartirCentimos(total, doce).values()].reduce((a, v) => a + v, 0), total)
  }
  assert.throws(() => repartirCentimos(10.5, tres), /reparto_total_no_entero/)
  assert.throws(() => repartirCentimos(10, [{ id: 'a', peso: 0 }]), /reparto_pesos_cero/)
})

test('pesosDeReparto: sin criterio o con un dato que falta NO se reparte (nada de «a partes iguales»)', () => {
  const u = [{ id: 'a', superficieM2: 60, porcentaje: 40 }, { id: 'b', superficieM2: null, porcentaje: 60 }]
  assert.deepEqual(pesosDeReparto(null, u), { ok: false, motivo: 'sin_criterio', unidades: [] })
  assert.deepEqual(pesosDeReparto('m2', []), { ok: false, motivo: 'sin_unidades', unidades: [] })
  assert.deepEqual(pesosDeReparto('m2', u), { ok: false, motivo: 'falta_superficie', unidades: ['b'] })
  assert.deepEqual(pesosDeReparto('porcentaje', u), { ok: true, criterio: 'porcentaje', pesos: [{ id: 'a', peso: 4_000 }, { id: 'b', peso: 6_000 }] })
  assert.deepEqual(pesosDeReparto('porcentaje', [{ id: 'a', superficieM2: 1, porcentaje: 40 }, { id: 'b', superficieM2: 1, porcentaje: 59.99 }]), { ok: false, motivo: 'porcentajes_no_suman', unidades: [] })
  assert.deepEqual(pesosDeReparto('porcentaje', [{ id: 'a', superficieM2: 1, porcentaje: null }]), { ok: false, motivo: 'falta_porcentaje', unidades: ['a'] })
  assert.deepEqual(pesosDeReparto('m2', [{ id: 'a', superficieM2: 60.5, porcentaje: null }]), { ok: true, criterio: 'm2', pesos: [{ id: 'a', peso: 6_050 }] })
})

// ─── Rentabilidad ──────────────────────────────────────────────────────────────────────────────────────────

test('🚨 sin edificios con unidades, el cálculo es IDÉNTICO al de siempre', () => {
  const e = entrada({
    inmuebles: [inm('i1'), inm('ed', { uso: 'edificio' })],
    contratos: [contrato('c1', 'i1', 100_000)],
    gastos: [gasto({ inmuebleId: 'i1' }), gasto({ inmuebleId: 'ed' }), gasto({ inmuebleId: null })],
  })
  const { edificios, ...resto } = rentabilidadConEdificios(e)
  assert.deepEqual(edificios, [])
  assert.deepEqual(resto, rentabilidadPorInmueble(e))
})

test('🚨 Busto Tavera: el IBI y el seguro del edificio se reparten por m² y la rentabilidad es POR PISO', () => {
  const e = entrada({
    inmuebles: [
      inm('ed', { uso: 'edificio', repartoCriterio: 'm2' }),
      inm('p1', { inmueblePadreId: 'ed', superficieM2: 60 }),
      inm('p2', { inmueblePadreId: 'ed', superficieM2: 40 }),
    ],
    contratos: [contrato('c1', 'p1', 80_000), contrato('c2', 'p2', 50_000)],
    gastos: [
      gasto({ inmuebleId: 'ed', categoria: 'IMPUESTOS', base: 100_001, total: 100_001 }), // IBI 1.000,01 €
      gasto({ inmuebleId: 'p2', categoria: 'MANTENIMIENTO', base: 20_000, total: 20_000 }), // gasto propio del piso 2
      gasto({ inmuebleId: 'ed', estado: 'propuesto' }), // factura del edificio sin revisar
    ],
    primas: [{ inmuebleId: 'ed', primaAnual: 36_500, desde: '2026-01-01', hasta: '2027-01-01' }],
  })
  const r = rentabilidadConEdificios(e)
  const de = (id: string) => r.inmuebles.find((i) => i.inmuebleId === id)!
  assert.equal(de('p1').ingresos, 960_000)
  assert.deepEqual(de('p1').gastosPorCategoria, { IMPUESTOS: 60_001 }) // 60 % + el céntimo del resto (más peso)
  assert.deepEqual(de('p2').gastosPorCategoria, { IMPUESTOS: 40_000, MANTENIMIENTO: 20_000 })
  assert.equal(de('p1').seguros, 21_900) // 60 % de la prima, prorrateada por días (año entero)
  assert.equal(de('p2').seguros, 14_600)
  assert.ok(!de('p1').avisos.includes('sin_seguro_conocido'), 'el seguro del edificio cubre al piso')
  // El edificio se queda solo con lo que no es de nadie (la factura sin revisar) y sin avisos que no le tocan.
  assert.equal(de('ed').gastos, 0)
  assert.equal(de('ed').seguros, 0)
  assert.equal(de('ed').gastosSinConfirmar, 1)
  assert.deepEqual(de('ed').avisos, [])

  assert.equal(r.edificios.length, 1)
  const v = r.edificios[0]
  assert.deepEqual(v.reparto, { ok: true, criterio: 'm2' })
  assert.equal(v.gastosSinRepartir, 0)
  assert.equal(v.total.ingresos, 960_000 + 600_000)
  assert.equal(v.total.gastos, 100_001 + 20_000)
  assert.equal(v.total.seguros, 36_500)
  assert.equal(v.total.beneficio, de('p1').beneficio + de('p2').beneficio + de('ed').beneficio)
  assert.equal(v.total.margenPct, Math.round((v.total.beneficio / v.total.ingresos) * 1000) / 10)
  assert.equal(v.total.gastosSinConfirmar, 1)
  assert.deepEqual(v.comparativa.map((c) => [c.inmuebleId, c.puesto]), [['p1', 1], ['p2', 2]])
})

test('reparto por %: lo que fija el propietario manda sobre los m²', () => {
  const r = rentabilidadConEdificios(entrada({
    inmuebles: [
      inm('ed', { uso: 'edificio', repartoCriterio: 'porcentaje' }),
      inm('p1', { inmueblePadreId: 'ed', superficieM2: 90, repartoPorcentaje: 25 }),
      inm('p2', { inmueblePadreId: 'ed', superficieM2: 10, repartoPorcentaje: 75 }),
    ],
    gastos: [gasto({ inmuebleId: 'ed', categoria: 'COMUNIDAD', base: null, total: 1_000 })],
  }))
  assert.deepEqual(r.inmuebles.find((i) => i.inmuebleId === 'p1')!.gastosPorCategoria, { COMUNIDAD: 250 })
  assert.deepEqual(r.inmuebles.find((i) => i.inmuebleId === 'p2')!.gastosPorCategoria, { COMUNIDAD: 750 })
})

test('🚨 sin dato para repartir: el gasto se queda en el EDIFICIO (cuenta en su total) y cada piso lo DICE', () => {
  const r = rentabilidadConEdificios(entrada({
    inmuebles: [
      inm('ed', { uso: 'edificio', repartoCriterio: 'm2' }),
      inm('p1', { inmueblePadreId: 'ed', superficieM2: 60 }),
      inm('p2', { inmueblePadreId: 'ed', superficieM2: null }),
    ],
    contratos: [contrato('c1', 'p1', 80_000)],
    gastos: [gasto({ inmuebleId: 'ed', base: 50_000, total: 50_000 })],
    primas: [{ inmuebleId: 'ed', primaAnual: null, desde: '2026-01-01', hasta: '2027-01-01' }],
  }))
  const v = r.edificios[0]
  assert.deepEqual(v.reparto, { ok: false, motivo: 'falta_superficie', unidades: ['p2'] })
  assert.equal(v.gastosSinRepartir, 50_000)
  assert.equal(v.total.gastos, 50_000)
  const p1 = r.inmuebles.find((i) => i.inmuebleId === 'p1')!
  assert.deepEqual(p1.gastosPorCategoria, {})
  assert.ok(p1.avisos.includes('reparto_edificio_pendiente'))
  // La prima sin dato del edificio no se convierte en 0: se avisa en el edificio.
  assert.ok(r.inmuebles.find((i) => i.inmuebleId === 'ed')!.avisos.includes('prima_sin_dato'))
})

test('prima del edificio sin dato y reparto posible: cada piso hereda «prima sin dato», nunca 0 €', () => {
  const primas: PrimaSeguroInmueble[] = [{ inmuebleId: 'ed', primaAnual: null, desde: '2026-01-01', hasta: '2027-01-01' }]
  const r = rentabilidadConEdificios(entrada({
    inmuebles: [inm('ed', { uso: 'edificio', repartoCriterio: 'm2' }), inm('p1', { inmueblePadreId: 'ed', superficieM2: 50 })],
    primas,
  }))
  const p1 = r.inmuebles.find((i) => i.inmuebleId === 'p1')!
  assert.ok(p1.avisos.includes('prima_sin_dato'))
  assert.equal(p1.seguros, 0)
})

test('seguros ilegibles (`primas: null`) siguen siendo ilegibles con edificio', () => {
  const r = rentabilidadConEdificios(entrada({
    inmuebles: [inm('ed', { uso: 'edificio', repartoCriterio: 'm2' }), inm('p1', { inmueblePadreId: 'ed', superficieM2: 50 })],
    primas: null,
  }))
  assert.ok(r.inmuebles.find((i) => i.inmuebleId === 'p1')!.avisos.includes('seguros_sin_leer'))
})

test('rcEfectiva: la propia manda; la unidad sin RC hereda la de SU edificio; lo demás, null', async () => {
  const { rcEfectiva } = await import('./edificio.ts')
  const ed = { id: 'ed', referenciaCatastral: '5731022TG3453B0001AK' }
  assert.equal(rcEfectiva({ referenciaCatastral: null, inmueblePadreId: 'ed' }, ed), '5731022TG3453B0001AK')
  assert.equal(rcEfectiva({ referenciaCatastral: '1111111AA1111A0001AA', inmueblePadreId: 'ed' }, ed), '1111111AA1111A0001AA')
  assert.equal(rcEfectiva({ referenciaCatastral: null, inmueblePadreId: null }, ed), null, 'un suelto no hereda nada')
  assert.equal(rcEfectiva({ referenciaCatastral: null, inmueblePadreId: 'otro' }, ed), null, 'nunca la de un edificio que no es el suyo')
  assert.equal(rcEfectiva({ referenciaCatastral: null, inmueblePadreId: 'ed' }, null), null)
  assert.equal(rcEfectiva({ referenciaCatastral: null }, { referenciaCatastral: '5731022TG3453B0001AK' }), null, 'sin padre no hereda')
  assert.equal(rcEfectiva({ referenciaCatastral: '   ', inmueblePadreId: 'ed' }, { id: 'ed', referenciaCatastral: null }), null)
})
