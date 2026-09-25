import Link from 'next/link'
import { redirect } from 'next/navigation'
import { interpretarOportunidad, oportunidadAsegura } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'

/**
 * Una oportunidad se gestiona DENTRO de la ficha de su cliente (25/09/2026: la página aparte
 * «ocupa mucha pantalla»). Esta ruta queda solo para los enlaces que ya apuntan aquí
 * (Vencimientos, «Hoy», la tarjeta de inicio): lleva a la ficha con la oportunidad desplegada.
 */
export default async function OportunidadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await oportunidadAsegura(id)
  const lectura = interpretarOportunidad(r.status, r.json)
  if (lectura.estado === 'ok') {
    redirect(`/correduria/cliente/${encodeURIComponent(lectura.oportunidad.clienteId)}?tab=oportunidades&op=${encodeURIComponent(id)}`)
  }
  const texto = lectura.estado === 'no_encontrado' ? 'Esta oportunidad no existe o no es de la correduría.'
    : lectura.estado === 'sin_configurar' ? 'No se puede leer: falta conectar el puerto con central-asegura.'
    : `No se ha podido leer la oportunidad (${lectura.motivo}).`
  return <p style={{ fontSize: 14 }}>{texto} <Link href="/correduria/vencimientos?c=leads">Volver a Vencimientos</Link></p>
}
