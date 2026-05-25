export const dynamic = 'force-dynamic'
export const maxDuration = 60
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callAI, cleanJSON } from '@/lib/ai-client'
import { tgAlertButtons } from '@/lib/telegram'
import { obtenerNoticias, elegirTemaConContexto, leerContextoDrive } from '@/lib/instagram-context'

type Plantilla = 'stat'|'pregunta'|'comparativa'|'tip'|'cita'|'producto'
type Tono = 'claro'|'rojo'|'oscuro'
const TONO: Record<Plantilla,Tono> = { pregunta:'claro',cita:'claro',tip:'rojo',stat:'oscuro',comparativa:'oscuro',producto:'oscuro' }
const CICLO: Tono[] = ['oscuro','claro','rojo']
const POR_TONO: Record<Tono,Plantilla[]> = { claro:['pregunta','cita'],rojo:['tip'],oscuro:['stat','comparativa','producto'] }

async function generarPost(plantilla: Plantilla, tema: string, hashtags: string[]) {
  const hashBase = '#hosteleria #restaurante #bar #gestion #hosteleros'
  const prompt = `Agente Instagram ia.rest. Plantilla "${plantilla}" sobre: "${tema}"
PROHIBIDO: competidores por nombre. Usar "sistemas tradicionales".
${plantilla==='stat'?'dato:número. unidad:qué. ctx:contexto. sub:"Dato del sector"':''}
${plantilla==='pregunta'?'titulo:pregunta hostelero(50-70 chars). sub:"Hostelería · 2026"':''}
${plantilla==='comparativa'?'titulo:"Antes vs ia.rest". items:8 por|(4 antes+4 ia.rest, máx 4 palabras c/u)':''}
${plantilla==='tip'?'titulo:"Cómo..."(60-80). sub:"3 claves · Hostelería". items:3 por|':''}
${plantilla==='cita'?'titulo:cita(máx 100 chars). sub:"Nombre · Local · Ciudad"':''}
${plantilla==='producto'?'titulo:frase acción pantalla. sub:vacío':''}
CAPTION 150-200 palabras. Sin emoji inicio. URL: www.iarest.es. Tags: ${hashBase} ${hashtags.join(' ')}
SOLO JSON: {"titulo":"","sub":"","dato":"","unidad":"","ctx":"","items":"","caption":""}`
  const raw = await callAI('Post Instagram. SOLO JSON.', prompt, 600)
  return JSON.parse(cleanJSON(raw))
}

function buildUrl(p: Record<string,string>): string {
  const params = new URLSearchParams()
  Object.entries(p).forEach(([k,v]) => { if (v) params.set(k, v) })
  return `https://www.iarest.es/api/ig-img?${params}`
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const isCron = auth === `Bearer ${process.env.CRON_SECRET}`
  const isManual = req.nextUrl.searchParams.get('manual') === '1'
  const tipoForzado = req.nextUrl.searchParams.get('tipo') as Plantilla|null
  if (!isCron && !isManual) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const hoy = new Date()
  const { data: ultimo } = await supabase.from('instagram_posts').select('plantilla,titulo').order('created_at',{ascending:false}).limit(1).maybeSingle()
  const ultimaPlantilla = ultimo?.plantilla as Plantilla|null
  const ultimoTono = ultimaPlantilla ? TONO[ultimaPlantilla] : 'oscuro'

  let plantilla: Plantilla
  if (tipoForzado) { plantilla = tipoForzado }
  else {
    const siguienteTono = CICLO[(CICLO.indexOf(ultimoTono)+1)%CICLO.length]
    const pool = POR_TONO[siguienteTono].filter(p => p !== ultimaPlantilla)
    plantilla = pool[Math.floor(Math.random()*pool.length)] || POR_TONO[siguienteTono][0]
  }

  try {
    const [noticiasRes, driveRes] = await Promise.allSettled([obtenerNoticias(), leerContextoDrive()])
    const noticias = noticiasRes.status==='fulfilled' ? noticiasRes.value : []
    const driveCtx = driveRes.status==='fulfilled' ? driveRes.value : ''
    const { tema, modulo, hashtags } = await elegirTemaConContexto(plantilla, ultimo?.titulo||'', noticias, driveCtx)
    const post = await generarPost(plantilla, tema, hashtags)
    const imageUrl = buildUrl({ tipo: plantilla, titulo: post.titulo, sub: post.sub, dato: post.dato, unidad: post.unidad, ctx: post.ctx, items: post.items })

    const { data: borrador } = await supabase.from('instagram_borradores').insert({
      plantilla, titulo: post.titulo, sub: post.sub, dato: post.dato, unidad: post.unidad,
      ctx: post.ctx, items: post.items, caption: post.caption, image_url: imageUrl,
      tema_elegido: tema, modulo_relacionado: modulo,
    }).select('id').single()

    if (borrador?.id) {
      const tonoEmoji = TONO[plantilla]==='claro'?'⬜':TONO[plantilla]==='rojo'?'🟥':'⬛'
      await tgAlertButtons(
        `📸 <b>Nuevo post Instagram listo</b>\n\n${tonoEmoji} <code>${plantilla}</code> · ${modulo||'—'}\n\n<b>${post.titulo?.slice(0,70)}</b>\n\n<i>${post.caption?.slice(0,150)}...</i>`,
        'info',
        [[{ texto:'✅ Publicar', callback:`ig_aprobar:${borrador.id}` },{ texto:'🗑️ Descartar', callback:`ig_descartar:${borrador.id}` }],[{ texto:'✏️ Editar en /super', callback:`ig_editar:${borrador.id}` }]]
      )
    }
    return NextResponse.json({ ok: true, plantilla, borradorId: borrador?.id, tema })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
