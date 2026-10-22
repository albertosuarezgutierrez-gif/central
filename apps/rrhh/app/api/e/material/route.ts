import { NextResponse } from 'next/server'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { rateLimit } from '@/lib/rate-limit'
import { subirObjeto, borrarObjeto } from '@/lib/storage'
import { MAX_BYTES_FOTO, pathMaterial, validarAltaMaterial, validarFoto } from '@/lib/material'
import { crearMaterial, listarMaterialEmpleado } from '@/lib/material-repo'

/** Material del propio empleado (con miniatura por URL firmada de 1 h). */
export async function GET() {
  try {
    const { empresa_id, empleado_id } = await getSesionEmpleado()
    return NextResponse.json({ material: await listarMaterialEmpleado(empresa_id, empleado_id) })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}

/**
 * Sube la foto de un material (multipart: foto, tipo, nombre, nota). La empresa y el empleado salen
 * SIEMPRE de la sesión; el path lo construye el servidor. Tipo real por magic bytes, máx. 8 MB.
 */
export async function POST(req: Request) {
  try {
    const { empresa_id, empleado_id } = await getSesionEmpleado()
    if (!rateLimit(`material-subir:${empleado_id}`, 30, 60 * 60 * 1000).allowed) {
      return NextResponse.json({ error: 'Demasiadas fotos seguidas. Prueba dentro de un rato.' }, { status: 429 })
    }
    // Corte temprano antes de leer el cuerpo (margen para el sobre multipart y los campos de texto).
    const largo = Number(req.headers.get('content-length') ?? '')
    if (Number.isFinite(largo) && largo > MAX_BYTES_FOTO + 64 * 1024) {
      return NextResponse.json({ error: 'La foto pasa de 8 MB' }, { status: 413 })
    }
    const form = await req.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'Envío no válido' }, { status: 400 })
    const foto = form.get('foto')
    if (!(foto instanceof File)) return NextResponse.json({ error: 'Falta la foto' }, { status: 400 })
    const alta = validarAltaMaterial({ tipo: form.get('tipo'), nombre: form.get('nombre'), nota: form.get('nota') })
    if (!alta.ok) return NextResponse.json({ error: alta.error }, { status: 400 })
    if (foto.size > MAX_BYTES_FOTO) return NextResponse.json({ error: 'La foto pasa de 8 MB' }, { status: 413 })
    const bytes = await foto.arrayBuffer()
    const v = validarFoto(foto.type, bytes.byteLength, new Uint8Array(bytes, 0, Math.min(32, bytes.byteLength)))
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status })

    const path = pathMaterial(empresa_id, empleado_id, crypto.randomUUID(), v.ext)
    await subirObjeto(path, bytes, v.mime)
    try {
      const material = await crearMaterial(empresa_id, empleado_id, alta.datos, path)
      return NextResponse.json({ material }, { status: 201 })
    } catch (e) {
      await borrarObjeto(path) // sin fila no debe quedar foto huérfana
      throw e
    }
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
