#!/usr/bin/env node
// Inyecta el mapa de funciones (docs/mapa-funciones.generated.json, que genera
// scripts/auditar-estructura.mjs) en Supabase por el puerto /api/internal/mapa-arquitectura,
// partido en lotes de ~1 MB. Sustituye al `curl --data-binary` del workflow auditoria.yml, que
// mandaba el archivo entero y murió con 413 al cruzar los 4,5 MB de Vercel (12/09/2026).
// Uso: node scripts/mapa-arquitectura-inyectar.mjs docs/mapa-funciones.generated.json
// Envs: PLATAFORMA_URL, CRON_SECRET (sin ellas se omite y sale 0).

import fs from 'node:fs'
import { enviarLotes, leerEnvs, partirEnLotes } from './inyectar-lotes.mjs'

const envs = leerEnvs()
if (!envs) process.exit(0)

const ruta = process.argv[2]
if (!ruta) { console.error('Uso: node scripts/mapa-arquitectura-inyectar.mjs <mapa.json>'); process.exit(1) }

let mapa
try { mapa = JSON.parse(fs.readFileSync(ruta, 'utf8')) } catch (e) { console.error(`No se pudo leer ${ruta}: ${e.message}`); process.exit(1) }

const sha = typeof mapa?.sha === 'string' ? mapa.sha : ''
const archivos = Array.isArray(mapa?.archivos) ? mapa.archivos : []
if (!sha || !archivos.length) { console.error('El mapa no tiene "sha" o "archivos"'); process.exit(1) }

const lotes = partirEnLotes(archivos)
console.log(`Mapa: ${archivos.length} archivos → ${lotes.length} lote(s), sha ${sha.slice(0, 7)}.`)
const ok = await enviarLotes({
  url: `${envs.PLATAFORMA_URL}/api/internal/mapa-arquitectura`,
  secret: envs.CRON_SECRET,
  sha,
  lotes,
  construirBody: (lote) => ({ archivos: lote }),
  etiqueta: 'Mapa, lote',
})
if (!ok) { console.error('Inyección del mapa falló tras los reintentos.'); process.exit(1) }
console.log('Inyección del mapa OK.')
