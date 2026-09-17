import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

/**
 * Guardián de `actividad-cartera.ts`.
 *
 * 🚨 Lee el FUENTE con `readFileSync` a propósito, por dos razones:
 *  1. Lo que vigila vive dentro de un `Prisma.sql`, y ni `tsc` ni `next build`
 *     miran ahí dentro (la lección del `42P10` y la de `COLS_SUBASTA`).
 *  2. Importar el módulo arrastraría `./generated/asegura-client`, y el job
 *     `Tests (packages + guardián)` corre SIN `prisma generate`: lo tumbaría.
 */
const FUENTE = readFileSync(join(import.meta.dirname, 'actividad-cartera.ts'), 'utf8')

/** El SQL, con los comentarios fuera: si no, la prosa de la cabecera cuenta como código. */
const SQL = FUENTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * Solo la consulta del MURO (`consultaEventos`), que es la que devuelve filas al
 * navegador. El embudo se acota aparte a propósito: ahí `c.email` aparece dentro
 * de un `exists (…)`, o sea preguntando SI hay correo para contar el escalón, y
 * eso no saca ningún dato de nadie. Vigilar el fichero entero confundiría las
 * dos cosas y el cepo se volvería imposible de cumplir.
 */
const SQL_MURO = SQL.slice(SQL.indexOf('function consultaEventos'), SQL.indexOf('async function contar'))

test('el muro NO devuelve ningún dato de contacto', () => {
  // La promesa de la pantalla: dice QUÉ pasó y de QUIÉN es la ficha; el dato se
  // mira en la ficha. Un muro cronológico con domicilios y teléfonos es lo
  // último que conviene tener abierto, porque se mira con gente delante.
  for (const col of ['c.email', 'c.telefono', 'c.direccion', 'c.dni', 'c.codigo_postal']) {
    assert.equal(SQL_MURO.includes(col), false, `el muro selecciona ${col}`)
  }
  // Del cliente solo el nombre, para poder nombrarlo y enlazarlo.
  assert.match(SQL_MURO, /c\.nombre,\s*c\.apellidos/)
})

test('toda rama del muro se ata a UNA correduría', () => {
  // El vínculo identidad→ficha ya filtra por correduría, así que las ramas que
  // pasan por `vinc` están atadas. Las dos que NO pasan por ahí —supresión e
  // historial— tienen que filtrar ellas, o el puerto enseñaría fichas de otra
  // correduría el día que haya una segunda.
  assert.match(SQL, /from portal_vinculo\s+where correduria_id = \$\{correduriaId\}/)
  assert.match(SQL, /from portal_supresion s\s+where s\.correduria_id = \$\{correduriaId\}/)
  const historial = SQL.match(/from historial_interno h\s+where h\.correduria_id = \$\{correduriaId\}/g) ?? []
  assert.equal(historial.length, 2, 'las dos ramas de historial_interno filtran por correduría')
})

test('el historial borrado no sale en el muro', () => {
  const borrados = SQL.match(/h\.deleted_at is null/g) ?? []
  assert.equal(borrados.length, 2, 'las dos ramas de historial_interno excluyen lo borrado')
})

test('el código recién pedido NO cuenta como intento fallido', () => {
  // Sin margen, el código que alguien está tecleando ahora mismo saldría como
  // «no ha podido entrar» y la cola se llenaría de gente que está entrando bien.
  assert.match(SQL, /MINUTOS_GRACIA_CODIGO/)
  assert.match(SQL, /c\.usado_en is null/)
})

test('el embudo cuenta cartera VIVA, nunca `clientes.tipo`', () => {
  // `clientes.tipo` dice 2.742 clientes cuando son 80: es un campo del volcado
  // que no mantiene nadie. Un embudo construido sobre él sería precioso y falso.
  assert.match(SQL, /sqlCarteraViva\('p'\)/)
  assert.equal(/\btipo\s*=\s*'cliente'/.test(SQL), false, 'el embudo filtra por clientes.tipo')
})

test('cada cuenta del embudo falla por su cuenta y devuelve null, nunca 0', () => {
  // Cinco cuentas independientes: que una reviente no puede tumbar las otras
  // cuatro ni, peor, pintar un escalón a cero que se leería como «nadie».
  assert.match(FUENTE, /async function contar\([\s\S]*?\): Promise<number \| null>/)
  // El cuerpo de `contar`: su `catch` devuelve null, no 0.
  const cuerpo = FUENTE.slice(FUENTE.indexOf('async function contar'), FUENTE.indexOf('export async function embudoPortal'))
  assert.match(cuerpo, /catch[\s\S]*?return null/)
  assert.equal(/catch[\s\S]*?return 0/.test(cuerpo), false, 'una cuenta que falla devuelve 0')
  // Y las cinco pasan por `contar`, que ya captura dentro: ninguna se consulta
  // a pelo, porque un `$queryRaw` suelto ahí tumbaría el embudo entero.
  const cuentas = FUENTE.match(/contar\(\s*'/g) ?? []
  assert.equal(cuentas.length, 5, 'las cinco cuentas del embudo pasan por `contar`')
})

test('un evento sin ficha conserva su `cliente_id` nulo', () => {
  // `left join`, no `join`: con un `join` desaparecerían del muro justo los
  // eventos de quien todavía no está casado con ninguna ficha, que es trabajo.
  assert.match(SQL, /left join clientes c on c\.id = e\.cliente_id/)
})

test('el total sale del conjunto entero, no de la página', () => {
  assert.match(SQL, /count\(\*\) over \(\) as total/)
})

test('el filtro «solo el cliente» no esconde lo que el cliente escribió', () => {
  // Las dos anotaciones que compuso el portal (dirección y sugerencia) viven en
  // `historial_interno`, que es la tabla de la ficha. Si el filtro se llevara
  // por delante esa tabla entera, «solo el cliente» dejaría de enseñar
  // justamente el cambio de dirección del cliente.
  const soloCliente = FUENTE.slice(FUENTE.indexOf('soloCliente'))
  assert.match(soloCliente, /Prisma\.empty/)
  // La rama 6b va FUERA del condicional: se busca el `union all` que la precede
  // sin ningún `${soloCliente...}` entre medias.
  const i6b = SQL.indexOf("then 'direccion'")
  const iCond = SQL.indexOf('soloCliente')
  assert.ok(i6b > iCond, 'la rama de dirección/sugerencia va después del condicional')
  assert.equal(
    SQL.slice(iCond, i6b).lastIndexOf('Prisma.empty') < SQL.slice(iCond, i6b).lastIndexOf('}'),
    true,
    'el condicional se cierra antes de la rama 6b',
  )
})

test('los prefijos de clasificación son constantes compartidas, no texto a mano', () => {
  // Si se escribieran aquí a mano, el día que alguien retoque la frase del
  // portal el cambio de dirección de un cliente dejaría de constar como suyo
  // sin que fallara nada.
  assert.match(FUENTE, /PREFIJO_HISTORIAL_CONTACTO_PROPIO/)
  assert.match(FUENTE, /PREFIJO_HISTORIAL_SUGERENCIA/)
  assert.equal(
    SQL.includes("'El cliente actualizó desde el portal"),
    false,
    'el prefijo está escrito a mano en el SQL',
  )
})
