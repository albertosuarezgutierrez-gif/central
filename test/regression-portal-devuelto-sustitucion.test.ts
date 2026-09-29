// Cepo: el recibo DEVUELTO de una póliza ya sustituida no se le pide pagar al cliente.
//
// Caso (29/09/2026): José pasó su Kona 9833LJC de Mapfre a Reale. Mapfre pasó al cobro la
// renovación, llegó `devuelto` por CIMA y el portal (a) le decía «Tienes un recibo devuelto… la
// cobertura se suspende» y (b) volvía a enseñar la Mapfre junto a la Reale, porque un devuelto
// cuenta como «pendiente» en `sustituidasARetirar`. La regla vive en `devueltoPorSustitucion`
// (module-seguros, con sus tests); esto vigila que el portal la siga aplicando ANTES de retirar.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fuente = readFileSync(new URL('../apps/asegura-portal/lib/cartera-lectura.ts', import.meta.url), 'utf8')

test('el portal descuenta los devueltos por sustitución antes de decidir qué retirar', () => {
  const aplica = fuente.indexOf('devueltoPorSustitucion(')
  const retira = fuente.indexOf('sustituidasARetirar(')
  assert.ok(aplica > 0, 'cartera-lectura.ts ya no llama a devueltoPorSustitucion')
  assert.ok(retira > aplica, 'devueltoPorSustitucion tiene que ir ANTES de sustituidasARetirar')
})

test('la fecha de efecto del recibo se sigue leyendo (sin ella la regla responde siempre «deuda»)', () => {
  assert.match(fuente, /fechaEfectoActual: true/)
  assert.match(fuente, /dia\(r\.fechaEfectoActual\)/)
})
