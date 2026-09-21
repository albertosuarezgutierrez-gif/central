'use client'
import { useState, type ReactNode } from 'react'

/**
 * El plegable «Ver el resto de opciones (N)».
 *
 * 🚨 **Montaje perezoso de verdad, no un `<details>` a secas.** La regla de
 * rendimiento de la casa lo dice con estas palabras: *un `<details>` cerrado
 * igualmente crea todo su DOM*. Aquí los hijos ni se montan hasta que alguien
 * lo abre, así que cerrado no cuesta nada.
 *
 * Por eso es un componente de CLIENTE aunque no tenga lógica de negocio: el
 * estado «¿se ha abierto ya?» vive en el navegador. El contenido lo sigue
 * componiendo el servidor y viaja como hijos ya renderizados — lo que se evita
 * es el DOM, que es lo que pesa en el móvil de alguien que abre un correo.
 *
 * ⚠️ `open` se deriva de `onToggle` y no al revés: el navegador abre y cierra el
 * `<details>` por su cuenta (teclado, buscar-en-página), y un `open` controlado
 * pelearía con él.
 */
export function Plegable({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <details
      className="plegable-suave presu-plegable"
      onToggle={(e) => setAbierto((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>{titulo}</summary>
      {abierto && <div className="presu-plegable-cuerpo">{children}</div>}
    </details>
  )
}
