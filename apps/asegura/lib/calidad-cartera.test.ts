// Cepo de la consulta de calidad del dato: lee el FUENTE (SQL crudo, donde tsc no mira).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./calidad-cartera.ts', import.meta.url), 'utf8')
const ruta = readFileSync(new URL('../app/api/operador/calidad/route.ts', import.meta.url), 'utf8')

test('mira solo la cartera EN VIGOR de la correduría, sin fusionadas', () => {
  assert.match(src, /where p\.correduria_id = \$\{correduriaId\}::uuid and p\.merged_into_poliza_id is null and \$\{vigor\}/)
  assert.match(src, /Prisma\.raw\(sqlCarteraEnVigor\('p'\)\)/)
  assert.match(src, /where c\.merged_into_cliente_id is null/)
})

test('🚨 no saca DNI, teléfono ni correo: solo nombre, póliza y compañía', () => {
  const select = src.slice(src.indexOf('select \'vencida_sin_renovar\''))
  assert.doesNotMatch(select, /\bas (dni|telefono|email)\b/)
  assert.doesNotMatch(src, /dni:\s*f\.|telefono:\s*f\.|email:\s*f\./)
})

test('«vencida sin renovar» excluye la que ya tiene hija o sustituta enlazada', () => {
  assert.match(src, /not exists \(select 1 from polizas h where h\.merged_into_poliza_id is null\s+and \(h\.poliza_padre_id = v\.id or h\.poliza_origen_id = v\.id\)\)/)
})

test('la pareja de fichas con el mismo DNI sale una sola vez', () => {
  assert.match(src, /\(cl\.id < o\.id or not exists \(select 1 from cl c2 where c2\.id = o\.id\)\)/)
})

test('🚨 un fallo es estado error, nunca una lista vacía', () => {
  assert.match(ruta, /catch \(e\) \{\s+return NextResponse\.json\(\{ estado: 'error'/)
  assert.doesNotMatch(ruta, /incidencias: \[\]/)
})
