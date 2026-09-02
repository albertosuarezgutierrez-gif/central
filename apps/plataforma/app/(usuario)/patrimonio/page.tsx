import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getPatrimonio } from '@/lib/patrimonio'
import { eur, eurSinDecimales } from '@/lib/dinero'

export const dynamic = 'force-dynamic'

// 🏛️ Patrimonio — la foto de ACTIVOS del grupo familiar (los pisos como activo, no como
// explotación) + neto mínimo declarado. Regla de la casa: NULL = «no se sabe» — un activo sin
// valorar se pinta PENDIENTE, jamás a 0, y el neto se declara parcial con sus motivos.
// Base: patrimonio_activos/patrimonio_valoraciones (las alimenta Alberto + el agente radar-espana).
export default async function PatrimonioPage() {
  const s = await getSession()
  if (!s) redirect('/login')

  const { activos, resumen, intake } = await getPatrimonio(s.id)

  const fuenteCorta = (f: string) => (f === 'alberto' ? '👤 Alberto' : f.startsWith('agente') ? '🤖 agente' : `📄 ${f}`)

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '16px 12px', display: 'grid', gap: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>🏛️ Patrimonio</h1>

      {/* Neto mínimo — SIEMPRE declarando lo que falta. */}
      <section style={{ background: 'var(--card-bg, var(--surface, #fff))', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Patrimonio neto {resumen.parcial ? '(mínimo conocido — parcial)' : ''}
        </div>
        <div style={{ fontSize: 30, fontWeight: 700 }}>{eurSinDecimales(resumen.neto)}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8, fontSize: 14 }}>
          <span>💶 Líquido: <strong>{eur(resumen.liquidez)}</strong></span>
          <span>📈 Bróker: <strong>{eur(resumen.broker)}</strong></span>
          <span>🏠 Inmuebles valorados: <strong>{eurSinDecimales(resumen.inmuebles)}</strong></span>
          <span>🏦 Deuda conocida: <strong>−{eurSinDecimales(resumen.pasivosConocidos)}</strong>{resumen.pasivoDesconocido ? ' (+ hipoteca sin cuantificar)' : ''}</span>
        </div>
        {resumen.parcial && (
          <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--warning-bg)', fontSize: 13 }}>
            ⚠️ Este neto es un mínimo — falta por saber:
            <ul style={{ margin: '4px 0 0 18px' }}>
              {resumen.faltan.map(f => <li key={f}>{f}</li>)}
            </ul>
          </div>
        )}
      </section>

      {/* Activos, en cards apiladas (funciona en ≥320 px sin tabla ancha). */}
      <section style={{ display: 'grid', gap: 12 }}>
        {activos.map(a => (
          <article key={a.id} style={{ background: 'var(--card-bg, var(--surface, #fff))', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{a.nombre}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {a.direccion ?? 'dirección pendiente'}
                  {a.tenencia === 'alquilado' && ' · subarrendado (no es activo en propiedad)'}
                  {a.uso === 'vivienda_habitual' && ' · vivienda habitual'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {a.estadoValor === 'valorado' && a.valoracion && (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{eurSinDecimales(a.valoracion.valor)}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {fuenteCorta(a.valoracion.fuente)} · {a.valoracion.fecha} · enfoque {a.valoracion.enfoque}
                    </div>
                  </>
                )}
                {a.estadoValor === 'pendiente_valoracion' && (
                  <div style={{ fontSize: 13, padding: '4px 8px', borderRadius: 8, background: 'var(--warning-bg)' }}>🟠 sin valorar todavía</div>
                )}
                {a.estadoValor === 'no_aplica' && (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>— no computa en el neto</div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8, fontSize: 13 }}>
              <span>📐 {a.m2 != null ? `${a.m2} m²` : 'm² pendientes'}</span>
              <span>🧾 {a.refCatastral ?? 'ref. catastral pendiente'}</span>
              <span>👥 {a.pctTitular != null ? `${a.pctTitular}%${a.pctConyuge ? ` / Pilar ${a.pctConyuge}%` : ''}` : a.tenencia === 'propiedad' ? 'titularidad pendiente' : '—'}</span>
              <span>🛒 {a.valorAdquisicion != null ? `compra ${eurSinDecimales(a.valorAdquisicion)}` : a.tenencia === 'propiedad' ? 'valor de compra pendiente' : '—'}</span>
              {a.licenciaVut === true && <span>🏷️ VUT{a.licenciaVutNum ? ` ${a.licenciaVutNum}` : ' (nº pendiente)'}</span>}
              {a.hipotecaCuotaMensual != null && (
                <span>🏦 hipoteca {eur(a.hipotecaCuotaMensual)}/mes{a.hipotecaCapitalPendiente != null ? ` · pendiente ${eurSinDecimales(a.hipotecaCapitalPendiente)}` : ' · capital sin dato'}</span>
              )}
            </div>
            {a.valoraciones.length > 1 && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
                Valoración dual: {a.valoraciones.map(v => `${v.enfoque} ${eurSinDecimales(v.valor)} (${v.fecha})`).join(' · ')}
              </div>
            )}
            {a.notas && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>{a.notas}</div>}
          </article>
        ))}
      </section>

      {/* Intake: lo que el coordinador necesita de Alberto. */}
      {intake.length > 0 && (
        <section style={{ background: 'var(--card-bg, var(--surface, #fff))', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
          <div style={{ fontWeight: 700 }}>❓ Datos que faltan (el coordinador los preguntará)</div>
          <ul style={{ margin: '6px 0 0 18px', fontSize: 14 }}>
            {intake.map(p => <li key={p}>{p}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}
