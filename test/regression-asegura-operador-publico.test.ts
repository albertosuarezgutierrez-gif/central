import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Guardián del puerto operador de asegura (31/08/2026): el middleware de la app
// protege todo salvo su lista PUBLIC, y la ruta /api/operador/* lleva su PROPIA
// auth (Bearer ASEGURA_OPERADOR_SECRET, cerrada por defecto). Si alguien la saca
// de PUBLIC, la llamada servidor→servidor de plataforma se redirige al login y
// la cartera en vivo muere en silencio («sin respuesta») — que es exactamente lo
// que pasó el día del estreno. Ni tsc ni el build cazan ese fallo: solo se ve en
// runtime, así que se vigila leyendo el FUENTE.

const RAIZ = join(import.meta.dirname, '..')

test('el middleware de asegura deja pasar /api/operador (auth propia por Bearer)', () => {
  const fuente = readFileSync(join(RAIZ, 'apps/asegura/middleware.ts'), 'utf8')
  const publica = fuente.match(/const PUBLIC = \[([^\]]*)\]/)
  assert.ok(publica, 'no se encontró la lista PUBLIC en apps/asegura/middleware.ts')
  assert.match(publica![1], /['"]\/api\/operador['"]/,
    '/api/operador no está en la lista PUBLIC del middleware de asegura: el puerto de plataforma sería redirigido al login')
})

test('la ruta del puerto sigue exigiendo el Bearer (no queda abierta al quitarla del gate)', () => {
  const fuente = readFileSync(join(RAIZ, 'apps/asegura/app/api/operador/resumen/route.ts'), 'utf8')
  assert.match(fuente, /operadorAutorizado\(/,
    'la ruta /api/operador/resumen no llama a operadorAutorizado(): quedaría pública de verdad')
})

// ─── El puente del portal del cliente (08/09/2026) ───────────────────────────
//
// Misma regla, segundo puerto: /api/portal/* lleva su PROPIA auth (Bearer
// ASEGURA_PORTAL_PUENTE_SECRET, lib/puente-portal.ts). Sin la exención en
// PUBLIC, la llamada servidor→servidor de asegura-portal recibía el HTML del
// login en vez del JSON — y el portal solo veía «sin respuesta».

test('el middleware de asegura deja pasar /api/portal (auth propia por Bearer del puente)', () => {
  const fuente = readFileSync(join(RAIZ, 'apps/asegura/middleware.ts'), 'utf8')
  const publica = fuente.match(/const PUBLIC = \[([^\]]*)\]/)
  assert.ok(publica, 'no se encontró la lista PUBLIC en apps/asegura/middleware.ts')
  assert.match(publica![1], /['"]\/api\/portal['"]/,
    '/api/portal no está en la lista PUBLIC del middleware de asegura: el puente del portal sería redirigido al login')
})

test('cada ruta de /api/portal sigue exigiendo el Bearer del puente (no queda abierta al quitarla del gate)', () => {
  const dir = join(RAIZ, 'apps/asegura/app/api/portal')
  const rutas = readdirSync(dir).filter((d) => existsSync(join(dir, d, 'route.ts')))
  assert.ok(rutas.length >= 2, `se esperaban rutas bajo apps/asegura/app/api/portal y hay ${rutas.length}`)
  for (const r of rutas) {
    const fuente = readFileSync(join(dir, r, 'route.ts'), 'utf8')
    assert.match(fuente, /puentePortalAutorizado\(/,
      `apps/asegura/app/api/portal/${r}/route.ts no llama a puentePortalAutorizado(): quedaría pública de verdad`)
    assert.ok(!/ASEGURA_OPERADOR_SECRET|operadorAutorizado\(/.test(fuente),
      `apps/asegura/app/api/portal/${r}/route.ts no puede abrirse con el secreto de operador: ese abre la cartera entera`)
  }
})
