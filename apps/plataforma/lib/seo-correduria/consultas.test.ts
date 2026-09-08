import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONSULTAS } from './consultas.ts'

// Cepo: el cron vigila EXACTAMENTE las consultas que la skill declara en §1 y §2 de keywords.md.
// Si una sesión añade una fila a la skill y no aquí (o al revés), el lunes se mide una cosa y se
// redacta otra — y nada falla. Este test es lo único que lo delata.

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const KEYWORDS_MD = path.resolve(AQUI, '../../../../.claude/skills/seo-asegura/references/keywords.md')

/** Primera celda de cada fila de tabla de §1 y §2 (las secciones §3 y §4 no son tablas y se ignoran). */
function consultasDeLaSkill(): string[] {
  const md = readFileSync(KEYWORDS_MD, 'utf8')
  const inicio = md.indexOf('\n## 1.')
  const fin = md.indexOf('\n## 3.')
  assert.ok(inicio >= 0 && fin > inicio, 'keywords.md ya no tiene las secciones §1..§3 donde se esperaban')
  const tramo = md.slice(inicio, fin)
  const out: string[] = []
  for (const linea of tramo.split('\n')) {
    if (!linea.startsWith('| ')) continue
    const primera = linea.split('|')[1]?.trim() ?? ''
    if (!primera || primera === 'Consulta' || /^-+$/.test(primera)) continue
    out.push(primera)
  }
  return out
}

test('las consultas del cron son las mismas que las de la skill (§1 + §2 de keywords.md)', () => {
  const skill = consultasDeLaSkill()
  assert.ok(skill.length >= 10, `se leyeron solo ${skill.length} consultas de keywords.md: el parser no está mirando la tabla`)
  const cron = CONSULTAS.map(c => c.consulta)
  assert.equal(new Set(cron).size, cron.length, 'consultas duplicadas en CONSULTAS')
  const soloSkill = skill.filter(c => !cron.includes(c))
  const soloCron = cron.filter(c => !skill.includes(c))
  assert.deepEqual(
    { soloSkill, soloCron },
    { soloSkill: [], soloCron: [] },
    'el cron vigila unas consultas y la skill otras',
  )
})

test('toda pagina es null o una ruta que empieza por /', () => {
  for (const c of CONSULTAS) {
    assert.ok(c.pagina === null || c.pagina.startsWith('/'), `pagina rara en «${c.consulta}»: ${c.pagina}`)
    assert.ok(c.grupo === 'ramo' || c.grupo === 'problema', `grupo raro en «${c.consulta}»: ${c.grupo}`)
  }
  assert.equal(CONSULTAS.filter(c => c.grupo === 'ramo').length, 8)
  assert.equal(CONSULTAS.filter(c => c.grupo === 'problema').length, 6)
})
