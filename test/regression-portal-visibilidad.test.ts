// Cepo de la REGLA DE VISIBILIDAD del portal del cliente (03/09/2026).
//
// Dictado de Alberto: «que aparezcan los datos que tengamos, el resto que no
// aparezca vacío, simplemente no se ve… por ejemplo tramitador no, porque esa
// es función mía».
//
// Traducido: SE OCULTA lo que, si falta, no cambia nada para el cliente; SE
// DICE EN VOZ ALTA lo que sí cambiaría lo que el cliente haría.
//
// 🚫 El tramitador y el perito NO son «un dato que falta»: son GESTIÓN DEL
// CORREDOR. El punto de contacto único es Alberto — el cliente le llama a él,
// no al tramitador de la compañía. Por eso no se pintan en gris ni como
// «pendiente»: no existen ni en el tipo ni en el `select`. Un campo que no se
// pide a la BD es un campo que nadie puede pintar por descuido tres meses
// después, que es exactamente lo que este fichero impide.
//
// ⚠️ Esto NO deroga la regla del CLAUDE.md de la RAÍZ («dato que NO hay ≠ dato
// que NO se ha mirado»): la AFINA para esta app. Quien lea solo uno de los dos
// se lleva la idea contraria, así que están escritos juntos aquí y en
// `apps/asegura-portal/CLAUDE.md`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const LECTURA = 'apps/asegura-portal/lib/cartera-lectura.ts'

const leer = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

test('el fichero de lectura de cartera existe', () => {
  // Un guardián que se salta a sí mismo cuando el fichero no está no es un
  // guardián: es el mismo «no lo he mirado» disfrazado de verde que persigue.
  assert.ok(existsSync(join(ROOT, LECTURA)), `falta ${LECTURA}`)
})

test('la lectura del portal NO trae tramitador ni perito', () => {
  const src = leer(LECTURA)
  for (const campo of ['tramitadorNombre', 'tramitadorTelefono', 'peritoNombre', 'peritoTelefono']) {
    assert.doesNotMatch(
      src,
      new RegExp(campo),
      `${campo} no puede volver a ${LECTURA}: no es un dato que le falte al cliente, ` +
        'es gestión del corredor (contacto único = Alberto). Si vuelve al `select`, ' +
        'vuelve a la vista.',
    )
  }
})

test('lo que SÍ cambia la decisión del cliente sigue llegando', () => {
  // La otra mitad de la regla. Si un día alguien «limpia» también estos, el
  // portal deja de poder decir en voz alta las tres ausencias que importan y
  // se convierte en la máquina de tranquilizar que la regla del NULL prohíbe.
  const src = leer(LECTURA)
  assert.match(src, /fechaVencimiento/, 'sin vencimiento hay que poder decirlo: la fecha tiene que llegar')
  assert.match(src, /total: lista\.length/, '`recibos.total` tiene que llegar: 0 NO es «al corriente»')
  assert.match(src, /total: cobs\.length/, '`coberturas.total` tiene que llegar: 0 NO es «no tiene coberturas»')
})

test('los tres ceros siguen documentados como «no es que esté bien»', () => {
  // El comentario es la mitad del cepo: el número por sí solo no dice que un 0
  // sea un hueco, y es justo lo que se lee mal al pintarlo.
  const src = leer(LECTURA)
  assert.match(src, /NO es «al corriente»/, 'el comentario de recibos.total no puede desaparecer')
  assert.match(src, /ninguna cobertura informada/, 'el comentario de coberturas.total no puede desaparecer')
})

test('los siniestros pasan por el NIVEL, como la prima y los recibos', () => {
  // 🚨 Este cepo nace de un agujero REAL (04/09/2026): `prima`, `coberturas` y
  // `recibos` preguntaban por `ve.*` y `siniestrosAbiertos` NO. Un tercero con
  // el alcance más bajo (`ver` → nivel `tarjeta`) veía los siniestros abiertos
  // de quien le autorizó: referencia, estado y fecha. No fallaba nada —salían—,
  // que es el modo de fallo que este portal persigue.
  //
  // 📌 Desde el 05/09/2026 la lectura trae el HISTORIAL entero (los cuatro
  // estados, no solo los abiertos) y `siniestrosAbiertos` se DERIVA de él, así
  // que la guarda tiene que estar en la lectura única. Un siniestro cerrado es
  // igual de personal que uno abierto — si acaso más, porque es un historial.
  const src = leer(LECTURA)
  assert.match(
    src,
    /const historial[^=]*=\s*ve\.siniestros/,
    'la lectura del historial tiene que preguntar por `ve.siniestros` antes de traer nada.',
  )
  assert.match(
    src,
    /siniestrosAbiertos:\s*historial === null \? null : historial\.filter/,
    '`siniestrosAbiertos` se deriva del historial ya filtrado por nivel: si se lee aparte, ' +
      'vuelve a haber dos sitios donde acordarse de la guarda y uno se olvidará.',
  )
  assert.match(
    src,
    /no visible en este nivel.*\n.*siniestrosAbiertos/i,
    'el tipo tiene que declarar que `null` es «no visible en tu nivel» y `[]` «no hay ninguno»: ' +
      'colapsarlos convierte un «no puedo enseñártelo» en un «no tiene».',
  )
})

test('el historial NO trae el `tipo`: es un código numérico de la compañía', () => {
  // 🚨 Medido en la cartera viva el 05/09/2026: `siniestros.tipo` vale `1107`,
  // `1915`, `1312`, `17`, `2102`… Es el código de la compañía, no una palabra.
  // Pintarlo sería peor que no pintar nada: «Tipo 1107» parece un dato que
  // significa algo. El cepo mira el bloque del `select` de siniestros, no el
  // fichero entero, porque `tipo` es también el nombre de la columna del RAMO
  // de una póliza y ahí sí se lee.
  const src = leer(LECTURA)
  const i = src.indexOf('prisma.siniestro.findMany')
  assert.ok(i > 0, 'no encuentro la consulta de siniestros')
  const bloque = src.slice(i, src.indexOf('}),', i))
  assert.doesNotMatch(
    bloque,
    /^\s*tipo:\s*true/m,
    'el `select` de siniestros no puede pedir `tipo` mientras sea un código sin traducir',
  )
})
