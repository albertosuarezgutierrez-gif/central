'use client'
import { useState } from 'react'

import { eur } from '@/lib/dinero'
import { btnStyle } from '@/components/ui'
import { leerListaAvant2, origenProyecto, rutaTarificacion, type ListaAvant2, type ProyectoAvant2 } from '@/lib/correduria/avant2-proyectos'

/**
 * Los presupuestos del cliente en Avant2, hechos en la web o aquí (29/09/2026). Alberto: «para ser
 * indiferente hacerlo en ambos lados». Los de la web se traen como una tarificación más (con su
 * oportunidad) y desde ahí se comparan, se mandan y se emiten igual. Nada de esto tarifica: 0€.
 *
 * No se carga sola: son hasta 11 lecturas al vendor, y la ficha no tiene por qué esperarlas.
 */
export default function PresupuestosAvant2({ clienteId }: { clienteId: string }) {
  const [lista, setLista] = useState<ListaAvant2 | 'cargando' | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  async function cargar() {
    setLista('cargando')
    try {
      const r = await fetch(`/api/correduria/avant2-proyectos?clienteId=${encodeURIComponent(clienteId)}`, { cache: 'no-store' })
      setLista(leerListaAvant2(r.status, await r.json().catch(() => null)))
    } catch {
      setLista({ estado: 'error', mensaje: 'se cortó la conexión' })
    }
  }

  async function traer(p: ProyectoAvant2) {
    setOcupado(p.projectId); setAviso(null)
    try {
      const r = await fetch('/api/correduria/avant2-proyectos', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clienteId, projectId: p.projectId }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; mensaje?: string } | null
      if (r.ok && (j?.estado === 'importada' || j?.estado === 'ya_estaba')) {
        setAviso({ ok: true, texto: `Presupuesto ${p.projectId} ya está en plataforma${j.estado === 'ya_estaba' ? ' (ya estaba)' : ''}.` })
      } else {
        setAviso({ ok: false, texto: `NO traído: ${j?.mensaje ?? `HTTP ${r.status}`}` })
      }
    } catch {
      setAviso({ ok: false, texto: 'Se cortó la conexión: recarga la lista antes de repetir.' })
    } finally {
      setOcupado(null)
      void cargar()
    }
  }

  return (
    <section style={CAJA}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 15 }}>En Avant2, sin traer</strong>
        <button type="button" style={btnStyle('secundario', 'sm')} onClick={() => void cargar()} disabled={lista === 'cargando'}>
          {lista === null ? 'Ver los de Avant2' : lista === 'cargando' ? 'Mirando…' : 'Recargar'}
        </button>
      </div>
      <p style={NOTA}>Lo tarificado en la web de Avant2 que aún no está aquí. Mirar y traer es gratis: no se vuelve a tarificar.</p>
      {aviso && <p style={{ ...NOTA, color: aviso.ok ? 'var(--positive)' : 'var(--negative)' }}>{aviso.texto}</p>}
      {lista !== null && lista !== 'cargando' && lista.estado === 'error' && (
        <p style={NOTA}>No se han podido mirar ({lista.mensaje}). No quiere decir que no haya ninguno.</p>
      )}
      {lista !== null && lista !== 'cargando' && lista.estado === 'ok' && lista.proyectos.length === 0 && (
        <p style={NOTA}>Avant2 no tiene presupuestos a su DNI en el último año (se miran los 10 más recientes).</p>
      )}
      {lista !== null && lista !== 'cargando' && lista.estado === 'ok' && lista.proyectos.length > 0 && (() => {
        // Lo ya traído sale en su oportunidad (o en «sin oportunidad») con el precio de la intranet:
        // repetirlo aquí con el «mejor» del vendor daba dos primas para el mismo proyecto.
        const sinTraer = lista.proyectos.filter((p) => !p.intranet)
        const traidos = lista.proyectos.length - sinTraer.length
        return (
          <>
            {traidos > 0 && <p style={NOTA}>{traidos === 1 ? '1 ya está' : `${traidos} ya están`} en plataforma: sale{traidos === 1 ? '' : 'n'} arriba, en su oportunidad o en «presupuestos sin oportunidad».</p>}
            {sinTraer.length === 0
              ? <p style={NOTA}>Nada pendiente de traer.</p>
              : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                  {sinTraer.map((p) => <Fila key={p.projectId} p={p} clienteId={clienteId} ocupado={ocupado} traer={traer} />)}
                </ul>
              )}
          </>
        )
      })()}
    </section>
  )
}

function Fila({ p, clienteId, ocupado, traer }: { p: ProyectoAvant2; clienteId: string; ocupado: string | null; traer: (p: ProyectoAvant2) => void }) {
  const origen = origenProyecto(p)
  const ruta = rutaTarificacion(clienteId, p.ramo, p.intranet)
  return (
    <li style={FILA}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'baseline' }}>
        <strong>nº {p.projectId}</strong>
        <span style={NOTA}>{p.creadoEn ? new Date(p.creadoEn).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' }) : 'fecha no consta'}</span>
        <span style={ETIQUETA}>{origen}</span>
      </div>
      {p.error ? (
        <p style={NOTA}>No se ha podido leer este proyecto: {p.error}</p>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 14 }}>
            {p.lineaNombre ?? p.ramo ?? 'ramo no consta'}{p.riesgo ? ` · ${p.riesgo}` : ''}{p.companiaAnterior ? ` · antes en ${p.companiaAnterior}` : ''}
          </p>
          <p style={{ margin: 0, fontSize: 14 }}>
            {p.mejor && p.mejor.primaEur !== null
              ? <>Mejor: <strong>{eur(p.mejor.primaEur)}</strong> {p.mejor.compania ?? ''} {p.mejor.modalidad ?? ''} · {p.mejor.firme ? 'confirmado por la compañía' : 'estimado'}</>
              : 'Sin precio'}
            {` · ${p.precios} precios, ${p.confirmados} confirmados`}
          </p>
        </>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {!p.intranet && !p.error && p.ramo && ruta && (
          <button type="button" style={btnStyle('primario', 'md')} disabled={ocupado !== null} onClick={() => traer(p)}>
            {ocupado === p.projectId ? 'Trayendo…' : 'Traer a plataforma'}
          </button>
        )}
        {p.intranet && ruta && <a href={ruta} style={btnStyle('secundario', 'md')}>Abrir en plataforma</a>}
        {!ruta && !p.error && <span style={NOTA}>Este ramo aún no se puede traer.</span>}
        {p.avant2Url && <a href={p.avant2Url} target="_blank" rel="noreferrer" style={btnStyle('sutil', 'md')}>Abrir en Avant2</a>}
      </div>
    </li>
  )
}

const CAJA: React.CSSProperties = { display: 'grid', gap: 8, padding: 12, border: '1px solid var(--border)', borderRadius: 10, marginTop: 12, minWidth: 0 }
const FILA: React.CSSProperties = { display: 'grid', gap: 4, padding: 10, border: '1px solid var(--border)', borderRadius: 8, minWidth: 0, overflowWrap: 'anywhere' }
const NOTA: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--muted)' }
const ETIQUETA: React.CSSProperties = { fontSize: 12, padding: '2px 8px', borderRadius: 999, background: 'var(--info-bg)', color: 'var(--info)' }
