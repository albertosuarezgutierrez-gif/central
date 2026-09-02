'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import type { ResumenPilar, ClientePilar, TrimPilar } from '@/lib/finanzas'
import { eur } from '@/lib/dinero'
import { PageHeader } from '@/components/ui'
import { CircleUser } from 'lucide-react'

type Props = {
  initialData: ResumenPilar | null
  year: number
  quarter: number
}

function fmt(n: number) {
  return eur(n)
}
function fmtDec(n: number) {
  return eur(n)
}

const ESTADO_BADGE: Record<TrimPilar['estado'], { label: string; bg: string; color: string }> = {
  pasado: { label: '✓ Plazo pasado', bg: 'var(--positive-bg)', color: 'var(--positive)' },
  proximo: { label: '⚠️ Próximo', bg: 'var(--warning-bg)', color: 'var(--warning)' },
  futuro: { label: 'Pendiente', bg: 'var(--border)', color: 'var(--muted)' },
}

function KpiCard({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color }}>{fmt(value)}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

function MiniChart({ porMes }: { porMes: ResumenPilar['porMes'] }) {
  if (!porMes.length) return null
  const max = Math.max(...porMes.map(m => Math.max(m.ingresos, m.gastos)), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '50px', marginTop: '10px' }}>
      {porMes.map(m => (
        <div key={m.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '44px', gap: '2px' }}>
            <div style={{ width: '100%', height: `${(m.gastos / max) * 44}px`, background: '#fc8181', borderRadius: '2px 2px 0 0', minHeight: m.gastos > 0 ? '2px' : 0 }} />
            <div style={{ width: '100%', height: `${(m.ingresos / max) * 44}px`, background: '#9f7aea', borderRadius: '2px 2px 0 0', minHeight: m.ingresos > 0 ? '2px' : 0 }} />
          </div>
          <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{m.mes.slice(5)}</div>
        </div>
      ))}
    </div>
  )
}

function ClientesTable({ clientes }: { clientes: ClientePilar[] }) {
  if (!clientes.length) return <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Sin cobros registrados.</p>
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '6px', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', padding: '4px 0', borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
        <span>Cliente</span>
        <span style={{ textAlign: 'right' }}>Cobros</span>
        <span style={{ textAlign: 'right' }}>Total</span>
        <span style={{ textAlign: 'right' }}>%</span>
      </div>
      {clientes.map(c => (
        <div key={c.contraparte} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '6px', fontSize: '12px', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.contraparte}</span>
          <span style={{ textAlign: 'right', color: 'var(--muted)' }}>{c.numCobros}</span>
          <span style={{ textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>{fmt(c.total)}</span>
          <span style={{ textAlign: 'right', fontWeight: c.pct >= 75 ? 700 : 400, color: c.pct >= 75 ? 'var(--negative)' : 'var(--muted)' }}>{c.pct.toFixed(0)}%</span>
        </div>
      ))}
    </div>
  )
}

const SEDE_130 = 'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/G415.shtml'

export default function PilarClient({ initialData, year, quarter }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const d = initialData

  function navigate(y: number, q: number) {
    startTransition(() => {
      router.push(`${pathname}?year=${y}&q=${q}`)
    })
  }

  const periodoLabel = quarter === 0 ? `Año ${year}` : `Q${quarter} ${year}`

  return (
    <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Controles */}
      <div style={{ marginBottom: '10px' }}>
        <a href="/banca?tab=ingresos" style={{ fontSize: '13px', color: 'var(--muted)', textDecoration: 'none' }}>← Ingresos</a>
      </div>
      <PageHeader
        titulo="Actividad de Pilar"
        icono={<CircleUser size={20} strokeWidth={1.75} />}
        acciones={<>
          <select
            value={year}
            onChange={e => navigate(parseInt(e.target.value), quarter)}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px' }}
          >
            {(d?.yearsDisponibles ?? [year]).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['Año', 'Q1', 'Q2', 'Q3', 'Q4'] as const).map((label, i) => (
              <button key={i} onClick={() => navigate(year, i)} style={{
                padding: '5px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                border: '1px solid var(--border)',
                background: quarter === i ? '#9f7aea' : 'var(--surface)',
                color: quarter === i ? '#fff' : 'var(--text)',
                fontWeight: quarter === i ? 700 : 400,
              }}>{label}</button>
            ))}
          </div>
          {isPending && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Cargando…</span>}
        </>}
      />

      {!d || !d.tieneExtracto ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🟣</div>
          <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Aún no hay extractos de Pilar</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '20px', maxWidth: '400px', margin: '0 auto 20px' }}>
            Importa el extracto de su banco desde la sección <strong>Banca</strong> seleccionando <em>"Cónyuge (Pilar)"</em> como titular.
            Los movimientos se clasificarán automáticamente.
          </div>
          <a href="/banca" style={{ display: 'inline-block', padding: '10px 20px', background: '#9f7aea', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontWeight: 700 }}>
            ⬆️ Importar extracto de Pilar
          </a>
        </div>
      ) : (
        <>
          {/* Notas manuales (p.ej. importes estimados al cargar un extracto a mano) */}
          {d.notas.length > 0 && (
            <div style={{ background: 'var(--info-bg)', border: '1px solid #63b3ed', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: 'var(--info)' }}>
              {d.notas.map((n, i) => (
                <div key={i} style={i > 0 ? { marginTop: '6px' } : undefined}>📝 {n}</div>
              ))}
            </div>
          )}

          {/* Alerta concentración */}
          {d.alertaConcentracion && (
            <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#856404' }}>
              {d.alertaConcentracion}
            </div>
          )}

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <KpiCard label="Cobros clientes" value={d.cobros} color="#9f7aea" sub={periodoLabel} />
            <KpiCard label="Gastos profesionales" value={d.gastosProfesionales} color="var(--negative)" />
            <KpiCard label="Cuota autónomos" value={d.cuotaAutonomos} color="var(--negative)" />
            <KpiCard label="Rendimiento neto" value={d.rendimientoNeto} color={d.rendimientoNeto >= 0 ? 'var(--positive)' : 'var(--negative)'} sub={`Ret. est. 15%: ${fmt(d.retenciones)}`} />
          </div>

          {/* Evolución mensual */}
          {d.porMes.length > 1 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>Evolución mensual</div>
              <MiniChart porMes={d.porMes} />
              <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '11px' }}>
                <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#9f7aea', borderRadius: '2px', marginRight: '4px' }} />Cobros</span>
                <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#fc8181', borderRadius: '2px', marginRight: '4px' }} />Gastos</span>
              </div>
            </div>
          )}

          {/* Grid 2 columnas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '16px' }}>

            {/* Modelo 130 */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>💰 Modelo 130 — IRPF fraccionado</div>
                <a href={SEDE_130} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: 'var(--primary)', textDecoration: 'none' }}>Sede AEAT →</a>
              </div>
              {d.trimestres.map(t => {
                const badge = ESTADO_BADGE[t.estado]
                return (
                  <div key={t.q} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px' }}>Q{t.q}</span>
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: badge.bg, color: badge.color, fontWeight: 600 }}>{badge.label}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Hasta {t.plazo}</div>
                    {t.rendimientoNeto <= 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>Resultado negativo → no hay pago</div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: 'var(--muted)' }}>Rend. neto: {fmt(t.rendimientoNeto)} × 20%</span>
                        <span style={{ fontWeight: 700, color: t.pagoFraccionado > 0 ? 'var(--negative)' : 'var(--positive)' }}>
                          {t.pagoFraccionado > 0 ? `Ingresar ${fmt(t.pagoFraccionado)}` : 'Ret. cubren todo'}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
              <div style={{ marginTop: '10px', fontSize: '10px', color: 'var(--muted)', background: 'var(--primary-light)', borderRadius: '4px', padding: '6px 8px' }}>
                Retenciones del 15% que los clientes ingresan directamente en Hacienda — no aparecen en el banco pero reducen el pago.
              </div>
            </div>

            {/* Clientes */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px' }}>👥 Clientes {periodoLabel}</div>
              <ClientesTable clientes={d.clientes} />
            </div>
          </div>

          {/* Movimientos recientes */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px' }}>📋 Movimientos recientes</div>
            {d.recientes.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Sin movimientos en este periodo.</p>
            ) : (
              d.recientes.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', fontSize: '12px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap', minWidth: '36px' }}>{m.fecha?.slice(5) ?? '—'}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.concepto}</span>
                  {m.categoria && (
                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: 'var(--primary-light)', color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                      {m.categoria === 'cobro_cliente' ? 'cobro' : m.categoria === 'cuota_autonomos' ? 'TGSS' : 'gasto prof.'}
                    </span>
                  )}
                  <span style={{ fontWeight: 700, color: m.importe >= 0 ? '#9f7aea' : 'var(--negative)', whiteSpace: 'nowrap' }}>
                    {m.importe >= 0 ? '+' : ''}{fmt(m.importe)}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Enlace a importar más */}
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <a href="/banca" style={{ fontSize: '13px', color: 'var(--primary)', textDecoration: 'none' }}>⬆️ Subir extracto de Pilar</a>
          </div>
        </>
      )}
    </main>
  )
}
