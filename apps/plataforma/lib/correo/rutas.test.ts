import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { RUTAS, rutaDe } from './rutas.ts'

// 🪤 Una regla de `correo_reglas` que apunta a una categoría QUE NO EXISTE en RUTAS no falla:
// `rutaDe()` cae a 'dudoso', que es `aviso: 'ninguno'`. O sea, el correo se clasifica «bien»,
// la pasada termina en verde y el aviso sencillamente no sale nunca. Es el fallo que
// CLAUDE.md llama «un aviso que sale por un canal que nadie abre»: desde el código se ve
// idéntico a uno entregado. Estos dos brazos leen el SQL de verdad, no una lista copiada.
const DIR_SQL = join(import.meta.dirname, '..', '..', 'prisma', 'sql')

function categoriasEnSemillas(): { fichero: string; categoria: string }[] {
  const out: { fichero: string; categoria: string }[] = []
  for (const f of readdirSync(DIR_SQL).filter(f => f.endsWith('.sql'))) {
    const sql = readFileSync(join(DIR_SQL, f), 'utf8')
    if (!/INSERT\s+INTO\s+correo_reglas/i.test(sql)) continue
    for (const m of sql.matchAll(/\(\s*'[^']+'\s*,\s*'([^']+)'\s*,\s*'[^']+'\s*\)/g)) {
      out.push({ fichero: f, categoria: m[1] })
    }
  }
  return out
}

test('🪤 toda categoría sembrada en correo_reglas existe en RUTAS (si no, el aviso se pierde en silencio)', () => {
  const sembradas = categoriasEnSemillas()
  assert.ok(sembradas.length > 0, 'no se ha leído ninguna semilla de correo_reglas: el cepo estaría mirando al vacío')
  const conocidas = new Set(RUTAS.map(r => r.categoria))
  for (const { fichero, categoria } of sembradas) {
    assert.ok(conocidas.has(categoria), `${fichero} siembra la categoría '${categoria}', que no está en RUTAS: rutaDe() caería a 'dudoso' y el correo no avisaría`)
  }
})

test('🪤 las respuestas de las asociaciones de corredores avisan al momento, no en el digest', () => {
  const r = rutaDe('asociacion-corredores')
  assert.equal(r.categoria, 'asociacion-corredores', 'la categoría no existe: rutaDe() ha devuelto el fallback')
  assert.equal(r.aviso, 'inmediato')
  assert.equal(r.archivar, false, 'archivarlo lo sacaría de INBOX: una negociación abierta se queda a la vista')
})
