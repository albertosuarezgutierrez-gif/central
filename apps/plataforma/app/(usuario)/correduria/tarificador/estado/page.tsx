import Link from 'next/link'
import { Activity } from 'lucide-react'
import { PageHeader, Pagina } from '@/components/ui'
import EstadoBots from './EstadoBots'

export const dynamic = 'force-dynamic'

/**
 * ESTADO DE LOS BOTS del tarificador RPA (15/10/2026): por compañía × ramo × versión del bot, en los últimos 7 y 30 días,
 * cuántos trabajos hubo, cuántos acabaron con precio, cuántos se atascaron o fallaron, cuánto tardan y dónde se atascan.
 * Datos por `/api/correduria/tarificador/estadisticas` → puerto de operador de asegura. Solo agregados: nada del cliente.
 */
export default function EstadoBotsPage() {
  return (
    <Pagina ancho="tabla">
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div>
          <Link href="/correduria/tarificador" style={{ fontSize: 13, color: 'var(--muted)' }}>← Tarificador</Link>
          <PageHeader
            titulo="Estado de los bots"
            icono={<Activity size={20} strokeWidth={1.75} />}
            sub={<>Cómo le va a cada bot por compañía, ramo y versión: cuántas veces saca precio, cuántas se para y cuánto tarda.</>}
          />
        </div>
        <EstadoBots />
      </div>
    </Pagina>
  )
}
