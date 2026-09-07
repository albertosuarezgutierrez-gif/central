// Cepo: la bóveda separa las pólizas POR TITULAR, y agrupa por identidad.
//
// ─── Qué protege ────────────────────────────────────────────────────────────
// Alberto, 07/09/2026: «llegará un momento en que un cliente tenga acceso a
// varios clientes a su vez, sobre todo empresa… yo tengo empresa, y mis padres,
// por lo que se tiene que diferenciar bien cuáles son pólizas mías personales,
// cuáles de la empresa y a su vez de cada autorizado».
//
// Hasta ese día `cartera.propias` —que es un ARRAY: una identidad puede estar
// vinculada a varias fichas— se pintaba en una lista plana y SIN etiqueta
// ninguna. Las pólizas personales de alguien y las de su sociedad salían
// mezcladas y sin nada que las separase.
//
// ─── Y el fallo que este cepo persigue de verdad ────────────────────────────
// No es que falte el título: es que se agrupe por el NOMBRE. Dos fichas con el
// mismo nombre —un padre y un hijo, una persona y su sociedad unipersonal— se
// fundirían en un bloque de aspecto perfectamente normal, con sus pólizas
// mezcladas. Duplicar se ve; mezclar no. Es la regla global del monorepo
// («agrupar personas: por IDENTIDAD, nunca por la etiqueta»).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const RAIZ = new URL('..', import.meta.url).pathname

/**
 * 🚨 Sin comentarios antes de mirar. Este fichero busca texto plano y las
 * cabeceras de lo que vigila contienen literalmente las palabras prohibidas
 * para explicar por qué lo son. Ya ha mordido a tres cepos de esta app.
 */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const AGRUPAR = sinComentarios(
  readFileSync(`${RAIZ}packages/module-seguros-portal/src/agrupar-cartera.ts`, 'utf8'),
)
const PAGINA = sinComentarios(
  readFileSync(`${RAIZ}apps/asegura-portal/app/(portal)/boveda/page.tsx`, 'utf8'),
)
const CSS = readFileSync(`${RAIZ}apps/asegura-portal/app/globals.css`, 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

test('🚨 agrupar por el NOMBRE es IRREPRESENTABLE: el tipo no lo lleva', () => {
  // Este es el cepo estructural, y es más fuerte que comprobar que hoy no se
  // usa: `TitularAgrupable` no declara `nombre`, así que no hay nada que
  // comparar aunque alguien quiera. Si mañana se añade el campo, este cepo cae
  // y obliga a razonar por qué.
  const i = AGRUPAR.indexOf('export type TitularAgrupable')
  assert.notEqual(i, -1, 'TitularAgrupable tiene que seguir siendo el contrato de entrada')
  const cuerpo = AGRUPAR.slice(i, AGRUPAR.indexOf('\n}', i))
  assert.doesNotMatch(
    cuerpo,
    /\bnombre\b/,
    'el nombre no entra en la decisión de agrupar: dos fichas homónimas son dos titulares',
  )
  assert.match(cuerpo, /\bclienteId\b/, 'la clave de agrupación es la identidad de la ficha')
})

test('🚨 y el modulo entero no mira ningun nombre', () => {
  assert.doesNotMatch(
    AGRUPAR,
    /\.nombre\b|\bnombre\s*[:=]/,
    'agrupar por etiqueta funde a dos personas distintas sin que nada falle',
  )
})

test('🚨 la pagina DELEGA el reparto: no compara tipoPersona a mano', () => {
  // Con la comparación repartida por el JSX, la regla («la empresa de otro no
  // es tu empresa») viviría en dos sitios y se separarían sin fallar.
  assert.match(PAGINA, /agruparCartera\(/, 'la bóveda reparte con el módulo puro, que tiene su cepo')
  assert.doesNotMatch(
    PAGINA,
    /tipoPersona\s*===|tipoPersona\s*!==/,
    'la decisión de cajón vive en `agruparCartera`, no en la pantalla',
  )
})

test('🚨 cada bloque se lleva su titular por clienteId, nunca por nombre', () => {
  assert.match(
    PAGINA,
    /key=\{t\.clienteId\}/,
    'la lista de titulares se indexa por la identidad de la ficha',
  )
  assert.doesNotMatch(
    PAGINA,
    /key=\{t\.nombre\}/,
    'dos titulares homónimos compartirían clave de React y uno desaparecería',
  )
})

test('🚨 el chip de la fila marca lo que NO es tuyo, y eso no depende de la cabecera', () => {
  // Son dos marcas con dos significados: la cabecera dice de quién es el tramo;
  // el chip dice que esa póliza es AJENA, que es lo caro de equivocar y viaja
  // con la fila. Atarlo a `conNombre` lo pondría también en las propias («de»
  // sobre algo que sí es tuyo) y lo quitaría de una ajena en cuanto el bloque
  // decidiera no llevar nombre.
  assert.match(
    PAGINA,
    /className="titular-cabecera"/,
    'el bloque de un titular necesita su cabecera',
  )
  assert.match(
    PAGINA,
    /deOtro=\{grupo === 'autorizadas' \? titular\.nombre : null\}/,
    'el chip sale de que la póliza sea ajena, no de si el bloque lleva nombre',
  )
})

test('🚨 la cabecera del titular es PEGAJOSA', () => {
  // Si deja de serlo, se pierde justo lo que la hace útil y no falla nada:
  // sigue viéndose al abrir la pantalla.
  const i = CSS.indexOf('.titular-cabecera {')
  assert.notEqual(i, -1, 'la clase de la cabecera tiene que existir en el CSS del portal')
  const regla = CSS.slice(i, CSS.indexOf('}', i))
  assert.match(regla, /position:\s*sticky/, 'una cabecera que se va con el scroll no agrupa nada')
  assert.match(regla, /background:\s*var\(--surface\)/, 'sin fondo, las tarjetas se leen por debajo')
})
