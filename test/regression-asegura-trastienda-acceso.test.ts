// Guardián de la PUERTA de `apps/asegura` (la trastienda de Grupo ASegura).
// `node --test`, gate en CI vía `pnpm test:guardia`.
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// `public.cuentas` es la tabla de cuentas COMPARTIDA de toda la casa de marcas
// (plataforma, alquiler, transporte, mariscos, rrhh, almacén…). El login de esta
// app autentica contra ella SIN filtro, y el rol `prisma_seguros` tiene
// BYPASSRLS. La suma de las dos cosas no es «no se ve nada»: es que **cualquier
// titular de cuenta del monorepo veía la cartera entera de la correduría y la
// base respondía 200**. Medido el 20/09/2026: de las 3 cuentas de
// `public.cuentas`, solo 1 casa con `seguros.usuarios`; las otras dos son el
// tenant DEMO de almacén y una CLIENTA de la propia correduría.
//
// `lib/tenant-ambito.ts` existía desde el 27/08/2026 para exactamente esto y
// **no lo llamaba nadie**. Este cepo fija que ya sí, y en los cinco sitios que
// importan.
//
// ─── Por qué lee el FUENTE con readFileSync ──────────────────────────────────
// El job `Tests (packages + guardián)` corre SIN `prisma generate`, así que
// importar un `route.ts` o `lib/session.ts` arrastraría el cliente de Prisma y
// tumbaría el job entero (misma razón que `lib/actividad-cartera.test.ts`). La
// parte PURA —`denegacionAmbito`— sí se importa: no toca base.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { denegacionAmbito, resolverAmbito } from '../apps/asegura/lib/tenant-ambito.ts'

const ROOT = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/**
 * El fuente SIN comentarios. Lo que este cepo vigila es CÓDIGO: si mirase el
 * fichero entero, un comentario que nombre `requireSession()` para explicar por
 * qué ya no se usa lo pondría rojo — y el arreglo sería reescribir la
 * explicación, no el código. Un cepo que se apaga borrando un comentario no
 * vigila nada.
 */
const codigo = (rel: string) =>
  leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

// Las CINCO puertas: la de las pantallas y las cuatro rutas de `/api/cartera/*`.
// Las dos últimas de la lista GASTAN DINERO (0,50€ la retarificación, IA por
// documento), así que un hueco aquí no es solo una fuga de datos: es gasto.
const PUERTAS = [
  'apps/asegura/app/(usuario)/layout.tsx',
  'apps/asegura/app/api/cartera/catalogos/route.ts',
  'apps/asegura/app/api/cartera/documentos/route.ts',
  'apps/asegura/app/api/cartera/cliente/[clienteId]/hogar-nuevo/route.ts',
  'apps/asegura/app/api/cartera/polizas/[polizaId]/retarificar/route.ts',
]

for (const puerta of PUERTAS) {
  test(`${puerta} exige el ÁMBITO de correduría, no solo la sesión`, () => {
    const src = codigo(puerta)
    assert.match(
      src,
      /exigirAccesoCartera\s*\(/,
      `${puerta} no llama a exigirAccesoCartera(): una cuenta de OTRA vertical entraría en la cartera`,
    )
  })

  test(`${puerta} ya no se conforma con requireSession()`, () => {
    const src = codigo(puerta)
    assert.doesNotMatch(
      src,
      /\brequireSession\s*\(/,
      `${puerta} sigue usando requireSession(), que solo acredita «tengo cuenta en la casa de marcas»`,
    )
  })
}

test('las 4 rutas de /api/cartera/* cortan con el status del ámbito antes de trabajar', () => {
  for (const puerta of PUERTAS.filter(p => p.endsWith('route.ts'))) {
    const src = codigo(puerta)
    assert.match(
      src,
      /if\s*\(!acceso\.ok\)\s*return NextResponse\.json\(acceso\.cuerpo,\s*\{\s*status:\s*acceso\.status\s*\}\)/,
      `${puerta} no devuelve la denegación del ámbito: fail-closed significa CORTAR, no seguir`,
    )
  }
})

// ─── El ámbito puro: tres estados, tres respuestas ───────────────────────────

test('«pendiente» es 503 y «sin-asignar» es 403 — no se colapsan', () => {
  const pendiente = denegacionAmbito(resolverAmbito({ cuentaId: 'c1', migrado: false, correduriaId: null }))
  const sinAsignar = denegacionAmbito(resolverAmbito({ cuentaId: 'c1', migrado: true, correduriaId: null }))
  assert.equal(pendiente?.status, 503, '«no se sabe todavía» no puede contestarse como un rechazo firme')
  assert.equal(sinAsignar?.status, 403, '«esta cuenta no es de la correduría» es una ausencia COMPROBADA')
  assert.equal(pendiente?.cuerpo.motivo, 'pendiente')
  assert.equal(sinAsignar?.cuerpo.motivo, 'sin-asignar')
  // Y ninguno de los dos promete que no haya datos.
  assert.ok((pendiente?.cuerpo.error ?? '').length > 0)
  assert.ok((sinAsignar?.cuerpo.error ?? '').length > 0)
})

test('con ámbito «ok» no hay denegación: la guarda no bloquea a quien sí es de la correduría', () => {
  const ok = denegacionAmbito(resolverAmbito({ cuentaId: 'c1', migrado: true, correduriaId: 'cor-1' }))
  assert.equal(ok, null)
})

// ─── El login ────────────────────────────────────────────────────────────────

test('el login de asegura tiene rate limit por IP y por email', () => {
  const src = codigo('apps/asegura/app/api/auth/login/route.ts')
  assert.match(src, /from '@\/lib\/rate-limit'/, 'el login no importa el limitador')
  assert.match(src, /rateLimit\(`login:ip:/, 'falta el tope por IP')
  assert.match(src, /rateLimit\(`login:email:/, 'falta el tope por email (fuerza bruta contra UNA cuenta)')
  assert.match(src, /status:\s*429/, 'el tope no contesta 429')
})

test('el login compara SIEMPRE un bcrypt, exista la cuenta o no (oráculo de tiempo)', () => {
  const src = codigo('apps/asegura/app/api/auth/login/route.ts')
  // El hash de descarte tiene que estar y tiene que ser el fallback de la
  // comparación: sin él, un email inexistente contesta mucho antes y se
  // enumeran las cuentas de TODA la casa de marcas cronometrando 401s.
  assert.match(src, /\$2[aby]\$12\$/, 'falta un bcrypt de descarte de cost 12')
  assert.match(
    src,
    /verifyPassword\(\s*password,\s*cuenta\?\.passwordHash\s*\|\|\s*HASH_DESCARTE\s*\)/,
    'la comparación sigue cortocircuitando cuando la cuenta no existe',
  )
})

// ─── La sesión: no revocable, y por eso CORTA ────────────────────────────────

test('la sesión de asegura no dura 30 días mientras no se pueda revocar', () => {
  const src = codigo('apps/asegura/lib/auth.ts')
  // 🪤 Ojo con este match: la primera versión de este cepo leía `(\d+)` y con
  // `HORAS_SESION = 24 * 30` se quedaba con el «24» y pasaba tan contento sobre
  // una sesión de 30 días. Por eso ahora se exige un entero PELADO y se compara
  // el valor entero: un cepo que solo lee el primer número no vigila nada.
  const m = src.match(/const HORAS_SESION = ([^\n]+)/)
  assert.ok(m, 'no hay una constante única de caducidad')
  const crudo = m![1].trim()
  assert.match(crudo, /^\d+$/, `HORAS_SESION tiene que ser un entero pelado y es «${crudo}»`)
  const horas = Number(crudo)
  assert.ok(horas <= 24, `la sesión dura ${horas} h: sin revocación, un token robado vale ese tiempo entero`)
  // La cookie y el JWT salen de la MISMA constante: si divergieran, el token
  // copiado sobreviviría a la cookie.
  assert.match(src, /maxAge: 60 \* 60 \* HORAS_SESION/)
  assert.match(src, /expiresIn: `\$\{HORAS_SESION\}h`/)
})
