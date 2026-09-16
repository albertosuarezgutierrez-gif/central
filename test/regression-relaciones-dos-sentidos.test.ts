import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Guardián de los DOS SENTIDOS del acceso en la ficha de cliente de la
// correduría (15/09/2026).
//
// 🚨 El fallo que vigila, medido con Alberto delante: la pantalla pintaba el
// sentido de ida como un párrafo con su estado, el de vuelta como una línea de
// once píxeles con un «sí/no» pelado, y al final tres botones juntos — dos con
// casi el mismo texto (solo cambiaba el orden de los nombres) y el MENOS usado
// en azul primario. Pasó lo que tenía que pasar: anotó el sentido contrario al
// que quería y lo revocó 12 segundos después. Y cuando anotó los dos correctos,
// la pantalla siguió diciendo «no» con el mismo botón debajo, porque el estado
// `pendiente` del sentido de vuelta no se pintaba en ninguna parte.
//
// Nada de esto lo caza `tsc` ni el build: se vigila leyendo el FUENTE.

const raiz = join(import.meta.dirname, '..')
const PANTALLA = join(raiz, 'apps/plataforma/app/(usuario)/correduria/Relaciones.tsx')
const PUERTO = join(raiz, 'apps/asegura/lib/cartera-relaciones.ts')
const fuente = readFileSync(PANTALLA, 'utf8')
const puerto = readFileSync(PUERTO, 'utf8')

test('🚨 el vínculo pinta los DOS sentidos, cada uno con SU autorización', () => {
  assert.equal((fuente.match(/<Sentido\b/g) ?? []).length, 2, 'ida y vuelta, siempre las dos')
  assert.match(fuente, /a=\{r\.autorizacion\}/, 'el sentido de ida lleva la autorización de la ficha')
  assert.match(fuente, /a=\{r\.autorizacionInversa\}/, 'el de vuelta lleva la suya, no un booleano pelado')
})

test('🚨 la insignia y la frase salen de los helpers puros, no de un `?:` en el JSX', () => {
  assert.match(fuente, /insigniaAcceso\(a, ve\)/)
  assert.match(fuente, /explicarSentidoAcceso\(a, recibe, otorga, ve\)/)
  // La línea vieja del sentido de vuelta: un «sí/no» que borraba el `pendiente`.
  assert.doesNotMatch(fuente, /ve los de \{r\.nombre\}\?/, 'el «¿X ve los de Y? no» pelado no vuelve')
})

test('🚨 cada botón de autorizar vive DENTRO de su sentido, no en una fila común', () => {
  const sentido = fuente.slice(fuente.indexOf('function Sentido('), fuente.indexOf('// ─── Añadir'))
  assert.match(sentido, /Anotar que \{otorga\} autoriza a \{recibe\}/, 'el botón nombra el sentido en el que está')
  assert.match(sentido, /Invitar a \$\{recibe\} a confirmarlo/, 'y desde ahí se le invita a aceptar')
  // Los textos con nombres FIJOS eran los dos botones gemelos del final.
  assert.doesNotMatch(fuente, /autoriza a \{nombreFicha\} a ver sus seguros/)
  assert.doesNotMatch(fuente, /\{nombreFicha\} autoriza a \{r\.nombre\} a ver sus seguros/)
})

test('🚨 el puerto manda la autorización del sentido inverso (si no, no hay nada que pintar)', () => {
  assert.match(puerto, /autorizacionInversa: resumirAutorizacion\(autorizaciones\.get\(clavePar\(r\.relacionadoId, clienteId\)\)/)
})
