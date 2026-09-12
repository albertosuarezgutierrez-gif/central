#!/usr/bin/env node
/**
 * Inyecta la memoria semántica (entradas parseadas por scripts/memoria-parsear.mjs) en Supabase
 * por el puerto /api/internal/memoria. Parte en lotes por bytes (partirEnLotes, mismo tope que el
 * grafo de código) y los manda en orden por scripts/inyectar-lotes.mjs.
 *
 * Envs requeridas: PLATAFORMA_URL y CRON_SECRET. Sin ellas imprime el mensaje de omisión y sale 0.
 */
import fs from 'node:fs'
import { enviarLotes, leerEnvs, partirEnLotes } from './inyectar-lotes.mjs'

const envs = leerEnvs()
if (!envs) process.exit(0)

const rutaJson = process.argv[2]
if (!rutaJson) { console.error('Uso: node memoria-inyectar.mjs <ruta.json>'); process.exit(1) }

let memoria
try { memoria = JSON.parse(fs.readFileSync(rutaJson, 'utf-8')) } catch (e) { console.error(`Error al leer/parsear ${rutaJson}:`, e.message); process.exit(1) }

const sha = memoria.sha || ''
const entradas = memoria.entradas || []
if (!sha) { console.error('El JSON no tiene "sha"'); process.exit(1) }

const lotes = partirEnLotes(entradas)
const ok = await enviarLotes({
  url: `${envs.PLATAFORMA_URL}/api/internal/memoria`,
  secret: envs.CRON_SECRET,
  sha,
  lotes,
  construirBody: (lote) => ({ entradas: lote }),
  etiqueta: 'Memoria, lote',
})
if (!ok) { console.error('Inyección de la memoria falló.'); process.exit(1) }

console.log(`\n✅ Inyección completada:\n   Lotes: ${lotes.length}\n   Entradas: ${entradas.length}\n   SHA: ${sha}`)
