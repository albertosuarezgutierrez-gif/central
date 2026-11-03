import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { actualizarBranding, getBranding } from '@/lib/empresa'
import { guardarLogoEmpresa } from '@/lib/logo-empresa'
import { esHexValido, normalizaHex } from '@/lib/branding'

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

    // Logo: recorte de márgenes + tamaño + PNG, y color del logo si la empresa aún no tiene (lib/logo-empresa.ts).
    const file = fd.get('file')
    if (file instanceof File && file.size > 0) {
      const r = await guardarLogoEmpresa(empresa_id, Buffer.from(await file.arrayBuffer()), file.type)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    }

    return NextResponse.json({ ok: true, branding: await getBranding(empresa_id) })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    console.error('[branding] fallo:', e)
    return NextResponse.json({ error: 'No se pudo guardar la marca' }, { status: 500 })
  }
}
