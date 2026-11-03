'use client'
import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { formatearValor, validarCampo, type Dato, type Seccion } from '@/lib/situacion-fiscal'
import { estadoDato } from '@/lib/dato'

type Props = {
  secciones: Seccion[] | null
  /** Abre el formulario de perfil/hijos de siempre (SituacionFamiliarForm); null si no hay datos para abrirlo. */
  onEditarPerfil: (() => void) | null
}

const boton: CSSProperties = { minHeight: 44, minWidth: 44, padding: '0 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const fechaEs = (f: string) => f.split('-').reverse().join('/')

function Fila({ d, onEditarPerfil, onGuardado }: { d: Dato; onEditarPerfil: Props['onEditarPerfil']; onGuardado: () => void }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const sinDato = estadoDato(d.valor) === 'pendiente'

  async function guardar(valor: string | null) {
    const v = validarCampo(d.campo ?? '', valor === null ? null : valor)
    if (!v.ok) { setError(v.error); return }
    setGuardando(true); setError(null)
    const res = await fetch('/api/finanzas/situacion-fiscal', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campo: d.campo, valor: v.valor }),
    })
    setGuardando(false)
    if (res.ok) { setEditando(false); onGuardado() } else setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo guardar')
  }

  const puedeEditar = d.edicion === 'api' || ((d.edicion === 'perfil' || d.edicion === 'hijos') && onEditarPerfil)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{d.etiqueta}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: sinDato ? 'var(--warning)' : 'var(--text)', overflowWrap: 'anywhere' }}>
          {formatearValor(d.valor, d.formato)}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', overflowWrap: 'anywhere' }}>
        Fuente: {d.fuente} · {d.actualizado ? `actualizado ${fechaEs(d.actualizado)}` : 'sin fecha de actualización'}
        {d.nota ? ` · ${d.nota}` : ''}
      </div>
      {editando ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input
            type="text" inputMode="decimal" value={texto} onChange={e => setTexto(e.target.value)} aria-label={d.etiqueta}
            style={{ minHeight: 44, flex: '1 1 140px', minWidth: 0, padding: '0 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
          />
          <button style={{ ...boton, background: 'var(--primary)', color: '#fff', border: 'none' }} disabled={guardando} onClick={() => guardar(texto)}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          {!sinDato && <button style={{ ...boton, color: 'var(--negative)' }} disabled={guardando} onClick={() => guardar(null)}>Dejar «sin dato»</button>}
          <button style={boton} onClick={() => { setEditando(false); setError(null) }}>Cancelar</button>
        </div>
      ) : puedeEditar ? (
        <div>
          <button
            style={boton}
            onClick={() => d.edicion === 'api' ? (setTexto(typeof d.valor === 'number' ? String(d.valor).replace('.', ',') : ''), setEditando(true)) : onEditarPerfil?.()}
          >{sinDato ? 'Rellenar' : 'Editar'}</button>
        </div>
      ) : sinDato ? (
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Aún no hay campo para este dato: pídeselo a un agente para darlo de alta.</div>
      ) : null}
      {error && <div role="alert" style={{ fontSize: 12, color: 'var(--negative)' }}>{error}</div>}
    </div>
  )
}

export default function SituacionFiscal({ secciones, onEditarPerfil }: Props) {
  const router = useRouter()
  if (!secciones) {
    return (
      <div style={{ padding: 16, marginBottom: 16, border: '1px dashed var(--muted)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--muted)' }}>
        Sin dato: no se pudo cargar «Mi situación fiscal».
      </div>
    )
  }
  const faltan = secciones.reduce((n, s) => n + s.datos.filter(d => estadoDato(d.valor) === 'pendiente').length, 0)
  return (
    <details open style={{ marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0 16px' }}>
      <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 12px', cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>
        Mi situación fiscal
        <span style={{ fontSize: 12, fontWeight: 400, color: faltan ? 'var(--warning)' : 'var(--muted)' }}>
          {faltan ? `${faltan} dato${faltan === 1 ? '' : 's'} sin dato` : 'todo informado'} · lo que cambies aquí entra en el cálculo
        </span>
      </summary>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16, paddingBottom: 16 }}>
        {secciones.map(s => (
          <section key={s.id}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '8px 0 0' }}>{s.titulo}</h3>
            {s.datos.map(d => <Fila key={d.id} d={d} onEditarPerfil={onEditarPerfil} onGuardado={() => router.refresh()} />)}
          </section>
        ))}
      </div>
    </details>
  )
}
