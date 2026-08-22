// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// ✅ Sin secretos. Copia FIEL del original, sin tocar una línea.
// 📌 Familia «subastas Fase 3», como `boe-doc` y `ficha-fotocasa`: pertenece a algo VIVO
//    de `apps/plataforma` (referencia €/m² por zona para valorar los lotes).
// ⚠️ `verify_jwt=false`. Solo lee, sin credencial, y la `ruta` está validada contra un
//    patrón cerrado además del host fijo. Cerrarla al terminar la fase.
//
// Puente de referencia €/m² por zona (Fase 3 subastas): baja la página de
// búsqueda de venta de Fotocasa para una zona (municipio, municipio/distrito o
// página N del listado), separa los bloques de anuncio del JSON embebido y
// devuelve la mediana €/m² + CP y distrito por anuncio (para aprender el mapeo
// CP→distrito de las capitales con los datos del propio portal).
// Se llama vía pg_net o con cabecera x-region eu-west-1 (Fotocasa geobloquea
// IPs no-UE y datacenters). Host cerrado www.fotocasa.es.
Deno.serve(async (req: Request) => {
  const sp = new URL(req.url).searchParams
  const ruta = sp.get('ruta') ?? ''
  if (!/^\/es\/comprar\/[a-z0-9\/\-]+\/l(\/[0-9]{1,3})?(\?.*)?$/.test(ruta)) {
    return Response.json({ error: 'ruta fuera de patrón' }, { status: 400 })
  }
  const r = await fetch(`https://www.fotocasa.es${ruta}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9',
    },
    signal: AbortSignal.timeout(25000),
    redirect: 'follow',
  })
  const html = await r.text()

  const patron = sp.get('patron')
  if (patron) {
    const idx = html.indexOf(patron)
    if (idx < 0) return Response.json({ status: r.status, len: html.length, encontrado: false })
    const antes = Math.max(0, parseInt(sp.get('antes') ?? '200', 10) || 200)
    const despues = Math.max(0, parseInt(sp.get('despues') ?? '3000', 10) || 3000)
    return Response.json({ status: r.status, len: html.length, encontrado: true, idx, html: html.slice(idx - antes, idx + despues) })
  }

  // Cada anuncio del listado es un objeto que empieza por {"accuracy": — dentro
  // vienen rawPrice, features[{key:'surface',value}], dirección y tipo de cliente.
  const bloques = html.split('{"accuracy"').slice(1)
  const anuncios: Array<{ precio: number; superficie: number; eurM2: number; barrio: string | null; distrito: string | null; cp: string | null; particular: boolean }> = []
  for (const b of bloques) {
    const trozo = b.slice(0, 12000)
    const precio = parseInt(/"rawPrice":(\d+)/.exec(trozo)?.[1] ?? '', 10)
    const superficie = parseInt(/"key":"surface","value":(\d+)/.exec(trozo)?.[1] ?? '', 10)
    if (!Number.isFinite(precio) || !Number.isFinite(superficie) || superficie < 15 || precio < 5000) continue
    const barrio = /"neighborhood":"([^"]*)"/.exec(trozo)?.[1] || null
    const distrito = /"district":"([^"]*)"/.exec(trozo)?.[1] || null
    const cp = /"zipCode":"(\d{5})"/.exec(trozo)?.[1] || null
    const clientTypeId = parseInt(/"clientTypeId":(\d+)/.exec(trozo)?.[1] ?? '', 10)
    anuncios.push({ precio, superficie, eurM2: Math.round(precio / superficie), barrio, distrito, cp, particular: clientTypeId === 4 })
  }
  const m2 = anuncios.map((a) => a.eurM2).sort((x, y) => x - y)
  const pct = (p: number) => (m2.length ? m2[Math.min(m2.length - 1, Math.floor((p / 100) * m2.length))] : null)
  const total = parseInt(/"counters":\{"realEstates":(\d+)/.exec(html)?.[1] ?? '', 10)
  return Response.json({
    status: r.status,
    urlFinal: r.url,
    totalZona: Number.isFinite(total) ? total : null,
    muestra: anuncios.length,
    p25m2: pct(25), p50m2: pct(50), p75m2: pct(75),
    anuncios: anuncios.slice(0, 40),
  })
})
