// Mapeo filas → tipos puros del patrimonio (22/10/2026). Un brazo por regla: céntimos exactos, `null` que se
// queda `null`, fechas en UTC y valores fuera de lista que revientan (nunca un valor de cajón).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  centimos,
  contratoDeFila,
  decimal,
  fechaDe,
  gastoDeFila,
  calleSinValidar,
  inmuebleDeFila,
  inquilinoDeFila,
  obligacionDeFila,
  plantillaDeFila,
  titularDeFila,
  type FilaContrato,
  type FilaGasto,
} from './lectura.ts'

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

test('céntimos: bigint → number exacto; null se queda null; fuera de rango revienta', () => {
  assert.equal(centimos(BigInt(216249)), 216249)
  assert.equal(centimos(BigInt(0)), 0)
  assert.equal(centimos(null), null)
  assert.throws(() => centimos(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1)), /centimos_fuera_de_rango/)
})

test('fechas @db.Date se leen en UTC, nunca con el huso local', () => {
  assert.equal(fechaDe(d('2026-01-31')), '2026-01-31')
  assert.equal(fechaDe(null), null)
  assert.throws(() => fechaDe(new Date('x')), /fila_invalida/)
})

test('decimal: Prisma.Decimal → number; null → null', () => {
  assert.equal(decimal({ toString: () => '85.50' }), 85.5)
  assert.equal(decimal(null), null)
})

test('titular: el nombre sale de la ficha y el NIF NUNCA (el rol no lee clientes.dni)', () => {
  const t = titularDeFila({ id: 't1', clienteId: 'c1', tipo: 'sociedad', deduceIva: null }, { nombre: 'Punto y Coma SL', apellidos: null })
  assert.deepEqual(t, { id: 't1', tipo: 'sociedad', nombre: 'Punto y Coma SL', nif: null, deduceIva: null })
  assert.throws(() => titularDeFila({ id: 't1', clienteId: 'c1', tipo: 'empresa', deduceIva: true }, { nombre: 'X', apellidos: '' }), /titular\.tipo/)
})

test('inmueble: uso fuera de lista revienta (no se convierte en «otro»); nulos se quedan nulos', () => {
  const base = {
    id: 'i1',
    titularId: 't1',
    alias: 'Socorro',
    uso: 'vivienda',
    referenciaCatastral: null,
    cp: '41003',
    direccionNormalizada: null,
    superficieM2: null,
    anioConstruccion: null,
    enComunidad: null,
    suministros: [],
  }
  const i = inmuebleDeFila(base)
  assert.equal(i.superficieM2, null)
  assert.equal(i.enComunidad, null)
  assert.equal(i.direccion, null)
  assert.throws(() => inmuebleDeFila({ ...base, uso: 'chalet' }), /inmueble\.uso/)
})

test('inquilino: NIF y email cifrados no llegan al portal → null, no «no tiene»', () => {
  assert.deepEqual(inquilinoDeFila({ id: 'q1', tipo: 'persona', nombre: 'Ana' }), { id: 'q1', tipo: 'persona', nombre: 'Ana', nif: null, email: null })
})

const contrato: FilaContrato = {
  id: 'k1',
  inmuebleId: 'i1',
  inicio: d('2025-03-01'),
  fin: null,
  terminadoEn: null,
  rentaMensualCent: BigInt(85000),
  clausula: 'ninguna',
  indice: null,
  indiceDescripcion: null,
  fianzaCent: null,
  fianzaDepositadaEn: null,
  fianzaDevueltaEn: null,
  seguroInquilinoExigido: null,
  seguroInquilinoVence: null,
}

test('contrato: sin datos de fianza ni de seguro → null («no consta»), no 0 € ni «no lo exige»', () => {
  const c = contratoDeFila(contrato, ['q1'], [])
  assert.equal(c.fianza, null)
  assert.equal(c.seguroInquilino, null)
  assert.equal(c.rentaMensual, 85000)
  assert.equal(c.inicio, '2025-03-01')
  assert.deepEqual(c.clausula, { tipo: 'ninguna' })
})

test('contrato: fianza con importe null pero depositada se queda importe null', () => {
  const c = contratoDeFila({ ...contrato, fianzaDepositadaEn: d('2025-03-10') }, [], [])
  assert.deepEqual(c.fianza, { importe: null, depositadaEn: '2025-03-10', devueltaEn: null })
})

test('contrato: cláusula por índice y actualizaciones ordenadas por fecha', () => {
  const c = contratoDeFila({ ...contrato, clausula: 'indice', indice: 'IRAV' }, [], [
    { desde: d('2027-03-01'), rentaMensualCent: BigInt(88000) },
    { desde: d('2026-03-01'), rentaMensualCent: BigInt(86500) },
  ])
  assert.deepEqual(c.clausula, { tipo: 'indice', indice: 'IRAV', descripcion: null })
  assert.deepEqual(c.actualizaciones.map((a) => a.desde), ['2026-03-01', '2027-03-01'])
  assert.throws(() => contratoDeFila({ ...contrato, clausula: 'indice', indice: null }, [], []), /contrato\.indice/)
  assert.throws(() => contratoDeFila({ ...contrato, clausula: 'libre' }, [], []), /contrato\.clausula/)
})

test('plantilla: importe null = variable, NUNCA 0', () => {
  const p = plantillaDeFila({
    id: 'p1',
    titularId: 't1',
    inmuebleId: null,
    concepto: 'Luz',
    categoria: 'SUMINISTROS',
    periodicidad: 'mensual',
    diaMes: 5,
    inicio: d('2026-01-01'),
    fin: null,
    importeCent: null,
    activo: true,
  })
  assert.equal(p.importe, null)
  assert.equal(p.inicio, '2026-01-01')
})

test('gasto: base/total/categoría null se quedan null; categoría o estado fuera de lista revientan', () => {
  const g: FilaGasto = {
    id: 'g1',
    titularId: 't1',
    inmuebleId: 'i1',
    fecha: d('2026-10-01'),
    categoria: null,
    concepto: null,
    baseCent: null,
    totalCent: null,
    estado: 'propuesto',
    origen: 'factura',
    clave: null,
  }
  const out = gastoDeFila(g)
  assert.equal(out.base, null)
  assert.equal(out.total, null)
  assert.equal(out.categoria, null)
  assert.throws(() => gastoDeFila({ ...g, categoria: 'otro' }), /gasto\.categoria/)
  assert.throws(() => gastoDeFila({ ...g, estado: 'pagado' }), /gasto\.estado/)
})

test('obligación: aplica null = no se sabe; las de contrato no se guardan (revientan)', () => {
  const base = { id: 'o1', inmuebleId: 'i1', tipo: 'revision_gas', aplica: null, ultima: null, vence: null, periodicidadMeses: null }
  assert.equal(obligacionDeFila(base).aplica, null)
  assert.throws(() => obligacionDeFila({ ...base, tipo: 'fin_contrato' }), /obligacion\.tipo/)
})

test('calle por validar: via null con dirección = por validar; vía oficial = no; sin dirección = null (no consta)', () => {
  assert.equal(calleSinValidar({ via: null, direccionNormalizada: 'Calle X 1, 41003 Sevilla (Sevilla)' }), true)
  assert.equal(calleSinValidar({ via: 'CL PARRA LA', direccionNormalizada: 'CL PARRA LA 12, 41003 SEVILLA (SEVILLA)' }), false)
  assert.equal(calleSinValidar({ via: null, direccionNormalizada: null }), null)
})
