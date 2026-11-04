import Link from 'next/link'
import { Gauge } from 'lucide-react'
import { PageHeader, Pagina } from '@/components/ui'
import EstadoTarificador from './EstadoTarificador'

export const dynamic = 'force-dynamic'

/**
 * ESTADO DEL TARIFICADOR (04/11/2026), solo lectura: por compañía × ramo, el último precio que se obtuvo (fecha y canal:
 * bot RPA o Avant2), cuántos trabajos del bot salieron bien o mal en 7 y 30 días, el último error resumido (solo el tipo y
 * dónde pasó, nunca valores), el estado del bot y el gasto de Avant2 del mes. Datos por `/api/correduria/tarificador/estado`
 * → puerto de operador de asegura. Solo agregados: nada del cliente.
 */
export default function EstadoTarificadorPage() {
  return (
    <Pagina ancho="tabla">
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div>
          <Link href="/correduria/tarificador" style={{ fontSize: 13, color: 'var(--muted)' }}>← Tarificador</Link>
          <Link href="/correduria/tarificador/estado" style={{ fontSize: 13, color: 'var(--primary)', marginLeft: 16 }}>Detalle por versión →</Link>
          <PageHeader
            titulo="Estado del tarificador"
            icono={<Gauge size={20} strokeWidth={1.75} />}
            sub={<>Dónde tenemos precio, por qué canal, cómo le va a cada bot y cuánto llevamos gastado en Avant2 este mes.</>}
          />
        </div>
        <EstadoTarificador />
      </div>
    </Pagina>
  )
}
