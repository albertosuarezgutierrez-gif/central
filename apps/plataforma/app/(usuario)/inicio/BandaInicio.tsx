import { getSession } from '@/lib/session'
import { listarIngresosPorRevisar, listarPorRevisar, getDuplicadosSospechosos } from '@/lib/banca'
import { getEstadoFeedPsd2 } from '@/lib/psd2-estado'
import { listarPendientes } from '@/lib/agente-facturas/pendientes'
import type { EstadoInicio } from '@/lib/inicio-acciones'
import HoyAccionable from '../banca/HoyAccionable'

// La banda «Pide acción hoy» de siempre (lógica en lib/inicio-acciones.ts). Las pólizas van
// `en_tarjeta`: las pinta la tarjeta de Correduría y aquí se repetirían.
export default async function BandaInicio() {
  const session = await getSession()
  if (!session) return null
  const cuenta = <T,>(p: Promise<T[]>) => p.then(l => l.length).catch(() => null)
  const [porRevisar, ingresos, duplicados, facturas, feed] = await Promise.all([
    cuenta(listarPorRevisar(session.id)),
    cuenta(listarIngresosPorRevisar(session.id)),
    cuenta(getDuplicadosSospechosos(session.id)),
    cuenta(listarPendientes()),
    getEstadoFeedPsd2(session.id).catch(() => undefined),
  ])
  const horasDesdeBanco: EstadoInicio['horasDesdeBanco'] =
    feed === undefined ? null
      : feed === null ? 'no_aplica'
      : !feed.ultimoSync ? null
      : (Date.now() - new Date(feed.ultimoSync).getTime()) / 3_600_000
  return (
    <HoyAccionable estado={{
      porRevisar, ingresosPorRevisar: ingresos, duplicados, facturasPendientes: facturas,
      horasDesdeBanco, polizas: { estado: 'en_tarjeta' },
    }} />
  )
}
