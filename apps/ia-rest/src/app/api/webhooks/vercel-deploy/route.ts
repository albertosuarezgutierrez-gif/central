import { NextRequest, NextResponse } from 'next/server'
import { runQA } from '@/lib/qa-runner'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  // Verificar firma Vercel webhook (header x-vercel-signature)
  const signature = req.headers.get('x-vercel-signature')
  const secret = process.env.VERCEL_WEBHOOK_SECRET
  if (secret && signature) {
    const body = await req.text()
    const { createHmac } = await import('crypto')
    const expected = createHmac('sha1', secret).update(body).digest('hex')
    if (signature !== expected) {
      return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
    }
    const payload = JSON.parse(body)
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
  } else {
    // Sin secret configurado: aceptar pero loguear
    console.warn('[vercel-deploy webhook] Sin VERCEL_WEBHOOK_SECRET — aceptando sin verificar')
  }

  // Ejecutar QA en background (no bloqueante para el webhook)
  runQA('post_deploy').catch(e => console.error('[QA post-deploy]', e))

  return NextResponse.json({ ok: true, trigger: 'post_deploy', mensaje: 'QA Agent iniciado' })
}
