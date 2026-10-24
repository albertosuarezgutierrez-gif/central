// Cepo de «Inicio» del portal (24/10/2026, spec `docs/superpowers/specs/2026-10-24-portal-inicio-herramientas-oportunidades.md` §1).
//
// Vigila lo que las reglas puras (`lib/inicio-tarjetas.test.ts`) no pueden ver:
//   1. tras el login y desde `/` se llega a `/inicio`; `/boveda` sigue existiendo (enlaces profundos);
//   2. la barra móvil es `Inicio · Seguros · Siniestros · WhatsApp · Más` (Inicio sustituye a Recibos, Alberto 24/10);
//   3. cada fuente de Inicio se lee por separado (`allSettled`) y la que falla es «sin comprobar», nunca vacía;
//   4. leer no escribe: Inicio no sincroniza obligaciones ni registra usos de autorizaciones;
//   5. en Inicio no hay «no tienes», «0 pólizas», «Hola, cliente» ni `?? 0` / `?? []`.
// Los comentarios se quitan antes de mirar: un cepo de texto que se satisface con un comentario no cepa nada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const leer = (f: string) => sinComentarios(readFileSync(join(ROOT, f), 'utf8'))

const PORTAL = 'apps/asegura-portal'
const PAGINA = `${PORTAL}/app/(portal)/inicio/page.tsx`
const LECTURA = `${PORTAL}/lib/inicio.ts`
const TARJETAS = `${PORTAL}/lib/inicio-tarjetas.ts`

test('🚨 tras el login y desde la raíz se llega a /inicio (por defecto), y la bóveda sigue en su sitio', () => {
  assert.match(leer(`${PORTAL}/app/page.tsx`), /redirect\('\/inicio'\)/)
  assert.match(leer(`${PORTAL}/app/api/acceso/verificar/route.ts`), /let irA = '\/inicio'/)
  assert.match(leer(`${PORTAL}/app/Entrada.tsx`), /\? cuerpo\.irA : '\/inicio'/)
  assert.doesNotMatch(leer(`${PORTAL}/app/page.tsx`), /redirect\('\/boveda'\)/)
  // `/boveda` NO se redirige: la usan push, invitaciones, vista previa y los marcadores de la gente.
  assert.doesNotMatch(leer(`${PORTAL}/app/(portal)/boveda/page.tsx`), /redirect\('\/inicio'\)/)
})

test('🚨 barra móvil: Inicio · Seguros · Siniestros (+ WhatsApp + Más); Recibos sale de la barra, no del cajón', async () => {
  const nav = leer(`${PORTAL}/app/(portal)/NavPortal.tsx`)
  const m = /const TABBAR = \[([\s\S]*?)\] as const/.exec(nav)
  assert.ok(m, 'no encuentro TABBAR')
  const hrefs = [...m[1].matchAll(/href: '([^']+)'/g)].map((x) => x[1])
  assert.deepEqual(hrefs, ['/inicio', '/boveda', '/boveda?vista=siniestro'])
  assert.match(nav, /portal-tabbar-wsp/, 'WhatsApp sigue en la barra')
  assert.match(nav, /aria-label="Más secciones"/, '«Más» sigue en la barra')
  const { pestanasPortal } = await import('../packages/module-seguros-portal/src/vista-portal.ts')
  const p = pestanasPortal()
  assert.deepEqual(p[0], { vista: null, etiqueta: 'Inicio', href: '/inicio' })
  assert.ok(p.some((x) => x.href === '/boveda?vista=recibos'), 'Recibos sigue en el cajón')
})

test('el logo de la cabecera lleva a Inicio (por la raíz, que decide con o sin sesión)', () => {
  assert.match(leer(`${PORTAL}/app/layout.tsx`), /<a href="\/" className="marca-inicio"/)
})

test('🚨 cada fuente por separado: allSettled, y la que falla queda en null (sin comprobar)', () => {
  const src = leer(LECTURA)
  assert.match(src, /await Promise\.allSettled\(\[/)
  for (const f of ['cartera', 'declaradas', 'flota', 'calendario', 'sugerencia']) {
    assert.match(src, new RegExp(`valor\\(r\\w+, '${f}'\\)`), `la fuente «${f}» no pasa por valor()`)
  }
  assert.match(src, /if \(r\.status === 'fulfilled'\) return r\.value\s+console\.error[^\n]*\n\s+return null/)
  // Patrimonio: su propio try/catch → null (sin comprobar), nunca 'no_disponible' por un fallo.
  assert.match(src, /catch \(e\) \{\s+console\.error\('\[portal\/inicio\] fuente «patrimonio» sin comprobar:', motivo\(e\)\)\s+patrimonio = null/)
})

test('🚨 Inicio parte de la cookie y LEER NO ESCRIBE', () => {
  const src = leer(LECTURA)
  assert.match(src, /const sesion = await getIdentidad\(\)\s+if \(!sesion \|\| sesion\.id !== identidadId\) return null/)
  assert.match(src, /carteraDeIdentidad\(identidadId\)/)
  for (const prohibido of [/sincronizarObligaciones/, /registrarUso/, /\.create\(/, /\.update(Many)?\(/, /\.upsert\(/, /\.delete/]) {
    assert.doesNotMatch(src, prohibido, `Inicio no escribe: ${prohibido}`)
    assert.doesNotMatch(leer(PAGINA), prohibido)
  }
  // Solo cuentas: ni primas ni nº de póliza en Inicio.
  for (const f of [LECTURA, TARJETAS, PAGINA]) assert.doesNotMatch(leer(f), /numeroPoliza|prima/i, f)
})

test('🚨 en Inicio no se dice «no tienes» ni se inventa un cero', () => {
  for (const f of [PAGINA, LECTURA, TARJETAS]) {
    const src = leer(f)
    assert.doesNotMatch(src, /no tienes|0 pólizas|ninguna póliza|Hola, cliente|no hemos encontrado/i, f)
    assert.doesNotMatch(src, /\?\?\s*(0|\[\])(?![.\d])/, `${f}: «no se sabe» convertido en vacío`)
  }
  // Una sola sugerencia comercial en la pantalla.
  assert.equal((leer(PAGINA).match(/<HuecosProteccion/g) ?? []).length, 1)
})
