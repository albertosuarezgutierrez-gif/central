// Edge Functions de Supabase con verify_jwt=false: o comprueban credencial, o son públicas
// POR DISEÑO y están en una lista explícita (02/11/2026, auditoría de BD).
//
// Por qué: con verify_jwt=false el gateway de Supabase no mira nada; la función es una URL
// abierta. Se encontraron tg-send (comparaba `x-secret` con un LITERAL escrito en un repo
// público y lo mandaba el navegador), push-send, notify-error, test-runner (quema LLM),
// cobro-stripe/cobro-monei (crean cobros en datáfono) y los crons de pg_cron sin cabecera.
//
// Regla que vigila este cepo:
//   1) Toda función del repo que NO esté desplegada con verify_jwt=true, NO sea pública por
//      diseño y NO esté en la deuda conocida, importa `_shared/auth-interna.ts` y llama a
//      `exigirServicio(`, `exigirServicioOSecreto(` o `secretoEnValor(` (fail-closed, tiempo constante).
//   2) Ninguna función compara una cabecera/PIN/secreto con un literal, ni declara un
//      secreto/PIN como literal.
//   3) La deuda conocida solo puede ENCOGER: si una función de la lista ya está arreglada o
//      ya no existe, hay que quitarla de la lista (si no, la lista se pudre y tapa nuevas).
//
// Fuente de verify_jwt: el repo NO tiene supabase/config.toml; el estado real se leyó con
// `list_edge_functions` (proyecto wswbehlcuxqxyinousql) el 02/11/2026 y se congela abajo.
// Una función NUEVA que no esté en VERIFY_JWT_TRUE se trata como verify_jwt=false: es el
// estado conservador (lo que hace el despliegue por MCP si no se indica).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const DIRS = ['apps/ia-rest/supabase/functions', 'supabase/functions-rescatadas']

/** Desplegadas con verify_jwt=true (list_edge_functions, 02/11/2026). Ojo: la anon key es
 *  pública, así que verify_jwt=true tampoco es «autenticado»; queda fuera de este cepo. */
const VERIFY_JWT_TRUE = new Set([
  'github-commit', 'trigger-redeploy', 'trigger-deploy', 'deploy-agente', 'upload-photo-github',
  'upload-landing', 'drive-photos-publish', 'merge-landing-to-main', 'add-smoobu-booking',
  'push-clean-page', 'drive-upload-factura', 'push-route-ga4', 'inject-ga4', 'monitor-health',
  'stripe-checkout', 'analizar-cv', 'lead-research', 'ig-video-gen', 'rehost-catalogo',
  'junta-pdf-texto', 'ses-probar', 'nim-catalogo-temp', 'img-b64',
])

/** Públicas por diseño: nombres EXACTOS (sin prefijos: un `qr-admin` nuevo no se cuela). */
const PUBLICAS_POR_DISENO = new Set([
  'auth-register', 'auth-verify-sms', 'recuperar-pin',
  'qr-assistant', 'qr-call-waiter', 'qr-cobro', 'qr-connect', 'qr-order', 'qr-session', 'qr-split',
  'webhook-stripe', 'webhook-monei', // firma del proveedor (STRIPE_/MONEI_WEBHOOK_SECRET)
  'bridge-agent', // token X-Bridge-Token contra iarest.bridge_tokens
])

/** verify_jwt=false SIN credencial, fuera del alcance del arreglo del 02/11/2026.
 *  Solo puede encoger (ver test 3). Candidatas a borrar: docs/…/fix-bd.md §1. */
const DEUDA_CONOCIDA = new Set([
  'auth-pin-validate', 'brain', 'brain-parse', 'check-elaboraciones', 'contact-lead',
  'courier-route', 'daily-briefing', 'ear-transcribe', 'kds-token-validate', 'menu-stockout',
  'nim-diagnostico', 'nim-sentiment', 'owner-panel', 'verifactu-sign', 'vox-confirm',
  // supabase/functions-rescatadas
  'boe-doc', 'deploy-dashboard', 'drive-folder-list', 'ficha-fotocasa', 'import_csv', 'sync-smoobu',
  'zona-fotocasa',
])

const sinComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

export function funciones(): Array<{ slug: string; ruta: string }> {
  const out: Array<{ slug: string; ruta: string }> = []
  for (const d of DIRS) {
    const abs = join(RAIZ, d)
    if (!existsSync(abs)) continue
    for (const slug of readdirSync(abs)) {
      if (slug.startsWith('_')) continue
      const ruta = join(d, slug, 'index.ts')
      if (statSync(join(abs, slug)).isDirectory() && existsSync(join(RAIZ, ruta))) out.push({ slug, ruta })
    }
  }
  return out
}

/** ¿La fuente exige credencial con el helper compartido? */
export function compruebaCredencial(fuente: string): boolean {
  const f = sinComentarios(fuente)
  return /from\s+["']\.\.\/_shared\/auth-interna\.ts["']/.test(f) &&
    /\b(exigirServicio|exigirServicioOSecreto|secretoEnValor)\s*\(/.test(f)
}

/** Comparaciones/declaraciones de secreto con literal. Devuelve los trozos que casan. */
export function literalesDeSecreto(fuente: string): string[] {
  const f = sinComentarios(fuente)
  const patrones = [
    // headers.get('x-…') === 'literal'  /  'literal' !== headers.get(…)
    /headers\.get\([^)]*\)\s*[!=]==?\s*["'`][^"'`]+["'`]/g,
    /["'`][^"'`]+["'`]\s*[!=]==?\s*\w*\.?headers\.get\(/g,
    // secret/pin/token/clave/password === 'literal'
    /\b\w*(secret|pin|token|clave|password)\w*\s*[!=]==?\s*["'`][^"'`]{3,}["'`]/gi,
    // const SUPER_PIN = "9999" / const SECRET = '…'
    /\bconst\s+\w*(SECRET|PIN|PASSWORD|CLAVE)\w*\s*=\s*["'`][^"'`]+["'`]/g,
  ]
  return patrones.flatMap(p => [...f.matchAll(p)].map(m => m[0]))
}

test('toda edge function verify_jwt=false comprueba credencial o está en una lista explícita', () => {
  const sinAuth: string[] = []
  for (const { slug, ruta } of funciones()) {
    if (VERIFY_JWT_TRUE.has(slug) || PUBLICAS_POR_DISENO.has(slug) || DEUDA_CONOCIDA.has(slug)) continue
    if (!compruebaCredencial(readFileSync(join(RAIZ, ruta), 'utf8'))) sinAuth.push(ruta)
  }
  assert.deepEqual(sinAuth, [], 'sin credencial: usa exigirServicio/exigirServicioOSecreto de _shared/auth-interna.ts')
})

test('ninguna edge function compara un secreto/PIN con un literal (tampoco las públicas ni la deuda)', () => {
  const malos: string[] = []
  for (const { ruta } of funciones()) {
    for (const m of literalesDeSecreto(readFileSync(join(RAIZ, ruta), 'utf8'))) malos.push(`${ruta}: ${m}`)
  }
  assert.deepEqual(malos, [])
})

test('la deuda conocida solo encoge: cada entrada existe y sigue SIN credencial', () => {
  const porSlug = new Map(funciones().map(f => [f.slug, f.ruta]))
  const sobran: string[] = []
  for (const slug of DEUDA_CONOCIDA) {
    const ruta = porSlug.get(slug)
    if (!ruta || compruebaCredencial(readFileSync(join(RAIZ, ruta), 'utf8'))) sobran.push(slug)
  }
  assert.deepEqual(sobran, [], 'quita de DEUDA_CONOCIDA las que ya no existen o ya están arregladas')
})

test('el literal antiguo de tg-send no vuelve ni en las funciones ni en ia-rest/src', () => {
  const viejo = ['iarest', 'tg', '2026'].join('-')
  const hits: string[] = []
  const recorrer = (dir: string) => {
    const abs = join(RAIZ, dir)
    if (!existsSync(abs)) return
    for (const n of readdirSync(abs)) {
      if (n === 'node_modules' || n === '.next') continue
      const p = join(dir, n)
      if (statSync(join(RAIZ, p)).isDirectory()) recorrer(p)
      else if (/\.(ts|tsx|js|mjs)$/.test(n) && readFileSync(join(RAIZ, p), 'utf8').includes(viejo)) hits.push(p)
    }
  }
  for (const d of [...DIRS, 'apps/ia-rest/src']) recorrer(d)
  assert.deepEqual(hits, [])
})

test('ia-rest no llama a tg-send desde el navegador (page/componente/hook)', () => {
  const pagina = readFileSync(join(RAIZ, 'apps/ia-rest/src/app/super/page.tsx'), 'utf8')
  assert.doesNotMatch(pagina, /functions\/v1\/tg-send/)
})

test('los detectores reconocen lo malo (si no, los cepos de arriba serían verdes por ceguera)', () => {
  const tgSendViejo = "const secret = req.headers.get('x-secret')\nif (secret !== 'abc-123') {"
  assert.equal(compruebaCredencial(tgSendViejo), false)
  assert.ok(literalesDeSecreto(tgSendViejo).length > 0)
  assert.ok(literalesDeSecreto('if (req.headers.get("x-secret") !== "abc") {}').length > 0)
  assert.ok(literalesDeSecreto('const SUPER_PIN = "9999";').length > 0)
  // Un comentario que importa el helper no cuenta como comprobación.
  assert.equal(compruebaCredencial("// import { exigirServicio } from '../_shared/auth-interna.ts'"), false)
  const bueno = "import { exigirServicio } from '../_shared/auth-interna.ts'\nconst no = exigirServicio(req)"
  assert.equal(compruebaCredencial(bueno), true)
  assert.deepEqual(literalesDeSecreto(bueno), [])
})

// ── Comportamiento del helper (se importa el .ts de Deno: solo usa Deno.env si no se inyecta env) ──
const AUTH = '../apps/ia-rest/supabase/functions/_shared/auth-interna.ts'

test('auth-interna: fail-closed sin variables (ni clave de servicio ni secreto propio)', async () => {
  const m = await import(AUTH)
  const vacio = () => undefined
  const h = new Headers({ apikey: 'x', authorization: 'Bearer x', 'x-internal-secret': 'x' })
  assert.equal(m.esLlamadaDeServicio(h, vacio), false)
  assert.equal(m.secretoValido(h, 'TG_SEND_SECRET', 'x-internal-secret', vacio), false)
  assert.equal(m.secretoEnValor('x', 'IA_TRAINING_DASHBOARD_PIN', vacio), false)
  assert.equal(m.secretoEnValor('', 'X', () => ''), false, 'variable vacía = no configurada')
  const r = m.exigirServicioOSecreto(new Request('https://x', { headers: h }), 'TG_SEND_SECRET', 'x-internal-secret', {}, vacio)
  assert.equal(r?.status, 401)
})

test('auth-interna: acepta la clave de servicio (nueva o legacy) en apikey o Bearer, y solo esa', async () => {
  const m = await import(AUTH)
  const env = (n: string) => ({
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_nueva' }),
    SUPABASE_SERVICE_ROLE_KEY: 'legacy-jwt',
    TG_SEND_SECRET: 's3creto-largo',
  } as Record<string, string>)[n]
  assert.equal(m.esLlamadaDeServicio(new Headers({ apikey: 'sb_secret_nueva' }), env), true)
  assert.equal(m.esLlamadaDeServicio(new Headers({ authorization: 'Bearer legacy-jwt' }), env), true)
  assert.equal(m.esLlamadaDeServicio(new Headers({ authorization: 'Bearer sb_secret_nuev' }), env), false, 'prefijo no vale')
  assert.equal(m.esLlamadaDeServicio(new Headers({ apikey: 'sb_publishable_x' }), env), false)
  assert.equal(m.secretoValido(new Headers({ 'x-internal-secret': 's3creto-largo' }), 'TG_SEND_SECRET', 'x-internal-secret', env), true)
  assert.equal(m.secretoValido(new Headers({ 'x-secret': 's3creto-largo' }), 'TG_SEND_SECRET', 'x-internal-secret', env), false, 'otra cabecera no vale')
  assert.equal(m.exigirServicio(new Request('https://x', { headers: { apikey: 'sb_secret_nueva' } }), {}, env), null)
})
