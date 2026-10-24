#!/usr/bin/env node
// Protector de tests — hook `PreToolUse` (Edit|Write|MultiEdit). Impide el «falso verde»:
// que una sesión/agente ponga el CI en verde DESACTIVANDO tests en vez de arreglarlos.
// Regla del repo: nunca saltar/desactivar/cuarentenar un test. Diseño inspirado en
// karanb192/claude-code-hooks (protect-tests, MIT), reescrito a nuestra forma.
//
// Bloquea (exit 2) sobre ficheros `*.test.*`, `*.spec.*` o dentro de `test/`, `__tests__/`:
//  - si el contenido nuevo AÑADE (más ocurrencias que el viejo): `.skip(`, `.only(`, `.todo(`,
//    `xit(`/`xdescribe(`/`xtest(`, `skip: true` / `skip:` (opciones de node:test);
//  - si un Write deja VACÍO un fichero de test que tenía contenido (borrado encubierto).
// Solo cuenta lo AÑADIDO: editar un test que ya tenía skip sin añadir otro, pasa.
//
// Decisión PURA (`decidir`) separada de stdin/disco para testearla. Guardián:
// test/regression-hook-proteger-tests.test.ts.
// FAIL-OPEN: JSON ilegible, fichero ilegible o cualquier error interno -> deja pasar.

import { readFileSync, existsSync } from 'node:fs'

const RE_RUTA = /(\.(test|spec)\.[cm]?[jt]sx?$)|((^|[\\/])(test|tests|__tests__)[\\/])/
const PATRONES = [
  ['.skip(', /\.skip\s*\(/g],
  ['.only(', /\.only\s*\(/g],
  ['.todo(', /\.todo\s*\(/g],
  ['xit(/xdescribe(/xtest(', /\b(xit|xdescribe|xtest)\s*\(/g],
  ['skip: ...', /\bskip\s*:\s*(?:true|['"`])/g],
]

export function esRutaDeTest(ruta) {
  return typeof ruta === 'string' && RE_RUTA.test(ruta)
}

function contar(texto, re) {
  return (String(texto ?? '').match(re) || []).length
}

/** Patrones de desactivación que `nuevo` tiene de MÁS respecto a `viejo`. */
export function anadidos(viejo, nuevo) {
  const out = []
  for (const [nombre, re] of PATRONES) {
    if (contar(nuevo, re) > contar(viejo, re)) out.push(nombre)
  }
  return out
}

/**
 * @param {{ruta:string, viejo?:string, nuevo?:string, escrituraCompleta?:boolean}} p
 * `viejo`/`nuevo` = trozos comparables (Edit/MultiEdit: old/new_string; Write: fichero entero).
 */
export function decidir({ ruta, viejo = '', nuevo = '', escrituraCompleta = false }) {
  if (!esRutaDeTest(ruta)) return { bloquear: false }
  if (escrituraCompleta && String(nuevo).trim() === '' && String(viejo).trim() !== '') {
    return { bloquear: true, motivo: `🚫 proteger-tests: dejar VACÍO ${ruta} borra el test entero. Si el test sobra, bórralo a propósito con Alberto; no lo vacíes para pasar CI. Arregla el código, no el cepo.` }
  }
  const quePasa = anadidos(viejo, nuevo)
  if (quePasa.length) {
    return { bloquear: true, motivo: `🚫 proteger-tests: ${ruta} AÑADE ${quePasa.join(', ')}. Desactivar/saltar/aislar un test para poner el CI en verde es un falso verde (regla del repo: nunca saltar ni cuarentenar). Arregla la causa. Si es legítimo, pídele OK explícito a Alberto.` }
  }
  return { bloquear: false }
}

function principal(entrada) {
  const json = JSON.parse(entrada)
  const herramienta = json?.tool_name
  const ti = json?.tool_input ?? {}
  const ruta = ti.file_path
  if (!esRutaDeTest(ruta)) return { bloquear: false }
  if (herramienta === 'Edit') {
    return decidir({ ruta, viejo: ti.old_string, nuevo: ti.new_string })
  }
  if (herramienta === 'MultiEdit') {
    const edits = Array.isArray(ti.edits) ? ti.edits : []
    return decidir({
      ruta,
      viejo: edits.map((e) => e?.old_string ?? '').join('\n'),
      nuevo: edits.map((e) => e?.new_string ?? '').join('\n'),
    })
  }
  if (herramienta === 'Write') {
    const viejo = existsSync(ruta) ? readFileSync(ruta, 'utf8') : ''
    return decidir({ ruta, viejo, nuevo: ti.content ?? '', escrituraCompleta: true })
  }
  return { bloquear: false }
}

if (process.argv[1] && process.argv[1].endsWith('proteger-tests.mjs')) {
  let codigo = 0
  try {
    const d = principal(readFileSync(0, 'utf8'))
    if (d.bloquear) { process.stderr.write(d.motivo + '\n'); codigo = 2 }
  } catch { codigo = 0 } // fail-open
  process.exit(codigo)
}
