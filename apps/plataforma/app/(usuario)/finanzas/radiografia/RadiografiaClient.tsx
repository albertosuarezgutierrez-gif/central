'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { ResumenFinanciero } from '@/lib/finanzas'
import { eur } from '@/lib/dinero'
import IntervaloSelector, { type Periodo } from '../IntervaloSelector'

type Lente = 'personal' | 'negocios' | 'fiscal'

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px',
}

function Kpi({ label, valor, sub, tono }: { label: string; valor: string; sub?: string; tono?: 'pos' | 'neg' | 'neutro' }) {
  const color = tono === 'pos' ? 'var(--positive)' : tono === 'neg' ? 'var(--negative)' : 'var(--text)'
  return (
    <div style={card}>
      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color }}>{valor}</div>
      {sub && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

function CuentaBloque({ titulo, subtitulo, total, cats, href }: {
  titulo: string; subtitulo: string; total: number; cats: { categoria: string; importe: number }[]; href: string
}) {
  return (
    <div style={card}>
      <div style={{ fontWeight: 700 }}>{titulo}</div>
      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>{subtitulo}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>{eur(total)}</div>
      {cats.length ? cats.map(c => (
        <div key={c.categoria} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: '1px solid var(--border)', fontSize: '13px' }}>
          <span style={{ textTransform: 'capitalize' }}>{c.categoria}</span>
          <strong>{eur(c.importe)}</strong>
        </div>
      )) : <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Sin gasto en el periodo.</div>}
      <Link href={href} style={{ display: 'inline-block', marginTop: '10px', fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>Ver detalle de esta cuenta →</Link>
    </div>
  )
}

export default function RadiografiaClient({ periodo, resumen, sinConfirmar }: {
  periodo: Periodo
  resumen: ResumenFinanciero
  sinConfirmar: number
}) {
  const [lente, setLente] = useState<Lente>('personal')

  // ── Totales de cabecera (todos derivados del resumen, sin recomputar) ──────────
  const ingresosNeg = resumen.correduria.cobradoNeto + resumen.pisos.total.ingresos
  const gastoNeg = resumen.correduria.gastosDeducibles + resumen.pisos.total.gastos
  const gastoPersonal = resumen.personal.total
  const gastoTotal = gastoNeg + gastoPersonal
  const resultado = ingresosNeg - gastoTotal
  const pctPersonal = gastoTotal > 0 ? Math.round((gastoPersonal / gastoTotal) * 100) : 0

  // Comparativa: el bloque `anterior` suma todo lo no-traspaso del mismo periodo del año pasado.
  // El gasto total cuadra con ese alcance → delta fiable. (Ingresos/resultado con delta: Fase 2.)
  const ant = resumen.anterior
  const deltaGasto = ant && ant.gastos > 0 ? Math.round(((gastoTotal - ant.gastos) / ant.gastos) * 100) : null

  // ── Personal por CUENTA (BBVA = 100% de Alberto · Kutxabank = familiar) ─────────
  // Alberto quiere ver separado su gasto propio (BBVA) del compartido en casa (Kutxabank).
  const bbvaCats = [...resumen.personal.bbva.porCategoria].sort((a, b) => b.importe - a.importe).slice(0, 6)
  const kutxaCats = [...resumen.personal.kutxa.porCategoria].sort((a, b) => b.importe - a.importe).slice(0, 6)

  const fiscal = resumen.fiscal

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' }}>
      <style>{`@media (max-width:768px){.rg-kpis{grid-template-columns:1fr 1fr!important}.rg-lentes{overflow-x:auto}.rg-cuentas{grid-template-columns:1fr!important}}`}</style>

      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 16px' }}>📊 Radiografía financiera</h1>

      {/* Selector único de intervalo */}
      <IntervaloSelector basePath="/finanzas/radiografia" periodo={periodo} />

      {/* Bandeja "sin identificar" — lo primero, es la queja de "gasto que la IA no reconoce" */}
      {sinConfirmar > 0 && (
        <Link href="/finanzas/gastos" style={{ textDecoration: 'none' }}>
          <div style={{ ...card, marginTop: '16px', borderColor: 'var(--warning)', background: 'var(--warning-bg)', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
            <span style={{ fontSize: '22px' }}>🔎</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--text)' }}>{sinConfirmar} movimiento{sinConfirmar === 1 ? '' : 's'} sin identificar en el periodo</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Revísalos y corrígelos a mano — el sistema aprende y los reaplica a los iguales.</div>
            </div>
            <span style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 600 }}>Revisar →</span>
          </div>
        </Link>
      )}

      {/* Cabecera-resumen FIJA */}
      <div className="rg-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '16px' }}>
        <Kpi label="Ingresos" valor={eur(ingresosNeg)} sub="negocios" tono="pos" />
        <Kpi
          label="Gasto total"
          valor={eur(gastoTotal)}
          sub={deltaGasto !== null ? `${deltaGasto >= 0 ? '▲' : '▼'} ${Math.abs(deltaGasto)}% vs año anterior` : undefined}
        />
        <Kpi label="Resultado" valor={eur(resultado)} tono={resultado >= 0 ? 'pos' : 'neg'} />
        <Kpi label="Negocio vs Personal" valor={`${100 - pctPersonal}/${pctPersonal}`} sub={`Personal: ${eur(gastoPersonal)}`} />
      </div>

      {/* Lentes */}
      <div className="rg-lentes" style={{ display: 'flex', gap: '6px', margin: '20px 0 14px' }}>
        {([['personal', '🏠 Personal'], ['negocios', '🏢 Negocios'], ['fiscal', '🧾 Fiscal']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setLente(id)} style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap',
            border: '1px solid var(--border)',
            background: lente === id ? 'var(--primary)' : 'var(--surface)',
            color: lente === id ? '#fff' : 'var(--text)', fontWeight: lente === id ? 700 : 400,
          }}>{label}</button>
        ))}
      </div>

      {lente === 'personal' && (
        <div>
          <div style={{ marginBottom: '2px' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Gasto personal del periodo: <strong style={{ color: 'var(--text)', fontSize: '15px' }}>{eur(gastoPersonal)}</strong></span>
          </div>
          <div className="rg-cuentas" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
            <CuentaBloque titulo="🏦 BBVA" subtitulo="100% tuya" total={resumen.personal.bbva.gastos} cats={bbvaCats} href="/finanzas?tab=categorias&banco=bbva" />
            <CuentaBloque titulo="👨‍👩‍👧 Kutxabank" subtitulo="cuenta familiar" total={resumen.personal.kutxa.gastos} cats={kutxaCats} href="/finanzas?tab=categorias&banco=familiar" />
          </div>
        </div>
      )}

      {lente === 'negocios' && (
        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <strong>🛡️ Correduría</strong>
              <Link href="/correduria" style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>Detalle →</Link>
            </div>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '14px' }}>
              <span>Cobrado: <strong>{eur(resumen.correduria.cobradoNeto)}</strong></span>
              <span>Gastos: <strong>{eur(resumen.correduria.gastosDeducibles)}</strong></span>
              <span>Resultado: <strong style={{ color: resumen.correduria.resultado >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{eur(resumen.correduria.resultado)}</strong></span>
            </div>
          </div>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <strong>🏨 Pisos turísticos</strong>
              <Link href="/apartamentos" style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>Detalle →</Link>
            </div>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '14px' }}>
              <span>Ingresos: <strong>{eur(resumen.pisos.total.ingresos)}</strong></span>
              <span>Gastos: <strong>{eur(resumen.pisos.total.gastos)}</strong></span>
              <span>Resultado: <strong style={{ color: resumen.pisos.total.resultado >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{eur(resumen.pisos.total.resultado)}</strong></span>
            </div>
          </div>
        </div>
      )}

      {lente === 'fiscal' && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <strong>🧾 IRPF estimado</strong>
            <Link href="/finanzas/fiscal" style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>Mi declaración →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            <div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Base imponible est.</div><div style={{ fontSize: '18px', fontWeight: 700 }}>{eur(fiscal.baseImponibleEstimada)}</div></div>
            <div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Tipo efectivo</div><div style={{ fontSize: '18px', fontWeight: 700 }}>{(fiscal.tipoEfectivo * 100).toFixed(1)}%</div></div>
            <div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Margen al siguiente tramo</div><div style={{ fontSize: '18px', fontWeight: 700 }}>{fiscal.margenHastaProximoTramo != null ? eur(fiscal.margenHastaProximoTramo) : '—'}</div></div>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '12px' }}>El bloque fiscal es siempre del año completo (por diseño). Orientativo, no sustituye a la asesoría.</div>
        </div>
      )}
    </main>
  )
}
