'use client'
import Link from 'next/link'
import { useState } from 'react'
import { btnStyle, cardStyle } from '@/components/ui'
import { prepararAdjunto } from '@/lib/imagen-cliente'
import { interpretarLecturaOportunidad, type LecturaDocumentoOportunidad } from '@/lib/seguimiento-asegura'
import { interpretarFichaDocumento, interpretarFigurasDocumento, interpretarOportunidadDocumento, textoCamposFigura, textoFichaDocumento, textoFiguraDocumento, type AvisoOportunidadDocumento, type FichaDocumento, type FiguraDocumento, type FigurasDocumento } from '@/lib/oportunidad-documento'

/**
 * UNA sola lectura de documento para toda la correduría (03/10/2026): la pantalla general
 * `/correduria/subir-poliza` y la ficha del cliente (FormAlta) suben por aquí. Hace el fichero →
 * base64, el POST a `/api/correduria/oportunidad/leer`, la interpretación de la respuesta y pinta
 * lo que asegura dice de la oportunidad y de la ficha del tomador. Lo propio de cada pantalla
 * (rellenar el formulario, enlazar a la póliza o al alta) cuelga de `onLectura` y de `lectura`.
 */
export type LecturaOk = Extract<LecturaDocumentoOportunidad, { estado: 'ok' }>

/** Qué se manda además del fichero. SubirPoliza: `{tomador, crear}`; FormAlta: `{clienteId, crear}`. */
export type OpcionesLeerPoliza = {
  clienteId?: string
  tomador?: boolean
  crear?: boolean
  /** Se llama con la lectura buena, antes de que la pantalla repinte (FormAlta rellena sus campos). */
  onLectura?: (l: LecturaOk) => void
}

/** La oportunidad que el servidor dice haber abierto (o encontrado ya abierta) con `crear`. */
export type OportunidadAbierta = { oportunidadId: string; estado: 'creada' | 'actualizada'; clienteId: string | null }

/** Solo con estado `creada`/`actualizada` Y un id: cualquier otra cosa no afirma que haya oportunidad. */
function oportunidadAbierta(v: unknown): OportunidadAbierta | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (o.estado !== 'creada' && o.estado !== 'actualizada') return null
  const id = typeof o.oportunidadId === 'string' ? o.oportunidadId.trim() : ''
  if (!id) return null
  const cli = typeof o.clienteId === 'string' && o.clienteId.trim() !== '' ? o.clienteId.trim() : null
  return { oportunidadId: id, estado: o.estado, clienteId: cli }
}

export const enlaceStyle = { ...btnStyle('secundario', 'sm'), minHeight: 44, textDecoration: 'none', justifyContent: 'flex-start' } as const

export function useLeerPoliza({ clienteId, tomador, crear, onLectura }: OpcionesLeerPoliza = {}) {
  const [leyendo, setLeyendo] = useState(false)
  /** Motivo del fallo de lectura (sin el «No se ha podido leer:»; cada pantalla lo enmarca). */
  const [motivoError, setMotivoError] = useState<string | null>(null)
  const [lectura, setLectura] = useState<LecturaOk | null>(null)
  const [oportunidad, setOportunidad] = useState<AvisoOportunidadDocumento | null>(null)
  const [sinGuardar, setSinGuardar] = useState(false)
  // La oportunidad falló: no se sabe si la ficha se llegó a tocar (no se afirma que no).
  const [fichaIncierta, setFichaIncierta] = useState(false)
  // `null` = no se ha tocado ninguna ficha; `undefined` = asegura no lo dice (no se afirma nada).
  const [ficha, setFicha] = useState<FichaDocumento | null | undefined>(undefined)
  // Con `crear`: la oportunidad que el servidor ha abierto o encontrado ya abierta (`null` = no consta).
  const [abierta, setAbierta] = useState<OportunidadAbierta | null>(null)
  // Motor: las personas de la póliza que no son el tomador (`null` = asegura no dice nada).
  const [figuras, setFiguras] = useState<FigurasDocumento | null>(null)

  async function leer(f: File) {
    setLeyendo(true)
    setMotivoError(null)
    setLectura(null)
    setOportunidad(null)
    setFicha(undefined)
    setSinGuardar(false)
    setFichaIncierta(false)
    setAbierta(null)
    setFiguras(null)
    let status = 0
    let json: unknown = null
    try {
      const a = await prepararAdjunto(f)
      const res = await fetch('/api/correduria/oportunidad/leer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Solo viajan las opciones puestas: `crear` abre (o completa) la oportunidad y guarda el
        // fichero en la ficha del tomador (29/09/2026); `clienteId` ancla la lectura a una ficha.
        body: JSON.stringify({
          base64: a.base64, mimeType: a.mimeType, fileName: a.fileName,
          ...(clienteId !== undefined ? { clienteId } : {}),
          ...(tomador !== undefined ? { tomador } : {}),
          ...(crear !== undefined ? { crear } : {}),
        }),
      })
      status = res.status
      json = await res.json().catch(() => null)
    } catch {
      json = { error: 'sin conexión' }
    }
    setLeyendo(false)
    const l = interpretarLecturaOportunidad(status, json)
    const j = json as Record<string, unknown> | null
    const yaAbierta = oportunidadAbierta(j?.oportunidad)
    // Un fallo de lectura no tapa una oportunidad que el servidor sí dice haber abierto.
    if (l.estado === 'error' && !yaAbierta) { setMotivoError(l.motivo); return }
    if (l.estado === 'ok') setLectura(l)
    setAbierta(yaAbierta)
    const bruta = j?.oportunidad as { estado?: unknown; clienteId?: unknown } | null | undefined
    const falloOportunidad = bruta != null && typeof bruta === 'object' && bruta.estado === 'error'
    const aviso = interpretarOportunidadDocumento(j?.oportunidad)
    // En un error, asegura puede devolver la ficha que ya estaba elegida o creada: se enlaza.
    const idFicha = falloOportunidad && typeof bruta?.clienteId === 'string' && bruta.clienteId.trim() !== '' ? bruta.clienteId.trim() : null
    setOportunidad(aviso && idFicha ? { ...aviso, clienteId: idFicha } : aviso)
    setFichaIncierta(falloOportunidad)
    // asegura dice si guardó el fichero; si no lo dice (versión anterior), no se afirma nada.
    setSinGuardar(j?.oportunidad != null && j?.ficheroGuardado === false)
    setFicha(j?.oportunidad != null ? interpretarFichaDocumento(j?.ficha) : undefined)
    setFiguras(interpretarFigurasDocumento(j?.oportunidad))
    if (l.estado === 'ok') onLectura?.(l)
  }

  return {
    leer, leyendo, motivoError, lectura, oportunidad, ficha, sinGuardar, fichaIncierta, abierta, figuras,
    /** La oportunidad o la ficha ya llevan al usuario a un sitio: el resto de salidas sobra. */
    conOportunidad: Boolean(oportunidad?.clienteId || ficha),
  }
}

/** Lo que asegura dice de la oportunidad y de la ficha del tomador. No pinta nada si no dice nada. */
export function AvisosLectura({ oportunidad, ficha, sinGuardar, fichaIncierta, figuras }: Pick<ReturnType<typeof useLeerPoliza>, 'oportunidad' | 'ficha' | 'sinGuardar' | 'fichaIncierta'> & { figuras?: FigurasDocumento | null }) {
  return (
    <>
      {oportunidad && (
        <div role="status" style={{ ...cardStyle, display: 'grid', gap: 8, color: oportunidad.tono === 'aviso' ? 'var(--negative)' : 'var(--text)' }}>
          <span>{oportunidad.texto}</span>
          {oportunidad.clienteId && (
            <Link href={`/correduria/cliente/${encodeURIComponent(oportunidad.clienteId)}?tab=oportunidades`} style={enlaceStyle}>Ver su ficha y la oportunidad →</Link>
          )}
        </div>
      )}
      {ficha && <FichaTomadorResultado f={ficha} guardado={!sinGuardar} />}
      {figuras && <FigurasResultado f={figuras} />}
      {fichaIncierta && !oportunidad?.clienteId && (
        <p role="status" style={{ ...cardStyle, margin: 0, color: 'var(--negative)' }}>
          No se ha podido confirmar si se ha tocado alguna ficha: mírala en el buscador antes de volver a subirlo.
        </p>
      )}
      {ficha === null && !fichaIncierta && (
        <p role="status" style={{ ...cardStyle, margin: 0, color: 'var(--negative)' }}>
          No se ha tocado ninguna ficha{sinGuardar ? ' ni se ha guardado el documento. Si sabes de quién es, súbelo desde su ficha → Documentos' : ''}.
        </p>
      )}
      {sinGuardar && ficha !== null && (
        <p role="status" style={{ ...cardStyle, margin: 0, color: 'var(--negative)' }}>
          El fichero NO se ha guardado en ninguna ficha: súbelo desde la ficha del cliente si quieres conservarlo.
        </p>
      )}
    </>
  )
}

function FichaTomadorResultado({ f, guardado }: { f: FichaDocumento; guardado: boolean }) {
  return (
    <div role="status" style={{ ...cardStyle, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <strong>Ficha del tomador</strong>
      <span style={{ overflowWrap: 'anywhere' }}>{textoFichaDocumento(f)}{guardado ? ' El documento queda guardado en su ficha → Documentos.' : ''}</span>
      {f.avisos.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, fontSize: 13, color: 'var(--negative)' }}>
          {f.avisos.map((a, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}>{a}</li>)}
        </ul>
      )}
      <Link href={`/correduria/cliente/${encodeURIComponent(f.clienteId)}`} style={enlaceStyle}>
        {f.creada ? 'Abrir el lead nuevo →' : 'Abrir su ficha →'}
      </Link>
    </div>
  )
}

/**
 * Las otras personas de la póliza (propietario, conductores): una línea por ficha, con su enlace y
 * qué tiene / qué le falta a su ficha (solo NOMBRES de campo; los valores nunca llegan aquí).
 */
function FigurasResultado({ f }: { f: FigurasDocumento }) {
  return (
    <div role="status" style={{ ...cardStyle, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <strong>Figuras de la póliza</strong>
      {f.figuras.map(x => (
        <div key={x.clienteId} style={{ display: 'grid', gap: 4, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <Link href={`/correduria/cliente/${encodeURIComponent(x.clienteId)}`} style={{ ...enlaceStyle, overflowWrap: 'anywhere', whiteSpace: 'normal', textAlign: 'left' }}>
            {textoFiguraDocumento(x)} →
          </Link>
          <CamposFigura x={x} />
        </div>
      ))}
      {f.avisos.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, fontSize: 13, color: 'var(--negative)' }}>
          {f.avisos.map((a, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}>{a}</li>)}
        </ul>
      )}
    </div>
  )
}

/** «Tiene: …» / «Falta: …» de la ficha de una figura. Una respuesta anterior (sin `campos`) no pinta nada. */
function CamposFigura({ x }: { x: FiguraDocumento }) {
  const t = textoCamposFigura(x.campos)
  if (!t) return null
  return (
    <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 2, fontSize: 13 }}>
      {t.tiene.length > 0 && <li style={{ overflowWrap: 'anywhere' }}>Tiene: {t.tiene.join(', ')}</li>}
      {t.falta.length > 0 && <li style={{ overflowWrap: 'anywhere', color: 'var(--negative)' }}>Falta: {t.falta.join(', ')}</li>}
      {t.sinComprobar.length > 0 && <li style={{ overflowWrap: 'anywhere', color: 'var(--muted)' }}>Sin comprobar: {t.sinComprobar.join(', ')}</li>}
    </ul>
  )
}
