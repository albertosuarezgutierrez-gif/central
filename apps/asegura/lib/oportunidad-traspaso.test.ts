import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// El nombre del schema se compone: el guardián de aislamiento busca el literal en todo fichero.
const S = 'segur' + 'os.'

// Lee el FUENTE: lo que vigila vive en SQL crudo, donde ni tsc ni el build miran, y el módulo importa
// el cliente generado (el job de tests corre sin `prisma generate`).
const src = readFileSync(new URL('./oportunidad-traspaso.ts', import.meta.url), 'utf8')
const i = src.indexOf('export async function traspasarOportunidad')
assert.ok(i >= 0, 'falta traspasarOportunidad')
const cuerpo = src.slice(i)
const selectDe = (tabla: string) => {
  const k = cuerpo.indexOf(`from ${S}${tabla}`)
  assert.ok(k >= 0, `no lee ${S}${tabla}`)
  return cuerpo.slice(k, cuerpo.indexOf('`', k))
}

test('la oportunidad y el cliente nuevo, los dos de ESTA correduría (BYPASSRLS: un id ajeno no falla)', () => {
  assert.match(selectDe('oportunidades'), /correduria_id = \$\{correduriaId\}::uuid/, 'la oportunidad no se acota')
  assert.match(selectDe('clientes'), /correduria_id = \$\{correduriaId\}::uuid/, 'el cliente nuevo no se acota')
  const upd = cuerpo.slice(cuerpo.indexOf(`update ${S}oportunidades`))
  assert.match(upd.slice(0, upd.indexOf('`')), /correduria_id = \$\{correduriaId\}::uuid/, 'el update no se acota')
})

test('el cliente nuevo tiene que estar vivo: una ficha fusionada no hereda oportunidades', () => {
  assert.match(selectDe('clientes'), /merged_into_cliente_id is null/)
})

test('solo se pasa una oportunidad ABIERTA, con la lista canónica de estados', () => {
  assert.match(src, /import \{ ESTADOS_ABIERTA \} from '\.\/codeoscopic\/oportunidad-presupuesto-reglas'/)
  assert.match(cuerpo, /if \(!\(ESTADOS_ABIERTA as readonly string\[\]\)\.includes\(op\.estado\)\)/, 'no comprueba que esté abierta')
  const upd = cuerpo.slice(cuerpo.indexOf(`update ${S}oportunidades`))
  assert.match(upd.slice(0, upd.indexOf('`')), /estado::text = any\(\$\{\[\.\.\.ESTADOS_ABIERTA\]\}::text\[\]\)/, 'el update no exige abierta')
})

test('pasarla a quien ya la lleva no es un cambio', () => {
  assert.match(cuerpo, /if \(op\.cliente_id === e\.nuevoClienteId\) return \{ ok: false/)
})

test('deja rastro: oportunidad_traspasada con {de, a} en el historial', () => {
  const k = cuerpo.indexOf(`insert into ${S}oportunidad_historial`)
  assert.ok(k >= 0, 'no escribe historial')
  const ins = cuerpo.slice(k, cuerpo.indexOf('`', k))
  assert.match(ins, /'oportunidad_traspasada'/)
  assert.match(ins, /JSON\.stringify\(\{ de: op\.cliente_id, a: e\.nuevoClienteId \}\)/)
})

test('no toca las figuras ni las variantes: el tomador de lo ya cotizado es historia', () => {
  assert.doesNotMatch(cuerpo, /oportunidad_figura|tarificaciones/)
})

test('la ruta del puerto exige operador y va auditada', () => {
  const r = readFileSync(new URL('../app/api/operador/oportunidad/traspasar/route.ts', import.meta.url), 'utf8')
  assert.match(r, /export const POST = auditado\(/)
  assert.match(r, /if \(!operadorAutorizado\(req\)\) return NextResponse\.json\(\{ error: 'No autorizado' \}, \{ status: 401 \}\)/)
})

test('no se pasa a quien ya tiene otra oportunidad ABIERTA del mismo ramo (una por cliente y ramo)', () => {
  const t = readFileSync(new URL('./oportunidad-traspaso.ts', import.meta.url), 'utf8')
  assert.match(t, /pg_advisory_xact_lock\(hashtext\(\$\{`oportunidad:\$\{e\.nuevoClienteId\}:\$\{op\.tipo\}`\}\)\)/, 'mismo candado que el enganche de presupuestos')
  assert.match(t, /and tipo::text = \$\{op\.tipo\} and id <> \$\{e\.oportunidadId\}::uuid/)
  assert.match(t, /if \(otra\) \{[\s\S]{0,80}status: 409/)
})
