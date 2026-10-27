'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { rutaManual, type ModuloPortal } from '@central/module-seguros-portal'

const clave = (modulo: ModuloPortal) => `asegura-manual-visto-${modulo}`

/**
 * Aviso ÚNICO al entrar por primera vez a una herramienta (28/10/2026): «aquí tienes cómo funciona». Se descarta una vez y no
 * vuelve en este navegador. `localStorage` solo es una comodidad de ESTE navegador: toda lectura y escritura va en try/catch
 * y, si falla (modo privado, datos bloqueados, vista previa), el aviso NO se muestra y la pantalla funciona igual. Se prefiere
 * callar a repetirlo en cada visita. Hasta que el efecto lee el almacenamiento no se pinta nada (sin parpadeo ni desajuste
 * de hidratación).
 */
export function AvisoManual({ modulo }: { modulo: ModuloPortal }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(clave(modulo)) === null)
    } catch {
      setVisible(false)
    }
  }, [modulo])

  if (!visible) return null

  const marcarVisto = () => {
    try {
      window.localStorage.setItem(clave(modulo), '1')
    } catch {
      // Sin almacenamiento: se oculta en esta visita y, a la siguiente, la lectura fallará y tampoco se enseñará.
    }
    setVisible(false)
  }

  return (
    <section className="aviso-linea" role="status" aria-label="Primera vez en esta herramienta" style={{ margin: '0 0 12px' }}>
      <p style={{ margin: '0 0 8px' }}>Es la primera vez que entras aquí. Tienes una guía corta de cómo funciona esta herramienta.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Link className="boton" style={{ minHeight: 44 }} href={rutaManual(modulo)} onClick={marcarVisto}>
          Ver cómo funciona
        </Link>
        <button type="button" className="boton-tenue" style={{ minHeight: 44 }} onClick={marcarVisto}>
          Entendido
        </button>
      </div>
    </section>
  )
}
