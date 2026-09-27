'use client'
// Rejilla de ocupación de la tarjeta «Pisos» de Inicio. Es cliente solo por una cosa: al pinchar
// una barra se abre debajo el detalle de esa reserva (mismo gesto que /sivra/calendario).
import { useState } from 'react'
import { TablaScroll } from '@/components/ui'
import { PORTAL_COLORS, PORTAL_LABELS } from '@/lib/portales'
import { eur } from '@/lib/dinero'
import type { Barra, ReservaCal } from '@/lib/inicio-resumen'

const LETRA = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

type Fila = { id: string; label: string; color: string; barras: Barra[] }

const fecha = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const noches = (r: ReservaCal) => Math.max(1, Math.round((Date.parse(r.checkOut) - Date.parse(r.checkIn)) / 86_400_000))
const portalDe = (r: ReservaCal) => (r.portal ?? '').toUpperCase()

export default function CalendarioReservas({ dias, filas }: { dias: string[]; filas: Fila[] }) {
  const [sel, setSel] = useState<{ fila: string; i: number } | null>(null)
  const n = dias.length
  const filaSel = sel ? filas.find(f => f.id === sel.fila) : undefined
  const reserva = filaSel?.barras[sel!.i]?.reserva

  return (
    <>
      <TablaScroll>
        <div role="table" aria-label={`Ocupación de los próximos ${n} días`} style={{ display: 'grid', gridTemplateColumns: `120px repeat(${n}, minmax(34px, 1fr))`, minWidth: 600, fontSize: 12, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div role="row" style={{ display: 'contents' }}>
            <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }} />
            {dias.map((dia, i) => {
              const w = new Date(`${dia}T12:00:00Z`).getUTCDay()
              return (
                <div key={dia} role="columnheader" style={{ textAlign: 'center', padding: '6px 0', background: w === 0 || w === 6 ? 'var(--border)' : 'var(--bg)', borderBottom: '1px solid var(--border)', color: i === 0 ? 'var(--primary)' : 'var(--muted)', fontWeight: i === 0 ? 700 : 400 }}>
                  {LETRA[w]}<br />{Number(dia.slice(8))}
                </div>
              )
            })}
          </div>
          {filas.map(p => (
            <div key={p.id} role="row" style={{ display: 'contents' }}>
              <div role="rowheader" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 40, borderBottom: '1px solid var(--border)', fontWeight: 600, position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1 }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: p.color, flexShrink: 0 }} />{p.label}
              </div>
              <div style={{ gridColumn: `2 / span ${n}`, position: 'relative', height: 40, borderBottom: '1px solid var(--border)' }}>
                {p.barras.map((b, i) => {
                  const activa = sel?.fila === p.id && sel.i === i
                  return (
                    <button key={i} type="button" onClick={() => setSel(activa ? null : { fila: p.id, i })} aria-pressed={activa}
                      title={`${b.huesped ?? 'Reserva'} · ${PORTAL_LABELS[(b.portal ?? '').toUpperCase()] ?? b.portal ?? 'sin portal'}`}
                      style={{
                        position: 'absolute', top: 4, height: 32, border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left',
                        left: `calc(${(b.desde / n) * 100}% + ${b.cortadaIzq ? 0 : 4}px)`,
                        width: `calc(${((b.hasta - b.desde) / n) * 100}% - ${b.cortadaIzq ? 4 : 8}px)`,
                        borderRadius: 6, background: PORTAL_COLORS[(b.portal ?? '').toUpperCase()] ?? PORTAL_COLORS.OTRO,
                        outline: activa ? '2px solid var(--text)' : 'none', outlineOffset: 1,
                        color: '#fff', fontSize: 11, fontWeight: 600, padding: '0 7px', display: 'block',
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      }}>
                      {b.huesped ?? ''}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </TablaScroll>

      {reserva && filaSel && (() => {
        const nn = noches(reserva)
        const pt = portalDe(reserva)
        const dato = (et: string, v: React.ReactNode) => (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{et}</div>
            <div style={{ fontWeight: 600, color: 'var(--text)', overflowWrap: 'anywhere' }}>{v}</div>
          </div>
        )
        return (
          <div role="region" aria-label="Detalle de la reserva" style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--bg)', display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', overflowWrap: 'anywhere' }}>{reserva.huesped || 'Huésped sin nombre'}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{filaSel.label}</div>
              </div>
              <button type="button" onClick={() => setSel(null)} aria-label="Cerrar detalle"
                style={{ minWidth: 44, minHeight: 44, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, fontSize: 13 }}>
              {dato('Entrada', fecha(reserva.checkIn))}
              {dato('Salida', fecha(reserva.checkOut))}
              {dato('Noches', nn)}
              {dato('Huéspedes', reserva.pax != null ? `${reserva.pax} pax` : 'sin dato')}
              {dato('Importe', reserva.importe != null ? `${eur(reserva.importe)} · ${eur(reserva.importe / nn)}/n` : 'sin dato')}
              {dato('Portal', pt ? (
                <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: PORTAL_COLORS[pt] ?? PORTAL_COLORS.OTRO, color: '#fff' }}>{PORTAL_LABELS[pt] ?? pt}</span>
              ) : 'sin portal')}
            </div>
          </div>
        )
      })()}
    </>
  )
}
