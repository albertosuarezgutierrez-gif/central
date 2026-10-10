'use client'
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Clock, Download, Eye, HelpCircle, Paperclip, Sparkles, Trash2, Upload } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Ico, FILA } from './iconos'
import { interpretarOportunidadDocumento, type AvisoOportunidadDocumento } from '@/lib/oportunidad-documento'
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
  const [ficheros, setFicheros] = useState<File[]>([])
  /** Cambia al terminar la cola para vaciar el <input type="file"> (los fallidos siguen en `ficheros`). */
  const [claveInput, setClaveInput] = useState(0)
  /** Resultado de cada fichero de una subida múltiple (uno tras otro). */
  const [lote, setLote] = useState<{ nombre: string; texto: string; ok: boolean; oportunidad: AvisoOportunidadDocumento | 'leyendo' | null }[]>([])

  // «Subir póliza» de la ficha llega con `tipoInicial`: el formulario se abre y se
  // trae a la vista. Cerrado y debajo de las baldosas, en el móvil el botón
  // parecía no hacer nada (29/09/2026).
  const formRef = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (tipoInicial) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [tipoInicial])

  // TODO documento subido a la ficha de un cliente se lee con IA y abre (o completa) SOLO su oportunidad
  // (29/09/2026, Alberto: «toda documentación que se suba […] no se puede perder»). Lo hace asegura al
  // guardar; aquí solo se enseña el desenlace. En una póliza nuestra o un siniestro no se lee.
  const [oportunidad, setOportunidadEstado] = useState<AvisoOportunidadDocumento | 'leyendo' | null>(null)
  const leerPoliza = !!clienteId && !polizaId && !siniestroId
  const router = useRouter()
  /** Con oportunidad abierta o completada, la ficha se vuelve a pintar para que salga ya en su lista. */
  function setOportunidad(o: AvisoOportunidadDocumento | 'leyendo' | null) {
    setOportunidadEstado(o)
    if (o !== null && o !== 'leyendo' && o.tono === 'ok') router.refresh()
  }

  /** Un documento que YA estaba subido: asegura lo vuelve a leer y abre su oportunidad. */
  async function leerGuardado(d: DocumentoResumen) {
    setOportunidad('leyendo')
    try {
      const res = await fetch(`/api/correduria/documentos/${d.id}`, { method: 'POST' })
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
      const o = interpretarOportunidadDocumento(j?.oportunidad)
      setOportunidad(o ?? { tono: 'aviso', texto: `No se ha podido leer (${String(j?.error ?? `error ${res.status}`)}): abre la oportunidad a mano.`, clienteId: null })
    } catch {
      setOportunidad({ tono: 'aviso', texto: 'Sin conexión: vuelve a intentarlo.', clienteId: null })
    }
  }

  const destino = { clienteId: clienteId ?? null, polizaId: polizaId ?? null, siniestroId: siniestroId ?? null }
  const resumen = resumenDocumentos(lista)

  /** Sube los ficheros elegidos UNO DETRÁS DE OTRO (cada uno por el mismo flujo) y dice el resultado de cada uno. */
  async function subir() {
    if (ficheros.length === 0) return setAviso('Elige un fichero.')
    setOcupado(true)
    setAviso(null)
    setOportunidadEstado(null)
    const cola = [...ficheros]
    const filas: { nombre: string; texto: string; ok: boolean; oportunidad: AvisoOportunidadDocumento | 'leyendo' | null }[] = cola.map((f) => ({ nombre: f.name, texto: 'En espera…', ok: false, oportunidad: null }))
    setLote([...filas])
    const pinta = (i: number, f: Partial<(typeof filas)[number]>) => {
      filas[i] = { ...filas[i], ...f }
      setLote([...filas])
    }
    let refrescar = false
    const fallidos: File[] = []
    try {
      for (let i = 0; i < cola.length; i++) {
        const fichero = cola[i]
        const reparo = revisarDocumento({ type: fichero.type, size: fichero.size, name: fichero.name })
        if (reparo) {
          fallidos.push(fichero)
          pinta(i, { texto: reparo })
          continue
        }
        pinta(i, { texto: 'Subiendo…', oportunidad: leerPoliza ? 'leyendo' : null })
        try {
          const form = new FormData()
          form.append('fichero', fichero)
          form.append('tipo', tipo)
          if (notas.trim()) form.append('notas', notas.trim())
          for (const [k, v] of Object.entries(destino)) if (v) form.append(k, v)
          const res = await fetch('/api/correduria/documentos', { method: 'POST', body: form })
          const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
          if (!res.ok || !j || j.estado !== 'ok') {
            fallidos.push(fichero)
            pinta(i, { texto: String(j?.error ?? j?.motivo ?? `error ${res.status}`), oportunidad: null })
            continue
          }
          const d = j.documento as DocumentoResumen
          setLista((l) => ((l ?? []).some((x) => x.id === d.id) ? l : [d, ...(l ?? [])]))
          const o = leerPoliza ? interpretarOportunidadDocumento(j.oportunidad) : null
          if (o && o.tono === 'ok') refrescar = true
          pinta(i, { ok: true, texto: j.repetido === true ? 'Ya estaba subido: no se ha duplicado el documento.' : 'Guardado.', oportunidad: o })
        } catch (e) {
          fallidos.push(fichero)
          pinta(i, { texto: e instanceof Error ? e.message : String(e), oportunidad: null })
        }
      }
    } finally {
      setFicheros(fallidos)
      setClaveInput((k) => k + 1)
      if (fallidos.length === 0) setNotas('')
      if (refrescar) router.refresh()
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
                {leerPoliza && d.estado !== 'pedido' && (
                  <button type="button" onClick={() => void leerGuardado(d)} disabled={ocupado || oportunidad === 'leyendo'} title="La IA lo lee (compañía, vencimiento, prima y bonus) y abre o completa la oportunidad" style={{ ...btn, gap: 6 }}>
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
            <select value={tipo} disabled={ocupado} onChange={(e) => setTipo(e.target.value as TipoDocumento)} style={inp}>
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {etiquetaTipoDocumento(t)}
                </option>
              ))}
            </select>
          </label>
          <label style={lbl}>
            Ficheros (PDF o foto, ≤ 10 MB cada uno; puedes elegir varios)
            {ficheros.length > 0 && <span style={{ color: 'var(--muted)' }}>Pendientes de subir: {ficheros.map((f) => f.name).join(', ')}</span>}
            <input
              key={claveInput}
              type="file"
              accept="application/pdf,image/*"
              multiple
              disabled={ocupado}
              onChange={(e) => setFicheros(Array.from(e.target.files ?? []))}
              style={inp}
            />
          </label>
          <label style={lbl}>
            Nota (opcional)
            <input value={notas} disabled={ocupado} onChange={(e) => setNotas(e.target.value)} placeholder="p. ej. «pedido por WhatsApp el 2/9»" style={inp} />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={subir} disabled={ocupado || ficheros.length === 0} style={{ ...btn, fontWeight: 600, gap: 6 }}>
              <Ico i={Upload} /> {ficheros.length > 1 ? `Guardar ${ficheros.length} ficheros` : 'Guardar fichero'}
            </button>
            <button type="button" onClick={pedir} disabled={ocupado} style={{ ...btn, gap: 6 }}>
              <Ico i={Clock} /> Anotar como pedido (sin fichero)
            </button>
          </div>
        </div>
      </details>
      {aviso && <div style={{ fontSize: 13, color: 'var(--warning)' }}>{aviso}</div>}
      {lote.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, minWidth: 0 }}>
          {lote.map((f, i) => (
            <li key={`${i}-${f.nombre}`} style={{ display: 'grid', gap: 6, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: f.ok ? 'var(--text)' : 'var(--warning)', wordBreak: 'break-word' }}>
                <strong>{f.nombre}</strong> · {f.texto}
              </div>
              {f.oportunidad !== null && <AvisoOportunidad a={f.oportunidad} fichaActual={clienteId ?? null} />}
            </li>
          ))}
        </ul>
      )}
      {oportunidad !== null && <AvisoOportunidad a={oportunidad} fichaActual={clienteId ?? null} />}
    </div>
  )
}

/** El desenlace de la oportunidad que abre (o completa) el documento subido. */
function AvisoOportunidad({ a, fichaActual }: { a: AvisoOportunidadDocumento | 'leyendo'; fichaActual: string | null }) {
  const caja: React.CSSProperties = { display: 'grid', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: 10, fontSize: 13 }
  if (a === 'leyendo') return <div role="status" style={caja}>Leyendo el documento con IA para abrir su oportunidad…</div>
  const color = a.tono === 'aviso' ? 'var(--negative)' : a.tono === 'ok' ? 'var(--text)' : 'var(--muted)'
  // La oportunidad se abrió en OTRA ficha (lead nuevo o el tomador del documento): se ve y se enlaza.
  const enOtraFicha = !!a.clienteId && a.clienteId !== fichaActual
  return (
    <div role="status" style={{ ...caja, color, ...(enOtraFicha ? { borderColor: 'var(--warning)', borderWidth: 2 } : {}) }}>
      {enOtraFicha && <strong style={{ color: 'var(--warning)' }}>Abierta en OTRA ficha, no en esta.</strong>}
      <span>{a.texto}</span>
      {a.clienteId && (
        <Link href={`/correduria/cliente/${encodeURIComponent(a.clienteId)}?tab=oportunidades`} style={{ color: 'var(--primary)', fontWeight: 600, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
          Ver sus oportunidades →
        </Link>
      )}
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
