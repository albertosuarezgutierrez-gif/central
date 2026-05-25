const IG_TOKEN   = process.env.INSTAGRAM_ACCESS_TOKEN || ''
const IG_USER_ID = process.env.INSTAGRAM_USER_ID || ''

export async function publicarEnInstagram(imageUrl: string, caption: string): Promise<string> {
  if (!IG_TOKEN || !IG_USER_ID) throw new Error('INSTAGRAM vars no configuradas')
  const res = await fetch(`https://graph.instagram.com/v21.0/${IG_USER_ID}/media`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: IG_TOKEN }),
  })
  const d = await res.json() as { id?: string }
  if (!d.id) throw new Error(`Error container: ${JSON.stringify(d)}`)
  let intentos = 0, status = 'IN_PROGRESS'
  while (status === 'IN_PROGRESS' && intentos < 10) {
    await new Promise(r => setTimeout(r, 3000))
    const s = await (await fetch(`https://graph.instagram.com/v21.0/${d.id}?fields=status_code&access_token=${IG_TOKEN}`)).json() as { status_code?: string }
    status = s.status_code || 'ERROR'
    intentos++
  }
  if (status !== 'FINISHED') throw new Error(`Container no listo: ${status}`)
  const pub = await (await fetch(`https://graph.instagram.com/v21.0/${IG_USER_ID}/media_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: d.id, access_token: IG_TOKEN }),
  })).json() as { id?: string }
  if (!pub.id) throw new Error(`Error publicando: ${JSON.stringify(pub)}`)
  return pub.id
}

export async function publicarCarrusel(imageUrls: string[], caption: string): Promise<string> {
  if (!IG_TOKEN || !IG_USER_ID) throw new Error('INSTAGRAM vars no configuradas')
  const childIds: string[] = []
  for (const url of imageUrls) {
    const res = await (await fetch(`https://graph.instagram.com/v21.0/${IG_USER_ID}/media`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: url, is_carousel_item: true, access_token: IG_TOKEN }),
    })).json() as { id?: string }
    if (!res.id) throw new Error(`Error item carrusel`)
    childIds.push(res.id)
    await new Promise(r => setTimeout(r, 1000))
  }
  const carousel = await (await fetch(`https://graph.instagram.com/v21.0/${IG_USER_ID}/media`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_type: 'CAROUSEL', children: childIds.join(','), caption, access_token: IG_TOKEN }),
  })).json() as { id?: string }
  if (!carousel.id) throw new Error('Error creando carrusel')
  await new Promise(r => setTimeout(r, 5000))
  const pub = await (await fetch(`https://graph.instagram.com/v21.0/${IG_USER_ID}/media_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: carousel.id, access_token: IG_TOKEN }),
  })).json() as { id?: string }
  if (!pub.id) throw new Error('Error publicando carrusel')
  return pub.id
}

export async function obtenerMetricas(postId: string): Promise<{ likes: number; comentarios: number; alcance: number; impresiones: number }> {
  const res = await (await fetch(`https://graph.instagram.com/v21.0/${postId}/insights?metric=like_count,comments_count,reach,impressions&access_token=${IG_TOKEN}`)).json() as { data?: Array<{ name: string; values: Array<{ value: number }> }> }
  const get = (n: string) => res.data?.find(d => d.name === n)?.values?.[0]?.value ?? 0
  return { likes: get('like_count'), comentarios: get('comments_count'), alcance: get('reach'), impresiones: get('impressions') }
}

export async function renovarToken(): Promise<string> {
  const res = await (await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${IG_TOKEN}`)).json() as { access_token?: string }
  if (!res.access_token) throw new Error('Error renovando token')
  return res.access_token
}

export async function publicarPostBlog(post: { titulo: string; slug: string; keyword: string; caption?: string }): Promise<string> {
  const { callAI } = await import('@/lib/ai-client')
  const caption = post.caption || await callAI('Genera caption Instagram. SOLO el texto.',
    `Caption Instagram para artículo hostelería. Título: "${post.titulo}". URL: https://www.iarest.es/blog/${post.slug}. 160-200 palabras. Sin emoji inicio. URL al final. 6 hashtags: #hosteleria #restaurante #bar #gestion #hosteleros + 1 específico.`, 300)
  const imageUrl = `https://www.iarest.es/api/ig-img?tipo=pregunta&titulo=${encodeURIComponent(post.titulo)}&sub=${encodeURIComponent(post.keyword)}`
  return await publicarEnInstagram(imageUrl, caption.trim())
}
