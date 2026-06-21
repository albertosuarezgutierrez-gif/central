// /api/webhook/deploy-aprendizaje
// Vercel llama aquí tras cada deploy exitoso.
// NIM analiza el commit y propone un nuevo patrón de error si detecta un fix.
// El patrón queda en 'pendiente' hasta que Alberto lo aprueba por Telegram.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callAI, cleanJSON } from '@/lib/ai-client'

const WEBHOOK_SECRET = process.env.VERCEL_DEPLOY_WEBHOOK_SECRET || ''

export async function POST(req: NextRequest) {
  // Verificar secret
  const secret = req.headers.get('x-webhook-secret') || new URL(req.url).searchParams.get('secret')
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const commitMsg: string = body.deployment?.meta?.githubCommitMessage || body.meta?.githubCommitMessage || ''
  const commitSha: string = body.deployment?.meta?.githubCommitSha || body.meta?.githubCommitSha || ''
  const deployState: string = body.type || ''

  // Solo procesar deploys exitosos
  if (deployState && deployState !== 'deployment.succeeded') {
    return NextResponse.json({ ok: true, skip: 'no es deploy exitoso' })
  }

  // Solo procesar commits de fix o feat relevantes
  const esFix = /^(fix|hotfix|bug|corr)/i.test(commitMsg)
  const esFeat = /^feat/i.test(commitMsg)
  if (!esFix && !esFeat) {
    return NextResponse.json({ ok: true, skip: 'commit sin fix ni feat' })
  }

  // NIM analiza el commit y genera un patrón de QA
  const system = `Eres el sistema de QA de ia.rest. Analizas commits de fix para generar checks de regresión.
ia.rest usa: Next.js, Supabase (PostgreSQL), Vercel, Telegram bot.
Tablas principales: leads, comandas, personal, turnos, print_jobs, propuestas.
Responde SOLO JSON válido.`

  const prompt = `Commit: "${commitMsg}"
SHA: ${commitSha.substring(0, 8)}

Este commit corrige un error. Genera un check de QA para detectar si ese error vuelve a ocurrir.

El check debe ser una query SQL SELECT que devuelva filas cuando el problema existe.
Si el error no es detectable via SQL (es un bug de código puro), devuelve query_sql = "SELECT 1 WHERE false".

JSON exacto:
{
  "nombre": "nombre corto del check (máx 60 chars)",
  "descripcion": "qué error corrige y por qué puede volver a ocurrir",
  "categoria": "CRM|AUTH|TELEGRAM|NEGOCIO|INFRA|CÓDIGO",
  "severidad": "critico|degradado|info",
  "query_sql": "SELECT id, COALESCE(empresa, nombre, 'Lead') as empresa FROM leads WHERE ... (o SELECT 1 WHERE false si no aplica SQL)",
  "mensaje_fallo": "Descripción del fallo con {count} y {empresas} como placeholders",
  "fix_sugerido": "Cómo resolverlo si vuelve a pasar",
  "relevante": true
}`

  let patron: Record<string, unknown> | null = null
  try {
    const raw = await callAI(system, prompt, 600, 25000)
    patron = JSON.parse(cleanJSON(raw))
  } catch (e) {
    console.error('[deploy-aprendizaje] Error NIM:', e)
    return NextResponse.json({ ok: true, skip: 'NIM falló' })
  }

  if (!patron || !patron.relevante || !patron.nombre) {
    return NextResponse.json({ ok: true, skip: 'NIM considera no relevante' })
  }

  const supabase = createServerClient()

  // Comprobar si ya existe un patrón con nombre similar
  const { data: existente } = await supabase
    .from('qa_patrones_error')
    .select('id')
    .ilike('nombre', `%${(patron.nombre as string).substring(0, 30)}%`)
    .maybeSingle()

  if (existente) {
    return NextResponse.json({ ok: true, skip: 'patrón similar ya existe' })
  }

  // Guardar como pendiente
  const { data: nuevo, error } = await supabase
    .from('qa_patrones_error')
    .insert({
      nombre: patron.nombre,
      descripcion: patron.descripcion,
      categoria: patron.categoria || 'APRENDIDO',
      severidad: patron.severidad || 'degradado',
      query_sql: patron.query_sql,
      mensaje_fallo: patron.mensaje_fallo || `{count} incidencia(s) detectada(s): {empresas}`,
      fix_sugerido: patron.fix_sugerido,
      estado: 'pendiente',
      commit_origen: commitMsg.substring(0, 200),
    })
    .select('id')
    .single()

  if (error) {
    console.error('[deploy-aprendizaje] Error BD:', error)
    return NextResponse.json({ ok: false, error: error.message })
  }

  // Avisar a Telegram con botones de aprobación
  const tgToken = process.env.TELEGRAM_BOT_TOKEN
  const tgChat = process.env.TELEGRAM_CHAT_ID
  if (tgToken && tgChat && nuevo) {
    await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: tgChat,
        parse_mode: 'HTML',
        text: [
          `🧠 <b>QA aprendió de un fix</b>`,
          ``,
          `📝 Commit: <i>${commitMsg.substring(0, 80)}</i>`,
          ``,
          `<b>${patron.nombre}</b>`,
          `${(patron.descripcion as string).substring(0, 150)}`,
          ``,
          `🔍 Query: <code>${(patron.query_sql as string).substring(0, 100)}...</code>`,
          `⚠️ Si falla: ${(patron.mensaje_fallo as string).substring(0, 80)}`,
          ``,
          `¿Activo este check permanentemente?`,
        ].join('\n'),
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Activar', callback_data: `qa_activar:${nuevo.id}` },
            { text: '❌ Descartar', callback_data: `qa_descartar:${nuevo.id}` },
          ]]
        }
      }),
    }).catch(console.error)
  }

  return NextResponse.json({ ok: true, patron_id: nuevo?.id, nombre: patron.nombre })
}
