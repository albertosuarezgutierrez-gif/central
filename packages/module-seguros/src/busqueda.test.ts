import test from 'node:test'
import assert from 'node:assert/strict'
import { avisoDireccion, direccionCoincide, explicarVacio, normalizarDireccion, planBusqueda } from './busqueda.ts'

const tipos = (t: string) => planBusqueda(t).criterios.map((c) => c.tipo).sort()

test('una matrícula se reconoce en los dos formatos vivos', () => {
  assert.ok(tipos('1234BCD').includes('matricula'))
  assert.ok(tipos('1234 BCD').includes('matricula'))
  assert.ok(tipos('se-1234-ab').includes('matricula'))
  // Las vocales no existen en el alfabeto nuevo: eso NO es una matrícula.
  assert.ok(!tipos('1234AEI').includes('matricula'))
})

test('DNI, NIE y CIF van por índice ciego y son EXACTOS', () => {
  const p = planBusqueda('12345678Z')
  const dni = p.criterios.find((c) => c.tipo === 'dni')
  assert.equal(dni?.coincidencia, 'exacto')
  assert.equal(dni?.valor, '12345678Z')
  assert.ok(tipos('x-1234567-l').includes('dni'))
  assert.ok(tipos('B12345674').includes('dni'))
  // Un fragmento NO es un DNI: el índice ciego no casa por trozos.
  assert.ok(!tipos('1234567').includes('dni'))
})

test('🚨 un código postal NO se traga solo como número de póliza', () => {
  // Si «41003» fuera solo póliza, buscar el CP de San Julián daría vacío y la
  // pantalla diría «no hay nadie» sobre cientos de clientes.
  const t = tipos('41003')
  assert.ok(t.includes('codigo_postal'))
  assert.ok(t.includes('poliza'), 'y también se busca como póliza: no se adivina cuál quería')
  assert.ok(t.includes('riesgo'), 'y como CP del RIESGO: la casa de la playa no está en la ficha')
})

test('un teléfono necesita sus 9 dígitos y un término que sea SOLO número', () => {
  assert.ok(tipos('600123456').includes('telefono'))
  assert.ok(tipos('+34 600 12 34 56').includes('telefono'))
  // 6 dígitos sueltos no son un teléfono: los tiene cualquier nº de póliza.
  assert.ok(!tipos('123456').includes('telefono'))
  // Y un texto con dígitos tampoco.
  assert.ok(!tipos('poliza 600123456').includes('telefono'))
})

test('el email se reconoce entero, no por el arroba suelto', () => {
  assert.ok(tipos('jose@gmail.com').includes('email'))
  assert.ok(!tipos('jose@').includes('email'))
})

test('el texto busca nombre, calle, y ciudad/riesgo solo si no lleva dígitos', () => {
  assert.deepEqual(tipos('suarez'), ['ciudad', 'direccion', 'nombre', 'riesgo'])
  // Con dígitos ya no es una ciudad; sigue siendo nombre, calle y póliza.
  assert.deepEqual(tipos('A-12345'), ['direccion', 'nombre', 'poliza'])
  // «san vicente 40» lleva dígitos y ES una calle: la dirección no se excluye.
  assert.ok(tipos('san vicente 40').includes('direccion'))
  // Un email no es una calle.
  assert.ok(!tipos('jose@gmail.com').includes('direccion'))
})

test('🚨 un término corto NO es «no hay resultados»', () => {
  const p = planBusqueda('jo')
  assert.equal(p.buscable, false)
  assert.deepEqual(p.criterios, [])
  assert.equal(planBusqueda('   ').buscable, false)
})

test('la calle sin clave se declara NO MIRADA y ofrece lo que sí funciona', () => {
  const a = avisoDireccion(170)
  assert.equal(a.tema, 'direccion')
  assert.match(a.texto, /170 direcciones/)
  assert.match(a.texto, /NO se ha mirado/)
  assert.match(a.texto, /localidad|código postal/)
  assert.match(avisoDireccion().texto, /las direcciones/)
})

test('la calle se compara sin acentos, sin signos y sin la sigla de vía', () => {
  assert.equal(normalizarDireccion('CL SAN VICENTE, 40 2º-14'), 'CL SAN VICENTE 40 2 14')
  assert.ok(direccionCoincide('CL SAN VICENTE, 40 2º-14', 'san vicente 40'))
  assert.ok(direccionCoincide('Avda. de la Constitución, 3', 'constitucion'))
  assert.ok(!direccionCoincide('CL SAN VICENTE, 40', 'san jacinto'))
  // Un término vacío no coincide con todo.
  assert.ok(!direccionCoincide('CL SAN VICENTE, 40', ' , '))
})

test('🚨 cero calles descifradas NO se pinta como «nadie vive ahí»', () => {
  const txt = explicarVacio('direccion', { alcanzables: 0, total: 170 })
  assert.match(txt, /no se ha podido descifrar ninguna/)
  assert.doesNotMatch(txt, /toda la cartera/)
  assert.match(explicarVacio('riesgo', { alcanzables: 328, total: 28843 }), /CP del riesgo/)
})

test('🚨 un vacío por DNI dice que solo alcanza al 12%, no que no exista', () => {
  const txt = explicarVacio('dni', { alcanzables: 3904, total: 32600 })
  assert.match(txt, /12%/)
  assert.match(txt, /NO significa/)
  assert.match(txt, /apellido/)
})

test('cobertura total: se dice que se ha mirado entero', () => {
  assert.match(explicarVacio('nombre', { alcanzables: 32600, total: 32600 }), /toda la cartera/)
})

test('cobertura desconocida NO se pinta como cobertura total', () => {
  const txt = explicarVacio('dni', null)
  assert.match(txt, /no se ha podido comprobar/i)
  assert.doesNotMatch(txt, /toda la cartera/)
})
