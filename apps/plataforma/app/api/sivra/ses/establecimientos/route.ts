// Alta y listado de establecimientos SES. Pantalla interna: sesión obligatoria.
//
// 🔐 El GET NUNCA devuelve la contraseña — `listar()` no la trae siquiera del módulo
// de acceso, así que no hay forma de filtrarla aquí por descuido.
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { listar, guardar, type EntradaAlta } from '@/lib/ses/establecimientos'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json({ establecimientos: await listar() })
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const b = (await req.json()) as Partial<EntradaAlta>
  const faltan = (['nombre', 'codigoArrendador', 'codigoEstablecimiento', 'usuario'] as const)
    .filter((k) => !String(b[k] ?? '').trim())
  if (faltan.length) {
    return NextResponse.json({ error: `Faltan campos: ${faltan.join(', ')}` }, { status: 400 })
  }
  // En un alta NUEVA la contraseña sí es obligatoria: un establecimiento sin
  // credencial no puede comunicar, y dejarlo pasar en silencio lo convierte en un
  // piso que parece dado de alta y no lo está.
  if (!b.id && !String(b.password ?? '').trim()) {
    return NextResponse.json({ error: 'Falta la contraseña del servicio web' }, { status: 400 })
  }

  const id = await guardar({
    id: b.id ?? null,
    nombre: String(b.nombre).trim(),
    propertyId: b.propertyId ? String(b.propertyId).trim() : null,
    codigoArrendador: String(b.codigoArrendador).trim(),
    codigoEstablecimiento: String(b.codigoEstablecimiento).trim(),
    usuario: String(b.usuario).trim(),
    password: b.password ? String(b.password) : null,
    entorno: b.entorno === 'pruebas' ? 'pruebas' : 'produccion',
    activo: b.activo !== false,
  })
  return NextResponse.json({ ok: true, id })
}
