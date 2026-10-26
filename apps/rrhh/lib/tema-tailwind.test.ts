// Cepo del tema de Tailwind (26/10/2026). Dos fallos reales que no avisaba nadie:
//  1) los colores del tema eran `var(--x)` sin canal alfa → `bg-ink/40`, `bg-ok/20`, `border-line/50`… NO generaban CSS
//     (modales sin fondo oscuro, chips sin color);
//  2) se usaba `warn`, que no estaba definido (26 usos) → texto sin color.
// Aquí se COMPILA el tema con Tailwind y se exige que cada clase de color usada en app/ y components/ exista de verdad.
// Además: nada de paleta cruda de Tailwind (`amber-300`, `red-600`), ni hex en clases, ni cursivas, ni botones < 44 px.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import config from '../tailwind.config'

const RAIZ = join(__dirname, '..')

/** Vocabulario de color del diseño: TODOS tienen que existir en el tema (si alguien quita `warn`, esto falla). */
export const COLORES_DEL_TEMA = ['paper', 'paper-2', 'card', 'ink', 'ink-2', 'ink-3', 'line', 'line-2', 'accent', 'accent-ink', 'accent-soft', 'ok', 'warn', 'alert']

const PREFIJOS = '(?:bg|text|border(?:-[trblxy])?|ring|ring-offset|divide|outline|fill|stroke|from|via|to|placeholder|decoration|caret|accent|shadow)'
const PALETA_CRUDA = '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)'
// Nombres que suenan a color del tema pero no lo son (typos habituales al portar código de otras apps).
const NOMBRES_AJENOS = '(?:danger|error|success|warning|primary|secondary|muted|brand|surface|panel|info|destructive|foreground|background)'

const ESCAPE = /[^a-zA-Z0-9_-]/g
const esc = (c: string) => c.replace(ESCAPE, m => `\\${m}`)

export type Hallazgo = { clase: string; motivo: string }

/** Clases de color del tema que se usan en `fuente` (con variantes y opacidad). */
export function clasesDelTema(fuente: string): string[] {
  const nombres = [...COLORES_DEL_TEMA].sort((a, b) => b.length - a.length).join('|')
  const re = new RegExp(`(?<![\\w\\-/\\[])((?:[a-z0-9-]+:)*${PREFIJOS}-(?:${nombres})(?:/(?:\\d{1,3}|\\[[^\\]\\s]+\\]))?)(?![\\w\\-])`, 'g')
  return [...new Set([...fuente.matchAll(re)].map(m => m[1]))]
}

/** Usos prohibidos: paleta cruda, hex en clase, nombres ajenos al tema. */
export function clasesFueraDelTema(fuente: string): Hallazgo[] {
  const out: Hallazgo[] = []
  const reg = (re: RegExp, motivo: string) => { for (const m of fuente.matchAll(re)) out.push({ clase: m[1], motivo }) }
  reg(new RegExp(`(?<![\\w\\-/\\[])((?:[a-z0-9-]+:)*${PREFIJOS}-${PALETA_CRUDA}-\\d{2,3}(?:/\\d{1,3})?)(?![\\w\\-])`, 'g'), 'paleta cruda de Tailwind: usa los tokens del tema (ok/warn/alert/accent…)')
  reg(new RegExp(`(?<![\\w\\-/\\[])((?:[a-z0-9-]+:)*(?:bg|text|border|ring|fill|stroke)-\\[#[0-9a-fA-F]{3,8}\\])`, 'g'), 'hex en una clase: los colores salen de @central/brand')
  reg(new RegExp(`(?<![\\w\\-/\\[])((?:[a-z0-9-]+:)*(?:bg|text|border|ring|divide|from|via|to)-${NOMBRES_AJENOS}(?:/\\d{1,3})?)(?![\\w\\-])`, 'g'), 'no es un color del tema')
  return out
}

/** Compila `clases` con el tema real y devuelve las que NO generan CSS. */
export async function clasesSinCss(clases: string[], cfg: Record<string, unknown> = config as unknown as Record<string, unknown>): Promise<string[]> {
  if (clases.length === 0) return []
  const r = await postcss([tailwindcss({ ...cfg, content: [{ raw: clases.join(' '), extension: 'html' }], corePlugins: { preflight: false } } as never)])
    .process('@tailwind utilities;', { from: undefined })
  return clases.filter(c => !r.css.includes(`.${esc(c)}`))
}

function fuentes(dir: string): { ruta: string; src: string }[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === 'node_modules' || n.startsWith('.') ? [] : fuentes(p)
    return /\.(tsx|ts)$/.test(n) && !/\.test\./.test(n) ? [{ ruta: p.replace(RAIZ + '/', ''), src: readFileSync(p, 'utf8') }] : []
  })
}
const TODAS = [...fuentes(join(RAIZ, 'app')), ...fuentes(join(RAIZ, 'components'))]

describe('tema de Tailwind', () => {
  it('define todo el vocabulario de color del diseño (warn incluido)', () => {
    const definidos = Object.keys((config.theme as { extend: { colors: Record<string, string> } }).extend.colors)
    expect(COLORES_DEL_TEMA.filter(c => !definidos.includes(c))).toEqual([])
  })

  it('toda clase de color del tema usada en app/ y components/ genera CSS (opacidades incluidas)', async () => {
    const usadas = [...new Set(TODAS.flatMap(f => clasesDelTema(f.src)))]
    expect(usadas.length).toBeGreaterThan(50)             // el escáner ve el código de verdad
    expect(usadas.some(c => /\/\d/.test(c))).toBe(true)   // …y también las clases con opacidad
    expect(await clasesSinCss(usadas)).toEqual([])
  })

  it('ninguna clase usa paleta cruda de Tailwind, hex ni colores ajenos al tema', () => {
    const malas = TODAS.flatMap(f => clasesFueraDelTema(f.src).map(h => `${f.ruta}: ${h.clase} (${h.motivo})`))
    expect(malas).toEqual([])
  })

  it('ni cursivas ni serif (la marca no las usa) ni botones de menos de 44 px', () => {
    const malas = TODAS.flatMap(f => [...f.src.matchAll(/(?<![\w-])(italic|font-serif|min-h-\[(?:2\d|3\d|40)px\])(?![\w-])/g)].map(m => `${f.ruta}: ${m[1]}`))
    expect(malas).toEqual([])
  })

  describe('el cepo detecta el fallo (visto en rojo)', () => {
    // La config de ANTES: colores `var(--x)` sin canal alfa y sin `warn`.
    const vieja = {
      theme: { extend: { colors: { ink: 'var(--ink)', ok: 'var(--green)', alert: 'var(--vermilion)', accent: 'var(--accent)' } } },
    }
    it('con la config antigua, bg-ink/40 y text-warn no generan CSS', async () => {
      const rotas = await clasesSinCss(['bg-ink/40', 'bg-ok/20', 'text-warn', 'bg-accent', 'text-ink'], vieja)
      expect(rotas.sort()).toEqual(['bg-ink/40', 'bg-ok/20', 'text-warn'])
    })
    it('con la config actual todas salen', async () => {
      expect(await clasesSinCss(['bg-ink/40', 'bg-ok/20', 'text-warn', 'border-line/50', 'hover:bg-paper-2/50', 'text-alert'])).toEqual([])
    })
    it('el escáner caza paleta cruda, hex y nombres ajenos, y respeta lo legítimo', () => {
      const f = (s: string) => clasesFueraDelTema(s).map(h => h.clase)
      expect(f('<p className="border-amber-300 bg-amber-50 text-red-700 hover:bg-red-600">')).toEqual(['border-amber-300', 'bg-amber-50', 'text-red-700', 'hover:bg-red-600'])
      expect(f('<p className="bg-[#fff] text-danger bg-white text-center border-dashed">')).toEqual(['bg-[#fff]', 'text-danger'])
    })
    it('el escáner de clases del tema ve variantes y opacidad', () => {
      expect(clasesDelTema('className="hover:bg-paper-2/50 text-ink-3 bg-accent-soft border-line/50 text-xs"').sort())
        .toEqual(['bg-accent-soft', 'border-line/50', 'hover:bg-paper-2/50', 'text-ink-3'])
    })
  })
})
