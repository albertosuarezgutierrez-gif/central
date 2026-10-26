import type { ReactNode } from 'react'

/**
 * La tarjeta ÚNICA del portal (26/10/2026): `.seccion` (mismo radio ×1.8, mismo padding, misma sombra que el resto de
 * la bóveda) con su `.antetitulo`, el titular en `--display` y un hueco para el estado (chip) y otro para la acción.
 * Sustituye a `.inicio-tarjeta` (radio ×1.2, sin antetítulo: «otra marca») y a las tarjetas hechas a mano de
 * Herramientas.
 *
 * - `titulo` es un `<h2>` (o `h3` con `nivel={3}`): una tarjeta es una sección con nombre, no un enlace gigante.
 * - `accion`: el botón o enlace (≥44 px) dentro de `.acciones` (el contenedor único: gap, columna en móvil, fila en
 *   escritorio). Como mucho UN `.boton` primario; el resto `.boton secundario` o un `.acciones-nota` con enlace.
 * - `tono`: `aviso`/`peligro` tiñen el borde izquierdo; el color NUNCA va solo: el chip o el texto lo dicen también.
 *
 * Es un componente de presentación (sin hooks): se puede usar desde el servidor y desde el cliente.
 */
export function TarjetaPortal({
  id,
  antetitulo,
  titulo,
  nivel = 2,
  chip,
  tono,
  accion,
  children,
}: {
  id?: string
  antetitulo?: ReactNode
  titulo?: ReactNode
  nivel?: 2 | 3
  chip?: ReactNode
  tono?: 'aviso' | 'peligro'
  accion?: ReactNode
  children?: ReactNode
}) {
  const idTitulo = id ? `${id}-titulo` : undefined
  const Titular = nivel === 3 ? 'h3' : 'h2'
  return (
    <section
      id={id}
      className={`seccion tarjeta-portal${tono ? ` tarjeta-${tono}` : ''}`}
      aria-labelledby={titulo ? idTitulo : undefined}
    >
      {(titulo || chip) && (
        <div className="tarjeta-portal-cabecera">
          <div className="tarjeta-portal-titulos">
            {antetitulo && <p className="antetitulo">{antetitulo}</p>}
            {titulo && <Titular id={idTitulo}>{titulo}</Titular>}
          </div>
          {chip}
        </div>
      )}
      {children}
      {accion && <div className="acciones tarjeta-portal-accion">{accion}</div>}
    </section>
  )
}
