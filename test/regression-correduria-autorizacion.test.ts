// Guardián de la PUERTA de la correduría en `apps/plataforma` (`node --test`,
// gate en CI vía `pnpm test`).
//
// ─── Qué pasó ────────────────────────────────────────────────────────────────
// Hasta el 20/09/2026 la cartera de Grupo ASegura estaba abierta a internet, y
// no hacía falta romper nada para leerla. Tres piezas, cada una razonable por
// separado:
//
//   1. `POST /api/auth/register` era PÚBLICO (estaba en la lista `PUBLIC` del
//      middleware), no pedía invitación y devolvía la cookie de sesión EN LA
//      MISMA RESPUESTA que creaba la cuenta.
//   2. Las ~45 rutas de `/api/correduria/**` tenían como ÚNICA guarda
//      `const session = await getSession(); if (!session) return 401`. Con
//      sesión, cualquiera pasaba.
//   3. `app/(usuario)/layout.tsx` solo acota el rol `'empresas'`, y las TRES
//      cuentas reales de `public.cuentas` tienen `rol = null`.
//
// Resultado: registrarse y pedir `/api/correduria/cartera-lista?formato=csv`
// devolvía hasta 2.000 fichas con DNI, teléfono, correo y dirección
// DESCIFRADOS. Este fichero impide que vuelva cualquiera de las tres.
//
// ─── Por qué lee el FUENTE ───────────────────────────────────────────────────
// Importar `lib/correduria-acceso.ts` arrastraría `@prisma/client` y
// `next/server`, y el job `Tests (packages + guardián)` corre SIN
// `prisma generate`. Además, lo que se vigila aquí —que una ruta nueva no nazca
// sin guarda— no es algo que `tsc` ni el build puedan mirar: la guarda vieja
// compila igual de bien que la nueva.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const PLATAFORMA = join(RAIZ, 'apps', 'plataforma')

const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')

/** Quita comentarios sin romper las cadenas: si no, el cepo se dispara con los
 *  comentarios que EXPLICAN la regla, que es el error clásico de estos ficheros. */
function sinComentarios(src: string): string {
  let out = ''
  let i = 0
  let comilla: string | null = null
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (comilla) {
      if (c === '\\') { out += c + (d ?? ''); i += 2; continue }
      if (c === comilla) comilla = null
      out += c; i++; continue
    }
    if (c === '"' || c === "'" || c === '`') { comilla = c; out += c; i++; continue }
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    out += c; i++
  }
  return out
}

/** Todos los `route.ts` de `app/api/correduria/**`, como rutas relativas a la raíz. */
function rutasCorreduria(): string[] {
  const base = join(PLATAFORMA, 'app', 'api', 'correduria')
  const encontrados: string[] = []
  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) recorrer(p)
      else if (e.name === 'route.ts') encontrados.push(p.slice(RAIZ.length + 1))
    }
  }
  recorrer(base)
  return encontrados.sort()
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) TODA ruta de la correduría pasa por la guarda nueva
// ─────────────────────────────────────────────────────────────────────────────

test('toda ruta de /api/correduria invoca exigirCorreduria', () => {
  const rutas = rutasCorreduria()
  // Cepo del cepo: si el recorrido dejara de encontrar ficheros, las dos
  // aserciones de abajo pasarían sobre una lista vacía y este guardián sería
  // verde el 100% de las veces sin vigilar nada.
  assert.ok(rutas.length >= 40, `se esperaban >=40 rutas de correduría, se encontraron ${rutas.length}`)

  const sinGuarda = rutas.filter((r) => !sinComentarios(leer(r)).includes('exigirCorreduria('))
  assert.deepEqual(
    sinGuarda,
    [],
    'estas rutas de la correduría no llaman a exigirCorreduria(): servirían la cartera a cualquiera con sesión',
  )
})

test('ninguna ruta de /api/correduria se queda con la guarda vieja de solo-sesión', () => {
  const conGuardaVieja = rutasCorreduria().filter((r) => {
    const src = sinComentarios(leer(r))
    return /\bgetSession\s*\(/.test(src) || /from\s+'@\/lib\/session'/.test(src)
  })
  assert.deepEqual(
    conGuardaVieja,
    [],
    '«hay sesión» NO es «es de la correduría»: estas rutas volvieron a la guarda que abrió la cartera',
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// 2) El registro ya no es público
// ─────────────────────────────────────────────────────────────────────────────

/** Las entradas de la lista `PUBLIC` del middleware, sin comentarios. */
function listaPublic(): string[] {
  const src = sinComentarios(leer('apps/plataforma/middleware.ts'))
  const m = src.match(/const PUBLIC\s*=\s*\[([\s\S]*?)\]/)
  assert.ok(m, 'no se ha encontrado la lista PUBLIC en middleware.ts')
  return [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

test('/register NO está en la lista PUBLIC del middleware', () => {
  const publicas = listaPublic()
  // Control: si el parseo se rompiera, la ausencia de '/register' sería
  // trivialmente cierta y este cepo miraría al sitio equivocado.
  assert.ok(publicas.includes('/login'), 'el parseo de PUBLIC no funciona: ni siquiera encuentra /login')
  assert.ok(
    !publicas.includes('/register'),
    '/register público = cualquiera se crea cuenta desde internet y recibe la cookie de sesión',
  )
})

test('el alta de cuenta es fail-closed: sin código de invitación configurado no se crea nada', () => {
  const src = sinComentarios(leer('apps/plataforma/app/api/auth/register/route.ts'))
  assert.match(
    src,
    /REGISTRO_INVITACION_CODIGO/,
    'el alta no menciona la env de invitación: ha vuelto a ser abierta',
  )
  // La guarda tiene que estar ANTES de crear la cuenta, no después.
  const guarda = src.search(/if\s*\(\s*!\s*esperado\s*\)/)
  const creacion = src.search(/prisma\.cuenta\.create/)
  assert.ok(guarda > -1, 'falta la guarda de env ausente en el alta')
  assert.ok(creacion > -1, 'no se encuentra la creación de la cuenta')
  assert.ok(guarda < creacion, 'la guarda de invitación va DESPUÉS de crear la cuenta: no guarda nada')
})

// ─────────────────────────────────────────────────────────────────────────────
// 3) El helper de acceso es fail-closed
// ─────────────────────────────────────────────────────────────────────────────

const HELPER = 'apps/plataforma/lib/correduria-acceso.ts'

test('el helper solo autoriza con estado autorizado (y un fallo de lectura no autoriza)', () => {
  const src = sinComentarios(leer(HELPER))

  // `ok: true` sale de una sola puerta, y esa puerta comprueba el estado.
  const oks = [...src.matchAll(/return\s*\{\s*ok:\s*true/g)]
  assert.equal(oks.length, 1, 'hay más de un camino que devuelve ok:true: la puerta deja de ser una')
  const comprobacion = src.search(/acceso\.estado\s*===\s*'autorizado'/)
  assert.ok(comprobacion > -1, 'nadie comprueba que el estado sea autorizado')
  assert.ok(comprobacion < oks[0].index!, 'se devuelve ok:true antes de comprobar el estado')

  // El catch de la consulta canónica NO puede autorizar: un fallo de BD no es
  // «es de la casa», ni tampoco «no lo es».
  const m = src.match(/catch\s*\{([\s\S]*?)\n\s{2}\}/)
  assert.ok(m, 'no se encuentra el catch de la consulta a seguros.usuarios')
  assert.ok(!/autorizado/.test(m![1]), 'el catch de la consulta autoriza: un fallo de BD abriría la cartera')
})

test('el helper distingue «no es de la casa» de «no se ha podido comprobar»', () => {
  const src = sinComentarios(leer(HELPER))
  assert.match(src, /'no-autorizado'/, 'falta el estado de ausencia COMPROBADA')
  assert.match(src, /'sin-comprobar'/, 'falta el estado de «no se sabe»: se colapsaría con «no es de la casa»')
  assert.match(src, /status:\s*403/, 'falta el 403 de «con sesión y sin acceso»')
  assert.match(src, /status:\s*401/, 'falta el 401 de «sin sesión»')
  assert.match(src, /status:\s*503/, 'falta el 503 de «no se ha podido comprobar»')
})

test('una lista de acceso ausente o vacía NO autoriza a nadie', () => {
  const src = sinComentarios(leer(HELPER))
  // `listaCorreduria` devuelve null (= «no se sabe quién es de la casa») cuando
  // la env no está o está en blanco; el llamante convierte ese null en
  // `sin-comprobar`, que DENIEGA. Si alguna vez devolviera [] el flujo caería
  // en «no-autorizado» por otro camino, pero lo que no puede pasar nunca es
  // que una lista ausente se lea como «pasan todos».
  assert.match(
    src,
    /emails\.length\s*>\s*0\s*\?\s*emails\s*:\s*null/,
    'listaCorreduria ya no distingue «env sin poner» de «lista vacía»',
  )
  assert.match(
    src,
    /if\s*\(\s*!lista\s*\)\s*\{[\s\S]*?'sin-comprobar'/,
    'sin lista configurada el helper debe quedarse en sin-comprobar (denegar), no seguir adelante',
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// 4) La pantalla también cierra (no solo las APIs)
// ─────────────────────────────────────────────────────────────────────────────

test('el layout de /correduria comprueba el acceso en servidor', () => {
  const src = sinComentarios(leer('apps/plataforma/app/(usuario)/correduria/layout.tsx'))
  assert.match(src, /resolverAccesoCorreduria\(/, 'el layout de la correduría no comprueba el acceso')
  assert.match(src, /redirect\(/, 'el layout no redirige a quien no está autorizado')
})
