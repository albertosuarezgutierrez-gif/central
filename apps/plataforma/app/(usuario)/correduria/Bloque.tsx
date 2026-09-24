'use client'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * El envoltorio de un bloque dentro de una sección de la correduría.
 *
 * ─── Por qué NO es una caja ─────────────────────────────────────────────────
 * Cada bloque de esta pantalla pintaba su propio marco: borde 1px, radio 12 y
 * padding 14, repetido seis veces en seis ficheros. Apilados, el resultado eran
 * seis rectángulos del mismo peso donde ninguno decía «mírame a mí primero», y
 * dentro de cada uno vivían las tarjetas de KPI —que también son cajas— sin ser
 * lo mismo. Es el fallo que ya se corrigió en `banca/SegTabs.tsx`: borde, fondo
 * y sombra se gastan POR FUNCIÓN, y «soy una sección» no es una función.
 *
 * Así que un bloque normal es una línea fina, un título y su contenido. La caja
 * se reserva para lo que sí es un objeto: una tarjeta de dato, o una ALARMA
 * —`destacado`—, donde el fondo tintado es lo que hace que se lea antes que el
 * resto. Si todo destaca, no destaca nada: `destacado` se pone cuando hay una
 * persona esperando al otro lado, no cuando el bloque nos parece importante.
 *
 * `sub` es el sitio de la letra pequeña que califica el titular (qué se está
 * contando, qué significa un «—»). No se borra por minimalismo: un número sin
 * su definición es justo la afirmación que la regla «dato que NO hay ≠ dato que
 * NO se ha mirado» prohíbe. Se baja de tamaño, que es otra cosa.
 */

export type TonoBloque = 'neutral' | 'aviso' | 'malo'

const COLOR: Record<TonoBloque, string> = {
  neutral: 'var(--text)',
  aviso: 'var(--warning)',
  malo: 'var(--negative)',
}

const FONDO: Record<TonoBloque, string> = {
  neutral: 'transparent',
  aviso: 'var(--warning-bg)',
  malo: 'var(--negative-bg)',
}

export default function Bloque({
  titulo, sub, Icono, accion, tono = 'neutral', destacado = false, primero = false, children,
}: {
  titulo: ReactNode
  sub?: ReactNode
  Icono?: LucideIcon
  accion?: ReactNode
  tono?: TonoBloque
  /** Fondo tintado. Solo para alarmas con alguien esperando al otro lado. */
  destacado?: boolean
  /** El primero de una sección no pinta la línea de separación de arriba. */
  primero?: boolean
  children: ReactNode
}) {
  return (
    <section
      style={{
        borderTop: primero || destacado ? 'none' : '1px solid var(--border)',
        paddingTop: primero ? 0 : destacado ? 14 : 20,
        marginTop: primero ? 0 : 20,
        ...(destacado
          ? {
              background: FONDO[tono],
              border: `1px solid ${COLOR[tono]}`,
              borderRadius: 12,
              padding: 14,
            }
          : null),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: sub ? 4 : 10 }}>
        <h2
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            margin: 0, fontSize: 14, fontWeight: 700, color: COLOR[tono],
          }}
        >
          {Icono && <Icono size={15} strokeWidth={1.75} aria-hidden />}
          {titulo}
        </h2>
        {accion && <span style={{ marginLeft: 'auto' }}>{accion}</span>}
      </div>
      {sub && (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)', maxWidth: '72ch' }}>
          {sub}
        </p>
      )}
      {children}
    </section>
  )
}
