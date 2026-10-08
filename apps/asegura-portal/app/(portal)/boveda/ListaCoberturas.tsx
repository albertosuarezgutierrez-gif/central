'use client'

import { useState } from 'react'

export type FilaCobertura = {
  nombre: string
  /** «2.162,49€», «sin capital propio», «ilimitado» o `null` (no se pinta). */
  capital: string | null
  /** Importe de la franquicia ya formateado, o `null`. */
  franquicia: string | null
  /** «del 01/01/2026 al 01/01/2027» solo si difiere de la póliza, o `null`. */
  vigencia: string | null
}

const POR_PAGINA = 50

/**
 * Las coberturas de una póliza, ~50 y «Ver más» (regla de rendimiento de la casa):
 * una póliza de hogar de Occident trae hasta 55 garantías y el DOM no se monta de golpe.
 * Cliente solo por el estado del «Ver más»; la lectura y el formato son del servidor.
 */
export function ListaCoberturas({ filas }: { filas: FilaCobertura[] }) {
  const [visibles, setVisibles] = useState(POR_PAGINA)
  const resto = filas.length - visibles
  return (
    <>
      <ul className="coberturas">
        {filas.slice(0, visibles).map((f, i) => (
          <li key={`${f.nombre}-${i}`}>
            {f.nombre}
            {f.capital && `: ${f.capital}`}
            {f.franquicia && (
              <span className="suave" style={{ display: 'block', fontSize: 13 }}>Franquicia {f.franquicia}</span>
            )}
            {f.vigencia && <span className="suave" style={{ display: 'block', fontSize: 13 }}>{f.vigencia}</span>}
          </li>
        ))}
      </ul>
      {resto > 0 && (
        <p style={{ margin: '10px 0 0' }}>
          <button type="button" className="boton auto" style={{ minHeight: 44 }} onClick={() => setVisibles((v) => v + POR_PAGINA)}>
            Ver más ({resto})
          </button>
        </p>
      )}
    </>
  )
}
