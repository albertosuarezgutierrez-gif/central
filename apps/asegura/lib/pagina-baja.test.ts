import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { esConfirmacionDeFormulario, paginaConfirmarBaja } from './pagina-baja.ts'

test('la página de confirmación es un formulario POST con el token en la acción y escapado', () => {
  const h = paginaConfirmarBaja('/api/publico/campana/baja?t=abc"><x', '¿Seguro?')
  assert.match(h, /<form method="post" action="\/api\/publico\/campana\/baja\?t=abc&quot;&gt;&lt;x">/)
  assert.match(h, /name="confirmar" value="1"/)
})

test('POST del botón vs one-click RFC 8058', () => {
  assert.equal(esConfirmacionDeFormulario('confirmar=1'), true)
  assert.equal(esConfirmacionDeFormulario('List-Unsubscribe=One-Click'), false)
  assert.equal(esConfirmacionDeFormulario(''), false)
})

for (const ruta of ['campana', 'recaptacion']) {
  test(`🪤 ${ruta}/baja: el GET NO da de baja y el POST sí (el one-click sigue vivo)`, () => {
    const src = readFileSync(new URL(`../app/api/publico/${ruta}/baja/route.ts`, import.meta.url), 'utf8')
    const get = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function POST'))
    const post = src.slice(src.indexOf('export async function POST'), src.indexOf('function html'))
    assert.doesNotMatch(get, /aplicarBaja/)
    assert.match(post, /aplicarBaja(Campana|Email)\(/)
    assert.match(post, /new NextResponse\(null/)
  })
}
