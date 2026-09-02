'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { ResumenFinanciero } from '@/lib/finanzas'
import type { EstadoDeclaracion } from '@/lib/comparativa-declaracion'
import { eur } from '@/lib/dinero'
import IntervaloSelector, { type Periodo } from '../IntervaloSelector'

type Lente = 'personal' | 'negocios' | 'fiscal'
type Fiscal = ResumenFinanciero['fiscal']

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

// ── Barra visual de tramos IRPF (misma que /finanzas/fiscal, fuente única de tramos: servidor) ──
function TramoBar({ tramosIRPF, base }: { tramosIRPF: Fiscal['tramosIRPF']; base: number }) {
  const MAX = 80000
  const COLORES = ['#68d391', '#4fd1c5', '#63b3ed', '#f6ad55', '#fc8181', '#feb2b2']
  const pct = Math.min((base / MAX) * 100, 98)
  return (
    <div>
      <div style={{ position: 'relative', height: '20px', borderRadius: '6px', overflow: 'hidden', display: 'flex', marginTop: '10px' }}>
        {tramosIRPF.map((t, i) => {
          const hasta = Math.min(t.hasta ?? MAX, MAX)
          const width = Math.max(0, ((hasta - t.desde) / MAX) * 100)
          return (
            <div key={i} title={`${(t.tipo * 100).toFixed(0)}%: ${eur(t.desde)} – ${t.hasta ? eur(t.hasta) : '∞'}`}
              style={{ width: `${width}%`, background: COLORES[i] ?? 'var(--border)', height: '100%' }} />
          )
        })}
        {base > 0 && <div style={{ position: 'absolute', top: 0, bottom: 0, width: '3px', background: '#2d3748', left: `${pct}%` }} />}
      </div>
      {base > 0 && (
        <div style={{ position: 'relative', height: '18px', marginTop: '2px' }}>
          <span style={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', fontSize: '10px', fontWeight: 700, color: '#2d3748', whiteSpace: 'nowrap' }}>▲ {eur(base)}</span>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
        {tramosIRPF.filter(t => t.importe > 0 || t.desde === 0).map((t, i) => (
          <span key={i} style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: COLORES[i] ?? 'var(--border)' }} />
            {(t.tipo * 100).toFixed(0)}%{t.importe > 0 && <strong> → {eur(t.importe)}</strong>}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── "Mi declaración": un momento (hoy / fin de año) con las dos modalidades (solo yo / conjunta) ──
type ComparativaDecl = EstadoDeclaracion['hoy']
function MomentoCard({ titulo, sub, c }: { titulo: string; sub: string; c: ComparativaDecl }) {
  const filas = [
    { label: '👤 Solo yo', resultado: c.separada.titular.resultado, base: c.separada.titular.base, recomendada: c.recomendacion === 'separada' },
    { label: '🤝 Conjunta con Pilar', resultado: c.conjunta.resultado, base: c.conjunta.base, recomendada: c.recomendacion === 'conjunta' },
  ]
  return (
    <div style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '8px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700 }}>{titulo}</div>
      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '10px' }}>{sub}</div>
      {filas.map(f => (
        <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '6px', marginBottom: '6px', border: `1px solid ${f.recomendada ? 'var(--primary)' : 'var(--border)'}`, background: f.recomendada ? 'var(--primary-light)' : 'transparent' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600 }}>{f.label} {f.recomendada && <span style={{ fontSize: '10px', background: 'var(--primary)', color: '#fff', padding: '1px 6px', borderRadius: '8px' }}>✓ mejor</span>}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Base: {eur(f.base)}</div>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap', color: f.resultado <= 0 ? 'var(--primary)' : 'var(--negative)' }}>
            {f.resultado <= 0 ? 'Devuelven' : 'A pagar'} {eur(Math.abs(f.resultado))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function RadiografiaClient({ periodo, resumen, fiscalAnual, declaracion, sinConfirmar }: {
  periodo: Periodo
  resumen: ResumenFinanciero
  fiscalAnual: Fiscal
  declaracion: EstadoDeclaracion | null
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

  // Fiscal = AÑO completo (la declaración es anual). No usa el `resumen` del intervalo.
  const fiscal = fiscalAnual

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' }}>

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
        <div style={{ display: 'grid', gap: '12px' }}>
          {/* Mi declaración: hoy vs fin de año, solo yo vs conjunta (fusiona Fiscal + Proyección aquí) */}
          {declaracion ? (
            <div style={card}>
              <div style={{ marginBottom: '12px' }}>
                <strong>🧾 Mi declaración {declaracion.year} — cómo voy y cómo acabaría</strong>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Resultado estimado hoy y proyectado a 31/12, declarando solo o en conjunta con Pilar.</div>
              </div>
              <div className="rg-cuentas" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <MomentoCard titulo="📍 Hoy" sub={`Con lo devengado hasta ahora (base ${eur(declaracion.bases.hoy)})`} c={declaracion.hoy} />
                <MomentoCard titulo="🔮 Fin de año (estimación)" sub={`+ ${eur(declaracion.bases.deltaFuturo)} de reservas futuras y recurrentes → base ${eur(declaracion.bases.finAnio)}`} c={declaracion.finAnio} />
              </div>
              {/* Palanca de gasto: cuánto ahorra meter más gasto deducible antes del 31/12 */}
              <div style={{ marginTop: '12px', fontSize: '12px', padding: '10px 12px', background: 'var(--positive-bg)', borderRadius: '6px', color: 'var(--positive)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>💡 <strong>Cada 1.000 € más de gasto deducible ⇒ ~{declaracion.palanca.ahorroPorMilGasto} € menos de cuota</strong> (tramo marginal proyectado: {(declaracion.palanca.tipoMarginal * 100).toFixed(0)}%). No hay salto de golpe al cambiar de tramo: solo el exceso tributa al tipo alto.</div>
                {declaracion.palanca.gastoParaBajarTramo !== null && declaracion.palanca.tipoPrevio !== null && declaracion.palanca.gastoParaBajarTramo > 0 && (
                  <div>🎯 Para que la base proyectada baje al tramo del {(declaracion.palanca.tipoPrevio * 100).toFixed(0)}%: <strong>{eur(declaracion.palanca.gastoParaBajarTramo)}</strong> de gasto antes del 31/12 ({declaracion.mesesRestantes} meses restantes) → ahorro ~<strong>{eur(declaracion.palanca.ahorroBajarTramo ?? 0)}</strong>.</div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ ...card, fontSize: '12px', color: 'var(--muted)' }}>No se pudo calcular «Mi declaración» ahora mismo. El resto de la lente sigue disponible.</div>
          )}

          {/* Base imponible + barra de tramos IRPF (año completo) */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <strong>📊 Base imponible y tramos</strong>
              <Link href="/finanzas/fiscal" style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>Detalle y deducciones →</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '4px' }}>
              <div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Base imponible est.</div><div style={{ fontSize: '18px', fontWeight: 700 }}>{eur(fiscal.baseImponibleEstimada)}</div></div>
              <div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Tipo efectivo</div><div style={{ fontSize: '18px', fontWeight: 700 }}>{(fiscal.tipoEfectivo * 100).toFixed(1)}%</div></div>
              <div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Tramo marginal</div><div style={{ fontSize: '18px', fontWeight: 700 }}>{(fiscal.tramoActual.tipo * 100).toFixed(0)}%</div></div>
              <div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Retenciones pagadas</div><div style={{ fontSize: '18px', fontWeight: 700 }}>{eur(fiscal.retencionesAcumuladas)}</div></div>
            </div>
            <TramoBar tramosIRPF={fiscal.tramosIRPF} base={fiscal.baseImponibleEstimada} />
            {fiscal.margenHastaProximoTramo != null && (
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '10px' }}>Para subir de tramo: {eur(fiscal.margenHastaProximoTramo)} más de base.</div>
            )}
          </div>

          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>El bloque fiscal es siempre del año completo (la declaración es anual, no del intervalo). Orientativo, no sustituye a la asesoría.</div>
        </div>
      )}
    </main>
  )
}
