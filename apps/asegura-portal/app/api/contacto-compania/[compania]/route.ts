import { telefonoVerificadoPorNombre, vcardCompania } from '@central/module-seguros'

// «Guardar en contactos» desde el parte de siniestro: la misma tarjeta que da la
// web pública, del mismo catálogo verificado. Sin sesión a propósito: son los
// teléfonos públicos de la compañía, no datos del cliente. 404 para una compañía
// sin verificar, igual que el bloque de la pantalla (que dice «pídenoslo»).

export async function GET(_req: Request, { params }: { params: Promise<{ compania: string }> }) {
  const { compania } = await params
  const c = telefonoVerificadoPorNombre(decodeURIComponent(compania))
  if (c === null) return new Response('No encontrado', { status: 404 })
  return new Response(vcardCompania(c), {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `attachment; filename="${c.slug}-siniestros.vcf"`,
      'Cache-Control': 'public, max-age=3600',
      'X-Robots-Tag': 'noindex',
    },
  })
}
