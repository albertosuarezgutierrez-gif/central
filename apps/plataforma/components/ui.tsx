// Sistema de diseño de plataforma. Server-safe (sin hooks): lo pueden usar tanto los Server
// Components como los client. Solo presentación — cero lógica de negocio.
//
// ─── Por qué vive AQUÍ y no en app/(usuario)/dashboard/ui.tsx ────────────────────────────────
// Nació en `dashboard/ui.tsx` (02/07/2026), pero `/dashboard` acabó siendo una página que SOLO
// redirige a `/banca`: el sistema de diseño del panel entero colgaba de una ruta muerta. Peor: al
// auditarlo (02/09/2026) NINGÚN archivo lo importaba. Existía como documento, no como código, y
// mientras tanto las pantallas se escribían con ~4.900 objetos `style={{}}` a mano y 223 verdes y
// rojos en hexadecimal fijo (ilegibles en modo oscuro).
//
// La conclusión que ordena este archivo: el problema del panel no es la piel, es que no hay
// piezas. Cada primitiva de aquí existe para que la decisión correcta sea la fácil de escribir.
//
// La adopción es POR GOTEO (regla del CLAUDE.md raíz): se trae el patrón cuando una pantalla lo
// necesita, no se migra todo de golpe. `/banca` es la implementación de referencia.
import type { CSSProperties, ReactNode } from 'react'
import { estadoDato, esPendiente, colorImporte } from '@/lib/dato'

// Se reexportan para que una pantalla importe todo el sistema de diseño de un solo sitio.
export { esPendiente, colorImporte }
export type { EstadoDato } from '@/lib/dato'

// ─── Color ───────────────────────────────────────────────────────────────────────────────────
// Siempre vía tokens (`globals.css`): así el modo oscuro sale gratis. Nunca un hex aquí ni en las
// pantallas — lo vigila `test/regression-tokens-color.test.ts`.
export const EMERALD = 'var(--positive)'
export const ROSE = 'var(--negative)'
export const BLUE = 'var(--info)'

/** Tono semántico. NO es el color de marca: `--primary` es identidad, esto es estado. */
export type Tono = 'neutral' | 'positivo' | 'negativo' | 'aviso' | 'info'

const TONOS: Record<Tono, { fg: string; bg: string }> = {
  neutral: { fg: 'var(--muted)', bg: 'var(--primary-light)' },
  positivo: { fg: 'var(--positive)', bg: 'var(--positive-bg)' },
  negativo: { fg: 'var(--negative)', bg: 'var(--negative-bg)' },
  aviso: { fg: 'var(--warning)', bg: 'var(--warning-bg)' },
  info: { fg: 'var(--info)', bg: 'var(--info-bg)' },
}

// ─── Ancho de página ─────────────────────────────────────────────────────────────────────────
// Había un `maxWidth: '960px'` copiado en 14 páginas. 960 está bien para LEER (una columna de
// texto y tarjetas), pero asfixia justo a lo que necesita aire: el libro de movimientos, la
// matriz de la correduría, cualquier tabla ancha. Dos anchos, elegidos por lo que contiene la
// página — no uno por defecto para todo.
export const ANCHO = {
  /** Resúmenes, fichas, formularios: una columna cómoda de leer. */
  lectura: 960,
  /** Páginas cuyo cuerpo es una tabla o una rejilla densa. */
  tabla: 1400,
} as const

/**
 * Contenedor de página. Sustituye al `<main style={{ maxWidth: '960px', ... }}>` a mano.
 * El padding responsive lo pone la clase `.pagina` de `globals.css` (un estilo inline no puede
 * llevar media queries, y ese era justo el motivo de que las páginas acabaran con bloques
 * `<style>` incrustados).
 */
export function Pagina({ ancho = 'lectura', children }: {
  ancho?: keyof typeof ANCHO
  children: ReactNode
}) {
  return (
    <main className="pagina" style={{ maxWidth: ANCHO[ancho], margin: '0 auto' }}>
      {children}
    </main>
  )
}

/**
 * Cabecera de página: título a la izquierda, acciones a la derecha. En móvil se apila sola
 * (clase `.page-header`, en `globals.css`) — antes cada página repetía su propia media query.
 */
export function PageHeader({ titulo, sub, icono, acciones }: {
  titulo: ReactNode
  sub?: ReactNode
  icono?: ReactNode
  acciones?: ReactNode
}) {
  return (
    <header className="page-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {icono && (
          <span aria-hidden style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 38, height: 38, borderRadius: 11, flexShrink: 0,
            background: 'var(--primary-light)', color: 'var(--primary)',
          }}>{icono}</span>
        )}
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', margin: 0 }}>{titulo}</h1>
          {sub && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
      {acciones && <div className="page-header-acciones">{acciones}</div>}
    </header>
  )
}

// ─── Tarjetas ────────────────────────────────────────────────────────────────────────────────
// Ojo con estamparle `cardStyle` a todo: borde + fondo + radio + sombra dicen «objeto aparte», y
// si todo es una tarjeta no hay jerarquía. Úsala para agrupar, no para decorar.
export const cardStyle: CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', padding: '20px', boxShadow: 'var(--shadow)',
}

/** Cabecera de tarjeta: título discreto a la izquierda, acción/enlace a la derecha. */
export function CardHeader({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
  )
}

/** Métrica grande: número tabular protagonista + etiqueta muted. */
export function Stat({ label, value, color, delta, bueno, sub }: {
  label: ReactNode
  value: ReactNode
  color?: string
  delta?: number | null
  bueno?: boolean
  sub?: ReactNode
}) {
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 24, fontWeight: 700, color: color || 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {delta !== undefined && <DeltaBadge pct={delta} bueno={bueno} />}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

/**
 * KPI con icono. El icono va en una pastilla tintada del tono — es lo que separa visualmente una
 * cifra de cabecera de un dato más de una lista. Pásale un icono de `lucide-react` (tamaño 18);
 * los emojis se pintan distinto en cada sistema operativo y es lo que hace que un panel parezca
 * casero.
 */
export function KpiCard({ icono, label, valor, sub, delta, bueno, tono = 'neutral', color }: {
  icono?: ReactNode
  label: ReactNode
  valor: ReactNode
  sub?: ReactNode
  delta?: number | null
  bueno?: boolean
  tono?: Tono
  color?: string
}) {
  const t = TONOS[tono]
  return (
    <div style={{ ...cardStyle, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      {icono && (
        <span aria-hidden style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: t.bg, color: t.fg,
        }}>{icono}</span>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: color || 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
          {delta !== undefined && <DeltaBadge pct={delta} bueno={bueno} />}
        </div>
        {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  )
}

/** Pastilla de variación ▲/▼. `bueno` colorea por SIGNIFICADO (subir gastos = rojo), no por signo. */
export function DeltaBadge({ pct, bueno }: { pct: number | null | undefined; bueno?: boolean }) {
  if (pct == null) return null
  const sube = pct >= 0
  const positivo = bueno ?? sube
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
      background: positivo ? 'var(--positive-bg)' : 'var(--negative-bg)',
      color: positivo ? EMERALD : ROSE,
    }}>
      {sube ? '▲' : '▼'} {Math.abs(pct).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%
    </span>
  )
}

/** Etiqueta de estado. El estado se lee de un vistazo por la FORMA, no solo por el número. */
export function Badge({ tono = 'neutral', children, title }: {
  tono?: Tono
  children: ReactNode
  title?: string
}) {
  const t = TONOS[tono]
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
      background: t.bg, color: t.fg, whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

// ─── Botones ─────────────────────────────────────────────────────────────────────────────────
// Se exporta el ESTILO, no un componente con `onClick`: este archivo es server-safe y un handler
// obligaría a marcarlo `'use client'`, arrastrando al cliente cada pantalla que lo importe. Los
// client components hacen `<button style={btnStyle('primario')} onClick={...}>`.
export function btnStyle(variante: 'primario' | 'secundario' | 'sutil' = 'secundario', tam: 'sm' | 'md' = 'md'): CSSProperties {
  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    // 44px de alto en `md`: mínimo táctil de la regla responsive del CLAUDE.md raíz.
    padding: tam === 'sm' ? '7px 12px' : '11px 16px',
    minHeight: tam === 'sm' ? 34 : 44,
    fontSize: tam === 'sm' ? 13 : 14, fontWeight: 600,
    borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap',
    transition: 'background .12s ease, border-color .12s ease',
  }
  if (variante === 'primario') return { ...base, background: 'var(--primary)', color: '#fff', border: '1px solid var(--primary)' }
  if (variante === 'sutil') return { ...base, background: 'transparent', color: 'var(--muted)', border: '1px solid transparent' }
  return { ...base, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }
}

/** Botón que en realidad navega. Para acciones con handler usa `btnStyle` en tu client component. */
export function BtnLink({ href, variante, tam, children }: {
  href: string
  variante?: 'primario' | 'secundario' | 'sutil'
  tam?: 'sm' | 'md'
  children: ReactNode
}) {
  return <a href={href} style={{ ...btnStyle(variante, tam), textDecoration: 'none' }}>{children}</a>
}

// ─── Dato: los TRES estados de un valor ──────────────────────────────────────────────────────
// La regla fundacional del CLAUDE.md raíz («dato que NO hay ≠ dato que NO se ha mirado») se venía
// cumpliendo por vigilancia: cada pantalla nueva tenía que acordarse de no pintar un 0 donde hay
// un NULL. Esto la convierte en la opción por defecto.
//
//   null / undefined  → «todavía no se sabe»   (columna de enriquecimiento sin pasada aún)
//   [] / ''           → «revisado, no hay»
//   con contenido     → el dato
//
// El caso caro es el primero: colapsarlo con `?? 0` o `?? []` y pintar «sin documentos adjuntos»
// o un semáforo 🟢 convierte un «no lo sé» en una afirmación falsa, y son justo las afirmaciones
// sobre las que se decide. Caso fundacional: PR #1180, una subasta decía «sin documentos» con el
// BOE publicando su edicto y su certificación de cargas.

/**
 * El hueco, dicho en voz alta. Borde discontinuo = se rellenará; continuo = no lo hará nunca.
 * `donde` dice al usuario dónde mirar mientras tanto (la ficha oficial, el portal del banco…).
 */
export function Pendiente({ texto, definitivo, donde }: {
  texto?: ReactNode
  definitivo?: boolean
  donde?: string
}) {
  const etiqueta = texto ?? (definitivo ? 'No disponible' : 'Sin revisar')
  return (
    <span
      title={donde ? `Mientras tanto: ${donde}` : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center',
        fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
        color: 'var(--muted)', background: 'transparent',
        // El borde va en `--muted`, NO en `--border`: en oscuro `--border` (#1f2a3c) sobre la
        // superficie (#101827) es casi invisible, y un hueco que no se ve es exactamente el
        // problema que este componente existe para resolver.
        border: `1px ${definitivo ? 'solid' : 'dashed'} var(--muted)`,
        whiteSpace: 'nowrap', cursor: donde ? 'help' : undefined,
      }}
    >{etiqueta}</span>
  )
}

/**
 * Pinta un valor respetando sus tres estados.
 *
 *   <Dato valor={f.cargas} vacio="Sin cargas" donde="la certificación de cargas">
 *     {eur(f.cargas)}
 *   </Dato>
 *
 * `children` es cómo se pinta el valor cuando LO HAY (ya formateado por quien llama). `vacio` es
 * el texto de «revisado, no hay»; si no se pasa, un array vacío cae al render normal.
 *
 * ⚠️ Un `0` numérico es un VALOR, no un vacío: «0 €» es una afirmación legítima y se pinta. Lo que
 * nunca se pinta como 0 es el `null`.
 *
 * `definitivo` para cuando la fuente NUNCA va a traer ese dato (los lotes de la Junta no tienen
 * ficha con adjuntos): prometer una pasada que no va a llegar es la otra forma de mentir.
 */
export function Dato({ valor, children, pendiente, vacio, definitivo, donde }: {
  valor: unknown
  children?: ReactNode
  pendiente?: ReactNode
  vacio?: ReactNode
  definitivo?: boolean
  donde?: string
}) {
  const estado = estadoDato(valor)
  if (estado === 'pendiente') return <Pendiente texto={pendiente} definitivo={definitivo} donde={donde} />
  if (estado === 'vacio' && vacio !== undefined) {
    return <span style={{ color: 'var(--muted)', fontSize: 13 }}>{vacio}</span>
  }
  return <>{children ?? String(valor)}</>
}

// ─── Barras y tablas ─────────────────────────────────────────────────────────────────────────

/**
 * Barra fina de progreso. `alto` y `track` son configurables porque cablearlos era justo lo que
 * dejaba la primitiva sin adoptar: de los 11 sitios que pintan esta barra a mano (medido
 * 02/09/2026) solo 3 usaban 6px. El radio no hace falta parametrizarlo — 999 se clampa a la
 * mitad del alto, así que una barra de 4px sale con el radio 2 que se dibujaba a mano.
 */
export function ThinBar({ pct, color, width, alto, track }: {
  pct: number
  color?: string
  width?: number | string
  alto?: number
  track?: string
}) {
  return (
    <div style={{ background: track || 'var(--primary-light)', borderRadius: 999, height: alto ?? 6, width: width ?? '100%', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ height: '100%', borderRadius: 999, background: color || 'var(--primary)', width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  )
}

/**
 * Envoltorio de tabla ancha: scroll horizontal PROPIO, para que el cuerpo de la página nunca
 * scrollee de lado (regla responsive del CLAUDE.md raíz).
 */
export function TablaScroll({ children }: { children: ReactNode }) {
  return <div className="overflow-table" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>{children}</div>
}

