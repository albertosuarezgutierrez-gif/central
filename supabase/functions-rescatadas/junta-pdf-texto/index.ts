// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// ✅ Sin secretos. Copia FIEL del original, sin tocar una línea.
// 📌 Familia «subastas Fase 3»: el equivalente de `boe-doc` para las fichas PDF de la
//    D.G. de Patrimonio de la Junta de Andalucía. Pertenece a algo VIVO de `apps/plataforma`.
// ✅ Es la ÚNICA del rescate con `verify_jwt = TRUE`, es decir, la única que exige una
//    clave para llamarla. Ese es el ajuste que le falta al resto del lote.
//    Eliminar igualmente al cerrar la fase.
//
// TEMPORAL (Fase 3 subastas): extrae el texto de las fichas PDF de la D.G.
// Patrimonio de la Junta — la sesión de Claude no puede salir a ese host y las
// fichas son binarias (pg_net solo trae texto). Lista cerrada de hosts.
// Eliminar al cerrar la fase.
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1'

Deno.serve(async (req: Request) => {
  const u = new URL(req.url).searchParams.get('url') ?? ''
  let destino: URL
  try {
    destino = new URL(u)
  } catch {
    return Response.json({ error: 'url inválida' }, { status: 400 })
  }
  if (destino.protocol !== 'https:' || destino.hostname !== 'www.juntadeandalucia.es') {
    return Response.json({ error: `host fuera de la lista: ${destino.hostname}` }, { status: 400 })
  }
  const r = await fetch(destino, { signal: AbortSignal.timeout(25000) })
  if (!r.ok) return Response.json({ error: `fetch ${r.status}` }, { status: 502 })
  const buf = new Uint8Array(await r.arrayBuffer())
  try {
    const pdf = await getDocumentProxy(buf)
    const { text, totalPages } = await extractText(pdf, { mergePages: true })
    return Response.json({ paginas: totalPages, chars: text.length, texto: text.slice(0, 30000) })
  } catch (e) {
    return Response.json({ error: `pdf: ${e instanceof Error ? e.message : String(e)}`, bytes: buf.length }, { status: 422 })
  }
})
