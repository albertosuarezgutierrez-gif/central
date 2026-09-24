import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// GUARDIÁN: ningún `var(--token)` del panel puede apuntar a un token que no existe.
//
// POR QUÉ (02/09/2026). `var(--card)` y `var(--line)` NO estaban definidos en ninguna parte y los
// usaban 4 pantallas, entre ellas `/operador/agentes` y la bandeja de facturas. Un token
// inexistente no avisa: CSS invalida la DECLARACIÓN ENTERA, así que
// `border: '1px solid var(--line)'` desaparece y `background: 'var(--card)'` se queda transparente.
// El resultado es una pantalla sin tarjetas ni separaciones — se lee como una lista sin formato, y
// nadie la reporta como «rota» porque no hay error en ningún sitio. Estuvo así hasta que Alberto
// dijo que la página de agentes no le parecía una página.
//
// Un token con fallback (`var(--x, #fff)`) NO cuenta: ahí el autor ya declaró qué pasa si falta.

const RAIZ = 'apps/plataforma'

/**
 * Tokens que se inyectan EN CALIENTE, no en la hoja de estilos. No son un olvido: no pueden estar
 * en `globals.css` porque su valor depende de la marca del tenant o de la fuente cargada.
 */
const INYECTADOS_EN_RUNTIME: Record<string, string> = {
  '--brand': 'lo emite @central/brand (emitirRootCss) según la marca del cliente',
  '--accent': 'ídem: color decorativo de la marca del cliente',
  '--font-inter': 'lo inyecta next/font en el layout',
}

function archivos(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    let entradas: string[]
    try { entradas = readdirSync(d) } catch { return }
    for (const e of entradas) {
      if (e === 'node_modules' || e === '.next') continue
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(tsx?|css)$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p)
    }
  }
  walk(dir)
  return out
}

test('ningún var(--token) del panel apunta a un token inexistente', () => {
  const fs = [...archivos(join(RAIZ, 'app')), ...archivos(join(RAIZ, 'components'))]
  assert.ok(fs.length > 100, `se esperaban cientos de archivos, hay ${fs.length}`)

  const definidos = new Set(Object.keys(INYECTADOS_EN_RUNTIME))
  const usados = new Map<string, Set<string>>()
  for (const f of fs) {
    const t = readFileSync(f, 'utf8')
    // Definición: `--x: v` en CSS y `'--x': v` en un objeto de estilo de React.
    for (const m of t.matchAll(/(?:^|[{;\s'"])(--[a-zA-Z0-9-]+)\s*'?\s*:/g)) definidos.add(m[1])
    // Uso SIN fallback: `var(--x)` a secas. Con fallback el autor ya cubrió la ausencia.
    for (const m of t.matchAll(/var\((--[a-zA-Z0-9-]+)\s*\)/g)) {
      if (!usados.has(m[1])) usados.set(m[1], new Set())
      usados.get(m[1])!.add(f)
    }
  }

  const huerfanos = [...usados].filter(([t]) => !definidos.has(t))
  assert.deepEqual(
    huerfanos.map(([t, f]) => `${t} (en ${[...f][0]}${f.size > 1 ? ` y ${f.size - 1} más` : ''})`),
    [],
    'Estos var(--token) no existen: la declaración entera se cae y la pantalla pierde fondo o borde\n' +
    'SIN dar ningún error. Usa un token de globals.css (--surface, --border, --muted…), define el\n' +
    'tuyo, o dale un fallback: var(--x, #fff). Si de verdad se inyecta en caliente, decláralo en\n' +
    'INYECTADOS_EN_RUNTIME con el motivo.',
  )
})
