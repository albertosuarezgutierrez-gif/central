// /api/marketing/baja — Baja de comunicaciones comerciales (1 clic, RGPD/LSSI).
// El enlace va en CADA mensaje de marketing. Revoca por responsable.
//
// GET ?token=<baja_token>&quien=bar|iarest|todo   (quien por defecto: 'todo')

import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function pagina(titulo: string, mensaje: string, ok: boolean): Response {
  const color = ok ? '#3F7D44' : '#D9442B'
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${titulo}</title>
<style>body{margin:0;background:#14110E;color:#F6F1E7;font-family:system-ui,sans-serif;
display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
.c{max-width:420px;text-align:center}.i{font-size:48px;margin-bottom:12px}
h1{font-size:20px;font-weight:600;margin:0 0 8px}p{color:#9C8E7E;font-size:14px;line-height:1.6;margin:0}
.b{display:inline-block;margin-top:20px;width:54px;height:4px;border-radius:2px;background:${color}}</style>
</head><body><div class="c"><div class="i">${ok ? '✅' : '⚠️'}</div>
<h1>${titulo}</h1><p>${mensaje}</p><div class="b"></div></div></body></html>`
  return new Response(html, { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const token = sp.get('token')
  const quien = (sp.get('quien') || 'todo').toLowerCase()

  if (!token) return pagina('Enlace no válido', 'Falta el identificador de baja.', false)

  try {
    const supabase = createServerClient()
    const { data: row } = await supabase
      .from('marketing_consentimientos')
      .select('id, consiente_bar, consiente_iarest')
      .eq('baja_token', token)
      .maybeSingle()

    if (!row) return pagina('Enlace no válido', 'Este enlace de baja ya no existe.', false)

    const ahora = new Date().toISOString()
    const patch: Record<string, unknown> = { updated_at: ahora }
    if (quien === 'bar' || quien === 'todo') { patch.consiente_bar = false; patch.revocado_bar_en = ahora }
    if (quien === 'iarest' || quien === 'todo') { patch.consiente_iarest = false; patch.revocado_iarest_en = ahora }

    await supabase.from('marketing_consentimientos').update(patch).eq('id', row.id)

    const queTexto = quien === 'bar' ? 'del restaurante'
      : quien === 'iarest' ? 'de ia.rest'
      : 'comerciales'
    return pagina('Baja confirmada', `No volverás a recibir comunicaciones ${queTexto}. Puedes volver a darte de alta cuando quieras desde el QR de la mesa.`, true)
  } catch {
    return pagina('Algo ha fallado', 'No hemos podido procesar la baja. Inténtalo de nuevo en un momento.', false)
  }
}
