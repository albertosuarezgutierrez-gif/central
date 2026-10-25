import Link from 'next/link'
import { redirect } from 'next/navigation'

import { responderMisContratos } from '@/lib/inquilino/inquilino-api'
import { puertosInquilino } from '@/lib/inquilino/inquilino-bd'
import { getIdentidad } from '@/lib/session'

import { EntrarConCodigo } from '../invitacion/[token]/Invitacion'

export const dynamic = 'force-dynamic'

/** Los contratos que ESTA identidad ve como inquilino (accesos vivos). Uno solo → directo a él. */
export default async function MiAlquilerPage() {
  const identidad = await getIdentidad()
  if (identidad === null) {
    return (
      <main style={{ maxWidth: 420, margin: '0 auto', padding: '2rem 1rem' }}>
        <div className="seccion">
          <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>Mi alquiler</h1>
          <p className="suave" style={{ marginTop: 0 }}>Entra con tu correo: te mandamos un código de un solo uso.</p>
          <EntrarConCodigo />
        </div>
      </main>
    )
  }
  const r = await responderMisContratos(puertosInquilino(identidad.id))
  const contratos = (r.body.contratos ?? []) as Array<{ contratoId: string; inmueble: string | null }>
  if (contratos.length === 1) redirect(`/mi-alquiler/${contratos[0].contratoId}`)
  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: '2rem 1rem' }}>
      <div className="seccion">
        <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>Mi alquiler</h1>
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
      </div>
    </main>
  )
}
