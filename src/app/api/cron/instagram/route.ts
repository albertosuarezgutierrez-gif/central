export const dynamic = 'force-dynamic'
export const maxDuration = 60
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callAI, cleanJSON } from '@/lib/ai-client'
import { tgAlertButtons } from '@/lib/telegram'
import { obtenerNoticias, elegirTemaConContexto, leerContextoDrive } from '@/lib/instagram-context'

type Plantilla = 'stat'|'pregunta'|'comparativa'|'tip'|'cita'|'producto'
type Estilo = 'editorial'|'brutalist'|'humano'
const ESTILOS: Estilo[] = ['editorial','brutalist','humano']
type Tono = 'claro'|'rojo'|'oscuro'

// Director de arte: elige el estilo de la semana, rotando sin repetir el último usado.
async function estiloDeLaSemana(supabase: ReturnType<typeof createServerClient>): Promise<Estilo> {
  const now = new Date()
  const year = now.getUTCFullYear()
  const oneJan = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil((((now.getTime() - oneJan.getTime()) / 86400000) + oneJan.getUTCDay() + 1) / 7)
  const semanaIso = `${year}-W${week}`

  const { data: yaSemana } = await supabase.from('instagram_estilos_usados')
    .select('estilo').eq('semana_iso', semanaIso).limit(1).maybeSingle()
  if (yaSemana?.estilo && ESTILOS.includes(yaSemana.estilo as Estilo)) return yaSemana.estilo as Estilo

  const { data: ultimo } = await supabase.from('instagram_estilos_usados')
    .select('estilo').order('created_at', { ascending: false }).limit(1).maybeSingle()
  const pool = ESTILOS.filter(e => e !== ultimo?.estilo)
  const elegido = pool[Math.floor(Math.random() * pool.length)] || ESTILOS[0]
  await supabase.from('instagram_estilos_usados').insert({ estilo: elegido, semana_iso: semanaIso })
  return elegido
}
const TONO: Record<Plantilla,Tono> = { pregunta:'claro',cita:'claro',tip:'rojo',stat:'oscuro',comparativa:'oscuro',producto:'oscuro' }
const CICLO: Tono[] = ['oscuro','claro','rojo']
const POR_TONO: Record<Tono,Plantilla[]> = { claro:['pregunta','cita'],rojo:['tip'],oscuro:['stat','comparativa','producto'] }

async function buscarBorradorProgramado(supabase: ReturnType<typeof createServerClient>) {
  // Buscar borrador de la semana con scheduled_for próximo (±12h)
  const ahora = new Date()
  const desde = new Date(ahora.getTime() - 12 * 3600000).toISOString()
  const hasta = new Date(ahora.getTime() + 12 * 3600000).toISOString()

  const { data } = await supabase
    .from('instagram_borradores')
    .select('*')
    .eq('estado', 'pendiente')
    .not('scheduled_for', 'is', null)
    .gte('scheduled_for', desde)
    .lte('scheduled_for', hasta)
    .order('scheduled_for', { ascending: true })
    .limit(1)
    .maybeSingle()

  return data
}

async function generarPost(plantilla: Plantilla, tema: string, hashtags: string[]) {
  const hashBase = '#hosteleria #restaurante #bar #gestion #hosteleros'
  const prompt = `Eres el agente de Instagram de ia.rest (siempre escrito así: "ia.rest", nunca "IA Rest" ni "iarest").
PRODUCTO: ia.rest es un TPV por voz para hostelería española. El camarero habla → la cocina recibe en <0,5s.
TONO: directo, sin palabrería, habla como un hostelero experimentado. Frases cortas. Nada genérico.
SLOGAN: "Facturar más ahora sí es ganar más."
PROHIBIDO: nombrar competidores. Usar "sistemas tradicionales" o "TPV convencional". NUNCA mencionar ciudades ni ubicaciones. NUNCA escribir "IA Rest" — siempre "ia.rest".
PLANTILLA "${plantilla}" sobre: "${tema}"
${plantilla==='stat'?'dato:número impactante del sector hostelero. unidad:qué mide. ctx:por qué importa para un dueño. sub:"Dato del sector"':''}
${plantilla==='pregunta'?'titulo:pregunta que incomoda al hostelero(50-70 chars). sub:"Hostelería · 2026"':''}
${plantilla==='comparativa'?'titulo:"Antes vs ia.rest". items:8 por|(4 antes+4 ia.rest, máx 4 palabras c/u, concreto y visual)':''}
${plantilla==='tip'?'titulo:"Cómo..."(60-80). sub:"3 claves · Hostelería". items:3 consejos accionables por|':''}
${plantilla==='cita'?'titulo:frase que diría un dueño de restaurante real(máx 100 chars). sub:"Dueño · Restaurante"':''}
${plantilla==='producto'?'titulo:frase corta que describe la pantalla en acción. sub:vacío':''}
CAPTION: 150-200 palabras. Tono conversacional, directo. Sin emoji al inicio. Terminar con URL: www.iarest.es. Tags: ${hashBase} ${hashtags.join(' ')}
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

  // ── Primero: buscar borrador programado de la semana ─────────────────
  if (!tipoForzado) {
    const programado = await buscarBorradorProgramado(supabase)
    if (programado) {
      const msgId = await tgAlertButtons(
        `📸 <b>Post programado listo</b>\n\n` +
        `📅 <i>${programado.tema_elegido}</i>\n` +
        `<b>${programado.titulo?.slice(0,60)}</b>\n\n` +
        `<i>${programado.caption?.slice(0,150)}...</i>`,
        'info',
        [[
          { texto: '✅ Publicar', callback: `ig_aprobar:${programado.id}` },
          { texto: '🗑️ Descartar', callback: `ig_descartar:${programado.id}` },
        ]]
      )
      if (msgId) await supabase.from('instagram_borradores').update({ telegram_msg_id: msgId }).eq('id', programado.id)
      return NextResponse.json({ ok: true, modo: 'programado', borrador: programado.id })
    }
  }

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
    const estilo = await estiloDeLaSemana(supabase)
    const imageUrl = buildUrl({ tipo: plantilla, estilo, titulo: post.titulo, sub: post.sub, dato: post.dato, unidad: post.unidad, ctx: post.ctx, items: post.items })

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
