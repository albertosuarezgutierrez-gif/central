import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizarTitular,
  cifParaBuscarFicha,
  fichaParaCotejar,
  etiquetaTitular,
  type TitularDeclarado,
} from './titular-declarado.ts'

test('🚨 «no se preguntó» NO es «es suya»', () => {
  // Todas las filas anteriores al 07/09/2026 tienen `titular_tipo` a null: nadie
  // les preguntó. Leerlo como `propio` convertiría un hueco en una afirmación
  // sobre de quién es una póliza — y de eso depende contra qué ficha se
  // comprueba si ya la lleva la casa.
  assert.equal(normalizarTitular({ tipo: null, nombre: null, cif: null }).tipo, 'sin_preguntar')
  assert.equal(normalizarTitular({ tipo: 'propio', nombre: null, cif: null }).tipo, 'propio')
})

test('🚨 «de mi empresa» SIN nombre no es una declaración de empresa', () => {
  // Es un hueco con forma de dato: aguas abajo se leería como «tiene empresa
  // identificada» y no lo está. Cae al estado que no afirma nada.
  assert.equal(normalizarTitular({ tipo: 'empresa', nombre: null, cif: null }).tipo, 'sin_preguntar')
  assert.equal(normalizarTitular({ tipo: 'empresa', nombre: '   ', cif: null }).tipo, 'sin_preguntar')
})

test('un tipo que no existe no se inventa', () => {
  assert.equal(normalizarTitular({ tipo: 'sociedad', nombre: 'X SL', cif: null }).tipo, 'sin_preguntar')
  assert.equal(normalizarTitular({ tipo: 42, nombre: null, cif: null }).tipo, 'sin_preguntar')
})

test('la empresa conserva nombre y CIF, sin separadores y en mayúsculas', () => {
  // El mismo CIF se escribe «B-91234567» y «B 91 234 567»; crudos son empresas
  // distintas, que es exactamente lo que el CIF venía a evitar.
  for (const escrito of [' b91234567 ', 'B-91234567', 'B 91 234 567', 'b.91234567']) {
    assert.deepEqual(
      normalizarTitular({ tipo: 'empresa', nombre: '  GLOBAL 2 SL  ', cif: escrito }),
      { tipo: 'empresa', nombre: 'GLOBAL 2 SL', cif: 'B91234567', cifValido: true },
      `no normaliza «${escrito}»`,
    )
  }
})

test('🚨 un CIF con el dígito de control MAL se guarda, pero no identifica', () => {
  // «Lo escribió mal» y «no lo dio» son cosas distintas y se arreglan distinto,
  // así que el texto se conserva. Lo que NO puede pasar es usarlo para buscar
  // la ficha: un CIF mal tecleado es un número plausible y equivocado, y con él
  // se funden dos empresas sin que nada falle.
  const t = normalizarTitular({ tipo: 'empresa', nombre: 'GLOBAL 2 SL', cif: 'B91234560' })
  assert.equal(t.cif, 'B91234560', 'se conserva lo que escribió')
  assert.equal(t.cifValido, false)
  assert.equal(cifParaBuscarFicha(t), null, 'no puede usarse para casarlo con una ficha')
})

test('sin CIF no se puede buscar ficha, y eso no es un error', () => {
  const t = normalizarTitular({ tipo: 'empresa', nombre: 'GLOBAL 2 SL', cif: '  ' })
  assert.deepEqual(t, { tipo: 'empresa', nombre: 'GLOBAL 2 SL', cif: null, cifValido: false })
  assert.equal(cifParaBuscarFicha(t), null)
})

test('🚨 el CIF de una declaración PROPIA nunca busca ficha de empresa', () => {
  // No ha dicho que sea de una empresa: buscar la ficha de una sociedad por un
  // CIF que viajó de rebote sería casarle una póliza con un tercero.
  //
  // 🪤 El objeto se construye A MANO y no con `normalizarTitular`, que ya vacía
  // el CIF cuando el tipo es `propio`. Pasando por él, este cepo se quedaba
  // VERDE aunque se borrara la comprobación del tipo — nunca llegaba a tocarla.
  // Se vio al romperla.
  assert.equal(
    cifParaBuscarFicha({ tipo: 'propio', nombre: null, cif: 'B91234567', cifValido: true }),
    null,
  )
  assert.equal(
    cifParaBuscarFicha({ tipo: 'sin_preguntar', nombre: null, cif: 'B91234567', cifValido: true }),
    null,
  )
  // Y el camino normal sigue vaciándolo, que es la primera barrera.
  assert.equal(normalizarTitular({ tipo: 'propio', nombre: 'X', cif: 'B91234567' }).cif, null)
})

test('con CIF válido, ese es el identificador con el que se busca', () => {
  const t = normalizarTitular({ tipo: 'empresa', nombre: 'GLOBAL 2 SL', cif: 'B91234567' })
  assert.equal(cifParaBuscarFicha(t), 'B91234567')
})

test('🚨 lo declarado DE UNA EMPRESA no se coteja contra la ficha personal', () => {
  // Es el fallo concreto que esto arregla: si se comprueba «¿ya la llevo yo?»
  // contra la ficha personal de quien la sube, una póliza que su SOCIEDAD ya
  // tiene contratada contigo sale como oportunidad — y le ofreces a un cliente
  // lo que ya le vendiste.
  assert.equal(fichaParaCotejar({ tipo: 'empresa', nombre: 'GLOBAL 2 SL', cif: null }, 'c1'), null)
  assert.equal(fichaParaCotejar({ tipo: 'propio', nombre: null, cif: null }, 'c1'), 'c1')
})

test('🚨 sin preguntar tampoco se coteja', () => {
  // No se sabe de quién es. Cotejar contra la ficha personal sería suponer que
  // es suya, que es justo lo que no consta.
  assert.equal(fichaParaCotejar({ tipo: 'sin_preguntar', nombre: null, cif: null }, 'c1'), null)
})

test('las etiquetas distinguen los tres estados', () => {
  assert.match(etiquetaTitular({ tipo: 'empresa', nombre: 'GLOBAL 2 SL', cif: null }), /GLOBAL 2 SL/)
  assert.match(etiquetaTitular({ tipo: 'propio', nombre: null, cif: null }), /suya|él|ella|persona/i)
  assert.match(etiquetaTitular({ tipo: 'sin_preguntar', nombre: null, cif: null }), /no.*pregunt/i)
})
