// Guardián de scripts/memoria-parsear.mjs::partirGrande — el partidor de trozos demasiado
// grandes para el embedding de la memoria semántica (memoria_buscar).
//
// Caso real (12/09/2026): `trocear` de rotar-memoria.mjs NO separa por `## ` a propósito (ver
// test/regression-rotar-memoria.test.ts, "solo `- **` y `### ` abren entrada") — es una decisión
// ya probada para la rotación mensual. Pero eso significa que una racha de encabezados `## `
// seguidos en el mes vivo se funde en UNA "entrada" al archivarse. `docs/memoria/2026-08.md`
// quedó así con un bloque de 40.518 caracteres mezclando temas sin relación. Mandado tal cual a
// `grafo_embed_textos`, el modelo de embeddings devolvió HTTP 400 (excede su contexto) — y como
// el lote entero (hasta 96 filas) viaja en UNA sola llamada, ese 400 tumbó TAMBIÉN a las ~95 filas
// sanas del mismo lote; y como el lote se repite (`ORDER BY id LIMIT n` con la fila envenenada
// siempre primera), los 6 reintentos del inyector gastaron su presupuesto entero contra la MISMA
// fila sin avanzar nunca (run de auditoria.yml 34720768632, "Calcular embeddings de la memoria").
//
// `partirGrande` no toca `esInicioEntrada`/`trocear` (ni su contrato ni su test): actúa DESPUÉS,
// solo sobre lo que de verdad revienta el embedding.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partirGrande, MAX_LEN_TROZO } from '../scripts/memoria-parsear.mjs'

test('un cuerpo bajo el tope se devuelve intacto, sin partir', () => {
  const texto = 'Entrada normal, corta.'
  assert.deepEqual(partirGrande(texto, 100), [texto])
})

test('el caso real: un bloque fundido de ~40.000 caracteres con "## " sin separar se parte y nada supera el tope', () => {
  const seccionA = '## Sección A\n' + 'Cuerpo A. '.repeat(500)
  const seccionB = '## Sección B\n' + 'Cuerpo B. '.repeat(500)
  const cuerpo = `### Título fundido\n${seccionA}\n${seccionB}`
  assert.ok(cuerpo.length > MAX_LEN_TROZO, 'el fixture debe reproducir el tamaño real del bug')

  const trozos = partirGrande(cuerpo)

  assert.ok(trozos.length > 1, 'debe partirse en más de un trozo')
  for (const t of trozos) {
    assert.ok(t.length <= MAX_LEN_TROZO, `ningún trozo puede superar el tope del modelo de embeddings (${t.length} chars)`)
  }
  assert.equal(trozos.join('\n'), cuerpo, 'partir no puede perder ni un carácter')
})

test('caso patológico — un único párrafo sin ninguna separación se corta en duro, sin perder texto', () => {
  const cuerpo = 'x'.repeat(MAX_LEN_TROZO * 3 + 123)
  const trozos = partirGrande(cuerpo)
  assert.ok(trozos.length > 1)
  for (const t of trozos) assert.ok(t.length <= MAX_LEN_TROZO)
  assert.equal(trozos.join(''), cuerpo)
})
