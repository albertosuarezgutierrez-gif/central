/**
 * Indicador de carga con el logotipo «Grupo ASegura» (26/09/2026, Alberto: «al pasar de
 * una pantalla tarda… ¿se puede usar el logo de AS como indicador de carga?»).
 *
 * Un solo dibujo para los dos caminos por los que se espera en el portal:
 *  - `(portal)/loading.tsx`: cambio de RUTA (/boveda → /boveda/poliza/…).
 *  - `CargandoEnlace`: cambio de `?vista=` en la misma ruta, donde `loading.tsx`
 *    NO salta (Next conserva el límite de Suspense si solo cambian los params).
 *
 * Desde el 26/09/2026 va el nombre completo y no el monograma (Alberto: «al
 * principio aparece el logo AS en grande… lo cambiaría por nombre completo»). Es
 * el mismo `mask` del logotipo de la cabecera, que ya lo ha descargado: no añade
 * una petición en el momento en que se está esperando a otra.
 * `role="status"` + texto oculto: un lector de pantalla oye «Cargando», no
 * «Grupo ASegura».
 */
export function CargaAsegura({ flotante = false }: { flotante?: boolean }) {
  return (
    <div className={flotante ? 'carga-as carga-as-flotante' : 'carga-as'} role="status">
      <span className="carga-as-marca" aria-hidden="true">
        <span className="marca-palabra marca-palabra-grande" />
      </span>
      <span className="carga-as-texto">Cargando…</span>
    </div>
  )
}
