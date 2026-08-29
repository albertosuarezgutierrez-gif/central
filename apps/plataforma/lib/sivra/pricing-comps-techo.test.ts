// El TECHO de plausibilidad del corpus de mercado (29/08/2026), y el guardián que impide volver a
// copiar la regla a mano.
//
// La guarda llevaba desde el 17/08 cortando solo por ABAJO. En el corpus de House entraba un comp
// a 19.359€/noche (1.613€/plaza) que inflaba el percentil 90 —el `ceil_pctl` que FRENA las
// subidas— de 992€ a 1.170€. No afecta a lo que se cobra hoy; afecta a dónde está el freno.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  esCompPlausible, sqlCompPlausible, MIN_EUR_PLAZA_COMP, MAX_EUR_PLAZA_COMP,
} from './pricing-comps-plausibles.ts'

test('el techo descarta lo imposible y deja pasar el mercado caro de verdad', () => {
  assert.equal(esCompPlausible(19359, 12), false, '1.613 EUR/plaza no es un piso, es un dato roto')
  assert.equal(esCompPlausible(7200, 12), true, '600 EUR/plaza justo en el techo: pasa')
  assert.equal(esCompPlausible(3431, 12), true, 'el hotel de lujo mas caro medido (286/plaza) pasa')
  assert.equal(esCompPlausible(1200, 2), true, '600/plaza en un piso de 2 plazas: pasa')
  assert.equal(esCompPlausible(1876, 2), false, '938/plaza era el maximo medido en Busto: fuera')
})

test('el suelo sigue intacto: el techo no lo ha aflojado', () => {
  assert.equal(esCompPlausible(104, 12), false, 'una habitacion vendida como piso de 12')
  assert.equal(esCompPlausible(149, 12), true, 'el comp legitimo mas barato medido en House')
})

test('sin aforo declarado NO se juzga, ni por abajo ni por arriba', () => {
  for (const plazas of [null, undefined, 0, -1]) {
    assert.equal(esCompPlausible(19359, plazas as number | null), true)
    assert.equal(esCompPlausible(1, plazas as number | null), true)
  }
})

test('los dos umbrales estan fijados con literales, no derivados de si mismos', () => {
  // Comprobar un umbral contra su propia constante es tautologico: dejaria pasar que alguien lo
  // ponga a 0 o a Infinity sin que salte nada. (Lo aprendi el 28/08 con RESERVA_MES_CORTO.)
  assert.equal(MIN_EUR_PLAZA_COMP, 12)
  assert.equal(MAX_EUR_PLAZA_COMP, 600)
  assert.ok(MAX_EUR_PLAZA_COMP > MIN_EUR_PLAZA_COMP * 10, 'el rango tiene que dejar respirar a Feria')
})

test('sqlCompPlausible emite la misma regla, con y sin alias de tabla', () => {
  const con = sqlCompPlausible('m.')
  assert.match(con, /m\.price_night >= 12 \* m\.guests/)
  assert.match(con, /m\.price_night <= 600 \* m\.guests/)
  assert.match(con, /m\.guests IS NULL OR m\.guests <= 0/)
  const sin = sqlCompPlausible()
  assert.match(sin, /price_night >= 12 \* guests/)
  assert.match(sin, /price_night <= 600 \* guests/)
  assert.ok(!sin.includes('m.'), 'sin prefijo no debe colar un alias')
})

test('GUARDIAN: ninguna consulta escribe la regla a mano - eran 13 sitios', () => {
  // El motivo del helper. Con la regla copiada, el proximo cambio se aplica en doce de trece y el
  // motor tarifica con dos definiciones distintas de «comparable valido» sin que nada falle.
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const infractores: string[] = []
  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === '.next' || e.startsWith('.')) continue
      const ruta = join(dir, e)
      if (statSync(ruta).isDirectory()) { recorrer(ruta); continue }
      if (!ruta.endsWith('.ts') && !ruta.endsWith('.tsx')) continue
      if (ruta.endsWith('pricing-comps-plausibles.ts')) continue
      if (ruta.endsWith('.test.ts')) continue
      if (/MIN_EUR_PLAZA_COMP\}\s*\*/.test(readFileSync(ruta, 'utf8'))) {
        infractores.push(ruta.slice(raiz.length + 1))
      }
    }
  }
  for (const d of ['lib', 'app']) recorrer(join(raiz, d))
  assert.deepEqual(infractores, [],
    `usa sqlCompPlausible() en vez de escribir la condicion: ${infractores.join(', ')}`)
})
