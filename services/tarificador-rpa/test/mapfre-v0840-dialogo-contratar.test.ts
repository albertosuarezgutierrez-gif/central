// Mapfre auto v0.8.40 · DIAGNÓSTICO del diálogo «contrat…» tras «Generar Proyecto»: texto entero saneado + rótulos de botones. El guard NO se relaja.
// Datos SINTÉTICOS.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { describirDialogoPeligroMapfre } from '../src/guard.ts'
import { mapfreAuto } from '../src/adapters/mapfre/auto.ts'

test('v0.8.40 · versión', () => assert.equal(mapfreAuto.version, '0.8.41'))

test('describirDialogoPeligroMapfre: texto entero normalizado + botones; sin NIF, teléfonos, correos, cifras largas ni nombres', () => {
  const d = describirDialogoPeligroMapfre(
    'El   cliente Juan Pérez García con NIF 12345678Z\n(tel 600 123 456, a@b.es) ya tiene póliza nº 123456789. ¿Desea contratar ahora el seguro?',
    ['Sí', ' No ', 'Aceptar', 'Sí'],
  )
  assert.match(d, /contratar ahora el seguro/)
  assert.match(d, /botones: «Sí» · «No» · «Aceptar»/)
  assert.doesNotMatch(d, /12345678Z|600 123|a@b|123456789|Juan|Pérez/)
  assert.doesNotMatch(d, /\n/)
})

test('describirDialogoPeligroMapfre: texto largo hasta 600 (no el recorte de 160) y vacío → «sin texto»/«ninguno»', () => {
  const largo = 'palabra '.repeat(100)
  assert.ok(describirDialogoPeligroMapfre(largo, []).length > 400)
  assert.match(describirDialogoPeligroMapfre('', []), /sin texto.*ninguno/)
})

test('el guard sigue parando ante «contrat» y el diagnóstico NO pulsa nada (solo evaluateAll)', () => {
  const g = readFileSync(new URL('../src/guard.ts', import.meta.url), 'utf8')
  assert.match(g, /const RE_DIALOGO_PELIGROSO_MAPFRE = \/emit\|emisi\|contrat\|/)
  const i = g.indexOf('async function leerDialogoPeligroMapfre')
  const fn = g.slice(i, g.indexOf('export type ResultadoProyectoMapfre', i))
  assert.doesNotMatch(fn, /\.click\(|\.press\(|\.fill\(|pulsar/)
  assert.match(g, /sin_numero', motivo: `tras pulsar salió un diálogo que menciona «\$\{peligro\}»: el bot no toca nada más\$\{await leerDialogoPeligroMapfre\(page\)\}`/)
})
