'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileSearch, RefreshCw } from 'lucide-react'
import { Badge, CardHeader, btnStyle, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import {
  ROTULO_ESTADO,
  ROTULO_GRUPO,
  edicionDeFormulario,
  estadoExtraccion,
  formularioDe,
  leerRespuesta,
  textoAviso,
  textoFranquicia,
  textoLimite,
  type Condicion,
  type FichaDetalle,
  type FichaResumen,
  type FormularioEdicion,
  type TarificacionConPdf,
} from '@/lib/tarificador-fichas-vista'

const PASO = 20
const fila: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'grid', gap: 6, minWidth: 0 }
const campo: React.CSSProperties = { minHeight: 44, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', width: '100%', minWidth: 0 }
const fecha = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' })
}

function Aviso({ texto }: { texto: string }) {
  return (
    <p role="alert" style={{ margin: 0, padding: 12, borderRadius: 10, border: '1px solid var(--warning)', color: 'var(--warning)', background: 'var(--warning-bg)', overflowWrap: 'anywhere' }}>
      {texto}
    </p>
  )
}

export default function FichasTarificador() {
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [recargaFichas, setRecargaFichas] = useState(0)
  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <Tarificaciones onExtraida={(fichaId) => { setRecargaFichas((n) => n + 1); if (fichaId) setSeleccion(fichaId) }} />
      <ListaFichas recarga={recargaFichas} seleccion={seleccion} onElegir={setSeleccion} />
      {seleccion && <Detalle key={seleccion} id={seleccion} onCambio={() => setRecargaFichas((n) => n + 1)} />}
    </div>
  )
}

// ─── Tarificaciones con PDF ──────────────────────────────────────────────────

function Tarificaciones({ onExtraida }: { onExtraida: (fichaId: string | null) => void }) {
  const [limite, setLimite] = useState(PASO)
  const [estado, setEstado] = useState<{ cargando: boolean; lista: TarificacionConPdf[] | null; activas: boolean; error: string | null }>({ cargando: true, lista: null, activas: true, error: null })
  const [enCurso, setEnCurso] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Record<string, string>>({})

  const cargar = useCallback(async () => {
    setEstado((e) => ({ ...e, cargando: true }))
    try {
      const res = await fetch(`/api/correduria/tarificador/coberturas?limite=${limite}`, { cache: 'no-store' })
      const r = leerRespuesta(res.status, await res.json().catch(() => null), (j) =>
        Array.isArray(j.tarificaciones) ? { lista: j.tarificaciones as TarificacionConPdf[], activas: j.fichasActivas !== false } : null)
      setEstado((e) => (r.ok ? { cargando: false, lista: r.dato.lista, activas: r.dato.activas, error: null } : { ...e, cargando: false, error: r.mensaje }))
    } catch {
      setEstado((e) => ({ ...e, cargando: false, error: 'No se han podido cargar las tarificaciones (red).' }))
    }
  }, [limite])
  useEffect(() => { void cargar() }, [cargar])

  async function extraer(id: string) {
    setEnCurso(id)
    setResultado((r) => ({ ...r, [id]: 'Leyendo el PDF… (puede tardar un minuto)' }))
    try {
      const res = await fetch('/api/correduria/tarificador/coberturas', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tarificacionId: id }),
      })
      const json = await res.json().catch(() => null)
      const r = leerRespuesta(res.status, json, (j) => (j.estado === 'ok' ? j : null))
      if (r.ok) {
        const d = r.dato as { modo?: string; fichaId?: string | null; avisos?: unknown[]; condicionadoCambiado?: boolean | null }
        const avisos = Array.isArray(d.avisos) ? d.avisos.length : 0
        const texto = d.modo === 'solo_presupuesto'
          ? `Ficha ya validada: leídos capitales y prima.${d.condicionadoCambiado ? ' ⚠️ El condicionado ha cambiado: revisa la ficha.' : ''}`
          : `Ficha en borrador (pendiente de validar).${avisos ? ` ${avisos} valor(es) anulados por no estar escritos en el PDF.` : ''}`
        setResultado((x) => ({ ...x, [id]: texto }))
        onExtraida(d.fichaId ?? null)
      } else {
        setResultado((x) => ({ ...x, [id]: r.mensaje }))
      }
      void cargar()
    } catch {
      setResultado((x) => ({ ...x, [id]: 'No se ha podido extraer (red).' }))
    } finally {
      setEnCurso(null)
    }
  }

  const { lista, cargando, error, activas } = estado
  return (
    <section style={cardStyle}>
      <CardHeader
        title="Proyectos del bot"
        sub="Tarificaciones con el PDF del proyecto de la compañía. «Extraer coberturas» gasta IA (con tope) y no envía nada."
        action={(
          <button type="button" onClick={() => void cargar()} disabled={cargando} style={{ ...btnStyle('secundario'), minHeight: 44 }}>
            <RefreshCw size={15} strokeWidth={1.75} aria-hidden /> {cargando ? 'Cargando…' : 'Actualizar'}
          </button>
        )}
      />
      <div style={{ display: 'grid', gap: 8 }}>
        {error && <Aviso texto={`${error}${lista ? ' Lo de abajo es la última lectura buena.' : ''}`} />}
        {!activas && <Aviso texto="Las fichas aún no están activadas: falta aplicar el SQL 2026-10-07c_tarificador_fichas.sql. La extracción no se puede guardar todavía." />}
        {!lista && !error && <p className="muted" style={{ margin: 0 }}>Cargando…</p>}
        {lista && lista.length === 0 && <p className="muted" style={{ margin: 0 }}>El bot aún no ha devuelto ningún proyecto.</p>}
        {lista && lista.length > 0 && (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {lista.map((t) => {
              const e = estadoExtraccion(t)
              return (
                <li key={t.tarificacionId} style={fila}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <strong style={{ overflowWrap: 'anywhere', minWidth: 0, textTransform: 'capitalize' }}>{t.compania} · {t.producto ?? 'producto sin nombre'}</strong>
                    <Badge tono={e.tono}>{e.texto}</Badge>
                  </div>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {fecha(t.creadaEn)} · {t.ramo} · prima {t.primaAnualEur === null ? '—' : eur(t.primaAnualEur)}
                  </span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" disabled={!t.tienePdf || !activas || enCurso !== null} onClick={() => void extraer(t.tarificacionId)} style={{ ...btnStyle('primario'), minHeight: 44 }}>
                      <FileSearch size={15} strokeWidth={1.75} aria-hidden /> {enCurso === t.tarificacionId ? 'Extrayendo…' : t.extraccion ? 'Volver a extraer' : 'Extraer coberturas'}
                    </button>
                    {t.extraccion?.fichaId && (
                      <button type="button" onClick={() => onExtraida(t.extraccion?.fichaId ?? null)} style={{ ...btnStyle('secundario'), minHeight: 44 }}>Ver ficha</button>
                    )}
                  </div>
                  {resultado[t.tarificacionId] && <span style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{resultado[t.tarificacionId]}</span>}
                </li>
              )
            })}
          </ul>
        )}
        {lista && lista.length >= limite && limite < 100 && (
          <button type="button" onClick={() => setLimite((n) => Math.min(100, n + PASO))} style={{ ...btnStyle('sutil'), minHeight: 44, justifySelf: 'start' }}>Ver más</button>
        )}
      </div>
    </section>
  )
}

// ─── Lista de fichas ─────────────────────────────────────────────────────────

function ListaFichas({ recarga, seleccion, onElegir }: { recarga: number; seleccion: string | null; onElegir: (id: string) => void }) {
  const [estado, setEstado] = useState<{ cargando: boolean; fichas: FichaResumen[] | null; siguiente: string | null; error: string | null }>({ cargando: true, fichas: null, siguiente: null, error: null })

  const cargar = useCallback(async (antesDe: string | null) => {
    setEstado((e) => ({ ...e, cargando: true }))
    try {
      const q = new URLSearchParams({ limite: String(PASO) })
      if (antesDe) q.set('antes_de', antesDe)
      const res = await fetch(`/api/correduria/tarificador/fichas?${q}`, { cache: 'no-store' })
      const r = leerRespuesta(res.status, await res.json().catch(() => null), (j) =>
        Array.isArray(j.fichas) ? { fichas: j.fichas as FichaResumen[], siguiente: typeof j.siguiente === 'string' ? j.siguiente : null } : null)
      setEstado((e) => (r.ok
        ? { cargando: false, fichas: antesDe ? [...(e.fichas ?? []), ...r.dato.fichas] : r.dato.fichas, siguiente: r.dato.siguiente, error: null }
        : { ...e, cargando: false, error: r.mensaje }))
    } catch {
      setEstado((e) => ({ ...e, cargando: false, error: 'No se han podido cargar las fichas (red).' }))
    }
  }, [])
  useEffect(() => { void cargar(null) }, [cargar, recarga])

  const { fichas, siguiente, cargando, error } = estado
  return (
    <section style={cardStyle}>
      <CardHeader title="Fichas de producto" sub="Pendiente = leída por la IA y comprobada contra el PDF, sin revisar. Validada = revisada por ti." />
      <div style={{ display: 'grid', gap: 8 }}>
        {error && <Aviso texto={error} />}
        {!fichas && !error && <p className="muted" style={{ margin: 0 }}>Cargando…</p>}
        {fichas && fichas.length === 0 && <p className="muted" style={{ margin: 0 }}>Aún no hay fichas: extrae las coberturas de un proyecto.</p>}
        {fichas && fichas.length > 0 && (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {fichas.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onElegir(f.id)}
                  aria-pressed={seleccion === f.id}
                  style={{ ...fila, width: '100%', textAlign: 'left', cursor: 'pointer', background: 'var(--surface)', borderColor: seleccion === f.id ? 'var(--primary)' : 'var(--border)', color: 'var(--text)', minHeight: 44 }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ overflowWrap: 'anywhere', minWidth: 0, textTransform: 'capitalize' }}>{f.compania} · {f.producto}{f.version ? ` (${f.version})` : ''}</strong>
                    <Badge tono={f.estado === 'validada' ? 'positivo' : 'aviso'}>{f.estado === 'validada' ? 'Validada' : 'Pendiente'}</Badge>
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {f.ramo} · {f.garantiasLeidas} garantías leídas{f.avisos ? ` · ${f.avisos} avisos` : ''} · {f.validadaAt ? `validada el ${fecha(f.validadaAt)}` : `actualizada el ${fecha(f.actualizadaAt)}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {siguiente && (
          <button type="button" disabled={cargando} onClick={() => void cargar(siguiente)} style={{ ...btnStyle('sutil'), minHeight: 44, justifySelf: 'start' }}>Ver más</button>
        )}
      </div>
    </section>
  )
}

// ─── Detalle ─────────────────────────────────────────────────────────────────

function Detalle({ id, onCambio }: { id: string; onCambio: () => void }) {
  const [estado, setEstado] = useState<{ ficha: FichaDetalle | null; error: string | null }>({ ficha: null, error: null })
  const [editando, setEditando] = useState<string | null>(null)
  const [verAvisos, setVerAvisos] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/correduria/tarificador/fichas/${id}`, { cache: 'no-store' })
      const r = leerRespuesta(res.status, await res.json().catch(() => null), (j) => (j.ficha && typeof j.ficha === 'object' ? (j.ficha as FichaDetalle) : null))
      setEstado((e) => (r.ok ? { ficha: r.dato, error: null } : { ...e, error: r.mensaje }))
    } catch {
      setEstado((e) => ({ ...e, error: 'No se ha podido cargar la ficha (red).' }))
    }
  }, [id])
  useEffect(() => { void cargar() }, [cargar])
  // Al abrir una ficha, llevarla a la vista (en el móvil queda debajo de las listas).
  const cargada = estado.ficha !== null
  useEffect(() => {
    if (cargada) document.getElementById('ficha')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [cargada])

  async function cambiar(cuerpo: Record<string, unknown>): Promise<boolean> {
    setGuardando(true)
    setMensaje(null)
    try {
      const res = await fetch(`/api/correduria/tarificador/fichas/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
      const r = leerRespuesta(res.status, await res.json().catch(() => null), (j) => (j.estado === 'ok' ? j : null))
      if (!r.ok) { setMensaje(r.mensaje); return false }
      await cargar()
      onCambio()
      return true
    } catch {
      setMensaje('No se ha podido guardar (red).')
      return false
    } finally {
      setGuardando(false)
    }
  }

  const { ficha, error } = estado
  if (!ficha) return <section style={cardStyle}>{error ? <Aviso texto={error} /> : <p className="muted" style={{ margin: 0 }}>Cargando la ficha…</p>}</section>

  const grupos = [...new Set(ficha.catalogo.map((g) => g.grupo))]
  return (
    <section style={cardStyle} id="ficha">
      <CardHeader
        title={`${ficha.compania} · ${ficha.producto}${ficha.version ? ` (${ficha.version})` : ''}`}
        sub={ficha.estado === 'validada'
          ? `Validada el ${ficha.validadaAt ? fecha(ficha.validadaAt) : '—'}. Los presupuestos nuevos de este producto solo leen capitales y prima.`
          : 'Pendiente: revisa cada garantía con su cita y valida. Editar una garantía la deja pendiente otra vez.'}
        action={ficha.estado !== 'validada' ? (
          <button type="button" disabled={guardando} onClick={() => void cambiar({ accion: 'validar' })} style={{ ...btnStyle('primario'), minHeight: 44 }}>Validar ficha</button>
        ) : <Badge tono="positivo">Validada</Badge>}
      />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {error && <Aviso texto={error} />}
        {mensaje && <Aviso texto={mensaje} />}
        {ficha.avisosDetalle.length > 0 && (
          <div>
            <button type="button" onClick={() => setVerAvisos((v) => !v)} style={{ ...btnStyle('sutil'), minHeight: 44 }}>
              {verAvisos ? 'Ocultar' : 'Ver'} {ficha.avisosDetalle.length} valor(es) anulados al validar contra el PDF
            </button>
            {verAvisos && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4 }}>
                {ficha.avisosDetalle.slice(0, 100).map((a, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}>{textoAviso(a)}</li>)}
              </ul>
            )}
          </div>
        )}
        {grupos.map((grupo) => (
          <div key={grupo} style={{ display: 'grid', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>{ROTULO_GRUPO[grupo] ?? grupo}</h3>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
              {ficha.catalogo.filter((g) => g.grupo === grupo).map((g) => (
                <Garantia
                  key={g.clave}
                  etiqueta={g.etiqueta}
                  esCapital={g.tipoValor === 'capital'}
                  c={ficha.condiciones.garantias[g.clave]}
                  editando={editando === g.clave}
                  guardando={guardando}
                  onEditar={() => setEditando(editando === g.clave ? null : g.clave)}
                  onGuardar={async (edicion) => { if (await cambiar({ accion: 'editar', clave: g.clave, edicion })) setEditando(null) }}
                />
              ))}
            </ul>
          </div>
        ))}
        {ficha.condiciones.extras.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>Fuera del catálogo</h3>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
              {ficha.condiciones.extras.slice(0, 50).map((e, i) => (
                <li key={i} style={fila}>
                  <strong style={{ overflowWrap: 'anywhere' }}>{e.literal}</strong>
                  <Cita cita={e.cita} pagina={e.pagina} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <Presupuestos lista={ficha.presupuestos} etiquetas={Object.fromEntries(ficha.catalogo.map((g) => [g.clave, g.etiqueta]))} />
      </div>
    </section>
  )
}

function Cita({ cita, pagina }: { cita: string | null; pagina: number | null }) {
  if (!cita) return null
  return (
    <blockquote style={{ margin: 0, padding: '6px 10px', borderLeft: '3px solid var(--border)', fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>
      «{cita}»{pagina !== null ? ` — pág. ${pagina}` : ''}
    </blockquote>
  )
}

function Garantia({ etiqueta, esCapital, c, editando, guardando, onEditar, onGuardar }: {
  etiqueta: string; esCapital: boolean; c: Condicion | undefined; editando: boolean; guardando: boolean
  onEditar: () => void; onGuardar: (edicion: Record<string, unknown>) => Promise<void>
}) {
  const limite = textoLimite(c?.limite ?? null)
  const franquicia = textoFranquicia(c?.franquicia ?? null)
  return (
    <li style={fila}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{etiqueta}</strong>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {c?.origen === 'humano' && <Badge tono="info">Editada</Badge>}
          {c?.estado ? <Badge tono={c.estado === 'incluida' ? 'positivo' : c.estado === 'excluida' ? 'negativo' : 'neutral'}>{ROTULO_ESTADO[c.estado]}</Badge> : <Badge>No consta</Badge>}
        </span>
      </div>
      {c?.literal && <span className="muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>Como la llama la compañía: {c.literal}</span>}
      <span style={{ fontSize: 13 }}>
        Límite: <strong>{limite ?? (esCapital ? 'el capital del presupuesto' : 'no consta')}</strong> · Franquicia: <strong>{franquicia ?? 'no consta'}</strong>
      </span>
      {c?.sublimites && c.sublimites.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {c.sublimites.map((s, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}>{s.concepto}: {textoLimite(s.limite)}</li>)}
        </ul>
      )}
      {c?.notas && <span style={{ fontSize: 13, overflowWrap: 'anywhere' }}>Notas: {c.notas}</span>}
      <Cita cita={c?.cita ?? null} pagina={c?.pagina ?? null} />
      <button type="button" onClick={onEditar} style={{ ...btnStyle('sutil', 'md'), justifySelf: 'start' }}>{editando ? 'Cancelar' : 'Editar'}</button>
      {editando && <Editor inicial={formularioDe(c)} guardando={guardando} onGuardar={onGuardar} />}
    </li>
  )
}

function Editor({ inicial, guardando, onGuardar }: { inicial: FormularioEdicion; guardando: boolean; onGuardar: (edicion: Record<string, unknown>) => Promise<void> }) {
  const [f, setF] = useState(inicial)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof FormularioEdicion>(k: K, v: FormularioEdicion[K]) => setF((x) => ({ ...x, [k]: v }))
  const rejilla: React.CSSProperties = { display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const r = edicionDeFormulario(f)
        if (!r.ok) { setError(r.mensaje); return }
        setError(null)
        void onGuardar(r.edicion)
      }}
      style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}
    >
      <div style={rejilla}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Estado
          <select value={f.estado} onChange={(e) => set('estado', e.target.value as FormularioEdicion['estado'])} style={campo}>
            <option value="">No consta</option><option value="incluida">Incluida</option><option value="opcional">Opcional</option><option value="excluida">Excluida</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Límite
          <select value={f.limiteTipo} onChange={(e) => set('limiteTipo', e.target.value as FormularioEdicion['limiteTipo'])} style={campo}>
            <option value="">No consta</option><option value="importe">Importe (€)</option><option value="primer_riesgo">A primer riesgo (€)</option><option value="porcentaje">Porcentaje (%)</option>
          </select>
        </label>
        {f.limiteTipo !== '' && (
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>{f.limiteTipo === 'porcentaje' ? '%' : '€'}
            <input inputMode="decimal" value={f.limiteValor} onChange={(e) => set('limiteValor', e.target.value)} style={campo} />
          </label>
        )}
        {f.limiteTipo === 'porcentaje' && (
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Sobre
            <input value={f.limiteSobre} onChange={(e) => set('limiteSobre', e.target.value)} style={campo} />
          </label>
        )}
        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Franquicia
          <select value={f.franquiciaTipo} onChange={(e) => set('franquiciaTipo', e.target.value as FormularioEdicion['franquiciaTipo'])} style={campo}>
            <option value="">No consta</option><option value="sin_franquicia">Sin franquicia</option><option value="importe">Importe (€)</option><option value="porcentaje">Porcentaje (%)</option>
          </select>
        </label>
        {(f.franquiciaTipo === 'importe' || f.franquiciaTipo === 'porcentaje') && (
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>{f.franquiciaTipo === 'porcentaje' ? '%' : '€'}
            <input inputMode="decimal" value={f.franquiciaValor} onChange={(e) => set('franquiciaValor', e.target.value)} style={campo} />
          </label>
        )}
        {f.franquiciaTipo === 'porcentaje' && (
          <>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Mínimo €
              <input inputMode="decimal" value={f.franquiciaMinimo} onChange={(e) => set('franquiciaMinimo', e.target.value)} style={campo} />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Máximo €
              <input inputMode="decimal" value={f.franquiciaMaximo} onChange={(e) => set('franquiciaMaximo', e.target.value)} style={campo} />
            </label>
          </>
        )}
      </div>
      <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>Notas
        <textarea value={f.notas} onChange={(e) => set('notas', e.target.value)} rows={2} style={{ ...campo, minHeight: 60 }} />
      </label>
      {error && <Aviso texto={error} />}
      <button type="submit" disabled={guardando} style={{ ...btnStyle('primario'), justifySelf: 'start' }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
    </form>
  )
}

function Presupuestos({ lista, etiquetas }: { lista: FichaDetalle['presupuestos']; etiquetas: Record<string, string> }) {
  const [ver, setVer] = useState(5)
  if (lista.length === 0) return null
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 14 }}>Presupuestos de este producto</h3>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
        {lista.slice(0, ver).map((p) => (
          <li key={p.tarificacionId} style={fila}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 12 }}>{fecha(p.creadoEn)}</span>
              {p.condicionadoCambiado && <Badge tono="aviso">Condicionado cambiado ({p.citasAusentes.length})</Badge>}
            </span>
            <span style={{ fontSize: 13 }}>
              Prima total: <strong>{p.valores.primaTotalEur ? eur(p.valores.primaTotalEur.valor) : '—'}</strong>
              {p.valores.primaNetaEur && <> · neta {eur(p.valores.primaNetaEur.valor)}</>}
              {p.valores.franquiciaGeneral && <> · franquicia general {textoFranquicia(p.valores.franquiciaGeneral.franquicia)}</>}
            </span>
            {Object.entries(p.valores.capitales).map(([k, v]) => (
              <span key={k} style={{ fontSize: 13 }}>{etiquetas[k] ?? k}: <strong>{eur(v.valor)}</strong></span>
            ))}
            {p.condicionadoCambiado && p.citasAusentes.length > 0 && (
              <span className="muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>Ya no figura en el PDF lo citado en: {p.citasAusentes.slice(0, 20).map((c) => etiquetas[c] ?? c).join(' · ')}</span>
            )}
          </li>
        ))}
      </ul>
      {lista.length > ver && (
        <button type="button" onClick={() => setVer((v) => v + 5)} style={{ ...btnStyle('sutil'), minHeight: 44, justifySelf: 'start' }}>Ver más ({lista.length - ver})</button>
      )}
    </div>
  )
}
