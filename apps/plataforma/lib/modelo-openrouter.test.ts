import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { modeloOpenRouterValido } from './modelo-openrouter.ts'

const aqui = path.dirname(fileURLToPath(import.meta.url))

test('modeloOpenRouterValido: slugs de OpenRouter sí; basura, URLs y espacios no', () => {
  assert.equal(modeloOpenRouterValido('anthropic/claude-sonnet-4.5'), 'anthropic/claude-sonnet-4.5')
  assert.equal(modeloOpenRouterValido('google/gemini-2.5-flash:nitro'), 'google/gemini-2.5-flash:nitro')
  for (const malo of [undefined, null, 1, '', 'sonnet', 'https://evil.test/x', 'a/b c', '../x/y', 'a/b/c']) {
    assert.equal(modeloOpenRouterValido(malo), null, String(malo))
  }
})

// La pasarela no es importable desde `node --test` (alias @/): se lee el FUENTE, como lector-registral-enrutado.test.ts.
test('chatConDirector: el modelo explícito va POR OpenRouter con ese único modelo, registra coste y NO degrada', () => {
  const f = readFileSync(path.join(aqui, 'pasarela.ts'), 'utf8')
  const ini = f.indexOf('if (opts.modeloOpenRouter)')
  assert.ok(ini > 0, 'falta la rama de modeloOpenRouter')
  const rama = f.slice(ini, f.indexOf('// ── Camino primario', ini))
  assert.match(rama, /models:\s*\[opts\.modeloOpenRouter\]/, 'un solo modelo: el pedido')
  assert.match(rama, /dentroDePresupuestoDiario\(/, 'respeta el presupuesto diario')
  assert.match(rama, /registrarUso\([^)]*ok:\s*true/, 'registra el uso con coste')
  assert.match(rama, /catch \(e\) \{[\s\S]*?registrarUso\([\s\S]*?\)\n\s*throw e\n/, 'si OpenRouter falla, registra y RELANZA (no cae a la cadena gratis ni a otro modelo)')
  // Dentro del MISMO bloque (hasta su llave de cierre a 4 espacios).
  assert.match(rama, /if \(!presupuesto\.ok\) \{(?:(?!\n {4}\})[\s\S])*?\n\s*throw /, 'sin presupuesto, lanza')
  assert.doesNotMatch(rama, /aiCompleteConProveedor|PASARELA_MODELO_SEGURO/, 'sin degradar')
})

test('la ruta /api/ai/chat valida modeloOpenRouter y lo pasa a la pasarela', () => {
  const r = readFileSync(path.join(aqui, '..', 'app', 'api', 'ai', 'chat', 'route.ts'), 'utf8')
  assert.match(r, /modeloOpenRouterValido\(/)
  assert.match(r, /modeloOpenRouter:\s*modeloOR/)
})
