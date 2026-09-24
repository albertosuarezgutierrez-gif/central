// Guardián de FIDELIDAD: los topes de las palancas que el check #13 del guardián declara tienen que
// ser los del motor de verdad.
//
// POR QUÉ (03/09/2026). El check «¿puede el motor llegar al precio que necesita?» compara la brecha
// con la suma del recorrido de sus palancas, y esos topes están COPIADOS en
// `app/api/sivra/pricing/guard/route.ts` (no se pueden importar: es un route de Next, y sus exports
// están restringidos). Una copia desincronizada no rompe nada visible — el guardián sigue dando un
// número, solo que de un motor que no existe. Pasó en este mismo PR: al ampliar el clamp de calidad
// de 0,90 a 0,75, el guardián recién escrito seguía declarando 0,90 y calculaba un recorrido 15
// puntos más estrecho que el real.
//
// Se lee el FUENTE a propósito: `tsc` y el build no comparan dos números iguales escritos en dos
// archivos, y el valor del route no es importable desde `node --test`.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { BAJADA_MAX } from './prior-estacional.ts'

const aqui = dirname(fileURLToPath(import.meta.url))
const leer = (rel: string) => readFileSync(join(aqui, rel), 'utf8')

const guard = leer('../../app/api/sivra/pricing/guard/route.ts')
const motor = leer('./pricing-engine.ts')
const lastminute = leer('./pricing-lastminute.ts')

/** Lee `const NOMBRE = <numero>` del fuente. */
function constante(fuente: string, nombre: string): number {
  const m = fuente.match(new RegExp(`const\\s+${nombre}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`))
  assert.ok(m, `no se encuentra la constante ${nombre}`)
  return Number(m![1])
}

test('el suelo del clamp de calidad del guardián es el del motor', () => {
  // Del motor se saca del propio clamp, no de una constante: allí va escrito en la expresión.
  const m = motor.match(/clamp\(1 \+ \(Number\(p\.own_score\) - mktScore\) \* Number\(p\.quality_k\), ([\d.]+), ([\d.]+)\)/)
  assert.ok(m, 'no se encuentra el clamp de calidad en pricing-engine.ts')
  const sueloMotor = Number(m![1])
  assert.equal(constante(guard, 'CLAMP_CALIDAD_MIN'), sueloMotor,
    'el guardián declara un suelo de calidad distinto al del motor')
})

test('el descuento máximo del last-minute del guardián es el del módulo', () => {
  // No hay constante exportada: el valor vive en el default del parámetro, así que se lee de ahí.
  const m = lastminute.match(/const\s+descuentoMax\s*=\s*o\.descuentoMax\s*\?\?\s*([\d.]+)/)
  assert.ok(m, 'no se encuentra el descuentoMax por defecto en pricing-lastminute.ts')
  assert.equal(constante(guard, 'LASTMINUTE_DESCUENTO_MAX'), Number(m![1]))
})

test('el guardián importa BAJADA_MAX del prior en vez de copiarlo', () => {
  // Este SÍ es importable, así que copiarlo sería un error gratuito.
  assert.match(guard, /BAJADA_MAX/, 'el guardián debe usar BAJADA_MAX de prior-estacional')
  assert.ok(!/const\s+BAJADA_MAX\s*=/.test(guard), 'BAJADA_MAX no se copia, se importa')
  assert.equal(typeof BAJADA_MAX, 'number')
})

test('el piloto sigue declarado como palanca que NO escribe precio', () => {
  // Si algún día se cablea, este test salta y obliga a revisar el check #13 en el mismo PR.
  assert.match(guard, /PILOTO_ESCRIBE_PRECIO\s*=\s*false/,
    'si el piloto pasa a escribir, hay que actualizar el recorrido de palancas')
})
