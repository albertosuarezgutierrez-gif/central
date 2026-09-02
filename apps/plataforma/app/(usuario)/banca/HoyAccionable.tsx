import Link from 'next/link'
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'
import { accionesDeInicio, todoComprobado, type EstadoInicio, type Urgencia } from '@/lib/inicio-acciones'

// La banda de arriba de Inicio: lo que pide acción HOY.
//
// Criterio único: ¿puedo hacer algo hoy con esto? Un saldo no; una póliza que vence en 12 días sí.
// Lo que es consulta se queda más abajo. La decisión de qué entra vive en `lib/inicio-acciones.ts`
// (pura y testeada), aquí solo se pinta.

const ESTILO: Record<Urgencia, { fondo: string; color: string; icono: typeof CircleAlert }> = {
  roja:  { fondo: 'var(--negative-bg)', color: 'var(--negative)', icono: CircleAlert },
  ambar: { fondo: 'var(--warning-bg)',  color: 'var(--warning)',  icono: TriangleAlert },
  info:  { fondo: 'var(--info-bg)',     color: 'var(--info)',     icono: CircleAlert },
}

export default function HoyAccionable({ estado }: { estado: EstadoInicio }) {
  const acciones = accionesDeInicio(estado)

  // Nada que hacer Y todo comprobado: se puede decir. Si algo no se pudo mirar, `accionesDeInicio`
  // ya habrá metido su propia fila, así que aquí no hace falta matizar.
  if (acciones.length === 0) {
    return (
      <section style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24,
        background: 'var(--positive-bg)', color: 'var(--positive)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px',
      }}>
        <CircleCheck size={18} strokeWidth={1.75} aria-hidden />
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          {todoComprobado(estado) ? 'Nada pendiente hoy.' : 'Nada pendiente de lo que se ha podido comprobar.'}
        </span>
      </section>
    )
  }

  return (
    <section aria-label="Pide acción hoy" style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>
        Pide acción hoy
      </h2>
      {/* minmax(0,1fr): sin esto la pista implícita se dimensiona con el contenido más ancho y
          arrastra la página entera en móvil (regla del CLAUDE.md). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
        {acciones.map(a => {
          const e = ESTILO[a.urgencia]
          const Icono = e.icono
          return (
            <Link key={a.clave} href={a.href} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, textDecoration: 'none',
              background: e.fondo, border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              padding: '12px 14px', minHeight: 44,
            }}>
              <span aria-hidden style={{ color: e.color, display: 'inline-flex', flexShrink: 0, marginTop: 1 }}>
                <Icono size={18} strokeWidth={1.75} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{a.titulo}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{a.detalle}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
