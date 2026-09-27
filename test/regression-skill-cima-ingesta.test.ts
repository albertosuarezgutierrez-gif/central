// Guardián de la skill `cima-ingesta`. `node --test` (gate en `pnpm test:guardia`).
//
// La skill es un ROUTER: casi todo su valor es mandar al documento correcto. Un router que
// apunta a un fichero que ya no está es PEOR que no tener router — devuelve una ruta con
// cara de buena y quien la sigue se encuentra nada, sin un solo error. En esta misma sesión
// se estuvo a punto de mover los tres docs a `references/` de la skill, lo que habría dejado
// ocho enlaces colgando (incluidos dos de `docs/CONTEXTO-SESIONES.md`, que es registro y no
// se reescribe). Por eso el enlace se comprueba, no se supone.
//
// Y el segundo brazo vigila la clase de fallo que motivó la skill: una AFIRMACIÓN DE HECHO
// que se pudre sola. «Generali no tiene acceso CIMA» era cierta el 01/09/2026 y falsa desde
// el 14/09, cuando Generali mandó su primer POL — y siguió escrita en la skill del agente,
// que es justo quien informa a Alberto del estado de las compañías. Nadie la tocó: dejó de
// ser verdad sin que cambiara ni una línea del repo, que es el modo de fallo que ningún
// typecheck ve.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const SKILL = join(RAIZ, '.claude/skills/cima-ingesta/SKILL.md')

function leer(p: string): string {
  return readFileSync(p, 'utf8')
}

test('la skill cima-ingesta existe y se llama como su carpeta', () => {
  assert.ok(existsSync(SKILL), 'falta .claude/skills/cima-ingesta/SKILL.md')
  const src = leer(SKILL)
  assert.match(src, /^---\n(?:[\s\S]*?\n)?name:\s*cima-ingesta\n/, 'el frontmatter no declara name: cima-ingesta')
  assert.match(src, /^---\n[\s\S]*?\ndescription:\s*>/m, 'el frontmatter no declara description')
})

test('todo docs/*.md que cita la skill existe en disco', () => {
  const src = leer(SKILL)
  const citados = [...new Set([...src.matchAll(/`(docs\/[A-Za-z0-9._\-/]+\.md)`/g)].map((m) => m[1]))]
  assert.ok(citados.length >= 3, `la skill debería citar sus tres inventarios, cita ${citados.length}`)
  for (const rel of citados) {
    assert.ok(existsSync(join(RAIZ, rel)), `la skill cita ${rel} y ese fichero no está`)
  }
})

test('los tres inventarios de CIMA siguen siendo los que la skill enruta', () => {
  const src = leer(SKILL)
  for (const doc of [
    'docs/ASEGURA-CIMA-INGESTA-INVENTARIO.md',
    'docs/CIMA-CUARENTENA.md',
    'docs/ASEGURA-CIMA-COBERTURAS.md',
  ]) {
    assert.ok(src.includes(doc), `la skill ya no enruta a ${doc}`)
    assert.ok(existsSync(join(RAIZ, doc)), `${doc} no está en disco`)
  }
})

test('ninguna skill afirma ya que Generali no tiene acceso a CIMA', () => {
  for (const p of [
    '.claude/skills/cima-ingesta/SKILL.md',
    '.claude/skills/agente-correduria/SKILL.md',
    '.claude/skills/correduria-crm/SKILL.md',
  ]) {
    const src = leer(join(RAIZ, p))
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
    // Se busca la AFIRMACIÓN, no la palabra: la skill de ingesta habla de Generali a
    // propósito (para contar que SÍ volcó el 14/09), y prohibir el nombre borraría el dato.
    const afirma = /generali[^.\n]{0,40}no tiene acceso[^.\n]{0,20}cima/.test(src)
    assert.equal(afirma, false, `${p} repite la afirmación caducada sobre Generali`)
  }
})

test('la skill está en el índice docs/SKILLS.md', () => {
  const idx = leer(join(RAIZ, 'docs/SKILLS.md'))
  assert.ok(idx.includes('`cima-ingesta`'), 'docs/SKILLS.md no lista la skill cima-ingesta')
})
