'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Contact, TriangleAlert } from 'lucide-react'
import {
  accionesPermitidas, ETIQUETA_ACCION_REVISION, ETIQUETA_MOTIVO_DUPLICADO, ETIQUETA_TIPO_REVISION, esMotivoDuplicado,
  type AccionRevision, type MotivoDuplicado, type TipoRevisionGoogle,
} from '@central/module-seguros/google-contactos-revision'
import { Badge, btnStyle } from '@/components/ui'
import Bloque from './Bloque'
import { ConIcono } from './iconos'
import { anadirPagina, hayMas, primeraPagina, quitarResuelta, type ListaRevision } from './google-revision-lista'

/**
 * Cola de revisión de la sincronización CRM ↔ Google Contacts (05/10/2026). El CRM manda: lo que
 * se editó en Google ya se pisó y aquí queda lo que había; un contacto nuevo en el grupo es una
 * propuesta de lead. Ningún botón toca Google: «Mantener CRM» sobre un contacto sacado del grupo
 * solo cierra la revisión (no lo vuelve a meter). «Unificar» (solo en un duplicado inequívoco) une la
 * ficha con ese contacto de la agenda y guarda SU nombre como mote («🟢 Mamá»); «Unificar con nombre
 * del CRM», sin mote. «Usar como mote» (renombrado en Google): ese nombre pasa a ser el mote.
 * «Este número es de…» (varias fichas con el mismo teléfono): un botón por ficha; la elegida tendrá EL
 * contacto y las demás irán dentro como empresa/nota (las fichas del CRM no se fusionan). «Añadir a la
 * ficha»: un teléfono/correo del contacto que la ficha no tiene (nunca pisa uno existente).
 *
 * 🚨 Sin lectura buena no se dice «nada pendiente»: un fallo es un error visible.
 */

type Campos = { nombre: string; apellidos: string; telefono: string | null; email: string | null; grupo: 'cliente' | 'lead' | null }
type Revision = {
  id: string
  tipo: TipoRevisionGoogle
  motivo?: MotivoDuplicado | null
  campos: string[]
  clienteId: string | null
  clienteNombre: string | null
  propuesta: Campos | null
  propuestaIlegible: boolean
  candidatos?: { id: string; nombre: string | null; tipoPersona: string | null }[]
  creadoEn: string
}
type Pagina = { revisiones: Revision[]; siguiente: string | null; pendientes: number; nombreDistintoPendientes: number | null }

const pMuted = { fontSize: 13, color: 'var(--muted)', margin: 0 } as const
const ETIQUETA_CAMPO: Record<string, string> = { nombre: 'nombre', apellidos: 'apellidos', telefono: 'teléfono', email: 'correo', grupo: 'cliente/lead' }

function fecha(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function pagina(j: unknown): Pagina | null {
  const o = (typeof j === 'object' && j !== null ? j : {}) as Record<string, unknown>
  if (o.estado !== 'ok' || !Array.isArray(o.revisiones)) return null
  return {
    revisiones: o.revisiones as Revision[],
    siguiente: typeof o.siguiente === 'string' ? o.siguiente : null,
    pendientes: typeof o.pendientes === 'number' ? o.pendientes : o.revisiones.length,
    // `null` = asegura antiguo que no lo cuenta: sin botón en bloque (no se inventa un 0).
    nombreDistintoPendientes: typeof o.nombreDistintoPendientes === 'number' ? o.nombreDistintoPendientes : null,
  }
}

export default function GoogleContactosRevision() {
  const [lista, setLista] = useState<ListaRevision<Revision> | null>(null)
  const [modo, setModo] = useState<'cargando' | 'ok' | 'sin_configurar' | 'error'>('cargando')
  const [masCargando, setMasCargando] = useState(false)
  const [errorMas, setErrorMas] = useState<string | null>(null)
  const [ocupada, setOcupada] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<Record<string, { texto: string; forzable?: boolean }>>({})
  const [nombreDistinto, setNombreDistinto] = useState<number | null>(null)
  const [lote, setLote] = useState<{ ocupado: boolean; texto: string | null; error: boolean; siguiente: string | null }>({ ocupado: false, texto: null, error: false, siguiente: null })

  const cargar = useCallback(async () => {
    setModo('cargando')
    try {
      const r = await fetch('/api/correduria/google-contactos-revision', { cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (r.status === 503 && (j as { estado?: string } | null)?.estado === 'sin_configurar') return setModo('sin_configurar')
      const p = r.ok ? pagina(j) : null
      if (!p) return setModo('error')
      setLista(primeraPagina(p))
      setNombreDistinto(p.nombreDistintoPendientes)
      setModo('ok')
    } catch {
      setModo('error')
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function verMas() {
    if (!lista?.siguiente) return
    setMasCargando(true)
    setErrorMas(null)
    try {
      const r = await fetch(`/api/correduria/google-contactos-revision?despuesDe=${encodeURIComponent(lista.siguiente)}`, { cache: 'no-store' })
      const p = r.ok ? pagina(await r.json().catch(() => null)) : null
      // Si falla, la lista y el botón SE QUEDAN: no se recarga ni se desmonta lo ya visto.
      if (!p) setErrorMas(`No se ha podido cargar más (HTTP ${r.status}).`)
      else setLista((l) => (l ? anadirPagina(l, p) : primeraPagina(p)))
    } catch {
      setErrorMas('No se ha podido cargar más.')
    } finally {
      setMasCargando(false)
    }
  }

  async function resolver(rev: Revision, accion: AccionRevision, forzar = false, clienteId: string | null = null) {
    setOcupada(rev.id)
    setAvisos((a) => { const { [rev.id]: _, ...resto } = a; void _; return resto })
    try {
      const r = await fetch('/api/correduria/google-contactos-revision', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: rev.id, accion, ...(forzar ? { forzar: true } : {}), ...(clienteId ? { clienteId } : {}) }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string; forzable?: boolean } | null
      if (r.ok || (r.status === 409 && j?.estado === 'ya_resuelta')) {
        setLista((l) => (l ? quitarResuelta(l, rev.id) : l))
        if (rev.tipo === 'duplicado_ambiguo' && rev.motivo === 'nombre_distinto') setNombreDistinto((n) => (n ? n - 1 : n))
        return
      }
      const texto = r.status === 409 && j?.estado === 'conflicto'
        ? 'Ese teléfono o correo ya está en otra ficha del CRM. Búscala antes de crear un duplicado.'
        : (j?.motivo ?? `No se ha podido resolver (HTTP ${r.status}).`)
      setAvisos((a) => ({ ...a, [rev.id]: { texto, forzable: r.status === 409 && j?.estado === 'conflicto' && j.forzable === true } }))
    } catch {
      setAvisos((a) => ({ ...a, [rev.id]: { texto: 'No se ha podido resolver. Inténtalo de nuevo.' } }))
    } finally {
      setOcupada(null)
    }
  }

  async function unificarTodos(continuar = false) {
    if (!nombreDistinto) return
    const ok = continuar || window.confirm(
      `¿Unificar los ${nombreDistinto} contactos de tu agenda que tienen el teléfono de una ficha pero OTRO nombre?\n\n` +
        'Se quedan con TU nombre como mote de la ficha (p. ej. «🟢 Mamá»; se puede cambiar en la ficha) y pasan a «Grupo ASegura» ' +
        'en la próxima sincronización; el nombre de la ficha va a la nota y lo demás que hayas puesto se conserva. No se crea ningún duplicado.',
    )
    if (!ok) return
    const despuesDe = continuar ? lote.siguiente : null
    setLote((l) => ({ ...l, ocupado: true, texto: null, error: false }))
    try {
      const r = await fetch('/api/correduria/google-contactos-revision', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lote: 'unificar', motivo: 'nombre_distinto', ...(despuesDe ? { despuesDe } : {}) }),
      })
      type Omision = { motivo?: string }
      const j = (await r.json().catch(() => null)) as { unificadas?: number; omitidas?: Omision[]; fallidas?: Omision[]; siguiente?: string | null; quedan?: number; motivo?: string } | null
      if (!r.ok || typeof j?.unificadas !== 'number') {
        setLote({ ocupado: false, texto: j?.motivo ?? `No se ha podido unificar (HTTP ${r.status}).`, error: true, siguiente: null })
        return
      }
      const porMotivo = (xs: Omision[] | undefined) => {
        const m = new Map<string, number>()
        for (const x of xs ?? []) m.set(x.motivo ?? '¿?', (m.get(x.motivo ?? '¿?') ?? 0) + 1)
        return [...m].map(([k, n]) => `${n} × ${k}`).join(' · ')
      }
      const om = j.omitidas?.length ?? 0
      const fa = j.fallidas?.length ?? 0
      const siguiente = typeof j.siguiente === 'string' ? j.siguiente : null
      setLote({
        ocupado: false, error: fa > 0, siguiente,
        texto: `Unificados ${j.unificadas}.` +
          (om ? ` Omitidos ${om} (siguen en la cola para hacerlos a mano): ${porMotivo(j.omitidas)}.` : '') +
          (fa ? ` Fallaron ${fa}: ${porMotivo(j.fallidas)}.` : '') +
          (siguiente && j.quedan ? ` Quedan ${j.quedan}.` : ''),
      })
      await cargar()
    } catch {
      setLote((l) => ({ ...l, ocupado: false, texto: 'No se ha podido unificar. Inténtalo de nuevo.', error: true }))
    }
  }

  const titulo = 'Google Contacts: revisión'
  if (modo === 'cargando' && !lista) return <Bloque titulo={titulo} Icono={Contact}><p style={pMuted}>Cargando…</p></Bloque>
  if (modo === 'sin_configurar') {
    return (
      <Bloque titulo={titulo} Icono={Contact} tono="aviso">
        <p style={pMuted}>El puerto con asegura no está conectado. <strong>No significa que no haya nada pendiente.</strong></p>
      </Bloque>
    )
  }
  if (modo === 'error' || !lista) {
    return (
      <Bloque titulo={titulo} Icono={Contact} tono="malo"
        accion={<button type="button" onClick={() => void cargar()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Reintentar</button>}>
        <p style={{ ...pMuted, color: 'var(--negative)' }}>
          <ConIcono i={TriangleAlert}>No se ha podido leer la cola. <strong>No significa que no haya nada pendiente.</strong></ConIcono>
        </p>
      </Bloque>
    )
  }
  if (lista.tarjetas.length === 0 && !hayMas(lista)) {
    return <Bloque titulo={titulo} Icono={Contact}><p style={pMuted}>Nada pendiente de revisar.</p></Bloque>
  }

  return (
    <Bloque titulo={titulo} Icono={Contact}
      sub={<>{lista.pendientes} pendiente{lista.pendientes === 1 ? '' : 's'}. El CRM manda: lo editado en Google ya se ha vuelto a pisar y aquí queda lo que había.</>}>
      {(!!nombreDistinto || lote.texto) && (
        <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
          {!!nombreDistinto && (
            <button type="button" disabled={lote.ocupado || ocupada !== null} onClick={() => void unificarTodos()}
              style={{ ...btnStyle('primario'), minHeight: 44, justifySelf: 'start', maxWidth: '100%', whiteSpace: 'normal' }}>
              {lote.ocupado ? 'Unificando…' : `Unificar todos los de nombre distinto (${nombreDistinto})`}
            </button>
          )}
          {lote.siguiente && !lote.ocupado && (
            <button type="button" disabled={ocupada !== null} onClick={() => void unificarTodos(true)}
              style={{ ...btnStyle('secundario'), minHeight: 44, justifySelf: 'start' }}>
              Seguir con los siguientes
            </button>
          )}
          {lote.texto && <p role={lote.error ? 'alert' : 'status'} style={{ ...pMuted, color: lote.error ? 'var(--negative)' : 'var(--muted)' }}>{lote.texto}</p>}
        </div>
      )}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {lista.tarjetas.map((rev) => {
          const aviso = avisos[rev.id]
          const p = rev.propuesta
          const motivo = esMotivoDuplicado(rev.motivo) ? rev.motivo : null
          const duplicado = rev.tipo === 'duplicado_ambiguo'
          const titular = rev.tipo === 'telefono_titular'
          const muchas = rev.tipo === 'telefono_muchas_fichas'
          const enriquecer = rev.tipo === 'enriquecer_ficha'
          return (
            <article key={rev.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 8, minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <Badge tono={rev.tipo === 'propuesta_lead' ? 'info' : 'neutral'}>{ETIQUETA_TIPO_REVISION[rev.tipo] ?? rev.tipo}</Badge>
                {motivo && <Badge tono="neutral">{ETIQUETA_MOTIVO_DUPLICADO[motivo]}</Badge>}
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fecha(rev.creadoEn)}</span>
              </div>
              {duplicado && (
                <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '2px 10px', fontSize: 14 }}>
                  <dt style={{ color: 'var(--muted)' }}>En tu agenda</dt>
                  <dd style={{ margin: 0, overflowWrap: 'anywhere', fontWeight: 600 }}>
                    {p ? ([p.nombre, p.apellidos].filter(Boolean).join(' ') || '(sin nombre)') : rev.propuestaIlegible ? '(no se puede leer)' : '—'}
                  </dd>
                  <dt style={{ color: 'var(--muted)' }}>En el CRM</dt>
                  <dd style={{ margin: 0, overflowWrap: 'anywhere', fontWeight: 600 }}>
                    {rev.clienteId ? <Link href={`/correduria/cliente/${rev.clienteId}`}>{rev.clienteNombre ?? 'abrir ficha'}</Link> : '—'}
                  </dd>
                </dl>
              )}
              {!duplicado && rev.clienteId && (
                <p style={{ margin: 0, fontSize: 14, overflowWrap: 'anywhere' }}>
                  Ficha: <Link href={`/correduria/cliente/${rev.clienteId}`}>{rev.clienteNombre ?? 'abrir ficha'}</Link>
                </p>
              )}
              {titular && (
                <p style={{ margin: 0, fontSize: 14 }}>
                  Varias fichas tienen el MISMO teléfono. ¿De quién es? Esa ficha tendrá el contacto en tu agenda y las demás
                  irán dentro (como empresa y en la nota). Las fichas del CRM no se fusionan.{' '}
                  {(rev.candidatos ?? []).map((c, i) => (
                    <span key={c.id}>{i > 0 ? ' · ' : ''}<Link href={`/correduria/cliente/${c.id}`}>{c.nombre ?? 'abrir ficha'}</Link></span>
                  ))}
                </p>
              )}
              {muchas && (
                <p style={{ margin: 0, fontSize: 14 }}>
                  {(rev.candidatos ?? []).length} fichas tienen el MISMO teléfono (¿centralita o gestoría?). No se combina en un
                  contacto ni se crea ninguno nuevo: cada ficha sigue como estaba. Si alguna tiene mal el teléfono, corrígelo en su ficha.{' '}
                  {(rev.candidatos ?? []).map((c, i) => (
                    <span key={c.id}>{i > 0 ? ' · ' : ''}<Link href={`/correduria/cliente/${c.id}`}>{c.nombre ?? 'abrir ficha'}</Link></span>
                  ))}
                </p>
              )}
              {enriquecer && p && (
                <p style={{ margin: 0, fontSize: 14, overflowWrap: 'anywhere' }}>
                  Tu contacto tiene {rev.campos[0] === 'email' ? 'un correo' : 'un teléfono'} que la ficha no tiene:{' '}
                  <strong>{rev.campos[0] === 'email' ? p.email : p.telefono}</strong>
                </p>
              )}
              {!duplicado && !titular && !muchas && !enriquecer && rev.campos.length > 0 && (
                <p style={pMuted}>Cambiado en Google: {rev.campos.map((c) => ETIQUETA_CAMPO[c] ?? c).join(', ')}</p>
              )}
              {titular || muchas || enriquecer ? null : p ? (
                <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '2px 10px', fontSize: 13 }}>
                  <dt style={{ color: 'var(--muted)' }}>En Google</dt>
                  <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{[p.nombre, p.apellidos].filter(Boolean).join(' ') || '—'}</dd>
                  <dt style={{ color: 'var(--muted)' }}>Teléfono</dt>
                  <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{p.telefono ?? '—'}</dd>
                  <dt style={{ color: 'var(--muted)' }}>Correo</dt>
                  <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{p.email ?? '—'}</dd>
                </dl>
              ) : rev.propuestaIlegible ? (
                <p style={{ ...pMuted, color: 'var(--warning)' }}>No se puede leer lo que había en Google (clave de cifrado).</p>
              ) : null}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {titular && (rev.candidatos ?? []).map((c) => (
                  <button key={c.id} type="button" disabled={ocupada !== null}
                    onClick={() => void resolver(rev, 'elegir_titular', false, c.id)}
                    style={{ ...btnStyle('primario'), minHeight: 44, maxWidth: '100%', whiteSpace: 'normal' }}>
                    {ocupada === rev.id ? 'Guardando…' : `Es de ${c.nombre ?? 'esta ficha'}${c.tipoPersona === 'juridica' ? ' (empresa)' : ''}`}
                  </button>
                ))}
                {accionesPermitidas(rev.tipo, motivo, rev.campos).filter((a) => a !== 'elegir_titular' && (a !== 'usar_como_mote' || !!rev.clienteId)).map((accion) => (
                  <button key={accion} type="button" disabled={ocupada !== null}
                    onClick={() => void resolver(rev, accion)}
                    style={{ ...btnStyle(accion === 'unificar' || accion === 'usar_como_mote' || accion === 'aceptar_lead' || accion === 'anadir_a_ficha' || (accion === 'mantener_crm' && !duplicado) ? 'primario' : 'secundario'), minHeight: 44, maxWidth: '100%', whiteSpace: 'normal' }}>
                    {ocupada === rev.id ? 'Guardando…' : ETIQUETA_ACCION_REVISION[accion]}
                  </button>
                ))}
              </div>
              {aviso && (
                <div role="alert" style={{ display: 'grid', gap: 6 }}>
                  <p style={{ ...pMuted, color: 'var(--negative)' }}>{aviso.texto}</p>
                  {aviso.forzable && (
                    <button type="button" disabled={ocupada !== null} onClick={() => void resolver(rev, 'aceptar_lead', true)}
                      style={{ ...btnStyle('secundario'), minHeight: 44, justifySelf: 'start' }}>
                      Crear el lead igualmente
                    </button>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
      {hayMas(lista) && (
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          <button type="button" onClick={() => void verMas()} disabled={masCargando}
            style={{ ...btnStyle('secundario'), minHeight: 44, justifySelf: 'start' }}>
            {masCargando ? 'Cargando…' : 'Ver más'}
          </button>
          {errorMas && <p role="alert" style={{ ...pMuted, color: 'var(--negative)' }}>{errorMas}</p>}
        </div>
      )}
    </Bloque>
  )
}
