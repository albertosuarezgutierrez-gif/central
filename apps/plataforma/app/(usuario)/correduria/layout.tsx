/**
 * Envoltorio de TODA la sección de la correduría.
 *
 * Su único trabajo es colgar la clase `.correduria`, que redefine los tokens de
 * color con el acento cobalto de Grupo ASegura (ver el bloque en
 * `app/globals.css`). Los componentes de dentro siguen usando `var(--primary)`
 * sin enterarse, y el resto de plataforma no cambia.
 */
export default function CorreduriaLayout({ children }: { children: React.ReactNode }) {
  return <div className="correduria">{children}</div>
}
