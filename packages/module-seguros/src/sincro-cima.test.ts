import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compararConCima, esPolizaDeCoche, huellaDecisionCima, fechaCima, fechaIsoFlexible, mismoValorNormalizado, motivoCopiadoCima, type FichaParaCima, type DatosCima } from './sincro-cima.ts'

const vacia: FichaParaCima = { nombre: 'Pablo Guzman Lozano', fechaNacimiento: null, fechaNacimientoIlegible: false, carnets: [], telefonos: [], emails: [] }
const cima: DatosCima = { nombre: 'PABLO GUZMÁN LOZANO', fechaNacimiento: '1980-03-04', fechaCarnet: '1999-01-02', telefonos: ['+34 600 11 22 33'], emails: ['Pablo@Ej.es'] }

test('ficha vacía → todo se RELLENA; el nombre igual (tildes/mayúsculas) no es diferencia', () => {
  const d = compararConCima(vacia, cima)
  assert.deepEqual(d.map((x) => `${x.campo}:${x.accion}`), ['fechaNacimiento:rellenar', 'fechaCarnet:rellenar', 'telefono:rellenar', 'email:rellenar'])
})

test('datos distintos → DISCREPA con los dos valores; los iguales no salen', () => {
  const f: FichaParaCima = { nombre: 'Juan Perez', fechaNacimiento: '1980-03-04', fechaNacimientoIlegible: false, carnets: ['2001-05-05'], telefonos: ['611223344', '600112233'], emails: ['otro@ej.es'] }
  const d = compararConCima(f, cima)
  assert.deepEqual(d.map((x) => `${x.campo}:${x.accion}`), ['nombre:discrepa', 'fechaCarnet:discrepa', 'email:anadir'])
  assert.equal(d[0].ficha, 'Juan Perez')
  assert.equal(d[2].cima, 'Pablo@Ej.es')
})

test('lo ilegible o no leído NO es un hueco: nunca se rellena encima', () => {
  const f: FichaParaCima = { nombre: null, fechaNacimiento: null, fechaNacimientoIlegible: true, carnets: [null], telefonos: null, emails: null }
  const d = compararConCima(f, cima)
  assert.deepEqual(d.map((x) => x.campo), ['nombre'])
})

test('CIMA sin datos → nada que hacer', () => {
  assert.deepEqual(compararConCima(vacia, { nombre: null, fechaNacimiento: null, fechaCarnet: null, telefonos: [], emails: [] }), [])
})

test('el orden de palabras del nombre no es una discrepancia', () => {
  assert.deepEqual(compararConCima({ ...vacia, nombre: 'Guzman Lozano, Pablo' }, { ...cima, fechaNacimiento: null, fechaCarnet: null, telefonos: [], emails: [] }), [])
})

test('huella: el mismo teléfono escrito distinto da la misma huella; otro valor, otra', () => {
  assert.equal(huellaDecisionCima('telefono', '+34 600 11 22 33'), huellaDecisionCima('telefono', '600112233'))
  assert.notEqual(huellaDecisionCima('telefono', '600112233'), huellaDecisionCima('telefono', '600112234'))
  assert.equal(fechaCima('04/03/1980'), '1980-03-04')
})

test('una fecha de nacimiento guardada en formato raro NO es un hueco: discrepa, no se pisa sola', () => {
  const d = compararConCima({ ...vacia, fechaNacimiento: '4 de marzo del 80' }, { ...cima, fechaCarnet: null, telefonos: [], emails: [] })
  assert.deepEqual(d.map((x) => `${x.campo}:${x.accion}:${x.ficha}`), ['fechaNacimiento:discrepa:4 de marzo del 80'])
})

// ─── Reglas del 26/09/2026 (Alberto, sobre el panel de diferencias) ──────────
const soloNombre = { ...cima, fechaNacimiento: null, fechaCarnet: null, telefonos: [], emails: [] }

test('teléfono distinto → se AÑADE (no pregunta); el que ya está en la ficha no sale', () => {
  const d = compararConCima({ ...vacia, telefonos: ['666252020'] }, { ...soloNombre, telefonos: ['954172716'] })
  assert.deepEqual(d.map((x) => `${x.campo}:${x.accion}:${x.cima}`), ['telefono:anadir:954172716'])
})

test('email distinto de CIMA → se AÑADE como segundo email, sin preguntar', () => {
  const d = compararConCima({ ...vacia, emails: ['alfredo.pont@phh.es'] }, { ...soloNombre, emails: ['apontdelgadodecos@gmail.com'] })
  assert.deepEqual(d.map((x) => `${x.campo}:${x.accion}:${x.cima}`), ['email:anadir:apontdelgadodecos@gmail.com'])
})

test('a CIMA le falta un nombre que la ficha tiene → no es diferencia (la ficha está más completa)', () => {
  assert.deepEqual(compararConCima({ ...vacia, nombre: 'Alfonso Carlos Moncosi Gomez' }, { ...soloNombre, nombre: 'ALFONSO MONCOSI GOMEZ' }), [])
  // Una sola palabra no basta para decir que es la misma persona.
  assert.deepEqual(compararConCima({ ...vacia, nombre: 'Alfonso Carlos Moncosi Gomez' }, { ...soloNombre, nombre: 'ALFONSO' }).map((x) => x.accion), ['discrepa'])
})

test('mismo nombre con la ficha en MAYÚSCULAS → formatear a «Nombre Propio»; una grafía elegida se respeta', () => {
  const d = compararConCima({ ...vacia, nombre: 'ALFREDO LUIS PONT DELGADO DE COS' }, { ...soloNombre, nombre: 'Alfredo Luis Pont Delgado de Cos' })
  assert.deepEqual(d.map((x) => `${x.accion}:${x.cima}`), ['formatear:Alfredo Luis Pont Delgado de Cos'])
  assert.deepEqual(compararConCima({ ...vacia, nombre: 'Ronald McDonald Pérez' }, { ...soloNombre, nombre: 'RONALD MCDONALD PEREZ' }), [])
})

test('nombre que CIMA rellena o que discrepa sale en «Nombre Propio», no en mayúsculas', () => {
  assert.equal(compararConCima({ ...vacia, nombre: null }, { ...soloNombre, nombre: 'JOSÉ MARÍA GARCÍA-LÓPEZ DE LA TORRE' })[0].cima, 'José María García-López de la Torre')
})

test('la fecha del carné que se va UN día no es diferencia; dos días sí', () => {
  const f = { ...vacia, carnets: ['1999-01-01'] }
  assert.deepEqual(compararConCima(f, { ...soloNombre, fechaCarnet: '1999-01-02' }), [])
  assert.deepEqual(compararConCima(f, { ...soloNombre, fechaCarnet: '1999-01-03' }).map((x) => `${x.campo}:${x.accion}`), ['fechaCarnet:discrepa'])
})

test('CIMA dice MÁS que la ficha y la contiene → completar con lo de CIMA, sin preguntar', () => {
  const d = compararConCima({ ...vacia, nombre: 'Maria Gonzalez' }, { ...soloNombre, nombre: 'M CARMEN BAENA GONZALEZ' })
  assert.deepEqual(d.map((x) => `${x.accion}:${x.cima}`), ['completar:M Carmen Baena Gonzalez'])
  // La inicial de la ficha frente a la palabra entera también es «CIMA dice más».
  assert.deepEqual(compararConCima({ ...vacia, nombre: 'J Perez Lopez' }, { ...soloNombre, nombre: 'JUAN PEREZ LOPEZ' }).map((x) => x.accion), ['completar'])
  // Si no la contiene, sigue siendo una discrepancia de verdad.
  assert.deepEqual(compararConCima({ ...vacia, nombre: 'Maria Gonzalez' }, { ...soloNombre, nombre: 'CARMEN BAENA RUIZ' }).map((x) => x.accion), ['discrepa'])
})

test('nombre con erratas y en minúsculas → corregir con el de CIMA, sin preguntar', () => {
  const d = compararConCima({ ...vacia, nombre: 'Berta del la fuentes rojas' }, { ...soloNombre, nombre: 'BERTA DE LA FUENTE ROJAS' })
  assert.deepEqual(d.map((x) => `${x.accion}:${x.cima}`), ['corregir:Berta de la Fuente Rojas'])
  assert.deepEqual(compararConCima({ ...vacia, nombre: 'Juan Peres' }, { ...soloNombre, nombre: 'Juan Perez' }).map((x) => x.accion), ['corregir'])
})

test('más de media palabra cambiada, otra persona o una inicial → SIGUE preguntando', () => {
  const acc = (f: string, c: string) => compararConCima({ ...vacia, nombre: f }, { ...soloNombre, nombre: c }).map((x) => x.accion)
  assert.deepEqual(acc('Maria Lopez', 'Mario Lopes'), ['discrepa'])
  assert.deepEqual(acc('Ana Ruiz Gil', 'Eva Ruiz Gil'), ['discrepa'])
  assert.deepEqual(acc('A Ruiz', 'B Ruiz'), ['discrepa'])
})

test('esPolizaDeCoche: la moto que CIMA manda como auto NO es del carné B (0007000000007, 28/09/2026)', () => {
  assert.equal(esPolizaDeCoche('auto', { riesgos: [{ categoriaVehiculo: 'TU', claseVehiculo: 'TU' }] }), true)
  assert.equal(esPolizaDeCoche('auto', { riesgos: [{ categoriaVehiculo: 'MO', claseVehiculo: 'MT' }] }), false)
  assert.equal(esPolizaDeCoche('auto', { riesgos: [{ claseVehiculo: 'MT' }] }), false)
  assert.equal(esPolizaDeCoche('auto', { claseVehiculo: 'CI' }), false)
  assert.equal(esPolizaDeCoche('moto', { riesgos: [{ categoriaVehiculo: 'TU' }] }), false)
  assert.equal(esPolizaDeCoche('auto', null), true)
})

// ─── Normalizar antes de declarar conflicto (03/10/2026) ─────────────────────
test('fechaIsoFlexible: cualquier orden y separador razonable → ISO; lo imposible, null', () => {
  for (const v of ['1980-03-04', '1980/03/04', '1980.3.4', '04/03/1980', '4-3-1980', '4.3.1980', '1980-03-04T00:00:00Z']) assert.equal(fechaIsoFlexible(v), '1980-03-04', v)
  for (const v of ['', '31/02/1980', '1980-13-01', 'ayer', '04/03/80']) assert.equal(fechaIsoFlexible(v), null, v)
  assert.equal(fechaIsoFlexible(null), null)
})

test('mismoValorNormalizado: nombre (conjunto de palabras), fecha, teléfono sin 34 y email', () => {
  assert.equal(mismoValorNormalizado('nombre', 'GÓMEZ  PÉREZ, JUAN', 'Juan Gomez Perez'), true)
  assert.equal(mismoValorNormalizado('nombre', 'Juan Gomez', 'Juan Gomez Perez'), false)
  assert.equal(mismoValorNormalizado('fechaNacimiento', '1980/3/4', '04-03-1980'), true)
  assert.equal(mismoValorNormalizado('fechaNacimiento', '1980/3/4', '1980-03-05'), false)
  assert.equal(mismoValorNormalizado('telefono', '+34 600-11.22.33', '600112233'), true)
  assert.equal(mismoValorNormalizado('telefono', '0034600112233', '(600) 112 233'), true)
  assert.equal(mismoValorNormalizado('telefono', '600112233', '600112234'), false)
  assert.equal(mismoValorNormalizado('email', '  Pablo@Ej.es ', 'pablo@ej.es'), true)
  assert.equal(mismoValorNormalizado('email', 'a@ej.es', 'b@ej.es'), false)
  assert.equal(mismoValorNormalizado('email', '', ''), false)
})

test('fecha de nacimiento con la misma fecha en otro formato: NO discrepa; se copia con motivo «formato»', () => {
  const d = compararConCima({ ...vacia, fechaNacimiento: '1980/03/04' }, { ...cima, fechaCarnet: null, telefonos: [], emails: [] })
  assert.deepEqual(d.map((x) => `${x.campo}:${x.accion}:${x.cima}`), ['fechaNacimiento:normalizar:1980-03-04'])
  assert.equal(motivoCopiadoCima('normalizar'), 'formato')
  // Otra fecha de verdad sigue siendo conflicto.
  const otra = compararConCima({ ...vacia, fechaNacimiento: '1980/03/05' }, { ...cima, fechaCarnet: null, telefonos: [], emails: [] })
  assert.deepEqual(otra.map((x) => `${x.campo}:${x.accion}`), ['fechaNacimiento:discrepa'])
})

test('carné con un único B en otro formato → normalizar; con dos B no se adivina cuál: discrepa', () => {
  const sin = { ...cima, fechaNacimiento: null, telefonos: [], emails: [] }
  const uno = compararConCima({ ...vacia, carnets: ['1999/1/2'] }, sin)
  assert.deepEqual(uno.map((x) => `${x.campo}:${x.accion}`), ['fechaCarnet:normalizar'])
  const dos = compararConCima({ ...vacia, carnets: ['1999/1/2', '2005-05-05'] }, sin)
  assert.deepEqual(dos.map((x) => `${x.campo}:${x.accion}`), ['fechaCarnet:discrepa'])
})

test('teléfono y email con otro formato no son diferencia; motivos de lo copiado', () => {
  const f = { ...vacia, telefonos: ['600 11 22 33'], emails: [' PABLO@EJ.ES '] }
  assert.deepEqual(compararConCima(f, { ...cima, fechaNacimiento: null, fechaCarnet: null }), [])
  assert.deepEqual(
    (['rellenar', 'anadir', 'completar', 'formatear', 'corregir', 'normalizar'] as const).map(motivoCopiadoCima),
    ['hueco', 'nuevo', 'mas_completo', 'formato', 'errata', 'formato'],
  )
  assert.equal(motivoCopiadoCima('discrepa'), null)
})
