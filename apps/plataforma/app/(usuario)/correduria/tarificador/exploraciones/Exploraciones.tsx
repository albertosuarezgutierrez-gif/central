'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, RefreshCw, Undo2, Plus, XCircle } from 'lucide-react'
import type { PantallaMapaExploracion } from '@central/module-tarificacion'
import { Badge, CardHeader, btnStyle, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import {
  ENCOLAR_DISPONIBLE,
  ENTRADA_POR_DEFECTO,
  OPCIONES_NUEVA,
  ORIGEN_TEXTO,
  costeExploracion,
  estadoExploracion,
  leerDetalle,
  leerEncolar,
  leerLista,
  mensajeError,
  motivoFinTexto,
  puedeAprobarMapa,
  textoAccion,
  textoConfirmarAprobar,
  type DetalleExploracion,
  type ResumenExploracion,
} from '@/lib/tarificador-exploraciones'

const API = '/api/correduria/tarificador/exploraciones'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Filas que se pintan de golpe (regla de rendimiento): el resto, con «Ver más». */
const PASO = 50

const campo: React.CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14,
}
const fila: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'grid', gap: 6, minWidth: 0 }
const aviso = (tono: 'warning' | 'negative' | 'positive'): React.CSSProperties => ({
  margin: 0, padding: 12, borderRadius: 10, border: `1px solid var(--${tono})`, color: `var(--${tono})`, background: `var(--${tono}-bg)`, overflowWrap: 'anywhere',
})
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' }) : '—')

async function pedir(url: string, init?: RequestInit): Promise<{ status: number; json: unknown }> {
  try {
    const res = await fetch(url, { cache: 'no-store', ...init })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: null }
  }
}

export default function Exploraciones() {
  const [lista, setLista] = useState<ResumenExploracion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [visibles, setVisibles] = useState(PASO)

  const cargar = useCallback(async () => {
    setCargando(true)
    const r = await pedir(API)
    const l = leerLista(r.status, r.json)
    // Si falla una recarga, la lista anterior se queda (no se desmonta) y el aviso se pinta encima.
    if (l.ok) { setLista(l.lista); setError(null) } else setError(l.mensaje)
    setCargando(false)
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <NuevaExploracion onEncolada={() => void cargar()} />
      <section style={cardStyle}>
        <CardHeader
          title="Exploraciones"
          sub="Abre una para ver sus pasos, el mapa que ha salido y aprobarlo."
          action={
            <button type="button" onClick={() => void cargar()} disabled={cargando} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
              <RefreshCw size={15} strokeWidth={1.75} aria-hidden /> {cargando ? 'Cargando…' : 'Actualizar'}
            </button>
          }
        />
        {error && <p role="alert" style={aviso('warning')}>{lista ? error : `No se pudo comprobar: ${error}`}</p>}
        {!lista && !error && <p className="muted" style={{ margin: 0 }}>Cargando…</p>}
        {lista && lista.length === 0 && <p className="muted" style={{ margin: 0 }}>Aún no hay exploraciones.</p>}
        {lista && lista.length > 0 && (
          <ul style={{ margin: error ? '12px 0 0' : 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {lista.slice(0, visibles).map((r) => {
              const est = estadoExploracion(r)
              const coste = costeExploracion(r)
              const abiertaEsta = abierta === r.id
              return (
                <li key={r.id} style={fila}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <strong style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{r.compania} · {r.producto}</strong>
                    <Badge tono={est.tono}>{est.texto}</Badge>
                  </div>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {r.pasos} paso{r.pasos === 1 ? '' : 's'} · IA: {r.llamadasIA} llamada{r.llamadasIA === 1 ? '' : 's'} ·{' '}
                    <span title={coste.real ? 'Coste real de la pasarela' : 'Estimado: no se pudo leer el coste real'}>coste {coste.texto}</span>
                    {' '}· {fecha(r.creadoEn)}
                  </span>
                  <span style={{ fontSize: 13, overflowWrap: 'anywhere' }}>Terminó por: {motivoFinTexto(r.motivoFin)}</span>
                  <button type="button" onClick={() => setAbierta(abiertaEsta ? null : r.id)} style={{ ...btnStyle(abiertaEsta ? 'sutil' : 'secundario', 'sm'), minHeight: 44, justifySelf: 'start' }}>
                    {abiertaEsta ? 'Cerrar' : 'Abrir'}
                  </button>
                  {abiertaEsta && <Detalle id={r.id} onCambio={() => void cargar()} />}
                </li>
              )
            })}
          </ul>
        )}
        {lista && lista.length > visibles && (
          <button type="button" onClick={() => setVisibles((v) => v + PASO)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, marginTop: 12 }}>
            Ver más ({lista.length - visibles})
          </button>
        )}
      </section>
    </div>
  )
}

/**
 * «Nueva exploración»: compañía + producto de una lista CERRADA (por defecto Allianz Hogar; sintética, con datos de
 * prueba). Encola en asegura; si el explorador está apagado allí (503), lo dice y no encola nada.
 */
function NuevaExploracion({ onEncolada }: { onEncolada: () => void }) {
  const [entrada, setEntrada] = useState<string>(ENTRADA_POR_DEFECTO)
  const [oportunidadId, setOportunidadId] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [res, setRes] = useState<{ tono: 'warning' | 'negative' | 'positive'; texto: string } | null>(null)
  const oportunidad = oportunidadId.trim()
  const oportunidadMal = oportunidad !== '' && !UUID_RE.test(oportunidad)
  const encolar = async () => {
    if (oportunidadMal) return
    setOcupado(true)
    setRes(null)
    const body = oportunidad ? { entrada, oportunidadId: oportunidad } : { entrada }
    const r = await pedir(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = r.json as { mensaje?: unknown } | null
    if (r.status === 409 && j && typeof j.mensaje === 'string' && j.mensaje) {
      // Rechazo de asegura (p. ej. oportunidad_incompleta: falta …): se muestra tal cual.
      setRes({ tono: 'negative', texto: j.mensaje })
      setOcupado(false)
      return
    }
    const l = leerEncolar(r.status, r.json)
    if (l.ok) { setRes({ tono: 'positive', texto: l.texto }); onEncolada() } else setRes({ tono: l.apagado ? 'warning' : 'negative', texto: l.mensaje })
    setOcupado(false)
  }
  return (
    <section style={cardStyle}>
      <CardHeader title="Nueva exploración" sub="Sin oportunidad usa datos de prueba (sintética): no toca ningún cliente real." />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 13, flex: '1 1 220px', minWidth: 0 }}>
          Compañía y producto
          <select value={entrada} onChange={(e) => setEntrada(e.target.value)} style={campo} disabled={!ENCOLAR_DISPONIBLE || ocupado}>
            {OPCIONES_NUEVA.map((o) => <option key={o.entrada} value={o.entrada}>{o.compania} · {o.producto}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 13, flex: '1 1 260px', minWidth: 0 }}>
          ID de oportunidad (datos reales)
          <input
            type="text" value={oportunidadId} onChange={(e) => setOportunidadId(e.target.value)} style={campo}
            disabled={!ENCOLAR_DISPONIBLE || ocupado} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            autoComplete="off" spellCheck={false} aria-invalid={oportunidadMal} aria-describedby="ayuda-oportunidad"
          />
          <span id="ayuda-oportunidad" className="muted" style={{ fontSize: 12 }}>
            Opcional. Con oportunidad, la exploración usa los datos reales del cliente y de la vivienda de esa oportunidad.
          </span>
          {oportunidadMal && <span role="alert" style={{ fontSize: 12, color: 'var(--negative)' }}>El ID no tiene formato válido (uuid).</span>}
        </label>
        <button type="button" onClick={() => void encolar()} disabled={!ENCOLAR_DISPONIBLE || ocupado || oportunidadMal} style={{ ...btnStyle('primario'), minHeight: 44 }}>
          <Plus size={15} strokeWidth={1.75} aria-hidden /> {ocupado ? 'Encolando…' : 'Nueva exploración'}
        </button>
      </div>
      {res && <p role={res.tono === 'positive' ? 'status' : 'alert'} style={{ ...aviso(res.tono), marginTop: 8 }}>{res.texto}</p>}
    </section>
  )
}

function Detalle({ id, onCambio }: { id: string; onCambio: () => void }) {
  const [d, setD] = useState<DetalleExploracion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [pasosVisibles, setPasosVisibles] = useState(PASO)
  const [pantallasVisibles, setPantallasVisibles] = useState(PASO)

  const cargar = useCallback(async () => {
    const r = await pedir(`${API}/${encodeURIComponent(id)}`)
    const l = leerDetalle(r.status, r.json)
    if (l.ok) { setD(l.detalle); setError(null) } else setError(l.mensaje)
  }, [id])
  useEffect(() => { void cargar() }, [cargar])

  async function cambiar(estado: 'revisado' | 'descartado' | 'borrador', que: string) {
    if (!d) return
    if (estado === 'revisado' && !window.confirm(textoConfirmarAprobar(d))) return
    setOcupado(true)
    const r = await pedir(`${API}/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ estado }) })
    const e = mensajeError(r.status, r.json, que)
    setError(e)
    setOcupado(false)
    if (!e) { await cargar(); onCambio() }
  }

  if (!d) {
    return error
      ? <p role="alert" style={aviso('warning')}>No se pudo comprobar: {error}</p>
      : <p className="muted" style={{ margin: 0 }}>Cargando…</p>
  }
  const aprobar = puedeAprobarMapa(d)
  const coste = costeExploracion(d)
  return (
    <div style={{ display: 'grid', gap: 12, minWidth: 0, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      {error && <p role="alert" style={aviso('warning')}>{error}</p>}
      <p className="muted" style={{ margin: 0, fontSize: 12, overflowWrap: 'anywhere' }}>
        Entrada {d.entrada} · modelo {d.modelo ?? '—'} · coste {coste.texto}
        {d.costeRealEur !== null && d.costeEstimadoEur > 0 ? ` (estimado ${eur(d.costeEstimadoEur)})` : ''}
        {' '}· {d.conDatosReales ? 'ligada a una petición real' : 'datos de prueba'} · cerrada {fecha(d.cerradaEn)}
        {d.revisadoPor ? ` · revisada por ${d.revisadoPor} el ${fecha(d.revisadoEn)}` : ''}
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" disabled={!aprobar.ok || ocupado} onClick={() => void cambiar('revisado', 'Aprobar el mapa')} style={{ ...btnStyle('primario'), minHeight: 44 }} title={aprobar.motivo ?? undefined}>
          <CheckCircle2 size={15} strokeWidth={1.75} aria-hidden /> Aprobar mapa
        </button>
        {d.estadoMapa === 'borrador' && (
          <button type="button" disabled={ocupado} onClick={() => void cambiar('descartado', 'Descartar la exploración')} style={{ ...btnStyle('secundario'), minHeight: 44 }}>
            <XCircle size={15} strokeWidth={1.75} aria-hidden /> Descartar
          </button>
        )}
        {d.estadoMapa !== 'borrador' && (
          <button type="button" disabled={ocupado} onClick={() => void cambiar('borrador', 'Volver a borrador')} style={{ ...btnStyle('sutil'), minHeight: 44 }}>
            <Undo2 size={15} strokeWidth={1.75} aria-hidden /> Volver a borrador
          </button>
        )}
        {aprobar.motivo && <span className="muted" style={{ fontSize: 12 }}>{aprobar.motivo}</span>}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>Aprobar solo marca el mapa como revisado: no genera código ni activa nada.</p>

      <h3 style={{ margin: 0, fontSize: 14 }}>Pasos ({d.pasosLista.length})</h3>
      {d.pasosLista.length === 0 && <p className="muted" style={{ margin: 0 }}>Todavía no hay pasos.</p>}
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
        {d.pasosLista.slice(0, pasosVisibles).map((p) => (
          <li key={p.n} style={fila}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <strong style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{p.n}. {p.pantalla ?? 'Pantalla sin nombre'}</strong>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge tono={p.origen === 'ia' ? 'info' : 'neutral'}>{ORIGEN_TEXTO[p.origen]}</Badge>
                {p.rechazada && <Badge tono="aviso" title="La respuesta de la IA no pasó la validación y la resolvió una regla">Respuesta rechazada</Badge>}
                <span className="muted" style={{ fontSize: 12 }}>{p.origen === 'ia' ? eur(p.costeEur) : 'sin coste'}</span>
              </span>
            </div>
            {p.acciones.length === 0
              ? <span className="muted" style={{ fontSize: 13 }}>Sin acciones.</span>
              : <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, overflowWrap: 'anywhere' }}>{p.acciones.map((a, i) => <li key={i}>{textoAccion(a)}</li>)}</ul>}
            {p.motivo && <span className="muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{p.motivo}</span>}
          </li>
        ))}
      </ol>
      {d.pasosLista.length > pasosVisibles && (
        <button type="button" onClick={() => setPasosVisibles((v) => v + PASO)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, justifySelf: 'start' }}>
          Ver más pasos ({d.pasosLista.length - pasosVisibles})
        </button>
      )}

      <h3 style={{ margin: 0, fontSize: 14 }}>Mapa resultante</h3>
      {d.mapaInvalido && <p role="alert" style={aviso('negative')}>El mapa guardado no pasa la validación: no se puede aprobar.</p>}
      {!d.mapa && !d.mapaInvalido && <p className="muted" style={{ margin: 0 }}>Aún no hay mapa{d.cerradaEn ? '' : ': la exploración sigue abierta'}.</p>}
      {d.mapa && (
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            {d.mapa.pantallas.length} pantalla{d.mapa.pantallas.length === 1 ? '' : 's'} · resultado {d.mapa.resultado.alcanzado ? 'alcanzado' : 'no alcanzado'} · efecto en el portal:{' '}
            {d.mapa.efectosEnPortal.length ? d.mapa.efectosEnPortal.map((e) => (e === 'posible_proyecto_guardado' ? 'posible proyecto guardado (hay que borrarlo a mano)' : 'ninguno visto')).join(', ') : '—'}
          </p>
          {d.mapa.pantallas.slice(0, pantallasVisibles).map((p, i) => <PantallaMapa key={p.huella + i} n={i + 1} p={p} />)}
          {d.mapa.pantallas.length > pantallasVisibles && (
            <button type="button" onClick={() => setPantallasVisibles((v) => v + PASO)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, justifySelf: 'start' }}>
              Ver más pantallas ({d.mapa.pantallas.length - pantallasVisibles})
            </button>
          )}
          {d.mapa.huecos.length > 0 && (
            <div style={fila}>
              <strong style={{ fontSize: 13 }}>Huecos ({d.mapa.huecos.length})</strong>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, overflowWrap: 'anywhere' }}>{d.mapa.huecos.slice(0, PASO).map((h, i) => <li key={i}>{h}</li>)}</ul>
            </div>
          )}
          {d.mapa.redNoGet.length > 0 && (
            <div style={fila}>
              <strong style={{ fontSize: 13 }}>Peticiones del portal que provocaron un avance</strong>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, overflowWrap: 'anywhere' }}>{d.mapa.redNoGet.slice(0, PASO).map((u, i) => <li key={i}>{u}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Una pantalla del mapa. Sus campos no se montan hasta abrirla (cientos de filas de golpe, no). */
function PantallaMapa({ n, p }: { n: number; p: PantallaMapaExploracion }) {
  const [abierta, setAbierta] = useState(false)
  const [campos, setCampos] = useState(PASO)
  return (
    <div style={fila}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{n}. {p.titulo ?? 'Pantalla sin título'}</strong>
        <span className="muted" style={{ fontSize: 12 }}>{p.campos.length} campo{p.campos.length === 1 ? '' : 's'}{p.importes.length ? ` · ${p.importes.length} importe${p.importes.length === 1 ? '' : 's'}` : ''}</span>
      </div>
      <span className="muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>
        Avance: {p.avance ? `${p.avance.selector.valor} (${p.avance.tipo === 'aceptar_autorizado' ? 'Aceptar autorizado' : 'navegación'}, ${p.avance.efecto})` : 'ninguno'}
      </span>
      <button type="button" onClick={() => setAbierta((a) => !a)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, justifySelf: 'start' }}>
        {abierta ? 'Ocultar campos' : 'Ver campos'}
      </button>
      {abierta && (
        <>
          {p.campos.length === 0 && <span className="muted" style={{ fontSize: 13 }}>Sin campos.</span>}
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {p.campos.slice(0, campos).map((c, i) => (
              <li key={i} style={{ fontSize: 13, overflowWrap: 'anywhere', minWidth: 0 }}>
                {c.etiqueta ?? c.selector.valor} <span className="muted">({c.tipo}{c.requerido ? ', obligatorio' : ''})</span>{' '}
                {c.campoCanonico
                  ? <Badge tono={c.confianza === 'alta' ? 'positivo' : 'aviso'}>{c.campoCanonico}{c.confianza ? ` · ${c.confianza}` : ''}</Badge>
                  : <Badge tono="neutral">sin mapear</Badge>}
              </li>
            ))}
          </ul>
          {p.campos.length > campos && (
            <button type="button" onClick={() => setCampos((v) => v + PASO)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, justifySelf: 'start' }}>
              Ver más campos ({p.campos.length - campos})
            </button>
          )}
          {p.importes.length > 0 && <span className="muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>Importes: {p.importes.join(' · ')}</span>}
        </>
      )}
    </div>
  )
}
