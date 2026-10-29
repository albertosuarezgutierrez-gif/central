// Guardián de fuente: `candidatas()` no puede llenar el LIMIT con solicitudes que acaban en «nada».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./salida-auto.ts', import.meta.url), 'utf8')
const sql = src.slice(src.indexOf('export async function candidatas'), src.indexOf('export async function procesarSalidas'))

test('candidatas excluye emitidas con envío ya intentado', () => {
  assert.match(sql, /f\.estado = 'emitida' AND f\.envio_intentos > 0/)
})

test('candidatas ordena las ya avisadas al final (no las excluye) y luego por created_at', () => {
  assert.match(sql, /ORDER BY \(to_jsonb\(s\) ->> 'auto_aviso_at'\) IS NOT NULL, s\.created_at/)
})

test('candidatas sigue parametrizada con Prisma.sql', () => {
  assert.match(sql, /Prisma\.sql`/)
  assert.match(sql, /\$\{desde\}::date/)
  assert.match(sql, /LIMIT \$\{MAX_POR_PASE\}/)
})
