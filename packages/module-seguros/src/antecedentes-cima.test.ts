// Cepos de los antecedentes de CIMA (07/11/2026). Fechas RELATIVAS a un `hoy` inyectado, nunca fijas contra el reloj.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { siniestrosConCulpaCima, esSiniestroDeAsistenciaCima, inicioVentanaAntecedentes, type FilaSiniestroCima } from './antecedentes-cima.ts'

const HOY = new Date(Date.UTC(2030, 5, 15)) // arbitrario: todo se calcula relativo a él
const hace = (dias: number): string => new Date(HOY.getTime() - dias * 86_400_000).toISOString()
const fila = (c: Partial<FilaSiniestroCima> = {}): FilaSiniestroCima => ({
  idSiniestroEntidad: 'S1', codigoEntidadDgs: 'C0001', posicionCima: 'CU', responsabilidadCima: 'CAUSANTE', fechaHora: hace(100), ...c,
})

test('sin filas: 0 (revisado, ninguno)', () => assert.equal(siniestrosConCulpaCima([], HOY), 0))

test('un siniestro con culpa dentro de 5 años cuenta 1', () => assert.equal(siniestrosConCulpaCima([fila()], HOY), 1))

test('la misma referencia en varias filas (varios contrarios) es UN siniestro', () => {
  assert.equal(siniestrosConCulpaCima([fila(), fila({ fechaHora: hace(101) }), fila({ idSiniestroEntidad: null, referencia: 's1' })], HOY), 1)
})

test('referencias distintas suman; la misma referencia de OTRA entidad es otro siniestro', () => {
  assert.equal(siniestrosConCulpaCima([fila(), fila({ idSiniestroEntidad: 'S2' }), fila({ codigoEntidadDgs: 'C0002' })], HOY), 3)
})

test('la referencia se compara sin espacios ni mayúsculas, y el respaldo es `referencia`', () => {
  assert.equal(siniestrosConCulpaCima([fila({ idSiniestroEntidad: ' ab1 ' }), fila({ idSiniestroEntidad: null, referencia: 'AB1' })], HOY), 1)
})

test('ventana: el día de corte entra, el anterior no (un CU antiguo no cuenta)', () => {
  const corte = inicioVentanaAntecedentes(HOY)
  assert.equal(corte, `${HOY.getUTCFullYear() - 5}-06-15`)
  const antes = new Date(`${corte}T00:00:00Z`)
  antes.setUTCDate(antes.getUTCDate() - 1)
  assert.equal(siniestrosConCulpaCima([fila({ fechaHora: `${corte}T10:00:00Z` })], HOY), 1)
  assert.equal(siniestrosConCulpaCima([fila({ fechaHora: antes.toISOString() })], HOY), 0)
  assert.equal(siniestrosConCulpaCima([fila({ fechaHora: hace(365 * 8) }), fila({ idSiniestroEntidad: 'S9', fechaHora: hace(10) })], HOY), 1)
})

test('un siniestro antiguo IN/NULL no hace dudar: fuera de la ventana no cuenta', () => {
  assert.equal(siniestrosConCulpaCima([fila({ posicionCima: 'IN', responsabilidadCima: null, fechaHora: hace(365 * 8) })], HOY), 0)
})

test('IN / NA / NULL de posición dentro de la ventana: null (pendiente), no 0', () => {
  for (const posicionCima of ['IN', 'NA', null, '']) {
    assert.equal(siniestrosConCulpaCima([fila({ posicionCima, responsabilidadCima: null })], HOY), null, String(posicionCima))
  }
})

test('posición NULL pero responsabilidad CAUSANTE: culpa probada', () => {
  assert.equal(siniestrosConCulpaCima([fila({ posicionCima: null })], HOY), 1)
})

test('RE (perjudicado) no es culpa: 0', () => {
  assert.equal(siniestrosConCulpaCima([fila({ posicionCima: 'RE', responsabilidadCima: 'PERJUDICADO' })], HOY), 0)
})

test('sin fecha de ocurrencia o sin referencia dentro de la ventana: null; dos sin referencia no se funden', () => {
  assert.equal(siniestrosConCulpaCima([fila({ fechaHora: null })], HOY), null)
  assert.equal(siniestrosConCulpaCima([fila({ idSiniestroEntidad: null, referencia: ' ' })], HOY), null)
  assert.equal(siniestrosConCulpaCima([fila({ idSiniestroEntidad: null }), fila({ idSiniestroEntidad: null })], HOY), null)
})

test('en una misma referencia manda la culpa probada sobre lo incierto', () => {
  assert.equal(siniestrosConCulpaCima([fila({ posicionCima: 'IN', responsabilidadCima: null }), fila()], HOY), 1)
})

test('con culpa probada y otra fila incierta en el mismo cliente: null (no se afirma un número)', () => {
  assert.equal(siniestrosConCulpaCima([fila(), fila({ idSiniestroEntidad: 'S2', posicionCima: 'NA', responsabilidadCima: null })], HOY), null)
})

test('asistencia (grupo 11 EIAC) no cuenta ni hace dudar; sin tipo o fuera de tabla se trata como normal', () => {
  for (const tipo of ['11', '1102', '1107', ' 1107 ']) {
    assert.equal(siniestrosConCulpaCima([fila({ tipo })], HOY), 0, tipo)
    assert.equal(siniestrosConCulpaCima([fila({ tipo, posicionCima: 'IN', responsabilidadCima: null, fechaHora: null })], HOY), 0, tipo)
  }
  for (const tipo of [null, '', '10', '1115', '1501', '110']) assert.equal(esSiniestroDeAsistenciaCima(tipo), false, String(tipo))
  assert.equal(siniestrosConCulpaCima([fila({ tipo: '1107' }), fila({ idSiniestroEntidad: 'S2', tipo: '10' }), fila({ idSiniestroEntidad: 'S3', tipo: null })], HOY), 2)
})
