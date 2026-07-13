'use client'
import { useState } from 'react'
import ChatPanel from '@/components/ChatPanel'
import AdminShell from '@/components/AdminShell'

type Carpeta = { id: string; etiqueta: string }
type Doc = { id: string; carpeta: string; nombre: string; subido_por: string; estado_firma: string; creada_at: string; url: string | null }
type Plantilla = { id: string; titulo: string; version: string }
type Empleado = {
  id: string; nombre: string; apellidos: string | null; email: string | null; puesto: string | null
  dni: string | null; nss: string | null; telefono: string | null; estado: string
  domicilio: string | null; localidad: string | null; provincia: string | null
  fecha_nacimiento: string | null; estado_civil: string | null
  tipo_contrato: string | null; centro_trabajo: string | null
  cuenta_cotizacion: string | null; categoria: string | null
  grupo_cotizacion: string | null; tipo_jornada: string | null
  fecha_alta: string | null; acceso_token: string | null
  fecha_reconocimiento_medico: string | null
}

const FIRMA: Record<string, { txt: string; cls: string }> = {
  pendiente: { txt: 'Pendiente de firma', cls: 'text-alert' },
  firmado: { txt: '✔ Firmado', cls: 'text-ok' },
}

function toDateInput(iso: string | null) {
  if (!iso) return ''
  return iso.slice(0, 10)
}

export default function ExpedienteClient({ empleado, carpetas, inicial, plantillas, logoUrl, nombreEmpresa, colorPrimario }: { empleado: Empleado; carpetas: Carpeta[]; inicial: Doc[]; plantillas: Plantilla[]; logoUrl?: string | null; nombreEmpresa?: string | null; colorPrimario?: string | null }) {
  const [docs, setDocs] = useState<Doc[]>(inicial)
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [plantilla, setPlantilla] = useState(plantillas[0]?.id ?? '')
  const [generando, setGenerando] = useState(false)

  const [ficha, setFicha] = useState({
    apellidos: empleado.apellidos ?? '',
    nombre: empleado.nombre,
    email: empleado.email ?? '',
    telefono: empleado.telefono ?? '',
    dni: empleado.dni ?? '',
    nss: empleado.nss ?? '',
    puesto: empleado.puesto ?? '',
    estado: empleado.estado ?? 'activo',
    domicilio: empleado.domicilio ?? '',
    localidad: empleado.localidad ?? '',
    provincia: empleado.provincia ?? '',
    fecha_nacimiento: toDateInput(empleado.fecha_nacimiento),
    estado_civil: empleado.estado_civil ?? '',
    tipo_contrato: empleado.tipo_contrato ?? '',
    centro_trabajo: empleado.centro_trabajo ?? '',
    cuenta_cotizacion: empleado.cuenta_cotizacion ?? '',
    categoria: empleado.categoria ?? '',
    grupo_cotizacion: empleado.grupo_cotizacion ?? '',
    tipo_jornada: empleado.tipo_jornada ?? '',
    fecha_alta: toDateInput(empleado.fecha_alta),
    fecha_reconocimiento_medico: toDateInput(empleado.fecha_reconocimiento_medico),
  })
  const [fichaGuardando, setFichaGuardando] = useState(false)
  const [fichaMsg, setFichaMsg] = useState('')
  const [accesoToken, setAccesoToken] = useState(empleado.acceso_token ?? '')
  const [regenerando, setRegenerando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  async function guardarFicha() {
    setFichaGuardando(true); setFichaMsg('')
    const r = await fetch(`/api/admin/empleados/${empleado.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ficha),
    })
    setFichaGuardando(false)
    if (r.ok) setFichaMsg('Guardado')
    else setFichaMsg((await r.json()).error ?? 'Error al guardar')
  }

  async function recargar() {
    const r = await fetch(`/api/admin/empleados/${empleado.id}/documentos`)
    if (r.ok) setDocs((await r.json()).documentos)
  }

  async function generar() {
    if (!plantilla) return
    setGenerando(true); setError('')
    const r = await fetch(`/api/admin/empleados/${empleado.id}/documentos/generar`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plantilla }),
    })
    if (r.ok) await recargar(); else setError((await r.json()).error ?? 'Error al generar')
    setGenerando(false)
  }

  async function subir(carpeta: string, file: File) {
    setSubiendo(carpeta); setError('')
    try {
      const fd = new FormData(); fd.set('carpeta', carpeta); fd.set('file', file)
      const r = await fetch(`/api/admin/empleados/${empleado.id}/documentos`, { method: 'POST', body: fd })
      if (r.ok) await recargar()
      else {
        const body = await r.json().catch(() => ({}))
        setError(body.error ?? 'Error al subir')
      }
    } catch {
      setError('Error de red al subir el archivo. Inténtalo de nuevo.')
    } finally {
      setSubiendo(null)
    }
  }

  async function borrar(docId: string) {
    if (!confirm('¿Borrar este documento?')) return
    const r = await fetch(`/api/admin/empleados/${empleado.id}/documentos/${docId}`, { method: 'DELETE' })
    if (r.ok) await recargar()
  }

  async function solicitarFirma(docId: string) {
    setError('')
    const r = await fetch(`/api/admin/empleados/${empleado.id}/documentos/${docId}/solicitar-firma`, { method: 'POST' })
    if (r.ok) await recargar(); else setError((await r.json()).error ?? 'Error')
  }

  function enlaceAcceso() {
    return typeof window !== 'undefined' ? `${window.location.origin}/e/${accesoToken}` : ''
  }

  async function copiarEnlace() {
    await navigator.clipboard.writeText(enlaceAcceso())
    setCopiado(true); setTimeout(() => setCopiado(false), 2000)
  }

  async function regenerarToken() {
    if (!confirm('¿Regenerar el enlace? El anterior dejará de funcionar.')) return
    setRegenerando(true)
    const r = await fetch(`/api/admin/empleados/${empleado.id}/acceso`, { method: 'POST' })
    if (r.ok) setAccesoToken((await r.json()).acceso_token)
    setRegenerando(false)
  }

  const f = (k: keyof typeof ficha) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFicha(s => ({ ...s, [k]: ev.target.value }))

  return (
    <AdminShell activo="empleados" logoUrl={logoUrl} nombreEmpresa={nombreEmpresa} colorPrimario={colorPrimario}>
      {/* Nav */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <a href="/admin/empleados" className="text-ink-3 text-sm no-underline hover:text-accent">← Empleados</a>
        <a href={`/admin/empleados/${empleado.id}/contrato`} className="text-sm text-accent no-underline hover:underline">Contrato laboral →</a>
      </div>

      {/* Ficha */}
      <div className="mb-4 rounded-[12px] border border-line bg-card">
        {/* Cabecera de ficha */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-lg font-bold text-accent-ink">
            {(ficha.apellidos || ficha.nombre).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-ink">
              {ficha.apellidos ? `${ficha.apellidos}, ${ficha.nombre}` : ficha.nombre || '—'}
            </p>
            <p className="text-sm text-ink-3">{[ficha.puesto, ficha.estado !== 'activo' ? ficha.estado : null].filter(Boolean).join(' · ') || 'Sin puesto'}</p>
          </div>
        </div>

        <div className="p-4">
          {/* Sección: Datos de contacto */}
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-3">Datos de contacto</h2>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Apellidos
              <input value={ficha.apellidos} onChange={f('apellidos')} placeholder="Primer apellido Segundo apellido" className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Nombre
              <input value={ficha.nombre} onChange={f('nombre')} placeholder="Nombre de pila" className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Email
              <input type="email" value={ficha.email} onChange={f('email')} placeholder="correo@ejemplo.com" className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Móvil / Teléfono
              <input value={ficha.telefono} onChange={f('telefono')} placeholder="6XX XXX XXX" className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Domicilio
              <input value={ficha.domicilio} onChange={f('domicilio')} placeholder="Calle, número, piso…" className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Localidad
              <input value={ficha.localidad} onChange={f('localidad')} placeholder="Localidad" className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Provincia
              <input value={ficha.provincia} onChange={f('provincia')} placeholder="Provincia" className="text-sm" />
            </label>
          </div>

          {/* Sección: Datos personales */}
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-3">Datos personales</h2>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              NIF / DNI
              <input value={ficha.dni} onChange={f('dni')} placeholder="12345678A" className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Nº Seguridad Social
              <input value={ficha.nss} onChange={f('nss')} placeholder="XXXXXXXXXXX" className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Fecha de nacimiento
              <input type="date" value={ficha.fecha_nacimiento} onChange={f('fecha_nacimiento')} className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Estado civil
              <select value={ficha.estado_civil} onChange={f('estado_civil')} className="text-sm">
                <option value="">— Sin especificar —</option>
                <option value="soltero">Soltero/a</option>
                <option value="casado">Casado/a</option>
                <option value="divorciado">Divorciado/a</option>
                <option value="viudo">Viudo/a</option>
                <option value="pareja_hecho">Pareja de hecho</option>
              </select>
            </label>
          </div>

          {/* Sección: Datos laborales */}
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-3">Datos laborales</h2>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Puesto
              <input value={ficha.puesto} onChange={f('puesto')} placeholder="Camarero/a, Recepcionista…" className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Centro de trabajo
              <input value={ficha.centro_trabajo} onChange={f('centro_trabajo')} placeholder="Nombre del centro…" className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Fecha de antigüedad
              <input type="date" value={ficha.fecha_alta} onChange={f('fecha_alta')} className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Tipo de contrato
              <input value={ficha.tipo_contrato} onChange={f('tipo_contrato')} placeholder="Indefinido, temporal…" className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Tipo de jornada
              <input value={ficha.tipo_jornada} onChange={f('tipo_jornada')} placeholder="Completa, parcial…" className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Categoría
              <input value={ficha.categoria} onChange={f('categoria')} placeholder="Categoría profesional" className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Grupo de cotización
              <input value={ficha.grupo_cotizacion} onChange={f('grupo_cotizacion')} placeholder="1 – 11" className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Reconocimiento médico
              <input type="date" value={ficha.fecha_reconocimiento_medico} onChange={f('fecha_reconocimiento_medico')} className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Estado
              <select value={ficha.estado} onChange={f('estado')} className="text-sm">
                <option value="activo">Activo</option>
                <option value="baja">Baja</option>
              </select>
            </label>
          </div>

          {/* Guardar ficha */}
          <div className="flex items-center gap-3">
            <button onClick={guardarFicha} disabled={fichaGuardando || (!ficha.nombre.trim() && !ficha.apellidos.trim())}>
              {fichaGuardando ? 'Guardando…' : 'Guardar ficha'}
            </button>
            {fichaMsg && (
              <span className={`text-sm ${fichaMsg === 'Guardado' ? 'text-ok' : 'text-alert'}`}>{fichaMsg}</span>
            )}
          </div>
        </div>
      </div>

      {/* Acceso al portal */}
      {accesoToken && (
        <div className="mb-4 rounded-[12px] border border-line bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-3">Acceso al portal del empleado</h2>
          <p className="mb-3 break-all rounded bg-paper-2 px-3 py-2 font-mono text-xs text-ink-2">
            {typeof window !== 'undefined' ? `${window.location.origin}/e/${accesoToken}` : `/e/${accesoToken}`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={copiarEnlace} className="text-sm">
              {copiado ? '✔ Copiado' : 'Copiar enlace'}
            </button>
            <button onClick={regenerarToken} disabled={regenerando} className="bg-paper-2 text-sm text-ink-2 hover:bg-line">
              {regenerando ? 'Regenerando…' : 'Nuevo enlace'}
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-3">Envía este enlace al empleado para que acceda a su portal. Al generar uno nuevo el anterior deja de funcionar.</p>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-alert">{error}</p>}

      {/* Chat */}
      <ChatPanel endpoint={`/api/admin/empleados/${empleado.id}/chat`} yo="gestor" />

      {/* Generar documento */}
      <section className="my-3 rounded-[12px] border border-line bg-card p-4">
        <h2 className="mb-2 text-base">Generar documento legal</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={plantilla} onChange={e => setPlantilla(e.target.value)}>
            {plantillas.map(p => <option key={p.id} value={p.id}>{p.titulo} (v{p.version})</option>)}
          </select>
          <button onClick={generar} disabled={generando || !plantilla}>{generando ? 'Generando…' : 'Generar'}</button>
        </div>
        <p className="mt-1 text-xs text-ink-3">Se añade al expediente como documento; luego pulsa «Solicitar firma».</p>
      </section>

      {/* Expediente: carpetas */}
      {carpetas.map(c => {
        const dc = docs.filter(d => d.carpeta === c.id)
        return (
          <section key={c.id} className="my-3 rounded-[12px] border border-line bg-card p-4">
            <h2 className="mb-2 text-base">{c.etiqueta} <span className="text-ink-3">({dc.length})</span></h2>
            <ul className="mb-3 grid gap-2">
              {dc.map(d => (
                <li key={d.id} className="flex flex-wrap items-start gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    {d.url
                      ? <a href={d.url} target="_blank" rel="noreferrer" className="text-accent no-underline hover:underline break-all">{d.nombre}</a>
                      : <span className="break-all">{d.nombre}</span>}
                    <span className="ml-1 text-xs text-ink-3">· {d.subido_por}</span>
                    {FIRMA[d.estado_firma] && <span className={`ml-1 text-xs font-semibold ${FIRMA[d.estado_firma].cls}`}>· {FIRMA[d.estado_firma].txt}</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {d.estado_firma === 'firmado' && (
                      <a href={`/v/${d.id}`} target="_blank" rel="noreferrer" className="px-2 py-1 text-xs text-accent no-underline hover:underline">Verificar</a>
                    )}
                    {d.estado_firma === 'no_requiere' && (
                      <button onClick={() => solicitarFirma(d.id)} className="bg-paper-2 px-2 py-1 text-xs text-accent-ink hover:bg-line">Solicitar firma</button>
                    )}
                    <button onClick={() => borrar(d.id)} className="bg-transparent px-2 py-1 text-xs text-alert hover:bg-paper-2">Borrar</button>
                  </div>
                </li>
              ))}
              {dc.length === 0 && <li className="text-sm text-ink-3">Sin documentos</li>}
            </ul>
            <label className="text-sm text-ink-2">
              {subiendo === c.id ? 'Subiendo… ' : 'Subir documento: '}
              <input type="file" disabled={subiendo === c.id}
                onChange={e => { const f = e.target.files?.[0]; if (f) subir(c.id, f); e.currentTarget.value = '' }} />
            </label>
          </section>
        )
      })}
    </AdminShell>
  )
}
