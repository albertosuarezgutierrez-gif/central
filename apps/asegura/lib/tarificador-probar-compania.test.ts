// «Probar» con el riesgo reconstruido: la compañía actual (Allianz auto con cambio de seguro) se deduce de la cartera SOLO si hay
// exactamente UNA póliza de auto en vigor. `node --test`. Nombres FICTICIOS; sin datos personales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decidirRiesgoProbar, conCompaniaActualUnica, type ReconstruccionRiesgo } from './tarificador-relanzar-reglas.ts'
import { companiaActualUnica, type PolizaParaCompaniaActual } from './tarificador-compania-actual.ts'
import { validarEntradaRamo } from './tarificador-reglas.ts'

const pol = (x: Partial<PolizaParaCompaniaActual> = {}): PolizaParaCompaniaActual => ({
  tipo: 'auto', aseguradora: 'Aseguradora Beta', estado: 'activa', importRef: null, eiacXmlHash: null, sustituidaAt: null, fechaEfecto: '2026-01-01', ...x,
})
const coche = () => ({
  ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
  conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01', sexo: 'mujer' },
  tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 0, garajeNoche: false,
  documentoTomador: '00000000T',
  datosTomador: { tipo: 'fisica', nombre: 'NOMBRE', apellido1: 'APELLIDO', apellido2: null, fechaNacimiento: '1985-03-10' },
})
const rec = (riesgo: unknown): ReconstruccionRiesgo => ({ riesgo, bloqueos: [], repreguntar: [] })
const probar = (r: ReconstruccionRiesgo, polizas: PolizaParaCompaniaActual[]) =>
  decidirRiesgoProbar({
    reconstruccion: conCompaniaActualUnica(r, 'allianz', 'auto', companiaActualUnica(null, polizas)),
    previo: null, soloPurgados: false, validar: (riesgo) => validarEntradaRamo('auto', riesgo, 'allianz'),
  })

test('base: sin compañía actual el riesgo reconstruido de Allianz auto da 422 con la etiqueta de la compañía', () => {
  const d = probar(rec(coche()), [])
  assert.ok(!d.ok && d.status === 422)
  if (!d.ok) assert.ok(d.errores?.some((e) => /compañía actual del vehículo/.test(e)), JSON.stringify(d.errores))
})
test('UNA póliza de auto en vigor → se rellena companiaAnterior y valida', () => {
  const d = probar(rec(coche()), [pol()])
  assert.ok(d.ok, JSON.stringify(d))
  if (d.ok) assert.equal((d.entrada.riesgo as Record<string, unknown>).companiaAnterior, 'Aseguradora Beta')
})
test('CERO pólizas de auto en vigor (otro ramo, cancelada, histórico) → sigue 422', () => {
  for (const polizas of [[], [pol({ tipo: 'hogar' }), pol({ estado: 'cancelada' }), pol({ importRef: 'volcado-1' })]]) {
    const d = probar(rec(coche()), polizas)
    assert.ok(!d.ok && d.status === 422 && d.motivo === 'riesgo_incompleto')
  }
})
test('DOS pólizas de auto en vigor → no se elige: sigue 422', () => {
  const d = probar(rec(coche()), [pol(), pol({ aseguradora: 'Aseguradora Gamma', fechaEfecto: '2026-05-05' })])
  assert.ok(!d.ok && d.status === 422)
})
test('lo que el riesgo ya trae no se pisa; una póliza sin nombre útil no rellena', () => {
  const ya = { ...coche(), companiaAnterior: 'Aseguradora Alfa' }
  const d = probar(rec(ya), [pol()])
  assert.ok(d.ok)
  if (d.ok) assert.equal((d.entrada.riesgo as Record<string, unknown>).companiaAnterior, 'Aseguradora Alfa')
  assert.equal(companiaActualUnica(null, [pol({ aseguradora: 'otro' })]), null)
})
test('sin reconstrucción (riesgo null) no se toca', () => {
  const r: ReconstruccionRiesgo = { riesgo: null, motivo: 'sin_oportunidad' }
  assert.equal(conCompaniaActualUnica(r, 'allianz', 'auto', 'Aseguradora Beta'), r)
})
test('cableado: la ruta lee la compañía única y la aplica ANTES de decidir; la purga no se toca', () => {
  const ruta = readFileSync(join(import.meta.dirname, '..', 'app/api/operador/tarificador/probar/route.ts'), 'utf8')
  assert.match(ruta, /leerCompaniaActualUnicaCliente\(/)
  assert.ok(ruta.indexOf('conCompaniaActualUnica(') < ruta.indexOf('decidirRiesgoProbar('))
})
