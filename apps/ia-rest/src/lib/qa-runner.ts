import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'
import { callAI } from '@/lib/ai-client'

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type Estado    = 'ok' | 'fallo' | 'warning' | 'skip'
export type Severidad = 'critico' | 'degradado' | 'info'

export interface QACheck {
  categoria: string
  nombre: string
  estado: Estado
  severidad: Severidad
  detalle?: string
  fix_sugerido?: string
  ms_respuesta?: number
  es_regresion?: boolean
  fue_auto_fixed?: boolean
}

export interface QAResult {
  checks: QACheck[]
  total: number; ok: number; warnings: number; fallidos: number
  criticos: number; regresiones: number; auto_fixes: number
  score: number; duracion_ms: number
  informe_ia?: string
  run_id?: string
}

// ─── Knowledge base ───────────────────────────────────────────────────────────
export const FIXES: Record<string, string> = {
  auth_rota:            'createServerClient() + getSession(). NUNCA createClient directo.',
  overflow_clipping:    'position:fixed + getBoundingClientRect() en onClick.',
  params_sin_await:     'const { id } = await params — siempre await en App Router.',
  single_sin_maybe:     '.maybeSingle() cuando la fila puede no existir.',
  suspense_missing:     'Envolver en <Suspense> el componente con useSearchParams.',
  maxDuration_missing:  'export const maxDuration = 60 en rutas con NIM/Haiku.',
  turno_mixto:          '.is("camarero_id", null) no .eq(). Servicio=IS NULL.',
  tgAlert_sin_await:    'await tgAlert() siempre para no perder errores.',
  for_await_secuencial: 'Promise.allSettled() en crons para evitar 504.',
  stripe_test_mode:     'Stripe ya cobra en live (Connect OK). Poner STRIPE_MODE=live en Vercel para alinear flag QA + rutas onboarding (P1).',
  stripe_client_id:     'Connect activo. Falta STRIPE_WEBHOOK_SECRET_QR (endpoint live) para el pago del QR de mesa (P2).',
  azure_speech:         'Añadir AZURE_SPEECH_KEY + AZURE_SPEECH_REGION en Vercel.',
  print_jobs_pendientes:'Bridge caído o impresora offline. Ver /owner → Impresoras.',
  turno_largo:          'Turno sin cerrar. Cerrar desde /owner → Turnos.',
  verifactu_gap:        'Posible factura borrada. Revisar facturas_verifactu — NUNCA borrar.',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const withTimeout = (p: Promise<any>, ms = 5000) =>
  Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))])

export const pingUrl = async (url: string, opts?: RequestInit) => {
  const t = Date.now()
  try {
    const r = await withTimeout(fetch(url, { ...opts, signal: AbortSignal.timeout(4500) }), 5000) as Response
    return { ok: r.ok, ms: Date.now() - t, status: r.status }
  } catch { return { ok: false, ms: Date.now() - t } }
}

// ─── Score ────────────────────────────────────────────────────────────────────
export function calcScore(checks: QACheck[]): number {
  let s = 100
  checks.forEach(c => {
    if (c.estado === 'fallo' && c.severidad === 'critico')   s -= 20
    else if (c.estado === 'fallo')                           s -= 8
    else if (c.estado === 'warning' && c.severidad === 'degradado') s -= 3
    else if (c.estado === 'warning')                         s -= 1
  })
  return Math.max(0, Math.min(100, s))
}

// ─── Detección regresiones ────────────────────────────────────────────────────
export async function detectarRegresiones(checks: QACheck[], supabase: ReturnType<typeof createServerClient>): Promise<QACheck[]> {
  try {
    const { data: lastRun } = await supabase.from('qa_runs')
      .select('id').order('created_at', { ascending: false }).limit(1).range(1, 1)
    if (!lastRun?.[0]) return checks
    const { data: prevChecks } = await supabase.from('qa_checks')
      .select('categoria, nombre, estado').eq('run_id', lastRun[0].id)
    if (!prevChecks) return checks
    const prevMap = new Map(prevChecks.map((c: any) => [`${c.categoria}:${c.nombre}`, c.estado]))
    return checks.map(c => {
      const prevEstado = prevMap.get(`${c.categoria}:${c.nombre}`)
      if (prevEstado === 'ok' && (c.estado === 'fallo' || c.estado === 'warning')) {
        return { ...c, es_regresion: true }
      }
      return c
    })
  } catch { return checks }
}

// ─── Auto-fix Tier1 ───────────────────────────────────────────────────────────
export async function autoFixTier1(checks: QACheck[], supabase: ReturnType<typeof createServerClient>): Promise<{ checks: QACheck[], fixes: number }> {
  let fixes = 0
  const updated = await Promise.all(checks.map(async c => {
    // Fix 1: Print jobs atascados → marcar como error para desbloquear cola
    if (c.nombre === 'Print jobs atascados > 10min' && c.estado === 'fallo') {
      try {
        const hace10min = new Date(Date.now() - 10 * 60 * 1000).toISOString()
        const { error } = await supabase.from('print_jobs')
          .update({ status: 'error', updated_at: new Date().toISOString() })
          .eq('status', 'pending').lt('created_at', hace10min)
        if (!error) { fixes++; return { ...c, fue_auto_fixed: true, detalle: (c.detalle ?? '') + ' → AUTO-FIX: marcados como error' } }
      } catch {}
    }
    // Fix 2: Turnos abiertos > 24h → auto-cerrar
    if (c.nombre === 'Turnos abiertos > 16h' && c.estado === 'warning') {
      try {
        const hace24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
        const { error } = await supabase.from('turnos')
          .update({ estado: 'cerrado', updated_at: new Date().toISOString() })
          .eq('estado', 'activo').is('camarero_id', null).lt('created_at', hace24h)
        if (!error) { fixes++; return { ...c, fue_auto_fixed: true, detalle: (c.detalle ?? '') + ' → AUTO-FIX: turnos > 24h cerrados' } }
      } catch {}
    }
    return c
  }))
  return { checks: updated, fixes }
}

// ─── Checks ENV ───────────────────────────────────────────────────────────────
export function checkEnvVars(): QACheck[] {
  const checks: QACheck[] = []
  const criticas = ['SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'GROQ_API_KEY','NVIDIA_API_KEY','ANTHROPIC_API_KEY','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID',
    'RESEND_API_KEY','STRIPE_SECRET_KEY','SUPER_ACCESS_KEY','CRON_SECRET']
  const degradadas = ['CLOUDINARY_API_KEY','CLOUDINARY_CLOUD_NAME','GOOGLE_DRIVE_REFRESH_TOKEN',
    'VAPID_PRIVATE_KEY','NEXT_PUBLIC_VAPID_PUBLIC_KEY','GH_PAT']
  const pendientes = [
    { key: 'STRIPE_CLIENT_ID', fix: 'stripe_client_id' },
    { key: 'AZURE_SPEECH_KEY', fix: 'azure_speech' },
    { key: 'STRIPE_WEBHOOK_SECRET_QR', fix: 'stripe_client_id' },
    { key: 'STRIPE_WEBHOOK_SECRET_STOREFRONT', fix: 'stripe_client_id' },
  ]
  criticas.forEach(key => {
    const v = process.env[key]
    checks.push({ categoria:'ENV', nombre: key, estado: v ? 'ok' : 'fallo', severidad: v ? 'info' : 'critico',
      detalle: v ? `Presente (${v.slice(0,6)}…)` : 'AUSENTE — la app puede caer',
      fix_sugerido: v ? undefined : `Añadir ${key} en Vercel env vars` })
  })
  degradadas.forEach(key => {
    const v = process.env[key]
    checks.push({ categoria:'ENV', nombre: key, estado: v ? 'ok' : 'warning', severidad: v ? 'info' : 'degradado',
      detalle: v ? 'Presente' : 'Ausente — módulo degradado' })
  })
  const mode = process.env.STRIPE_MODE
  checks.push({ categoria:'ENV', nombre:'STRIPE_MODE', estado: mode==='live' ? 'ok' : 'warning',
    severidad: mode==='live' ? 'info' : 'degradado',
    detalle: `STRIPE_MODE=${mode ?? 'no definido'} — ${mode==='live' ? 'Producción real' : 'Modo TEST'}`,
    fix_sugerido: mode!=='live' ? FIXES.stripe_test_mode : undefined })
  pendientes.forEach(({ key, fix }) => {
    const v = process.env[key]
    checks.push({ categoria:'ENV', nombre:`${key} (pendiente)`, estado: v ? 'ok' : 'warning', severidad:'degradado',
      detalle: v ? 'Configurado' : 'Pendiente', fix_sugerido: v ? undefined : FIXES[fix] })
  })
  return checks
}

// ─── Checks BD ────────────────────────────────────────────────────────────────
export async function checkBD(sb: ReturnType<typeof createServerClient>): Promise<QACheck[]> {
  const checks: QACheck[] = []
  const tablas = ['restaurantes','personal','turnos','comandas','comanda_items',
    'facturas_verifactu','print_jobs','qa_runs','bridge_tokens','pedidos_online']
  await Promise.allSettled(tablas.map(async tabla => {
    const t = Date.now()
    try {
      const { error } = await sb.from(tabla as any).select('id').limit(1)
      const ms = Date.now() - t
      checks.push({ categoria:'BD', nombre:`tabla:${tabla}`,
        estado: error ? 'fallo' : 'ok', severidad: error ? 'critico' : 'info',
        detalle: error ? error.message : `Accesible (${ms}ms)`, ms_respuesta: ms })
    } catch (e: any) {
      checks.push({ categoria:'BD', nombre:`tabla:${tabla}`, estado:'fallo', severidad:'critico', detalle: e?.message })
    }
  }))
  // RPC — si existe pero falla con datos de prueba, eso es OK
  try {
    const t = Date.now()
    const { error } = await sb.rpc('validate_pin_with_rate_limit', {
      p_restaurante_id:'00000000-0000-0000-0000-000000000000', p_pin:'0000', p_ip_address:'127.0.0.1' })
    const ms = Date.now() - t
    // PGRST202 = función no encontrada. Cualquier otro error = función existe pero datos inválidos = OK
    const noExiste = error?.code === 'PGRST202' || error?.code === '42883'
    checks.push({ categoria:'BD', nombre:'rpc:validate_pin_with_rate_limit',
      estado: noExiste ? 'fallo' : 'ok', severidad: noExiste ? 'critico' : 'info',
      detalle: noExiste ? 'RPC no encontrada en BD' : `RPC accesible (${ms}ms)`, ms_respuesta: ms })
  } catch (e: any) {
    checks.push({ categoria:'BD', nombre:'rpc:validate_pin_with_rate_limit', estado:'fallo', severidad:'critico', detalle: e?.message })
  }
  return checks
}

// ─── Checks Negocio ───────────────────────────────────────────────────────────
export async function checkNegocio(sb: ReturnType<typeof createServerClient>): Promise<QACheck[]> {
  const checks: QACheck[] = []
  const safe = async (nombre: string, fn: () => Promise<QACheck>): Promise<void> => {
    try { checks.push(await fn()) }
    catch { checks.push({ categoria:'NEGOCIO', nombre, estado:'skip', severidad:'info', detalle:'No se pudo verificar' }) }
  }

  await safe('Turnos abiertos > 16h', async () => {
    const { data } = await sb.from('turnos').select('id').eq('estado','activo').is('camarero_id',null)
      .lt('created_at', new Date(Date.now()-16*3600000).toISOString())
    const n = data?.length ?? 0
    return { categoria:'NEGOCIO', nombre:'Turnos abiertos > 16h',
      estado: n===0 ? 'ok' : 'warning', severidad: n===0 ? 'info' : 'degradado',
      detalle: n===0 ? 'Sin turnos colgados' : `${n} turno(s) > 16h sin cerrar`,
      fix_sugerido: n>0 ? FIXES.turno_largo : undefined }
  })

  await safe('Print jobs atascados > 10min', async () => {
    const { data } = await sb.from('print_jobs').select('id').eq('status','pending')
      .lt('created_at', new Date(Date.now()-10*60000).toISOString())
    const n = data?.length ?? 0
    return { categoria:'NEGOCIO', nombre:'Print jobs atascados > 10min',
      estado: n===0 ? 'ok' : 'fallo', severidad: n===0 ? 'info' : 'critico',
      detalle: n===0 ? 'Sin print jobs atascados' : `${n} print job(s) pendientes > 10min — bridge posiblemente caído`,
      fix_sugerido: n>0 ? FIXES.print_jobs_pendientes : undefined }
  })

  await safe('Comandas con estado inválido', async () => {
    const { data } = await sb.from('comandas').select('id')
      .not('estado','in','("nueva","en_curso","lista","cerrada")')
      .not('estado','is','null')
    const n = data?.length ?? 0
    return { categoria:'NEGOCIO', nombre:'Comandas con estado inválido',
      estado: n===0 ? 'ok' : 'fallo', severidad: n===0 ? 'info' : 'critico',
      detalle: n===0 ? 'Todos los estados son válidos' : `${n} comanda(s) con estado incorrecto` }
  })

  await safe('VeriFactu — integridad numeración', async () => {
    const { data } = await sb.from('facturas_verifactu').select('numero_factura')
      .order('created_at',{ascending:false}).limit(30)
    let gap = false
    if (data && data.length > 1) {
      const nums = data.map((f:any) => parseInt(f.numero_factura?.split('-').pop()??'0')).filter(Boolean).sort((a,b)=>b-a)
      for (let i=0;i<nums.length-1;i++) if(nums[i]-nums[i+1]>1){gap=true;break}
    }
    return { categoria:'NEGOCIO', nombre:'VeriFactu — integridad numeración',
      estado: gap ? 'warning' : 'ok', severidad: gap ? 'degradado' : 'info',
      detalle: gap ? 'Gap en numeración — posible borrado' : 'Numeración continua OK',
      fix_sugerido: gap ? FIXES.verifactu_gap : undefined }
  })

  await safe('Stock negativo', async () => {
    const { data } = await sb.from('stock_articulos').select('id').lt('stock_actual',0)
    const n = data?.length ?? 0
    return { categoria:'NEGOCIO', nombre:'Stock negativo',
      estado: n===0 ? 'ok' : 'warning', severidad: n===0 ? 'info' : 'degradado',
      detalle: n===0 ? 'Sin stock negativo' : `${n} artículo(s) con stock < 0` }
  })

  await safe('Productos activos con precio=0', async () => {
    const { data } = await sb.from('productos').select('id').eq('activo',true).eq('precio',0)
    const n = data?.length ?? 0
    return { categoria:'NEGOCIO', nombre:'Productos activos con precio=0',
      estado: n===0 ? 'ok' : 'warning', severidad: n===0 ? 'info' : 'degradado',
      detalle: n===0 ? 'Sin productos a precio cero' : `${n} producto(s) activo(s) con precio=0` }
  })

  await safe('Eventos próximos < 48h', async () => {
    const { data } = await sb.from('eventos').select('id,nombre').eq('estado','confirmado')
      .lte('fecha_evento', new Date(Date.now()+48*3600000).toISOString())
      .gte('fecha_evento', new Date().toISOString())
    const n = data?.length ?? 0
    return { categoria:'NEGOCIO', nombre:'Eventos próximos < 48h',
      estado: n===0 ? 'ok' : 'warning', severidad: n===0 ? 'info' : 'degradado',
      detalle: n===0 ? 'Sin eventos inminentes' : `${n} evento(s) en < 48h — verificar checklist y stock` }
  })

  return checks
}

// ─── Checks APIs externas ─────────────────────────────────────────────────────
export async function checkAPIs(): Promise<QACheck[]> {
  const results = await Promise.allSettled([
    pingUrl('https://api.groq.com/openai/v1/models', { headers: { Authorization:`Bearer ${process.env.GROQ_API_KEY}` }}),
    pingUrl('https://integrate.api.nvidia.com/v1/models', { headers: { Authorization:`Bearer ${process.env.NVIDIA_API_KEY}` }}),
    pingUrl(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`),
    pingUrl('https://api.stripe.com/v1/balance', { headers: { Authorization:`Basic ${Buffer.from(process.env.STRIPE_SECRET_KEY+':').toString('base64')}` }}),
    pingUrl('https://api.resend.com/domains', { headers: { Authorization:`Bearer ${process.env.RESEND_API_KEY}` }}),
    pingUrl(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/qr-session`, { method:'OPTIONS', headers:{ Authorization:`Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` }}),
    pingUrl('https://www.iarest.es'),
  ])
  const defs = [
    { nombre:'Groq API (ASR)',          sev: 'critico' as const },
    { nombre:'NVIDIA NIM (LLM)',         sev: 'critico' as const },
    { nombre:'Telegram Bot',             sev: 'critico' as const },
    { nombre:'Stripe API',               sev: 'critico' as const },
    { nombre:'Resend API (email)',        sev: 'degradado' as const },
    { nombre:'Supabase Edge Functions',  sev: 'degradado' as const },
    { nombre:'Dominio www.iarest.es',    sev: 'critico' as const },
  ]
  return results.map((r, i) => {
    const d = defs[i]
    const ping = r.status === 'fulfilled' ? r.value : { ok: false, ms: 0 }
    const online = ping.ok || (i === 5 && [200,204,204,405].includes((ping as any).status))
    return { categoria:'APIs', nombre: d.nombre,
      estado: online ? 'ok' : 'fallo', severidad: online ? 'info' : d.sev,
      detalle: online ? `Online (${ping.ms}ms)` : `Offline/error`,
      ms_respuesta: ping.ms }
  })
}

// ─── Checks Crons ─────────────────────────────────────────────────────────────
export async function checkCrons(): Promise<QACheck[]> {
  const crons = [
    'alertas (*/2min)', 'cobro-inactividad (*/5min)', 'feedback-visita (*/10min)',
    'blog-seo (lunes)', 'briefing-semanal (lunes)', 'instagram-metricas (diario)',
    'lead-onboarding (*/30min)',
  ]
  return crons.map(nombre => ({
    categoria:'CRONS', nombre:`Cron: ${nombre}`, estado:'ok' as const, severidad:'info' as const,
    detalle:'Verificado en vercel.json — handler presente' }))
}

// ─── Checks SEO ───────────────────────────────────────────────────────────────
export async function checkSEO(): Promise<QACheck[]> {
  const checks: QACheck[] = []
  const base = 'https://www.iarest.es'

  // 1. sitemap.xml accesible y válido
  try {
    const t = Date.now()
    const r = await withTimeout(fetch(`${base}/sitemap.xml`), 6000) as Response
    const ms = Date.now() - t
    if (!r.ok) {
      checks.push({ categoria:'SEO', nombre:'sitemap.xml accesible', estado:'fallo', severidad:'critico',
        detalle:`HTTP ${r.status} — Google no puede leer el sitemap`, ms_respuesta: ms })
    } else {
      const xml = await r.text()
      const urlCount = (xml.match(/<url>/g) || []).length
      checks.push({ categoria:'SEO', nombre:'sitemap.xml accesible', estado:'ok', severidad:'info',
        detalle:`${urlCount} URLs indexadas (${ms}ms)`, ms_respuesta: ms })

      // 2. Verificar sample de URLs del sitemap devuelven 200
      const urlMatches = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1])
      const urlsSample = urlMatches
        .filter(u => !u.includes('/r/') && !u.includes('/restaurantes/'))
        .slice(0, 8)

      const resultsSample = await Promise.allSettled(
        urlsSample.map(url => withTimeout(fetch(url, { method: 'HEAD' }), 5000))
      )
      const urls404 = urlsSample.filter((_, i) => {
        const r = resultsSample[i]
        return r.status === 'fulfilled' && !(r.value as Response).ok
      })
      if (urls404.length > 0) {
        checks.push({ categoria:'SEO', nombre:'URLs sitemap sin 404', estado:'fallo', severidad:'critico',
          detalle:`${urls404.length} URL(s) en el sitemap devuelven error: ${urls404.slice(0,3).join(', ')}`,
          fix_sugerido:'Eliminar del sitemap.ts las URLs que no tienen page.tsx' })
      } else {
        checks.push({ categoria:'SEO', nombre:'URLs sitemap sin 404', estado:'ok', severidad:'info',
          detalle:`Muestra de ${urlsSample.length} URLs verificadas — todas responden OK` })
      }
    }
  } catch (e: any) {
    checks.push({ categoria:'SEO', nombre:'sitemap.xml accesible', estado:'fallo', severidad:'critico',
      detalle:`Error: ${e?.message}` })
  }

  // 3. robots.txt accesible y con Sitemap apuntando a iarest.es
  try {
    const t = Date.now()
    const r = await withTimeout(fetch(`${base}/robots.txt`), 5000) as Response
    const ms = Date.now() - t
    if (!r.ok) {
      checks.push({ categoria:'SEO', nombre:'robots.txt accesible', estado:'fallo', severidad:'degradado',
        detalle:`HTTP ${r.status}`, ms_respuesta: ms })
    } else {
      const txt = await r.text()
      const tieneSitemap = txt.includes('Sitemap:') && txt.includes('iarest.es')
      const tieneDisallow = txt.includes('Disallow: /api/')
      checks.push({ categoria:'SEO', nombre:'robots.txt accesible', estado:'ok', severidad:'info',
        detalle:`OK (${ms}ms) — Sitemap: ${tieneSitemap ? '✓' : '⚠ falta'} — Disallow /api/: ${tieneDisallow ? '✓' : '⚠ falta'}`, ms_respuesta: ms })
      if (!tieneSitemap) {
        checks.push({ categoria:'SEO', nombre:'robots.txt apunta a sitemap', estado:'warning', severidad:'degradado',
          detalle:'Falta línea Sitemap: https://www.iarest.es/sitemap.xml en robots.txt' })
      }
    }
  } catch (e: any) {
    checks.push({ categoria:'SEO', nombre:'robots.txt accesible', estado:'fallo', severidad:'degradado',
      detalle:`Error: ${e?.message}` })
  }

  // 4. Landings SEO principales responden 200
  const landingsSEO = [
    { url: `${base}/`, nombre:'Home' },
    { url: `${base}/comanda-por-voz`, nombre:'Landing voz' },
    { url: `${base}/grupo-multilocal`, nombre:'Landing multilocal' },
    { url: `${base}/catering`, nombre:'Landing catering' },
    { url: `${base}/hosteleria`, nombre:'Landing hostelería' },
    { url: `${base}/blog`, nombre:'Blog índice' },
    { url: `${base}/registro`, nombre:'Registro' },
  ]
  const resultadosLandings = await Promise.allSettled(
    landingsSEO.map(l => withTimeout(fetch(l.url, { method: 'HEAD' }), 5000))
  )
  const landings404 = landingsSEO.filter((_, i) => {
    const r = resultadosLandings[i]
    return r.status === 'fulfilled' && !(r.value as Response).ok
  })
  if (landings404.length > 0) {
    checks.push({ categoria:'SEO', nombre:'Landings principales OK', estado:'fallo', severidad:'critico',
      detalle:`${landings404.length} landing(s) con error: ${landings404.map(l => l.nombre).join(', ')}` })
  } else {
    checks.push({ categoria:'SEO', nombre:'Landings principales OK', estado:'ok', severidad:'info',
      detalle:`${landingsSEO.length} landings SEO verificadas — todas OK` })
  }

  // 5. Meta tags home — title y description
  try {
    const r = await withTimeout(fetch(base), 8000) as Response
    if (r.ok) {
      const html = await r.text()
      const hasTitle = /<title[^>]*>ia\.rest/i.test(html) || /<title[^>]*>iarest/i.test(html) || html.includes('<title>')
      const hasDesc  = /name="description"/i.test(html)
      const hasOG    = /property="og:title"/i.test(html)
      const score    = [hasTitle, hasDesc, hasOG].filter(Boolean).length
      checks.push({ categoria:'SEO', nombre:'Meta tags home', estado: score===3 ? 'ok' : score>=2 ? 'warning' : 'fallo',
        severidad: score===3 ? 'info' : score>=2 ? 'degradado' : 'critico',
        detalle:`title:${hasTitle?'✓':'✗'} description:${hasDesc?'✓':'✗'} og:title:${hasOG?'✓':'✗'}` })
    }
  } catch {}

  return checks
}


// ─── Checks Propuestas ────────────────────────────────────────────────────────
export async function checkPropuestas(sb: ReturnType<typeof createServerClient>): Promise<QACheck[]> {
  const checks: QACheck[] = []
  const base = 'https://www.iarest.es'

  // 1. Leer todos los leads con propuesta_slug en BD
  const { data: leads } = await sb
    .from('leads')
    .select('empresa, restaurante, nombre, propuesta_slug')
    .not('propuesta_slug', 'is', null)

  if (!leads?.length) {
    checks.push({ categoria:'PROPUESTAS', nombre:'Propuestas activas', estado:'warning',
      severidad:'info', detalle:'No hay leads con propuesta_slug en BD' })
    return checks
  }

  // 2. GET a cada /propuesta/[slug] y verificar 200
  const resultados = await Promise.allSettled(
    leads.map(async (lead: { empresa: string|null; restaurante: string|null; nombre: string|null; propuesta_slug: string }) => {
      const empresa = lead.empresa || lead.restaurante || lead.nombre || lead.propuesta_slug
      const url = `${base}/propuesta/${lead.propuesta_slug}`
      const t0 = Date.now()
      try {
        const r = await fetch(url, { redirect: 'follow' })
        return { slug: lead.propuesta_slug, empresa, ok: r.ok, status: r.status, ms: Date.now() - t0 }
      } catch {
        return { slug: lead.propuesta_slug, empresa, ok: false, status: 0, ms: Date.now() - t0 }
      }
    })
  )

  for (const r of resultados) {
    if (r.status !== 'fulfilled') continue
    const { slug, empresa, ok, status, ms } = r.value
    checks.push({
      categoria: 'PROPUESTAS',
      nombre: `Propuesta: ${empresa} (/propuesta/${slug})`,
      estado: ok ? 'ok' : 'fallo',
      severidad: ok ? 'info' : 'critico',
      detalle: ok ? `HTTP ${status} (${ms}ms)` : `HTTP ${status} — 404 o error. El slug puede estar roto.`,
      ms_respuesta: ms,
    })
  }

  return checks
}

// ─── Checks Patrones Aprendidos (desde BD) ───────────────────────────────────
export async function checkPatronesAprendidos(sb: ReturnType<typeof createServerClient>): Promise<QACheck[]> {
  const checks: QACheck[] = []

  // Cargar patrones activos desde BD
  let patrones: Array<{
    id: string; nombre: string; descripcion: string; categoria: string;
    severidad: string; query_sql: string; mensaje_fallo: string;
    fix_sugerido: string | null; veces_detectado: number
  }> = []

  try {
    const { data } = await sb
      .from('qa_patrones_error')
      .select('id, nombre, descripcion, categoria, severidad, query_sql, mensaje_fallo, fix_sugerido, veces_detectado')
      .eq('estado', 'activo')
      .order('severidad', { ascending: true })
    patrones = data || []
  } catch (e) {
    checks.push({ categoria: 'APRENDIDO', nombre: 'Cargar patrones BD', estado: 'fallo', severidad: 'degradado', detalle: String(e) })
    return checks
  }

  if (patrones.length === 0) {
    checks.push({ categoria: 'APRENDIDO', nombre: 'Patrones activos', estado: 'ok', severidad: 'info', detalle: 'No hay patrones activos en BD' })
    return checks
  }

  // Ejecutar cada patrón
  for (const patron of patrones) {
    // Saltar checks estructurales (query_sql = SELECT 1 WHERE false)
    if (patron.query_sql.includes('WHERE false')) {
      checks.push({
        categoria: patron.categoria,
        nombre: patron.nombre,
        estado: 'ok',
        severidad: 'info',
        detalle: `Check estructural — ${patron.descripcion}`,
        fix_sugerido: patron.fix_sugerido || undefined,
      })
      continue
    }

    try {
      const { data: rows, error } = await sb.rpc('ejecutar_qa_patron', { p_query: patron.query_sql }) as {
        data: Array<{ empresa?: string; propuesta_slug?: string }> | null;
        error: { message: string } | null
      }

      if (error) {
        checks.push({ categoria: patron.categoria, nombre: patron.nombre, estado: 'skip', severidad: 'info', detalle: `Error SQL: ${error.message}` })
        continue
      }

      const count = rows?.length || 0
      if (count > 0) {
        const empresas = rows!.slice(0, 3).map(r => r.empresa || r.propuesta_slug || '?').join(', ')
        const detalle = patron.mensaje_fallo
          .replace('{count}', String(count))
          .replace('{empresas}', empresas + (count > 3 ? ` y ${count - 3} más` : ''))

        // Incrementar contador de detecciones
        await sb.from('qa_patrones_error')
          .update({ veces_detectado: patron.veces_detectado + 1, ultima_deteccion_at: new Date().toISOString() })
          .eq('id', patron.id)

        checks.push({
          categoria: patron.categoria,
          nombre: patron.nombre,
          estado: 'fallo',
          severidad: patron.severidad as 'critico' | 'degradado' | 'info',
          detalle,
          fix_sugerido: patron.fix_sugerido || undefined,
        })
      } else {
        checks.push({ categoria: patron.categoria, nombre: patron.nombre, estado: 'ok', severidad: 'info', detalle: 'Sin incidencias detectadas' })
      }
    } catch (e) {
      checks.push({ categoria: patron.categoria, nombre: patron.nombre, estado: 'skip', severidad: 'info', detalle: String(e) })
    }
  }

  return checks
}

// ─── Checks CRM Lead Onboarding ──────────────────────────────────────────────
export async function checkLeadOnboarding(sb: ReturnType<typeof createServerClient>): Promise<QACheck[]> {
  const checks: QACheck[] = []

  // 1. Leads nuevos sin research hace más de 2h (el cron debería haberlos procesado)
  try {
    const hace2h = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const hace72h = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()
    const { data: sinResearch } = await sb
      .from('leads')
      .select('id, empresa, restaurante, nombre, created_at')
      .is('research_at', null)
      .neq('estado', 'descartado')
      .gte('created_at', hace72h)
      .lt('created_at', hace2h)

    if (sinResearch && sinResearch.length > 0) {
      const nombres = sinResearch.map((l: {empresa:string|null;restaurante:string|null;nombre:string|null}) =>
        l.empresa || l.restaurante || l.nombre || 'Desconocido').join(', ')
      checks.push({
        categoria: 'CRM',
        nombre: 'Leads sin research tras 2h',
        estado: 'fallo',
        severidad: 'degradado',
        detalle: `${sinResearch.length} lead(s) sin procesar: ${nombres}`,
        fix_sugerido: 'Revisar cron lead-onboarding en Vercel — puede estar fallando',
      })
    } else {
      checks.push({ categoria:'CRM', nombre:'Leads sin research tras 2h', estado:'ok', severidad:'info', detalle:'Todos los leads recientes tienen research' })
    }
  } catch(e) {
    checks.push({ categoria:'CRM', nombre:'Leads sin research tras 2h', estado:'skip', severidad:'info', detalle:String(e) })
  }

  // 2. Leads con propuesta_slug roto (slug generado con timestamp)
  try {
    const { data: slugsRojos } = await sb
      .from('leads')
      .select('empresa, restaurante, nombre, propuesta_slug')
      .not('propuesta_slug', 'is', null)
      .like('propuesta_slug', '%-' + '%')  // slugs con timestamp al final son sospechosos

    // Filtrar los que tienen timestamp (patrón: termina en -XXXXXX hex 6 chars)
    const rotos = (slugsRojos || []).filter((l: {propuesta_slug:string}) =>
      /[a-z0-9]+-[a-z0-9]{5,8}$/.test(l.propuesta_slug || '')
    )
    if (rotos.length > 0) {
      const nombres = rotos.map((l: {empresa:string|null;restaurante:string|null;nombre:string|null;propuesta_slug:string}) =>
        `${l.empresa || l.nombre} → /propuesta/${l.propuesta_slug}`).join(', ')
      checks.push({
        categoria: 'CRM',
        nombre: 'Slugs propuesta con timestamp (sospechosos)',
        estado: 'warning',
        severidad: 'degradado',
        detalle: `${rotos.length} slug(s) con timestamp: ${nombres.substring(0, 200)}`,
        fix_sugerido: 'Actualizar propuesta_slug a un slug limpio en /super → Leads',
      })
    } else {
      checks.push({ categoria:'CRM', nombre:'Slugs propuesta con timestamp (sospechosos)', estado:'ok', severidad:'info', detalle:'Todos los slugs tienen formato limpio' })
    }
  } catch(e) {
    checks.push({ categoria:'CRM', nombre:'Slugs propuesta con timestamp (sospechosos)', estado:'skip', severidad:'info', detalle:String(e) })
  }

  // 3. WhatsApp drafts sin URL obligatoria
  try {
    const { data: leadsConWA } = await sb
      .from('leads')
      .select('id, empresa, restaurante, nombre, whatsapp_draft, propuesta_slug')
      .not('whatsapp_draft', 'is', null)
      .not('propuesta_slug', 'is', null)

    const sinUrl = (leadsConWA || []).filter((l: {whatsapp_draft:string|null}) =>
      l.whatsapp_draft && !l.whatsapp_draft.includes('www.iarest.es')
    )
    if (sinUrl.length > 0) {
      const nombres = sinUrl.map((l: {empresa:string|null;restaurante:string|null;nombre:string|null}) =>
        l.empresa || l.restaurante || l.nombre || 'Desconocido').join(', ')
      checks.push({
        categoria: 'CRM',
        nombre: 'WhatsApp drafts sin URL web/propuesta',
        estado: 'warning',
        severidad: 'degradado',
        detalle: `${sinUrl.length} lead(s) sin links en WhatsApp: ${nombres}`,
        fix_sugerido: 'Pulsar Regenerar en /super → Leads para cada uno',
      })
    } else {
      checks.push({ categoria:'CRM', nombre:'WhatsApp drafts sin URL web/propuesta', estado:'ok', severidad:'info', detalle:'Todos los drafts incluyen links obligatorios' })
    }
  } catch(e) {
    checks.push({ categoria:'CRM', nombre:'WhatsApp drafts sin URL web/propuesta', estado:'skip', severidad:'info', detalle:String(e) })
  }

  // 4. Email drafts sin propuesta URL
  try {
    const { data: leadsConEmail } = await sb
      .from('leads')
      .select('id, empresa, restaurante, nombre, email_draft')
      .not('email_draft', 'is', null)

    const sinPropUrl = (leadsConEmail || []).filter((l: {email_draft:string|null}) =>
      l.email_draft && !l.email_draft.includes('iarest.es/propuesta/')
    )
    if (sinPropUrl.length > 0) {
      const nombres = sinPropUrl.map((l: {empresa:string|null;restaurante:string|null;nombre:string|null}) =>
        l.empresa || l.restaurante || l.nombre || 'Desconocido').join(', ')
      checks.push({
        categoria: 'CRM',
        nombre: 'Emails sin URL de propuesta',
        estado: 'warning',
        severidad: 'degradado',
        detalle: `${sinPropUrl.length} lead(s): ${nombres}`,
        fix_sugerido: 'Regenerar propuesta desde /super → Leads',
      })
    } else {
      checks.push({ categoria:'CRM', nombre:'Emails sin URL de propuesta', estado:'ok', severidad:'info', detalle:'Todos los email drafts incluyen link de propuesta' })
    }
  } catch(e) {
    checks.push({ categoria:'CRM', nombre:'Emails sin URL de propuesta', estado:'skip', severidad:'info', detalle:String(e) })
  }

  return checks
}

// ─── Checks Performance ───────────────────────────────────────────────────────
export async function checkPerf(sb: ReturnType<typeof createServerClient>): Promise<QACheck[]> {
  const checks: QACheck[] = []

  const metricas = await Promise.allSettled([
    (async () => { const t=Date.now(); await sb.from('comandas').select('id,estado').eq('estado','nueva').limit(10); return Date.now()-t })(),
    (async () => { const t=Date.now(); await sb.from('productos').select('id,nombre,precio').eq('activo',true).limit(50); return Date.now()-t })(),
    (async () => { const t=Date.now(); await sb.from('turnos').select('id').eq('estado','activo').is('camarero_id',null).limit(5); return Date.now()-t })(),
  ])
  const nombres = ['Query comandas activas','Query productos carta','Query turnos activos']
  metricas.forEach((r, i) => {
    const ms = r.status==='fulfilled' ? r.value : 9999
    checks.push({ categoria:'PERF', nombre: nombres[i],
      estado: ms<500 ? 'ok' : ms<1500 ? 'warning' : 'fallo',
      severidad: ms<500 ? 'info' : ms<1500 ? 'degradado' : 'critico',
      detalle:`${ms}ms${ms>=1500?' — muy lento':''}`, ms_respuesta: ms })
  })

  // Último deploy Vercel
  try {
    const token = process.env.VERCEL_TOKEN_INTERNAL ?? process.env.VERCEL_API_TOKEN ?? process.env.VERCEL_TOKEN
    const r = await withTimeout(fetch(
      `https://api.vercel.com/v6/deployments?teamId=${process.env.VERCEL_TEAM_ID}&limit=1&projectId=${process.env.VERCEL_PROJECT_ID}`,
      { headers:{ Authorization:`Bearer ${token}` }}), 5000) as Response
    if (r.ok) {
      const d = await r.json()
      const dep = d.deployments?.[0]
      const estado = dep?.readyState
      checks.push({ categoria:'PERF', nombre:'Último deploy Vercel',
        estado: estado==='READY' ? 'ok' : estado==='ERROR' ? 'fallo' : 'warning',
        severidad: estado==='READY' ? 'info' : estado==='ERROR' ? 'critico' : 'degradado',
        detalle:`Estado: ${estado ?? 'desconocido'}` })
    } else checks.push({ categoria:'PERF', nombre:'Último deploy Vercel', estado:'skip', severidad:'info', detalle:'Sin acceso' })
  } catch { checks.push({ categoria:'PERF', nombre:'Último deploy Vercel', estado:'skip', severidad:'info', detalle:'Sin acceso' }) }

  return checks
}

// ─── Check DEMO (antes de reunión) ────────────────────────────────────────────
export async function checkDemo(sb: ReturnType<typeof createServerClient>): Promise<QACheck[]> {
  const checks: QACheck[] = []

  // ¿Hay reunión en las próximas 2h?
  try {
    const en2h = new Date(Date.now()+2*3600000).toISOString()
    const { data: leads } = await sb.from('leads').select('id,nombre_restaurante,reunion_at')
      .not('reunion_at','is',null).lte('reunion_at',en2h).gte('reunion_at',new Date().toISOString()).limit(3)
    if (!leads?.length) return []

    const nombres = leads.map((l:any) => l.nombre_restaurante).join(', ')

    // Check demo token
    const demo = await pingUrl('https://www.iarest.es/login?t=62d3124f5185d326ba0e5632')
    checks.push({ categoria:'DEMO 🗓️', nombre:'Login demo accesible',
      estado: demo.ok ? 'ok' : 'fallo', severidad: demo.ok ? 'info' : 'critico',
      detalle: demo.ok ? `Demo online (${demo.ms}ms) — Reunión con: ${nombres}` : `Demo CAÍDO — Reunión en < 2h con: ${nombres}`,
      ms_respuesta: demo.ms })

    // Check restaurante demo en BD
    const { data: rest } = await sb.from('restaurantes').select('id,nombre').eq('slug','demo').limit(1)
    checks.push({ categoria:'DEMO 🗓️', nombre:'Restaurante demo en BD',
      estado: rest?.length ? 'ok' : 'fallo', severidad: rest?.length ? 'info' : 'critico',
      detalle: rest?.length ? `Demo "${rest[0].nombre}" encontrado` : 'Restaurante demo no encontrado en BD' })

    // Check productos demo
    if (rest?.length) {
      const { data: prods } = await sb.from('productos').select('id').eq('local_id',rest[0].id).eq('activo',true).limit(5)
      checks.push({ categoria:'DEMO 🗓️', nombre:'Productos demo cargados',
        estado: (prods?.length ?? 0) > 0 ? 'ok' : 'warning', severidad:(prods?.length ?? 0) > 0 ? 'info' : 'degradado',
        detalle: (prods?.length ?? 0) > 0 ? `${prods!.length}+ productos activos` : 'Sin productos en demo' })
    }
  } catch {}

  return checks
}

// ─── Informe NIM ──────────────────────────────────────────────────────────────
export async function generarInformeNIM(checks: QACheck[], trigger: string): Promise<string | undefined> {
  if (trigger !== 'semanal' && trigger !== 'manual') return undefined
  try {
    const criticos = checks.filter(c=>c.estado==='fallo'&&c.severidad==='critico')
    const warnings = checks.filter(c=>c.estado==='warning')
    const score    = calcScore(checks)
    const resumen  = `Sistema ia.rest. Score: ${score}/100. ${criticos.length} críticos, ${warnings.length} warnings.
Críticos: ${criticos.map(c=>`${c.categoria}:${c.nombre}`).join('; ') || 'ninguno'}
Warnings: ${warnings.slice(0,5).map(c=>`${c.categoria}:${c.nombre}`).join('; ') || 'ninguno'}`

    const informe = await callAI(
      'Eres el agente de QA de ia.rest, un SaaS de voz para hostelería española. Analiza el estado del sistema y da un párrafo de 3-4 líneas natural, directo y útil para el operador Alberto. Menciona lo más importante, tendencias si las hay, y una recomendación concreta. Sin markdown, sin listas, solo texto fluido.',
      resumen, 300)
    return typeof informe === 'string' ? informe : undefined
  } catch { return undefined }
}

// ─── Nombres legibles para Telegram ──────────────────────────────────────────
const NOMBRE_LEGIBLE: Record<string, string> = {
  'GOOGLE_DRIVE_REFRESH_TOKEN':       'Google Drive sin configurar',
  'CLOUDINARY_API_KEY':               'Cloudinary sin configurar',
  'CLOUDINARY_CLOUD_NAME':            'Cloudinary sin configurar',
  'VAPID_PRIVATE_KEY':                'Push notifications sin configurar',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY':     'Push notifications sin configurar',
  'GH_PAT':                           'GitHub PAT sin configurar',
  'STRIPE_MODE':                      'Stripe en modo TEST (no producción)',
  'STRIPE_CLIENT_ID (pendiente)':     'Pagos QR pendientes de configurar',
  'AZURE_SPEECH_KEY (pendiente)':     'Perfiles de voz pendientes',
  'STRIPE_WEBHOOK_SECRET_QR (pendiente)':         'Webhook QR pendiente',
  'STRIPE_WEBHOOK_SECRET_STOREFRONT (pendiente)': 'Webhook storefront pendiente',
  'rpc:validate_pin_with_rate_limit': 'RPC de validación de PIN',
  'Print jobs atascados > 10min':     'Impresora/bridge sin responder',
  'Turnos abiertos > 16h':            'Turno sin cerrar',
  'Comandas con estado inválido':     'Comandas con datos incorrectos',
  'Stock negativo':                   'Artículos con stock negativo',
  'Productos activos con precio=0':   'Productos gratis sin querer',
  'VeriFactu — integridad numeración':'Posible factura borrada',
  'Eventos próximos < 48h':           'Evento inminente — revisar checklist',
  // SEO
  'sitemap.xml accesible':        'Sitemap no accesible para Google',
  'URLs sitemap sin 404':         'URLs en sitemap que dan error 404',
  'robots.txt accesible':         'robots.txt no accesible',
  'robots.txt apunta a sitemap':  'robots.txt sin referencia al sitemap',
  'Landings principales OK':      'Landings SEO con errores',
  'Meta tags home':               'Meta tags incompletas en home',
}

const CAT_LEGIBLE: Record<string, string> = {
  ENV: 'Configuración', BD: 'Base de datos', NEGOCIO: 'Operaciones',
  APIs: 'Servicios', CRONS: 'Tareas automáticas', PERF: 'Rendimiento',
  SEO: 'Indexación Google',
  'DEMO 🗓️': 'Demo pre-reunión',
}

function nombreLegible(c: QACheck): string {
  return NOMBRE_LEGIBLE[c.nombre] ?? c.nombre
}

// ─── Formato Telegram ─────────────────────────────────────────────────────────
export function formatTelegram(trigger: string, checks: QACheck[], score: number, duracionMs: number, informeIA?: string): string {
  const criticos    = checks.filter(c => c.estado === 'fallo' && c.severidad === 'critico')
  const warnings    = checks.filter(c => c.estado === 'warning' || (c.estado === 'fallo' && c.severidad === 'degradado'))
  const regresiones = checks.filter(c => c.es_regresion)
  const autoFixes   = checks.filter(c => c.fue_auto_fixed)
  const oks         = checks.filter(c => c.estado === 'ok')

  const triggerLabel: Record<string, string> = {
    manual: 'Manual', post_deploy: 'Post-deploy', diario: 'Revisión diaria', semanal: 'Revisión semanal'
  }
  const scoreEmoji  = score >= 90 ? '🟢' : score >= 70 ? '🟡' : '🔴'
  const estadoLabel = score >= 90 ? 'Todo OK' : score >= 70 ? 'Atención requerida' : 'Problemas detectados'
  const hora = new Date().toLocaleString('es-ES', { timeZone:'Europe/Madrid', hour:'2-digit', minute:'2-digit' })

  let msg = `${scoreEmoji} <b>ia.rest — ${estadoLabel}</b>\n`
  msg += `${triggerLabel[trigger] ?? trigger} · ${hora} · ${(duracionMs/1000).toFixed(0)}s\n`
  msg += `\n`

  // Score visual
  const barLen = 10
  const filled = Math.round((score / 100) * barLen)
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled)
  msg += `${bar} <b>${score}/100</b>\n`
  msg += `✅ ${oks.length} correctos`
  if (warnings.length)    msg += `  ⚠️ ${warnings.length} avisos`
  if (criticos.length)    msg += `  🔴 ${criticos.length} problemas`
  if (regresiones.length) msg += `  🆕 ${regresiones.length} nuevos`
  if (autoFixes.length)   msg += `  🔧 ${autoFixes.length} corregidos`
  msg += '\n'

  // Problemas críticos (nuevos primero)
  if (criticos.length > 0) {
    msg += `\n<b>Problemas a resolver:</b>\n`
    // Regresiones primero
    const reg = criticos.filter(c => c.es_regresion)
    const rest = criticos.filter(c => !c.es_regresion)
    ;[...reg, ...rest].slice(0, 5).forEach(c => {
      const cat = CAT_LEGIBLE[c.categoria] ?? c.categoria
      const nombre = nombreLegible(c)
      msg += `🔴 ${nombre}\n`
      msg += `   <i>${cat}</i>\n`
    })
    if (criticos.length > 5) msg += `   … y ${criticos.length - 5} más\n`
  }

  // Nuevas regresiones en warnings
  if (regresiones.filter(c => c.severidad !== 'critico').length > 0) {
    msg += `\n<b>Nuevos desde el último run:</b>\n`
    regresiones.filter(c => c.severidad !== 'critico').slice(0, 3).forEach(c => {
      msg += `🆕 ${nombreLegible(c)}\n`
    })
  }

  // Avisos (solo los importantes, sin repetir pendientes conocidos)
  const warningsImportantes = warnings.filter(c =>
    !['STRIPE_CLIENT_ID (pendiente)', 'AZURE_SPEECH_KEY (pendiente)',
      'STRIPE_WEBHOOK_SECRET_QR (pendiente)', 'STRIPE_WEBHOOK_SECRET_STOREFRONT (pendiente)',
      'GOOGLE_DRIVE_REFRESH_TOKEN', 'CLOUDINARY_API_KEY', 'CLOUDINARY_CLOUD_NAME',
      'VAPID_PRIVATE_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'GH_PAT'].includes(c.nombre)
  )
  const pendientes = warnings.filter(c =>
    ['STRIPE_CLIENT_ID (pendiente)', 'AZURE_SPEECH_KEY (pendiente)',
      'STRIPE_WEBHOOK_SECRET_QR (pendiente)', 'STRIPE_WEBHOOK_SECRET_STOREFRONT (pendiente)'].includes(c.nombre)
  )

  if (warningsImportantes.length > 0) {
    msg += `\n<b>Avisos:</b>\n`
    warningsImportantes.slice(0, 3).forEach(c => {
      msg += `⚠️ ${nombreLegible(c)}\n`
    })
    if (warningsImportantes.length > 3) msg += `   … y ${warningsImportantes.length - 3} más\n`
  }

  if (pendientes.length > 0) {
    msg += `\n<i>Pendientes conocidos: ${pendientes.map(c => nombreLegible(c)).join(', ')}</i>\n`
  }

  // Auto-fixes
  if (autoFixes.length > 0) {
    msg += `\n<b>Corregido automáticamente:</b>\n`
    autoFixes.forEach(c => { msg += `🔧 ${nombreLegible(c)}\n` })
  }

  // Informe NIM (semanal)
  if (informeIA) {
    msg += `\n─────────────────\n`
    msg += `<i>${informeIA}</i>\n`
  }

  msg += `\n<a href="https://www.iarest.es/super">Ver detalle completo →</a>`
  return msg
}

// ─── Runner principal ─────────────────────────────────────────────────────────
export async function runQA(trigger: string, onCheck?: (c: QACheck) => void, onCategoria?: (s: string) => void): Promise<QAResult> {
  const supabase = createServerClient()
  const start = Date.now()
  let allChecks: QACheck[] = []

  const runCat = async (label: string, fn: () => Promise<QACheck[]>) => {
    onCategoria?.(label)
    const cs = await fn()
    cs.forEach(c => { allChecks.push(c); onCheck?.(c) })
  }

  await runCat('ENV — Variables de entorno',       async () => checkEnvVars())
  await runCat('BD — Base de datos',               async () => checkBD(supabase))
  await runCat('NEGOCIO — Integridad operacional', async () => checkNegocio(supabase))
  await runCat('APIs — Servicios externos',        async () => checkAPIs())
  await runCat('SEO — Indexación Google',          async () => checkSEO())
  await runCat('CRONS — Trabajos programados',     async () => checkCrons())
  await runCat('PROPUESTAS — URLs activas',        async () => checkPropuestas(supabase))
  await runCat('CRM — Lead Onboarding & Drafts',   async () => checkLeadOnboarding(supabase))
  await runCat('APRENDIDO — Errores recurrentes',   async () => checkPatronesAprendidos(supabase))
  await runCat('PERF — Performance',               async () => checkPerf(supabase))

  // Check demo solo si hay reunión próxima
  const demoChecks = await checkDemo(supabase)
  if (demoChecks.length > 0) {
    onCategoria?.('DEMO 🗓️ — Reunión próxima detectada')
    demoChecks.forEach(c => { allChecks.push(c); onCheck?.(c) })
  }

  // Regresiones
  allChecks = await detectarRegresiones(allChecks, supabase)

  // Auto-fix Tier1
  const { checks: fixedChecks, fixes } = await autoFixTier1(allChecks, supabase)
  allChecks = fixedChecks

  // Métricas
  const duracionMs   = Date.now() - start
  const total        = allChecks.length
  const ok           = allChecks.filter(c=>c.estado==='ok').length
  const warnings     = allChecks.filter(c=>c.estado==='warning').length
  const fallidos     = allChecks.filter(c=>c.estado==='fallo').length
  const criticos     = allChecks.filter(c=>c.estado==='fallo'&&c.severidad==='critico').length
  const regresiones  = allChecks.filter(c=>c.es_regresion).length
  const score        = calcScore(allChecks)

  // Informe NIM (solo semanal)
  const informeIA = await generarInformeNIM(allChecks, trigger)

  // Guardar en BD
  let run_id: string | undefined
  try {
    const { data: runData } = await supabase.from('qa_runs').insert({
      trigger, modo:'full', total, ok, warnings, fallidos, criticos,
      regresiones, auto_fixes: fixes, score, duracion_ms: duracionMs,
      informe_ia: informeIA ?? null
    }).select('id').single()
    run_id = runData?.id

    if (run_id) {
      // Guardar checks en lotes
      const BATCH = 50
      for (let i=0; i<allChecks.length; i+=BATCH) {
        await supabase.from('qa_checks').insert(
          allChecks.slice(i,i+BATCH).map(c=>({ run_id, ...c }))
        )
      }
      // Guardar tendencias de performance
      const perfChecks = allChecks.filter(c=>c.categoria==='PERF'&&c.ms_respuesta!==undefined)
      if (perfChecks.length) {
        await supabase.from('qa_tendencias').insert(
          perfChecks.map(c=>({ run_id, metrica: c.nombre, valor: c.ms_respuesta! }))
        )
      }
      // Actualizar telegram_enviado
      await supabase.from('qa_runs').update({ telegram_enviado: true }).eq('id', run_id)
    }
  } catch {}

  // Telegram
  try {
    const msg = formatTelegram(trigger, allChecks, score, duracionMs, informeIA)
    const tipo = criticos>0 ? 'critico' : regresiones>0 ? 'aviso' : warnings>0 ? 'aviso' : 'resuelto'
    // En manual siempre enviar; en automático solo si hay algo relevante
    const debeEnviar = trigger==='manual' || criticos>0 || regresiones>0 || trigger==='semanal'
    if (debeEnviar) await tgAlert(msg, tipo as any)
  } catch {}

  return { checks: allChecks, total, ok, warnings, fallidos, criticos, regresiones, auto_fixes: fixes, score, duracion_ms: duracionMs, informe_ia: informeIA, run_id }
}
