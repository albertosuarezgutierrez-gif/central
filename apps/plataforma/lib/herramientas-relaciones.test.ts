import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rolSugerido, sugerirMiembros, cambioDeRelacion, relacionesLeidas, type RelacionLeida } from './herramientas-relaciones.ts'

const R = (tipo: string, extra: Partial<RelacionLeida> = {}): RelacionLeida => ({ relacionadoId: `id-${tipo}`, nombre: `N ${tipo}`, tipo, tipoPersona: 'fisica', ...extra })

test('mapeo: dueño → dueno · socio/accionista → consulta · administración → admin · empleado → empleado', () => {
  assert.equal(rolSugerido(R('Dueño')).rol, 'dueno')
  assert.equal(rolSugerido(R('Socio/a')).rol, 'consulta')
  assert.equal(rolSugerido(R('Accionista')).rol, 'consulta')
  assert.equal(rolSugerido(R('Administración')).rol, 'admin')
  assert.equal(rolSugerido(R('Empleado/a')).rol, 'empleado')
})

test('CEPO el parentesco NO implica rol (ni un hermano ni un cónyuge)', () => {
  for (const t of ['Hermano/a', 'Cónyuge/Pareja de Hecho', 'Padre/Madre', 'Otra', 'Sin vínculo']) assert.equal(rolSugerido(R(t)).rol, null, t)
})

test('el título de representación manda: administrador/apoderado → firma', () => {
  assert.equal(rolSugerido(R('Administración', { titulo: 'administrador' })).rol, 'dueno')
  assert.equal(rolSugerido(R('Empleado/a', { titulo: 'apoderado' })).rol, 'dueno')
  assert.equal(rolSugerido(R('Empleado/a', { titulo: 'empleado_autorizado' })).rol, 'admin')
  assert.equal(rolSugerido(R('Dueño', { tipoPersona: 'juridica' })).rol, null, 'una sociedad no es miembro')
})

test('sugerencias ordenadas y con origen; null (no se pudo leer) ≠ [] (no hay)', () => {
  assert.equal(sugerirMiembros('c1', null), null)
  assert.deepEqual(sugerirMiembros('c1', []), [])
  const s = sugerirMiembros('c1', [R('Administración'), R('Hermano/a'), R('Socio/a'), R('Dueño')])!
  assert.deepEqual(s.map((x) => x.rol), ['dueno', 'consulta', 'admin', null])
  assert.deepEqual(s[0].origen, { fuente: 'relacion_correduria', cliente_id: 'c1', relacionado_id: 'id-Dueño', tipo: 'Dueño', titulo: null })
})

test('cambio de relación: avisa, nunca decide; sin lectura = no se sabe', () => {
  const origen = { fuente: 'relacion_correduria', cliente_id: 'c1', relacionado_id: 'id-x', tipo: 'Administración', titulo: null }
  assert.deepEqual(cambioDeRelacion(origen, [{ relacionadoId: 'id-x', nombre: 'X', tipo: 'Administración', tipoPersona: 'fisica' }]), { estado: 'igual' })
  assert.deepEqual(cambioDeRelacion(origen, [{ relacionadoId: 'id-x', nombre: 'X', tipo: 'Socio/a', tipoPersona: 'fisica' }]),
    { estado: 'cambio', antes: 'Administración', ahora: 'Socio/a', rolSugerido: 'consulta' })
  assert.deepEqual(cambioDeRelacion(origen, []), { estado: 'desaparecida' })
  assert.deepEqual(cambioDeRelacion(origen, null), { estado: 'no_se_sabe' })
  assert.equal(cambioDeRelacion({ fuente: 'semilla' }, []), null, 'un origen manual/semilla no se compara')
})

test('lectura del puerto: filas raras se saltan; una no-lista es null', () => {
  assert.equal(relacionesLeidas({}), null)
  assert.deepEqual(relacionesLeidas([{ relacionadoId: 'a', tipo: 'Socio/a', nombre: 'A', tipoPersona: 'fisica', autorizacion: { tituloRepresentacion: 'apoderado' } }, { x: 1 }]),
    [{ relacionadoId: 'a', nombre: 'A', tipo: 'Socio/a', tipoPersona: 'fisica', titulo: 'apoderado' }])
})
