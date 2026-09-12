#!/usr/bin/env node
/**
 * Inyecta el grafo de código (nodos + aristas) en Supabase por el puerto /api/internal/grafo-codigo.
 * Lee el JSON generado, lo parte en lotes de ~2500 filas (por el límite de 4,5 MB de POST en Vercel),
 * y hace fetch a la plataforma en orden, uno detrás de otro.
 *
 * Reintentos: hasta 6 intentos por lote con espera intento*15 segundos si la respuesta no es 200.
 * Un 401 NO se reintenta (CRON_SECRET no coincide); si un lote falla definitivamente, sale con código 1.
 *
 * Envs requeridas: PLATAFORMA_URL y CRON_SECRET. Sin ellas imprime el mensaje de omisión y sale 0.
 */

import fs from 'fs'
import path from 'path'

const PLATAFORMA_URL = process.env.PLATAFORMA_URL || ''
const CRON_SECRET = process.env.CRON_SECRET || ''
const MAX_FILAS_POR_LOTE = 2500

// Validar envs
if (!PLATAFORMA_URL || !CRON_SECRET) {
  console.log('PLATAFORMA_URL/CRON_SECRET no configurados — se omite la inyección.')
  process.exit(0)
}

// Leer el JSON
const rutaJson = process.argv[2]
if (!rutaJson) {
  console.error('Uso: node grafo-codigo-inyectar.mjs <ruta.json>')
  process.exit(1)
}

let grafo
try {
  const contenido = fs.readFileSync(rutaJson, 'utf-8')
  grafo = JSON.parse(contenido)
} catch (e) {
  console.error(`Error al leer/parsear ${rutaJson}:`, e.message)
  process.exit(1)
}

const sha = grafo.sha || ''
const nodos = grafo.nodos || []
const aristas = grafo.aristas || []

if (!sha) {
  console.error('El JSON no tiene "sha"')
  process.exit(1)
}

// Partir en lotes
const lotes = []
let nodosProcessados = 0
let aristasProcessadas = 0

while (nodosProcessados < nodos.length || aristasProcessadas < aristas.length) {
  const lote = { nodos: [], aristas: [] }
  let filasEnLote = 0

  // Añadir nodos mientras quepa
  while (nodosProcessados < nodos.length && filasEnLote < MAX_FILAS_POR_LOTE) {
    lote.nodos.push(nodos[nodosProcessados])
    nodosProcessados++
    filasEnLote++
  }

  // Añadir aristas mientras quepa
  while (aristasProcessadas < aristas.length && filasEnLote < MAX_FILAS_POR_LOTE) {
    lote.aristas.push(aristas[aristasProcessadas])
    aristasProcessadas++
    filasEnLote++
  }

  if (filasEnLote > 0) {
    lotes.push(lote)
  }
}

// Enviar lotes
let lotesEnviados = 0
for (let i = 0; i < lotes.length; i++) {
  const lote = lotes[i]
  const numLote = i + 1
  const totalLotes = lotes.length

  let exito = false
  let codigo = 0

  for (let intento = 1; intento <= 6; intento++) {
    try {
      const resp = await fetch(`${PLATAFORMA_URL}/api/internal/grafo-codigo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CRON_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sha,
          lote: numLote,
          total: totalLotes,
          nodos: lote.nodos,
          aristas: lote.aristas,
        }),
      })

      codigo = resp.status

      if (codigo === 200) {
        console.log(`Lote ${numLote}/${totalLotes} inyectado (intento ${intento}).`)
        exito = true
        break
      }

      if (codigo === 401) {
        console.error(`Lote ${numLote}/${totalLotes}: HTTP ${codigo} — CRON_SECRET no coincide. No se reintenta.`)
        break
      }

      if (intento < 6) {
        const espera = intento * 15
        console.log(`Lote ${numLote}/${totalLotes}: HTTP ${codigo}. Reintento en ${espera}s…`)
        await new Promise(r => setTimeout(r, espera * 1000))
      } else {
        console.error(`Lote ${numLote}/${totalLotes}: HTTP ${codigo} tras 6 intentos.`)
      }
    } catch (e) {
      console.error(`Lote ${numLote}/${totalLotes}, intento ${intento}: ${e.message}`)
      if (intento < 6) {
        const espera = intento * 15
        console.log(`Reintento en ${espera}s…`)
        await new Promise(r => setTimeout(r, espera * 1000))
      }
    }
  }

  if (!exito) {
    console.error(`Inyección de lote ${numLote}/${totalLotes} falló.`)
    process.exit(1)
  }

  lotesEnviados++
}

// Resumen
console.log(
  `\n✅ Inyección completada:\n` +
  `   Lotes: ${lotes.length}\n` +
  `   Nodos: ${nodos.length}\n` +
  `   Aristas: ${aristas.length}\n` +
  `   SHA: ${sha}`
)
