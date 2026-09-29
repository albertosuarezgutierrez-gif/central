import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Lee el FUENTE: lo que vigila vive en Prisma.sql, donde ni tsc ni el build miran, y el módulo
// importa el cliente generado (el job de tests corre sin `prisma generate`).
const src = readFileSync(new URL('./oportunidad-riesgo.ts', import.meta.url), 'utf8')
const cuerpoDe = (nombre: string) => {
  const i = src.indexOf(`export async function ${nombre}`)
  assert.ok(i >= 0, `falta ${nombre}`)
  const j = src.indexOf('\nexport ', i + 10)
  return src.slice(i, j < 0 ? undefined : j)
}

test('toda consulta del riesgo va acotada a la correduría (BYPASSRLS: un id ajeno daría los datos de otro)', () => {
  for (const f of ['leerRiesgo', 'asignarFigura', 'quitarFigura', 'nuevaPersonaEnRiesgo', 'validarVariante']) {
    const c = cuerpoDe(f)
    const consultas = c.match(/from seguros\.\w+/g) ?? []
    assert.ok(consultas.length > 0, f)
    assert.match(c, /correduria_id = \$\{correduriaId\}::uuid/, `${f} no filtra por correduría`)
  }
})

test('a la pantalla no viaja ni el DNI ni la petición al vendor: solo nombres y diferencias', () => {
  const c = cuerpoDe('leerRiesgo')
  assert.doesNotMatch(c, /\bdni\b/, 'leerRiesgo no debe leer el DNI')
  assert.match(c, /cambios: i === 0 \? \[\] : diferenciasVariante/)
  const ret = c.slice(c.lastIndexOf('return {'))
  assert.doesNotMatch(ret, /peticion/, 'la petición (con DNI) no se devuelve')
})

test('una figura solo puede ser el cliente o alguien VINCULADO a él (y nunca «Sin vínculo»)', () => {
  const c = cuerpoDe('asignarFigura')
  assert.match(c, /cliente_relaciones/)
  assert.match(c, /tipo_relacion <> 'Sin vínculo'/)
})

test('cotizar una variante valida la oportunidad y las fichas ANTES de gastar', () => {
  const c = cuerpoDe('prepararVariante')
  assert.ok(c.indexOf('validarVariante(') < c.indexOf('personaDeFicha('), 'se valida antes de leer fichas')
  const ruta = readFileSync(new URL('../app/api/operador/codeoscopic/auto-nuevo/route.ts', import.meta.url), 'utf8')
  assert.ok(ruta.indexOf('prepararVariante(') < ruta.indexOf('await cotizar('), 'la variante se prepara antes del cargo')
})
