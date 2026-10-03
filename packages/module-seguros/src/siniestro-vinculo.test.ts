import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cambiosDeFusion,
  conocidoPorCompania,
  diasEntre,
  emparejarManualConCima,
  emparejarParte,
  fusionesAutomaticas,
  normalizarNumeroSiniestro,
  vinculosAutomaticos,
  type CamposCorredor,
  type SiniestroCandidato,
} from './siniestro-vinculo.ts'

const sin = (id: string, x: Partial<SiniestroCandidato> = {}): SiniestroCandidato => ({
  id, polizaId: 'p1', fechaHora: '2026-09-10T10:00:00Z', origen: 'cima', idSiniestroEntidad: null, referencia: null, tipo: 'robo', ...x,
})
const parte = (id: string, fechaHecho = '2026-09-10', polizaId: string | null = 'p1') => ({ id, polizaId, fechaHecho })

test('vínculo: diasEntre cuenta días naturales y no inventa con una fecha que falta', () => {
  assert.equal(diasEntre('2026-09-10', '2026-09-13T23:00:00Z'), 3)
  assert.equal(diasEntre('2026-09-10', null), null)
})

test('vínculo: nº de siniestro sin ceros delante ni separadores (Allianz)', () => {
  assert.equal(normalizarNumeroSiniestro('061048939'), '61048939')
  assert.equal(normalizarNumeroSiniestro(' 26/sn-0001 '), '26SN0001')
  assert.equal(normalizarNumeroSiniestro('000'), null)
  assert.equal(normalizarNumeroSiniestro(''), null)
  assert.equal(normalizarNumeroSiniestro(null), null)
})

test('parte: fuerte = misma póliza + ±3 días + un único candidato', () => {
  assert.deepEqual(emparejarParte(parte('a', '2026-09-07'), [sin('s1')]), { tipo: 'fuerte', siniestroId: 's1' })
})

test('parte: a 4 días ya no es candidato; otra póliza tampoco', () => {
  assert.deepEqual(emparejarParte(parte('a', '2026-09-06'), [sin('s1')]), { tipo: 'ninguno' })
  assert.deepEqual(emparejarParte(parte('a'), [sin('s1', { polizaId: 'p2' })]), { tipo: 'ninguno' })
  assert.deepEqual(emparejarParte(parte('a', '2026-09-10', null), [sin('s1')]), { tipo: 'ninguno' })
})

test('parte: dos candidatos en la ventana = ambiguo, nunca se elige uno', () => {
  const r = emparejarParte(parte('a'), [sin('s1'), sin('s2', { fechaHora: '2026-09-12T00:00:00Z' })])
  assert.deepEqual(r, { tipo: 'ambiguo', candidatos: ['s1', 's2'] })
})

test('parte: un siniestro de la póliza SIN fecha no se descarta (podría ser): vuelve ambiguo', () => {
  assert.deepEqual(emparejarParte(parte('a'), [sin('s1'), sin('s2', { fechaHora: null })]), { tipo: 'ambiguo', candidatos: ['s1', 's2'] })
  // Y él solo tampoco es fuerte: sin fecha no se afirma nada.
  assert.deepEqual(emparejarParte(parte('a'), [sin('s2', { fechaHora: null })]), { tipo: 'ambiguo', candidatos: ['s2'] })
})

test('automático: solo fuertes, destino CIMA, sin otro parte reclamándolo ni ya vinculado', () => {
  const s = [sin('s1'), sin('s2', { polizaId: 'p2' }), sin('m1', { polizaId: 'p3', origen: 'gestionado_correduria' }), sin('s4', { polizaId: 'p4' })]
  const r = vinculosAutomaticos(
    [parte('a'), parte('b', '2026-09-11', 'p2'), parte('c', '2026-09-12', 'p2'), parte('d', '2026-09-10', 'p3'), parte('e', '2026-09-10', 'p4')],
    s,
    new Set(['s4']),
  )
  // b y c reclaman s2 → ninguno; d apunta a un alta manual → sugerencia; s4 ya tiene parte.
  assert.deepEqual(r, [{ parteId: 'a', siniestroId: 's1' }])
})

test('manual↔CIMA: mismo nº (con ceros de Allianz) es fuerte aunque la fecha no case', () => {
  const m = sin('m', { origen: 'gestionado_correduria', referencia: '61048939', fechaHora: '2026-08-01T00:00:00Z' })
  const r = emparejarManualConCima(m, [sin('c1', { idSiniestroEntidad: '061048939' }), sin('c2', { fechaHora: '2026-08-01T00:00:00Z' })])
  assert.deepEqual(r, { tipo: 'fuerte', siniestroId: 'c1' })
})

test('manual↔CIMA: sin nº, póliza + fecha única es fuerte; dos en la ventana, ambiguo', () => {
  const m = sin('m', { origen: 'gestionado_correduria' })
  assert.deepEqual(emparejarManualConCima(m, [sin('c1', { fechaHora: '2026-09-12T00:00:00Z' })]), { tipo: 'fuerte', siniestroId: 'c1' })
  assert.equal(emparejarManualConCima(m, [sin('c1'), sin('c2')]).tipo, 'ambiguo')
})

test('manual↔CIMA: un nº DISTINTO del nuestro es otro siniestro, aunque la fecha case', () => {
  const m = sin('m', { origen: 'gestionado_correduria', referencia: 'AAA1' })
  assert.deepEqual(emparejarManualConCima(m, [sin('c1', { idSiniestroEntidad: 'BBB2' })]), { tipo: 'ninguno' })
})

test('manual↔CIMA: un alta manual sin fecha y sin nº no se empareja', () => {
  const m = sin('m', { origen: 'gestionado_correduria', fechaHora: null })
  assert.deepEqual(emparejarManualConCima(m, [sin('c1')]), { tipo: 'ninguno' })
})

test('fusiones: dos altas manuales sobre el mismo de CIMA → ninguna se fusiona', () => {
  const m1 = sin('m1', { origen: 'gestionado_correduria' })
  const m2 = sin('m2', { origen: 'gestionado_correduria', fechaHora: '2026-09-11T00:00:00Z' })
  assert.deepEqual(fusionesAutomaticas([m1, m2], [sin('c1')]), [])
  assert.deepEqual(fusionesAutomaticas([m1], [sin('c1')]), [{ manualId: 'm1', cimaId: 'c1' }])
})

const vacios: CamposCorredor = {
  referencia: null, comentario: null, tramitadorNombre: null, tramitadorTelefono: null, tramitadorEmail: null,
  peritoNombre: null, peritoTelefono: null, peritoEmail: null, gravedad: null, reservaImporte: null,
  indemnizacionImporte: null, seConsideraCulpable: null, datosRamo: null, fechaDeclaracion: null,
}

test('fusión: conserva el nº y las notas del alta manual; lo que ya tiene CIMA gana', () => {
  const cima = { ...vacios, comentario: '[01/10/2026] llamó el perito', peritoNombre: 'Perito CIMA' }
  const manual = { ...vacios, referencia: 'SN-1', comentario: 'Golpe en el parking', peritoNombre: 'Otro', reservaImporte: 0, fechaDeclaracion: '2026-09-11' }
  const c = cambiosDeFusion(cima, manual, new Date('2026-10-03T00:00:00Z'), '10/09/2026')
  assert.equal(c.referencia, 'SN-1')
  assert.equal(c.peritoNombre, undefined, 'el perito que ya tenía el de CIMA no se pisa')
  assert.equal(c.reservaImporte, 0, 'un 0 anotado es un dato, no un hueco')
  assert.equal(c.fechaDeclaracion, '2026-09-11')
  assert.equal(c.comentario, '[01/10/2026] llamó el perito\nGolpe en el parking\n[03/10/2026] Unido al siniestro de la compañía (CIMA): venía de un alta manual del 10/09/2026 con nº SN-1.')
})

test('fusión: nunca devuelve campos de la compañía (estado, tipo, fecha, lugar)', () => {
  const c = cambiosDeFusion(vacios, { ...vacios, referencia: 'X' }) as Record<string, unknown>
  for (const k of ['estado', 'tipo', 'fechaHora', 'lugarCp', 'lugarCiudad', 'origen']) assert.equal(k in c, false, k)
})

test('comunicado: solo CIMA o un nº de la compañía autorizan «abierto en la compañía»', () => {
  assert.equal(conocidoPorCompania({ origen: 'cima', idSiniestroEntidad: null, referencia: null }), true)
  assert.equal(conocidoPorCompania({ origen: 'gestionado_correduria', idSiniestroEntidad: null, referencia: 'SN-1' }), true)
  assert.equal(conocidoPorCompania({ origen: 'gestionado_correduria', idSiniestroEntidad: null, referencia: '  ' }), false)
  assert.equal(conocidoPorCompania({ origen: 'gestionado_correduria', idSiniestroEntidad: null, referencia: null }), false)
})

test('manual↔CIMA sin nº en ninguno: mismo tipo → fuerte; tipo desconocido → solo ambiguo; tipo distinto → ninguno', () => {
  const m = sin('m', { origen: 'gestionado_correduria', tipo: 'robo' })
  assert.deepEqual(emparejarManualConCima(m, [sin('c1', { tipo: 'ROBO ' })]), { tipo: 'fuerte', siniestroId: 'c1' })
  assert.deepEqual(emparejarManualConCima(m, [sin('c1', { tipo: null })]), { tipo: 'ambiguo', candidatos: ['c1'] })
  assert.deepEqual(emparejarManualConCima({ ...m, tipo: null }, [sin('c1')]), { tipo: 'ambiguo', candidatos: ['c1'] })
  assert.deepEqual(emparejarManualConCima(m, [sin('c1', { tipo: 'agua' })]), { tipo: 'ninguno' })
  assert.deepEqual(fusionesAutomaticas([{ ...m, tipo: null }], [sin('c1')]), [])
  // con nº coincidente el tipo no se exige
  const mn = sin('m', { origen: 'gestionado_correduria', tipo: null, referencia: '61048939' })
  assert.deepEqual(emparejarManualConCima(mn, [sin('c1', { idSiniestroEntidad: '061048939', tipo: null })]), { tipo: 'fuerte', siniestroId: 'c1' })
})
