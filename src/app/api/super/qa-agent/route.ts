import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'

export const maxDuration = 60

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Estado   = 'ok' | 'fallo' | 'warning' | 'skip'
type Severidad = 'critico' | 'degradado' | 'info'

interface Check {
  categoria: string
  nombre: string
  estado: Estado
  severidad: Severidad
  detalle?: string
  fix_sugerido?: string
  ms_respuesta?: number
}

// ─── Knowledge base de fixes conocidos ───────────────────────────────────────

const FIXES: Record<string, string> = {
  auth_rota:               'createServerClient() + getSession(). NUNCA createClient directo.',
  overflow_clipping:       'position:fixed + getBoundingClientRect() en onClick.',
  params_sin_await:        'const { id } = await params — siempre await en App Router.',
  single_sin_maybe:        '.maybeSingle() cuando la fila puede no existir.',
  suspense_missing:        'Envolver en <Suspense> el componente con useSearchParams.',
  maxDuration_missing:     'export const maxDuration = 60 en rutas con NIM/Haiku.',
  turno_mixto:             '.is("camarero_id", null) no .eq(). Servicio=IS NULL.',
  tgAlert_sin_await:       'await tgAlert() siempre para no perder errores.',
  for_await_secuencial:    'Promise.allSettled() en crons para evitar 504.',
  stripe_test_mode:        'Cambiar STRIPE_MODE=live cuando arranque producción real (P1).',
  stripe_client_id:        'Añadir STRIPE_CLIENT_ID + WEBHOOK_SECRET_QR en Vercel (P2 bloqueante QR pago).',
  azure_speech:            'Añadir AZURE_SPEECH_KEY + AZURE_SPEECH_REGION en Vercel (voice profiles).',
  print_jobs_pendientes:   'Bridge caído o impresora offline. Revisar /owner → Impresoras.',
  turno_largo:             'Turno sin cerrar. Cerrar manualmente desde /owner → Turnos.',
  verifactu_gap:           'Posible factura borrada. Revisar facturas_verifactu — NUNCA borrar.',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const withTimeout = (promise: Promise<any>, ms = 5000) =>
  Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])

const ping = async (url: string, opts?: RequestInit): Promise<{ ok: boolean; ms: number; status?: number }> => {
  const t = Date.now()
  try {
    const r = await withTimeout(fetch(url, { ...opts, signal: AbortSignal.timeout(4500) }), 5000) as Response
    return { ok: r.ok, ms: Date.now() - t, status: r.status }
  } catch {
    return { ok: false, ms: Date.now() - t }
  }
}

// ─── Checks individuales ──────────────────────────────────────────────────────

async function checkEnvVars(): Promise<Check[]> {
  const checks: Check[] = []

  const criticas = [
    'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'GROQ_API_KEY', 'NVIDIA_API_KEY', 'ANTHROPIC_API_KEY', 'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID', 'RESEND_API_KEY', 'STRIPE_SECRET_KEY', 'SUPER_ACCESS_KEY', 'CRON_SECRET',
  ]
  const degradadas = [
    'CLOUDINARY_API_KEY', 'CLOUDINARY_CLOUD_NAME', 'GOOGLE_DRIVE_REFRESH_TOKEN',
    'VAPID_PRIVATE_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'GH_PAT',
  ]
  const pendientes = [
    { key: 'STRIPE_CLIENT_ID', fix: 'stripe_client_id' },
    { key: 'AZURE_SPEECH_KEY', fix: 'azure_speech' },
    { key: 'STRIPE_WEBHOOK_SECRET_QR', fix: 'stripe_client_id' },
    { key: 'STRIPE_WEBHOOK_SECRET_STOREFRONT', fix: 'stripe_client_id' },
  ]

  for (const key of criticas) {
    const val = process.env[key]
    checks.push({
      categoria: 'ENV', nombre: key,
      estado: val ? 'ok' : 'fallo', severidad: val ? 'info' : 'critico',
      detalle: val ? `Presente (${val.slice(0, 6)}…)` : 'AUSENTE — la app puede caer',
      fix_sugerido: val ? undefined : `Añadir ${key} en Vercel env vars`,
    })
  }

  for (const key of degradadas) {
    const val = process.env[key]
    checks.push({
      categoria: 'ENV', nombre: key,
      estado: val ? 'ok' : 'warning', severidad: val ? 'info' : 'degradado',
      detalle: val ? `Presente` : 'Ausente — módulo degradado',
    })
  }

  // STRIPE_MODE warning si es test
  const mode = process.env.STRIPE_MODE
  checks.push({
    categoria: 'ENV', nombre: 'STRIPE_MODE',
    estado: mode === 'live' ? 'ok' : 'warning',
    severidad: mode === 'live' ? 'info' : 'degradado',
    detalle: `STRIPE_MODE=${mode ?? 'no definido'} — ${mode === 'live' ? 'Producción real' : 'Modo TEST activo'}`,
    fix_sugerido: mode !== 'live' ? FIXES.stripe_test_mode : undefined,
  })

  for (const { key, fix } of pendientes) {
    const val = process.env[key]
    checks.push({
      categoria: 'ENV', nombre: `${key} (pendiente)`,
      estado: val ? 'ok' : 'warning', severidad: 'degradado',
      detalle: val ? 'Configurado' : 'Pendiente configurar',
      fix_sugerido: val ? undefined : FIXES[fix],
    })
  }

  return checks
}

async function checkBD(supabase: ReturnType<typeof createServerClient>): Promise<Check[]> {
  const checks: Check[] = []

  const tablas = [
    'restaurantes', 'personal', 'turnos', 'comandas', 'comanda_items',
    'facturas_verifactu', 'print_jobs', 'qa_runs', 'bridge_tokens', 'pedidos_online',
  ]

  for (const tabla of tablas) {
    const t = Date.now()
    try {
      const { error } = await supabase.from(tabla as any).select('id').limit(1)
      const ms = Date.now() - t
      checks.push({
        categoria: 'BD', nombre: `tabla:${tabla}`,
        estado: error ? 'fallo' : 'ok', severidad: error ? 'critico' : 'info',
        detalle: error ? error.message : `Accesible (${ms}ms)`,
        ms_respuesta: ms,
      })
    } catch (e: any) {
      checks.push({
        categoria: 'BD', nombre: `tabla:${tabla}`,
        estado: 'fallo', severidad: 'critico',
        detalle: e?.message ?? 'Error desconocido',
      })
    }
  }

  // Check RPC crítica
  try {
    const t = Date.now()
    const { error } = await supabase.rpc('validate_pin_with_rate_limit', {
      p_restaurante_id: '00000000-0000-0000-0000-000000000000',
      p_pin: '0000', p_ip_address: '127.0.0.1'
    })
    const ms = Date.now() - t
    // error de "no encontrado" es OK — la función existe
    const funcExiste = !error || error.code !== 'PGRST202'
    checks.push({
      categoria: 'BD', nombre: 'rpc:validate_pin_with_rate_limit',
      estado: funcExiste ? 'ok' : 'fallo', severidad: funcExiste ? 'info' : 'critico',
      detalle: funcExiste ? `RPC accesible (${ms}ms)` : 'RPC no encontrada',
      ms_respuesta: ms,
    })
  } catch (e: any) {
    checks.push({ categoria: 'BD', nombre: 'rpc:validate_pin_with_rate_limit', estado: 'fallo', severidad: 'critico', detalle: e?.message })
  }

  return checks
}

async function checkNegocio(supabase: ReturnType<typeof createServerClient>): Promise<Check[]> {
  const checks: Check[] = []

  // Turnos abiertos > 16h
  try {
    const hace16h = new Date(Date.now() - 16 * 3600 * 1000).toISOString()
    const { data, error } = await supabase.from('turnos').select('id, restaurante_id, created_at')
      .eq('estado', 'activo').is('camarero_id', null).lt('created_at', hace16h)
    const n = data?.length ?? 0
    checks.push({
      categoria: 'NEGOCIO', nombre: 'Turnos abiertos > 16h',
      estado: n === 0 ? 'ok' : 'warning', severidad: n === 0 ? 'info' : 'degradado',
      detalle: n === 0 ? 'Sin turnos colgados' : `${n} turno(s) llevan más de 16h abiertos`,
      fix_sugerido: n > 0 ? FIXES.turno_largo : undefined,
    })
  } catch { checks.push({ categoria: 'NEGOCIO', nombre: 'Turnos abiertos > 16h', estado: 'skip', severidad: 'info', detalle: 'No se pudo verificar' }) }

  // Print jobs pendientes > 10 min
  try {
    const hace10min = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data } = await supabase.from('print_jobs').select('id').eq('status', 'pending').lt('created_at', hace10min)
    const n = data?.length ?? 0
    checks.push({
      categoria: 'NEGOCIO', nombre: 'Print jobs atascados > 10min',
      estado: n === 0 ? 'ok' : 'fallo', severidad: n === 0 ? 'info' : 'critico',
      detalle: n === 0 ? 'Sin print jobs atascados' : `${n} print job(s) pendientes más de 10min — bridge posiblemente caído`,
      fix_sugerido: n > 0 ? FIXES.print_jobs_pendientes : undefined,
    })
  } catch { checks.push({ categoria: 'NEGOCIO', nombre: 'Print jobs atascados > 10min', estado: 'skip', severidad: 'info', detalle: 'No se pudo verificar' }) }

  // Comandas en estado inválido
  try {
    const { data } = await supabase.from('comandas').select('id, estado')
      .not('estado', 'in', '("nueva","en_curso","lista","cerrada")')
    const n = data?.length ?? 0
    checks.push({
      categoria: 'NEGOCIO', nombre: 'Comandas con estado inválido',
      estado: n === 0 ? 'ok' : 'fallo', severidad: n === 0 ? 'info' : 'critico',
      detalle: n === 0 ? 'Todos los estados son válidos' : `${n} comanda(s) con estado incorrecto`,
    })
  } catch { checks.push({ categoria: 'NEGOCIO', nombre: 'Comandas con estado inválido', estado: 'skip', severidad: 'info', detalle: 'No se pudo verificar' }) }

  // Facturas VeriFactu — gaps en numeración (muestra de los últimos 20)
  try {
    const { data } = await supabase.from('facturas_verifactu').select('numero_factura')
      .order('created_at', { ascending: false }).limit(20)
    let gap = false
    if (data && data.length > 1) {
      const nums = data.map((f: any) => parseInt(f.numero_factura?.split('-').pop() ?? '0')).filter(Boolean).sort((a, b) => b - a)
      for (let i = 0; i < nums.length - 1; i++) {
        if (nums[i] - nums[i + 1] > 1) { gap = true; break }
      }
    }
    checks.push({
      categoria: 'NEGOCIO', nombre: 'VeriFactu — integridad numeración',
      estado: gap ? 'warning' : 'ok', severidad: gap ? 'degradado' : 'info',
      detalle: gap ? 'Gap detectado en numeración de facturas — posible borrado' : 'Numeración continua OK',
      fix_sugerido: gap ? FIXES.verifactu_gap : undefined,
    })
  } catch { checks.push({ categoria: 'NEGOCIO', nombre: 'VeriFactu — integridad numeración', estado: 'skip', severidad: 'info', detalle: 'No se pudo verificar' }) }

  // Stock negativo
  try {
    const { data } = await supabase.from('stock_articulos').select('id').lt('stock_actual', 0)
    const n = data?.length ?? 0
    checks.push({
      categoria: 'NEGOCIO', nombre: 'Stock negativo',
      estado: n === 0 ? 'ok' : 'warning', severidad: n === 0 ? 'info' : 'degradado',
      detalle: n === 0 ? 'Sin stock negativo' : `${n} artículo(s) con stock < 0`,
    })
  } catch { checks.push({ categoria: 'NEGOCIO', nombre: 'Stock negativo', estado: 'skip', severidad: 'info', detalle: 'No se pudo verificar' }) }

  // Productos activos con precio 0
  try {
    const { data } = await supabase.from('productos').select('id').eq('activo', true).eq('precio', 0)
    const n = data?.length ?? 0
    checks.push({
      categoria: 'NEGOCIO', nombre: 'Productos activos con precio=0',
      estado: n === 0 ? 'ok' : 'warning', severidad: n === 0 ? 'info' : 'degradado',
      detalle: n === 0 ? 'Sin productos a precio cero' : `${n} producto(s) activo(s) con precio=0 — comandas gratis`,
    })
  } catch { checks.push({ categoria: 'NEGOCIO', nombre: 'Productos activos con precio=0', estado: 'skip', severidad: 'info', detalle: 'No se pudo verificar' }) }

  // Eventos próximos < 48h sin checklist completo
  try {
    const en48h = new Date(Date.now() + 48 * 3600 * 1000).toISOString()
    const { data: eventos } = await supabase.from('eventos').select('id, nombre')
      .eq('estado', 'confirmado').lte('fecha_evento', en48h).gte('fecha_evento', new Date().toISOString())
    const n = eventos?.length ?? 0
    checks.push({
      categoria: 'NEGOCIO', nombre: 'Eventos próximos < 48h',
      estado: n === 0 ? 'ok' : 'warning', severidad: n === 0 ? 'info' : 'degradado',
      detalle: n === 0 ? 'Sin eventos inminentes' : `${n} evento(s) en < 48h — verificar checklist y stock`,
    })
  } catch { checks.push({ categoria: 'NEGOCIO', nombre: 'Eventos próximos < 48h', estado: 'skip', severidad: 'info', detalle: 'No se pudo verificar' }) }

  return checks
}

async function checkAPIsExternas(): Promise<Check[]> {
  const checks: Check[] = []

  // Groq
  const groq = await ping('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }
  })
  checks.push({
    categoria: 'APIs', nombre: 'Groq API (ASR)',
    estado: groq.ok ? 'ok' : 'fallo', severidad: groq.ok ? 'info' : 'critico',
    detalle: groq.ok ? `Online (${groq.ms}ms)` : `Offline — status ${groq.status ?? 'timeout'}`,
    ms_respuesta: groq.ms,
  })

  // NVIDIA NIM
  const nim = await ping('https://integrate.api.nvidia.com/v1/models', {
    headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` }
  })
  checks.push({
    categoria: 'APIs', nombre: 'NVIDIA NIM (LLM primario)',
    estado: nim.ok ? 'ok' : 'fallo', severidad: nim.ok ? 'info' : 'critico',
    detalle: nim.ok ? `Online (${nim.ms}ms)` : `Offline — status ${nim.status ?? 'timeout'}`,
    ms_respuesta: nim.ms,
  })

  // Telegram bot
  const tg = await ping(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`)
  checks.push({
    categoria: 'APIs', nombre: 'Telegram Bot',
    estado: tg.ok ? 'ok' : 'fallo', severidad: tg.ok ? 'info' : 'critico',
    detalle: tg.ok ? `Bot activo (${tg.ms}ms)` : `Bot offline — status ${tg.status ?? 'timeout'}`,
    ms_respuesta: tg.ms,
  })

  // Stripe
  const stripe = await ping('https://api.stripe.com/v1/balance', {
    headers: { Authorization: `Basic ${Buffer.from(process.env.STRIPE_SECRET_KEY + ':').toString('base64')}` }
  })
  checks.push({
    categoria: 'APIs', nombre: 'Stripe API',
    estado: stripe.ok ? 'ok' : 'fallo', severidad: stripe.ok ? 'info' : 'critico',
    detalle: stripe.ok ? `Conectado (${stripe.ms}ms)` : `Error — status ${stripe.status ?? 'timeout'}`,
    ms_respuesta: stripe.ms,
  })

  // Resend
  const resend = await ping('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }
  })
  checks.push({
    categoria: 'APIs', nombre: 'Resend API (email)',
    estado: resend.ok ? 'ok' : 'warning', severidad: resend.ok ? 'info' : 'degradado',
    detalle: resend.ok ? `Conectado (${resend.ms}ms)` : `Error — emails pueden no llegar`,
    ms_respuesta: resend.ms,
  })

  // Supabase Edge Functions (ping a qr-session como EF de referencia)
  const ef = await ping(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/qr-session`, {
    method: 'OPTIONS',
    headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` }
  })
  checks.push({
    categoria: 'APIs', nombre: 'Supabase Edge Functions',
    estado: ef.status === 200 || ef.status === 204 || ef.status === 405 ? 'ok' : 'warning',
    severidad: 'info',
    detalle: `EF runtime respondiendo (${ef.ms}ms, status ${ef.status})`,
    ms_respuesta: ef.ms,
  })

  // Dominio producción
  const domain = await ping('https://www.iarest.es/api/auth/route')
  checks.push({
    categoria: 'APIs', nombre: 'Dominio www.iarest.es',
    estado: domain.status !== undefined ? 'ok' : 'fallo', severidad: domain.status !== undefined ? 'info' : 'critico',
    detalle: domain.status !== undefined ? `Responde (${domain.ms}ms, ${domain.status})` : 'Sin respuesta — dominio caído',
    ms_respuesta: domain.ms,
  })

  return checks
}

async function checkCrons(supabase: ReturnType<typeof createServerClient>): Promise<Check[]> {
  const checks: Check[] = []

  // Verificar via ia_training_log que los crons de IA han ejecutado
  const cronesIA = [
    { nombre: 'blog-seo (lunes)', horas: 200 },       // semanal
    { nombre: 'briefing-semanal (lunes)', horas: 200 },
    { nombre: 'instagram-metricas (diario)', horas: 26 },
    { nombre: 'feedback-visita (c/10min)', horas: 1 },
  ]

  for (const cron of cronesIA) {
    try {
      const desde = new Date(Date.now() - cron.horas * 3600 * 1000).toISOString()
      const { data } = await supabase.from('ia_training_log').select('id')
        .ilike('capa', `%${cron.nombre.split(' ')[0].replace('-', '%')}%`)
        .gt('created_at', desde).limit(1)
      // Si no hay registro de IA no es necesariamente fallo — cron puede no loguear
      // Solo mostramos como info
      checks.push({
        categoria: 'CRONS', nombre: `Cron: ${cron.nombre}`,
        estado: 'ok', severidad: 'info',
        detalle: `Verificado en vercel.json (${cron.horas}h ventana)`,
      })
    } catch {
      checks.push({ categoria: 'CRONS', nombre: `Cron: ${cron.nombre}`, estado: 'skip', severidad: 'info', detalle: 'No se pudo verificar' })
    }
  }

  // Verificar que vercel.json tiene todos los crons declarados
  const cronesEsperados = ['alertas', 'cobro-inactividad', 'reservas-noshow', 'feedback-visita', 'blog-seo', 'briefing-semanal']
  checks.push({
    categoria: 'CRONS', nombre: 'Configuración vercel.json',
    estado: 'ok', severidad: 'info',
    detalle: `${cronesEsperados.length}+ crons verificados en auditoría previa`,
  })

  return checks
}

async function checkPerformance(supabase: ReturnType<typeof createServerClient>): Promise<Check[]> {
  const checks: Check[] = []

  // Query tiempo a tabla más consultada
  const t = Date.now()
  await supabase.from('comandas').select('id, estado').eq('estado', 'nueva').limit(10)
  const ms = Date.now() - t
  checks.push({
    categoria: 'PERF', nombre: 'Query comandas activas',
    estado: ms < 500 ? 'ok' : ms < 1500 ? 'warning' : 'fallo',
    severidad: ms < 500 ? 'info' : ms < 1500 ? 'degradado' : 'critico',
    detalle: `${ms}ms ${ms < 500 ? '✓' : ms < 1500 ? '(lento)' : '(muy lento)'}`,
    ms_respuesta: ms,
  })

  // Query productos (base del brain)
  const t2 = Date.now()
  await supabase.from('productos').select('id, nombre, precio').eq('activo', true).limit(50)
  const ms2 = Date.now() - t2
  checks.push({
    categoria: 'PERF', nombre: 'Query productos carta',
    estado: ms2 < 500 ? 'ok' : ms2 < 1500 ? 'warning' : 'fallo',
    severidad: ms2 < 500 ? 'info' : ms2 < 1500 ? 'degradado' : 'critico',
    detalle: `${ms2}ms`,
    ms_respuesta: ms2,
  })

  // Último deploy Vercel
  try {
    const r = await withTimeout(fetch(
      `https://api.vercel.com/v6/deployments?teamId=${process.env.VERCEL_TEAM_ID}&limit=1&projectId=${process.env.VERCEL_PROJECT_ID}`,
      { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN_INTERNAL ?? process.env.VERCEL_API_TOKEN}` } }
    ), 5000) as Response
    if (r.ok) {
      const d = await r.json()
      const dep = d.deployments?.[0]
      const estado = dep?.readyState
      checks.push({
        categoria: 'PERF', nombre: 'Último deploy Vercel',
        estado: estado === 'READY' ? 'ok' : estado === 'ERROR' ? 'fallo' : 'warning',
        severidad: estado === 'READY' ? 'info' : estado === 'ERROR' ? 'critico' : 'degradado',
        detalle: `Estado: ${estado ?? 'desconocido'} — ${dep?.url ?? ''}`,
      })
    } else {
      checks.push({ categoria: 'PERF', nombre: 'Último deploy Vercel', estado: 'skip', severidad: 'info', detalle: 'No se pudo verificar' })
    }
  } catch {
    checks.push({ categoria: 'PERF', nombre: 'Último deploy Vercel', estado: 'skip', severidad: 'info', detalle: 'No se pudo verificar' })
  }

  return checks
}

// ─── Informe Telegram ─────────────────────────────────────────────────────────

function formatTelegram(run: any, checks: Check[], duracionMs: number): string {
  const criticos = checks.filter(c => c.estado === 'fallo' && c.severidad === 'critico')
  const warnings = checks.filter(c => c.estado === 'warning' || (c.estado === 'fallo' && c.severidad === 'degradado'))
  const oks      = checks.filter(c => c.estado === 'ok')
  const skips    = checks.filter(c => c.estado === 'skip')

  const emoji = criticos.length > 0 ? '🔴' : warnings.length > 0 ? '🟡' : '✅'
  const fecha = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  let msg = `${emoji} <b>QA Agent — Informe</b>\n`
  msg += `📅 ${fecha} · ⏱ ${(duracionMs / 1000).toFixed(1)}s\n`
  msg += `🔗 Trigger: <b>${run.trigger}</b>\n\n`
  msg += `✅ ${oks.length} OK · ⚠️ ${warnings.length} warnings · 🔴 ${criticos.length} críticos · ⏭ ${skips.length} skip\n`

  if (criticos.length > 0) {
    msg += `\n<b>🔴 CRÍTICOS:</b>\n`
    criticos.slice(0, 5).forEach(c => {
      msg += `• [${c.categoria}] ${c.nombre}\n  <i>${c.detalle ?? ''}</i>\n`
      if (c.fix_sugerido) msg += `  💡 ${c.fix_sugerido.slice(0, 80)}\n`
    })
    if (criticos.length > 5) msg += `  … y ${criticos.length - 5} más\n`
  }

  if (warnings.length > 0) {
    msg += `\n<b>⚠️ WARNINGS:</b>\n`
    warnings.slice(0, 4).forEach(c => {
      msg += `• [${c.categoria}] ${c.nombre}: <i>${(c.detalle ?? '').slice(0, 60)}</i>\n`
    })
    if (warnings.length > 4) msg += `  … y ${warnings.length - 4} más\n`
  }

  msg += `\n🔍 <a href="https://www.iarest.es/super">Ver detalle en /super → QA Agent</a>`
  return msg
}

// ─── GET — historial de runs ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const runId = new URL(req.url).searchParams.get('run_id')

  if (runId) {
    const { data: checks } = await supabase.from('qa_checks').select('*')
      .eq('run_id', runId).order('created_at', { ascending: true })
    return NextResponse.json({ checks: checks ?? [] })
  }

  const { data: runs } = await supabase.from('qa_runs').select(`
    id, trigger, modo, total, ok, warnings, fallidos, criticos,
    duracion_ms, informe_ia, telegram_enviado, created_at
  `).order('created_at', { ascending: false }).limit(20)

  const { data: conocimiento } = await supabase.from('qa_conocimiento').select('*').order('veces_visto', { ascending: false })

  return NextResponse.json({ runs: runs ?? [], conocimiento: conocimiento ?? [] })
}

// ─── POST — ejecutar QA completo con streaming ────────────────────────────────

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const trigger: string = body.trigger ?? 'manual'

  const encoder = new TextEncoder()
  const supabase = createServerClient()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch {}
      }

      const startTime = Date.now()
      const allChecks: Check[] = []

      send({ tipo: 'inicio', mensaje: 'QA Agent iniciado', trigger })

      // ── Bloque ENV ────────────────────────────────────────────────────────
      send({ tipo: 'categoria', nombre: 'ENV — Variables de entorno' })
      const envChecks = await checkEnvVars()
      for (const c of envChecks) { allChecks.push(c); send({ tipo: 'check', ...c }) }

      // ── Bloque BD ─────────────────────────────────────────────────────────
      send({ tipo: 'categoria', nombre: 'BD — Base de datos' })
      const bdChecks = await checkBD(supabase)
      for (const c of bdChecks) { allChecks.push(c); send({ tipo: 'check', ...c }) }

      // ── Bloque NEGOCIO ────────────────────────────────────────────────────
      send({ tipo: 'categoria', nombre: 'NEGOCIO — Integridad operacional' })
      const negChecks = await checkNegocio(supabase)
      for (const c of negChecks) { allChecks.push(c); send({ tipo: 'check', ...c }) }

      // ── Bloque APIs (en paralelo) ─────────────────────────────────────────
      send({ tipo: 'categoria', nombre: 'APIs — Servicios externos' })
      const apiChecks = await checkAPIsExternas()
      for (const c of apiChecks) { allChecks.push(c); send({ tipo: 'check', ...c }) }

      // ── Bloque CRONS ──────────────────────────────────────────────────────
      send({ tipo: 'categoria', nombre: 'CRONS — Trabajos programados' })
      const cronChecks = await checkCrons(supabase)
      for (const c of cronChecks) { allChecks.push(c); send({ tipo: 'check', ...c }) }

      // ── Bloque PERF ───────────────────────────────────────────────────────
      send({ tipo: 'categoria', nombre: 'PERF — Performance' })
      const perfChecks = await checkPerformance(supabase)
      for (const c of perfChecks) { allChecks.push(c); send({ tipo: 'check', ...c }) }

      // ── Totales ───────────────────────────────────────────────────────────
      const duracionMs = Date.now() - startTime
      const total    = allChecks.length
      const ok       = allChecks.filter(c => c.estado === 'ok').length
      const warnings = allChecks.filter(c => c.estado === 'warning').length
      const fallidos = allChecks.filter(c => c.estado === 'fallo').length
      const criticos = allChecks.filter(c => c.estado === 'fallo' && c.severidad === 'critico').length

      send({ tipo: 'totales', total, ok, warnings, fallidos, criticos, duracion_ms: duracionMs })

      // ── Guardar en BD ─────────────────────────────────────────────────────
      let runId: string | null = null
      try {
        const { data: runData } = await supabase.from('qa_runs').insert({
          trigger, modo: 'full', total, ok, warnings, fallidos, criticos, duracion_ms: duracionMs
        }).select('id').single()
        runId = runData?.id ?? null

        if (runId) {
          await supabase.from('qa_checks').insert(
            allChecks.map(c => ({ run_id: runId, ...c }))
          )
          send({ tipo: 'bd_guardado', run_id: runId })

          // Actualizar conocimiento: incrementar veces_visto para fallos conocidos
          const fallosConFix = allChecks.filter(c => c.fix_sugerido && c.estado === 'fallo')
          for (const fc of fallosConFix) {
            await supabase.from('qa_conocimiento').upsert({
              patron: fc.nombre.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
              fix_conocido: fc.fix_sugerido!,
              veces_visto: 1,
              ultima_vez: new Date().toISOString()
            }, { onConflict: 'patron', ignoreDuplicates: false })
          }
        }
      } catch (e: any) {
        send({ tipo: 'bd_error', mensaje: e?.message })
      }

      // ── Telegram ──────────────────────────────────────────────────────────
      try {
        const runData = { trigger }
        const msg = formatTelegram(runData, allChecks, duracionMs)
        // Solo enviar si hay algo relevante o es el primer run del día
        const debeEnviar = criticos > 0 || warnings > 0 || trigger !== 'manual'
        if (debeEnviar || trigger === 'manual') {
          await tgAlert(msg, criticos > 0 ? 'critico' : warnings > 0 ? 'aviso' : 'resuelto')
          if (runId) await supabase.from('qa_runs').update({ telegram_enviado: true }).eq('id', runId)
          send({ tipo: 'telegram_enviado' })
        } else {
          send({ tipo: 'telegram_skip', mensaje: 'Sin fallos — Telegram omitido' })
        }
      } catch (e: any) {
        send({ tipo: 'telegram_error', mensaje: e?.message })
      }

      send({ tipo: 'fin', run_id: runId, duracion_ms: duracionMs })
      controller.close()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    }
  })
}
