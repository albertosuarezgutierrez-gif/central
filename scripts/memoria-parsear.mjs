#!/usr/bin/env node
// Parsea la memoria (docs/CONTEXTO-SESIONES.md + docs/memoria/*.md) en entradas para la búsqueda
// semántica propia (memoria_buscar — sustituto de recall/memories_about de Graphify).
//
// Reutiliza el troceador de scripts/rotar-memoria.mjs (`trocear`): es el mismo criterio ya
// probado que separa entradas (bullet `- **` fechado vs heading `### `, con el caso especial de
// sub-bullets dentro de una entrada `### `) — reimplementarlo aquí divergiría del que usa la
// rotación mensual y las dos lecturas del mismo archivo acabarían discrepando.
//
// Uso: node scripts/memoria-parsear.mjs --out /tmp/memoria.json
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { trocear, esInicioEntrada, ultimaFecha, textoFechaDe } from './rotar-memoria.mjs'
import { gitSha } from './git-sha.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

function parsearArchivo(rutaAbs, fuente) {
  const texto = readFileSync(rutaAbs, 'utf8')
  const lineas = texto.split('\n')
  const primeraEntrada = lineas.findIndex(esInicioEntrada)
  if (primeraEntrada === -1) return []
  const entradas = trocear(lineas.slice(primeraEntrada))
  return entradas.map((lineasEntrada) => {
    const cuerpo = lineasEntrada.join('\n').replace(/\n+$/, '')
    const m = ultimaFecha(textoFechaDe(lineasEntrada))
    const fecha = m ? `${m[1].padStart(2, '0')}/${m[2]}/${m[3] ?? ''}` : null
    const hash = createHash('md5').update(cuerpo).digest('hex').slice(0, 16)
    return { id: `${fuente}#${hash}`, fuente, fecha, texto: cuerpo }
  })
}

function main() {
  const args = process.argv.slice(2)
  const iOut = args.indexOf('--out')
  const salida = iOut !== -1 ? args[iOut + 1] : null
  if (!salida) { console.error('Uso: node memoria-parsear.mjs --out <ruta.json>'); process.exit(1) }

  const entradas = []
  entradas.push(...parsearArchivo(join(raiz, 'docs/CONTEXTO-SESIONES.md'), 'docs/CONTEXTO-SESIONES.md'))
  const dirMemoria = join(raiz, 'docs/memoria')
  for (const f of readdirSync(dirMemoria).filter((f) => f.endsWith('.md')).sort()) {
    entradas.push(...parsearArchivo(join(dirMemoria, f), `docs/memoria/${f}`))
  }

  // Dos entradas con el mismo id (mismo fuente+texto exacto) se colapsan: no aporta nada
  // embeber el mismo texto dos veces y confundiría el borrado por "no está en este run".
  const porId = new Map()
  for (const e of entradas) porId.set(e.id, e)

  const resultado = { sha: gitSha(process.env, raiz), generado: new Date().toISOString(), entradas: [...porId.values()] }
  writeFileSync(salida, JSON.stringify(resultado))
  console.log(`Memoria parseada: ${resultado.entradas.length} entradas (de ${entradas.length} brutas) → ${salida}`)
}

main()
