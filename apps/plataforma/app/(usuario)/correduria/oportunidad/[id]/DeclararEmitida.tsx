'use client'
// «Póliza emitida» declarada a mano (22/10/2026, Alberto). Para los ramos que no se tarifican/emiten desde aquí
// (accidentes colectivos, RC, comercios, comunidades…): nº de póliza + compañía (obligatorios: del catálogo DGS o «otra»
// por nombre), fecha de efecto y nota. Una declaración equivocada se ANULA (vuelve a «en negociación»).
// El dato va por el puerto de asegura (`declarar_emitida`); la oportunidad pasa a ganada SIN póliza y se pinta
// «Emitida · pendiente de confirmar con CIMA» hasta que CIMA la trae y el enlace la confirma. NO es cartera.
import { useCallback, useEffect, useId, useState } from 'react'
import { btnStyle, cardStyle } from '@/components/ui'
import { interpretarOportunidad, rotuloEstadoDeclaracion, type LecturaOportunidad } from '@/lib/seguimiento-asegura'
import { OTRA, cuerpoAnulacion, cuerpoDeclaracion, formInicial, leerCatalogoCompanias, modoDeclaracion, puedeAnular, textoResultado, type FormDeclaracion } from '@/lib/correduria/declarar-emitida'
import type { CompaniaDeclarable } from '@central/module-seguros'
import { fechaEs } from './piezas-riesgo'

const campo: React.CSSProperties = {
  minHeight: 44, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', fontSize: 14, width: '100%', boxSizing: 'border-box',
}
const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)', minWidth: 0 }

const hoyMadrid = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })

export default function DeclararEmitida({ oportunidadId, onCambio }: { oportunidadId: string; onCambio?: () => void }) {
  const ids = useId()
  const [lectura, setLectura] = useState<LecturaOportunidad | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState<FormDeclaracion>(formInicial(null))
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  // Catálogo de compañías con su código DGS (`companias_dgs`). `undefined` = leyéndose · `null` = no se pudo leer.
  const [catalogo, setCatalogo] = useState<CompaniaDeclarable[] | null | undefined>(undefined)
  const [confirmarAnular, setConfirmarAnular] = useState(false)

  const leer = useCallback(async () => {
    try {
      const r = await fetch(`/api/correduria/oportunidad?id=${encodeURIComponent(oportunidadId)}`, { cache: 'no-store' })
      setLectura(interpretarOportunidad(r.status, await r.json().catch(() => null)))
    } catch {
      setLectura({ estado: 'error', motivo: 'sin conexión' })
    }
  }, [oportunidadId])
  useEffect(() => { void leer() }, [leer])
  useEffect(() => {
    if (!abierto || catalogo !== undefined) return
    void (async () => {
      try {
        const r = await fetch('/api/correduria/companias', { cache: 'no-store' })
        setCatalogo(leerCatalogoCompanias(r.status, await r.json().catch(() => null)))
      } catch {
        setCatalogo(null)
      }
    })()
  }, [abierto, catalogo])

  if (lectura === null) return <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Leyendo el desenlace…</p>
  if (lectura.estado !== 'ok') {
    return <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>No se ha podido leer el estado de la oportunidad: no se sabe si ya está declarada. Recarga la página.</p>
  }
  const op = lectura.oportunidad
  const actual = { estado: op.estado, polizaGanadaId: op.polizaGanadaId ?? null }
  const decl = lectura.declaracion
  const modo = modoDeclaracion({ ...actual, declaracion: decl })
  const rotulo = rotuloEstadoDeclaracion({ ...actual, declaracion: decl })

  async function enviar(cuerpo: Record<string, unknown>, que: 'declarar' | 'anular') {
    setEnviando(true); setAviso(null)
    let status = 0
    let json: unknown = null
    try {
      const r = await fetch('/api/correduria/oportunidad', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
      status = r.status
      json = await r.json().catch(() => null)
    } catch { /* status 0: no se sabe */ }
    const t = textoResultado(status, json, que)
    setAviso(t)
    setEnviando(false)
    if (t.ok) { setAbierto(false); setConfirmarAnular(false); await leer(); onCambio?.() }
  }
  async function guardar() {
    const c = cuerpoDeclaracion(oportunidadId, actual, form, hoyMadrid(), catalogo ?? null)
    if (!c.ok) { setAviso({ ok: false, texto: c.motivo }); return }
    await enviar(c.cuerpo, 'declarar')
  }

  return (
    <section aria-labelledby={`${ids}-t`} style={{ ...cardStyle, display: 'grid', gap: 8, minWidth: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div id={`${ids}-t`} style={{ fontSize: 14, fontWeight: 600 }}>Desenlace: póliza emitida en la compañía</div>
      {rotulo && decl ? (
        <div style={{ overflowWrap: 'anywhere', fontSize: 14 }}>
          <strong style={{ color: op.polizaGanadaId ? 'var(--positive)' : 'var(--warning)' }}>{rotulo}</strong>
          {' '}· póliza {decl.numeroPoliza} de {decl.compania}{decl.codigoDgs ? '' : ' (sin código DGS)'}{decl.fechaEfecto ? `, efecto ${fechaEs(decl.fechaEfecto)}` : ''}.
          {!op.polizaGanadaId && (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Declarada a mano el {fechaEs(decl.declaradaAt)}. No cuenta como cartera ni como cliente hasta que CIMA la traiga;
              entonces se enlaza sola (mismo nº y tomador{decl.codigoDgs ? ', misma compañía' : ''}). Si no llega en 10 días, o llega y no se puede
              enlazar, sale en el aviso del cruce con CIMA.
            </div>
          )}
        </div>
      ) : modo === 'declarar' ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Este ramo se cotiza y emite en la compañía. Cuando la emitas allí, apunta aquí el nº de póliza y la compañía: la oportunidad
          queda ganada y «pendiente de confirmar con CIMA» hasta que CIMA la traiga.
        </p>
      ) : op.estado === 'perdida' ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Oportunidad perdida: reábrela antes de dar la póliza por emitida.</p>
      ) : null}

      {modo !== 'nada' && !abierto && !confirmarAnular && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => { setForm(formInicial(decl)); setAviso(null); setAbierto(true) }}
            style={{ ...btnStyle(modo === 'declarar' ? 'primario' : 'secundario', 'md'), minHeight: 44, maxWidth: '100%', whiteSpace: 'normal', height: 'auto' }}>
            {modo === 'declarar' ? 'Póliza emitida…' : 'Corregir la declaración'}
          </button>
          {puedeAnular({ ...actual, declaracion: decl }) && (
            <button type="button" onClick={() => { setAviso(null); setConfirmarAnular(true) }} style={{ ...btnStyle('sutil', 'md'), minHeight: 44 }}>
              Anular la declaración
            </button>
          )}
        </div>
      )}

      {confirmarAnular && (
        <div role="group" aria-label="Confirmar anulación" style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <p style={{ margin: 0, fontSize: 13 }}>
            ¿Anular la declaración? La oportunidad vuelve a «en negociación» y deja de esperar esta póliza en CIMA. Queda constancia en su historial.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={enviando} onClick={() => void enviar(cuerpoAnulacion(oportunidadId), 'anular')} style={{ ...btnStyle('secundario', 'md'), minHeight: 44, color: 'var(--negative)' }}>
              {enviando ? 'Anulando…' : 'Sí, anular'}
            </button>
            <button type="button" disabled={enviando} onClick={() => setConfirmarAnular(false)} style={{ ...btnStyle('sutil', 'md'), minHeight: 44 }}>No</button>
          </div>
        </div>
      )}

      {abierto && (
        <form onSubmit={(e) => { e.preventDefault(); void guardar() }} style={{ display: 'grid', gap: 10, minWidth: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
            <label style={etiqueta}>Nº de póliza (obligatorio)
              <input value={form.numeroPoliza} onChange={(e) => setForm({ ...form, numeroPoliza: e.target.value })} maxLength={60} required autoComplete="off" inputMode="text" style={campo} />
            </label>
            <label style={etiqueta}>Compañía (obligatoria)
              <select value={form.codigoDgs} onChange={(e) => setForm({ ...form, codigoDgs: e.target.value })} required style={campo}>
                <option value="">{catalogo === undefined ? 'Leyendo el catálogo…' : 'Elige…'}</option>
                {(catalogo ?? []).map((c) => <option key={c.codigoDgs} value={c.codigoDgs}>{c.nombreComun}</option>)}
                <option value={OTRA}>Otra (sin código DGS)</option>
              </select>
            </label>
            {form.codigoDgs === OTRA && (
              <label style={etiqueta}>Nombre de la compañía
                <input value={form.companiaLibre} onChange={(e) => setForm({ ...form, companiaLibre: e.target.value })} maxLength={120} required autoComplete="off" style={campo} />
              </label>
            )}
            <label style={etiqueta}>Fecha de efecto (opcional)
              <input type="date" value={form.fechaEfecto} onChange={(e) => setForm({ ...form, fechaEfecto: e.target.value })} style={campo} />
            </label>
          </div>
          <label style={etiqueta}>Nota (opcional; va a la ficha del cliente)
            <textarea value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} maxLength={500} rows={3} style={{ ...campo, padding: 10, minHeight: 88 }} />
          </label>
          {catalogo === null && (
            <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--warning)' }}>No se ha podido leer el catálogo de compañías: solo puedes declarar «Otra» por nombre (se casará con CIMA solo por nº y tomador).</p>
          )}
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
            No crea la póliza en la cartera: queda «Emitida · pendiente de confirmar con CIMA».
            {form.codigoDgs === OTRA ? ' Sin código DGS se casará con CIMA solo por nº y tomador.' : ''}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="submit" disabled={enviando} style={{ ...btnStyle('primario', 'md'), minHeight: 44 }}>{enviando ? 'Guardando…' : 'Guardar como emitida'}</button>
            <button type="button" disabled={enviando} onClick={() => setAbierto(false)} style={{ ...btnStyle('sutil', 'md'), minHeight: 44 }}>Cancelar</button>
          </div>
        </form>
      )}
      {aviso && <p role={aviso.ok ? 'status' : 'alert'} style={{ margin: 0, fontSize: 13, color: aviso.ok ? 'var(--positive)' : 'var(--negative)', overflowWrap: 'anywhere' }}>{aviso.texto}</p>}
    </section>
  )
}
