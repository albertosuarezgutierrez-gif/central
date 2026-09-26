// Guardián del frontmatter de las skills (`.claude/skills/*/SKILL.md`) y de los agentes
// (`.claude/agents/*.md`). `node --test`.
//
// El estándar abierto Agent Skills (agentskills.io) exige un frontmatter YAML válido con
// `name` (minúsculas y guiones, ≤64, igual que su carpeta) y `description` (≤1024). El
// 26/09/2026, 9 skills y los 3 agentes llevaban la descripción como escalar plano con
// «: » dentro («Fase 1: paper», «SOLO LECTURA: no edita»): YAML inválido. Claude Code lo
// tolera, así que nada fallaba aquí — pero un parser estricto (`gh skill`, otro agente, el
// validador del estándar) rompe o trunca, y la skill desaparece sin error. Sin YAML en las
// deps de la raíz, se comprueba lo que rompe un escalar plano en vez de parsear.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const NOMBRE = /^[a-z0-9]+(-[a-z0-9]+)*$/

function frontmatter(ruta: string): string[] {
  const m = readFileSync(ruta, 'utf8').match(/^---\n([\s\S]*?)\n---\n/)
  assert.ok(m, `${ruta}: sin frontmatter`)
  return m[1].split('\n')
}

function campo(lineas: string[], clave: string): { valor: string; plano: boolean } | null {
  const i = lineas.findIndex((l) => l.startsWith(`${clave}:`))
  if (i < 0) return null
  const cabeza = lineas[i].slice(clave.length + 1).trim()
  if (/^[>|]/.test(cabeza)) {
    const cuerpo: string[] = []
    for (let j = i + 1; j < lineas.length && /^\s+\S/.test(lineas[j]); j++) cuerpo.push(lineas[j].trim())
    return { valor: cuerpo.join(' '), plano: false }
  }
  return { valor: cabeza.replace(/^(["'])([\s\S]*)\1$/, '$2'), plano: !/^["']/.test(cabeza) }
}

function comprobar(ruta: string, esperado: string) {
  const fm = frontmatter(ruta)
  const name = campo(fm, 'name')
  assert.ok(name, `${ruta}: falta name`)
  assert.equal(name.valor, esperado, `${ruta}: name debe coincidir con «${esperado}»`)
  assert.match(name.valor, NOMBRE, `${ruta}: name solo minúsculas, dígitos y guiones`)
  assert.ok(name.valor.length <= 64, `${ruta}: name >64`)

  const desc = campo(fm, 'description')
  assert.ok(desc && desc.valor.length > 0, `${ruta}: falta description`)
  assert.ok(desc.valor.length <= 1024, `${ruta}: description ${desc.valor.length} > 1024`)
  if (desc.plano) {
    assert.ok(
      !/: |\s#/.test(desc.valor) && !/^[-?:,\[\]{}#&*!|>'"%@`]/.test(desc.valor),
      `${ruta}: description como escalar plano con «: » o « #» es YAML inválido — usa «description: >-»`,
    )
  }
}

test('cada skill del repo tiene frontmatter válido según el estándar', () => {
  const dir = join(RAIZ, '.claude/skills')
  const skills = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory())
  assert.ok(skills.length > 0, 'no se encontró ninguna skill: el guardián miraría al vacío')
  for (const d of skills) {
    const ruta = join(dir, d.name, 'SKILL.md')
    assert.ok(existsSync(ruta), `${d.name}: carpeta sin SKILL.md`)
    comprobar(ruta, d.name)
  }
})

test('cada agente del repo tiene frontmatter válido', () => {
  const dir = join(RAIZ, '.claude/agents')
  const agentes = readdirSync(dir).filter((f) => f.endsWith('.md'))
  assert.ok(agentes.length > 0, 'no se encontró ningún agente')
  for (const f of agentes) comprobar(join(dir, f), f.slice(0, -3))
})
