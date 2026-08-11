export const dynamic = 'force-dynamic'
export const maxDuration = 120
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callAI, cleanJSON } from '@/lib/ai-client'
import { tgAlertButtons } from '@/lib/telegram'
import { notifyError } from '@/lib/notify'
import { obtenerNoticias, elegirTemaConContexto, leerContextoDrive } from '@/lib/instagram-context'
import { startVideoIA, type VideoEngine } from '@/lib/ai-video'

// Motor de vídeo IA del Reel: Veo 3 Fast (audio nativo) por defecto; IG_VIDEO_ENGINE=kling
// revierte al motor anterior sin tocar código. Un solo mando en Vercel.
function motorVideo(): VideoEngine {
  return process.env.IG_VIDEO_ENGINE === 'kling' ? 'kling' : 'veo3-fast'
}

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

// Formato del día (semana temática): lunes y viernes → carrusel (guardados y
// compartidos), miércoles → Reel IA (alcance/descubrimiento). Resto → imagen.
function formatoDelDia(d: Date = new Date()): 'reel' | 'imagen' | 'carrusel' {
  const dia = d.getUTCDay()
  if (dia === 1 || dia === 5) return 'carrusel'
  if (dia === 3) return 'reel'
  return 'imagen'
}

// Tema de la SEMANA: el briefing del domingo propone 3 ideas de blog, Alberto
// elige una y toda la semana (carrusel lunes, Reel miércoles, carrusel viernes)
// desarrolla ESE tema. Si no hay semana en curso, cada pieza elige tema libre.
async function temaSemanal(supabase: ReturnType<typeof createServerClient>): Promise<{ tema: string; modulo: string; keyword?: string } | null> {
  const hace8d = new Date(Date.now() - 8 * 86400000).toISOString()
  const { data } = await supabase.from('instagram_semana')
    .select('tema_elegido, created_at')
    .eq('estado', 'en_curso')
    .gte('created_at', hace8d)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const t = data?.tema_elegido as { tema?: string; fuente?: string; keyword_blog?: string } | null
  if (!t?.tema) return null
  return { tema: t.tema, modulo: t.fuente || 'Semana temática', keyword: t.keyword_blog }
}

// Si el blog de la semana ya está publicado, el caption remata enviando tráfico.
async function coletillaBlog(supabase: ReturnType<typeof createServerClient>, keyword?: string): Promise<string> {
  if (!keyword) return ''
  const { data } = await supabase.from('blog_borradores')
    .select('slug').eq('keyword', keyword).eq('estado', 'publicado').limit(1).maybeSingle()
  return data?.slug ? `\n\nLo cuento a fondo en el blog → www.iarest.es/blog/${data.slug}` : ''
}

// NIM (NVIDIA) va lento a veces: reintenta la generación con IA antes de rendirse.
// Sin prisa — hay margen de sobra en maxDuration (120s). Backoff 3s, 6s.
async function conReintentos<T>(fn: () => Promise<T>, intentos = 3): Promise<T> {
  let ultimoError: unknown
  for (let i = 1; i <= intentos; i++) {
    try { return await fn() }
    catch (e) { ultimoError = e; if (i < intentos) await new Promise(r => setTimeout(r, i * 3000)) }
  }
  throw ultimoError
}

// Contenido del reel: gancho + 3 puntos + caption (lo monta generarReel sobre slides+ambiente).
async function generarReelContenido(tema: string, hashtags: string[], modulo: string) {
  const foco = modulo ? `Este reel va de la funcionalidad "${modulo}" (NO siempre las comandas por voz — varía el ángulo respecto a otros reels).` : ''
  const prompt = `Eres el agente de Instagram de ia.rest (siempre "ia.rest", nunca "IA Rest").
PRODUCTO: suite de software para hostelería española (comandas por voz, QR en mesa, KDS de cocina, analítica, VeriFactu, almacén, fichajes, delivery propio…). El camarero habla → la cocina recibe en <0,5s es SOLO una de sus piezas.
${foco}
TONO: directo, sin palabrería, como un hostelero experimentado. PROHIBIDO nombrar competidores ni ciudades EN EL ARTE.
Crea un REEL sobre: "${tema}".
- titulo: portada, gancho corto que pare el scroll (máx 55 chars).
- p1, p2, p3: tres ideas concretas que avanzan el argumento (máx 70 chars cada una).
- caption: 120-160 palabras. Primera línea = gancho sin emoji. Lenguaje natural de búsqueda (ej "TPV por voz", "reducir errores de comanda", "digitalizar mi restaurante"). Invita a compartir/guardar y a SEGUIR la cuenta para más (CTA natural, sin forzar). Cierra con www.iarest.es y EXACTAMENTE 4-5 hashtags (base #hosteleria #restaurante + ${hashtags.slice(0,3).join(' ')}).
SOLO JSON: {"titulo":"","p1":"","p2":"","p3":"","caption":""}`
  // noFallback=true → NIM puro, NUNCA Anthropic (regla de crons/agentes; evita gasto de créditos externos)
  const raw = await callAI('Reel Instagram. SOLO JSON.', prompt, 600, 30_000, true)
  return JSON.parse(cleanJSON(raw)) as { titulo: string; p1: string; p2: string; p3: string; caption: string }
}

// Prompt cinematográfico (inglés) para el vídeo IA del Reel. Regla de oro:
// describir MOVIMIENTO explícito (cámara, gente, pantallas) o el modelo genera una foto.
// Veo 3 genera AUDIO nativo → se le dirige el sonido ambiente y se le PROHÍBE con
// fuerza el texto en pantalla (Veo tiende a quemar subtítulos si detecta palabras).
async function generarPromptVideo(tema: string, engine: VideoEngine, modulo: string): Promise<string> {
  const esVeo = engine === 'veo3-fast'
  const modelName = esVeo ? 'Veo 3 (generates its own synced audio)' : 'Kling'
  const audioLine = esVeo
    ? 'AUDIO: natural ambient sound of a lively Spanish bar/restaurant that fits the scene (chatter, clinking glasses, kitchen sizzle) — NO spoken dialogue, NO voice-over, NO music lyrics. '
    : ''
  const foco = modulo ? `the feature/module "${modulo}"` : 'this topic'
  const prompt = `You write prompts for an AI video model (${modelName}). Product: ia.rest, a hospitality software suite for Spanish bars/restaurants.
This Reel is about ${foco} — topic: "${tema}".
Write ONE cinematic video prompt in English (max 90 words) that VISUALLY DEPICTS THAT SPECIFIC FEATURE in action in a real Spanish bar/restaurant, so the reel looks DIFFERENT from other reels. Make the scene UNMISTAKABLY about ${foco} — pick the matching visual: a phone SCANNING a QR at the table, a glowing ANALYTICS dashboard on a tablet, a KITCHEN DISPLAY screen updating with tickets, a STOCK/inventory alert popping, an e-INVOICE printing, staff CLOCKING IN, a delivery bag handoff, etc. Do NOT default to the generic "waiter speaking an order into a phone" shot UNLESS the topic is literally voice ordering.
REQUIREMENTS: explicit camera movement (dolly/orbit/whip-pan/push-in), people in motion, screens/devices clearly visible and updating, energetic modern commercial style, vertical 9:16. ${audioLine}CRITICAL: absolutely NO on-screen text, NO subtitles, NO captions, NO brand names or logos on screen, NO watermark.
Answer with the prompt only, no quotes.`
  // noFallback=true → NIM puro (regla de crons/agentes)
  const raw = await callAI('Video prompt writer. Answer with the prompt only.', prompt, 260, 20_000, true)
  return raw.trim().replace(/^"|"$/g, '')
}

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
  const hashBase = '#hosteleria #restaurante'
  const prompt = `Eres el agente de Instagram de ia.rest (siempre escrito así: "ia.rest", nunca "IA Rest" ni "iarest").
PRODUCTO: ia.rest es un TPV por voz para hostelería española. El camarero habla → la cocina recibe en <0,5s.
TONO: directo, sin palabrería, habla como un hostelero experimentado. Frases cortas. Nada genérico.
SLOGAN: "Facturar más ahora sí es ganar más."
PROHIBIDO: nombrar competidores. Usar "sistemas tradicionales" o "TPV convencional". NUNCA mencionar ciudades ni ubicaciones EN EL ARTE. NUNCA escribir "IA Rest" — siempre "ia.rest".
PLANTILLA "${plantilla}" sobre: "${tema}"
${plantilla==='stat'?'dato:número impactante del sector hostelero. unidad:qué mide. ctx:por qué importa para un dueño. sub:"Dato del sector"':''}
${plantilla==='pregunta'?'titulo:pregunta que incomoda al hostelero(50-70 chars). sub:"Hostelería · 2026"':''}
${plantilla==='comparativa'?'titulo:"Antes vs ia.rest". items:8 por|(4 antes+4 ia.rest, máx 4 palabras c/u, concreto y visual)':''}
${plantilla==='tip'?'titulo:"Cómo..."(60-80). sub:"3 claves · Hostelería". items:3 consejos accionables por|':''}
${plantilla==='cita'?'titulo:frase que diría un dueño de restaurante real(máx 100 chars). sub:"Dueño · Restaurante"':''}
${plantilla==='producto'?'titulo:frase corta que describe la pantalla en acción. sub:vacío':''}

CAPTION — REGLAS CRÍTICAS DE ALCANCE 2026 (Instagram funciona como buscador, prioriza keywords sobre hashtags):
1. PRIMERA LÍNEA = GANCHO. Una frase corta que pare el scroll de un hostelero (dolor real o promesa concreta). Sin emoji al inicio. Es lo único que se ve antes del "...más".
2. Escribe con LENGUAJE NATURAL DE BÚSQUEDA: incluye frases que un dueño de bar/restaurante teclearía en el buscador (ej: "reducir errores de comanda", "TPV por voz para hostelería", "digitalizar mi restaurante", "comandas sin papel", "software para bares"). Tejidas en la prosa, no forzadas.
3. Aporta 1 idea de valor concreta. Termina invitando a compartir o guardar si le sirve (los compartidos son la señal #1 de alcance), y añade un CTA natural de SEGUIR (ej: "Sígueme para más trucos de gestión de tu restaurante") — sin sonar forzado.
4. Cierra con: www.iarest.es
5. EXACTAMENTE 4-5 hashtags al final (Instagram corta a 5). Mezcla: 2 de nicho hostelero + 1-2 locales/sector + el de marca. Precisos, no genéricos. Base obligatoria: ${hashBase}. Añade de: ${hashtags.slice(0,3).join(' ')}
6. Largo total: 120-160 palabras.
SOLO JSON: {"titulo":"","sub":"","dato":"","unidad":"","ctx":"","items":"","caption":""}`
  // noFallback=true → NIM puro, NUNCA Anthropic (regla de crons/agentes; evita gasto de créditos externos)
  const raw = await callAI('Post Instagram. SOLO JSON.', prompt, 600, 20_000, true)
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
  // Últimos 5 posts: para no repetir tema/módulo (diversidad) y para la rotación de plantilla/tono.
  const { data: recientes } = await supabase.from('instagram_posts')
    .select('plantilla,titulo,tema_elegido,modulo_relacionado').order('created_at',{ascending:false}).limit(5)
  const ultimo = recientes?.[0] ?? null
  const temasRecientes = (recientes ?? []).map(r => r.tema_elegido).filter(Boolean) as string[]
  const modulosRecientes = (recientes ?? []).map(r => r.modulo_relacionado).filter(Boolean) as string[]
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
    // Auto-caducidad: borradores sin decidir en 48h se descartan solos para
    // que no se acumulen (las URLs de fal.ai además caducan en días).
    const hace48h = new Date(Date.now() - 48 * 3600000).toISOString()
    await supabase.from('instagram_borradores')
      .update({ estado: 'descartado' })
      .in('estado', ['generando', 'pendiente'])
      .is('scheduled_for', null) // los programados esperan a su fecha
      .lt('created_at', hace48h)

    // Tema: si hay semana temática en curso (briefing del domingo), TODAS las
    // piezas de la semana la desarrollan; si no, selector libre de siempre.
    const semana = await temaSemanal(supabase)
    let tema: string, modulo: string, hashtags: string[]
    if (semana) {
      tema = semana.tema; modulo = semana.modulo
      hashtags = ['#tpv', '#gestionhosteleria', '#restaurantes']
    } else {
      const [noticiasRes, driveRes] = await Promise.allSettled([obtenerNoticias(), leerContextoDrive()])
      const noticias = noticiasRes.status==='fulfilled' ? noticiasRes.value : []
      const driveCtx = driveRes.status==='fulfilled' ? driveRes.value : ''
      ;({ tema, modulo, hashtags } = await conReintentos(() => elegirTemaConContexto(plantilla, ultimo?.titulo||'', noticias, driveCtx, temasRecientes, modulosRecientes)))
    }
    const coletilla = await coletillaBlog(supabase, semana?.keyword)
    const estilo = await estiloDeLaSemana(supabase)
    const formato = tipoForzado ? 'imagen' : ((req.nextUrl.searchParams.get('formato') as 'reel'|'imagen'|'carrusel'|null) || formatoDelDia())

    // ── Rama CARRUSEL (?formato=carrusel) ──
    // Portada-gancho + 3 claves + cierre de marca, todo con el motor ig-img.
    // Los deslizamientos cuentan como interacción → formato de máximo alcance
    // para contenido educativo. Se aprueba desde Telegram como los demás.
    if (formato === 'carrusel') {
      // Mismo tema, ángulo distinto: lunes "las claves"; viernes alterna por
      // semana entre "los errores" y "frases de barra" (citas INVENTADAS pero
      // realistas con atribución GENÉRICA — nunca presentarlas como testimonios
      // de clientes reales; decisión Alberto 02/07/2026).
      const esViernes = new Date().getUTCDay() === 5
      const semanaPar = Math.floor(Date.now() / (7 * 86400000)) % 2 === 0
      const esTestimonios = esViernes && !semanaPar
      const angulo = !esViernes
        ? 'las 3 CLAVES para dominar este tema'
        : esTestimonios
          ? 'tres FRASES cortas en primera persona que diría un hostelero de barra sobre este problema (realistas, tono coloquial español; SIN nombres propios ni locales concretos — la etiqueta t de cada una debe ser genérica tipo "Dueño de bar" o "Jefa de sala")'
          : 'los 3 ERRORES típicos que cometen los hosteleros con este tema (y cómo evitarlos)'
      const prompt = `Eres el agente de Instagram de ia.rest (siempre "ia.rest", nunca "IA Rest").
PRODUCTO: TPV por voz para hostelería española. El camarero habla → la cocina recibe en <0,5s.
TONO: directo, como un hostelero experimentado. PROHIBIDO nombrar competidores ni ciudades EN EL ARTE.
Crea un CARRUSEL de Instagram (portada + 3 puntos) sobre: "${tema}".
ÁNGULO del carrusel: ${angulo}.
- ganchoA y ganchoB: DOS portadas alternativas que paren el scroll e inviten a deslizar (máx 55 chars cada una; enfoques distintos: una pregunta que incomode y una promesa/dato).
- claves: 3 objetos {t: etiqueta corta (máx 25 chars), frase: el punto en una frase potente (máx 90 chars)} que avanzan el argumento.
- caption: 120-160 palabras. Primera línea = gancho sin emoji. Lenguaje natural de búsqueda ("TPV por voz", "reducir errores de comanda"...). Pide GUARDAR el carrusel y seguir la cuenta. Cierra con www.iarest.es y 4-5 hashtags (base #hosteleria #restaurante + ${hashtags.slice(0,3).join(' ')}).
SOLO JSON: {"ganchoA":"","ganchoB":"","claves":[{"t":"","frase":""},{"t":"","frase":""},{"t":"","frase":""}],"caption":""}`
      const raw = await conReintentos(() => callAI('Carrusel Instagram. SOLO JSON.', prompt, 800, 30_000, true))
      const c = JSON.parse(cleanJSON(raw)) as { ganchoA: string; ganchoB: string; claves: Array<{ t: string; frase: string }>; caption: string }
      const claves = (c.claves || []).filter(k => k?.frase).slice(0, 3)
      if (!c.ganchoA || claves.length < 3) throw new Error('carrusel: contenido IA incompleto')
      const cuerpo = [
        ...claves.map((k, i) => buildUrl({ tipo: 'cita', estilo, titulo: k.frase, sub: `${i + 1}/3 · ${k.t || (esTestimonios ? 'Hostelero' : 'Clave')}`, modulo })),
        buildUrl({ tipo: 'cita', estilo, titulo: 'Facturar más ahora sí es ganar más.', sub: 'www.iarest.es', modulo }),
      ]
      const portadaA = buildUrl({ tipo: 'pregunta', estilo, titulo: c.ganchoA, sub: 'Desliza →', modulo })
      const portadaB = c.ganchoB ? buildUrl({ tipo: 'pregunta', estilo, titulo: c.ganchoB, sub: 'Desliza →', modulo }) : ''
      const slides = [portadaA, ...cuerpo]
      const { data: bCar, error: errCar } = await supabase.from('instagram_borradores').insert({
        plantilla: 'carrusel', titulo: c.ganchoA, caption: c.caption + coletilla, image_url: portadaA,
        tema_elegido: tema, modulo_relacionado: modulo, estado: 'pendiente',
        video_job: { slides, portadaB, ganchoA: c.ganchoA, ganchoB: c.ganchoB || '' },
      }).select('id').single()
      if (errCar) throw new Error(`No se pudo guardar borrador carrusel: ${errCar.message}`)
      const enlaces = cuerpo.map((s, i) => `<a href="${s}">${i + 2}</a>`).join(' · ')
      // A/B de portada: Alberto elige el gancho y esa elección queda registrada
      // (video_job.gancho_elegido) para aprender qué estilo funciona.
      const botones = portadaB
        ? [[{ texto:'✅ Publicar con portada A', callback:`ig_aprobar_carrusel:${bCar.id}:a` },{ texto:'✅ Con portada B', callback:`ig_aprobar_carrusel:${bCar.id}:b` }],
           [{ texto:'🗑️ Descartar', callback:`ig_descartar:${bCar.id}` }]]
        : [[{ texto:'✅ Publicar carrusel', callback:`ig_aprobar_carrusel:${bCar.id}:a` },{ texto:'🗑️ Descartar', callback:`ig_descartar:${bCar.id}` }]]
      await tgAlertButtons(
        `🗂️ <b>Carrusel listo</b> (${slides.length} diapositivas${esTestimonios ? ' · frases de barra' : ''})\n\n${modulo||'—'} · <i>${tema.slice(0,80)}</i>\n\n` +
        `<b>Portada A:</b> <a href="${portadaA}">${c.ganchoA}</a>\n` +
        (portadaB ? `<b>Portada B:</b> <a href="${portadaB}">${c.ganchoB}</a>\n` : '') +
        `\n<i>${c.caption?.slice(0,150)}...</i>\n\n👁️ Resto: ${enlaces}`,
        'info',
        botones
      )
      return NextResponse.json({ ok: true, formato: 'carrusel', borradorId: bCar.id, tema, slides: slides.length })
    }

    // ── Rama REEL (miércoles/viernes o ?formato=reel) ──
    // 1º intento: vídeo IA (Kling vía EF ig-video-gen, asíncrono — se aprueba
    // desde Telegram con 🔄 Comprobar cuando fal.ai termina, ~1 min).
    // 2º intento: reel de slides Cloudinary. 3º: imagen (nunca queda el día vacío).
    if (formato === 'reel' && req.nextUrl.searchParams.get('video') !== '0') {
      try {
        const reel = await conReintentos(() => generarReelContenido(tema, hashtags, modulo))
        // Motor por defecto Veo 3 Fast (audio nativo, 8s); si Veo falla al encolar,
        // se reintenta UNA vez con Kling (sin audio) antes de caer a imagen.
        const engine = motorVideo()
        const promptVideo = await conReintentos(() => generarPromptVideo(tema, engine, modulo))
        let job
        try {
          job = await startVideoIA(promptVideo, { duration: 8, engine, generateAudio: true })
        } catch (veoErr: any) {
          if (engine === 'veo3-fast') {
            notifyError({ tipo: 'instagram_reel_ia', modulo: 'cron', nivel: 'aviso', mensaje: `Veo 3 falló al encolar, pruebo Kling: ${veoErr?.message||'error'}`, detalle: { tema } })
            const promptKling = await conReintentos(() => generarPromptVideo(tema, 'kling', modulo))
            job = await startVideoIA(promptKling, { duration: 10, engine: 'kling' })
          } else {
            throw veoErr
          }
        }
        const motorEmoji = job.engine === 'veo3-fast' ? '🎬 Veo 3 (con sonido)' : '🎬 Kling'
        const { data: bIA, error: errIA } = await supabase.from('instagram_borradores').insert({
          plantilla: 'reel', titulo: reel.titulo, caption: reel.caption + coletilla, image_url: '',
          tema_elegido: tema, modulo_relacionado: modulo,
          estado: 'generando', video_job: { ...job, prompt: promptVideo },
        }).select('id').single()
        if (errIA) throw new Error(`No se pudo guardar borrador Reel IA: ${errIA.message}`)
        await tgAlertButtons(
          `${motorEmoji} <b>Reel IA generándose</b> (~1-2 min)\n\n${modulo||'—'} · <i>${tema.slice(0,80)}</i>\n\n<b>${reel.titulo?.slice(0,70)}</b>\n\nPulsa 🔄 en un minuto para ver el vídeo y publicarlo.`,
          'info',
          [[{ texto:'🔄 Comprobar vídeo', callback:`ig_reel_check:${bIA.id}` },{ texto:'🗑️ Descartar', callback:`ig_descartar:${bIA.id}` }]]
        )
        return NextResponse.json({ ok: true, formato: 'reel_ia', engine: job.engine, borradorId: bIA.id, tema })
      } catch (iaErr: any) {
        notifyError({ tipo: 'instagram_reel_ia', modulo: 'cron', nivel: 'aviso', mensaje: `Reel IA falló, pruebo Cloudinary: ${iaErr?.message||'error'}`, detalle: { tema } })
        // cae DIRECTO a imagen (decisión Alberto 02/07/2026: los reels de
        // slides Cloudinary son malos para el perfil — nunca publicarlos)
        await tgAlertButtons(`⚠️ <b>Reel IA falló, genero imagen</b>\n\n<code>${(iaErr?.message||'error').slice(0,150)}</code>`, 'aviso', [])
      }
    }

    // ── Flujo IMAGEN (lunes, fallback del vídeo IA, o ?formato=imagen) ──
    const post = await conReintentos(() => generarPost(plantilla, tema, hashtags))
    const imageUrl = buildUrl({ tipo: plantilla, estilo, titulo: post.titulo, sub: post.sub, dato: post.dato, unidad: post.unidad, ctx: post.ctx, items: post.items, modulo })

    const { data: borrador, error: errBorrador } = await supabase.from('instagram_borradores').insert({
      plantilla, titulo: post.titulo, sub: post.sub, dato: post.dato, unidad: post.unidad,
      ctx: post.ctx, items: post.items, caption: post.caption + coletilla, image_url: imageUrl,
      tema_elegido: tema, modulo_relacionado: modulo,
    }).select('id').single()

    if (errBorrador) {
      notifyError({ tipo: 'instagram_insert', modulo: 'cron', nivel: 'aviso', mensaje: `No se pudo guardar borrador: ${errBorrador.message}`, detalle: { tema, plantilla } })
      await tgAlertButtons(`⚠️ <b>Post generado pero NO se guardó</b>\n\n<code>${errBorrador.message.slice(0,150)}</code>`, 'aviso', [])
    }

    if (borrador?.id) {
      const tonoEmoji = TONO[plantilla]==='claro'?'⬜':TONO[plantilla]==='rojo'?'🟥':'⬛'
      await tgAlertButtons(
        `📸 <b>Nuevo post Instagram listo</b>\n\n${tonoEmoji} <code>${plantilla}</code> · ${modulo||'—'}\n\n<b>${post.titulo?.slice(0,70)}</b>\n\n<i>${post.caption?.slice(0,150)}...</i>`,
        'info',
        [[{ texto:'✅ Publicar', callback:`ig_aprobar:${borrador.id}` },{ texto:'🗑️ Descartar', callback:`ig_descartar:${borrador.id}` }],[{ texto:'✏️ Editar en /super', callback:`ig_editar:${borrador.id}` }]]
      )
    }
    return NextResponse.json({ ok: true, formato: 'imagen', plantilla, borradorId: borrador?.id, tema })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
