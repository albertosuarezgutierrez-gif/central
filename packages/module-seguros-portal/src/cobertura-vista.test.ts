import test from 'node:test'
import assert from 'node:assert/strict'
import { vistaCobertura, nombreCobertura } from './cobertura-vista.ts'

const base = { capitalAsegurado: null, franquicia: null, fechaInicio: null, fechaFin: null }
const d = (iso: string) => new Date(iso)

test('capital: importe en euros españoles, 0 = sin capital propio, INF = ilimitado, NULL = nada', () => {
  assert.equal(vistaCobertura({ ...base, capitalAsegurado: '2162.49' }).capital, '2.162,49€')
  assert.equal(vistaCobertura({ ...base, capitalAsegurado: '0' }).capital, 'sin capital propio')
  assert.equal(vistaCobertura({ ...base, capitalAsegurado: '0.00' }).capital, 'sin capital propio')
  assert.equal(vistaCobertura({ ...base, capitalAsegurado: 'INF' }).capital, 'ilimitado')
  assert.equal(vistaCobertura({ ...base, capitalAsegurado: null }).capital, null)
  assert.equal(vistaCobertura({ ...base, capitalAsegurado: '' }).capital, null)
  // Un texto que no sabemos leer no se adivina ni se pinta.
  assert.equal(vistaCobertura({ ...base, capitalAsegurado: '1.500 aprox' }).capital, null)
})

test('franquicia: solo un importe mayor que cero; 0, vacío o raro → null', () => {
  assert.equal(vistaCobertura({ ...base, franquicia: '150.00' }).franquicia, '150,00€')
  assert.equal(vistaCobertura({ ...base, franquicia: '0' }).franquicia, null)
  assert.equal(vistaCobertura({ ...base, franquicia: null }).franquicia, null)
  assert.equal(vistaCobertura({ ...base, franquicia: '10%' }).franquicia, null)
})

test('vigencia de la cobertura: se dice solo si difiere del periodo de la póliza', () => {
  const c = { ...base, fechaInicio: d('2026-01-01T00:00:00Z'), fechaFin: d('2027-01-01T00:00:00Z') }
  assert.equal(vistaCobertura(c).vigencia, 'del 01/01/2026 al 01/01/2027')
  assert.equal(vistaCobertura(c, { inicio: d('2026-01-01T00:00:00Z'), fin: d('2027-01-01T00:00:00Z') }).vigencia, null)
  assert.equal(vistaCobertura(c, { inicio: d('2026-01-01T00:00:00Z'), fin: d('2026-07-01T00:00:00Z') }).vigencia, 'del 01/01/2026 al 01/01/2027')
  assert.equal(vistaCobertura({ ...base, fechaFin: d('2027-01-01T00:00:00Z') }).vigencia, 'hasta el 01/01/2027')
  assert.equal(vistaCobertura({ ...base, fechaInicio: d('2026-01-01T00:00:00Z') }).vigencia, 'desde el 01/01/2026')
  assert.equal(vistaCobertura(base).vigencia, null)
})

test('vigencia: medianoche de Madrid guardada como timestamptz cuenta como ese día', () => {
  // 2026-01-01 00:00 en Madrid (CET) = 2025-12-31T23:00Z.
  const c = { ...base, fechaInicio: d('2025-12-31T23:00:00Z'), fechaFin: d('2026-12-31T23:00:00Z') }
  assert.equal(vistaCobertura(c).vigencia, 'del 01/01/2026 al 01/01/2027')
})

test('fechas imposibles (centinelas) no se pintan', () => {
  assert.equal(vistaCobertura({ ...base, fechaInicio: d('0001-01-01T00:00:00Z') }).vigencia, null)
  assert.equal(vistaCobertura({ ...base, fechaInicio: new Date('x') }).vigencia, null)
})

const ps = (max: string) => ({ DatosLimitesAsegurados: { Limite: { ClaseLimite: 'PS', LimiteMaximo: max, LimiteMinimo: max, DescripcionLimite: 'Por siniestro' } } })

test('🚨 capital: el límite por siniestro manda sobre el capital del riesgo repetido (Clio 11.800€ ≠ 77.202€)', () => {
  const v = (descripcion: string, datosExtra: unknown) => vistaCobertura({ ...base, descripcion, capitalAsegurado: '77202.00', datosExtra }).capital
  assert.equal(v('Cristales', ps('11800.00')), '11.800,00€')
  assert.equal(v('Robo', ps('11800.00')), '11.800,00€')
  // «1.00» no es dinero: nunca cae al 77.202 heredado.
  assert.equal(v('Fenómenos Naturaleza', ps('1.00')), null)
  // Sin límite en datos_extra se conserva el capital informado.
  assert.equal(v('Cristales', null), '77.202,00€')
})

test('capital: sin capital pero con límite → el límite; sin nada → no se pinta', () => {
  const n = { ...base, descripcion: 'R.C. Patronal' }
  assert.equal(vistaCobertura({ ...n, datosExtra: { DatosLimitesAsegurados: { Limite: { ClaseLimite: 'NI', LimiteMaximo: '309000.00' } } } }).capital, '309.000,00€')
  assert.equal(vistaCobertura(n).capital, null)
})

test('🚨 RC obligatoria = límites legales (aunque venga INF); «RC Explotación» con INF no se pinta; INF explícito en otra = ilimitado', () => {
  assert.equal(vistaCobertura({ ...base, descripcion: 'RC Obligatoria', capitalAsegurado: 'INF' }).capital, 'Límites legales del seguro obligatorio')
  assert.equal(vistaCobertura({ ...base, descripcion: 'RC Obligatoria', capitalAsegurado: null }).capital, 'Límites legales del seguro obligatorio')
  assert.equal(vistaCobertura({ ...base, descripcion: 'Responsabilidad Civil Obligatoria', capitalAsegurado: '0' }).capital, 'Límites legales del seguro obligatorio')
  assert.equal(vistaCobertura({ ...base, descripcion: 'RC Explotación', capitalAsegurado: 'INF' }).capital, null)
  assert.equal(vistaCobertura({ ...base, descripcion: 'RC Explotación', capitalAsegurado: null }).capital, null)
  assert.equal(vistaCobertura({ ...base, descripcion: 'Defensa Jurídica', capitalAsegurado: 'INF' }).capital, 'ilimitado')
  assert.equal(vistaCobertura({ ...base, descripcion: 'Defensa Jurídica', capitalAsegurado: null }).capital, null)
})

test('la prima de datos_extra no se cuela en la vista', () => {
  const x = vistaCobertura({ ...base, descripcion: 'Robo', capitalAsegurado: '1', datosExtra: { ...ps('500'), DatosImportes: { PrimaNeta: '123.45', PrimaTotal: '130.00' } } })
  assert.ok(!JSON.stringify(x).includes('123'))
})

test('errata «Fenónemos» → «Fenómenos»', () => {
  assert.equal(nombreCobertura('Fenónemos Naturaleza'), 'Fenómenos Naturaleza')
  assert.equal(nombreCobertura('Robo'), 'Robo')
})
