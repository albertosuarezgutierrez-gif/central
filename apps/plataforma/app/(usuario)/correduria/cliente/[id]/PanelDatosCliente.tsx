'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MOTIVO_CAMBIO_REQUERIDO,
  TIPOS_CARNET,
  acreditarCambioConDocumento,
  camposIdentidadTocados,
  claveTipoCarnet,
  documentosAcreditativos,
  estadoDocumentosIdentidad,
  etiquetaEstadoDocumento,
  etiquetaTipoDocumento,
  etiquetasIdentidad,
  nombrePendiente,
  provinciaPorCp,
  revisarEdicion,
  type DocumentoResumen,
  type EdicionCliente,
} from '@central/module-seguros'
import { btnStyle, cardStyle } from '@/components/ui'
import {
  interpretarEscritura,
  textoMotivo,
  type ContactosCliente,
  type IdentidadFicha,
  type ResultadoEscritura,
} from '@/lib/cliente-edicion-asegura'
import type { CarnetFicha, ContactoFicha } from '@/lib/ficha-asegura'
import ContactosFicha, { espejoDe } from '../../ContactosFicha'
import DireccionConfirmable from '../../DireccionConfirmable'
import CiudadPorCp from '../../CiudadPorCp'
import { Campo, MOTIVOS_RAPIDOS, avisoAmbar, campo, h3, identTocada, pendienteBox, type Ident } from '../../EditarCliente'

/**
 * PanelDatosCliente: EL editor de los datos de una persona con ficha (`clienteId`). Lo montan la ficha
 * (`EditarFicha`, botón «✏️ Editar datos»), el modal «Editar datos» de la oportunidad y la pantalla de
 * tarificar un coche: ningún otro fichero de `correduria/**` monta editores de identidad, dirección o carnés
 * (guardián `regression-ficha-cliente-editor-unico`). `secciones` elige qué se ofrece (por defecto todas).
 *
 * UN SOLO sitio donde se editan los datos personales de un cliente (06/10/2026, Alberto: «los datos
 * personales se editan en cinco sitios distintos y el resumen de arriba no es editable»). Se abre
 * desde «✏️ Editar datos» en la cabecera de la ficha, visible en todas las pestañas.
 *
 * Secciones: Identidad · Contacto · Dirección · Carnés · Mote de agenda.
 *
 *  · Identidad + dirección + carnés + mote se guardan con UN botón «Guardar cambios», que manda SOLO
 *    lo que ha cambiado a los endpoints de siempre: `PATCH /api/correduria/cliente` (identidad y
 *    dirección juntas, UNA llamada), `…/cliente/carnets` (POST·PATCH·DELETE) y `PUT …/cliente-mote`.
 *  · El resultado se dice POR TRAMO: un tramo que falla no se cuenta como guardado porque otro sí lo
 *    fuera, y el que falla conserva lo tecleado.
 *  · Contacto (teléfonos y correos) es una lista con altas/bajas: embebe `ContactosFicha` en modo
 *    `editable`, que guarda cada cambio al momento, uno a uno.
 *  · El motivo / documento acreditativo aparece solo cuando `revisarEdicion()` lo exige (la misma
 *    función pura que valida el servidor). Poner nombre a una ficha SIN nombre no lo pide.
 *  · El DNI entero no cruza el puerto: se muestra enmascarado y solo se envía si se teclea uno nuevo.
 *  · `null` ≠ vacío: si no se pudo leer un bloque (identidad, documentos, carnés, mote) se dice y no
 *    se ofrece editarlo a ciegas.
 */

type FilaCarnet = {
  /** `null` = carné nuevo, aún sin guardar. */
  id: string | null
  tipo: string
  fecha: string
  origTipo: string
  origFecha: string
  quitar: boolean
}

export type SeccionPanel = 'identidad' | 'contacto' | 'direccion' | 'carnets' | 'mote'

type Tramo = { nombre: string; ok: boolean; texto: string }

const hoyISO = () => new Date().toISOString().slice(0, 10)

const filasDe = (carnets: CarnetFicha[]): FilaCarnet[] =>
  carnets.map((k) => {
    const tipo = claveTipoCarnet(k.tipo)
    const fecha = k.fechaExpedicion?.slice(0, 10) ?? ''
    return { id: k.id, tipo, fecha, origTipo: tipo, origFecha: fecha, quitar: false }
  })

const filaSucia = (f: FilaCarnet) => f.id === null || f.quitar || f.tipo !== f.origTipo || f.fecha !== f.origFecha

/** Qué le dice al usuario un resultado de escritura, en una frase. */
function textoResultado(r: ResultadoEscritura): string {
  switch (r.estado) {
    case 'ok': return 'guardado'
    case 'conflicto': return `ese dato ya está en otra ficha${r.coincidencias.length > 0 ? ` (${r.coincidencias.map((c) => c.nombre).join(' · ')})` : ''}`
    case 'invalido': return textoMotivo(r.motivo)
    case 'no_encontrado': return 'esa ficha ya no está en la cartera'
    case 'sin_configurar': return 'el puerto con asegura no está conectado'
    default: return `${textoMotivo(r.motivo)}`
  }
}

export default function PanelDatosCliente({
  clienteId, identidad, documentos, contacto, contactos = null, carnets = null, fechaCarnetPoliza = null, juridica, secciones, onGuardado,
}: {
  clienteId: string
  identidad: IdentidadFicha | null
  documentos: DocumentoResumen[] | null
  contacto: ContactoFicha
  /** Solo hace falta con la sección `contacto`. */
  contactos?: ContactosCliente | null
  /** Solo hace falta con la sección `carnets`. */
  carnets?: CarnetFicha[] | null
  fechaCarnetPoliza?: string | null
  /** Persona jurídica: ni carnés ni mote. */
  juridica: boolean
  /** Qué secciones se ofrecen (las demás no se montan ni se envían). Sin esto, todas. */
  secciones?: ReadonlyArray<SeccionPanel>
  /** Tras guardar al menos un tramo (la pantalla ya se ha refrescado): `todoGuardado` = ningún tramo falló. */
  onGuardado?: (r: { todoGuardado: boolean }) => void
}) {
  const router = useRouter()
  const hay = (s: SeccionPanel) => secciones === undefined || secciones.includes(s)
  const ver = { identidad: hay('identidad'), contacto: hay('contacto'), direccion: hay('direccion'), carnets: hay('carnets'), mote: hay('mote') }
  const verCarnets = ver.carnets && !juridica
  const verMote = ver.mote && !juridica
  // ── Identidad ──
  const baseIdent: Ident = {
    nombre: identidad?.nombre ?? '',
    apellidos: identidad?.apellidos ?? '',
    dni: '',
    fechaNacimiento: identidad?.fechaNacimiento ?? '',
  }
  const [inicialIdent, setInicialIdent] = useState<Ident>(baseIdent)
  const [fi, setFi] = useState<Ident>(baseIdent)
  const acreditativos = documentosAcreditativos(documentos)
  const [documentoId, setDocumentoId] = useState<string>(acreditativos[0]?.id ?? '')
  const [motivo, setMotivo] = useState('')
  const refMotivo = useRef<HTMLInputElement>(null)

  // ── Dirección ──
  type Dir = { direccion: string; codigoPostal: string; ciudad: string; provincia: string }
  const baseDir: Dir = {
    direccion: contacto.direccion ?? '',
    codigoPostal: contacto.codigoPostal ?? '',
    ciudad: contacto.ciudad ?? '',
    provincia: contacto.provincia ?? '',
  }
  const [inicialDir, setInicialDir] = useState<Dir>(baseDir)
  const [fd, setFd] = useState<Dir>(baseDir)

  // ── Carnés ──
  const [filas, setFilas] = useState<FilaCarnet[]>(() => filasDe(carnets ?? []))
  const libreTipo = TIPOS_CARNET.find((t) => !(carnets ?? []).some((k) => claveTipoCarnet(k.tipo) === t)) ?? 'B'
  const [nuevo, setNuevo] = useState({ tipo: libreTipo as string, fecha: (carnets ?? []).length === 0 ? (fechaCarnetPoliza?.slice(0, 10) ?? '') : '' })
  // La fecha de la póliza solo PRECARGA el carné nuevo: no es un cambio hasta que el usuario lo toca.
  const [nuevoTocado, setNuevoTocado] = useState(false)
  // Tras guardar, la ficha se vuelve a leer y llegan los carnés del servidor (con sus id): se toman
  // solo si no hay ediciones a medias (un tramo que falló conserva lo tecleado).
  const firmaCarnets = JSON.stringify(carnets)
  useEffect(() => {
    setFilas((actual) => (actual.some(filaSucia) ? actual : filasDe(carnets ?? [])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaCarnets])

  // ── Mote (se lee aparte, no viaja con la ficha) ──
  const [mote, setMote] = useState<string | null | undefined>(undefined)
  const [moteTexto, setMoteTexto] = useState('')
  useEffect(() => {
    if (!verMote) return
    let vivo = true
    fetch(`/api/correduria/cliente-mote?clienteId=${encodeURIComponent(clienteId)}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { estado?: string; mote?: string | null } | null
        if (!vivo) return
        if (r.ok && j?.estado === 'ok') { setMote(j.mote ?? null); setMoteTexto(j.mote ?? '') } else setMote(undefined)
      })
      .catch(() => undefined)
    return () => { vivo = false }
  }, [clienteId, verMote])

  // ── Estado del guardado ──
  const [ocupado, setOcupado] = useState(false)
  const [tramos, setTramos] = useState<Tramo[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [campoMal, setCampoMal] = useState<string | null>(null)
  const [pedirMotivoMal, setPedirMotivoMal] = useState(false)

  // Lo editado, comparando sin espacios de más (un espacio no es un cambio).
  const ident = ver.identidad && identidad ? identTocada(fi, inicialIdent) : {}
  const hayIdent = Object.keys(ident).length > 0
  const libre: NonNullable<EdicionCliente['libre']> = {}
  for (const k of ['direccion', 'codigoPostal', 'ciudad', 'provincia'] as const) {
    if (ver.direccion && fd[k] !== inicialDir[k]) libre[k] = fd[k].trim() === '' ? null : fd[k]
  }
  const hayLibre = Object.keys(libre).length > 0

  // ¿Lo editado pide motivo? La misma función pura que el servidor.
  const docSel = documentoId !== '' ? acreditativos.find((d) => d.id === documentoId) ?? null : null
  const conDocumento = docSel !== null
  const polizaNoCubre = docSel?.tipo === 'poliza' && (fi.dni.trim() !== '' || fi.fechaNacimiento !== inicialIdent.fechaNacimiento)
  const ctxRevision = { permiteMotivo: true, fichaSinNombre: nombrePendiente(identidad?.nombre), apellidosActuales: inicialIdent.apellidos }
  const sinMotivo = revisarEdicion({ identidad: ident, documentoId: null, motivo: null }, ctxRevision)
  const sinDocPideMotivo = !sinMotivo.ok && sinMotivo.motivo === MOTIVO_CAMBIO_REQUERIDO
  const pideMotivo = hayIdent && (polizaNoCubre || (!conDocumento && sinDocPideMotivo))
  const estadoDocs = estadoDocumentosIdentidad(documentos)
  const rot = etiquetasIdentidad(identidad?.tipoPersona === 'juridica' || identidad?.tipoPersona === 'fisica' ? identidad.tipoPersona : null)

  function setDir<K extends keyof Dir>(k: K, v: string) {
    setFd((prev) => {
      const next = { ...prev, [k]: v }
      // CP completo → su provincia, aunque hubiera otra (386 fichas «Tarragona» con CP 41xxx).
      if (k === 'codigoPostal' && /^\d{5}$/.test(v.trim())) {
        const p = provinciaPorCp(v)
        if (p) next.provincia = p
      }
      return next
    })
  }

  const setFila = (i: number, cambios: Partial<FilaCarnet>) => setFilas((xs) => xs.map((x, j) => (j === i ? { ...x, ...cambios } : x)))

  const nuevoPide = verCarnets && carnets !== null && nuevoTocado && nuevo.fecha !== ''
  const hayCarnets = verCarnets && (filas.some(filaSucia) || nuevoPide)
  const moteCambiado = verMote && mote !== undefined && moteTexto.trim() !== (mote ?? '')

  function enfocarMotivo() {
    setTimeout(() => {
      const el = refMotivo.current
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus() }
    }, 0)
  }

  async function llamar(url: string, method: string, body: Record<string, unknown>): Promise<{ status: number; json: unknown }> {
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: res.status, json: await res.json().catch(() => null) }
  }

  async function guardar() {
    setAviso(null)
    setTramos(null)
    setCampoMal(null)
    setPedirMotivoMal(false)
    if (!hayIdent && !hayLibre && !hayCarnets && !moteCambiado) return setAviso('No hay cambios que guardar.')

    // 1) Validar ANTES de mandar nada: si falla, no se envía ningún tramo.
    let cuerpoFicha: Record<string, unknown> | null = null
    let nombreTramoFicha = ''
    if (hayIdent || hayLibre) {
      const motivoEnviado = pideMotivo || (hayIdent && !conDocumento && motivo.trim() !== '') ? motivo : null
      const rev = revisarEdicion(
        { ...(hayIdent ? { identidad: ident } : {}), ...(hayLibre ? { libre } : {}), documentoId: hayIdent && conDocumento ? documentoId : null, motivo: hayIdent ? motivoEnviado : null },
        ctxRevision,
      )
      if (!rev.ok) {
        setCampoMal(rev.campo ?? null)
        if (rev.motivo === MOTIVO_CAMBIO_REQUERIDO) { setPedirMotivoMal(true); enfocarMotivo() }
        return setAviso(`No se ha guardado nada: ${textoMotivo(rev.motivo)}`)
      }
      // La misma regla que el servidor: con póliza, DNI/fecha solo con motivo.
      if (docSel && rev.tocaIdentidad) {
        const acr = acreditarCambioConDocumento(docSel, camposIdentidadTocados(rev.identidad), { motivo: motivoEnviado, permiteMotivo: true })
        if (!acr.ok) {
          setPedirMotivoMal(true)
          enfocarMotivo()
          return setAviso(`No se ha guardado nada: ${textoMotivo(MOTIVO_CAMBIO_REQUERIDO)}`)
        }
      }
      nombreTramoFicha = hayIdent && hayLibre ? 'Identidad y dirección' : hayIdent ? 'Identidad' : 'Dirección'
      cuerpoFicha = {
        id: clienteId,
        ...(hayIdent ? { identidad: ident } : {}),
        ...(hayLibre ? { libre } : {}),
        ...(hayIdent && conDocumento ? { documentoId } : {}),
        ...(hayIdent && motivoEnviado !== null ? { motivo: motivoEnviado } : {}),
      }
    }

    setOcupado(true)
    const out: Tramo[] = []
    try {
      // 2) Identidad + dirección: UNA llamada.
      if (cuerpoFicha) {
        try {
          const { status, json } = await llamar('/api/correduria/cliente', 'PATCH', cuerpoFicha)
          const r = interpretarEscritura(status, json)
          out.push({ nombre: nombreTramoFicha, ok: r.estado === 'ok', texto: textoResultado(r) })
          if (r.estado === 'invalido') setCampoMal(r.campo)
          if (r.estado === 'ok') {
            if (hayIdent) { setInicialIdent({ ...fi, dni: '' }); setFi((p) => ({ ...p, dni: '' })); setMotivo('') }
            if (hayLibre) setInicialDir(fd)
          }
        } catch {
          out.push({ nombre: nombreTramoFicha, ok: false, texto: 'no se pudo llegar a asegura' })
        }
      }

      // 3) Carnés: una llamada por cambio (el endpoint es por carné); se dice cuántos fueron bien.
      if (hayCarnets) {
        const ops: { etiqueta: string; method: 'POST' | 'PATCH' | 'DELETE'; body: Record<string, unknown>; fila: number | 'nuevo' }[] = []
        filas.forEach((f, i) => {
          if (f.id === null) return
          if (f.quitar) ops.push({ etiqueta: `quitar ${f.origTipo}`, method: 'DELETE', body: { id: f.id }, fila: i })
          else if (f.tipo !== f.origTipo || f.fecha !== f.origFecha) ops.push({ etiqueta: `cambiar ${f.origTipo}`, method: 'PATCH', body: { id: f.id, tipo: f.tipo, fecha: f.fecha }, fila: i })
        })
        if (nuevoPide) ops.push({ etiqueta: `añadir ${nuevo.tipo}`, method: 'POST', body: { tipo: nuevo.tipo, fecha: nuevo.fecha }, fila: 'nuevo' })
        const fallos: string[] = []
        for (const op of ops) {
          try {
            const { status, json } = await llamar('/api/correduria/cliente/carnets', op.method, { clienteId, ...op.body })
            const j = json as { estado?: string; motivo?: string } | null
            if (status >= 200 && status < 300 && j?.estado === 'ok') {
              if (op.fila === 'nuevo') {
                const usados = new Set([...filas.map((x) => claveTipoCarnet(x.tipo)), claveTipoCarnet(nuevo.tipo)])
                setNuevo({ tipo: TIPOS_CARNET.find((t) => !usados.has(t)) ?? nuevo.tipo, fecha: '' })
                setNuevoTocado(false)
              }
              else if (op.method === 'DELETE') setFilas((xs) => xs.filter((x) => x.id !== (op.body.id as string)))
              else setFilas((xs) => xs.map((x) => (x.id === op.body.id ? { ...x, origTipo: x.tipo, origFecha: x.fecha } : x)))
            } else {
              fallos.push(`${op.etiqueta}: ${j?.estado === 'sin_configurar' ? 'el puerto de asegura no está conectado' : (j?.motivo ?? `HTTP ${status}`)}`)
            }
          } catch {
            fallos.push(`${op.etiqueta}: no se pudo llegar a asegura`)
          }
        }
        out.push(fallos.length === 0
          ? { nombre: 'Carnés', ok: true, texto: 'guardado' }
          : { nombre: 'Carnés', ok: false, texto: `${ops.length - fallos.length} de ${ops.length} cambios guardados · error en ${fallos.join(' · ')}` })
      }

      // 4) Mote de agenda.
      if (moteCambiado) {
        try {
          const { status, json } = await llamar('/api/correduria/cliente-mote', 'PUT', { clienteId, mote: moteTexto.trim() === '' ? null : moteTexto })
          const j = json as { estado?: string; mote?: string | null; motivo?: string } | null
          if (status >= 200 && status < 300 && j?.estado === 'ok') {
            setMote(j.mote ?? null)
            setMoteTexto(j.mote ?? '')
            out.push({ nombre: 'Mote', ok: true, texto: 'guardado' })
          } else out.push({ nombre: 'Mote', ok: false, texto: j?.motivo ?? `HTTP ${status}` })
        } catch {
          out.push({ nombre: 'Mote', ok: false, texto: 'no se pudo llegar a asegura' })
        }
      }
    } finally {
      setOcupado(false)
      setTramos(out)
      if (out.some((t) => t.ok)) {
        // Primero el aviso al flujo que lo monta (p. ej. volcar su borrador), luego el refresco.
        onGuardado?.({ todoGuardado: out.every((t) => t.ok) })
        router.refresh()
      }
    }
  }

  const colTramo = (ok: boolean) => (ok ? 'var(--positive)' : 'var(--negative)')

  return (
    <section aria-label="Datos del cliente" style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18, maxWidth: '95vw' }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Datos del cliente</h2>

      {/* ── Identidad ── */}
      {ver.identidad && (
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
        <h3 style={h3}>
          Identidad
          {identidad?.tipoPersona && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginLeft: 8 }}>persona {identidad.tipoPersona === 'fisica' ? 'física' : identidad.tipoPersona === 'juridica' ? 'jurídica' : identidad.tipoPersona}</span>}
        </h3>
        {identidad === null ? (
          <div style={pendienteBox}>
            asegura no manda los datos de identidad a esta pantalla (versión anterior). No es que la ficha no
            los tenga: hay que desplegar asegura.
          </div>
        ) : (
          <>
            {acreditativos.length > 0 && (
              <Campo label="Documento que acredita el cambio">
                <select value={conDocumento ? documentoId : ''} onChange={(e) => setDocumentoId(e.target.value)} style={campo}>
                  {acreditativos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {etiquetaTipoDocumento(d.tipo)}{d.tipo === 'poliza' ? ' (su DNI es el de la ficha; acredita solo nombre y apellidos)' : ''} · {d.nombre ?? 'sin nombre'} · {etiquetaEstadoDocumento(d.estado)}
                    </option>
                  ))}
                  <option value="">Ninguno: cambio sin documento, con motivo</option>
                </select>
              </Campo>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 8 }}>
              <Campo label={rot.nombre} mal={campoMal === 'nombre'}>
                <input value={fi.nombre} onChange={(e) => setFi((p) => ({ ...p, nombre: e.target.value }))} style={campo} />
              </Campo>
              <Campo label={rot.apellidos} mal={campoMal === 'apellidos'}>
                <input value={fi.apellidos} onChange={(e) => setFi((p) => ({ ...p, apellidos: e.target.value }))} style={campo} />
              </Campo>
              <Campo label={rot.documento} mal={campoMal === 'dni'} ayuda={identidad.dniEnmascarado ? 'El actual se muestra enmascarado; escribe el nuevo entero para cambiarlo.' : undefined}>
                <input
                  value={fi.dni}
                  onChange={(e) => setFi((p) => ({ ...p, dni: e.target.value }))}
                  placeholder={identidad.dniEnmascarado ?? (identidad.dniIlegible ? 'cifrado: no se puede leer' : `sin ${rot.documento} en la ficha`)}
                  style={campo}
                  autoComplete="off"
                />
              </Campo>
              <Campo label={rot.fecha} mal={campoMal === 'fechaNacimiento'} ayuda={identidad.fechaNacimientoIlegible ? 'La actual está cifrada y no se puede leer.' : undefined}>
                <input type="date" value={fi.fechaNacimiento} onChange={(e) => setFi((p) => ({ ...p, fechaNacimiento: e.target.value }))} style={campo} />
              </Campo>
            </div>
            {!hayIdent && (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Cambiar DNI, nombre o fecha de nacimiento pide un documento o un motivo; completar los apellidos
                (p. ej. añadir el segundo) o poner el nombre a una ficha sin nombre, no.
              </div>
            )}
            {pideMotivo && (
              <div style={{ ...avisoAmbar, display: 'grid', gap: 8 }}>
                <div>
                  {polizaNoCubre
                    ? <>Una póliza acredita solo {rot.nombre.toLowerCase()} y {rot.apellidos.toLowerCase()}. Para cambiar {rot.documento} o {rot.fecha.toLowerCase()} escribe el motivo: quedará en el historial como cambio con motivo (quién, el valor anterior y el nuevo).</>
                    : estadoDocs === 'no_leidos'
                      ? <>No se han podido leer los Documentos de la ficha: no se sabe si hay un {rot.pedir} recibido. Puedes cambiarlo igualmente escribiendo el motivo.</>
                      : estadoDocs === 'hay'
                        ? 'Cambio sin documento: escribe el motivo y quedará en el historial con quién lo cambió, el valor anterior y el nuevo.'
                        : <>No hay ningún {rot.pedir} recibido en Documentos. Puedes cambiar el dato igualmente: escribe el motivo y quedará en el historial con quién lo cambió, el valor anterior y el nuevo.</>}
                </div>
                <Campo label="Motivo del cambio" mal={pedirMotivoMal}>
                  <input ref={refMotivo} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="p. ej. corregido con la clienta por teléfono" style={campo} maxLength={500} />
                </Campo>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} aria-label="Motivos rápidos">
                  {MOTIVOS_RAPIDOS.map((m) => (
                    <button key={m} type="button" onClick={() => setMotivo(m)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, maxWidth: '100%', whiteSpace: 'normal', textAlign: 'left' }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
      )}

      {/* ── Contacto: lista con su propio guardado, al momento ── */}
      {ver.contacto && (
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
        <h3 style={h3}>Contacto</h3>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Los teléfonos y correos se guardan al momento, uno a uno (no dependen de «Guardar cambios»).</div>
        <ContactosFicha
          editable
          clienteId={clienteId}
          inicial={contactos}
          espejo={espejoDe(contacto, contactos)}
          cifradoEnEspejo={contacto.telefonoIlegible || contacto.emailIlegible}
        />
      </section>
      )}

      {/* ── Dirección ── */}
      {ver.direccion && (
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
        <h3 style={h3}>Dirección</h3>
        {contacto.direccionIlegible && (
          <div style={pendienteBox}>
            La dirección está guardada pero cifrada con una clave que asegura no puede abrir: no se puede
            mostrar. Si escribes una aquí, sustituirá a la que hay.
          </div>
        )}
        <Campo label="Dirección" mal={campoMal === 'direccion'}>
          <DireccionConfirmable
            value={fd.direccion}
            onChange={(v) => setDir('direccion', v)}
            codigoPostal={fd.codigoPostal}
            ciudad={fd.ciudad}
            placeholder={contacto.direccionIlegible ? 'cifrada: no se puede leer' : 'Calle, número, piso'}
            style={campo}
          />
        </Campo>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 8 }}>
          <Campo label="Código postal" mal={campoMal === 'codigoPostal'}>
            <input value={fd.codigoPostal} onChange={(e) => setDir('codigoPostal', e.target.value)} inputMode="numeric" maxLength={5} placeholder="41003" style={campo} />
          </Campo>
          <Campo label="Ciudad" mal={campoMal === 'ciudad'}>
            <CiudadPorCp cp={fd.codigoPostal} ciudad={fd.ciudad} onCiudad={(v) => setDir('ciudad', v)} style={campo} />
          </Campo>
          <Campo label="Provincia" mal={campoMal === 'provincia'}>
            <input value={fd.provincia} onChange={(e) => setDir('provincia', e.target.value)} style={campo} />
          </Campo>
        </div>
      </section>
      )}

      {/* ── Carnés (no aplican a una persona jurídica) ── */}
      {verCarnets && (
        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          <h3 style={h3}>Carnés de conducir</h3>
          {carnets === null ? (
            <div style={pendienteBox}>No se han podido leer los carnés de esta ficha: no significa que no tenga. No se editan a ciegas.</div>
          ) : (
            <>
              {filas.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Sin carné registrado (se ha mirado).</div>}
              {filas.map((f, i) => (
                <div key={f.id ?? `n${i}`} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', opacity: f.quitar ? 0.55 : 1 }}>
                  <SelTipo valor={f.tipo} onChange={(t) => setFila(i, { tipo: t })} etiqueta="Tipo de carné" />
                  <input
                    type="date"
                    value={f.fecha}
                    max={hoyISO()}
                    disabled={f.quitar}
                    onChange={(e) => setFila(i, { fecha: e.target.value })}
                    aria-label={`Fecha de expedición del carné ${f.tipo}`}
                    style={{ ...campo, width: 'auto', flex: '1 1 150px' }}
                  />
                  <button type="button" onClick={() => setFila(i, { quitar: !f.quitar })} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>
                    {f.quitar ? 'No quitar' : 'Quitar'}
                  </button>
                  {f.quitar && <span style={{ fontSize: 12, color: 'var(--negative)' }}>se quitará al guardar</span>}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <SelTipo valor={nuevo.tipo} onChange={(t) => { setNuevoTocado(true); setNuevo((n) => ({ ...n, tipo: t })) }} etiqueta="Tipo del carné nuevo" />
                <input
                  type="date"
                  value={nuevo.fecha}
                  max={hoyISO()}
                  onChange={(e) => { setNuevoTocado(true); setNuevo((n) => ({ ...n, fecha: e.target.value })) }}
                  aria-label="Fecha de expedición del carné nuevo"
                  style={{ ...campo, width: 'auto', flex: '1 1 150px' }}
                />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{nuevoPide ? 'carné nuevo: se añade al guardar' : 'Para añadir uno nuevo, pon su fecha.'}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Fecha de expedición o última renovación. La caducidad se calcula sola. Uno por tipo.</div>
            </>
          )}
        </section>
      )}

      {/* ── Mote de agenda (no aplica a una persona jurídica) ── */}
      {verMote && (
        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          <h3 style={h3}>Mote de agenda</h3>
          {mote === undefined ? (
            <div style={pendienteBox}>No se ha podido leer el mote (o aún se está leyendo): no se edita a ciegas.</div>
          ) : (
            <Campo label="Mote (solo en tu agenda)" ayuda="Vacío = sin mote. Nunca sale en correos, portal ni documentos.">
              <input value={moteTexto} maxLength={60} onChange={(e) => setMoteTexto(e.target.value)} placeholder="p. ej. mamá" style={campo} />
            </Campo>
          )}
        </section>
      )}

      {/* ── UN botón para identidad + dirección + carnés + mote ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
        <div>
          <button type="button" disabled={ocupado} onClick={() => void guardar()} style={{ ...btnStyle('primario'), minHeight: 44 }}>
            {ocupado ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
        {aviso && <div role="alert" style={{ fontSize: 13, color: 'var(--negative)' }}>{aviso}</div>}
        {tramos && tramos.length > 0 && (
          <ul role="status" style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'grid', gap: 2 }}>
            {tramos.map((t) => (
              <li key={t.nombre} style={{ color: colTramo(t.ok) }}>
                <strong>{t.nombre}</strong>: {t.ok ? 'guardado' : `NO guardado · ${t.texto}`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function SelTipo({ valor, onChange, etiqueta }: { valor: string; onChange: (t: string) => void; etiqueta: string }) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)} aria-label={etiqueta} style={{ ...campo, width: 84 }}>
      {TIPOS_CARNET.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  )
}
