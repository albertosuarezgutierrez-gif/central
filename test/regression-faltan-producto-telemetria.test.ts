import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Telemetría (20/09/2026) de `faltan_producto` por compañía: reutiliza
// `seguros.operational_events` (genérica, sin migración nueva) para saber a
// qué compañías les falta cobertura real del Product Form Library, en vez de
// suponerlo por la última vez que se vio un 400. Guardián de que la escritura
// sigue en la cascada del ReRate (`oferta/route.ts`) y que el endpoint de
// lectura sigue ahí — ninguno de los dos se puede probar con `node --test`
// directamente porque hablan con Prisma/BD real.

const RUTA_ESCRITURA = join(import.meta.dirname, '..', 'apps/asegura/app/api/operador/codeoscopic/oferta/route.ts')
const RUTA_LECTURA = join(
  import.meta.dirname,
  '..',
  'apps/asegura/app/api/operador/codeoscopic/faltan-producto/route.ts',
)

test('la cascada del ReRate registra la telemetría ANTES de devolver faltan_producto', () => {
  const fuente = readFileSync(RUTA_ESCRITURA, 'utf8')
  const bloque = fuente.slice(fuente.indexOf('if (deProducto.length > 0) {'), fuente.indexOf("estado: 'faltan_producto'"))
  // Una llamada comentada («// await registrarFaltaProducto(...)») sigue
  // conteniendo la subcadena y pasaría un `assert.match` ingenuo — visto
  // fallar en real al probar este mismo cepo (ver regression-auto-nuevo-
  // historial.test.ts, mismo patrón).
  const lineasActivas = bloque
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
  assert.match(lineasActivas, /await registrarFaltaProducto\(/)
})

test('registrarFaltaProducto nunca puede tirar la respuesta (try/catch mudo)', () => {
  const fuente = readFileSync(RUTA_ESCRITURA, 'utf8')
  const fn = fuente.slice(
    fuente.indexOf('async function registrarFaltaProducto'),
    fuente.indexOf('function respuestaNoAplicado'),
  )
  assert.match(fn, /try \{/)
  assert.match(fn, /\} catch \{/)
  assert.match(fn, /event_name/)
  assert.match(fn, /'codeoscopic_oferta_faltan_producto'/)
})

test('el endpoint de lectura agrega por compañía sobre operational_events, scoped a la correduría', () => {
  const fuente = readFileSync(RUTA_LECTURA, 'utf8')
  assert.match(fuente, /event_name = 'codeoscopic_oferta_faltan_producto'/)
  assert.match(fuente, /correduria_id = \$\{correduria\.id\}/)
  assert.match(fuente, /group by 1/)
})
