'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DIAS_COMUNICACION_LCS,
  GRAVEDADES_SINIESTRO,
  TIPOS_SINIESTRO,
  TRANSICIONES_SINIESTRO,
  etiquetaEstadoSiniestro,
  etiquetaTipoSiniestro,
  plazoComunicacion,
  type DocumentoResumen,
  type EstadoSiniestro,
  type TipoDocumento,
} from '@central/module-seguros'
import { btnStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { fechaEs, fechaHoraEs } from '@/lib/ficha-asegura'
import {
  interpretarSiniestro,
  ramosSiniestroParaPoliza,
  textoMotivoSiniestro,
  type RespuestaSiniestro,
  type SiniestroCartera,
} from '@/lib/siniestros-asegura'
import Documentos from './Documentos'

/**
 * 🚨 Siniestros DESDE la ficha (cliente o póliza): ver, abrir, anotar el
 * seguimiento, cambiar el estado y colgar el parte y las fotos. Es la pantalla
 * de Alberto; la BD vive en asegura y se habla con `/api/correduria/siniestro`,
 * que reenvía al puerto con el secreto y pone el `actor` desde la sesión.
 *
 * Dos orígenes que NO son iguales (`@central/module-seguros`, `siniestros.ts`):
 *   · CIMA: el estado lo fija la compañía y se actualiza con cada pull; aquí
 *     solo se anota lo que CIMA no manda (tramitador, perito, reserva, notas).
 *   · Abierto aquí: el estado se cambia a mano, y la REFERENCIA de la compañía
 *     es la llave para que el siguiente pull de CIMA lo case en vez de duplicarlo.
 *
 * Tres estados de la lista y no dos: `lista === null` es «no se ha podido
 * leer» y se dice así — nunca como «sin siniestros». Y `reserva: null` es «la
 * compañía no lo informa», nunca 0€.
 *
 * Rendimiento: el detalle de cada fila y el formulario de apertura se montan
 * solo al abrirlos (un `<details>` cerrado crearía igualmente todo su DOM).
 */
export type PolizaParaSiniestro = {
  id: string
  numeroPoliza: string | null
  aseguradora: string
  tipo: string
  viva: boolean
  confirmadaCima: boolean
}

type Mensaje = { tono: 'ok' | 'aviso' | 'error'; texto: string }

export default function Siniestros({
  lista: inicial,
  polizas,
  documentos,
}: {
  lista: SiniestroCartera[] | null
  polizas: PolizaParaSiniestro[]
  /** Documentos de la ficha/póliza (los del siniestro se filtran por `siniestroId`). `null`/ausente = no consultados. */
  documentos?: DocumentoResumen[] | null
}) {
  const router = useRouter()
  const [lista, setLista] = useState<SiniestroCartera[] | null>(inicial)
  const [formAbierto, setFormAbierto] = useState(false)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)

  // Tras `router.refresh()` el server component manda la lista nueva: se adopta.
  useEffect(() => { setLista(inicial) }, [inicial])

  const elegibles = polizas.filter((p) => p.viva && p.confirmadaCima)
  const nAbiertos = lista === null ? null : lista.filter((s) => s.abierto).length
  const resumen =
    lista === null ? 'no se ha podido leer'
      : nAbiertos === 0 ? (lista.length === 0 ? 'ninguno' : `${lista.length} · ninguno abierto`)
        : `${nAbiertos} abierto${nAbiertos === 1 ? '' : 's'}`

  async function llamar(method: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<RespuestaSiniestro> {
    try {
      const res = await fetch('/api/correduria/siniestro', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      return interpretarSiniestro(res.status, await res.json().catch(() => null))
    } catch {
      return { estado: 'error', motivo: 'red' }
    }
  }

  /** Apertura: al `ok` entra en la lista, se enseña el aviso del art. 16 si viene y se cierra el formulario. */
  async function abrir(body: Record<string, unknown>): Promise<RespuestaSiniestro> {
    const r = await llamar('POST', body)
    if (r.estado === 'ok') {
      setLista((l) => (l === null ? [r.siniestro] : [r.siniestro, ...l]))
      setMensaje(r.aviso ? { tono: 'aviso', texto: `Siniestro abierto. ${r.aviso}` } : { tono: 'ok', texto: 'Siniestro abierto.' })
      setFormAbierto(false)
      router.refresh()
    }
    return r
  }

  /** Seguimiento o estado: al `ok` se sustituye la fila por la que devuelve asegura. */
  async function anotar(body: Record<string, unknown>): Promise<RespuestaSiniestro> {
    const r = await llamar('PATCH', body)
    if (r.estado === 'ok') {
      setLista((l) => (l === null ? [r.siniestro] : l.map((s) => (s.id === r.siniestro.id ? r.siniestro : s))))
      router.refresh()
    }
    return r
  }

  const documentosDe = (siniestroId: string): DocumentoResumen[] | null =>
    documentos === null || documentos === undefined ? null : documentos.filter((d) => d.siniestroId === siniestroId)

  return (
    <div style={{ ...tarjeta, borderStyle: lista === null ? 'dashed' : 'solid' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          🚨 Siniestros <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>· {resumen}</span>
        </div>
        {elegibles.length > 0 ? (
          <button type="button" onClick={() => setFormAbierto((v) => !v)} style={btnStyle(formAbierto ? 'secundario' : 'primario')}>
            {formAbierto ? 'Cerrar formulario' : '➕ Abrir siniestro'}
          </button>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--muted)' }} title="Un siniestro se abre sobre una póliza que la compañía ha confirmado por CIMA; las emitidas y aún sin confirmar no valen.">
            no hay póliza viva confirmada por CIMA sobre la que abrirlo
          </span>
        )}
      </div>

      {mensaje && (
        <div role="status" style={{ ...cajaMensaje(mensaje.tono), marginBottom: 10 }}>
          {mensaje.texto}
          <button type="button" onClick={() => setMensaje(null)} style={{ ...btnStyle('sutil', 'sm'), marginLeft: 8 }}>cerrar</button>
        </div>
      )}

      {formAbierto && (
        <FormAbrir polizas={elegibles} onAbrir={abrir} onCancelar={() => setFormAbierto(false)} />
      )}

      {lista === null ? (
        <p style={{ ...pendienteBox, margin: 0 }}>
          ⚠️ No se han podido leer los siniestros (asegura no manda la lista o su consulta ha fallado).
          No lo leas como «sin siniestros»: significa que desde aquí no se ven.
        </p>
      ) : lista.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Sin siniestros registrados. Solo constan los que han llegado por CIMA o se han abierto aquí — un parte que
          el cliente diera directamente a la compañía puede no aparecer hasta el siguiente pull.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          {lista.map((s) => (
            <Fila key={s.id} s={s} documentos={documentosDe(s.id)} onAnotar={anotar} />
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Una fila (plegada) y su detalle (montaje perezoso) ─────────────────────

function Fila({ s, documentos, onAnotar }: {
  s: SiniestroCartera
  documentos: DocumentoResumen[] | null
  onAnotar: (body: Record<string, unknown>) => Promise<RespuestaSiniestro>
}) {
  const [abierta, setAbierta] = useState(false)
  const propio = s.origen === 'gestionado_correduria'
  const plazo = propio && s.abierto && s.referencia === null ? plazoComunicacion(s.fechaHora ?? s.fecha) : null

  return (
    <li style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={abierta}
        onClick={() => setAbierta((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAbierta((v) => !v) } }}
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px 12px',
          padding: '10px 12px', minHeight: 44, cursor: 'pointer', fontSize: 13, alignItems: 'start',
          background: abierta ? 'var(--surface)' : 'transparent',
        }}
      >
        <Celda label="Fecha">
          <span style={{ whiteSpace: 'nowrap' }}>{s.fecha ? fechaEs(s.fecha) : <span style={muted}>sin fecha</span>}</span>
        </Celda>
        <Celda label="Estado">
          <span style={{ whiteSpace: 'nowrap', color: s.abierto ? 'var(--warning)' : 'var(--muted)' }}>
            {s.abierto ? '🟠' : '⚪'} {etiquetaEstadoSiniestro(s.estado)}
          </span>
        </Celda>
        <Celda label="Tipo">{etiquetaTipoSiniestro(s.tipo)}</Celda>
        <Celda label="Referencia">
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {s.referencia ?? <span style={muted}>sin referencia</span>}
            {propio && !s.confirmadoCima && (
              <span style={chipAviso} title="Lo abrimos nosotros y CIMA aún no lo ha traído. Con la referencia de la compañía, el próximo pull lo casará con esta fila.">⏳ sin casar con CIMA</span>
            )}
            {plazo?.vencido && (
              <span style={chipAviso} title={`El art. 16 LCS da ${DIAS_COMUNICACION_LCS} días desde el hecho para comunicarlo a la compañía; ya han pasado y sigue sin referencia.`}>
                ⚠️ fuera del plazo de {DIAS_COMUNICACION_LCS} días (art. 16 LCS)
              </span>
            )}
          </span>
        </Celda>
        <Celda label="Origen">
          <span style={chip} title={propio ? 'Abierto desde esta pantalla' : 'Lo trajo la ingesta de CIMA: su estado lo fija la compañía'}>
            {propio ? 'abierto aquí' : 'CIMA'}
          </span>
        </Celda>
        <Celda label="Tramitador">
          {s.tramitador ?? <span style={muted} title="Nadie ha anotado quién lo lleva en la compañía (CIMA no lo manda)">sin tramitador</span>}
        </Celda>
        <Celda label="Reserva">
          {/* NULL es «la compañía no lo informa», no «cero euros de daño». */}
          {s.reserva === null ? <span style={muted} title="Reserva no informada">sin dato</span> : eur(s.reserva)}
        </Celda>
        <span style={{ ...muted, fontSize: 11, alignSelf: 'center', justifySelf: 'end' }}>{abierta ? '▲' : '▼'}</span>
      </div>
      {abierta && <Detalle s={s} documentos={documentos} onAnotar={onAnotar} />}
    </li>
  )
}

function Detalle({ s, documentos, onAnotar }: {
  s: SiniestroCartera
  documentos: DocumentoResumen[] | null
  onAnotar: (body: Record<string, unknown>) => Promise<RespuestaSiniestro>
}) {
  const propio = s.origen === 'gestionado_correduria'
  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14, fontSize: 13 }}>
      <div>
        <div style={etiqueta}>Qué pasó</div>
        {s.comentario ? (
          <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{s.comentario}</div>
        ) : (
          <span style={muted}>sin descripción</span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Dato label="Lugar" valor={s.lugar} />
        <Dato label="Gravedad" valor={s.gravedad ? etiquetaGravedad(s.gravedad) : null} />
        <Persona label="Tramitador" nombre={s.tramitador} telefono={s.tramitadorTelefono} email={s.tramitadorEmail} />
        <Persona label="Perito" nombre={s.perito} telefono={s.peritoTelefono} email={s.peritoEmail} />
        <Dato label="Reserva" valor={s.reserva === null ? null : eur(s.reserva)} />
        <Dato label="Indemnización" valor={s.indemnizacion === null ? null : eur(s.indemnizacion)} />
        <Dato label="Actualizado" valor={s.actualizado ? fechaHoraEs(s.actualizado) : null} />
      </div>

      <Seguimiento s={s} onAnotar={onAnotar} />

      <div>
        <div style={etiqueta}>Estado</div>
        {propio ? (
          <CambioEstado s={s} onAnotar={onAnotar} />
        ) : (
          <span style={muted}>el estado lo fija la compañía; se actualiza con cada pull de CIMA.</span>
        )}
      </div>

      <div>
        <div style={etiqueta}>📎 Documentos del parte</div>
        <Documentos siniestroId={s.id} clienteId={s.clienteId} polizaId={s.polizaId} inicial={documentos} sugeridos={SUGERIDOS_PARTE} />
      </div>
    </div>
  )
}

/** Foto y parte (amistoso o de la compañía) son los tipos que existen en el catálogo; se ofrecen primero. */
const SUGERIDOS_PARTE: readonly TipoDocumento[] = ['parte_siniestro', 'foto']

// ─── Seguimiento ─────────────────────────────────────────────────────────────
// Solo se manda lo que CAMBIA respecto a lo que hay (más la nota, que siempre
// se añade). En uno de CIMA no hay campo de referencia: la pone la compañía.

function Seguimiento({ s, onAnotar }: { s: SiniestroCartera; onAnotar: (body: Record<string, unknown>) => Promise<RespuestaSiniestro> }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setAbierto((v) => !v)} style={btnStyle('secundario', 'sm')} aria-expanded={abierto}>
        ✏️ {abierto ? 'Ocultar seguimiento' : 'Anotar seguimiento'}
      </button>
      {abierto && <FormSeguimiento s={s} onAnotar={onAnotar} />}
    </div>
  )
}

function FormSeguimiento({ s, onAnotar }: { s: SiniestroCartera; onAnotar: (body: Record<string, unknown>) => Promise<RespuestaSiniestro> }) {
  const propio = s.origen === 'gestionado_correduria'
  const [referencia, setReferencia] = useState(s.referencia ?? '')
  const [gravedad, setGravedad] = useState(s.gravedad ?? '')
  const [tramitador, setTramitador] = useState(s.tramitador ?? '')
  const [tramitadorTelefono, setTramitadorTelefono] = useState(s.tramitadorTelefono ?? '')
  const [tramitadorEmail, setTramitadorEmail] = useState(s.tramitadorEmail ?? '')
  const [perito, setPerito] = useState(s.perito ?? '')
  const [peritoTelefono, setPeritoTelefono] = useState(s.peritoTelefono ?? '')
  const [peritoEmail, setPeritoEmail] = useState(s.peritoEmail ?? '')
  const [reserva, setReserva] = useState(s.reserva === null ? '' : String(s.reserva))
  const [indemnizacion, setIndemnizacion] = useState(s.indemnizacion === null ? '' : String(s.indemnizacion))
  const [nota, setNota] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<Mensaje | null>(null)

  async function guardar() {
    const body: Record<string, unknown> = { siniestroId: s.id }
    const texto = (clave: string, nuevo: string, viejo: string | null) => {
      const n = nuevo.trim() === '' ? null : nuevo.trim()
      if (n !== viejo) body[clave] = n
    }
    const importe = (clave: string, nuevo: string, viejo: number | null): string | null => {
      const t = nuevo.trim()
      if (t === '') { if (viejo !== null) body[clave] = null; return null }
      const n = Number(t.replace(/\./g, '').replace(',', '.'))
      if (!Number.isFinite(n) || n < 0) return `${clave === 'reservaImporte' ? 'La reserva' : 'La indemnización'} no es un importe válido.`
      if (n !== viejo) body[clave] = n
      return null
    }
    if (propio) texto('referencia', referencia, s.referencia)
    texto('gravedad', gravedad, s.gravedad)
    texto('tramitadorNombre', tramitador, s.tramitador)
    texto('tramitadorTelefono', tramitadorTelefono, s.tramitadorTelefono)
    texto('tramitadorEmail', tramitadorEmail, s.tramitadorEmail)
    texto('peritoNombre', perito, s.perito)
    texto('peritoTelefono', peritoTelefono, s.peritoTelefono)
    texto('peritoEmail', peritoEmail, s.peritoEmail)
    const e1 = importe('reservaImporte', reserva, s.reserva)
    const e2 = importe('indemnizacionImporte', indemnizacion, s.indemnizacion)
    if (e1 || e2) return setResultado({ tono: 'error', texto: e1 ?? e2 ?? '' })
    if (nota.trim() !== '') body.nota = nota.trim()
    if (Object.keys(body).length === 1) return setResultado({ tono: 'error', texto: 'Nada que anotar: no has cambiado ningún campo ni escrito una nota.' })

    setOcupado(true)
    setResultado(null)
    try {
      const r = await onAnotar(body)
      if (r.estado === 'ok') {
        const ignorados = r.ignorados.length
          ? ` No se aplicó: ${r.ignorados.map(nombreCampo).join(', ')} (en un siniestro de CIMA lo pone la compañía).`
          : ''
        setResultado({ tono: ignorados ? 'aviso' : 'ok', texto: `Anotado.${ignorados}` })
        setNota('')
      } else {
        setResultado({ tono: 'error', texto: textoRespuesta(r) })
      }
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, marginTop: 10 }}>
      {propio && (
        <Campo label="Referencia de la compañía" ayuda="Con la referencia, el próximo pull de CIMA actualiza este siniestro en vez de duplicarlo.">
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} style={campo} maxLength={100} />
        </Campo>
      )}
      <div style={rejilla}>
        <Campo label="Gravedad">
          <select value={gravedad} onChange={(e) => setGravedad(e.target.value)} style={campo}>
            <option value="">sin indicar</option>
            {GRAVEDADES_SINIESTRO.map((g) => <option key={g} value={g}>{etiquetaGravedad(g)}</option>)}
          </select>
        </Campo>
        <Campo label="Reserva (€)">
          <input inputMode="decimal" value={reserva} onChange={(e) => setReserva(e.target.value)} style={campo} placeholder="sin dato" />
        </Campo>
        <Campo label="Indemnización (€)">
          <input inputMode="decimal" value={indemnizacion} onChange={(e) => setIndemnizacion(e.target.value)} style={campo} placeholder="sin dato" />
        </Campo>
      </div>
      <div style={rejilla}>
        <Campo label="Tramitador"><input value={tramitador} onChange={(e) => setTramitador(e.target.value)} style={campo} maxLength={255} placeholder="nombre" /></Campo>
        <Campo label="Teléfono del tramitador"><input type="tel" value={tramitadorTelefono} onChange={(e) => setTramitadorTelefono(e.target.value)} style={campo} maxLength={30} /></Campo>
        <Campo label="Email del tramitador"><input type="email" value={tramitadorEmail} onChange={(e) => setTramitadorEmail(e.target.value)} style={campo} maxLength={255} /></Campo>
      </div>
      <div style={rejilla}>
        <Campo label="Perito"><input value={perito} onChange={(e) => setPerito(e.target.value)} style={campo} maxLength={255} placeholder="nombre" /></Campo>
        <Campo label="Teléfono del perito"><input type="tel" value={peritoTelefono} onChange={(e) => setPeritoTelefono(e.target.value)} style={campo} maxLength={30} /></Campo>
        <Campo label="Email del perito"><input type="email" value={peritoEmail} onChange={(e) => setPeritoEmail(e.target.value)} style={campo} maxLength={255} /></Campo>
      </div>
      <Campo label="Nota de seguimiento" ayuda="Se añade al final con la fecha de hoy; no sustituye lo anterior.">
        <textarea value={nota} onChange={(e) => setNota(e.target.value)} style={{ ...campo, minHeight: 72 }} maxLength={2000} placeholder="p. ej. «llamado al tramitador, pide fotos del golpe»" />
      </Campo>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" disabled={ocupado} onClick={() => void guardar()} style={btnStyle('primario')}>
          {ocupado ? 'Guardando…' : 'Guardar seguimiento'}
        </button>
      </div>
      {resultado && <div role={resultado.tono === 'error' ? 'alert' : 'status'} style={cajaMensaje(resultado.tono)}>{resultado.texto}</div>}
    </div>
  )
}

// ─── Estado (solo los nuestros) ──────────────────────────────────────────────

function CambioEstado({ s, onAnotar }: { s: SiniestroCartera; onAnotar: (body: Record<string, unknown>) => Promise<RespuestaSiniestro> }) {
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Mensaje | null>(null)
  const transiciones = esEstadoConocido(s.estado) ? TRANSICIONES_SINIESTRO[s.estado] : null

  async function pasarA(a: EstadoSiniestro) {
    if ((a === 'cerrado' || a === 'rechazado') && !confirm(`¿Marcar el siniestro como ${etiquetaEstadoSiniestro(a).toLowerCase()}? Se puede reabrir después (vuelve a «en tramitación»).`)) return
    setOcupado(a)
    setResultado(null)
    try {
      const r = await onAnotar({ siniestroId: s.id, estado: a })
      if (r.estado !== 'ok') setResultado({ tono: 'error', texto: textoRespuesta(r) })
    } finally {
      setOcupado(null)
    }
  }

  if (transiciones === null) {
    return <span style={muted}>estado «{s.estado}» desconocido: no se ofrece ningún cambio.</span>
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ alignSelf: 'center' }}>{s.abierto ? '🟠' : '⚪'} {etiquetaEstadoSiniestro(s.estado)}</span>
        {transiciones.map((a) => (
          <button key={a} type="button" disabled={ocupado !== null} onClick={() => void pasarA(a)} style={btnStyle('secundario')}>
            {ocupado === a ? '…' : `→ ${etiquetaEstadoSiniestro(a)}`}
          </button>
        ))}
      </div>
      {resultado && <div role="alert" style={cajaMensaje(resultado.tono)}>{resultado.texto}</div>}
    </div>
  )
}

function esEstadoConocido(e: string): e is EstadoSiniestro {
  return Object.prototype.hasOwnProperty.call(TRANSICIONES_SINIESTRO, e)
}

// ─── Abrir siniestro ─────────────────────────────────────────────────────────

const ETIQUETA_RAMO: Record<string, string> = {
  auto: 'Auto / moto',
  hogar: 'Hogar',
  general: 'General (RC, defensa jurídica, otro)',
  salud: 'Salud',
  vida: 'Vida',
}

function FormAbrir({ polizas, onAbrir, onCancelar }: {
  polizas: PolizaParaSiniestro[]
  onAbrir: (body: Record<string, unknown>) => Promise<RespuestaSiniestro>
  onCancelar: () => void
}) {
  const [polizaId, setPolizaId] = useState(polizas[0]?.id ?? '')
  const poliza = polizas.find((p) => p.id === polizaId) ?? null
  // Solo los tipos del ramo de la póliza (más los generales); si el ramo no se
  // sabe mapear, todos: mejor elegir de más que no poder abrirlo.
  const ramos = ramosSiniestroParaPoliza(poliza?.tipo)
  const tipos = ramos === null ? TIPOS_SINIESTRO : TIPOS_SINIESTRO.filter((t) => ramos.includes(t.ramo))
  const [tipo, setTipo] = useState<string>(tipos[0]?.clave ?? 'otro')
  const [fechaHora, setFechaHora] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [cp, setCp] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [provincia, setProvincia] = useState('')
  const [direccion, setDireccion] = useState('')
  const [culpable, setCulpable] = useState<'' | 'si' | 'no'>('')
  const [gravedad, setGravedad] = useState('')
  const [referencia, setReferencia] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<Mensaje | null>(null)

  // Si al cambiar de póliza el tipo elegido deja de encajar, se pasa al primero que sí.
  useEffect(() => {
    if (!tipos.some((t) => t.clave === tipo)) setTipo(tipos[0]?.clave ?? 'otro')
  }, [tipos, tipo])

  const fecha = fechaHora ? new Date(fechaHora) : null
  const plazo = fecha && !Number.isNaN(fecha.getTime()) ? plazoComunicacion(fecha) : null
  const ramosPresentes = Array.from(new Set(tipos.map((t) => t.ramo)))

  async function enviar() {
    if (!poliza) return setResultado({ tono: 'error', texto: 'Elige la póliza.' })
    if (!fecha || Number.isNaN(fecha.getTime())) return setResultado({ tono: 'error', texto: 'Falta la fecha (y hora) del siniestro.' })
    if (descripcion.trim().length < 5) return setResultado({ tono: 'error', texto: 'Describe qué ha pasado (mínimo 5 caracteres).' })
    setOcupado(true)
    setResultado(null)
    try {
      const r = await onAbrir({
        polizaId: poliza.id,
        tipo,
        fechaHora: fecha.toISOString(),
        descripcion: descripcion.trim(),
        lugarCp: cp.trim() || null,
        lugarCiudad: ciudad.trim() || null,
        lugarProvincia: provincia.trim() || null,
        lugarDireccion: direccion.trim() || null,
        seConsideraCulpable: culpable === '' ? null : culpable === 'si',
        gravedad: gravedad || null,
        referencia: referencia.trim() || null,
      })
      if (r.estado !== 'ok') setResultado({ tono: 'error', texto: textoRespuesta(r) })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div style={{ ...pendienteBox, borderStyle: 'solid', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, marginBottom: 12, color: 'var(--text)' }}>
      <div style={{ fontWeight: 700 }}>➕ Abrir siniestro</div>
      <Campo label="Póliza">
        <select value={polizaId} onChange={(e) => setPolizaId(e.target.value)} style={campo}>
          {polizas.map((p) => (
            <option key={p.id} value={p.id}>{p.tipo} · {p.aseguradora} · {p.numeroPoliza ? `nº ${p.numeroPoliza}` : 'sin número'}</option>
          ))}
        </select>
      </Campo>
      <div style={rejilla}>
        <Campo label="Tipo de siniestro">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={campo}>
            {ramosPresentes.map((ramo) => (
              <optgroup key={ramo} label={ETIQUETA_RAMO[ramo] ?? ramo}>
                {tipos.filter((t) => t.ramo === ramo).map((t) => <option key={t.clave} value={t.clave}>{t.etiqueta}</option>)}
              </optgroup>
            ))}
          </select>
        </Campo>
        <Campo label="Fecha y hora del hecho" ayuda={plazo?.vencido ? `⚠️ Han pasado más de ${DIAS_COMUNICACION_LCS} días: el art. 16 LCS da ${DIAS_COMUNICACION_LCS} para comunicarlo. Se abre igual; la compañía puede reclamar los daños de la demora.` : undefined}>
          <input type="datetime-local" required value={fechaHora} onChange={(e) => setFechaHora(e.target.value)} style={campo} />
        </Campo>
      </div>
      <Campo label="Qué ha pasado" ayuda="En palabras del cliente. Queda como descripción del siniestro (no cifrada).">
        <textarea required value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={{ ...campo, minHeight: 88 }} maxLength={4000} />
      </Campo>
      <div style={rejilla}>
        <Campo label="Código postal"><input inputMode="numeric" value={cp} onChange={(e) => setCp(e.target.value)} style={campo} maxLength={5} /></Campo>
        <Campo label="Ciudad"><input value={ciudad} onChange={(e) => setCiudad(e.target.value)} style={campo} maxLength={100} /></Campo>
        <Campo label="Provincia"><input value={provincia} onChange={(e) => setProvincia(e.target.value)} style={campo} maxLength={100} /></Campo>
      </div>
      <Campo label="Dirección exacta (opcional)" ayuda="Se guarda cifrada.">
        <input value={direccion} onChange={(e) => setDireccion(e.target.value)} style={campo} maxLength={500} />
      </Campo>
      <div style={rejilla}>
        <Campo label="¿Se considera culpable?">
          <select value={culpable} onChange={(e) => setCulpable(e.target.value as '' | 'si' | 'no')} style={campo}>
            <option value="">no sé</option>
            <option value="si">sí</option>
            <option value="no">no</option>
          </select>
        </Campo>
        <Campo label="Gravedad">
          <select value={gravedad} onChange={(e) => setGravedad(e.target.value)} style={campo}>
            <option value="">sin indicar</option>
            {GRAVEDADES_SINIESTRO.map((g) => <option key={g} value={g}>{etiquetaGravedad(g)}</option>)}
          </select>
        </Campo>
        <Campo label="Referencia de la compañía (opcional)" ayuda="Si ya se comunicó por teléfono y dieron número.">
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} style={campo} maxLength={100} />
        </Campo>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={ocupado} onClick={() => void enviar()} style={btnStyle('primario')}>
          {ocupado ? 'Abriendo…' : 'Abrir siniestro'}
        </button>
        <button type="button" disabled={ocupado} onClick={onCancelar} style={btnStyle('sutil')}>Cancelar</button>
      </div>
      {resultado && <div role="alert" style={cajaMensaje(resultado.tono)}>{resultado.texto}</div>}
    </div>
  )
}

// ─── Textos ──────────────────────────────────────────────────────────────────

function textoRespuesta(r: Exclude<RespuestaSiniestro, { estado: 'ok' }>): string {
  switch (r.estado) {
    case 'invalido': return `No se ha guardado: ${r.motivo}`
    case 'no_encontrado': return `No se encuentra${r.motivo ? `: ${r.motivo}` : ' (la póliza o el siniestro no son de esta correduría).'}`
    case 'sin_configurar': return 'El puerto con asegura no está conectado (falta ASEGURA_OPERADOR_SECRET).'
    default: return `No se ha podido hacer: ${textoMotivoSiniestro(r.motivo)}`
  }
}

function etiquetaGravedad(g: string): string {
  const t = g.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function nombreCampo(k: string): string {
  return k.replace(/Importe$/, '').replace(/([A-Z])/g, ' $1').toLowerCase().trim()
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Celda({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <span style={{ display: 'block', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</span>
      {children}
    </span>
  )
}

function Dato({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={etiqueta}>{label}</div>
      {valor ?? <span style={muted}>sin dato</span>}
    </div>
  )
}

function Persona({ label, nombre, telefono, email }: { label: string; nombre: string | null; telefono: string | null; email: string | null }) {
  return (
    <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <div style={etiqueta}>{label}</div>
      {nombre ?? <span style={muted}>sin {label.toLowerCase()}</span>}
      {telefono && <div><a href={`tel:${telefono.replace(/\s/g, '')}`}>📞 {telefono}</a></div>}
      {email && <div><a href={`mailto:${email}`}>✉️ {email}</a></div>}
    </div>
  )
}

function Campo({ label, ayuda, children }: { label: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
      {children}
      {ayuda && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{ayuda}</span>}
    </label>
  )
}

function cajaMensaje(tono: Mensaje['tono']): React.CSSProperties {
  const borde = tono === 'error' ? 'var(--negative)' : tono === 'aviso' ? 'var(--warning)' : 'var(--positive)'
  const fondo = tono === 'error' ? 'var(--negative-bg)' : tono === 'aviso' ? 'var(--warning-bg)' : 'var(--positive-bg)'
  return { fontSize: 13, lineHeight: 1.5, padding: '8px 10px', borderRadius: 8, border: `1px solid ${borde}`, background: fondo, color: 'var(--text)' }
}

const tarjeta: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 12, padding: 14 }
const muted: React.CSSProperties = { color: 'var(--muted)' }
const etiqueta: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 2 }
const chip: React.CSSProperties = {
  fontSize: 11, padding: '1px 8px', borderRadius: 999, whiteSpace: 'nowrap',
  background: 'var(--primary-light)', color: 'var(--primary)',
}
const chipAviso: React.CSSProperties = {
  fontSize: 11, padding: '1px 8px', borderRadius: 999, whiteSpace: 'nowrap',
  background: 'var(--warning-bg)', color: 'var(--text)', border: '1px solid var(--warning)',
}
const rejilla: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }
const campo: React.CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14,
}
const pendienteBox: React.CSSProperties = {
  fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 8, padding: '8px 10px',
}
