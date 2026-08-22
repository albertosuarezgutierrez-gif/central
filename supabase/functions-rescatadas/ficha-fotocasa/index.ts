// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// ✅ Sin secretos. Copia FIEL del original, sin tocar una línea.
// 📌 Familia «subastas Fase 3», como `boe-doc` y `zona-fotocasa`: pertenece a algo VIVO
//    de `apps/plataforma`. Existe porque Fotocasa bloquea el egress de Vercel pero no el
//    de Supabase, así que la Edge Function hace de puente de salida.
// ⚠️ `verify_jwt=false`. Solo lee, no lleva credencial y el host está en lista blanca
//    (`www.fotocasa.es`, solo https), así que no sirve de proxy abierto — pero sí gasta
//    cuota de invocaciones de quien la llame. Cerrarla al terminar la fase.
//
// Proxy de FICHAS de Fotocasa para el enriquecedor de anunciantes (👤 particular).
// Fotocasa bloquea las IPs de datacenter de Vercel pero responde al egress de
// Supabase (verificado 29/07/2026 vía pg_net). Lista CERRADA de hosts; devuelve
// solo la VENTANA del JSON embebido con el anunciante (clientAlias/clientName/
// clientTypeId/coordinates), no la página entera. Sin secretos: solo proxya
// páginas públicas de un único host.

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

Deno.serve(async (req: Request) => {
  const u = new URL(req.url).searchParams.get('url') ?? ''
  let destino: URL
  try {
    destino = new URL(u)
  } catch {
    return Response.json({ error: 'url inválida' }, { status: 400 })
  }
  if (destino.protocol !== 'https:' || destino.hostname !== 'www.fotocasa.es') {
    return Response.json({ error: `host fuera de la lista: ${destino.hostname}` }, { status: 400 })
  }

  try {
    const r = await fetch(destino, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(20000),
    })
    const html = await r.text()
    const idx = html.indexOf('"clientAlias"')
    const ventana = idx >= 0
      ? html.slice(Math.max(0, idx - 500), idx + 3500)
      : html.slice(0, 2000) // sin bloque = anuncio retirado o challenge; el caller decide
    return Response.json({ status: r.status, encontrado: idx >= 0, html: ventana })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 })
  }
})
