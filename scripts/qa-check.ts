#!/usr/bin/env npx ts-node --esm
/**
 * ia.rest — QA Check
 * Análisis estático de patrones problemáticos conocidos.
 * Actualizar cuando se añada un nuevo bug al qa-protocolo.md de Drive.
 *
 * Uso: npx ts-node --skipProject scripts/qa-check.ts
 * CI:  ver .github/workflows/qa.yml
 */

import fs from 'fs'
import path from 'path'
import { glob } from 'glob'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Violation {
  rule: string
  file: string
  line: number
  snippet: string
  fix: string
}

interface Rule {
  id: string
  description: string
  severity: 'error' | 'warn'
  check: (content: string, lines: string[], filePath: string) => Violation[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function violations(
  ruleId: string,
  fix: string,
  lines: string[],
  filePath: string,
  pattern: RegExp,
  exclude?: RegExp
): Violation[] {
  const result: Violation[] = []
  lines.forEach((line, i) => {
    if (pattern.test(line) && (!exclude || !exclude.test(line))) {
      result.push({
        rule: ruleId,
        file: filePath,
        line: i + 1,
        snippet: line.trim().slice(0, 120),
        fix,
      })
    }
  })
  return result
}

// ── Reglas ───────────────────────────────────────────────────────────────────

const RULES: Rule[] = [

  // BUG-001: Hover-only en móvil
  // onMouseEnter/Leave para abrir/cerrar contenido → no funciona en táctil
  {
    id: 'no-hover-only-interaction',
    description: 'onMouseEnter/Leave usado para mostrar/ocultar contenido (no funciona en móvil táctil)',
    severity: 'error',
    check(content, lines, filePath) {
      const results: Violation[] = []
      // Detectar display:'flex'/'none' en handlers de hover — patrón del bug
      lines.forEach((line, i) => {
        if (
          /onMouseEnter.*style\.display\s*=/.test(line) ||
          /onMouseLeave.*style\.display\s*=/.test(line) ||
          /onMouseEnter.*display.*'flex'/.test(line) ||
          /onMouseLeave.*display.*'none'/.test(line)
        ) {
          results.push({
            rule: 'no-hover-only-interaction',
            file: filePath,
            line: i + 1,
            snippet: line.trim().slice(0, 120),
            fix: 'Usar onClick con estado React para abrir/cerrar. onMouseEnter/Leave solo para efectos visuales (colores, sombras).',
          })
        }
      })
      return results
    },
  },

  // Auth: createClient directo en API routes
  {
    id: 'no-direct-supabase-client-in-api',
    description: 'createClient directo en API route (debe usar createServerClient)',
    severity: 'error',
    check(content, lines, filePath) {
      if (!filePath.includes('/api/') && !filePath.includes('\\api\\')) return []
      return violations(
        'no-direct-supabase-client-in-api',
        'Usar createServerClient() de @/lib/supabase + getSession() de @/lib/session',
        lines,
        filePath,
        /createClient\s*\(\s*process\.env|createClient\s*\(\s*Deno\.env/,
        /supabase-js|lib\/supabase|@supabase\/ssr/ // ignorar imports
      )
    },
  },

  // Auth: x-session-token legacy
  {
    id: 'no-x-session-token',
    description: 'Uso de x-session-token (patrón obsoleto)',
    severity: 'error',
    check(content, lines, filePath) {
      return violations(
        'no-x-session-token',
        'Usar getSession() de @/lib/session — eliminar x-session-token',
        lines,
        filePath,
        /['"']x-session-token['"']/,
        /\/\// // ignorar comentarios simples
      )
    },
  },

  // BD: estado comanda incorrecto (solo en archivos que insertan en 'comandas')
  {
    id: 'invalid-comanda-estado',
    description: "Estado de comanda inválido ('pendiente' o 'abierta' no existen en tabla comandas)",
    severity: 'error',
    check(content, lines, filePath) {
      // Solo aplica si el archivo trabaja explícitamente con la tabla 'comandas'
      if (!content.includes("from('comandas')") && !content.includes('from("comandas")')) return []
      return violations(
        'invalid-comanda-estado',
        "Usar estado: 'nueva' | 'en_curso' | 'lista' | 'cerrada'",
        lines,
        filePath,
        /estado\s*:\s*['"](?:pendiente|abierta)['"]/,
        /\/\//
      )
    },
  },

  // BD: .eq('camarero_id', null) en lugar de .is()
  {
    id: 'use-is-null-for-camarero',
    description: ".eq('camarero_id', null) no funciona en Supabase JS — usar .is()",
    severity: 'error',
    check(content, lines, filePath) {
      return violations(
        'use-is-null-for-camarero',
        "Usar .is('camarero_id', null).maybeSingle() — no .eq()",
        lines,
        filePath,
        /\.eq\s*\(\s*['"]camarero_id['"]\s*,\s*null\s*\)/
      )
    },
  },

  // Impresión: /api/marchar tras /api/comanda
  {
    id: 'no-marchar-after-comanda',
    description: 'Llamada a /api/marchar que puede estar duplicando impresión',
    severity: 'warn',
    check(content, lines, filePath) {
      // Solo avisar si hay fetch a /api/marchar en archivos que también tengan /api/comanda
      if (!content.includes('/api/comanda') || !content.includes('/api/marchar')) return []
      return violations(
        'no-marchar-after-comanda',
        'El courier de /api/comanda ya genera print_jobs. Llamar /api/marchar manualmente duplica la impresión.',
        lines,
        filePath,
        /fetch.*\/api\/marchar/
      )
    },
  },

  // Next.js: params síncronos en dynamic routes (server components y API routes)
  {
    id: 'await-params-in-dynamic-routes',
    description: 'params usado sin await en dynamic route de servidor (App Router)',
    severity: 'error',
    check(content, lines, filePath) {
      // Solo aplica a archivos en carpetas con [param]
      if (!filePath.includes('[') && !filePath.includes('%5B')) return []
      // useParams() es síncrono en Client Components — no aplica
      if (content.includes('useParams()') || content.includes('useParams<')) return []
      // Solo aplica si hay prop params tipado como Promise o sin tipo (server component / API route)
      if (!content.includes('params') || content.includes('await params')) return []
      const results: Violation[] = []
      lines.forEach((line, i) => {
        if (/\bparams\.(?:id|token|slug|restauranteId)\b/.test(line)) {
          results.push({
            rule: 'await-params-in-dynamic-routes',
            file: filePath,
            line: i + 1,
            snippet: line.trim().slice(0, 120),
            fix: 'const { id } = await params — params es Promise<{id:string}> en App Router (server components)',
          })
        }
      })
      return results
    },
  },

  // Colors: ink sobre fondo oscuro
  {
    id: 'no-ink-on-dark-background',
    description: 'C.ink usado como color de texto sobre fondo C.dark/C.bg (usar C.dkFg)',
    severity: 'warn',
    check(content, lines, filePath) {
      const results: Violation[] = []
      lines.forEach((line, i) => {
        // Patrón: background: C.dark... + color: C.ink en la misma línea
        if (/background\s*:\s*C\.(?:dark|bg\d?)/.test(line) && /color\s*:\s*C\.ink(?!\d)/.test(line)) {
          results.push({
            rule: 'no-ink-on-dark-background',
            file: filePath,
            line: i + 1,
            snippet: line.trim().slice(0, 120),
            fix: 'Usar C.dkFg (o C.dkFg2/C.dkFg3) sobre fondos oscuros — C.ink es para fondo claro (paper)',
          })
        }
      })
      return results
    },
  },

]

// ── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  const srcDir = path.join(process.cwd(), 'src')

  const files = await glob('**/*.{ts,tsx}', {
    cwd: srcDir,
    ignore: ['**/*.d.ts', '**/node_modules/**', '**/.next/**'],
    absolute: true,
  })

  const allViolations: Violation[] = []
  let filesChecked = 0

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    // Respetar qa-ignore: blanquear líneas marcadas y las 2 siguientes
    const rawLines = content.split('\n')
    const lines = rawLines.map((l, i) => {
      if (l.includes('qa-ignore')) return ''
      if (i > 0 && rawLines[i-1].includes('qa-ignore')) return ''
      if (i > 1 && rawLines[i-2].includes('qa-ignore')) return ''
      return l
    })
    const relPath = path.relative(process.cwd(), file)

    for (const rule of RULES) {
      const found = rule.check(content, lines, relPath)
      allViolations.push(...found)
    }
    filesChecked++
  }

  // ── Output ────────────────────────────────────────────────────────────────

  const errors = allViolations.filter(v => RULES.find(r => r.id === v.rule)?.severity === 'error')
  const warns  = allViolations.filter(v => RULES.find(r => r.id === v.rule)?.severity === 'warn')

  console.log(`\n🔍 ia.rest QA Check — ${filesChecked} archivos analizados\n`)

  if (allViolations.length === 0) {
    console.log('✅ Sin problemas detectados.\n')
    process.exit(0)
  }

  if (errors.length > 0) {
    console.log(`❌ ERRORES (${errors.length}) — bloquean el push:\n`)
    for (const v of errors) {
      console.log(`  [${v.rule}] ${v.file}:${v.line}`)
      console.log(`  → ${v.snippet}`)
      console.log(`  ✎ ${v.fix}\n`)
    }
  }

  if (warns.length > 0) {
    console.log(`⚠️  AVISOS (${warns.length}) — revisar antes de confirmar:\n`)
    for (const v of warns) {
      console.log(`  [${v.rule}] ${v.file}:${v.line}`)
      console.log(`  → ${v.snippet}`)
      console.log(`  ✎ ${v.fix}\n`)
    }
  }

  console.log(`\nTotal: ${errors.length} errores, ${warns.length} avisos`)
  console.log('Ver Drive → qa-protocolo.md para contexto de cada regla.\n')

  // Solo los errores bloquean el CI
  if (errors.length > 0) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
