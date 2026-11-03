import Link from 'next/link'

import { CATALOGO_MODULOS, rutaManual, type ModuloPortal } from '@central/module-seguros-portal'

/**
 * El enlace «Cómo funciona» a la página del manual de una herramienta (28/10/2026). Un solo componente para la tarjeta de
 * Herramientas y la cabecera de cada herramienta; la ruta sale de `rutaManual()` (catálogo), nunca tecleada. Táctil de 44 px.
 * `aparte` = párrafo propio (cabecera de una pantalla); sin él, el enlace a secas (dentro de las acciones de una tarjeta).
 */
export function EnlaceComoFunciona({ modulo, aparte = false }: { modulo: ModuloPortal; aparte?: boolean }) {
  const enlace = (
    <Link
      className="boton-tenue"
      style={{ minHeight: 44 }}
      href={rutaManual(modulo)}
      aria-label={`Cómo funciona: ${CATALOGO_MODULOS[modulo].nombre}`}
    >
      Cómo funciona
    </Link>
  )
  return aparte ? <p style={{ margin: '0 0 12px' }}>{enlace}</p> : enlace
}
