#!/usr/bin/env node
// Exporta inyectarEmbeddings para ser usado por scripts/memoria-embeddings-inyectar.mjs.
// El puerto /api/internal/grafo-codigo/embeddings fue eliminado en Sept 2026.
// Esta función se reutiliza para inyectar embeddings de memoria.
import { leerEnvs } from './inyectar-lotes.mjs'

const MAX_PASADAS = 8
const MAX_INTENTOS = 6
const dormir = (s) => new Promise(r => setTimeout(r, s * 1000))

export async function inyectarEmbeddings({ url, secret, fetchImpl = fetch, esperar = dormir, log = console, maxPasadas = MAX_PASADAS }) {
  let total = 0
  let avisadaClave = false
  for (let pasada = 1; pasada <= maxPasadas; pasada++) {
    let json = null
    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      let status = 0
      let cuerpo = ''
      try {
        const res = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } })
        status = res.status
        cuerpo = await res.text()
      } catch (e) {
        cuerpo = e instanceof Error ? e.message : String(e)
      }
      if (status === 200) {
        try { json = JSON.parse(cuerpo) } catch { json = null }
        if (json && typeof json.pendientes === 'number') break
        log.error(`Embeddings, pasada ${pasada}: respuesta 200 sin "pendientes" numérico (${cuerpo.slice(0, 200)}) — no se da por hecho.`)
        return { ok: false, total, pendientes: null }
      }
      if (status === 401 || status === 503) {
        log.error(`Embeddings, pasada ${pasada}: HTTP ${status} ${cuerpo.slice(0, 300)} — no se reintenta (${status === 401 ? 'CRON_SECRET no coincide' : 'sin key de OpenRouter en Vercel'}).`)
        return { ok: false, total, pendientes: null }
      }
      if (intento < MAX_INTENTOS) {
        log.log(`Embeddings, pasada ${pasada}: ${status ? `HTTP ${status}` : 'sin respuesta'} ${cuerpo.slice(0, 200)}. Reintento en ${intento * 15}s…`)
        await esperar(intento * 15)
      } else {
        log.error(`Embeddings, pasada ${pasada}: ${status ? `HTTP ${status}` : 'sin respuesta'} tras ${MAX_INTENTOS} intentos. ${cuerpo.slice(0, 300)}`)
        return { ok: false, total, pendientes: null }
      }
    }
    if (json.usandoClavePrincipal && !avisadaClave) {
      avisadaClave = true
      log.error('⚠️ Embeddings: plataforma está usando OPENROUTER_API_KEY (la principal) porque no hay GRAFO_OPENROUTER_API_KEY. Esa clave queda en Vault, legible por quien ejecute SQL como postgres: pon una key dedicada con límite de gasto.')
    }
    total += json.embebidas ?? 0
    log.log(`Embeddings, pasada ${pasada}: sync ${JSON.stringify(json.sync)} · embebidas ${json.embebidas} · pendientes ${json.pendientes}`)
    if (json.pendientes === 0) return { ok: true, total, pendientes: 0 }
  }
  log.error(`Embeddings: siguen quedando pendientes tras ${maxPasadas} pasadas.`)
  return { ok: false, total, pendientes: -1 }
}
