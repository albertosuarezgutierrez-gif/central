import { TELEFONOS_COMPANIAS, telefonoVerificadoPorNombre, vcardCompania } from '@/lib/telefonos-companias'

// «Guardar en contactos»: la tarjeta de la compañía, generada del catálogo
// verificado. Solo existe para las verificadas (404 para el resto: una tarjeta
// con un número sin comprobar es peor que ninguna). Estática: cambia con el
// catálogo, que cambia por PR.

export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return TELEFONOS_COMPANIAS.filter((c) => telefonoVerificadoPorNombre(c.slug) !== null).map((c) => ({ slug: c.slug }))
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const c = telefonoVerificadoPorNombre(slug)
  if (c === null || c.slug !== slug) return new Response('No encontrado', { status: 404 })
  return new Response(vcardCompania(c), {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `attachment; filename="${c.slug}-siniestros.vcf"`,
      // Es un fichero para el móvil, no una página: no compite en Google con la lista.
      'X-Robots-Tag': 'noindex',
    },
  })
}
