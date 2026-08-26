// Guardián de la dirección de House Sevillana. `node --test` (gate en `pnpm test:guardia`).
//
// House Sevillana está en **Calle Socorro 24, 41003 Sevilla (barrio de San Julián)**.
// **Bustos Tavera 22** es la dirección de OTROS DOS pisos del grupo —Luxury Busto y Busto
// Reform, bajo dcha e izda, alquilados a Gutiérrez Alcalá—, así que atribuírsela a House
// Sevillana no es una errata: es la ficha de otro piso.
//
// Por qué existe este fichero: la skill `seo-house-sevillana` arrastró esa confusión desde su
// creación (le asignaron el ID de Booking `4771238`, que es el de Busto Reform, y con él vino
// la dirección). Vivía FUERA de git —sincronizada desde la cuenta de Claude— así que la
// auditoría la detectó tres veces seguidas (19/08, 25/08 y 26/08 de 2026) sin poder corregirla.
// La solución fue traerla al repo (`.claude/skills/seo-house-sevillana/`, que además tiene
// precedencia sobre la copia sincronizada del mismo nombre); este test es lo que impide que
// la dirección mala vuelva a entrar por cualquier vía.
//
// Lo caro son los DOS JSON-LD: si ese schema se publica, Google indexa una dirección falsa
// como la del negocio y, encima, la de dos competidores propios en la misma búsqueda local.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SKILL = '.claude/skills/seo-house-sevillana'

const DIRECCION = 'Calle Socorro 24'
const CP = '41003'
const LAT = 37.395904
const LON = -5.987431

/** Territorio de House Sevillana: aquí «Calle Bustos Tavera» SIEMPRE es el bug. */
const TERRITORIO = [`${SKILL}/`, 'apps/housesevillana/', 'apps/sivra/messages/']

function ficherosVersionados(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
}

function leerJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))
}

test('la skill seo-house-sevillana está versionada en el repo', () => {
  assert.ok(
    existsSync(join(ROOT, SKILL, 'SKILL.md')),
    `Falta ${SKILL}/SKILL.md. Si se borra, vuelve a mandar la copia SINCRONIZADA de la cuenta ` +
      'de Claude, que tiene la dirección de otro piso (Bustos Tavera 22) en siete sitios.',
  )
})

test('la description de la skill lleva la dirección buena', () => {
  const skill = readFileSync(join(ROOT, SKILL, 'SKILL.md'), 'utf8')
  const frontmatter = skill.split('---')[1] ?? ''
  assert.ok(frontmatter.includes(DIRECCION), `La description de ${SKILL}/SKILL.md debe decir "${DIRECCION}"`)
  assert.ok(
    !frontmatter.includes('Calle Bustos Tavera'),
    `La description de ${SKILL}/SKILL.md no puede decir "Calle Bustos Tavera": es otro piso`,
  )
})

// Los dos JSON-LD son el punto caro: se publican tal cual.
for (const [rel, conGeo] of [
  [`${SKILL}/assets/jsonld/lodging-business.json`, true],
  [`${SKILL}/assets/jsonld/organization.json`, false],
] as const) {
  test(`${rel} publica la dirección buena`, () => {
    const doc = leerJson(rel) as { address: Record<string, string>; geo?: Record<string, number> }
    assert.equal(doc.address.streetAddress, DIRECCION)
    assert.equal(doc.address.postalCode, CP)
    assert.equal(doc.address.addressLocality, 'Sevilla')
    if (conGeo) {
      // Las coordenadas viajaban con la dirección mala: 37.3936 / -5.9886 es Bustos Tavera.
      assert.equal(doc.geo?.latitude, LAT)
      assert.equal(doc.geo?.longitude, LON)
    }
  })
}

test('ningún fichero de House Sevillana escribe "Calle Bustos Tavera"', () => {
  const culpables: string[] = []
  for (const f of ficherosVersionados()) {
    if (!TERRITORIO.some((p) => f.startsWith(p))) continue
    const texto = readFileSync(join(ROOT, f), 'utf8')
    texto.split('\n').forEach((linea, i) => {
      if (linea.includes('Calle Bustos Tavera')) culpables.push(`${f}:${i + 1}`)
    })
  }
  assert.deepEqual(
    culpables,
    [],
    `Bustos Tavera es la calle de Luxury Busto y Busto Reform, no la de House Sevillana. ` +
      `La buena es "${DIRECCION}, ${CP} Sevilla" (barrio de San Julián). Corrige: ${culpables.join(', ')}`,
  )
})

test('ningún schema.org del repo publica Bustos Tavera como streetAddress', () => {
  const culpables: string[] = []
  for (const f of ficherosVersionados()) {
    // `docs/` queda fuera: la bitácora y las auditorías CITAN el fallo a propósito.
    // Aquí se persigue el valor que se publica (código, assets, skills), no el relato.
    if (f.startsWith('docs/') || f === 'test/regression-house-sevillana-direccion.test.ts') continue
    let texto: string
    try {
      texto = readFileSync(join(ROOT, f), 'utf8')
    } catch {
      continue // binario o enlace roto
    }
    // Cubre el JSON con espacios (`"streetAddress": "…"`) y el JSON-LD embebido sin ellos.
    if (/"streetAddress"\s*:\s*"[^"]*Bustos Tavera/.test(texto)) culpables.push(f)
  }
  assert.deepEqual(culpables, [], `streetAddress con Bustos Tavera (= otro piso) en: ${culpables.join(', ')}`)
})

test('la copia sincronizada de la cuenta ya no manda (diagnóstico)', (t) => {
  const sincronizada = '/root/.claude/skills/synced/seo-house-sevillana'
  if (!existsSync(sincronizada)) {
    t.diagnostic('No hay copia sincronizada en este entorno.')
    return
  }
  const mala = readFileSync(join(sincronizada, 'SKILL.md'), 'utf8').includes('Bustos Tavera')
  t.diagnostic(
    mala
      ? `La copia de la cuenta (${sincronizada}) SIGUE con Bustos Tavera, pero la del repo tiene ` +
          'precedencia y es la que se carga. Alberto puede borrarla de su cuenta cuando quiera.'
      : 'La copia de la cuenta ya está corregida.',
  )
})
