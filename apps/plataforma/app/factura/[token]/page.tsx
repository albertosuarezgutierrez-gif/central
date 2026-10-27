import type { Metadata } from 'next'
import { TEXTO_YA_RECIBIDA, tokenConForma } from '@/lib/sivra/facturas/enlace'
import { vistaPublica } from '@/lib/sivra/facturas/servicio'
import FormularioPublico from './FormularioPublico'

// /factura/<token> — formulario PÚBLICO (sin login) para que el huésped deje sus datos fiscales. Exento del gate de
// sesión en `middleware.ts` (prefijo '/factura/'). Lo que se le enseña de la reserva: el piso y las fechas. Nada más
// (ni importes, ni su nombre, ni datos ya enviados: el enlace puede reenviarse).
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Datos de facturación', robots: { index: false, follow: false } }

const caja: React.CSSProperties = { maxWidth: 640, margin: '0 auto', padding: '24px 16px 48px', boxSizing: 'border-box' }
const fecha = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—')

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const v = tokenConForma(token) ? await vistaPublica(token) : ({ estado: 'no_valida' } as const)
  if (v.estado !== 'ok') {
    return (
      <main style={caja}>
        <h1 style={{ fontSize: 22 }}>{v.estado === 'caducada' ? 'Enlace caducado / Link expired' : 'Enlace no válido / Invalid link'}</h1>
        <p>Escríbenos por el chat de tu reserva y te enviamos uno nuevo. / Please message us through your booking and we will send you a new one.</p>
      </main>
    )
  }
  return (
    <main style={caja}>
      <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>Datos de facturación / Invoicing details</h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 20px' }}>{v.piso} · {fecha(v.desde)} → {fecha(v.hasta)}</p>
      {v.emitida
        ? <p>Tu factura ya está emitida y enviada por correo. Si necesitas cambiar algo, escríbenos. / Your invoice has already been issued and emailed. If something needs changing, please message us.</p>
        : v.completada
          ? <p role="status">{TEXTO_YA_RECIBIDA}</p>
          : <FormularioPublico token={token} />}
    </main>
  )
}
