'use client'
import Link from 'next/link'
import { useState } from 'react'
import { btnStyle, cardStyle } from '@/components/ui'
import { prepararAdjunto } from '@/lib/imagen-cliente'
import { interpretarLecturaOportunidad, type LecturaDocumentoOportunidad } from '@/lib/seguimiento-asegura'
import { interpretarFichaDocumento, interpretarOportunidadDocumento, textoFichaDocumento, type AvisoOportunidadDocumento, type FichaDocumento } from '@/lib/oportunidad-documento'

/**
 * UNA sola lectura de documento para toda la correduría (03/10/2026): la pantalla general
 * `/correduria/subir-poliza` y la ficha del cliente (FormAlta) suben por aquí. Hace el fichero →
 * base64, el POST a `/api/correduria/oportunidad/leer`, la interpretación de la respuesta y pinta
 * lo que asegura dice de la oportunidad y de la ficha del tomador. Lo propio de cada pantalla
 * (rellenar el formulario, enlazar a la póliza o al alta) cuelga de `onLectura` y de `lectura`.
 */
export type LecturaOk = Extract<LecturaDocumentoOportunidad, { estado: 'ok' }>

/** Qué se manda además del fichero. SubirPoliza: `{tomador, crear}`; FormAlta: `{clienteId}`. */
export type OpcionesLeerPoliza = {
  clienteId?: string
  tomador?: boolean
  crear?: boolean
  /** Se llama con la lectura buena, antes de que la pantalla repinte (FormAlta rellena sus campos). */
  onLectura?: (l: LecturaOk) => void
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

  async function leer(f: File) {
    setLeyendo(true)
    setMotivoError(null)
    setLectura(null)
    setOportunidad(null)
    setFicha(undefined)
    setSinGuardar(false)
    setFichaIncierta(false)
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
    if (l.estado === 'error') { setMotivoError(l.motivo); return }
    setLectura(l)
    const j = json as Record<string, unknown> | null
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
    onLectura?.(l)
  }

  return {
    leer, leyendo, motivoError, lectura, oportunidad, ficha, sinGuardar, fichaIncierta,
    /** La oportunidad o la ficha ya llevan al usuario a un sitio: el resto de salidas sobra. */
    conOportunidad: Boolean(oportunidad?.clienteId || ficha),
  }
}

/** Lo que asegura dice de la oportunidad y de la ficha del tomador. No pinta nada si no dice nada. */
export function AvisosLectura({ oportunidad, ficha, sinGuardar, fichaIncierta }: Pick<ReturnType<typeof useLeerPoliza>, 'oportunidad' | 'ficha' | 'sinGuardar' | 'fichaIncierta'>) {
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
