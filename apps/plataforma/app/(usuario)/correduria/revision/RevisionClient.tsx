'use client'
import { useState } from 'react'
import { btnStyle } from '@/components/ui'
import type { CasoRevision, DecisionRevision, PolizaRevision } from '@/lib/correduria-puerto'

/** Bloque de la lista plegada: nada monta cientos de filas de golpe. */
const BLOQUE = 50

const DECISIONES: Array<{ valor: DecisionRevision; rotulo: string; ayuda: string }> = [
  { valor: 'misma', rotulo: 'Son la misma', ayuda: 'Solo registra la decisión: NO fusiona. La fusión la aplica después una sesión con el OK de Alberto.' },
  { valor: 'distintas', rotulo: 'Son distintas', ayuda: 'Son pólizas diferentes con el mismo número: el caso se cierra.' },
  { valor: 'descartar', rotulo: 'Descartar', ayuda: 'Ni una cosa ni otra (dato basura o ya resuelto fuera): el caso se cierra.' },
]

const MENSAJE_FALLO: Record<string, string> = {
  ya_resuelto: 'Este caso ya estaba resuelto: se quita de la lista.',
  no_existe: 'Este caso ya no existe: se quita de la lista.',
  invalido: 'La decisión no es válida.',
  sin_configurar: 'El puerto de asegura no está configurado.',
  error: 'No se sabe si se guardó (la conexión falló). Recarga la página para ver el estado real.',
}

const tarjeta: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--surface)', display: 'grid',
  gap: 10, gridTemplateColumns: 'minmax(0, 1fr)',
}

function Fecha({ v }: { v: string | null }) {
  if (!v) return <>sin dato</>
  const [a, m, d] = v.split('-')
  return <>{d}/{m}/{a}</>
}

function PolizaCard({ p }: { p: PolizaRevision }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 13, display: 'grid', gap: 2, minWidth: 0, overflowWrap: 'anywhere' }}>
      <div style={{ fontWeight: 600 }}>{p.numeroPoliza ?? 'sin número'}</div>
      <div style={{ color: 'var(--muted)' }}>{p.aseguradora || 'sin compañía'}{p.dgs ? ` · ${p.dgs}` : ' · sin código DGS'}</div>
      <div>Estado: <strong>{p.estado || 'sin dato'}</strong></div>
      <div>Inicio <Fecha v={p.fechaInicio} /> · Vence <Fecha v={p.fechaVencimiento} /></div>
      <div>{p.recibos.toLocaleString('es-ES')} recibo(s) · {p.siniestros.toLocaleString('es-ES')} siniestro(s)</div>
    </div>
  )
}

function CasoCard({ caso, onResuelto }: { caso: CasoRevision; onResuelto: (id: string) => void }) {
  const [enviando, setEnviando] = useState(false)
  const [nota, setNota] = useState('')
  const [fallo, setFallo] = useState<string | null>(null)

  async function decidir(decision: DecisionRevision) {
    setEnviando(true)
    setFallo(null)
    try {
      const res = await fetch('/api/correduria/revision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ casoId: caso.casoId, decision, ...(nota.trim() ? { nota: nota.trim() } : {}) }),
      })
      const json = (await res.json().catch(() => null)) as { estado?: string } | null
      const estado = res.ok ? 'ok' : json?.estado ?? 'error'
      if (estado === 'ok' || estado === 'ya_resuelto' || estado === 'no_existe') {
        if (estado !== 'ok') setFallo(MENSAJE_FALLO[estado] ?? null)
        onResuelto(caso.casoId)
      } else {
        setFallo(MENSAJE_FALLO[estado] ?? MENSAJE_FALLO.error)
      }
    } catch {
      setFallo(MENSAJE_FALLO.error)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={tarjeta}>
      <div style={{ display: 'grid', gap: 2 }}>
        <div style={{ fontWeight: 700, fontSize: 15, overflowWrap: 'anywhere' }}>Póliza {caso.numero || 'sin número'}</div>
        {caso.motivo && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{caso.motivo}</div>}
      </div>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))' }}>
        {caso.polizas.map((p) => <PolizaCard key={p.id} p={p} />)}
      </div>
      {caso.polizasNoLeidas > 0 && (
        <div style={{ fontSize: 12, color: 'var(--warning)' }}>
          {caso.polizasNoLeidas} póliza(s) del caso no se han podido leer (puede que ya estén fusionadas): no significa que no existan.
        </div>
      )}
      <input
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        maxLength={500}
        placeholder="Nota (opcional)"
        aria-label="Nota opcional"
        disabled={enviando}
        style={{ minHeight: 44, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, width: '100%', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {DECISIONES.map((d) => (
          <button
            key={d.valor}
            type="button"
            title={d.ayuda}
            disabled={enviando}
            onClick={() => decidir(d.valor)}
            style={{ ...btnStyle(d.valor === 'misma' ? 'primario' : 'secundario'), flex: '1 1 140px', opacity: enviando ? 0.6 : 1 }}
          >
            {d.rotulo}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>«Son la misma» no fusiona nada: solo deja constancia de la decisión.</div>
      {fallo && <div role="alert" style={{ fontSize: 13, color: 'var(--negative)' }}>{fallo}</div>}
    </div>
  )
}

export default function RevisionClient({ casos: iniciales }: { casos: CasoRevision[] }) {
  const [casos, setCasos] = useState(iniciales)
  const [visibles, setVisibles] = useState(BLOQUE)

  if (casos.length === 0) {
    return (
      <div style={{ ...tarjeta, fontSize: 13 }}>
        No hay casos abiertos en la bandeja. (Se ha leído la bandeja y está vacía.)
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{casos.length.toLocaleString('es-ES')} caso(s) abiertos</div>
      {casos.slice(0, visibles).map((c) => (
        <CasoCard key={c.casoId} caso={c} onResuelto={(id) => setCasos((prev) => prev.filter((x) => x.casoId !== id))} />
      ))}
      {casos.length > visibles && (
        <button type="button" onClick={() => setVisibles((v) => v + BLOQUE)} style={btnStyle('secundario')}>
          Ver más ({(casos.length - visibles).toLocaleString('es-ES')} restantes)
        </button>
      )}
    </div>
  )
}
