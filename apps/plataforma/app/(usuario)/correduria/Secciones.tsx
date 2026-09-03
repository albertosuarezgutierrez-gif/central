'use client'
import { ListChecks, Users, Shield, Receipt, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SECCIONES, type Seccion, type Contador } from './secciones'

/**
 * La barra de secciones de la correduría.
 *
 * Mismo idioma visual que `cliente/[id]/FichaTabs.tsx` y `banca/SegTabs.tsx`:
 * subrayado en vez de pastilla —navegar no es un objeto— e iconos de
 * `lucide-react`, que se pintan igual en cada sistema operativo. No se inventa
 * un lenguaje nuevo para esta pantalla.
 *
 * ─── Por qué BOTONES y no `next/link` ──────────────────────────────────────
 * Las otras dos barras navegan porque cada pestaña es una carga de servidor
 * independiente. Aquí no: la pantalla entera es un client component que ya ha
 * pedido sus datos al puerto de asegura. Navegar la remontaría y volvería a
 * pedirlo todo en cada clic. La sección viaja igualmente en la URL (`?s=`, por
 * `history.replaceState`) para que un enlace siga llevando donde debe.
 *
 * ─── El contador es lo que impide que una pestaña ESCONDA trabajo ──────────
 * Un aviso que no se ve es un aviso que no existe. Por eso el badge se pinta
 * desde cualquier sección y distingue tres cosas:
 *   `{n, parcial:false}` → el número exacto (0 no se pinta: no hay trabajo).
 *   `{n, parcial:true}`  → «n+»: hay AL MENOS eso; alguna cola no se ha leído.
 *   `null`               → «!»: no se ha podido saber. NUNCA un 0.
 */

const META: Record<Seccion, { label: string; Icono: LucideIcon }> = {
  hoy: { label: 'Hoy', Icono: ListChecks },
  clientes: { label: 'Clientes', Icono: Users },
  cartera: { label: 'Cartera', Icono: Shield },
  comisiones: { label: 'Comisiones', Icono: Receipt },
  datos: { label: 'Datos', Icono: TriangleAlert },
}

export type ContadoresSeccion = Partial<Record<Seccion, {
  contador: Contador | null
  tono?: 'aviso' | 'malo'
  title?: string
}>>

export default function Secciones({ activa, contadores, onCambiar }: {
  activa: Seccion
  contadores: ContadoresSeccion
  onCambiar: (s: Seccion) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Secciones de la correduría"
      // El scroll horizontal vive AQUÍ, no en la página: en 320 px cinco
      // pestañas con icono no caben ni de lejos, y un `flexWrap` las apila en
      // dos filas que empujan el contenido.
      style={{
        display: 'flex', gap: 18, flexWrap: 'nowrap',
        overflowX: 'auto', borderBottom: '1px solid var(--border)',
        scrollbarWidth: 'thin', marginBottom: 20,
      }}
    >
      {SECCIONES.map(k => {
        const { label, Icono } = META[k]
        const on = activa === k
        const c = contadores[k]
        return (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onCambiar(k)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              background: 'none', border: 'none', cursor: 'pointer',
              font: 'inherit', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap',
              // El borde de 2px se pinta SIEMPRE (transparente si no está
              // activa) para que al cambiar de sección no salte la fila.
              padding: '10px 1px', minHeight: 44,
              borderBottom: `2px solid ${on ? 'var(--primary)' : 'transparent'}`,
              color: on ? 'var(--text)' : 'var(--muted)',
            }}
          >
            <Icono size={15} strokeWidth={1.75} aria-hidden />
            {label}
            {c && <Insignia contador={c.contador} tono={c.tono} title={c.title} />}
          </button>
        )
      })}
    </div>
  )
}

function Insignia({ contador, tono, title }: {
  contador: Contador | null
  tono?: 'aviso' | 'malo'
  title?: string
}) {
  // «No se ha podido leer» no es «no hay nada»: se pinta y manda a mirar.
  const desconocido = contador === null
  if (!desconocido && contador.n === 0 && !contador.parcial) return null

  const texto = desconocido ? '!' : contador.parcial ? `${contador.n}+` : String(contador.n)
  const t = desconocido ? 'aviso' : tono
  const color = t === 'malo' ? 'var(--negative)' : t === 'aviso' ? 'var(--warning)' : 'var(--muted)'
  const fondo = t === 'malo' ? 'var(--negative-bg)' : t === 'aviso' ? 'var(--warning-bg)' : 'var(--border)'

  return (
    <span
      title={desconocido
        ? 'No se ha podido leer esta cola. No significa que esté vacía: entra a ver qué falla.'
        : contador.parcial
          ? 'Hay al menos este trabajo pendiente; alguna de las colas de esta sección no se ha podido leer.'
          : title}
      style={{
        fontSize: 11, fontWeight: 700, lineHeight: '16px', minWidth: 16,
        padding: '0 5px', borderRadius: 999, textAlign: 'center',
        color, background: fondo,
      }}
    >
      {texto}
    </span>
  )
}
