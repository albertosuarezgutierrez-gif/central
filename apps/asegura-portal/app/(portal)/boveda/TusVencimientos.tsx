import Link from 'next/link'
import type { Vencimiento } from '@/lib/vencimientos'
import { primaQuePaga } from '@/lib/vencimientos'
import type { PeticionAbierta } from '@/lib/mejorar-precio'
import { eur } from '@/lib/dinero'
import { fechaEs } from '@/lib/fechas'
import { tituloDePoliza } from './PolizaVista'

/**
 * «Tus vencimientos» (pieza 1-5 de ASegura OS, maqueta aprobada el 23/09/2026):
 * lo SUYO que renueva en los próximos 60 días, con el botón «Quiero que me
 * mejores el precio». Es la venta que inicia el propio cliente.
 *
 * Reglas:
 *  - Solo sus pólizas (las de sus fichas). Una póliza de alguien que le ha
 *    autorizado a verla no lleva botón: decide su tomador. Qué entra en la
 *    ventana lo decide `vencimientosEnVentana()` y lo calcula la página una sola
 *    vez: es la misma lista con la que decide si pide las peticiones.
 *  - Se pinta la prima ACTUAL («pagas»), no una «prima de renovación» que no
 *    conocemos. Sin prima visible, no se inventa.
 *  - Si no hay nada en la ventana, no pinta nada: la lista de la cartera ya
 *    dice cuándo vence cada una, y el alta tiene que seguir arriba.
 *  - `peticiones === null` = no se pudo saber si ya lo pidió: se deja el botón
 *    (pedir dos veces no crea dos: asegura es idempotente).
 */
export function TusVencimientos({ vencimientos: filas, peticiones }: {
  vencimientos: Vencimiento[]
  peticiones: PeticionAbierta[] | null
}) {
  if (filas.length === 0) return null
  const pedidas = new Map((peticiones ?? []).map((x) => [x.polizaId, x.pedidoEl]))

  return (
    <section className="seccion" aria-labelledby="vencimientos-titulo">
      <h2 id="vencimientos-titulo">Tus vencimientos</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {filas.map(({ p, dias }) => {
          const prima = primaQuePaga(p.prima)
          const pedido = pedidas.get(p.id)
          return (
            <article key={p.id} className="vencimiento-tarjeta">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                  <strong style={{ fontSize: 15 }}>{tituloDePoliza(p)}</strong>
                  <span className="suave" style={{ fontSize: 13 }}>{p.compania} · renueva el {fechaEs(p.fechaVencimiento)}</span>
                </div>
                <span className="chip aviso" style={{ whiteSpace: 'nowrap' }}>
                  {dias === 0 ? 'hoy' : `en ${dias} día${dias === 1 ? '' : 's'}`}
                </span>
              </div>
              {prima !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span className="suave">Pagas ahora</span>
                  <span style={{ fontWeight: 600 }}>{eur(prima)} al año</span>
                </div>
              )}
              {pedido ? (
                <p className="suave" style={{ margin: 0, fontSize: 14 }}>
                  Nos pediste que te lo miremos el {fechaEs(new Date(`${pedido}T12:00:00Z`))}. Te contactamos antes de que renueve.
                </p>
              ) : (
                <Link href={`/boveda/mejorar/${p.id}`} className="boton" style={{ minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  Quiero que me mejores el precio
                </Link>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
