import Link from 'next/link'
import { notFound } from 'next/navigation'

import { responderMiContrato } from '@/lib/inquilino/inquilino-api'
import { puertosInquilino } from '@/lib/inquilino/inquilino-bd'
import { eur } from '@/lib/dinero'
import { getIdentidad } from '@/lib/session'

import { EntrarConCodigo } from '../../invitacion/[token]/Invitacion'
import { MiAlquiler, type DatosMiAlquiler } from './MiAlquiler'

export const dynamic = 'force-dynamic'

const fechaEs = (f: string | null) => (f ? f.split('-').reverse().join('/') : null)

/**
 * El contrato del inquilino. 🚨 El `contratoId` de la URL es una PETICIÓN: `responderMiContrato` lo busca DENTRO de los accesos
 * vivos de la identidad de la cookie; otro contrato, uno revocado o uno inexistente = la misma 404.
 */
export default async function MiAlquilerContratoPage({ params }: { params: Promise<{ contratoId: string }> }) {
  const { contratoId } = await params
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
  const r = await responderMiContrato(puertosInquilino(identidad.id), contratoId)
  if (r.status !== 200) notFound()
  const d = r.body as unknown as DatosMiAlquiler
  const v = d.vista

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '2rem 1rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      <section className="seccion">
        <h1 style={{ fontSize: '1.5rem', marginTop: 0, overflowWrap: 'anywhere' }}>{v.inmueble ?? 'Mi contrato de alquiler'}</h1>
        <p className="suave" style={{ marginTop: 0 }}>Tu propietario se presenta como: <strong>{v.contacto}</strong></p>
        <dl style={{ display: 'grid', gap: 8, margin: 0 }}>
          <div>
            <dt className="suave">Renta mensual</dt>
            <dd style={{ margin: 0 }}>{v.rentaMensualCent === null ? 'No consta' : `${eur(v.rentaMensualCent / 100)} al mes`}</dd>
          </div>
          <div>
            <dt className="suave">Inicio</dt>
            <dd style={{ margin: 0 }}>{fechaEs(v.inicio) ?? 'No consta'}</dd>
          </div>
          <div>
            <dt className="suave">{v.terminadoEn ? 'Terminado el' : 'Fin pactado'}</dt>
            <dd style={{ margin: 0 }}>{fechaEs(v.terminadoEn ?? v.fin) ?? 'No consta'}</dd>
          </div>
          {v.seguro && (
            <div>
              <dt className="suave">Seguro de hogar del inquilino</dt>
              <dd style={{ margin: 0 }}>
                {v.seguro.exigido === true ? 'El contrato lo exige' : v.seguro.exigido === false ? 'El contrato no lo exige' : 'No consta si lo exige'}
                {v.seguro.venceRecibo ? ` · recibo hasta el ${fechaEs(v.seguro.venceRecibo)}` : ''}
              </dd>
            </div>
          )}
        </dl>
      </section>
      <MiAlquiler contratoId={contratoId} datos={d} />
      <p style={{ margin: 0, fontSize: 14 }}>
        <Link href="/mi-alquiler">Mis contratos</Link>
      </p>
    </main>
  )
}
