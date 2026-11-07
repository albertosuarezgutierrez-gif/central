// Certificado anual de retenciones del perceptor ≡ su fila del 190; lectura única del hecho de nómina (IRPF 0 incluido).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularCertificadoRetenciones, calcularModelo111, calcularModelo190, importeDe, retencionDeNomina, type RetencionTrabajo } from '../src/index.ts'

const nom = (ref: string, fecha: string, nif: string, nombre: string, bruto: number, irpf: number, ssTrabajador?: number): RetencionTrabajo => {
  const l = retencionDeNomina({ ref, fecha, payload: { tipo: 'nomina', bruto, irpf, ssEmpresa: 1, liquido: 1, perceptor: { nif, nombre, provincia: '41' }, clave: 'A', ...(ssTrabajador !== undefined ? { ssTrabajador } : {}) } })
  assert.ok(l.ok)
  return l.retencion
}

const anio = (): RetencionTrabajo[] => [
  nom('nomina:a1', '2026-01-31', '12345678Z', 'Ana', 200000, 30000, 12700),
  nom('nomina:a2', '2026-02-28', '12345678z', 'Ana', 200000, 30000, 12700),
  nom('nomina:b1', '2026-01-31', '87654321X', 'Bruno', 90000, 0, 5715),
  nom('nomina:b2', '2026-02-28', '87654321X', 'Bruno', 90000, 0, 5715),
  nom('nomina:a-2025', '2025-12-31', '12345678Z', 'Ana', 999999, 9999, 1),
]

test('nómina con IRPF 0 produce retención 0: entra en el 190 y cuenta como perceptor en el 111 (sin sumar retención)', () => {
  const rs = anio()
  const c190 = calcularModelo190(rs, 2026)
  const bruno = c190.perceptores.find((p) => p.nif === '87654321X')
  assert.ok(bruno, 'el trabajador sin retención debe estar en el 190')
  assert.deepEqual([bruno.clave, bruno.percepcionDineraria, bruno.retencionDineraria], ['A', 180000, 0])
  const c111 = calcularModelo111(rs, { anio: 2026, trimestre: 1 })
  assert.deepEqual([importeDe(c111, '01'), importeDe(c111, '02'), importeDe(c111, '03')], [2, 580000, 60000])
})

test('certificado ≡ fila del 190 del perceptor; gastos deducibles = SS del trabajador; otro ejercicio fuera', () => {
  const rs = anio()
  const c190 = calcularModelo190(rs, 2026)
  for (const nif of ['12345678Z', '87654321X']) {
    const cert = calcularCertificadoRetenciones(rs, 2026, nif)
    const fila = c190.perceptores.find((p) => p.nif === nif)!
    assert.equal(cert.lineas.length, 1)
    const l = cert.lineas[0]
    assert.deepEqual(
      [l.clave, l.percepcionDineraria, l.retencionDineraria, l.percepcionEspecie, l.ingresoACuentaEspecie, l.refs],
      [fila.clave, fila.percepcionDineraria, fila.retencionDineraria, fila.percepcionEspecie, fila.ingresoACuentaEspecie, fila.refs],
    )
    assert.equal(cert.totales.percepciones, fila.percepcionDineraria + fila.percepcionEspecie)
    assert.equal(cert.totales.retenciones, fila.retencionDineraria + fila.ingresoACuentaEspecie)
  }
  const ana = calcularCertificadoRetenciones(rs, 2026, '12345678Z')
  assert.deepEqual([ana.perceptor.nif, ana.totales.percepciones, ana.totales.retenciones, ana.totales.gastosDeducibles], ['12345678Z', 400000, 60000, 25400])
  assert.ok(!ana.lineas[0].refs.includes('nomina:a-2025'))
  assert.ok(!ana.lineas[0].refs.some((r) => r.startsWith('nomina:b')), 'nunca mezcla a otro perceptor')
})

test('gastos deducibles desconocidos quedan en null (no 0); sin NIF lanza; sin datos avisa', () => {
  const rs = [nom('nomina:c1', '2026-03-31', '11111111H', 'Carla', 100000, 5000, 6350), nom('nomina:c2', '2026-04-30', '11111111H', 'Carla', 100000, 5000)]
  const c = calcularCertificadoRetenciones(rs, 2026, '11111111H')
  assert.equal(c.lineas[0].gastosDeducibles, null)
  assert.equal(c.totales.gastosDeducibles, null)
  assert.ok(c.avisos.some((a) => /gastos deducibles/.test(a)))
  assert.throws(() => calcularCertificadoRetenciones(rs, 2026, '  '), RangeError)
  const vacio = calcularCertificadoRetenciones(rs, 2026, '22222222J')
  assert.deepEqual([vacio.lineas.length, vacio.totales.percepciones], [0, 0])
  assert.ok(vacio.avisos.some((a) => /Sin datos/.test(a)))
})

test('retencionDeNomina: payload ilegible o sin bruto/IRPF → motivo, nunca una retención inventada', () => {
  assert.equal(retencionDeNomina({ ref: 'x', fecha: '2026-01-31', payload: null }).ok, false)
  assert.equal(retencionDeNomina({ ref: 'x', fecha: '2026-01-31', payload: { bruto: 100 } }).ok, false)
  const sinPerceptor = retencionDeNomina({ ref: 'x', fecha: '2026-01-31', payload: { bruto: 100, irpf: 0 } })
  assert.ok(sinPerceptor.ok && sinPerceptor.retencion.perceptor.nif === null && sinPerceptor.retencion.gastosDeducibles === undefined)
})
