#!/usr/bin/env node
// Pide a plataforma que calcule los embeddings del grafo de código (búsqueda semántica propia).
// El puerto /api/internal/grafo-codigo/embeddings sincroniza los textos con mapa_arquitectura y embebe
// lo pendiente hasta agotar su tiempo; aquí se le llama hasta que responda `pendientes: 0` (tope de
// pasadas para no colgar el workflow). Envs: PLATAFORMA_URL, CRON_SECRET (sin ellas se omite, exit 0).
import { leerEnvs } from './inyectar-lotes.mjs'

const MAX_PASADAS = 8

export async function inyectarEmbeddings({ url, secret, fetchImpl = fetch, log = console, maxPasadas = MAX_PASADAS }) {
  let total = 0
  for (let pasada = 1; pasada <= maxPasadas; pasada++) {
    const res = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } })
    const cuerpo = await res.text()
    if (res.status !== 200) {
      log.error(`Embeddings, pasada ${pasada}: HTTP ${res.status} ${cuerpo.slice(0, 300)}`)
      return { ok: false, total, pendientes: null }
    }
    let json
    try { json = JSON.parse(cuerpo) } catch { log.error(`Embeddings, pasada ${pasada}: respuesta no JSON`); return { ok: false, total, pendientes: null } }
    total += json.embebidas ?? 0
    log.log(`Embeddings, pasada ${pasada}: sync ${JSON.stringify(json.sync)} · embebidas ${json.embebidas} · pendientes ${json.pendientes}`)
    if ((json.pendientes ?? 0) === 0) return { ok: true, total, pendientes: 0 }
  }
  log.error(`Embeddings: siguen quedando pendientes tras ${maxPasadas} pasadas.`)
  return { ok: false, total, pendientes: -1 }
}

const esMain = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]
if (esMain) {
  const envs = leerEnvs()
  if (!envs) process.exit(0)
  const r = await inyectarEmbeddings({ url: `${envs.PLATAFORMA_URL}/api/internal/grafo-codigo/embeddings`, secret: envs.CRON_SECRET })
  if (!r.ok) process.exit(1)
  console.log(`✅ Embeddings al día (${r.total} calculados en esta pasada).`)
}
