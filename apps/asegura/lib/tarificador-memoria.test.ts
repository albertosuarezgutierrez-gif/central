// Cepo de AISLAMIENTO POR RAMO de la memoria de elecciones del tarificador (13/10/2026).
// `claveMemoriaVersion` NO lleva el ramo (coche y moto con misma marca/modelo dan la misma clave): el aislamiento lo da
// la columna `ramo` (UNIQUE(correduria_id, compania, ramo, tipo, clave_normalizada)). Si una consulta deja de filtrar por
// ramo, una elección de moto se serviría a un coche. Se vigila el SQL del fichero (cada sentencia, por separado).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fuente = readFileSync(new URL('./tarificador-memoria.ts', import.meta.url), 'utf8')
// Sentencias SQL = plantillas etiquetadas $queryRaw`…` / $executeRaw`…`.
const sentencias = [...fuente.matchAll(/\$(?:queryRaw|executeRaw)(?:<[^`]*?>)?`([^`]*)`/g)].map((m) => m[1])
const sobre = (re: RegExp) => sentencias.filter((s) => re.test(s))

test('hay 5 sentencias sobre tarificador_elecciones (leer, borrar, bloquear, insertar, actualizar)', () => {
  assert.equal(sobre(/tarificador_elecciones/).length, 5)
})

test('leer, borrar y bloquear (for update) filtran por la columna ramo con el ramo de la clave', () => {
  const filtradas = sobre(/(select|delete)\b[\s\S]*tarificador_elecciones/i)
  assert.equal(filtradas.length, 3)
  for (const s of filtradas) assert.match(s, /\bramo\s*=\s*\$\{k\.ramo\}/, s)
})

test('insertar escribe la columna ramo con el ramo de la clave, y su on conflict incluye ramo', () => {
  const ins = sobre(/insert into seguros\.tarificador_elecciones/)
  assert.equal(ins.length, 1)
  assert.match(ins[0], /\(correduria_id, compania, ramo, tipo, clave_normalizada,/)
  assert.match(ins[0], /\$\{k\.ramo\}/)
  assert.match(ins[0], /on conflict \(correduria_id, compania, ramo, tipo, clave_normalizada\)/)
})

test('actualizar va por id de la fila ya bloqueada (que se leyó con filtro de ramo) y por correduria_id', () => {
  const up = sobre(/update seguros\.tarificador_elecciones/)
  assert.equal(up.length, 1)
  assert.match(up[0], /where id = \$\{actual\.id\}::uuid and correduria_id = \$\{k\.correduriaId\}::uuid/)
})
