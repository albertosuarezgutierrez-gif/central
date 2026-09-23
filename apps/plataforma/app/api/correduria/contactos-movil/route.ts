import { NextRequest, NextResponse } from 'next/server'
import { libroVcard } from '@central/module-seguros'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { contactosMovilAsegura, interpretarContactosMovil } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'

/**
 * GET /api/correduria/contactos-movil — el .vcf con los clientes en vigor y los
 * leads de Vencimientos, para importarlo en el ALMACENAMIENTO DEL TELÉFONO (no
 * en la cuenta de Google: es un Gmail personal). Cada contacto dice en su
 * nombre si es cliente o lead. Si asegura no responde no se genera un fichero
 * vacío: 502, que se importaría como «no tienes a nadie».
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await contactosMovilAsegura()
  const datos = interpretarContactosMovil(r.status, r.json)
  if (!datos) return NextResponse.json({ estado: 'error', motivo: `No se han podido leer los contactos (HTTP ${r.status}).` }, { status: 502 })
  const origen = new URL(req.url).origin
  const hoy = new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' })
  const { vcf, incluidos, sinCanal } = libroVcard(datos.contactos, {
    urlFicha: id => `${origen}/correduria/cliente/${id}`,
    fecha: hoy,
  })
  const clientes = datos.contactos.filter(c => c.grupo === 'cliente').length
  return new NextResponse(vcf, {
    headers: {
      'content-type': 'text/vcard; charset=utf-8',
      'content-disposition': `attachment; filename="grupo-asegura-contactos-${hoy.split('/').reverse().join('-')}.vcf"`,
      'cache-control': 'no-store',
      'x-incluidos': String(incluidos),
      'x-sin-canal': String(sinCanal),
      'x-clientes': String(clientes),
      'x-clientes-sin-leer': String(datos.clientesSinLeer),
    },
  })
}
