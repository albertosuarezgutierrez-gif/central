'use client'
import { UMBRAL_SUBIDA_GENERAL_PCT, etiquetaVeredictoPrima, type Anualidad, type EvolucionPrima as Evolucion, type VeredictoPrima } from '@central/module-seguros'
import { eur } from '@/lib/dinero'
import Link from 'next/link'
import { fechaEs, type EvolucionPrimaCompacta } from '@/lib/ficha-asegura'

/**
 * «¿Por qué ha subido la prima?» — lo que el cliente pregunta al renovar y lo
 * que Alberto tiene que poder contestar sin llamar a la compañía. La regla
 * vive en `@central/module-seguros` (`prima-evolucion.ts`) y la calcula
 * asegura; aquí solo se pinta.
 *
 * TRES cosas distintas en pantalla, y ninguna se colapsa en otra:
 *   · `null`      → la versión desplegada de asegura no manda el bloque
 *                   («evolución no disponible»). No se sabe nada.
 *   · `sin_datos` → asegura miró y CIMA no da la anualidad anterior (o el
 *                   ciclo está incompleto). Se sabe que NO se puede comparar.
 *   · `igual`     → se comparó y no ha cambiado.
 *
 * Dos modos: `chip` para la fila de póliza en la ficha del cliente y
 * `tarjeta` para la página de la póliza (frase + anualidades apiladas).
 */

type Retarificar =
  /** El mismo destino que usa la cabecera de la póliza (asegura, donde se gasta el dinero). */
  | { href: string; rotulo: string }
  /** No hay salto: se dice «candidata» sin inventar URL, con el motivo si asegura lo dio. */
  | { motivo: string | null }

type Props =
  | { modo: 'chip'; evolucion: EvolucionPrimaCompacta | Evolucion | null }
  | { modo: 'tarjeta'; evolucion: Evolucion | null; retarificar?: Retarificar }

export default function EvolucionPrima(props: Props) {
  if (props.modo === 'chip') return <Chip evolucion={props.evolucion} />
  return <Tarjeta evolucion={props.evolucion} retarificar={props.retarificar} />
}

const NO_DISPONIBLE = 'La versión desplegada de asegura no manda la evolución de la prima: no se sabe si ha subido.'

/** «+14,0 %» / «−3,2 %» / «0,0 %» en es-ES con un decimal. */
function pctEs(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
}

function flecha(v: number | null): string {
  if (v === null) return ''
  if (v > 0) return '↑'
  if (v < 0) return '↓'
  return '→'
}

function Chip({ evolucion }: { evolucion: EvolucionPrimaCompacta | Evolucion | null }) {
  if (evolucion === null) {
    return <span style={{ ...chipBase, ...chipNoDisponible }} title={NO_DISPONIBLE}>evolución no disponible</span>
  }
  return (
    <span style={{ ...chipBase, ...tonoChip(evolucion.veredicto) }} title={evolucion.explicacion}>
      {etiquetaVeredictoPrima(evolucion.veredicto)}
      {evolucion.variacionPct !== null && <> · {pctEs(evolucion.variacionPct)}</>}
    </span>
  )
}

function Tarjeta({ evolucion, retarificar }: { evolucion: Evolucion | null; retarificar?: Retarificar }) {
  return (
    <div style={{ border: `1px ${evolucion === null ? 'dashed' : 'solid'} var(--border)`, borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>💶 ¿Por qué ha subido la prima?</span>
        <Chip evolucion={evolucion} />
      </div>
      {evolucion === null ? (
        <p style={parrafo}>{NO_DISPONIBLE}</p>
      ) : (
        <Cuerpo evolucion={evolucion} retarificar={retarificar} />
      )}
    </div>
  )
}

function Cuerpo({ evolucion, retarificar }: { evolucion: Evolucion; retarificar?: Retarificar }) {
  const candidata =
    evolucion.veredicto === 'sube_sin_siniestro' && evolucion.variacionPct !== null && evolucion.variacionPct > UMBRAL_SUBIDA_GENERAL_PCT
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <p style={{ ...parrafo, color: 'var(--text)' }}>{evolucion.explicacion}</p>

      {candidata && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {retarificar && 'href' in retarificar ? (
            /* Interna desde el 03/09/2026 (ver `urlRetarificar`). */
            <Link href={retarificar.href} style={botonRetarificar}>{retarificar.rotulo}</Link>
          ) : (
            <span style={{ ...chipBase, ...chipAviso }}>candidata a retarificar</span>
          )}
          {retarificar && 'motivo' in retarificar && retarificar.motivo && (
            <span style={sub}>No se puede pedir precio desde aquí: {retarificar.motivo}</span>
          )}
        </div>
      )}

      {evolucion.siniestrosSinFecha > 0 && (
        <p style={{ ...parrafo, ...avisoSinFecha }}>
          ⚠️ {evolucion.siniestrosSinFecha} siniestro(s) sin fecha: no se sabe a qué anualidad pertenecen, así que no
          cuentan en ningún ciclo de abajo.
        </p>
      )}

      {evolucion.anualidades.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {evolucion.anualidades.map((a) => <TarjetaAnualidad key={a.desde} a={a} />)}
        </ul>
      )}

      <p style={sub}>
        La prima de cada anualidad sale de sumar los recibos de renovación (CA/NP) de aniversario a aniversario; los
        suplementos son cambios a mitad de ciclo y se cuentan aparte.
      </p>
    </div>
  )
}

function TarjetaAnualidad({ a }: { a: Anualidad }) {
  const incompleta = !a.completa
  return (
    <li style={{ border: `1px ${incompleta ? 'dashed' : 'solid'} var(--border)`, borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 4, fontSize: 13, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{fechaEs(a.desde)} → {fechaEs(a.hasta)}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>
        {a.primaTotal !== null
          ? eur(a.primaTotal)
          : a.recibos > 0
            ? <span style={{ color: 'var(--muted)', fontWeight: 400 }} title="Algún recibo del ciclo trae un importe con forma inesperada en el EIAC">ilegible</span>
            : <span style={{ color: 'var(--muted)', fontWeight: 400 }} title="En este ciclo no hay recibos de renovación; puede haber solo siniestros">sin recibos</span>}
        {a.variacionPct !== null && (
          <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 8, color: tonoVariacion(a.variacionPct) }}>
            {flecha(a.variacionPct)} {pctEs(a.variacionPct)}
          </span>
        )}
      </div>
      {a.primaNeta !== null && a.primaTotal !== null && a.primaNeta !== a.primaTotal && (
        <div style={sub}>neta {eur(a.primaNeta)}</div>
      )}
      <div style={{ color: incompleta ? 'var(--warning)' : 'var(--muted)', fontSize: 12 }}>
        {incompleta && '⚠️ '}
        {a.recibos} recibo(s)
        {a.esperados !== null ? ` de ${a.esperados}` : ' · ciclo sin fraccionamiento informado'}
        {incompleta && a.esperados !== null && a.recibos < a.esperados && ' · ciclo incompleto'}
      </div>
      <div style={{ fontSize: 12, color: a.siniestros > 0 ? 'var(--negative)' : 'var(--muted)' }}>
        {a.siniestros > 0 ? `🚨 ${a.siniestros} siniestro(s) en el ciclo` : 'sin siniestros fechados en el ciclo'}
      </div>
      {a.suplementos > 0 && <div style={sub}>{a.suplementos} suplemento(s) a mitad de ciclo</div>}
    </li>
  )
}

function tonoVariacion(v: number): string {
  if (v > 0) return 'var(--negative)'
  if (v < 0) return 'var(--positive)'
  return 'var(--muted)'
}

/** El color del chip lo pone el veredicto: subir es aviso, bajar es bueno, no saber es gris punteado. */
function tonoChip(v: VeredictoPrima): React.CSSProperties {
  switch (v) {
    case 'sube_por_siniestros':
    case 'sube_sin_siniestro':
    case 'no_atribuible':
      return chipAviso
    case 'baja':
      return { background: 'var(--positive-bg)', color: 'var(--text)', border: '1px solid var(--positive)' }
    case 'igual':
      return { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }
    case 'sin_datos':
      return { background: 'transparent', color: 'var(--muted)', border: '1px dashed var(--border)' }
  }
}

const chipBase: React.CSSProperties = {
  display: 'inline-block', fontSize: 11, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap', lineHeight: 1.5,
}
const chipAviso: React.CSSProperties = { background: 'var(--warning-bg)', color: 'var(--text)', border: '1px solid var(--warning)' }
const chipNoDisponible: React.CSSProperties = { background: 'transparent', color: 'var(--muted)', border: '1px dotted var(--border)' }
const avisoSinFecha: React.CSSProperties = { border: '1px solid var(--warning)', background: 'var(--warning-bg)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)' }
// ≥44 px táctil: es el botón que manda a gastar dinero.
const botonRetarificar: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 14px', borderRadius: 10,
  background: 'var(--primary)', color: 'var(--surface)', fontWeight: 600, fontSize: 13, textDecoration: 'none',
}
const parrafo: React.CSSProperties = { margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }
const sub: React.CSSProperties = { margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }
