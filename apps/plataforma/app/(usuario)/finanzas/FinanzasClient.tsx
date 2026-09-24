'use client'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { ResumenFinanciero, MovResumen } from '@/lib/finanzas'
import { Banknote } from 'lucide-react'
import { eur } from '@/lib/dinero'
import { PageHeader } from '@/components/ui'

// Gastos y Fiscal viven en sus páginas propias (/finanzas/gastos y /finanzas/fiscal,
// PR #646/#686). La pestaña «Categorías» se retiró el 02/09/2026: montaba LITERALMENTE el
// mismo `CategoriasTab` que el segmento Personal de /banca, así que la misma pantalla existía
// en dos URLs y se podía dar vueltas entre ellas. Sobrevive la de /banca.
//
// Sin pestañas, este componente es el cuerpo del segmento «Ingresos» de /banca (`embebido`),
// que es donde vive ahora. Ya no hay dos hubs financieros.

type Props = {
  initialData: ResumenFinanciero | null
  year: number
  quarter: number
  /** Montado dentro de /banca como segmento: /banca ya pone el contenedor de página. */
  embebido?: boolean
}

function fmt(n: number) {
  return eur(n)
}
function pct(a: number, b: number) {
  if (!b) return null
  const d = ((a - b) / Math.abs(b)) * 100
  return d
}

function VerifBadge({ v }: { v: { confirmados: number; total: number } }) {
  if (!v.total) return null
  const all = v.confirmados === v.total
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '10px',
      background: all ? 'var(--positive-bg)' : 'var(--warning-bg)',
      color: all ? 'var(--positive)' : 'var(--warning)',
      border: `1px solid ${all ? '#9ae6b4' : '#f6e05e'}`,
    }}>
      {v.confirmados}/{v.total} ✓
    </span>
  )
}

function MovTable({ movs, onConfirmar }: { movs: MovResumen[]; onConfirmar?: (id: string, confirmado: boolean) => void }) {
  if (!movs.length) return <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '8px 0 0' }}>Sin movimientos en este periodo.</p>
  return (
    <div style={{ marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
      {movs.map(m => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', fontSize: '12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ color: 'var(--muted)', whiteSpace: 'nowrap', minWidth: '36px' }}>{m.fecha?.slice(5) ?? '—'}</div>
          <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{m.concepto}</div>
          <div style={{ fontWeight: 600, color: m.importe >= 0 ? 'var(--primary)' : 'var(--negative)', whiteSpace: 'nowrap' }}>
            {m.importe >= 0 ? '+' : ''}{fmt(m.importe)}
          </div>
          {onConfirmar && (
            <button
              onClick={() => onConfirmar(m.id, !m.confirmado)}
              title={m.confirmado ? 'Verificado — pulsa para desmarcar' : 'Marcar como verificado'}
              style={{
                fontSize: '11px', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', flexShrink: 0,
                border: `1px solid ${m.confirmado ? '#9ae6b4' : 'var(--border)'}`,
                background: m.confirmado ? 'var(--positive-bg)' : 'var(--surface)',
                color: m.confirmado ? 'var(--positive)' : 'var(--muted)',
                fontWeight: m.confirmado ? 700 : 400,
              }}
            >{m.confirmado ? '✓' : '✓'}</button>
          )}
        </div>
      ))}
    </div>
  )
}

function MiniChart({ porMes, color = 'var(--primary)' }: { porMes: { mes: string; ingresos: number; gastos: number }[]; color?: string }) {
  if (!porMes.length) return null
  const max = Math.max(...porMes.map(m => Math.max(m.ingresos, m.gastos)), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '40px', marginTop: '10px' }}>
      {porMes.map(m => (
        <div key={m.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '36px', gap: '2px' }}>
            <div style={{ width: '100%', height: `${(m.gastos / max) * 36}px`, background: '#fc8181', borderRadius: '2px 2px 0 0', minHeight: m.gastos > 0 ? '2px' : 0 }} />
            <div style={{ width: '100%', height: `${(m.ingresos / max) * 36}px`, background: color, borderRadius: '2px 2px 0 0', minHeight: m.ingresos > 0 ? '2px' : 0 }} />
          </div>
          <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{m.mes.slice(5)}</div>
        </div>
      ))}
    </div>
  )
}

// ── Banner de ayuda/subvención con plazo abierto (radar fiscal-novedades) ────
function AyudaBanner({ ayudas, onDescartar }: { ayudas: ResumenFinanciero['deducciones']['ayudas']; onDescartar: (id: string) => void }) {
  if (!ayudas.length) return null
  return (
    <div style={{ marginBottom: '16px' }}>
      {ayudas.map(a => {
        const urgente = a.diasRestantes != null && a.diasRestantes <= 15
        const plazo = a.diasRestantes == null
          ? 'plazo por confirmar'
          : a.diasRestantes === 0 ? '¡el plazo acaba HOY!' : `quedan ${a.diasRestantes} días (hasta ${a.plazoFin})`
        return (
          <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', background: 'var(--warning-bg)', border: '1px solid #f6e05e', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>💶</span>
            <div style={{ flex: 1, minWidth: '220px', fontSize: '13px', color: 'var(--warning)' }}>
              <strong>Ayuda con plazo abierto:</strong> {a.titulo}
              {a.organismo && <> · {a.organismo}</>}
              {a.cuantiaTexto && <> · <strong>{a.cuantiaTexto}</strong></>}
              {' · '}
              <span style={{ color: urgente ? 'var(--negative)' : 'var(--warning)', fontWeight: urgente ? 700 : 400 }}>{plazo}</span>
              {a.encaje && <div style={{ marginTop: '2px' }}>{a.encaje}</div>}
              {a.url && <> <a href={a.url} target="_blank" rel="noreferrer" style={{ color: 'var(--warning)', textDecoration: 'underline' }}>convocatoria</a></>}
            </div>
            <button onClick={() => onDescartar(a.id)} style={{ fontSize: '12px', padding: '4px 10px', background: 'var(--surface)', border: '1px solid #f6e05e', borderRadius: '6px', cursor: 'pointer', color: 'var(--warning)', fontWeight: 600, minHeight: '32px' }}>Descartar</button>
          </div>
        )
      })}
    </div>
  )
}

// ── Banner de novedad fiscal (cambio normativo que te beneficia) ─────────────
function NovedadBanner({ novedades, onDescartar }: { novedades: ResumenFinanciero['deducciones']['novedades']; onDescartar: (id: string) => void }) {
  if (!novedades.length) return null
  return (
    <div style={{ marginBottom: '16px' }}>
      {novedades.map(n => (
        <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--positive-bg)', border: '1px solid #9ae6b4', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '8px' }}>
          <span style={{ fontSize: '20px' }}>📈</span>
          <div style={{ flex: 1, fontSize: '13px', color: 'var(--positive)' }}>
            <strong>Novedad fiscal a tu favor:</strong> «{n.concepto}»
            {n.importeAnterior != null && n.importeNuevo != null && <> sube de {fmt(n.importeAnterior)} a <strong>{fmt(n.importeNuevo)}</strong></>}
            {n.fuenteUrl && <> · <a href={n.fuenteUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--positive)', textDecoration: 'underline' }}>fuente ({n.ambito.toUpperCase()})</a></>}
          </div>
          <button onClick={() => onDescartar(n.id)} style={{ fontSize: '12px', padding: '4px 10px', background: 'var(--surface)', border: '1px solid #9ae6b4', borderRadius: '6px', cursor: 'pointer', color: 'var(--positive)', fontWeight: 600 }}>Entendido</button>
        </div>
      ))}
    </div>
  )
}

// ── Badge de corte de extracción de facturas (skill `facturas-correo`) ───────
// Se pinta solo si el agente marcó la extracción de PDFs como caída (`ok=false`).
function SaludExtraccionBanner({ salud }: { salud: ResumenFinanciero['saludExtraccion'] }) {
  if (!salud || salud.ok) return null
  const dias = salud.diasCaido
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
      background: 'var(--negative-bg)', border: '1px solid var(--negative)', borderRadius: 'var(--radius)',
      padding: '12px 16px', marginBottom: '16px',
    }}>
      <span style={{ fontSize: '20px' }}>🔴</span>
      <div style={{ flex: 1, minWidth: '200px', fontSize: '13px', color: 'var(--text)' }}>
        <strong>Extracción de facturas caída {dias} {dias === 1 ? 'día' : 'días'}.</strong>{' '}
        Las facturas que llegan solo como PDF pueden no leerse ni archivarse solas.
        {salud.detalle ? <> {salud.detalle}.</> : null}{' '}
        Revisa la autorización OAuth del guardado a Drive (publica la app <em>Testing → Production</em>).
      </div>
    </div>
  )
}

export default function FinanzasClient({ initialData, year, quarter, embebido }: Props) {
  const router = useRouter()
  const [data, setData] = useState<ResumenFinanciero | null>(initialData)
  const [isPending, startTransition] = useTransition()
  const [showMovs, setShowMovs] = useState<'pisos' | 'personal' | null>(null)

  // Los tabs Gastos y Fiscal se desmantelaron (duplicaban /finanzas/gastos y /finanzas/fiscal).
  // La URL en la que vive esto es ahora /banca?tab=ingresos. `/finanzas` redirige aquí, así que
  // el periodo se navega sobre /banca y no sobre una ruta que ya no existe como hub.
  function navigate(y: number, q: number) {
    startTransition(async () => {
      const res = await fetch(`/api/finanzas?year=${y}&quarter=${q}`)
      if (res.ok) setData(await res.json())
    })
    router.push(`/banca?tab=ingresos&year=${y}&quarter=${q}`, { scroll: false })
  }

  const refresh = () => navigate(year, quarter)

  async function handleConfirmar(id: string, confirmado: boolean) {
    await fetch('/api/banca/confirmar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, confirmado }) })
    refresh()
  }

  async function descartarNovedad(id: string) {
    await fetch(`/api/finanzas/novedades/${id}/descartar`, { method: 'POST' })
    refresh()
  }

  async function descartarAyuda(id: string) {
    await fetch(`/api/finanzas/ayudas/${id}/descartar`, { method: 'POST' })
    refresh()
  }

  const d = data
  const totalIngresos = d ? d.correduria.cobradoNeto + d.pisos.total.ingresos : 0
  const totalGastos = d ? d.correduria.gastosDeducibles + d.pisos.total.gastos + d.personal.total + (d.amortizables?.total ?? 0) : 0
  const totalResultado = totalIngresos - (d ? d.correduria.gastosDeducibles + d.pisos.total.gastos : 0)
  const antPct = d?.anterior ? pct(totalResultado, d.anterior.resultado) : null

  const periodoLabel = quarter === 0 ? `Año ${year}` : `Q${quarter} ${year}`


  const Envoltorio = embebido
    ? ({ children }: { children: React.ReactNode }) => <>{children}</>
    : ({ children }: { children: React.ReactNode }) => (
        <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' }}>{children}</main>
      )

  return (
    <Envoltorio>

      {/* ── Controles ── */}
      <PageHeader
        titulo={embebido ? 'Ingresos' : 'Finanzas personales'}
        icono={<Banknote size={20} strokeWidth={1.75} />}
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
            <button
              key={i}
              onClick={() => navigate(year, i)}
              style={{
                padding: '5px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                border: '1px solid var(--border)',
                background: quarter === i ? 'var(--primary)' : 'var(--surface)',
                color: quarter === i ? '#fff' : 'var(--text)',
                fontWeight: quarter === i ? 700 : 400,
              }}
            >{label}</button>
          ))}
        </div>
        {isPending && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Cargando…</span>}
        </>}
      />

      {!d ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>Sin datos para este periodo.</div>
      ) : (
        <>
          {/* ── Badge corte de extracción de facturas ── */}
          <SaludExtraccionBanner salud={d.saludExtraccion} />

          {/* ── Banner ayudas con plazo abierto ── */}
          <AyudaBanner ayudas={d.deducciones.ayudas} onDescartar={descartarAyuda} />

          {/* ── Banner novedad fiscal ── */}
          <NovedadBanner novedades={d.deducciones.novedades} onDescartar={descartarNovedad} />

          {/* ── KPIs ── */}
          <div className="finanzas-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Ingresos netos', value: totalIngresos, color: 'var(--primary)', sub: periodoLabel },
              { label: 'Gastos totales', value: totalGastos, color: 'var(--negative)', sub: 'Negocio + personal' },
              { label: 'Resultado negocio', value: totalResultado, color: totalResultado >= 0 ? 'var(--primary)' : 'var(--negative)', sub: antPct !== null ? `${antPct >= 0 ? '↑' : '↓'} ${Math.abs(antPct).toFixed(0)}% vs ${year - 1}` : undefined },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{k.label}</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: k.color }}>{fmt(k.value)}</div>
                {k.sub && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>{k.sub}</div>}
              </div>
            ))}
          </div>

          {/* ════════ INGRESOS ════════ */}
          <div className="finanzas-bloques" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '20px' }}>

            {/* Correduría */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>🛡️ Correduría de seguros</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Actividad económica · BBVA · Retención 15%
                    <VerifBadge v={d.correduria.verificacion} />
                  </div>
                </div>
                <a href="/correduria" style={{ fontSize: '11px', color: 'var(--primary)', textDecoration: 'none' }}>Ver detalle ↗</a>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                {[
                  { label: 'Cobrado neto', value: d.correduria.cobradoNeto, color: 'var(--primary)' },
                  { label: 'Gastos activ.', value: d.correduria.gastosDeducibles, color: 'var(--negative)' },
                  { label: 'Resultado', value: d.correduria.resultado, color: d.correduria.resultado >= 0 ? 'var(--primary)' : 'var(--negative)' },
                ].map(k => (
                  <div key={k.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{k.label}</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: k.color }}>{fmt(k.value)}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--primary-light)', borderRadius: '4px', padding: '6px 8px' }}>
                Bruto para la renta: <strong>{fmt(d.correduria.ingresosBrutos)}</strong> · Retenciones ya pagadas: <strong>{fmt(d.correduria.retencionesEstimadas)}</strong>
                {d.correduria.prestacionesExentas > 0 && (
                  <> · Prestaciones exentas (Art. 7.h LIRPF, <em>no tributan</em>): <strong>{fmt(d.correduria.prestacionesExentas)}</strong></>
                )}
              </div>
            </div>

            {/* Pisos */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>🏨 Pisos turísticos</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Rendimiento capital inmobiliario
                    <VerifBadge v={d.pisos.verificacion} />
                  </div>
                </div>
                <a href="/apartamentos" style={{ fontSize: '11px', color: 'var(--primary)', textDecoration: 'none' }}>Detalle ↗</a>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)' }} />
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>Ingresos</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>Gastos</div>
              </div>
              {[
                { label: '🏠 Kutxa (3 pisos)', ing: d.pisos.kutxa.ingresos, gas: d.pisos.kutxa.gastos, sub: 'House Sev · Luxury · Busto Reform' },
                { label: '🏠 BBVA — Duplex', ing: d.pisos.bbva.ingresos, gas: d.pisos.bbva.gastos, sub: 'Duplex Center' },
              ].map(r => (
                <div key={r.label}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                    <div>
                      <div>{r.label}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{r.sub}</div>
                    </div>
                    <div style={{ color: 'var(--primary)', fontWeight: 600 }}>{fmt(r.ing)}</div>
                    <div style={{ color: 'var(--negative)', fontWeight: 600 }}>{fmt(r.gas)}</div>
                  </div>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', padding: '6px 0', fontSize: '13px', fontWeight: 700 }}>
                <div>Total pisos</div>
                <div style={{ color: 'var(--primary)' }}>{fmt(d.pisos.total.ingresos)}</div>
                <div style={{ color: 'var(--negative)' }}>{fmt(d.pisos.total.gastos)}</div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--primary-light)', borderRadius: '4px', padding: '5px 8px', marginTop: '4px' }}>
                Resultado: <strong style={{ color: d.pisos.total.resultado >= 0 ? 'var(--primary)' : 'var(--negative)' }}>{fmt(d.pisos.total.resultado)}</strong>
                <span style={{ marginLeft: '8px', color: 'var(--muted)' }}>· Amortización: configura valor de construcción</span>
              </div>
              <MiniChart porMes={d.pisos.porMes} color="#48bb78" />
              {showMovs === 'pisos' && <MovTable movs={d.pisos.recientes} onConfirmar={handleConfirmar} />}
              <button onClick={() => setShowMovs(showMovs === 'pisos' ? null : 'pisos')}
                style={{ marginTop: '8px', fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {showMovs === 'pisos' ? 'Ocultar movimientos' : 'Ver movimientos →'}
              </button>
            </div>

            {/* Pilar — actividad autónoma */}
            <a href="/finanzas/pilar" style={{ textDecoration: 'none', color: 'inherit', display: 'block', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px' }}>🟣 Actividad de Pilar</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '12px' }}>
                Contabilidad autónoma — cobros, gastos, cuota SS y Modelo 130 trimestral.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600 }}>
                <span style={{ color: '#9f7aea' }}>Ver detalle completo →</span>
                <span style={{ fontSize: '20px' }}>🟣</span>
              </div>
            </a>
          </div>
        </>
      )}
    </Envoltorio>
  )
}
