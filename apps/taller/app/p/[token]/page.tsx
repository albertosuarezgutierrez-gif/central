import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { conTaller } from '@/lib/db'
import { configDe } from '@/lib/contexto'
import { casillasPendientes, tallerDeToken, vistaPorToken, type TxPresupuestos } from '@/lib/presupuestos'
import { textoAsegura } from '@/lib/consentimientos'
import { Cabecera } from '../../_marca'
import { TablaPresupuesto } from '../../_presupuesto'
import { AceptarCliente } from './AceptarCliente'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Tu presupuesto', robots: { index: false, follow: false } }

/** Página PÚBLICA del presupuesto. Sin login: token inválido o desconocido → 404. */
export default async function Pagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const tallerId = tallerDeToken(token)
  if (!tallerId) notFound()
  const datos = await conTaller(tallerId, async (tx) => {
    const ahora = new Date()
    const v = await vistaPorToken(tx as unknown as TxPresupuestos, tallerId, token, ahora)
    if (!v.ok) return null
    const config = await configDe(tx, tallerId)
    const pend = await casillasPendientes(tx as unknown as TxPresupuestos, tallerId, v.presupuesto.clienteId, ahora)
    return { v, config, pend }
  })
  if (!datos || !datos.v.ok) notFound()
  const { v, config, pend } = datos
  const p = v.presupuesto
  return (
    <>
      <Cabecera />
      <main className="contenido">
        <h1>Tu presupuesto · {v.vehiculo?.matricula ?? ''}</h1>
        <TablaPresupuesto lineas={v.lineas} baseCent={p.baseCent} cuotaIvaCent={p.cuotaIvaCent} totalCent={p.totalCent} />
        {p.caducaEn && <p className="tenue">Válido hasta el {p.caducaEn.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })}.</p>}
        {config?.textos.condicionesPresupuesto && <p className="pie-resguardo">{config.textos.condicionesPresupuesto}</p>}
        {v.estado === 'abierto' ? (
          <AceptarCliente
            token={token}
            textoAsegura={pend.asegura ? textoAsegura().texto : null}
            textoTaller={pend.taller ? (config?.textos.textoConsentimientoComercialTaller ?? null) : null}
          />
        ) : (
          <p className="tenue" role="status">
            {v.estado === 'aceptado' ? 'Este presupuesto ya fue aceptado. Gracias.'
              : v.estado === 'rechazado' ? 'Este presupuesto fue rechazado.' : 'Este presupuesto ha caducado. Pide uno nuevo al taller.'}
          </p>
        )}
      </main>
    </>
  )
}
