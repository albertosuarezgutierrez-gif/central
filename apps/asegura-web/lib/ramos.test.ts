// Guardián del copy de las páginas de ramo.
//
// No comprueba estilo: comprueba que no se ha colado nada que convierta una
// página informativa en asesoramiento (RDL 3/2020) o en una promesa que la
// correduría no puede sostener. Es el mismo tipo de red que
// `test/regression-nombre-comercial-asegura.test.ts`: barato de mantener y
// difícil de saltarse sin darse cuenta.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RAMOS, ramoPorSlug, type Ramo } from './ramos.ts'

/** Todo el texto visible de un ramo, en una sola cadena, para barrerlo. */
function copy(r: Ramo): string {
  return [r.h1, r.title, r.description, ...r.intro, ...r.cubre, ...r.paraQuien, ...r.faq.flatMap((f) => [f.pregunta, f.respuesta])].join(' ')
}

test('hay al menos un ramo y todos tienen los campos con contenido', () => {
  assert.ok(RAMOS.length >= 1)
  for (const r of RAMOS) {
    assert.match(r.slug, /^[a-z0-9-]+$/, `slug inválido: ${r.slug}`)
    for (const campo of ['nombre', 'h1', 'title', 'description'] as const) {
      assert.ok(r[campo].trim().length > 0, `${r.slug}: ${campo} vacío`)
    }
    assert.ok(r.intro.length >= 1, `${r.slug}: sin intro`)
    assert.ok(r.cubre.length >= 3, `${r.slug}: menos de 3 puntos en "cubre"`)
    assert.ok(r.paraQuien.length >= 2, `${r.slug}: menos de 2 en "paraQuien"`)
    assert.ok(r.faq.length >= 3, `${r.slug}: menos de 3 preguntas`)
  }
})

test('los slugs no se repiten', () => {
  const vistos = new Set<string>()
  for (const r of RAMOS) {
    assert.ok(!vistos.has(r.slug), `slug duplicado: ${r.slug}`)
    vistos.add(r.slug)
  }
})

test('ramoPorSlug devuelve null para lo que no existe, nunca un ramo de relleno', () => {
  assert.equal(ramoPorSlug('no-existe'), null)
  assert.equal(ramoPorSlug(''), null)
  assert.equal(ramoPorSlug(RAMOS[0].slug)?.slug, RAMOS[0].slug)
})

// 🚨 El guardián de verdad. Un claim de ahorro o un superlativo sobre el
// resultado convierte la página en asesoramiento, y el asesoramiento arrastra
// análisis objetivo documentado e IPID entregado antes de contratar.
const PROHIBIDO: readonly { patron: RegExp; porque: string }[] = [
  { patron: /\bahorr\w*\s+(hasta\s+)?(un\s+)?\d/i, porque: 'cifra de ahorro prometida' },
  { patron: /\bhasta\s+un\s+\d+\s*%/i, porque: 'porcentaje de ahorro prometido' },
  { patron: /\b(el|la)\s+mejor\s+(precio|p[óo]liza|seguro|oferta|prima)\b/i, porque: 'superlativo sobre el resultado' },
  { patron: /\bm[áa]s\s+barat\w+\b/i, porque: 'promesa de precio' },
  { patron: /\bprecio\s+m[áa]s\s+baj\w+\b/i, porque: 'promesa de precio' },
  { patron: /\bgarantizamos\b/i, porque: 'garantía que la correduría no puede dar' },
  { patron: /\bte\s+ahorramos\b/i, porque: 'promesa de ahorro' },
  { patron: /\bsin\s+letra\s+peque[ñn]a\b/i, porque: 'promesa sobre el condicionado de un tercero' },
]

test('el copy no promete ahorros, precios ni superlativos (RDL 3/2020)', () => {
  for (const r of RAMOS) {
    const texto = copy(r)
    for (const { patron, porque } of PROHIBIDO) {
      assert.ok(!patron.test(texto), `${r.slug}: ${porque} → ${patron}`)
    }
  }
})

// La marca se escribe «Grupo ASegura» (A y S mayúsculas): el monograma del logo
// ES el nombre. Ya lo protege un guardián global, pero aquí es donde el nombre
// sale a la calle, así que se comprueba también en el copy publicado.
test('si se nombra la marca, se escribe «Grupo ASegura»', () => {
  for (const r of RAMOS) {
    const texto = copy(r)
    const malas = texto.match(/Grupo\s+A(?!Segura\b)\w*/g) ?? []
    assert.deepEqual(malas, [], `${r.slug}: la marca mal escrita → ${malas.join(', ')}`)
  }
})

test('title y description caben en la SERP sin cortarse a mitad de palabra', () => {
  for (const r of RAMOS) {
    assert.ok(r.title.length <= 65, `${r.slug}: title de ${r.title.length} caracteres (máx 65)`)
    assert.ok(r.description.length >= 110 && r.description.length <= 165, `${r.slug}: description de ${r.description.length} caracteres (110-165)`)
  }
})

// Sevilla en el h1 no es relleno: la pelea que se puede ganar es la local, y
// perderla por no nombrar la ciudad sería tonto.
test('el h1 nombra la ciudad', () => {
  for (const r of RAMOS) {
    assert.match(r.h1, /Sevilla/i, `${r.slug}: el h1 no nombra Sevilla`)
  }
})
