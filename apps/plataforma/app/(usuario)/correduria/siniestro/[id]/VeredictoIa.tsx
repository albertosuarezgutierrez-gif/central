'use client'
import { useState } from 'react'
import Link from 'next/link'
import { btnStyle } from '@/components/ui'
import { CAMPO, ERROR, NOTA } from './estilos'
import { ETIQUETA_APOYO, ETIQUETA_DERIVAR, SEMAFORO_VISUAL, cuerpoValoracion, motivoFallo, textoConfianza, type Veredicto } from '@/lib/correduria/siniestro-hilo'

const SEC: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4 }
const H: React.CSSProperties = { margin: 0, fontSize: 13, fontWeight: 700 }

export default function VeredictoIa({ v, siniestroId, mensajeId, onResponder, onValorado }: {
  v: Veredicto; siniestroId: string; mensajeId: string; onResponder: (pregunta: string) => void; onValorado: () => void
}) {
  const sem = SEMAFORO_VISUAL[v.semaforo]
  const [copiado, setCopiado] = useState(false)
  const [voto, setVoto] = useState<'bien' | 'mal' | null>(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null)

  async function copiar(t: string) {
    try { await navigator.clipboard.writeText(t); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { /* texto visible */ }
  }

  async function valorar(elegido: 'bien' | 'mal') {
    setVoto(elegido); setOcupado(true); setAviso(null)
    try {
      const r = await fetch('/api/correduria/siniestro/hilo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpoValoracion(siniestroId, mensajeId, elegido, motivo)) })
      if (!r.ok) { const j: unknown = await r.json().catch(() => null); setAviso({ mal: true, texto: `NO se ha guardado la valoración: ${motivoFallo(r.status, j)}.` }); return }
      setAviso({ mal: false, texto: 'Valoración guardada. Gracias.' }); onValorado()
    } catch { setAviso({ mal: true, texto: 'NO se sabe si se ha guardado la valoración: sin conexión.' }) } finally { setOcupado(false) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, padding: 10, borderRadius: 10, border: `2px solid ${sem.color}`, background: sem.fondo }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center' }}>
        <strong style={{ fontSize: 16, color: sem.color }}>{sem.icono} {sem.etiqueta}</strong>
        <span style={NOTA}>Confianza: {textoConfianza(v.confianza)}</span>
      </div>
      {v.resumen && <p style={{ margin: 0, fontSize: 14, overflowWrap: 'anywhere' }}>{v.resumen}</p>}

      {v.preguntas.length > 0 && (
        <div style={SEC}>
          <p style={H}>Preguntas para poder decidir</p>
          {v.preguntas.map((q, i) => (
            <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span style={{ flex: '1 1 200px', fontSize: 14, overflowWrap: 'anywhere' }}>{q}</span>
              <button type="button" onClick={() => onResponder(q)} style={btnStyle('secundario', 'sm')}>Responder</button>
            </div>
          ))}
        </div>
      )}

      {v.argumentos.length > 0 && (
        <div style={SEC}>
          <p style={H}>Argumentos</p>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            {v.argumentos.map((a, i) => (
              <li key={i} style={{ fontSize: 14, overflowWrap: 'anywhere' }}>
                {a.texto} <span style={NOTA}>({ETIQUETA_APOYO[a.apoyo]})</span>
                {a.cita && <div style={NOTA}>«{a.cita}»</div>}
                {a.citaVerificada === false && <div role="alert" style={{ ...ERROR, fontWeight: 600 }}>⚠ Cita NO verificada: no aparece en la póliza. Compruébala.</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {v.derivar && <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>➡ {ETIQUETA_DERIVAR[v.derivar]}</p>}

      {v.plazosAccion.length > 0 && (
        <div style={SEC}>
          <p style={H}>Plazos de acción</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {v.plazosAccion.map((p, i) => <li key={i} style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{p.que} · <strong>{p.fecha ?? 'falta la fecha base'}</strong>{p.base ? <span style={NOTA}> ({p.base})</span> : null}</li>)}
          </ul>
        </div>
      )}

      {v.otrasPolizas.length > 0 && (
        <div style={SEC}>
          <p style={H}>Otras pólizas que podrían responder</p>
          {v.otrasPolizas.map(p => (
            <Link key={p.polizaId} href={`/correduria/poliza/${p.polizaId}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, fontSize: 14, overflowWrap: 'anywhere' }}>
              {[p.ramo, p.compania].filter(Boolean).join(' · ') || 'Póliza'}{p.motivo ? ` — ${p.motivo}` : ''} →
            </Link>
          ))}
        </div>
      )}

      {v.explicacionCliente && (
        <div style={SEC}>
          <p style={H}>Cómo explicárselo al cliente</p>
          <p style={{ margin: 0, fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{v.explicacionCliente}</p>
          <div><button type="button" onClick={() => copiar(v.explicacionCliente ?? '')} style={btnStyle('secundario', 'sm')}>{copiado ? 'Copiado' : 'Copiar'}</button></div>
        </div>
      )}

      <div style={{ ...SEC, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        <p style={H}>¿Te ha servido este análisis?</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button type="button" disabled={ocupado} aria-pressed={voto === 'bien'} onClick={() => valorar('bien')} style={btnStyle(voto === 'bien' ? 'primario' : 'secundario', 'sm')}>👍 Bien</button>
          <button type="button" disabled={ocupado} aria-pressed={voto === 'mal'} onClick={() => valorar('mal')} style={btnStyle(voto === 'mal' ? 'primario' : 'secundario', 'sm')}>👎 Mal</button>
          <input aria-label="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (opcional; se guarda al votar)" style={{ ...CAMPO, flex: '1 1 200px', width: 'auto' }} />
        </div>
        {aviso && <p role="status" style={aviso.mal ? ERROR : NOTA}>{aviso.texto}</p>}
      </div>
    </div>
  )
}
