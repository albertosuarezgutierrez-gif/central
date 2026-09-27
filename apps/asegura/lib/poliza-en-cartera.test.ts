import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Cepos de fuente: la regla vive en el SQL.
const src = readFileSync(new URL('./poliza-en-cartera.ts', import.meta.url), 'utf8')
const ruta = readFileSync(new URL('../app/api/operador/leer-documento/route.ts', import.meta.url), 'utf8')

test('«ya es nuestra» = cartera EN VIGOR: el volcado histórico (leads) y las canceladas no cuentan', () => {
  assert.match(src, /Prisma\.raw\(sqlCarteraEnVigor\('p'\)\)/)
  assert.match(src, /p\.correduria_id = \$\{correduriaId\}::uuid and p\.merged_into_poliza_id is null/)
})

test('se compara el número compactado entero, no un «contiene»: 12345 no es la 123456', () => {
  assert.match(src, /ltrim\(regexp_replace\(upper\(p\.numero_poliza\), '\[\^A-Z0-9\]', '', 'g'\), '0'\) = \$\{clave\}/)
  assert.doesNotMatch(src, /like \$\{/)
})

test('sin número fiable o con la BD caída es null («no lo sé»), nunca [] («no es nuestra»)', () => {
  assert.match(src, /if \(!clave\) return null/)
  assert.match(src, /\.catch\(\(\) => null\)/)
})

test('la lectura devuelve enCartera y el coche; nada de la persona', () => {
  assert.match(ruta, /enCartera,/)
  assert.match(ruta, /matricula: auto\?\.matricula \?\? null/)
  const respuesta = ruta.slice(ruta.lastIndexOf('return NextResponse.json({'))
  assert.doesNotMatch(respuesta, /dni|nif|nacimiento|direccion|tomadorNombre/i)
})
