import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { revisionAsegura } from '@/lib/correduria-puerto'
import { PageHeader, Pagina } from '@/components/ui'
import RevisionClient from './RevisionClient'

export const dynamic = 'force-dynamic'

/**
 * Bandeja de revisión manual de pólizas (03/10/2026): parejas de filas vivas que comparten número y
 * que una persona tiene que decidir — «son la misma», «son distintas» o «descartar». Sin tabla nueva:
 * los casos viven en `seguros.operational_events` de asegura. Decidir «son la misma» NO fusiona nada:
 * deja constancia, y la fusión la aplica después una sesión con el método CTE y el OK de Alberto.
 */
export default async function RevisionPage() {
  const bandeja = await revisionAsegura()
  return (
    <Pagina ancho="tabla">
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div>
          <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
          <PageHeader
            titulo="Revisión manual de pólizas"
            icono={<ClipboardCheck size={20} strokeWidth={1.75} />}
            sub={<>
              Números de póliza que aparecen en más de una fila viva y que no se pueden decidir solos.
              Aquí solo se registra la decisión: <strong>«Son la misma» no fusiona</strong>.
            </>}
          />
        </div>
        {bandeja.estado === 'ok' ? (
          <RevisionClient casos={bandeja.casos} />
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--surface)', fontSize: 13, color: 'var(--muted)' }}>
            {bandeja.estado === 'sin_configurar'
              ? <>El puerto de asegura no está configurado aquí (falta <code>ASEGURA_OPERADOR_SECRET</code>). </>
              : <>No se ha podido leer la bandeja: <strong>{bandeja.motivo}</strong>. </>}
            Esto <strong>no</strong> quiere decir que no haya casos: es que no se ha podido mirar.
          </div>
        )}
      </div>
    </Pagina>
  )
}
