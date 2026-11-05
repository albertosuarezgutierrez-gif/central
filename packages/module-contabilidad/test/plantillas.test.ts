// Plantillas sectoriales: todas sus cuentas existen y son hoja; la misma batería de hechos produce asientos CUADRADOS y válidos con
// cada una (paridad); mapeo de cada medio de cobro; reglas de la empresa (validación y precedencia).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  PLANTILLAS, SECTORES_PLANTILLA, planDeSector, plantillaDe, filasPlanDeSector, asientoDesdeHecho, crearAsiento, ejercicioNatural,
  validarReglasEmpresa, reglasEfectivasDeSector, procedenciaRegla, REGLAS_PGC, MEDIOS_PAGO, SEMILLA_PGC_PYMES, totalesAsiento,
} from '../src/index.ts'
import type { HechoContable, ReglasAsiento } from '../src/index.ts'

function cuentasDe(r: ReglasAsiento): string[] {
  return [
    ...Object.values(r.venta), ...Object.values(r.compra), ...Object.values(r.cobro), ...Object.values(r.pago), ...Object.values(r.nomina),
    ...Object.values(r.categorias?.venta ?? {}), ...Object.values(r.categorias?.compra ?? {}),
    ...Object.values(r.medios?.cobro ?? {}), ...Object.values(r.medios?.pago ?? {}),
  ]
}

for (const sector of SECTORES_PLANTILLA) {
  test(`plantilla «${sector}»: todas las cuentas de sus reglas existen en el plan y son hoja; las extra no duplican la semilla`, () => {
    const plan = planDeSector(sector)
    for (const c of cuentasDe(PLANTILLAS[sector].reglas)) {
      assert.ok(plan.cuentas[c], `${sector}: falta la cuenta ${c}`)
      assert.equal(plan.cuentas[c].admiteApuntes, true, `${sector}: ${c} no es hoja`)
    }
    // Lo que cita la regla está en la SEMILLA: una empresa dada de alta antes de la plantilla sigue pudiendo asentar.
    const semilla = new Set(SEMILLA_PGC_PYMES.map(([c]) => c))
    for (const c of cuentasDe(PLANTILLAS[sector].reglas)) assert.ok(semilla.has(c), `${sector}: ${c} no está en la semilla`)
    assert.equal(filasPlanDeSector(sector).length, SEMILLA_PGC_PYMES.length + PLANTILLAS[sector].cuentasExtra.length)
    assert.ok(PLANTILLAS[sector].dimensiones.length >= 2)
  })

  test(`plantilla «${sector}»: la batería de hechos genera asientos cuadrados y válidos (paridad)`, () => {
    const plan = planDeSector(sector)
    const reglas = PLANTILLAS[sector].reglas
    const cats = [undefined, ...Object.keys(reglas.categorias?.venta ?? {})]
    const catsC = [undefined, ...Object.keys(reglas.categorias?.compra ?? {})]
    const hechos: HechoContable[] = [
      ...cats.map((categoria, i): HechoContable => ({ tipo: 'venta', fecha: '2026-03-10', ref: `V${i}`, desglose: [{ base: 10000, tipoIva: 21, ...(categoria ? { categoria } : {}) }, { base: 3333, tipoIva: 10 }], retencion: 150 })),
      ...catsC.map((categoria, i): HechoContable => ({ tipo: 'compra', fecha: '2026-03-11', ref: `C${i}`, desglose: [{ base: 777, tipoIva: 21, ...(categoria ? { categoria } : {}) }] })),
      ...MEDIOS_PAGO.map((medio): HechoContable => ({ tipo: 'cobro', fecha: '2026-03-12', ref: `K-${medio}`, importe: 5000, medio })),
      ...MEDIOS_PAGO.map((medio): HechoContable => ({ tipo: 'pago', fecha: '2026-03-12', ref: `P-${medio}`, importe: 5000, medio })),
      { tipo: 'nomina', fecha: '2026-03-31', ref: 'N1', bruto: 200000, ssEmpresa: 60000, irpf: 30000, ssTrabajador: 12700, liquido: 157300 },
    ]
    for (const h of hechos) {
      const a = crearAsiento(asientoDesdeHecho(h, reglas), plan, ejercicioNatural(2026))
      const t = totalesAsiento(a)
      assert.equal(t.debe, t.haber, `${sector}/${h.ref}`)
    }
  })
}

test('taller: mano de obra → 705, recambio → 700, compra de recambio → 600, trabajos de terceros → 607; sin categoría no cambia nada', () => {
  const r = PLANTILLAS.taller.reglas
  const venta = asientoDesdeHecho({ tipo: 'venta', fecha: '2026-03-10', ref: 'F', desglose: [{ base: 8000, tipoIva: 21, categoria: 'mano_obra' }, { base: 2000, tipoIva: 21, categoria: 'recambio' }] }, r)
  assert.deepEqual(venta.apuntes.map((p) => [p.cuenta, p.debe, p.haber]), [['430', 12100, 0], ['705', 0, 8000], ['700', 0, 2000], ['477', 0, 2100]])
  const compra = asientoDesdeHecho({ tipo: 'compra', fecha: '2026-03-10', ref: 'C', desglose: [{ base: 1000, tipoIva: 21, categoria: 'trabajos_terceros' }, { base: 500, tipoIva: 21, categoria: 'recambio' }] }, r)
  assert.deepEqual(compra.apuntes.filter((p) => p.debe > 0).map((p) => p.cuenta), ['607', '600', '472'])
  const sinCat: HechoContable = { tipo: 'venta', fecha: '2026-03-10', ref: 'F2', desglose: [{ base: 1000, tipoIva: 21 }] }
  assert.deepEqual(asientoDesdeHecho(sinCat, r), asientoDesdeHecho(sinCat, REGLAS_PGC))
  assert.equal(r.compra.retencionPracticada, '4751')
})

test('cobro por medio: efectivo → 570; bizum, transferencia, tarjeta y otro → 572; sin medio → tesorería por defecto', () => {
  for (const sector of SECTORES_PLANTILLA) {
    const r = PLANTILLAS[sector].reglas
    const cuenta = (medio?: string) => asientoDesdeHecho({ tipo: 'cobro', fecha: '2026-03-12', ref: 'K', importe: 100, ...(medio ? { medio: medio as never } : {}) }, r).apuntes[0].cuenta
    assert.equal(cuenta('efectivo'), '570', sector)
    for (const m of ['bizum', 'transferencia', 'tarjeta', 'otro']) assert.equal(cuenta(m), '572', `${sector}/${m}`)
    assert.equal(cuenta(), r.cobro.tesoreria)
  }
  // El hecho genérico (sin plantilla) tampoco cambia: REGLAS_PGC no trae medios.
  assert.equal(asientoDesdeHecho({ tipo: 'cobro', fecha: '2026-03-12', ref: 'K', importe: 100, medio: 'efectivo' }, REGLAS_PGC).apuntes[0].cuenta, '572')
})

test('la empresa edita el medio: «medio:tarjeta» → 5720 propia gana a la plantilla (empresa > sector > genérica)', () => {
  const r = reglasEfectivasDeSector('hosteleria', { cobro: { 'medio:tarjeta': '570', 'medio:efectivo': '572' } })
  const cuenta = (medio: string) => asientoDesdeHecho({ tipo: 'cobro', fecha: '2026-03-12', ref: 'K', importe: 100, medio: medio as never }, r).apuntes[0].cuenta
  assert.equal(cuenta('tarjeta'), '570')
  assert.equal(cuenta('efectivo'), '572')
  assert.equal(cuenta('bizum'), '572')
  assert.equal(procedenciaRegla('hosteleria', { cobro: { 'medio:tarjeta': '570' } }, 'cobro', 'medio:tarjeta'), 'empresa')
  assert.equal(procedenciaRegla('hosteleria', {}, 'cobro', 'medio:efectivo'), 'sector')
  assert.equal(procedenciaRegla('hosteleria', {}, 'venta', 'ingreso'), 'sector')
  assert.equal(procedenciaRegla('taller', {}, 'venta', 'cliente'), 'generica')
})

test('validar reglas de la empresa: cuentas inexistentes, no hoja, campos y medios desconocidos, categorías mal formadas', () => {
  const plan = planDeSector('taller')
  assert.deepEqual(validarReglasEmpresa('venta', { ingreso: '705', 'categoria:mano_obra': '705' }, plan), [])
  assert.deepEqual(validarReglasEmpresa('cobro', { 'medio:efectivo': '570', tesoreria: '572' }, plan), [])
  assert.match(validarReglasEmpresa('venta', { ingreso: '999' }, plan).join(), /no existe/)
  assert.match(validarReglasEmpresa('venta', { ingreso: '70' }, plan).join(), /no es un código/)
  assert.match(validarReglasEmpresa('venta', { inventado: '705' }, plan).join(), /campo desconocido/)
  assert.match(validarReglasEmpresa('cobro', { 'medio:cheque': '572' }, plan).join(), /medio desconocido/)
  assert.match(validarReglasEmpresa('venta', { 'medio:bizum': '572' }, plan).join(), /solo existen en cobro y pago/)
  assert.match(validarReglasEmpresa('cobro', { 'categoria:x1': '572' }, plan).join(), /solo en venta y compra|solo existen en venta y compra/)
  assert.match(validarReglasEmpresa('venta', { 'categoria:Mal Nombre': '705' }, plan).join(), /nombre de categoría/)
  assert.ok(validarReglasEmpresa('venta', {}, plan).length > 0)
  assert.ok(validarReglasEmpresa('xx', { a: '1' }, plan).length > 0)
  const noHoja = { cuentas: { ...plan.cuentas, '705': { ...plan.cuentas['705'], admiteApuntes: false } } }
  assert.match(validarReglasEmpresa('venta', { ingreso: '705' }, noHoja).join(), /nivel hoja/)
})

test('sector desconocido cae en la genérica; la genérica con medios no altera lo que no los usa', () => {
  assert.equal(plantillaDe('astronauta').sector, 'generico')
  const g = PLANTILLAS.generico.reglas
  assert.deepEqual({ ...g, medios: undefined, categorias: undefined }, { ...REGLAS_PGC, medios: undefined, categorias: undefined })
})

test('el NÚCLEO (partida, analisis, avisos) no nombra ningún sector: solo src/plantillas puede', () => {
  const raiz = join(import.meta.dirname, '..', 'src')
  const palabras = /\b(taller|hosteler[ií]a|limpieza|mec[aá]nico)\b/i
  const culpables: string[] = []
  for (const dir of ['partida', 'analisis', 'avisos']) {
    for (const f of readdirSync(join(raiz, dir))) {
      const texto = readFileSync(join(raiz, dir, f), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/**'))
      texto.forEach((l, i) => { if (palabras.test(l.replace(/\/\/.*$/, ''))) culpables.push(`${dir}/${f}:${i + 1}`) })
    }
  }
  assert.deepEqual(culpables, [])
})
