'use client'

// Expediente de anulación de UNA póliza (ASegura OS, pieza 2-d). Sin expediente abierto: botón
// «Tramitar anulación» y formulario. Con uno abierto: los pasos y la acción que toca. Las reglas
// (plazo del art. 22 LCS, sin firma no se comunica) las aplica asegura; aquí se pinta lo que dice.

import { useCallback, useEffect, useState } from 'react'
import {
  ESTADOS_ANULACION_ABIERTA, ETIQUETA_ESTADO_ANULACION, ETIQUETA_MOTIVO_ANULACION, ETIQUETA_TIPO_ANULACION,
  MOTIVOS_ANULACION, SOLICITANTES_ANULACION, TIPOS_ANULACION,
} from '@central/module-seguros'
import { btnStyle } from '@/components/ui'
import { textoDesenlaceAnulacion, type Anulacion, type DesenlaceAnulacion, type LecturaAnulaciones } from '@/lib/anulaciones-asegura'

const SOLICITANTE: Record<string, string> = { cliente: 'El cliente', correduria: 'La correduría', compania: 'La compañía' }
const PASOS = [
  { estado: 'solicitada', texto: 'Solicitada' },
  { estado: 'firmada', texto: 'Firmada' },
  { estado: 'comunicada', texto: 'Comunicada' },
  { estado: 'confirmada', texto: 'Confirmada por CIMA' },
] as const

function fechaEs(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

type Aviso = { ok: boolean; texto: string; advertencia: string | null }

export default function AnulacionPoliza({ polizaId, vencimiento }: { polizaId: string; vencimiento: string | null }) {
  const [d, setD] = useState<LecturaAnulaciones | null>(null)
  const [abrirForm, setAbrirForm] = useState(false)
  const [form, setForm] = useState({ tipo: 'no_renovacion', motivo: 'precio', motivoTexto: '', solicitadaPor: 'cliente', fechaEfecto: vencimiento ?? '' })
  const [firmando, setFirmando] = useState(false)
  const [nota, setNota] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<Aviso | null>(null)

  const cargar = useCallback(() => {
    fetch(`/api/correduria/anulaciones?polizaId=${encodeURIComponent(polizaId)}`)
      .then(r => (r.ok ? r.json() : { estado: 'sin_datos', causa: `HTTP ${r.status}` }))
      .then((x: LecturaAnulaciones) => setD(x))
      .catch(() => setD({ estado: 'sin_datos', causa: 'red' }))
  }, [polizaId])
  useEffect(() => { cargar() }, [cargar])

  async function mandar(metodo: 'POST' | 'PATCH', cuerpo: Record<string, unknown>): Promise<boolean> {
    setOcupado(true); setAviso(null)
    try {
      const r = await fetch('/api/correduria/anulaciones', { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
      const j = (await r.json().catch(() => null)) as { desenlace?: DesenlaceAnulacion; motivo?: string | null; advertencia?: string | null } | null
      const des = j?.desenlace ?? 'error'
      const ok = des === 'creada' || des === 'hecho'
      setAviso({ ok, texto: textoDesenlaceAnulacion(des, j?.motivo), advertencia: j?.advertencia ?? null })
      return ok
    } catch {
      setAviso({ ok: false, texto: textoDesenlaceAnulacion('error'), advertencia: null })
      return false
    } finally {
      setOcupado(false)
      cargar()
    }
  }

  if (d === null) return <p style={NOTA}>Cargando…</p>
  if (d.estado === 'sin_datos') {
    return <p style={{ ...NOTA, color: 'var(--negative)' }}>No se ha podido leer si hay un expediente de anulación ({d.causa}). No significa que no lo haya.</p>
  }

  const abierta = d.anulaciones.find(a => (ESTADOS_ANULACION_ABIERTA as readonly string[]).includes(a.estado)) ?? null
  const cerradas = d.anulaciones.filter(a => a !== abierta)
  const alVencimiento = form.tipo === 'no_renovacion'
  const fechaForm = alVencimiento ? (vencimiento ?? '') : form.fechaEfecto

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {abierta ? <Abierta a={abierta} ocupado={ocupado} firmando={firmando} nota={nota} setFirmando={setFirmando} setNota={setNota}
        accion={async (accion, n) => { if (await mandar('PATCH', { id: abierta.id, accion, ...(n ? { nota: n } : {}) })) { setFirmando(false); setNota('') } }} />
      : !abrirForm ? (
        <button type="button" onClick={() => setAbrirForm(true)} style={{ ...btnStyle('secundario'), justifySelf: 'start' }}>Tramitar anulación</button>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          <Campo etiqueta="Tipo">
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={CONTROL}>
              {TIPOS_ANULACION.map(t => <option key={t} value={t}>{ETIQUETA_TIPO_ANULACION[t]}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Fecha de efecto">
            <input type="date" value={fechaForm} disabled={alVencimiento} onChange={e => setForm(f => ({ ...f, fechaEfecto: e.target.value }))} style={CONTROL} />
          </Campo>
          {alVencimiento && !vencimiento && <p style={{ ...NOTA, color: 'var(--warning)' }}>No consta el vencimiento de esta póliza: sin él no se puede anular al vencimiento.</p>}
          <Campo etiqueta="Motivo">
            <select value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} style={CONTROL}>
              {MOTIVOS_ANULACION.map(m => <option key={m} value={m}>{ETIQUETA_MOTIVO_ANULACION[m]}</option>)}
            </select>
          </Campo>
          <Campo etiqueta={form.motivo === 'otro' ? 'Explica el motivo (obligatorio)' : 'Detalle del motivo (opcional)'}>
            <input value={form.motivoTexto} maxLength={500} onChange={e => setForm(f => ({ ...f, motivoTexto: e.target.value }))} style={CONTROL} />
          </Campo>
          <Campo etiqueta="Quién la pide">
            <select value={form.solicitadaPor} onChange={e => setForm(f => ({ ...f, solicitadaPor: e.target.value }))} style={CONTROL}>
              {SOLICITANTES_ANULACION.map(s => <option key={s} value={s}>{SOLICITANTE[s]}</option>)}
            </select>
          </Campo>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" disabled={ocupado || !fechaForm} style={btnStyle('primario')} onClick={async () => {
              const ok = await mandar('POST', { polizaId, tipo: form.tipo, solicitadaPor: form.solicitadaPor, motivo: form.motivo, motivoTexto: form.motivoTexto || null, fechaEfecto: fechaForm })
              if (ok) setAbrirForm(false)
            }}>Abrir expediente</button>
            <button type="button" disabled={ocupado} style={btnStyle('sutil')} onClick={() => setAbrirForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {aviso && (
        <div role="status" style={{ display: 'grid', gap: 4 }}>
          <p style={{ ...NOTA, color: aviso.ok ? 'var(--positive)' : 'var(--negative)' }}>{aviso.texto}</p>
          {aviso.advertencia && <p style={{ ...NOTA, color: 'var(--warning)' }}>⚠️ {aviso.advertencia}</p>}
        </div>
      )}

      {cerradas.map(a => (
        <p key={a.id} style={NOTA}>Anterior: {ETIQUETA_ESTADO_ANULACION[a.estado]} · efecto {fechaEs(a.fechaEfecto)}</p>
      ))}
    </div>
  )
}

function Abierta({ a, ocupado, firmando, nota, setFirmando, setNota, accion }: {
  a: Anulacion; ocupado: boolean; firmando: boolean; nota: string
  setFirmando: (v: boolean) => void; setNota: (v: string) => void
  accion: (accion: 'marcar_firmada' | 'marcar_comunicada' | 'confirmar' | 'desistir', nota?: string) => Promise<void>
}) {
  const actual = PASOS.findIndex(p => p.estado === a.estado)
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>Anulación en curso · {ETIQUETA_TIPO_ANULACION[a.tipo]}</span>
      <span style={NOTA}>
        Efecto {fechaEs(a.fechaEfecto)} · {ETIQUETA_MOTIVO_ANULACION[a.motivo]}{a.motivoTexto ? ` (${a.motivoTexto})` : ''} · pedida por {(SOLICITANTE[a.solicitadaPor] ?? a.solicitadaPor).toLowerCase()}
      </span>
      <ol style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
        {PASOS.map((p, i) => (
          <li key={p.estado} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 999, border: '1px solid var(--border)',
            fontWeight: i === actual ? 700 : 400, color: i <= actual ? 'var(--text)' : 'var(--muted)' }}>
            {i < actual ? '✓ ' : i === actual ? '● ' : ''}{p.texto}
          </li>
        ))}
      </ol>
      {a.firmaNota && <span style={NOTA}>Firma: {a.firmaNota}</span>}
      {a.siguiente && <span style={{ ...NOTA, color: a.siguiente.alerta ? 'var(--negative)' : 'var(--muted)' }}>{a.siguiente.texto}</span>}

      {a.estado === 'solicitada' && firmando && (
        <Campo etiqueta="¿Cómo consta la firma?">
          <input value={nota} maxLength={500} placeholder="carta firmada, subida a Documentos" onChange={e => setNota(e.target.value)} style={CONTROL} />
        </Campo>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {a.estado === 'solicitada' && !firmando && <button type="button" disabled={ocupado} style={btnStyle('primario')} onClick={() => setFirmando(true)}>Firma recibida</button>}
        {a.estado === 'solicitada' && firmando && (
          <>
            <button type="button" disabled={ocupado || !nota.trim()} style={btnStyle('primario')} onClick={() => void accion('marcar_firmada', nota.trim())}>Anotar firma</button>
            <button type="button" disabled={ocupado} style={btnStyle('sutil')} onClick={() => setFirmando(false)}>Cancelar</button>
          </>
        )}
        {a.estado === 'firmada' && (
          <button type="button" disabled={ocupado} style={btnStyle('primario')}
            onClick={() => { if (window.confirm(`¿Ya se ha comunicado la anulación a ${a.compania ?? 'la compañía'}?`)) void accion('marcar_comunicada') }}>
            Comunicada a la compañía
          </button>
        )}
        {a.estado === 'comunicada' && (
          <button type="button" disabled={ocupado} style={btnStyle('secundario')}
            onClick={() => { if (window.confirm('¿La compañía ha confirmado la anulación? (CIMA también la confirma sola)')) void accion('confirmar') }}>
            La compañía la ha confirmado
          </button>
        )}
        <button type="button" disabled={ocupado} style={btnStyle('sutil')}
          onClick={() => { if (window.confirm('¿El cliente desiste de anular? El expediente se cierra.')) void accion('desistir') }}>
          El cliente desiste
        </button>
      </div>
      {a.estado === 'solicitada' && <span style={NOTA}>Sin la firma del cliente no se comunica a la compañía. Si tiene portal, la ve en «Pendiente de tu firma» y firma con un código a su correo; si firma en papel, pulsa «Firma recibida».</span>}
    </div>
  )
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }}>{etiqueta}{children}</label>
}

const NOTA: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--muted)' }
const CONTROL: React.CSSProperties = {
  minHeight: 44, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text)', font: 'inherit', fontSize: 14, width: '100%', boxSizing: 'border-box',
}
