'use client'
// «¿Y si…?»: partidas HIPOTÉTICAS (gasto de piso/correduría, plan de pensiones, donativo) que se suman a la base
// real y recalculan el resultado en el navegador. SIMULACIÓN: no escribe en BD; solo se recuerda en localStorage
// (si falla o está bloqueado, la página funciona igual).
import { useEffect, useMemo, useState } from 'react'
import { Badge, btnStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import type { EntradaSimulador } from '@/lib/simulador-irpf'
import { TIPOS_PARTIDA, normalizarPartidas, simularPartidas, type PartidaHipotetica, type TipoPartida } from '@/lib/simulador-hipotetico'
import type { ContextoResultado } from '@/lib/resultado-declaracion'
import { textoResultado } from './ResultadoDeclaracion'
import { rejilla, subBloque, tituloBloque } from './estilosPanel'

const CLAVE = 'fiscal-simulacion-hipotetica-v1'
const campo = { minHeight: 44, padding: '8px 10px', fontSize: 14, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', minWidth: 0, width: '100%', boxSizing: 'border-box' } as const

function leer(): PartidaHipotetica[] {
  try { return normalizarPartidas(JSON.parse(window.localStorage.getItem(CLAVE) ?? '[]')) } catch { return [] }
}
function guardar(ps: PartidaHipotetica[]) {
  try { window.localStorage.setItem(CLAVE, JSON.stringify(ps)) } catch { /* sin almacenamiento: la simulación vive solo en esta pestaña */ }
}
const nuevoId = () => `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export default function SimuladorHipotetico({ entrada, ctx, propiedades }: { entrada: EntradaSimulador; ctx: ContextoResultado; propiedades: { id: string; nombre: string }[] }) {
  const [partidas, setPartidas] = useState<PartidaHipotetica[]>([])
  const [listo, setListo] = useState(false)
  const [concepto, setConcepto] = useState('')
  const [importe, setImporte] = useState('')
  const [tipo, setTipo] = useState<TipoPartida>('gasto_piso')
  const [piso, setPiso] = useState(propiedades[0]?.id ?? '')
  const [titular, setTitular] = useState<'alberto' | 'pilar'>('alberto')

  useEffect(() => { setPartidas(leer()); setListo(true) }, [])
  useEffect(() => { if (listo) guardar(partidas) }, [partidas, listo])

  const sim = useMemo(() => simularPartidas(entrada, ctx, partidas), [entrada, ctx, partidas])
  const hay = partidas.length > 0
  const n = Number(importe.replace(/\./g, '').replace(',', '.'))
  const valido = Number.isFinite(n) && n > 0 && (tipo !== 'gasto_piso' || !!piso)
  const pideTitular = tipo === 'plan_pensiones' || tipo === 'plan_empleo_autonomo' || tipo === 'donativo'

  const anadir = () => {
    if (!valido) return
    setPartidas(ps => [...ps, {
      id: nuevoId(), concepto: concepto.trim().slice(0, 80), importe: Math.round(n * 100) / 100, tipo,
      ...(tipo === 'gasto_piso' ? { propertyId: piso } : {}), ...(pideTitular ? { titular } : {}),
    }])
    setConcepto(''); setImporte('')
  }
  const etiqueta = (p: PartidaHipotetica) => {
    const t = TIPOS_PARTIDA.find(x => x.id === p.tipo)!.etiqueta
    const donde = p.tipo === 'gasto_piso' ? propiedades.find(x => x.id === p.propertyId)?.nombre ?? p.propertyId : p.titular ? (p.titular === 'alberto' ? 'Alberto' : 'Pilar') : ''
    return `${p.concepto || t}${donde ? ` · ${donde}` : ''}`
  }
  const filas = [
    { k: 'Conjunta', a: sim.antes.conjunta.resultado, d: sim.despues.conjunta.resultado, ah: sim.delta.conjunta },
    { k: 'Individual Alberto', a: sim.antes.individual.contribuyentes[0]?.resultado ?? null, d: sim.despues.individual.contribuyentes[0]?.resultado ?? null, ah: sim.delta.alberto },
    { k: 'Individual Pilar', a: sim.antes.individual.contribuyentes[1]?.resultado ?? null, d: sim.despues.individual.contribuyentes[1]?.resultado ?? null, ah: sim.delta.pilar },
    { k: 'Individual (suma)', a: sim.antes.individual.resultado, d: sim.despues.individual.resultado, ah: sim.delta.individual },
  ]
  const lbl = { fontSize: 12, fontWeight: 600, display: 'grid', gap: 4, minWidth: 0 } as const

  return (
    <section aria-labelledby="t-hipotetico" style={{ border: '2px dashed var(--warning)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16, minWidth: 0, background: 'var(--warning-bg)' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <h2 id="t-hipotetico" style={tituloBloque}>¿Y si…? Simulación</h2>
        <Badge tono="aviso">SIMULACIÓN · no son datos reales</Badge>
      </div>
      <p style={subBloque}>Añade partidas hipotéticas (p. ej. «Pintar piso entero · 3.000€ · Socorro») y mira al instante cómo cambia el resultado. No se guarda en la base de datos; solo se recuerda en este navegador.</p>

      <div style={{ ...rejilla(180), marginTop: 12, alignItems: 'end' }}>
        <label style={lbl}>Concepto
          <input value={concepto} onChange={e => setConcepto(e.target.value)} maxLength={80} placeholder="Pintar piso entero" style={campo} />
        </label>
        <label style={lbl}>Importe (€)
          <input value={importe} onChange={e => setImporte(e.target.value)} inputMode="decimal" placeholder="3.000" style={campo} />
        </label>
        <label style={lbl}>Tipo
          <select value={tipo} onChange={e => setTipo(e.target.value as TipoPartida)} style={campo}>
            {TIPOS_PARTIDA.map(t => <option key={t.id} value={t.id}>{t.etiqueta}</option>)}
          </select>
        </label>
        {tipo === 'gasto_piso' && (
          <label style={lbl}>Piso
            <select value={piso} onChange={e => setPiso(e.target.value)} style={campo}>
              {propiedades.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
        )}
        {pideTitular && (
          <label style={lbl}>Titular
            <select value={titular} onChange={e => setTitular(e.target.value as 'alberto' | 'pilar')} style={campo}>
              <option value="alberto">Alberto</option><option value="pilar">Pilar</option>
            </select>
          </label>
        )}
        <button type="button" onClick={anadir} disabled={!valido} style={{ ...btnStyle('primario'), opacity: valido ? 1 : 0.6, cursor: valido ? 'pointer' : 'not-allowed' }}>Añadir partida</button>
      </div>

      {hay && (
        <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
          {partidas.map(p => {
            const ap = sim.aplicadas.find(a => a.id === p.id)
            const recorte = ap && ap.aplicado != null && ap.aplicado < p.importe
            return (
              <li key={p.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
                <span style={{ fontSize: 13, minWidth: 0, overflowWrap: 'anywhere' }}>
                  {etiqueta(p)} · <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{eur(p.importe)}</strong>
                  {ap?.nota && <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{recorte ? `se aplican ${eur(ap.aplicado)}: ` : ''}{ap.nota}</span>}
                </span>
                <button type="button" aria-label={`Quitar ${etiqueta(p)}`} onClick={() => setPartidas(ps => ps.filter(x => x.id !== p.id))} style={{ ...btnStyle('sutil'), minWidth: 44 }}>Quitar</button>
              </li>
            )
          })}
        </ul>
      )}
      {sim.avisos.map(a => <p key={a} role="note" style={{ fontSize: 12, margin: '8px 0 0', color: 'var(--warning)' }}>{a}</p>)}

      <div style={{ marginTop: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: 'var(--surface)', borderRadius: 8 }}>
          <caption style={{ textAlign: 'left', fontSize: 12, fontWeight: 700, padding: '6px 8px' }}>Resultado antes / después (cierre estimado) {hay ? '' : '· añade una partida para ver el cambio'}</caption>
          <thead><tr>
            {['', 'Antes (real)', 'Después (simulado)', 'Ahorro'].map(h => <th key={h} scope="col" style={{ textAlign: h ? 'right' : 'left', padding: '6px 8px', fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h || 'Modalidad'}</th>)}
          </tr></thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.k} style={{ borderTop: '1px solid var(--border)' }}>
                <th scope="row" style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{f.k}</th>
                <td style={{ textAlign: 'right', padding: '6px 8px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{textoResultado(f.a)}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{textoResultado(f.d)}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: f.ah == null ? 'var(--muted)' : f.ah > 0 ? 'var(--positive)' : f.ah < 0 ? 'var(--negative)' : undefined }}>
                  {f.ah == null ? 'sin dato' : f.ah === 0 ? '—' : `${f.ah > 0 ? 'ahorras ' : 'pagas ~'}${eur(Math.abs(f.ah))}${f.ah < 0 ? ' más' : ''}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, fontWeight: 600, margin: '8px 0 0' }}>
        {sim.delta.mejor == null ? 'Mejor modalidad: sin dato.' : `Mejor modalidad: ${sim.despues.recomendada ?? 'sin dato'}${hay ? ` · ahorro frente a hoy: ${eur(sim.delta.mejor)}` : ''}.`}
      </p>
      <button type="button" onClick={() => setPartidas([])} disabled={!hay} style={{ ...btnStyle('secundario'), marginTop: 8, opacity: hay ? 1 : 0.6, cursor: hay ? 'pointer' : 'not-allowed' }}>Vaciar simulación</button>
    </section>
  )
}

