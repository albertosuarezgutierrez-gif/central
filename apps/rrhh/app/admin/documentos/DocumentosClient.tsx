'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { carpetaAdmiteFirma } from '@/lib/envio-staging'
import Page from '@/components/ui/Page'

type Opcion = { id: string; etiqueta: string }
type Categoria = Opcion & { carpeta: string }
type Empleado = { id: string; nombre: string; apellidos: string | null; dni: string | null; estado: string }
type Firma = 'none' | 'solo_empleado' | 'empresa_y_empleado'
type Analisis = {
  motivo: 'ok' | 'sin_texto' | 'no_pdf' | 'ia_no_configurada' | 'ia_error'
  propuesta: { categoria: string | null; carpeta: string | null; titulo: string | null; requiere_firma: boolean | null; resumen: string | null }
  destinatarios: { empleado_id: string; motivo: 'nif' | 'nombre'; nombre: string }[]
  /** Aparecen en el texto pero la IA no los marca como trabajador: NO se preseleccionan. */
  a_revisar?: { empleado_id: string; motivo: 'nif' | 'nombre'; nombre: string }[]
  sin_emparejar: { nombre: string | null; nif: string | null; motivo: 'no_en_plantilla' | 'ambiguo' }[]
}
type Form = {
  titulo: string; categoria: string; carpeta: string; resumen: string; firma: Firma; avisar: boolean
  destinatarios: string[]; toda_plantilla: boolean
}
type Resultado = { total: number; ok: number; resultados: { empleado_id: string; doc_id?: string; error?: string; ya_enviado?: boolean; aviso?: { email_estado: string } | null }[] }
type Item = {
  /** `envio_id`: idempotencia del envío en servidor (reintentar no duplica copias). */
  id: string; envio_id: string; nombre: string; tipo: string | null; tamano: number
  fase: 'subiendo' | 'analizando' | 'listo' | 'enviando' | 'enviado' | 'error'
  path?: string; analisis?: Analisis; form: Form; error?: string; resultado?: Resultado
}

const BTN_SEC = 'min-h-[44px] bg-paper-2 text-ink-2 border border-line hover:bg-line'
const MOTIVO: Record<Analisis['motivo'], string> = {
  ok: '',
  sin_texto: 'No se pudo leer texto del PDF (¿escaneado?): rellena los datos a mano.',
  no_pdf: 'La IA solo lee PDF: rellena los datos a mano.',
  ia_no_configurada: 'La IA no está configurada: solo se han buscado DNI/nombres de la plantilla en el texto.',
  ia_error: 'La IA no respondió bien: revisa y completa los campos vacíos.',
}

const formVacio = (nombre: string): Form => ({
  titulo: nombre.replace(/\.[a-z0-9]{1,8}$/i, ''), categoria: '', carpeta: '', resumen: '', firma: 'none', avisar: true,
  destinatarios: [], toda_plantilla: false,
})

function nombreEmp(e: Empleado) { return [e.nombre, e.apellidos].filter(Boolean).join(' ') }
function norm(s: string) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }

export default function DocumentosClient({ carpetas, categorias }: {
  carpetas: Opcion[]; categorias: Categoria[]
}) {
  const [items, setItems] = useState<Item[]>([])
  const [empleados, setEmpleados] = useState<Empleado[] | null>(null)
  const [enviandoTodo, setEnviandoTodo] = useState(false)
  // Documentos con una petición de envío en vuelo: ni doble clic ni tarjeta + «Enviar todo» a la vez.
  const enVuelo = useRef(new Set<string>())

  useEffect(() => {
    fetch('/api/admin/empleados').then(r => r.ok ? r.json() : { empleados: [] })
      .then(j => setEmpleados((j.empleados ?? []).map((e: any) => ({ id: e.id, nombre: e.nombre, apellidos: e.apellidos ?? null, dni: e.dni ?? null, estado: e.estado ?? 'activo' }))))
      .catch(() => setEmpleados([]))
  }, [])
  const activos = useMemo(() => (empleados ?? []).filter(e => e.estado === 'activo'), [empleados])

  const set = (id: string, p: Partial<Item>) => setItems(xs => xs.map(x => x.id === id ? { ...x, ...p } : x))
  const setForm = (id: string, p: Partial<Form>) => setItems(xs => xs.map(x => x.id === id ? { ...x, form: { ...x.form, ...p } } : x))

  async function procesar(file: File) {
    const id = crypto.randomUUID()
    setItems(xs => [...xs, { id, envio_id: crypto.randomUUID(), nombre: file.name, tipo: file.type || null, tamano: file.size, fase: 'subiendo', form: formVacio(file.name) }])
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch('/api/admin/documentos/staging', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { set(id, { fase: 'error', error: j.error ?? (r.status === 413 ? 'Archivo demasiado grande (máx. ~4 MB)' : 'No se pudo subir') }); return }
      set(id, { path: j.path, fase: 'analizando' })
      const ra = await fetch('/api/admin/documentos/analizar', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: j.path, nombre: file.name }),
      })
      const a: Analisis | null = ra.ok ? await ra.json().catch(() => null) : null
      if (!a) { set(id, { fase: 'listo', analisis: { motivo: 'ia_error', propuesta: { categoria: null, carpeta: null, titulo: null, requiere_firma: null, resumen: null }, destinatarios: [], sin_emparejar: [] } }); return }
      // Prellenado: solo lo que la IA SÍ propone; lo demás queda vacío para que Pilar lo complete.
      // Destinatarios: solo los que la IA identifica como trabajador (`destinatarios`); los de
      // `a_revisar` (p. ej. el representante de la empresa) se muestran sin marcar.
      const carpeta = a.propuesta.carpeta ?? ''
      setItems(xs => xs.map(x => x.id !== id ? x : {
        ...x, fase: 'listo', analisis: a,
        form: {
          ...x.form,
          titulo: a.propuesta.titulo ?? x.form.titulo,
          categoria: a.propuesta.categoria ?? '',
          carpeta,
          resumen: a.propuesta.resumen ?? '',
          firma: a.propuesta.requiere_firma === true && carpetaAdmiteFirma(carpeta) ? 'solo_empleado' : 'none',
          destinatarios: a.destinatarios.map(d => d.empleado_id),
        },
      }))
    } catch {
      set(id, { fase: 'error', error: 'Error de red' })
    }
  }

  async function quitar(it: Item) {
    if (it.fase === 'subiendo') return // la subida en curso dejaría el staging huérfano
    if (it.path && it.fase !== 'enviado') fetch(`/api/admin/documentos/staging?path=${encodeURIComponent(it.path)}`, { method: 'DELETE' }).catch(() => {})
    setItems(xs => xs.filter(x => x.id !== it.id))
  }

  function valido(it: Item): string | null {
    if (!it.path) return 'Falta subir el archivo'
    if (!it.form.titulo.trim()) return 'Pon un título'
    if (!it.form.carpeta) return 'Elige carpeta'
    if (it.form.firma !== 'none' && !carpetaAdmiteFirma(it.form.carpeta)) return 'En esta carpeta no se pide firma'
    if (!it.form.toda_plantilla && it.form.destinatarios.length === 0) return 'Elige al menos un empleado'
    return null
  }

  async function enviar(it: Item, soloIds?: string[]): Promise<boolean> {
    if (enVuelo.current.has(it.id)) return false
    const err = valido(it)
    if (err) { set(it.id, { error: err }); return false }
    enVuelo.current.add(it.id)
    try { return await enviarUna(it, soloIds) } finally { enVuelo.current.delete(it.id) }
  }

  async function enviarUna(it: Item, soloIds?: string[]): Promise<boolean> {
    set(it.id, { fase: 'enviando', error: undefined })
    const toda = !soloIds && it.form.toda_plantilla
    const r = await fetch('/api/admin/documentos/asignar', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        path: it.path, nombre_original: it.nombre, envio_id: it.envio_id,
        titulo: it.form.titulo, categoria: it.form.categoria || null, carpeta: it.form.carpeta, resumen: it.form.resumen || null,
        firma: it.form.firma, avisar: it.form.avisar,
        toda_plantilla: toda, empleado_ids: toda ? [] : (soloIds ?? it.form.destinatarios),
      }),
    }).catch(() => null)
    const j = r ? await r.json().catch(() => null) : null
    if (!r || (!r.ok && !j?.resultados)) { set(it.id, { fase: 'listo', error: j?.error ?? 'Error de red' }); return false }
    // 2xx sin JSON válido: no se sabe si se envió. Nunca «enviado»; reintentar es seguro (idempotente por envio_id).
    if (!j || typeof j.ok !== 'number' || typeof j.total !== 'number' || !Array.isArray(j.resultados)) {
      set(it.id, { fase: 'listo', error: 'Respuesta ilegible del servidor: no se sabe si se envió. Pulsa Enviar de nuevo (no duplica).' }); return false
    }
    const prev = it.resultado
    const resultado: Resultado = prev && soloIds
      ? { total: prev.total, ok: prev.ok + j.ok, resultados: [...prev.resultados.filter(x => x.doc_id), ...j.resultados] }
      : j
    set(it.id, { fase: resultado.ok === resultado.total ? 'enviado' : 'listo', resultado })
    return resultado.ok === resultado.total
  }

  // «Enviar todo» solo coge lo que NUNCA se ha enviado: lo enviado a medias (con `resultado`) se
  // reintenta desde su tarjeta («Reintentar los que fallaron»), no se reenvía entero.
  const pendientesDeEnvio = (xs: Item[]) => xs.filter(i => i.fase === 'listo' && !i.resultado && !enVuelo.current.has(i.id))

  async function enviarTodo() {
    if (enviandoTodo) return
    const listos = pendientesDeEnvio(items)
    const masivos = listos.filter(i => i.form.toda_plantilla).length
    if (masivos && !confirm(`${masivos === 1 ? 'Un documento irá' : `${masivos} documentos irán`} a TODA la plantilla activa (${activos.length} empleados). ¿Continuar?`)) return
    setEnviandoTodo(true)
    for (const it of listos) await enviar(it)
    setEnviandoTodo(false)
  }

  const listos = pendientesDeEnvio(items).length

  return (
    <Page
      titulo="Enviar documentos"
      subtitulo={<>Sube uno o varios documentos. La IA propone el tipo, la carpeta, el título, si requiere firma, un resumen para el
        empleado y a quién va (por DNI o nombre completo). Revisa y corrige: <b>nada se asigna ni se avisa hasta que confirmes</b>.</>}
    >

      <label className="mb-4 block rounded-card border border-dashed border-line bg-card p-4 text-center text-sm">
        <span className="font-medium text-accent">Elegir archivos</span> <span className="text-ink-3">(PDF recomendado, máx. ~4 MB cada uno)</span>
        <input type="file" multiple className="mt-2 block w-full" accept=".pdf,application/pdf,image/*,.doc,.docx"
          onChange={e => { const fs = Array.from(e.target.files ?? []); fs.forEach(procesar); e.currentTarget.value = '' }} />
      </label>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:[&>section:only-child]:col-span-2">
        {items.map(it => (
          <TarjetaDocumento key={it.id} it={it} carpetas={carpetas} categorias={categorias} empleados={activos}
            cargandoEmpleados={empleados === null} ocupado={enviandoTodo}
            onForm={p => setForm(it.id, p)} onQuitar={() => quitar(it)} onEnviar={() => enviar(it)}
            onReintentar={ids => enviar(it, ids)} />
        ))}
      </div>

      {listos > 1 && (
        <div className="sticky bottom-0 mt-4 border-t border-line bg-paper py-3">
          <button type="button" disabled={enviandoTodo} onClick={enviarTodo} className="min-h-[44px] w-full px-4 sm:w-auto">
            {enviandoTodo ? 'Enviando…' : `Confirmar y enviar los ${listos} documentos`}
          </button>
        </div>
      )}
    </Page>
  )
}

function TarjetaDocumento({ it, carpetas, categorias, empleados, cargandoEmpleados, ocupado, onForm, onQuitar, onEnviar, onReintentar }: {
  it: Item; carpetas: Opcion[]; categorias: Categoria[]; empleados: Empleado[]; cargandoEmpleados: boolean
  /** Hay un «Enviar todo» en curso: las acciones de la tarjeta quedan bloqueadas. */
  ocupado: boolean
  onForm: (p: Partial<Form>) => void; onQuitar: () => void; onEnviar: () => void; onReintentar: (ids: string[]) => void
}) {
  const [buscar, setBuscar] = useState('')
  const [verN, setVerN] = useState(50)
  const f = it.form
  const a = it.analisis
  const porId = useMemo(() => new Map(empleados.map(e => [e.id, e])), [empleados])
  const motivoDe = useMemo(() => new Map([...(a?.destinatarios ?? []), ...(a?.a_revisar ?? [])].map(d => [d.empleado_id, d.motivo])), [a])
  const revisar = (a?.a_revisar ?? []).filter(d => !f.destinatarios.includes(d.empleado_id) && porId.has(d.empleado_id))
  const admiteFirma = carpetaAdmiteFirma(f.carpeta)
  const filtrados = useMemo(() => {
    const q = norm(buscar.trim())
    const base = empleados.filter(e => !f.destinatarios.includes(e.id))
    return q ? base.filter(e => norm(`${nombreEmp(e)} ${e.dni ?? ''}`).includes(q)) : base
  }, [buscar, empleados, f.destinatarios])
  const bloqueado = ocupado || it.fase === 'enviando' || it.fase === 'enviado'
  const fallidos = it.resultado?.resultados.filter(r => r.error).map(r => r.empleado_id) ?? []
  const sinEmail = it.resultado?.resultados.filter(r => r.aviso && r.aviso.email_estado !== 'enviado').length ?? 0

  return (
    <section className="min-w-0 rounded-card border border-line bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 break-all text-sm font-medium">{it.nombre}</p>
        <span className="text-xs text-ink-3">
          {it.fase === 'subiendo' ? 'Subiendo…' : it.fase === 'analizando' ? 'La IA está leyendo el documento…' : it.fase === 'enviando' ? 'Enviando…' : it.fase === 'enviado' ? '✔ Enviado' : ''}
        </span>
        {!bloqueado && it.fase !== 'subiendo' && <button type="button" onClick={onQuitar} className="min-h-[44px] bg-transparent px-2 text-xs text-ink-3 underline">Quitar</button>}
      </div>
      {it.error && <p className="mb-2 text-sm text-alert">{it.error}</p>}
      {a && MOTIVO[a.motivo] && <p className="mb-2 rounded-lg bg-paper-2 px-3 py-2 text-xs text-ink-2">{MOTIVO[a.motivo]}</p>}

      {(it.fase === 'listo' || it.fase === 'enviando') && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-ink-2 sm:col-span-2">
            Título (lo que verá el empleado)
            <input value={f.titulo} onChange={e => onForm({ titulo: e.target.value })} disabled={bloqueado} className="text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            Tipo de documento {a && !a.propuesta.categoria && <span className="text-warn">(la IA no lo sabe)</span>}
            <select value={f.categoria} disabled={bloqueado} className="text-sm" onChange={e => {
              const c = categorias.find(x => x.id === e.target.value)
              const carpeta = c && !f.carpeta ? c.carpeta : f.carpeta
              onForm({ categoria: e.target.value, carpeta, ...(!carpetaAdmiteFirma(carpeta) ? { firma: 'none' as Firma } : {}) })
            }}>
              <option value="">— Sin clasificar —</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            Carpeta del expediente
            <select value={f.carpeta} disabled={bloqueado} className="text-sm"
              onChange={e => onForm({ carpeta: e.target.value, ...(!carpetaAdmiteFirma(e.target.value) ? { firma: 'none' as Firma } : {}) })}>
              <option value="">— Elige carpeta —</option>
              {carpetas.map(c => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            Firma {admiteFirma && a && a.propuesta.requiere_firma == null && <span className="text-warn">(la IA no sabe si requiere firma)</span>}
            {admiteFirma
              ? (
                <select value={f.firma} onChange={e => onForm({ firma: e.target.value as Firma })} disabled={bloqueado} className="text-sm">
                  <option value="none">Sin firma</option>
                  <option value="solo_empleado">Solo firma el empleado</option>
                  <option value="empresa_y_empleado">Firma empresa y empleado</option>
                </select>
              )
              : <span className="text-sm text-ink-3">Sin firma (en esta carpeta no se pide firma)</span>}
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={f.avisar} onChange={e => onForm({ avisar: e.target.checked })} disabled={bloqueado} />
            Avisar al empleado (intranet, email y push){f.firma === 'empresa_y_empleado' ? ' — al firmar la empresa' : ''}
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-2 sm:col-span-2">
            Resumen para el empleado (opcional)
            <textarea value={f.resumen} onChange={e => onForm({ resumen: e.target.value })} disabled={bloqueado} rows={2} maxLength={600} className="text-sm" />
          </label>

          <div className="sm:col-span-2">
            <p className="mb-1 text-xs text-ink-2">Destinatarios</p>
            <label className="mb-2 flex min-h-[44px] items-center gap-2 text-sm">
              <input type="checkbox" checked={f.toda_plantilla} onChange={e => onForm({ toda_plantilla: e.target.checked })} disabled={bloqueado} />
              Toda la plantilla activa ({empleados.length})
            </label>
            {!f.toda_plantilla && (
              <>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {f.destinatarios.map(id => {
                    const e = porId.get(id); const m = motivoDe.get(id)
                    return (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-xs text-accent-ink">
                        {e ? nombreEmp(e) : id.slice(0, 8)}{m && <span className="opacity-70">· IA por {m === 'nif' ? 'DNI' : 'nombre'}</span>}
                        {!bloqueado && it.fase !== 'subiendo' && <button type="button" aria-label="Quitar" onClick={() => onForm({ destinatarios: f.destinatarios.filter(x => x !== id) })}
                          className="min-h-[28px] bg-transparent px-1 text-accent-ink">×</button>}
                      </span>
                    )
                  })}
                  {f.destinatarios.length === 0 && <span className="text-xs text-ink-3">Ninguno elegido{a ? ' (la IA no identificó a nadie con seguridad)' : ''}</span>}
                </div>
                {revisar.length > 0 && (
                  <div className="mb-2 rounded-lg border border-line px-3 py-2 text-xs text-warn">
                    <p className="mb-1">Revisa a mano: aparecen en el documento pero la IA no los identifica como destinatarios (¿representante de la empresa, testigo…?). No están marcados.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {revisar.map(d => (
                        <button key={d.empleado_id} type="button" disabled={bloqueado}
                          onClick={() => onForm({ destinatarios: [...f.destinatarios, d.empleado_id] })}
                          className={`${BTN_SEC} px-2 text-xs`}>
                          + {d.nombre} <span className="opacity-70">· por {d.motivo === 'nif' ? 'DNI' : 'nombre'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {a && a.sin_emparejar.length > 0 && (
                  <p className="mb-2 text-xs text-warn">
                    Revisa a mano: {a.sin_emparejar.map(s => `${s.nombre ?? s.nif}${s.motivo === 'ambiguo' ? ' (coincide con varias fichas o con otro DNI)' : ' (no está en la plantilla)'}`).join('; ')}
                  </p>
                )}
                {!bloqueado && (
                  <>
                    <input value={buscar} onChange={e => { setBuscar(e.target.value); setVerN(50) }} placeholder={cargandoEmpleados ? 'Cargando empleados…' : 'Buscar empleado por nombre o DNI'} className="mb-1 w-full text-sm" />
                    <ul className="grid max-h-56 grid-cols-1 overflow-y-auto rounded-lg border border-line xl:grid-cols-2 2xl:grid-cols-3">
                      {filtrados.slice(0, verN).map(e => (
                        <li key={e.id}>
                          <button type="button" onClick={() => onForm({ destinatarios: [...f.destinatarios, e.id] })}
                            className="flex min-h-[44px] w-full items-center justify-between gap-2 bg-transparent px-3 text-left text-sm text-ink hover:bg-paper-2">
                            <span className="min-w-0 truncate">{nombreEmp(e)}</span><span className="shrink-0 text-xs text-ink-3">{e.dni ?? ''}</span>
                          </button>
                        </li>
                      ))}
                      {filtrados.length > verN && (
                        <li className="col-span-full"><button type="button" onClick={() => setVerN(n => n + 50)} className={`${BTN_SEC} w-full text-xs`}>Ver más ({filtrados.length - verN})</button></li>
                      )}
                      {filtrados.length === 0 && !cargandoEmpleados && <li className="col-span-full px-3 py-2 text-xs text-ink-3">Sin resultados</li>}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {it.resultado && (
        <p className="mt-2 text-sm">
          {it.resultado.ok} de {it.resultado.total} copias creadas{sinEmail > 0 ? ` · ${sinEmail} sin email enviado (lo verás en Firmas pendientes)` : ''}.
          {fallidos.length > 0 && <span className="text-alert"> {fallidos.length} fallaron.</span>}
        </p>
      )}
      {it.fase === 'listo' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {fallidos.length > 0
            ? <button type="button" disabled={ocupado} onClick={() => onReintentar(fallidos)} className="min-h-[44px] px-4">Reintentar los {fallidos.length} que fallaron</button>
            : <button type="button" disabled={ocupado} onClick={() => {
                if (f.toda_plantilla && !confirm(`Se enviará a TODA la plantilla activa (${empleados.length} empleados). ¿Continuar?`)) return
                onEnviar()
              }} className="min-h-[44px] px-4">Confirmar y enviar</button>}
        </div>
      )}
    </section>
  )
}
