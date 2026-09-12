#!/usr/bin/env node
/**
 * Inyecta el grafo de código (nodos + aristas) en Supabase por el puerto /api/internal/grafo-codigo.
 * Lee el JSON generado por scripts/grafo-codigo.mjs, lo parte en lotes de ~6000 filas (~1 MB; el
 * archivo entero pesa ~15 MB y Vercel corta el POST en 4,5 MB) y los manda en orden por el helper
 * compartido scripts/inyectar-lotes.mjs (reintentos, 401 sin reintento, lote/total en el body).
 *
 * Envs requeridas: PLATAFORMA_URL y CRON_SECRET. Sin ellas imprime el mensaje de omisión y sale 0.
 */

import fs from 'node:fs'
import { enviarLotes, leerEnvs } from './inyectar-lotes.mjs'

const MAX_FILAS_POR_LOTE = 6000 // ~1 MB por lote (fila ≈ 150 B), lejos del corte de 4,5 MB; menos POSTs = menos ventana de corte

const envs = leerEnvs()
if (!envs) process.exit(0)

const rutaJson = process.argv[2]
if (!rutaJson) { console.error('Uso: node grafo-codigo-inyectar.mjs <ruta.json>'); process.exit(1) }

let grafo
try { grafo = JSON.parse(fs.readFileSync(rutaJson, 'utf-8')) } catch (e) { console.error(`Error al leer/parsear ${rutaJson}:`, e.message); process.exit(1) }

const sha = grafo.sha || ''
const nodos = grafo.nodos || []
const aristas = grafo.aristas || []
if (!sha) { console.error('El JSON no tiene "sha"'); process.exit(1) }

/** Lotes de hasta MAX_FILAS_POR_LOTE filas: primero nodos, después aristas (un lote puede mezclar). */
export function partirGrafo(nodos, aristas, max = MAX_FILAS_POR_LOTE) {
  const lotes = []
  let i = 0, j = 0
  while (i < nodos.length || j < aristas.length) {
    const lote = { nodos: [], aristas: [] }
    let filas = 0
    while (i < nodos.length && filas < max) { lote.nodos.push(nodos[i++]); filas++ }
    while (j < aristas.length && filas < max) { lote.aristas.push(aristas[j++]); filas++ }
    lotes.push(lote)
  }
  return lotes
}

const lotes = partirGrafo(nodos, aristas)
const ok = await enviarLotes({
  url: `${envs.PLATAFORMA_URL}/api/internal/grafo-codigo`,
  secret: envs.CRON_SECRET,
  sha,
  lotes,
  construirBody: (lote) => ({ nodos: lote.nodos, aristas: lote.aristas }),
  etiqueta: 'Grafo, lote',
})
if (!ok) { console.error('Inyección del grafo falló.'); process.exit(1) }

console.log(
  `\n✅ Inyección completada:\n` +
  `   Lotes: ${lotes.length}\n` +
  `   Nodos: ${nodos.length}\n` +
  `   Aristas: ${aristas.length}\n` +
  `   SHA: ${sha}`
)
