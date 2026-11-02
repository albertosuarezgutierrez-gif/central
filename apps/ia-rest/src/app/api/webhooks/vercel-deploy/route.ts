import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { runQA } from '@/lib/qa-runner'

export const maxDuration = 60

function firmaValida(body: string, signature: string, secret: string): boolean {
  // Vercel firma el cuerpo con HMAC-SHA1 (cabecera x-vercel-signature). Tiempo constante.
  const esperado = createHmac('sha1', secret).update(body).digest('hex')
  const a = Buffer.from(signature, 'utf8')
  const b = Buffer.from(esperado, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  // FAIL-CLOSED: sin secreto configurado o sin cabecera de firma → 401 (antes, omitir
  // la cabecera saltaba toda la verificación y disparaba runQA).
  const signature = req.headers.get('x-vercel-signature')
  const secret = process.env.VERCEL_WEBHOOK_SECRET
  if (!secret || !signature) {
    return NextResponse.json({ error: 'Firma requerida' }, { status: 401 })
  }
  const body = await req.text()
  if (!firmaValida(body, signature, secret)) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }
  let payload: { type?: string; payload?: { deployment?: { state?: string }; readyState?: string; name?: string; project?: { name?: string } } }
  try { payload = JSON.parse(body) } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  // Solo actuar en deployments exitosos del proyecto ia-rest
  const tipo = payload?.type
  const estado = payload?.payload?.deployment?.state ?? payload?.payload?.readyState
  const proyecto = payload?.payload?.name ?? payload?.payload?.project?.name ?? ''
  if (tipo !== 'deployment.succeeded' && estado !== 'READY') {
    return NextResponse.json({ ok: true, skipped: true, razon: `tipo=${tipo} estado=${estado}` })
  }
  if (proyecto && !proyecto.includes('ia-rest')) {
    return NextResponse.json({ ok: true, skipped: true, razon: `proyecto=${proyecto}` })
  }

  // Ejecutar QA en background (no bloqueante para el webhook)
  runQA('post_deploy').catch(e => console.error('[QA post-deploy]', e))

  return NextResponse.json({ ok: true, trigger: 'post_deploy', mensaje: 'QA Agent iniciado' })
}
