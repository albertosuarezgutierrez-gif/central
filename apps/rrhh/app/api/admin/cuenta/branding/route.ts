import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { actualizarBranding, getBranding } from '@/lib/empresa'
import { subirObjeto } from '@/lib/storage'
import { esHexValido, normalizaHex } from '@/lib/branding'

const MAX_LOGO = 2 * 1024 * 1024 // 2 MB
const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/gif': 'gif',
}

/** El gestor define la marca corporativa de su empresa: color + logo (multipart). */
export async function POST(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const fd = await req.formData()

    const colorRaw = fd.get('color')
    if (typeof colorRaw === 'string' && colorRaw.trim()) {
      if (!esHexValido(colorRaw)) return NextResponse.json({ error: 'Color no válido (usa #rrggbb)' }, { status: 400 })
      await actualizarBranding(empresa_id, { color_primario: normalizaHex(colorRaw) })
    } else if (colorRaw === '') {
      await actualizarBranding(empresa_id, { color_primario: null }) // restablecer al color de la casa
    }

    if (fd.get('quitar_logo') === '1') {
      await actualizarBranding(empresa_id, { logo_path: null })
    }

    const file = fd.get('file')
    if (file instanceof File && file.size > 0) {
      const ext = EXT[file.type]
      if (!ext) return NextResponse.json({ error: 'Formato no soportado (PNG, JPG, SVG o WebP)' }, { status: 400 })
      if (file.size > MAX_LOGO) return NextResponse.json({ error: 'El logo supera 2 MB' }, { status: 400 })
      const path = `branding/${empresa_id}/logo-${Date.now()}.${ext}`
      await subirObjeto(path, await file.arrayBuffer(), file.type)
      await actualizarBranding(empresa_id, { logo_path: path })
    }

    return NextResponse.json({ ok: true, branding: await getBranding(empresa_id) })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    console.error('[branding] fallo:', e)
    return NextResponse.json({ error: 'No se pudo guardar la marca' }, { status: 500 })
  }
}
