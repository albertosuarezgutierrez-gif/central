#!/usr/bin/env node
// Lint ESTÁTICO (sin modelo) de `.claude/agents/*.md` y `.claude/skills/*/SKILL.md`.
// Inspirado en `plugin-eval --depth quick` (wshobson/agents, MIT), reimplementado en Node sin deps.
// Uso: node scripts/lint-agentes.mjs [--root <dir>]   → exit 1 solo si hay ERROR.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const argRoot = process.argv.indexOf('--root')
const ROOT = resolve(
  argRoot > -1 ? process.argv[argRoot + 1] : join(dirname(fileURLToPath(import.meta.url)), '..'),
)

const DESC_MAX = 1024
const DESC_MIN = 40
const TOOLS_CONOCIDAS = new Set([
  'Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'Grep', 'Glob', 'NotebookEdit', 'WebFetch', 'WebSearch',
  'TodoWrite', 'Task', 'Agent', 'ToolSearch', 'BashOutput', 'KillShell', 'SlashCommand', 'Skill',
])
const PREFIJOS_RUTA = ['docs/', 'scripts/', 'apps/', 'packages/', 'test/', '.claude/', '.github/']

/** Frontmatter mínimo: `clave: valor` y escalares plegados (`>`, `>-`, `|`). */
export function parseFrontmatter(texto) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(texto)
  if (!m) return null
  const data = {}
  const lineas = m[1].split(/\r?\n/)
  for (let i = 0; i < lineas.length; i++) {
    const k = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lineas[i])
    if (!k) continue
    let v = k[2].trim()
    if (/^[>|][+-]?$/.test(v)) {
      const partes = []
      while (i + 1 < lineas.length && (/^\s+/.test(lineas[i + 1]) || lineas[i + 1] === '')) partes.push(lineas[++i].trim())
      v = partes.join(' ').replace(/\s+/g, ' ').trim()
    } else if (v === '') {
      const partes = []
      while (i + 1 < lineas.length && /^\s+\S/.test(lineas[i + 1])) partes.push(lineas[++i].trim())
      v = partes.join(' ').trim()
    } else v = v.replace(/^(['"])(.*)\1$/, '$2')
    data[k[1]] = v
  }
  return { data, body: texto.slice(m[0].length) }
}

export function lint(root) {
  const problemas = []
  const add = (nivel, fichero, msg) => problemas.push({ nivel, fichero, msg })
  const items = []
  const dirA = join(root, '.claude/agents')
  if (existsSync(dirA))
    for (const f of readdirSync(dirA).sort()) if (f.endsWith('.md')) items.push({ tipo: 'agente', ruta: join(dirA, f), esperado: f.replace(/\.md$/, '') })
  const dirS = join(root, '.claude/skills')
  if (existsSync(dirS))
    for (const d of readdirSync(dirS).sort()) {
      const p = join(dirS, d, 'SKILL.md')
      if (statSync(join(dirS, d)).isDirectory() && existsSync(p)) items.push({ tipo: 'skill', ruta: p, esperado: d })
    }

  const nombres = new Map()
  for (const it of items) {
    const rel = it.ruta.slice(root.length + 1)
    const fm = parseFrontmatter(readFileSync(it.ruta, 'utf8'))
    if (!fm) { add('ERROR', rel, 'sin frontmatter YAML (--- ... ---)'); continue }
    const { name, description, tools } = fm.data
    if (!name) add('ERROR', rel, 'frontmatter sin `name`')
    else {
      if (name !== it.esperado) add('ERROR', rel, `name «${name}» ≠ ${it.tipo === 'agente' ? 'fichero' : 'carpeta'} «${it.esperado}»`)
      const previo = nombres.get(name)
      if (previo) add('ERROR', rel, `name «${name}» duplicado (ya en ${previo})`)
      else nombres.set(name, rel)
    }
    if (!description) add('ERROR', rel, 'frontmatter sin `description` (o vacía)')
    else {
      if (description.length > DESC_MAX) add('AVISO', rel, `description de ${description.length} caracteres (> ${DESC_MAX})`)
      if (description.length < DESC_MIN) add('AVISO', rel, `description de ${description.length} caracteres (< ${DESC_MIN})`)
    }
    if (it.tipo === 'agente' && tools) {
      for (const t of tools.split(',').map((s) => s.trim()).filter(Boolean)) {
        const ok = TOOLS_CONOCIDAS.has(t) || /^mcp__[A-Za-z0-9_.-]+(__[A-Za-z0-9_.*-]+)?$/.test(t) || /^[A-Z][A-Za-z]+\(.*\)$/.test(t)
        if (!ok) add('AVISO', rel, `tool «${t}» con nombre no reconocido`)
      }
    }
    // Enlaces a ficheros del repo (en `backticks` o [txt](ruta)) que no existen.
    const vistos = new Set()
    const re = /`([^`\s]+)`|\]\(([^)\s#]+)(?:#[^)]*)?\)/g
    let m
    while ((m = re.exec(fm.body))) {
      let r = (m[1] || m[2]).replace(/[:#]\d+(-\d+)?$/, '').replace(/[.,;)]+$/, '')
      if (/^https?:|[<>*{}$|\\]|AAAA|YYYY|MM|NNN|XXX|\.\.\./.test(r)) continue
      const esRepo = PREFIJOS_RUTA.some((p) => r.startsWith(p))
      const esRelDoc = m[2] && !/^[a-z]+:/.test(r) && !r.startsWith('/') // [txt](relativo)
      if (!esRepo && !esRelDoc) continue
      if (!/\.[A-Za-z0-9]{1,5}$/.test(r) && !r.endsWith('/')) continue
      if (vistos.has(r)) continue
      vistos.add(r)
      const abs = esRepo ? join(root, r) : join(dirname(it.ruta), r)
      if (!existsSync(abs)) add('AVISO', rel, `enlace a fichero inexistente: ${r}`)
    }
  }
  return { problemas, total: items.length }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { problemas, total } = lint(ROOT)
  for (const p of problemas) console.log(`${p.nivel} ${p.fichero}: ${p.msg}`)
  const e = problemas.filter((p) => p.nivel === 'ERROR').length
  console.log(`lint-agentes: ${total} ficheros, ${e} ERROR, ${problemas.length - e} AVISO`)
  process.exit(e > 0 ? 1 : 0)
}
