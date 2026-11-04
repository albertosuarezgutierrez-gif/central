import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { conTaller, tallerPorEnlaceLimitado } from '@/lib/db'
import { configDe } from '@/lib/contexto'
import { ipDeCabecera } from '@/lib/ip'
import { tallerDeToken } from '@/lib/presupuestos'
import { serviciosOfrecidos, vistaInvitacion, type TxCitas } from '@/lib/citas'
import { textoAsegura } from '@/lib/consentimientos'
import { Cabecera } from '../../_marca'
import { ReservaCliente } from './ReservaCliente'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Pide tu cita', robots: { index: false, follow: false } }

/** Página PÚBLICA de reserva. Sin login: token inválido, caducado, usado o IP bloqueada → 404 sin pistas. */
export default async function Pagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!tallerDeToken(token)) notFound()
  const h = await headers()
  const ahora = new Date()
  const tallerId = await tallerPorEnlaceLimitado(token, ipDeCabecera(h.get('x-forwarded-for')), ahora)
  if (!tallerId) notFound()
  const datos = await conTaller(tallerId, async (tx) => {
    const v = await vistaInvitacion(tx as unknown as TxCitas, tallerId, token, ahora)
    const config = await configDe(tx, tallerId)
    return v && config ? { v, config } : null
  })
  if (!datos) notFound()
  const { v, config } = datos
  return (
    <>
      <Cabecera tallerId={tallerId} />
      <main className="contenido">
        <h1>Pide tu cita</h1>
        <p className="tenue">
          Escribe la matrícula, elige el servicio y un hueco libre. {config.agenda.confirmacion === 'manual'
            ? 'El taller revisará tu petición y te confirmará la cita.' : 'Tu cita quedará confirmada al instante.'}
        </p>
        {config.horarioCitas.franjas.length === 0 ? (
          <p className="tenue" role="status">El taller aún no ha abierto su agenda. Llámanos para pedir cita.</p>
        ) : (
          <ReservaCliente
            token={token}
            inicial={{ nombre: v.nombre, correo: v.correo ?? '', matricula: v.matricula ?? '' }}
            servicios={serviciosOfrecidos(config)}
            textoAsegura={textoAsegura().texto}
            textoTaller={config.textos.textoConsentimientoComercialTaller}
          />
        )}
      </main>
    </>
  )
}
