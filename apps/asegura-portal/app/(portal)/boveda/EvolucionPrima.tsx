import Link from 'next/link'

import type { EvolucionPrima as Evolucion } from '@central/module-seguros-portal'

import { eur } from '@/lib/dinero'
import { fechaEs } from '@/lib/fechas'

/**
 * Bloque «Evolución de la prima» de una ficha. Servidor, sin estado. `evolucion === null` = no se
 * pinta nada (sin observaciones no hay nada que decir). Importes `null` → «—», jamás «0,00€».
 * La acción NO envía nada: es un enlace a la pantalla donde la persona decide pedirlo.
 * `hrefRevisar` `null` = esa póliza no tiene vía propia de «mejorar el precio» (no se enlaza).
 */
export function EvolucionPrima({ evolucion, hrefRevisar, textoSinEnlace }: { evolucion: Evolucion | null; hrefRevisar: string | null; textoSinEnlace?: string | null }) {
  if (evolucion === null) return null
  const fecha = evolucion.en ? fechaEs(evolucion.en) : null
  const rotulo = evolucion.base === 'cartera' ? 'Prima anual (impuestos incluidos)' : 'Prima anual'
  return (
    <section className="seccion" aria-labelledby="evolucion-prima-titulo">
      <h2 id="evolucion-prima-titulo">Evolución de la prima</h2>
      <dl className="ficha-datos">
        <dt>{rotulo}, antes</dt>
        <dd>{eur(evolucion.anterior)}</dd>
        <dt>{rotulo}, ahora</dt>
        <dd className="ojo">{eur(evolucion.actual)}</dd>
        <dt>Subida</dt>
        <dd className="ojo">{evolucion.porcentaje === null ? '—' : `+${evolucion.porcentaje.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`}</dd>
        <dt>Detectada el</dt>
        <dd>{fecha ?? '—'}</dd>
      </dl>
      <p className="suave" style={{ margin: '12px 0', fontSize: 14, lineHeight: 1.5 }}>
        ¿Quieres que la revisemos? Te buscamos alternativa.
      </p>
      {hrefRevisar ? (
        <p style={{ margin: 0 }}>
          <Link className="boton auto" href={hrefRevisar} style={{ minHeight: 44 }}>
            Revisar mi precio
          </Link>
        </p>
      ) : textoSinEnlace ? (
        <p className="suave" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{textoSinEnlace}</p>
      ) : null}
    </section>
  )
}
