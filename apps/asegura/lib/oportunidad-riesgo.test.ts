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

test('un DNI que ya existe solo reutiliza la ficha si el nombre casa', () => {
  const c = cuerpoDe('nuevaPersonaEnRiesgo')
  assert.match(c, /mismaPersonaPorNombre\(e\.persona, ficha\)/)
  assert.match(c, /status: 409/)
})

test('con oportunidadId y sin correduría legible no se cotiza (503, 0,00€)', () => {
  for (const r of ['auto', 'moto']) {
    const f = readFileSync(new URL(`../app/api/operador/codeoscopic/${r}-nuevo/route.ts`, import.meta.url), 'utf8')
    assert.match(f, /if \(!correduria && typeof cuerpo\.oportunidadId === 'string'[\s\S]{0,300}status: 503/, r)
  }
})

test('comparar dos variantes: solo del mismo riesgo y de esta correduría, sin DNI', () => {
  const c = cuerpoDe('compararVariantes')
  assert.match(c, /oportunidad_id = \$\{oportunidadId\}::uuid and correduria_id = \$\{correduriaId\}::uuid/)
  assert.match(c, /t\.correduria_id = \$\{correduriaId\}::uuid/)
  assert.doesNotMatch(c, /identificationDocument|dni/i)
})

test('el riesgo de una póliza se abre sobre ESA póliza y retarificar dentro de él lo comprueba antes de gastar', () => {
  const a = cuerpoDe('abrirRiesgoDePoliza')
  assert.match(a, /poliza_id = \$\{e\.polizaId\}::uuid/)
  assert.match(a, /p\.correduria_id = \$\{correduriaId\}::uuid/)
  assert.match(cuerpoDe('validarRiesgoDePoliza'), /poliza_id = \$\{polizaId\}::uuid/)
  const r = readFileSync(new URL('../app/api/operador/codeoscopic/retarificar/route.ts', import.meta.url), 'utf8')
  const i = r.indexOf('validarRiesgoDePoliza(')
  assert.ok(i > 0 && i < r.indexOf('await cotizar('), 'se valida antes de cotizar')
  assert.match(r, /gastado: '0,00€' \}, \{ status: 422 \}/)
})

test('no se pide precio en un riesgo cerrado (ni variante ni retarificación de póliza)', () => {
  for (const f of ['validarVariante', 'validarRiesgoDePoliza']) {
    assert.match(cuerpoDe(f), /estado::text in \('competencia', 'en_negociacion', 'pendiente_cliente'\)/, f)
  }
})

test('el riesgo de una póliza reutiliza la oportunidad que abrió una retarificación de antes', () => {
  assert.match(cuerpoDe('abrirRiesgoDePoliza'), /info_riesgo->>'polizaId' = \$\{e\.polizaId\}/)
})

test('moto arma propietario y conductor desde SUS fichas (con su carné de moto) y rechaza el ocasional', () => {
  const c = cuerpoDe('prepararVariante')
  assert.doesNotMatch(c, /e\.ramo === 'auto' && figuras/, 'las figuras no pueden ser solo de auto')
  assert.match(c, /personaDeFicha\(correduriaId, id, e\.ramo\)/, 'la ficha de la figura se lee con su ramo')
  assert.match(c, /e\.ramo === 'moto' && figuras\?\.conductor_ocasional[\s\S]{0,40}return \{ ok: false/)
  assert.match(cuerpoDe('personaDeFicha'), /carnetMotoDeFicha/, 'en moto el carné del conductor es el de moto')
})

test('moto: conductor con fecha de carné y sin tipo se declara B explícito (para cruzarlo con la cilindrada)', () => {
  assert.match(cuerpoDe('prepararVariante'), /e\.ramo === 'moto' && clave === 'conductor' && c\.fechaCarnet && !c\.tipoCarnet\) c\.tipoCarnet = 'B'/)
})
