import Link from 'next/link'
import { redirect } from 'next/navigation'

import { responderMisContratos } from '@/lib/inquilino/inquilino-api'
import { puertosInquilino } from '@/lib/inquilino/inquilino-bd'
import { getIdentidad } from '@/lib/session'

import { EntrarConCodigo } from '../invitacion/[token]/Invitacion'
import { PaginaPortal } from '../PaginaPortal'
import { TarjetaPortal } from '../TarjetaPortal'

export const dynamic = 'force-dynamic'

/** Los contratos que ESTA identidad ve como inquilino (accesos vivos). Uno solo → directo a él. */
export default async function MiAlquilerPage() {
  const identidad = await getIdentidad()
  if (identidad === null) {
    return (
      <PaginaPortal suelta estrecha antetitulo="Inquilino" titulo="Mi" acento="alquiler">
        <TarjetaPortal>
          <p className="suave" style={{ marginTop: 0 }}>Entra con tu correo: te mandamos un código de un solo uso.</p>
          <EntrarConCodigo />
        </TarjetaPortal>
      </PaginaPortal>
    )
  }
  const r = await responderMisContratos(puertosInquilino(identidad.id))
  const contratos = (r.body.contratos ?? []) as Array<{ contratoId: string; inmueble: string | null }>
  if (contratos.length === 1) redirect(`/mi-alquiler/${contratos[0].contratoId}`)
  return (
    <PaginaPortal suelta estrecha antetitulo="Inquilino" titulo="Mi" acento="alquiler">
      <TarjetaPortal>
        {contratos.length === 0 ? (
          <p>
            No tienes ningún contrato de alquiler abierto en esta cuenta. Si tu propietario te ha dado un enlace, ábrelo de nuevo; si ya
            no funciona, pídele uno nuevo.
          </p>
        ) : (
          <ul style={{ paddingLeft: 18, display: 'grid', gap: 8 }}>
            {contratos.map((c) => (
              <li key={c.contratoId}>
                <Link href={`/mi-alquiler/${c.contratoId}`}>{c.inmueble ?? 'Mi contrato'}</Link>
              </li>
            ))}
          </ul>
        )}
      </TarjetaPortal>
    </PaginaPortal>
  )
}
