// Guardián de la rotación de claves de Supabase. `node --test` (gate en `pnpm test:guardia`).
//
// Contexto: la `service_role` legacy estuvo pública ~3 meses y hay que poder desactivarla. El
// botón del panel («Disable JWT-based API keys») mata a la vez la `service_role` y la `anon`
// legacy, así que TODO consumidor tiene que hablar ya con las claves nuevas y caer a la legacy
// solo mientras convivan. Plan e inventario: docs/ROTACION-SERVICE-ROLE.md
//
// Qué vigila, y por qué cada cosa:
//  1. Que nadie vuelva a leer la clave legacy A PELO. Un `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`
//     nuevo en una función copiada de otra es invisible: funciona perfectamente HOY y muere en
//     silencio el día de la rotación.
//  2. Que los helpers duplicados (uno por raíz de despliegue / por app) no se separen entre sí.
//  3. Que el orden de preferencia siga siendo nueva→legacy. Es la aserción que de verdad
//     importa y la única que no se ve leyendo el diff: invertirla deja el código con el mismo
//     aspecto, en verde, y sin migrar nada.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

const HELPER_EDGE = 'apps/ia-rest/supabase/functions/_shared/clave-supabase.ts'
const HELPER_EDGE_COPIA = 'supabase/functions-rescatadas/_shared/clave-supabase.ts'
const HELPER_APP = 'apps/ia-rest/src/lib/claves-supabase.ts'
const HELPER_APP_COPIAS = [
  'apps/ialimp/lib/claves-supabase.ts',
  'apps/sivra/lib/claves-supabase.ts',
  'apps/rrhh/lib/claves-supabase.ts',
]
const HELPERS = new Set([HELPER_EDGE, HELPER_EDGE_COPIA, HELPER_APP, ...HELPER_APP_COPIAS])

// El literal de la `anon` legacy sigue en `bridge-v6.js` a propósito: ese binario corre en el PC
// del restaurante y no se actualiza solo, así que se deja como último recurso. Está declarado
// aquí para que no se cuele otro sitio con la misma excusa sin que nadie lo vea.
const EXCEPCIONES_LITERAL_ANON = ['apps/ia-rest/scripts/bridge-v6/bridge-v6.js']

function ficherosDeCodigo(): string[] {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\n').filter(Boolean).filter((f) => {
    if (f.includes('node_modules')) return false
    if (f.startsWith('test/')) return false // este propio fichero cita los patrones
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f)
  })
}

function leer(f: string): string {
  return readFileSync(join(ROOT, f), 'utf8')
}

test('ninguna Edge Function lee la clave legacy de Supabase a pelo', () => {
  const culpables: string[] = []
  for (const f of ficherosDeCodigo()) {
    if (HELPERS.has(f)) continue
    if (!f.includes('supabase/functions')) continue
    const lineas = leer(f).split('\n')
    lineas.forEach((linea, i) => {
      if (/Deno\.env\.get\(\s*['"]SUPABASE_(SERVICE_ROLE|ANON)_KEY['"]\s*\)/.test(linea)) {
        culpables.push(`${f}:${i + 1}  ${linea.trim()}`)
      }
    })
  }
  assert.deepEqual(
    culpables,
    [],
    'Edge Function leyendo la clave LEGACY directamente. Usa claveSecreta()/clavePublicable() de ' +
    '_shared/clave-supabase.ts — si no, el día que se desactiven las claves legacy esto muere sin ' +
    'avisar:\n  - ' + culpables.join('\n  - '),
  )
})

test('ningún código de app lee la anon legacy a pelo', () => {
  // Las tres formas: `process.env.X`, `process.env['X']` y el nombre suelto dentro de un
  // destructuring de `process.env`. Las dos últimas son justo las que el docblock del helper
  // desaconseja (Next no las sustituye en build), así que un guardián que solo mirase la primera
  // dejaría pasar precisamente el caso que rompe en el navegador.
  const FORMAS = [
    /process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    /process\.env\s*\[\s*['"`]NEXT_PUBLIC_SUPABASE_ANON_KEY['"`]\s*\]/,
    /\{[^}]*\bNEXT_PUBLIC_SUPABASE_ANON_KEY\b[^}]*\}\s*=\s*process\.env/,
  ]
  const culpables: string[] = []
  for (const f of ficherosDeCodigo()) {
    if (HELPERS.has(f)) continue
    const lineas = leer(f).split('\n')
    lineas.forEach((linea, i) => {
      if (linea.trimStart().startsWith('//') || linea.trimStart().startsWith('*')) return
      if (FORMAS.some((re) => re.test(linea))) culpables.push(`${f}:${i + 1}  ${linea.trim()}`)
    })
  }
  assert.deepEqual(
    culpables,
    [],
    'Código de app leyendo NEXT_PUBLIC_SUPABASE_ANON_KEY directamente. Usa clavePublicable() de ' +
    'lib/claves-supabase:\n  - ' + culpables.join('\n  - '),
  )
})

test('toda llamada a mano al Storage de Supabase manda `apikey`, no solo `Authorization`', () => {
  // Medido el 11/09/2026: Storage responde 403 `Invalid Compact JWS` si la clave NUEVA va solo en
  // `Authorization: Bearer` (con la `anon` legacy, que es un JWT, sí funcionaba). O sea: un sitio
  // así se ve sano hoy y se cae entero el día de la rotación. Este cepo mira los ficheros que
  // hablan con `/storage/v1` y exige que cada cabecera `Authorization` tenga un `apikey` cerca.
  const culpables: string[] = []
  for (const f of ficherosDeCodigo()) {
    if (HELPERS.has(f)) continue
    const src = leer(f)
    if (!src.includes('/storage/v1')) continue
    const lineas = src.split('\n')
    lineas.forEach((linea, i) => {
      if (!/Authorization['"]?\s*:\s*[`'"]Bearer /.test(linea)) return
      // El `apikey` puede ir en la misma línea o venir de un spread de cabeceras.
      const ventana = lineas.slice(Math.max(0, i - 3), i + 4).join('\n')
      if (/apikey/i.test(ventana) || /cabecerasClave\(/.test(ventana)) return
      culpables.push(`${f}:${i + 1}  ${linea.trim()}`)
    })
  }
  assert.deepEqual(
    culpables,
    [],
    'Llamada a Storage con `Authorization: Bearer` y sin `apikey`. Con las claves nuevas eso es un ' +
    '403 `Invalid Compact JWS`. Usa cabecerasClave():\n  - ' + culpables.join('\n  - '),
  )
})

test('la anon legacy no se escribe como literal en el repo (salvo excepción declarada)', () => {
  // Prefijo de un JWT de Supabase con `"role":"anon"`; basta el arranque del payload.
  const PATRON = /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZSI/
  const culpables = ficherosDeCodigo()
    .filter((f) => !EXCEPCIONES_LITERAL_ANON.includes(f))
    .filter((f) => PATRON.test(leer(f)))
  assert.deepEqual(culpables, [], 'JWT de Supabase escrito a mano en el repo: ' + culpables.join(', '))
})

test('los helpers duplicados son idénticos entre sí', () => {
  assert.equal(leer(HELPER_EDGE_COPIA), leer(HELPER_EDGE),
    `${HELPER_EDGE_COPIA} se ha separado de ${HELPER_EDGE}. Son dos raíces de despliegue distintas ` +
    '(las funciones de ia-rest y las rescatadas), así que el fichero se copia — pero copiado NO ' +
    'quiere decir divergente: vuelve a copiarlo.')
  for (const copia of HELPER_APP_COPIAS) {
    assert.equal(leer(copia), leer(HELPER_APP), `${copia} se ha separado de ${HELPER_APP}.`)
  }
})

// ── Comportamiento, no texto ──────────────────────────────────────────────────
// Los dos tests de abajo EJECUTAN los helpers. Un guardián que solo mirase el fuente pasaría
// con el orden de preferencia invertido, que es justo el fallo que deja la rotación sin hacer.

test('el helper de Edge Functions prefiere la clave nueva y cae a la legacy', async () => {
  const entorno: Record<string, string> = {}
  ;(globalThis as unknown as { Deno: unknown }).Deno = {
    env: { get: (k: string) => entorno[k] },
  }
  const mod = await import('../apps/ia-rest/supabase/functions/_shared/clave-supabase.ts')

  entorno.SUPABASE_SECRET_KEYS = JSON.stringify({ default: 'sb_secret_NUEVA' })
  entorno.SUPABASE_SERVICE_ROLE_KEY = 'jwt.legacy'
  assert.equal(mod.claveSecreta(), 'sb_secret_NUEVA', 'con las dos, manda la NUEVA')
  assert.equal(mod.origenClaveSecreta(), 'nueva')
  assert.deepEqual(mod.cabecerasServicio(), { apikey: 'sb_secret_NUEVA' },
    '`apikey` es la única cabecera que aceptan los tres subsistemas con la clave nueva (Storage ' +
    'rechaza el Bearer con 403 `Invalid Compact JWS`)')

  delete entorno.SUPABASE_SECRET_KEYS
  assert.equal(mod.claveSecreta(), 'jwt.legacy', 'sin la nueva, CAE a la legacy (si no, app muerta)')
  assert.equal(mod.origenClaveSecreta(), 'legacy')
  assert.deepEqual(mod.cabecerasServicio(),
    { Authorization: 'Bearer jwt.legacy', apikey: 'jwt.legacy' })

  entorno.SUPABASE_SECRET_KEYS = 'esto no es json'
  assert.equal(mod.claveSecreta(), 'jwt.legacy', 'JSON ilegible no debe tumbar la función')

  entorno.SUPABASE_SECRET_KEYS = JSON.stringify({ otra: 'x' })
  assert.equal(mod.claveSecreta(), 'jwt.legacy', 'sin la entrada "default" tampoco')

  entorno.SUPABASE_PUBLISHABLE_KEYS = JSON.stringify({ default: 'sb_publishable_NUEVA' })
  entorno.SUPABASE_ANON_KEY = 'jwt.anon.legacy'
  assert.equal(mod.clavePublicable(), 'sb_publishable_NUEVA')
  delete entorno.SUPABASE_PUBLISHABLE_KEYS
  assert.equal(mod.clavePublicable(), 'jwt.anon.legacy')

  delete entorno.SUPABASE_SERVICE_ROLE_KEY
  delete entorno.SUPABASE_SECRET_KEYS
  assert.throws(() => mod.claveSecreta(), /Sin clave de servicio/,
    'sin ninguna clave hay que fallar fuerte, no hablar sin credencial')
})

test('el helper de las apps prefiere la publicable nueva y cae a la anon legacy', async () => {
  const previo = {
    nueva: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    legacy: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }
  const mod = await import('../apps/ia-rest/src/lib/claves-supabase.ts')
  try {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_NUEVA'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'jwt.anon.legacy'
    assert.equal(mod.clavePublicable(), 'sb_publishable_NUEVA', 'con las dos, manda la NUEVA')
    assert.equal(mod.origenClavePublicable(), 'nueva')

    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    assert.equal(mod.clavePublicable(), 'jwt.anon.legacy', 'sin la nueva, CAE a la legacy')
    assert.equal(mod.origenClavePublicable(), 'legacy')
    assert.equal(mod.hayClavePublicable(), true)

    assert.deepEqual(mod.cabecerasClave(), {
      apikey: 'jwt.anon.legacy',
      Authorization: 'Bearer jwt.anon.legacy',
    }, 'Storage exige `apikey` con las claves nuevas: cabecerasClave manda SIEMPRE las dos')
    assert.deepEqual(mod.cabecerasClave('sb_secret_OTRA'), {
      apikey: 'sb_secret_OTRA',
      Authorization: 'Bearer sb_secret_OTRA',
    }, 'y acepta una clave explícita (los sitios que usan la de servicio)')

    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = '   '
    assert.equal(mod.origenClavePublicable(), 'legacy',
      'una variable en blanco es una variable SIN poner, no una clave que falla todo')

    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    assert.equal(mod.clavePublicable(), '', 'sin ninguna: cadena vacía, no undefined')
    assert.equal(mod.origenClavePublicable(), null)
    assert.equal(mod.hayClavePublicable(), false)
  } finally {
    if (previo.nueva === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previo.nueva
    if (previo.legacy === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previo.legacy
  }
})
