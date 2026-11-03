// CLI: candidatos al vocabulario común desde los avisos y errores reales (26/10/2026). Offline: lee un JSON, no abre la base de datos ni la red.
//
//   npm run vocabulario-candidatos -- <filas.json|-> [--json] [--min-veces N] [--salida informe.md]
//
// `filas.json` = array JSON (o una fila JSON por línea) de `{ "texto": "...", "compania": "mapfre" }`. Se obtiene con SQL de SOLO LECTURA sobre avisos y
// mensajes de error (NUNCA la columna `riesgo`: lleva datos personales), por ejemplo:
//
//   select p.compania, a.texto
//     from seguros.tarificacion_precios p cross join lateral jsonb_array_elements_text(p.avisos) as a(texto)
//    where p.creado_at > now() - interval '14 days'
//   union all
//   select t.compania, t.error->>'mensaje'
//     from seguros.tarificacion_trabajos t
//    where t.error is not null and t.updated_at > now() - interval '14 days';
//
// Salida: Markdown (o JSON con --json). Los candidatos de LECTURA salen «auto_aplicables», los de ACCIÓN «requieren revisión» y los que casan la lista de
// bloqueo, «descartados». NADA se aplica en runtime ni se escribe en `src/`: una persona (o un PR draft) añade los términos a `src/vocabulario.ts`.
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { TERMINOS_BLOQUEO_SOLO_GUARD } from '../src/guard.ts'
import { informeMarkdown, proponerCandidatos, type FilaAviso } from './lib/vocabulario-candidatos.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { json: { type: 'boolean' }, 'min-veces': { type: 'string' }, salida: { type: 'string' } },
})
const ruta = positionals[0]
if (!ruta) {
  console.error('Uso: vocabulario-candidatos <filas.json|-> [--json] [--min-veces N] [--salida informe.md]')
  process.exit(2)
}
const crudo = readFileSync(ruta === '-' ? 0 : ruta, 'utf8').trim()

function leerFilas(texto: string): FilaAviso[] {
  if (texto === '') return []
  let datos: unknown
  try {
    datos = JSON.parse(texto)
  } catch {
    datos = texto.split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => JSON.parse(l))
  }
  const lista = Array.isArray(datos) ? datos : [datos]
  return lista.flatMap((f): FilaAviso[] => {
    if (typeof f === 'string') return [{ texto: f }]
    if (f && typeof f === 'object' && typeof (f as { texto?: unknown }).texto === 'string') {
      const x = f as { texto: string; compania?: unknown; ramo?: unknown }
      return [{ texto: x.texto, compania: typeof x.compania === 'string' ? x.compania : null, ramo: typeof x.ramo === 'string' ? x.ramo : null }]
    }
    return []
  })
}

const minVeces = values['min-veces'] ? Math.max(1, Number.parseInt(values['min-veces'], 10) || 1) : 1
const candidatos = proponerCandidatos(leerFilas(crudo), { extraBloqueo: TERMINOS_BLOQUEO_SOLO_GUARD, minVeces })
const salida = values.json ? `${JSON.stringify(candidatos, null, 2)}\n` : `${informeMarkdown(candidatos, new Date().toISOString().slice(0, 10))}\n`
if (values.salida) {
  writeFileSync(values.salida, salida)
  console.error(`Informe escrito en ${values.salida} (${candidatos.length} candidatos; nada aplicado)`)
} else process.stdout.write(salida)
