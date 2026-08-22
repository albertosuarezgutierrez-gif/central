// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// ✅ Sin secretos. Copia FIEL del original, sin tocar una línea.
// 📌 ÚNICA del rescate que pertenece a algo VIVO del monorepo: es el puente que usa la
//    Fase 3 de subastas (`apps/plataforma`) para leer adjuntos del Portal de Subastas
//    del BOE. Su propio comentario dice «TEMPORAL … eliminar al cerrar la fase».
// ⚠️ `verify_jwt=false`, pero es el caso menos malo del lote: no escribe nada, no lleva
//    credencial y la lista blanca de host (`subastas.boe.es`, solo https) impide usarla
//    como proxy abierto. Aun así conviene cerrarla cuando la fase termine.
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1'

Deno.serve(async (req: Request) => {
  const sp = new URL(req.url).searchParams
  const u = sp.get('url') ?? ''
  const modo = sp.get('modo') ?? 'texto'
  let destino: URL
  try {
    destino = new URL(u)
  } catch {
    return Response.json({ error: 'url inválida' }, { status: 400 })
  }
  if (destino.protocol !== 'https:' || destino.hostname !== 'subastas.boe.es') {
    return Response.json({ error: `host fuera de la lista: ${destino.hostname}` }, { status: 400 })
  }
  const r = await fetch(destino, {
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' },
    signal: AbortSignal.timeout(25000),
  })
  if (!r.ok) return Response.json({ error: `fetch ${r.status}` }, { status: 502 })
  const tipo = r.headers.get('content-type') ?? ''
  const buf = new Uint8Array(await r.arrayBuffer())

  if (modo === 'info') return Response.json({ bytes: buf.length, tipo })

  if (modo === 'b64') {
    const desde = Math.max(0, parseInt(sp.get('desde') ?? '0', 10) || 0)
    const len = Math.min(Math.max(parseInt(sp.get('len') ?? '262144', 10) || 262144, 1), 524288)
    const tramo = buf.slice(desde, desde + len)
    let bin = ''
    for (let i = 0; i < tramo.length; i += 8192) bin += String.fromCharCode(...tramo.subarray(i, i + 8192))
    return Response.json({ bytes: buf.length, desde, len: tramo.length, b64: btoa(bin) })
  }

  try {
    const pdf = await getDocumentProxy(buf)
    const { text, totalPages } = await extractText(pdf, { mergePages: true })
    return Response.json({ paginas: totalPages, chars: text.length, bytes: buf.length, texto: text.slice(0, 40000) })
  } catch (e) {
    return Response.json({ error: `pdf: ${e instanceof Error ? e.message : String(e)}`, bytes: buf.length, tipo }, { status: 422 })
  }
})
