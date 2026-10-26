'use client'

import { useState } from 'react'
import { btnStyle } from '@/components/ui'
import type { VistaIngesta } from '@/lib/correduria/ingesta-pantalla'
import { agregarContadores, type Contador, type Destino } from './secciones'
import { lineaEstadoIngesta } from './hoy-cockpit'
import Aprobaciones from './Aprobaciones'
import Anulaciones from './Anulaciones'
import BajasPue from './BajasPue'

/**
 * El cockpit de «Gestión» (antes «Hoy»; pieza 1-4 de ASegura OS). Desde el 13/10/2026 NO lleva la franja de
 * cuatro contadores, ni las tareas de hoy, ni las pérdidas de cartera: viven en «Mi mesa»
 * (`/correduria/mesa`). Las incidencias NO se repintan aquí: son los bloques de siempre, justo debajo
 * (`#incidencias`).
 *
 * Desde el 26/10/2026 (Alberto: «mucho lío») lo que es AVISO PUNTUAL vive en la campana de la cabecera
 * (`CampanaAvisos`): la línea de la ingesta solo se pinta si está en ROJO; «Clientes en el portal · 24 h», las cartas
 * del mediador, las solicitudes del portal y Patrimonio se desmontaron de aquí (los componentes siguen; la campana monta
 * las tres colas completas dentro de su panel). Aquí queda el TRABAJO: anulaciones, bajas PUE, lo que espera tu OK.
 *
 * Todo número tiene tres estados: `undefined` = cargando (no se pinta),
 * `null` = no se ha podido mirar («!», nunca 0) y el número.
 */

type N = number | null | undefined

/** Un contador agregado: «n+» si alguna cola no se pudo leer (es un SUELO, no el total). */
function cifraC(c: Contador | null | undefined): string {
  return c === undefined ? '…' : c === null ? '!' : `${c.n}${c.parcial ? '+' : ''}`
}

export default function HoyCockpit({
  ingesta, nIncidencias, nBlog, onIr,
}: {
  ingesta: VistaIngesta | null
  /** Todas las colas de los bloques de debajo (las mismas que el badge de la pestaña). */
  nIncidencias: Contador | null | undefined
  nBlog: N
  onIr: (s: Destino) => void
}) {
  const [nAprobaciones, setNAprobaciones] = useState<N>(undefined)
  const [nBajasPue, setNBajasPue] = useState<N>(undefined)

  const nOk = nBlog === undefined || nAprobaciones === undefined || nBajasPue === undefined ? undefined : agregarContadores([nBlog, nAprobaciones, nBajasPue])
  const estado = lineaEstadoIngesta(ingesta)

  return (
    <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'minmax(0, 1fr)', marginBottom: 8 }}>
      {/* La salud de CIMA solo ocupa sitio si está en ROJO; ámbar y «sin comprobar» los dice la campana. */}
      {estado.tono === 'malo' && (
        <span role="alert" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--negative)' }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--negative)' }} />
          {estado.texto}
          <button type="button" onClick={() => onIr('ingesta')} style={{ ...btnStyle('sutil', 'sm'), padding: '0 6px', minHeight: 44 }}>Ver</button>
        </span>
      )}

      <Anulaciones />
      <BajasPue onContador={setNBajasPue} />

      {/* ── Esperan tu OK ─────────────────────────────────────────── */}
      <section id="esperan-ok" style={{ display: 'grid', gap: 6 }}>
        <h2 style={TITULO}>Esperan tu OK{nOk && nOk.n > 0 ? ` · ${cifraC(nOk)}` : ''}</h2>
        <Aprobaciones onContador={setNAprobaciones} />
        <FilaOk n={nBlog} titulo="Artículos del blog" sub="Escritos y pendientes de publicar." onClick={() => onIr('redes')} />
        {nOk && nOk.n === 0 && !nOk.parcial && <p style={NOTA}>Nada esperando tu OK.</p>}
        {nOk === null && <p style={{ ...NOTA, color: 'var(--negative)' }}>No se ha podido comprobar qué espera tu OK. No significa que no haya nada.</p>}
      </section>

      {/* Las incidencias son los bloques de siempre, justo debajo. */}
      <h2 id="incidencias" style={TITULO}>Avisos{nIncidencias !== undefined && (nIncidencias === null || nIncidencias.n > 0) ? ` · ${cifraC(nIncidencias)}` : ''}</h2>
    </div>
  )
}

function FilaOk({ n, titulo, sub, onClick }: { n: N; titulo: string; sub: string; onClick: () => void }) {
  if (n === 0 || n === undefined) return null
  return (
    <button type="button" onClick={onClick}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 48, padding: '8px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
      <span style={{ display: 'grid', gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{titulo}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</span>
      </span>
      <span style={{ fontWeight: 700, fontSize: 16 }}>{n === null ? '!' : n} ›</span>
    </button>
  )
}

const TITULO: React.CSSProperties = { margin: 0, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }
const NOTA: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--muted)' }
