'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { eur } from '@/lib/dinero'

const DESTINO_LABEL: Record<string, string> = {
  personal: 'Personal',
  seguros: 'Seguros',
  turistico_pisos: 'Pisos',
  turistico_duplex: 'Dúplex',
  traspaso_interno: 'Traspaso',
}

type Mov = {
  id: string
  fecha: string | null
  concepto: string | null
  importe: number
  destino: string | null
  destinoConfirmado: boolean | null
  requiereRevision: boolean | null
  conciliado: boolean | null
}

type Tarjeta = {
  cuentaBancariaId: string
  ibanMascara: string | null
  banco: string | null
  alias: string | null
  movimientos: Mov[]
}

function mesLabel(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

function prevMes(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
function nextMes(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

function TarjetaCard({ t, mes }: { t: Tarjeta; mes: string }) {
  const [mostrarTodos, setMostrarTodos] = useState(false)
  const cargos = t.movimientos.filter(m => m.importe < 0)
  const abonos = t.movimientos.filter(m => m.importe >= 0)
  const totalGastado = cargos.reduce((s, m) => s + Math.abs(m.importe), 0)
  const totalAbonado = abonos.reduce((s, m) => s + m.importe, 0)
  const sinClasificar = cargos.filter(m => !m.destino || m.requiereRevision).length

  const porDestino: Record<string, number> = {}
  for (const m of cargos) {
    const d = m.destino ?? 'sin_clasificar'
    porDestino[d] = (porDestino[d] ?? 0) + Math.abs(m.importe)
  }

  const top10 = [...cargos].sort((a, b) => a.importe - b.importe).slice(0, 10)
  const label = t.alias || `${t.banco ?? 'Tarjeta'} ${t.ibanMascara ?? ''}`.trim()
  const mostrar = mostrarTodos ? cargos : top10

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '18px' }}>💳</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '16px' }}>{label}</div>
          {t.ibanMascara && <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{t.ibanMascara}</div>}
        </div>
        {sinClasificar > 0 && (
          <Link href="/finanzas/gastos" style={{ marginLeft: 'auto', fontSize: '12px', background: 'var(--warning-bg)', color: 'var(--warning)', borderRadius: '999px', padding: '3px 10px', fontWeight: 700, textDecoration: 'none' }}>
            ⚠️ {sinClasificar} sin clasificar
          </Link>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={kpiBox}>
          <div style={kpiLabel}>Total gastado</div>
          <div style={{ ...kpiVal, color: 'var(--negative)' }}>{eur(totalGastado)}</div>
        </div>
        {totalAbonado > 0 && (
          <div style={kpiBox}>
            <div style={kpiLabel}>Abonos / devoluciones</div>
            <div style={{ ...kpiVal, color: 'var(--positive)' }}>{eur(totalAbonado)}</div>
          </div>
        )}
        <div style={kpiBox}>
          <div style={kpiLabel}>Nº movimientos</div>
          <div style={kpiVal}>{cargos.length}</div>
        </div>
      </div>

      {/* Desglose por destino */}
      {Object.keys(porDestino).length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Por categoría</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {Object.entries(porDestino).sort((a, b) => b[1] - a[1]).map(([d, v]) => (
              <span key={d} style={{ fontSize: '12px', background: d === 'sin_clasificar' ? 'var(--negative-bg)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px 10px' }}>
                <span style={{ fontWeight: 700 }}>{DESTINO_LABEL[d] ?? d}</span> {eur(v)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Lista de movimientos */}
      {cargos.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {mostrarTodos ? `Todos los cargos (${cargos.length})` : `Top ${Math.min(10, cargos.length)} cargos`}
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            {mostrar.map((m, i) => (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px', fontSize: '13px',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              }}>
                <div style={{ width: '78px', flexShrink: 0, color: 'var(--muted)', fontSize: '12px' }}>{m.fecha ?? '—'}</div>
                <div style={{ flex: 1, minWidth: 0, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.concepto ?? '—'}</div>
                {m.destino && (
                  <span style={{ fontSize: '11px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '2px 7px', flexShrink: 0 }}>
                    {DESTINO_LABEL[m.destino] ?? m.destino}
                  </span>
                )}
                {!m.destino && <span style={{ fontSize: '11px', color: 'var(--warning)', flexShrink: 0 }}>sin categoría</span>}
                {m.conciliado && <span style={{ fontSize: '12px', flexShrink: 0 }} title="Conciliado">🔗</span>}
                <div style={{ fontWeight: 700, color: 'var(--negative)', flexShrink: 0, width: '80px', textAlign: 'right' }}>{eur(Math.abs(m.importe))}</div>
              </div>
            ))}
          </div>
          {cargos.length > 10 && (
            <button
              onClick={() => setMostrarTodos(v => !v)}
              style={{ marginTop: '8px', background: 'none', border: 'none', color: 'var(--primary)', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
            >
              {mostrarTodos ? '▲ Mostrar menos' : `▼ Ver todos (${cargos.length})`}
            </button>
          )}
        </div>
      )}

      {cargos.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: '14px' }}>Sin cargos en este mes.</p>
      )}
    </div>
  )
}

const kpiBox: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', minWidth: '130px' }
const kpiLabel: React.CSSProperties = { fontSize: '11px', color: 'var(--muted)', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }
const kpiVal: React.CSSProperties = { fontSize: '20px', fontWeight: 800 }

export default function TarjetaCreditoClient({
  tarjetas,
  mes,
  hasTarjetas,
}: {
  tarjetas: Tarjeta[]
  mes: string
  hasTarjetas: boolean
}) {
  const router = useRouter()

  function navMes(m: string) {
    router.push(`/finanzas/tarjeta-credito?mes=${m}`)
  }

  return (
    <div style={{ padding: '24px', maxWidth: '860px', margin: '0 auto' }}>

      <div className="tarj-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>💳 Tarjeta de crédito</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => navMes(prevMes(mes))} style={navBtn}>◀</button>
          <span style={{ fontSize: '14px', fontWeight: 600, minWidth: '160px', textAlign: 'center' }}>{mesLabel(mes)}</span>
          <button onClick={() => navMes(nextMes(mes))} style={navBtn}>▶</button>
        </div>
      </div>

      {!hasTarjetas && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>💳</div>
          <h2 style={{ fontWeight: 700, fontSize: '16px', marginBottom: '8px' }}>Todavía no has importado ningún extracto de tarjeta</h2>
          <p style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '16px' }}>
            Descarga el extracto mensual desde Kutxabank (banca online → Tarjetas → Exportar Excel)<br />
            y súbelo en <strong>Banca → Importar extracto → Tarjeta de crédito</strong>.
          </p>
          <Link href="/banca" style={{ background: 'var(--primary)', color: '#fff', borderRadius: '8px', padding: '10px 20px', textDecoration: 'none', fontWeight: 700, fontSize: '14px' }}>
            Ir a Banca → Importar
          </Link>
        </div>
      )}

      {hasTarjetas && tarjetas.length === 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '32px', textAlign: 'center', color: 'var(--muted)' }}>
          <p style={{ fontSize: '14px' }}>Sin movimientos de tarjeta en {mesLabel(mes)}.</p>
          <p style={{ fontSize: '13px', marginTop: '8px' }}>
            Importa el extracto de este mes desde{' '}
            <Link href="/banca" style={{ color: 'var(--primary)' }}>Banca → Importar extracto</Link>.
          </p>
        </div>
      )}

      {tarjetas.map(t => (
        <TarjetaCard key={t.cuentaBancariaId} t={t} mes={mes} />
      ))}

      {tarjetas.length > 0 && (
        <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '8px' }}>
          Para clasificar los movimientos sin categoría, ve a{' '}
          <Link href="/finanzas/gastos" style={{ color: 'var(--primary)' }}>Finanzas → Gastos</Link>.
        </p>
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', fontSize: '14px', cursor: 'pointer', color: 'var(--text)' }
