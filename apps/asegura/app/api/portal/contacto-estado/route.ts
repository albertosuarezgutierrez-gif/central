import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { estadoContactoPropio } from '@/lib/contacto-portal'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { puentePortalAutorizado } from '@/lib/puente-portal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/portal/contacto-estado?identidadId= — lo que el portal necesita para
 * preguntarle al cliente «¿siguen igual tus datos de contacto?»: cuándo lo
 * confirmó por última vez (`nunca` / `vigente` / `caducada`) y cada dato
 * ENMASCARADO (`··· ··· 512`, `m···@gmail.com`, `Calle ···, 41003 Sevilla`).
 *
 * 🚨 No acepta `clienteId`: la ficha la resuelve asegura por `portal_vinculo`.
 * Y las máscaras se calculan AQUÍ, con la clave PII que el portal no tiene:
 * hacia fuera no cruza ningún valor entero. Por dato salen tres estados
 * (`tiene:false` / `tiene:true, mascara:null` = ilegible / con máscara), y
 * el ilegible NO se pinta como «no tienes»: le haría añadir uno que ya está.
 */
export async function GET(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const identidadId = (new URL(req.url).searchParams.get('identidadId') ?? '').trim()
    if (identidadId === '') return NextResponse.json({ estado: 'invalido', motivo: 'sin identidad' }, { status: 422 })

    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 503 })

    const r = await estadoContactoPropio(correduria.id, identidadId)
    const status = r.estado === 'ok' ? 200 : r.estado === 'error' ? 503 : 409
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', causa: registrarErrorCartera('portal/contacto-estado', e) },
      { status: 503 },
    )
  }
}
