#!/usr/bin/env node
// Ejecutor de código BARATO por línea de comandos — atajo del endpoint POST /api/ai/ejecutar
// (Fase 1 "caro planifica / barato ejecuta"). Dado UN archivo + una instrucción precisa (que ya
// redactó el planificador: la sesión Claude), un modelo coder barato del catálogo del Director
// reescribe el archivo. El diff SIEMPRE lo revisa un humano por git antes de commitear.
//
//   node scripts/ai-ejecutar.mjs --ruta apps/x/lib/foo.ts --instruccion "renombra bar→baz"
//   node scripts/ai-ejecutar.mjs --ruta foo.ts --instruccion "..." --criterio "..." --dry
//   node scripts/ai-ejecutar.mjs --smoke        # healthcheck: ¿vive el endpoint? (no toca disco)
//
// Envs: PLATAFORMA_URL + AI_GATEWAY_SECRET (los mismos del Director de código). El secreto NUNCA
// se imprime. Node puro, sin dependencias (fetch global, Node ≥18). Degrada con mensaje claro.

import { readFileSync, writeFileSync } from 'node:fs'

// — Parseo de argumentos a mano (mismo estilo Node-puro que el resto de scripts del repo) —
function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) { out[key] = true } // flag booleana
    else { out[key] = next; i++ }
  }
  return out
}

const USO = `Uso:
  node scripts/ai-ejecutar.mjs --ruta <archivo> --instruccion "<qué hacer>" [--criterio "..."] [--maxTokens N] [--dry]
  node scripts/ai-ejecutar.mjs --smoke

Flags:
  --ruta         Archivo a reescribir (relativo o absoluto).
  --instruccion  Instrucción PRECISA para el coder barato.
  --criterio     (opcional) Criterio de aceptación.
  --maxTokens    (opcional) Tope de tokens de salida (default del endpoint: 8000).
  --dry          Imprime el contenido devuelto SIN escribir el archivo.
  --smoke        Healthcheck: manda un archivo de juguete y valida la respuesta (no toca disco).

Envs: PLATAFORMA_URL, AI_GATEWAY_SECRET.`

function fallar(msg) {
  console.error(`✖ ${msg}`)
  process.exit(1)
}

// — Llamada al endpoint. Devuelve { contenido, modelo } o lanza con el error del endpoint. —
async function ejecutar({ base, secret, ruta, contenido, instruccion, criterio, maxTokens }) {
  let res
  try {
    res = await fetch(`${base.replace(/\/$/, '')}/api/ai/ejecutar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruta, contenido, instruccion, criterio, maxTokens }),
      signal: AbortSignal.timeout(90_000),
    })
  } catch (e) {
    throw new Error(`no se pudo contactar con el ejecutor: ${e instanceof Error ? e.message : e}`)
  }
  const txt = await res.text()
  if (!res.ok) {
    let detalle = txt
    try { detalle = JSON.parse(txt).error ?? txt } catch { /* deja el texto crudo */ }
    throw new Error(`HTTP ${res.status}: ${detalle}`)
  }
  const json = JSON.parse(txt)
  return { contenido: json.contenido ?? '', modelo: json.modelo ?? '(desconocido)' }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args.h) { console.log(USO); process.exit(0) }

  const base = process.env.PLATAFORMA_URL
  const secret = process.env.AI_GATEWAY_SECRET
  if (!base || !secret) fallar('faltan envs PLATAFORMA_URL y/o AI_GATEWAY_SECRET.')

  // — Modo smoke: prueba mínima end-to-end, sin tocar disco —
  if (args.smoke) {
    try {
      const r = await ejecutar({
        base, secret,
        ruta: 'smoke.txt',
        contenido: 'hola\n',
        instruccion: 'Devuelve el archivo con la palabra "hola" en MAYÚSCULAS, sin nada más.',
      })
      const ok = r.contenido.toUpperCase().includes('HOLA')
      console.log(`${ok ? '✓' : '⚠'} ejecutor responde (modelo: ${r.modelo}). Salida: ${JSON.stringify(r.contenido.trim()).slice(0, 80)}`)
      process.exit(ok ? 0 : 2)
    } catch (e) {
      fallar(`smoke falló: ${e instanceof Error ? e.message : e}`)
    }
    return
  }

  // — Modo normal —
  const ruta = typeof args.ruta === 'string' ? args.ruta : null
  const instruccion = typeof args.instruccion === 'string' ? args.instruccion : null
  if (!ruta || !instruccion) { console.error(USO); fallar('faltan --ruta y/o --instruccion.') }

  let contenido
  try { contenido = readFileSync(ruta, 'utf8') } catch (e) {
    fallar(`no se pudo leer ${ruta}: ${e instanceof Error ? e.message : e}`)
  }

  let r
  try {
    r = await ejecutar({
      base, secret, ruta, contenido, instruccion,
      criterio: typeof args.criterio === 'string' ? args.criterio : undefined,
      maxTokens: args.maxTokens ? Number(args.maxTokens) : undefined,
    })
  } catch (e) {
    fallar(e instanceof Error ? e.message : String(e))
  }

  if (args.dry) {
    console.log(r.contenido)
    console.error(`— dry-run (modelo: ${r.modelo}); no se escribió ${ruta} —`)
    return
  }
  writeFileSync(ruta, r.contenido)
  console.error(`✓ ${ruta} reescrito por ${r.modelo}. REVISA el diff (git) y verifica (tsc/tests) antes de commitear.`)
}

main()
