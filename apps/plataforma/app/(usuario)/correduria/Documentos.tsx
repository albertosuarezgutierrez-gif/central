'use client'
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Clock, Download, Eye, HelpCircle, Paperclip, Sparkles, Trash2, Upload } from 'lucide-react'
import Link from 'next/link'
import { Ico, FILA } from './iconos'
import { prepararAdjunto } from '@/lib/imagen-cliente'
import { interpretarLecturaOportunidad, type LecturaDocumentoOportunidad } from '@/lib/seguimiento-asegura'
import { FormAlta } from './cliente/[id]/OportunidadesCliente'
import {
  TIPOS_DOCUMENTO,
  etiquetaEstadoDocumento,
  etiquetaTipoDocumento,
  resumenDocumentos,
  revisarDocumento,
  type DocumentoResumen,
  type TipoDocumento,
} from '@central/module-seguros'

/**
 * Los documentos de un cliente / póliza / siniestro, con subida y «pedido».
 *
 * Tres estados de la lista y no dos: `inicial === null` es «no se ha podido
 * consultar» (asegura sin secreto, tabla caída) y se dice así — nunca como
 * «no tiene documentos». Y un documento «pedido» ES una fila: es lo que
 * distingue no habérselo pedido de que el cliente no lo mande.
 *
 * Los ficheros viven en `seguros.documentos` (asegura); esta pantalla habla con
 * `/api/correduria/documentos`, que reenvía al puerto con el secreto.
 */
export default function Documentos({
  clienteId,
  polizaId,
  siniestroId,
  inicial,
  sugeridos,
  tipoInicial,
}: {
  clienteId?: string | null
  polizaId?: string | null
  siniestroId?: string | null
  inicial: DocumentoResumen[] | null
  /** Tipos que hacen falta (p. ej. para emitir): se ofrecen primero en «pedir». */
  sugeridos?: readonly TipoDocumento[]
  /** Tipo preseleccionado al subir (el botón «Subir póliza» de la ficha llega con `poliza`). */
  tipoInicial?: TipoDocumento
}) {
  const [lista, setLista] = useState<DocumentoResumen[] | null>(inicial)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [tipo, setTipo] = useState<TipoDocumento>(tipoInicial ?? sugeridos?.[0] ?? 'poliza')
  const [notas, setNotas] = useState('')
  const [fichero, setFichero] = useState<File | null>(null)

  // «Subir póliza» de la ficha llega con `tipoInicial`: el formulario se abre y se
  // trae a la vista. Cerrado y debajo de las baldosas, en el móvil el botón
  // parecía no hacer nada (29/09/2026).
  const formRef = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (tipoInicial) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [tipoInicial])

  // Una PÓLIZA subida a la ficha de un cliente se lee con IA (29/09/2026, Alberto: «ya que he
  // subido esa póliza, que se cree como oportunidad»). Solo pólizas y solo en la ficha: cada
  // lectura es una llamada de pago, y un recibo o un DNI no abren oportunidad.
  const [lecturaPoliza, setLecturaPoliza] = useState<LecturaDocumentoOportunidad | 'leyendo' | null>(null)
  const [abrirOportunidad, setAbrirOportunidad] = useState(false)
  const [oportunidadHecha, setOportunidadHecha] = useState<string | null>(null)
  const leerPoliza = !!clienteId && !polizaId && !siniestroId

  async function leerPolizaSubida(f: File) {
    setLecturaPoliza('leyendo')
    setAbrirOportunidad(false)
    setOportunidadHecha(null)
    let status = 0
    let json: unknown = null
    try {
      const a = await prepararAdjunto(f)
      const res = await fetch('/api/correduria/oportunidad/leer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ base64: a.base64, mimeType: a.mimeType, fileName: a.fileName, clienteId }),
      })
      status = res.status
      json = await res.json().catch(() => null)
    } catch {
      json = { error: 'sin conexión' }
    }
    setLecturaPoliza(interpretarLecturaOportunidad(status, json))
  }

  /** Una póliza que YA estaba subida (antes de leerse sola): se baja y se lee igual. */
  async function leerPolizaGuardada(d: DocumentoResumen) {
    setLecturaPoliza('leyendo')
    try {
      const res = await fetch(`/api/correduria/documentos/${d.id}`)
      if (!res.ok) { setLecturaPoliza({ estado: 'error', motivo: `no se ha podido abrir el fichero (${res.status})` }); return }
      const blob = await res.blob()
      await leerPolizaSubida(new File([blob], d.nombre ?? 'poliza', { type: d.mime ?? blob.type }))
    } catch {
      setLecturaPoliza({ estado: 'error', motivo: 'sin conexión' })
    }
  }

  const destino = { clienteId: clienteId ?? null, polizaId: polizaId ?? null, siniestroId: siniestroId ?? null }
  const resumen = resumenDocumentos(lista)

  async function subir() {
    if (!fichero) return setAviso('Elige un fichero.')
    const reparo = revisarDocumento({ type: fichero.type, size: fichero.size, name: fichero.name })
    if (reparo) return setAviso(reparo)
    setOcupado(true)
    setAviso(null)
    try {
      const form = new FormData()
      form.append('fichero', fichero)
      form.append('tipo', tipo)
      if (notas.trim()) form.append('notas', notas.trim())
      for (const [k, v] of Object.entries(destino)) if (v) form.append(k, v)
      const res = await fetch('/api/correduria/documentos', { method: 'POST', body: form })
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (!res.ok || !j || j.estado !== 'ok') {
        setAviso(String(j?.error ?? j?.motivo ?? `error ${res.status}`))
        return
      }
      const d = j.documento as DocumentoResumen
      setLista((l) => [d, ...(l ?? [])])
      setAviso(j.repetido === true ? 'Guardado. Ojo: este cliente ya tenía un fichero idéntico.' : 'Guardado.')
      if (tipo === 'poliza' && leerPoliza) void leerPolizaSubida(fichero)
      setFichero(null)
      setNotas('')
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function pedir() {
    setOcupado(true)
    setAviso(null)
    try {
      const res = await fetch('/api/correduria/documentos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pedir: true, tipo, notas: notas.trim() || null, ...destino }),
      })
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (!res.ok || !j || j.estado !== 'ok') return setAviso(String(j?.error ?? j?.motivo ?? `error ${res.status}`))
      setLista((l) => [j.documento as DocumentoResumen, ...(l ?? [])])
      setAviso('Anotado como pedido. Cuando llegue, súbelo y quedará como recibido.')
      setNotas('')
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function revisar(id: string) {
    setOcupado(true)
    try {
      const res = await fetch(`/api/correduria/documentos/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'revisar' }),
      })
      if (!res.ok) return setAviso(`No se pudo marcar revisado (${res.status}).`)
      setLista((l) => (l ?? []).map((d) => (d.id === id ? { ...d, estado: 'revisado', revisadoEn: new Date().toISOString() } : d)))
    } finally {
      setOcupado(false)
    }
  }

  async function borrar(id: string) {
    if (!confirm('¿Borrar este documento? No se puede deshacer.')) return
    setOcupado(true)
    try {
      const res = await fetch(`/api/correduria/documentos/${id}`, { method: 'DELETE' })
      if (!res.ok) return setAviso(`No se pudo borrar (${res.status}).`)
      setLista((l) => (l ?? []).filter((d) => d.id !== id))
    } finally {
      setOcupado(false)
    }
  }

  const [proyecto, setProyecto] = useState('')
  async function traerDeCodeoscopic() {
    if (!polizaId) return
    setOcupado(true)
    setAviso(null)
    try {
      const res = await fetch('/api/correduria/poliza/traer-pdf', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ polizaId, projectId: proyecto.trim() || null }),
      })
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (j?.estado === 'archivado') {
        setAviso('Póliza traída de Codeoscopic y guardada: el cliente ya la ve en su portal.')
        window.location.reload()
        return
      }
      setAviso(String(j?.motivo ?? j?.error ?? `error ${res.status}`))
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  const tipos: TipoDocumento[] = [...(sugeridos ?? []), ...TIPOS_DOCUMENTO.filter((t) => !sugeridos?.includes(t))]

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ ...FILA, fontSize: 13, color: resumen.estado === 'sin_consultar' ? 'var(--warning)' : 'var(--muted)' }}>
        {resumen.estado === 'sin_consultar' ? <Ico i={HelpCircle} /> : null}
        {resumen.titular}
      </div>

      {lista && lista.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {lista.map((d) => (
            <li
              key={d.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '8px 10px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                alignItems: 'center',
                fontSize: 13,
              }}
            >
              <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                <strong>{etiquetaTipoDocumento(d.tipo)}</strong>
                {d.nombre ? <> · <span style={{ wordBreak: 'break-all' }}>{d.nombre}</span></> : null}
                {d.bytes ? <span style={{ color: 'var(--muted)' }}> · {(d.bytes / 1024).toFixed(0)} KB</span> : null}
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {etiquetaEstadoDocumento(d.estado)} · {new Date(d.creado).toLocaleDateString('es-ES')}
                  {d.notas ? ` · ${d.notas}` : ''}
                </div>
              </span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {d.estado !== 'pedido' && (
                  <a href={`/api/correduria/documentos/${d.id}`} target="_blank" rel="noreferrer" style={{ ...btn, gap: 6 }}>
                    <Ico i={Eye} /> Ver
                  </a>
                )}
                {leerPoliza && d.tipo === 'poliza' && d.estado !== 'pedido' && (
                  <button type="button" onClick={() => void leerPolizaGuardada(d)} disabled={ocupado || lecturaPoliza === 'leyendo'} title="La IA la lee (compañía, vencimiento, prima y bonus) para abrir la oportunidad" style={{ ...btn, gap: 6 }}>
                    <Ico i={Sparkles} /> Leer para oportunidad
                  </button>
                )}
                {d.estado === 'recibido' && (
                  <button type="button" onClick={() => revisar(d.id)} disabled={ocupado} style={{ ...btn, gap: 6 }}>
                    <Ico i={CheckCircle2} /> Revisado
                  </button>
                )}
                <button type="button" onClick={() => borrar(d.id)} disabled={ocupado} aria-label="Borrar documento" title="Borrar documento" style={{ ...btn, color: 'var(--negative)' }}>
                  <Ico i={Trash2} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {polizaId && !siniestroId && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', maxWidth: 520 }}>
          <label style={{ ...lbl, flex: '1 1 180px' }}>
            Nº de proyecto Avant2 (opcional)
            <input
              value={proyecto}
              onChange={(e) => setProyecto(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder="p. ej. 40841279"
              style={inp}
            />
          </label>
          <button type="button" onClick={traerDeCodeoscopic} disabled={ocupado} style={{ ...btn, fontWeight: 600, gap: 6 }}>
            <Ico i={Download} /> Traer póliza de Codeoscopic
          </button>
        </div>
      )}

      <details ref={formRef} open={tipoInicial ? true : undefined} style={{ scrollMarginTop: 16 }}>
        <summary style={{ ...FILA, cursor: 'pointer', fontSize: 13, minHeight: 44 }}><Ico i={Paperclip} /> Subir o pedir un documento</summary>
        <div style={{ display: 'grid', gap: 8, marginTop: 8, maxWidth: 520 }}>
          <label style={lbl}>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)} style={inp}>
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {etiquetaTipoDocumento(t)}
                </option>
              ))}
            </select>
          </label>
          <label style={lbl}>
            Fichero (PDF o foto, ≤ 10 MB)
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setFichero(e.target.files?.[0] ?? null)}
              style={inp}
            />
          </label>
          <label style={lbl}>
            Nota (opcional)
            <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="p. ej. «pedido por WhatsApp el 2/9»" style={inp} />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={subir} disabled={ocupado || !fichero} style={{ ...btn, fontWeight: 600, gap: 6 }}>
              <Ico i={Upload} /> Guardar fichero
            </button>
            <button type="button" onClick={pedir} disabled={ocupado} style={{ ...btn, gap: 6 }}>
              <Ico i={Clock} /> Anotar como pedido (sin fichero)
            </button>
          </div>
        </div>
      </details>
      {aviso && <div style={{ fontSize: 13, color: 'var(--warning)' }}>{aviso}</div>}
      {lecturaPoliza !== null && clienteId && (
        <PolizaLeida
          clienteId={clienteId}
          lectura={lecturaPoliza}
          abrir={abrirOportunidad}
          hecha={oportunidadHecha}
          onAbrir={setAbrirOportunidad}
          onHecha={setOportunidadHecha}
        />
      )}
    </div>
  )
}

/** Lo leído de la póliza recién subida y qué hacer con ello: ya es nuestra, o abrir oportunidad. */
function PolizaLeida({ clienteId, lectura, abrir, hecha, onAbrir, onHecha }: {
  clienteId: string
  lectura: LecturaDocumentoOportunidad | 'leyendo'
  abrir: boolean
  hecha: string | null
  onAbrir: (v: boolean) => void
  onHecha: (t: string) => void
}) {
  const caja: React.CSSProperties = { display: 'grid', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: 10, fontSize: 13 }
  if (lectura === 'leyendo') return <div role="status" style={caja}>Leyendo la póliza con IA para la oportunidad…</div>
  if (lectura.estado === 'error') {
    return <div role="status" style={{ ...caja, color: 'var(--negative)' }}>La póliza está guardada, pero no se ha podido leer ({lectura.motivo}). Abre la oportunidad a mano desde «+ Nueva oportunidad».</div>
  }
  const oportunidades = `/correduria/cliente/${encodeURIComponent(clienteId)}?tab=oportunidades`
  if (hecha) {
    return (
      <div role="status" style={caja}>
        <span>{hecha}</span>
        <Link href={oportunidades} style={{ color: 'var(--primary)', fontWeight: 600, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Ver sus oportunidades →</Link>
      </div>
    )
  }
  const nuestra = lectura.enCartera ?? null
  if (nuestra && nuestra.length > 0) {
    return (
      <div style={caja}>
        <strong>Esta póliza ya es nuestra (en vigor): no es una oportunidad.</strong>
        {nuestra.map(p => (
          <Link key={p.polizaId} href={`/correduria/poliza/${encodeURIComponent(p.polizaId)}`} style={{ color: 'var(--primary)', fontWeight: 600, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
            Ver póliza{p.aseguradora ? ` de ${p.aseguradora}` : ''} →
          </Link>
        ))}
      </div>
    )
  }
  if (abrir) {
    return (
      <FormAlta
        clienteId={clienteId}
        inicial={lectura}
        onCancelar={() => onAbrir(false)}
        onHecho={(t) => { if (t.ok || t.id) onHecha(t.texto) }}
      />
    )
  }
  return (
    <div style={caja}>
      <span>Póliza leída{lectura.compania ? ` de ${lectura.compania}` : ''}{lectura.numeroPoliza ? ` nº ${lectura.numeroPoliza}` : ''}.{nuestra === null ? ' No se ha podido comprobar si ya es nuestra.' : ''}</span>
      <button type="button" onClick={() => onAbrir(true)} style={{ ...btn, fontWeight: 600, justifySelf: 'start' }}>
        Abrir oportunidad con estos datos
      </button>
    </div>
  )
}

const btn: React.CSSProperties = {
  minHeight: 44,
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 13,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
}
const lbl: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13 }
const inp: React.CSSProperties = {
  minHeight: 44,
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'transparent',
  color: 'inherit',
  fontSize: 14,
}
