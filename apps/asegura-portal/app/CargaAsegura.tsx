import { MarcaAsegura } from './MarcaAsegura'

/**
 * Indicador de carga con el monograma «AS» (26/09/2026, Alberto: «al pasar de
 * una pantalla tarda… ¿se puede usar el logo de AS como indicador de carga?»).
 *
 * Un solo dibujo para los dos caminos por los que se espera en el portal:
 *  - `(portal)/loading.tsx`: cambio de RUTA (/boveda → /boveda/poliza/…).
 *  - `CargandoEnlace`: cambio de `?vista=` en la misma ruta, donde `loading.tsx`
 *    NO salta (Next conserva el límite de Suspense si solo cambian los params).
 *
 * El 26/09 pasó al nombre completo y el 28/09 volvió al monograma (Alberto:
 * «cambia por AS las cargas, queda más elegante»). Va EN LÍNEA (`MarcaAsegura`):
 * no añade una petición en el momento en que se está esperando a otra.
 * `role="status"` + texto oculto: un lector de pantalla oye «Cargando», no
 * «Grupo ASegura».
 */
export function CargaAsegura({ flotante = false }: { flotante?: boolean }) {
  return (
    <div className={flotante ? 'carga-as carga-as-flotante' : 'carga-as'} role="status">
      <span className="carga-as-marca" aria-hidden="true">
        <MarcaAsegura alto={40} />
      </span>
      <span className="carga-as-texto">Cargando…</span>
    </div>
  )
}
