#!/usr/bin/env node
// Pide a plataforma que calcule los embeddings de la memoria semántica (memoria_buscar). Reutiliza
// TAL CUAL inyectarEmbeddings() de scripts/grafo-embeddings-inyectar.mjs (misma política de
// reintentos, mismo contrato { pendientes }) contra el puerto de memoria en vez del de grafo.
// Envs: PLATAFORMA_URL, CRON_SECRET (sin ellas se omite, exit 0).
import { leerEnvs } from './inyectar-lotes.mjs'
import { inyectarEmbeddings } from './grafo-embeddings-inyectar.mjs'

const envs = leerEnvs()
if (!envs) process.exit(0)

const r = await inyectarEmbeddings({ url: `${envs.PLATAFORMA_URL}/api/internal/memoria/embeddings`, secret: envs.CRON_SECRET })
if (!r.ok) process.exit(1)
console.log(`✅ Embeddings de memoria al día (${r.total} calculados en esta pasada).`)
