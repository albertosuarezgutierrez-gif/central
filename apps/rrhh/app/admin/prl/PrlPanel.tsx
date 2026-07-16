'use client'
import { useState } from 'react'

type Empleado = {
  id: string
  nombre: string
  apellidos: string | null
  dni: string | null
  puesto: string | null
  centro_trabajo: string | null
}

type Equipo = 'pemp' | 'dumper' | 'carretilla' | 'telescopica' | 'herramientas_electricas' | 'otros'

type EpiId = 'casco' | 'calzado' | 'gafas' | 'guantes' | 'alta_visibilidad' | 'auditiva' | 'mascarilla' | 'arnes'

const EQUIPOS: { id: Equipo; label: string }[] = [
  { id: 'pemp', label: 'Plataforma Elevadora Móvil (PEMP)' },
  { id: 'dumper', label: 'Dúmper / Maquinaria de Movimiento de Tierras' },
  { id: 'carretilla', label: 'Carretilla Elevadora' },
  { id: 'telescopica', label: 'Manipuladora Telescópica' },
  { id: 'herramientas_electricas', label: 'Herramientas Eléctricas Portátiles' },
  { id: 'otros', label: 'Otros (especificar)' },
]

const DOCUMENTOS: { id: string; titulo: string; descripcion: string; icono: string; disabled?: boolean }[] = [
  {
    id: 'autorizacion_maquinaria',
    titulo: 'Autorización uso de maquinaria',
    descripcion: 'Art. 17 LPRL y RD 1215/1997. Autoriza al trabajador a operar maquinaria y equipos de trabajo específicos.',
    icono: '🏗️',
  },
  {
    id: 'entrega_epis',
    titulo: 'Entrega de EPIs',
    descripcion: 'RD 773/1997 · LPRL art. 17. Recibo de entrega e información de equipos de protección individual.',
    icono: '🦺',
  },
  {
    id: 'informacion_riesgos',
    titulo: 'Información de riesgos (art. 18)',
    descripcion: 'LPRL art. 18. Ficha de información de riesgos laborales y medidas preventivas de la obra.',
    icono: '⚠️',
  },
  {
    id: 'acuerdo_con_acceso',
    titulo: 'Acuerdo de confidencialidad con acceso a datos',
    descripcion: 'RGPD art. 29 · LOPDGDD art. 5. Para empleados que tratan datos personales.',
    icono: '🔐',
  },
  {
    id: 'acuerdo_sin_acceso',
    titulo: 'Acuerdo de confidencialidad sin acceso a datos',
    descripcion: 'RGPD art. 29 · LOPDGDD art. 5. Para empleados sin acceso a datos personales.',
    icono: '🔒',
  },
]

export default function PrlPanel({ empleados }: { empleados: Empleado[] }) {
  const [modal, setModal] = useState<string | null>(null)

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DOCUMENTOS.map(doc => (
          <div key={doc.id} className="rounded-card border border-line bg-card p-4">
            <div className="mb-2 text-2xl">{doc.icono}</div>
            <h2 className="mb-1 text-sm font-semibold">{doc.titulo}</h2>
            <p className="text-ink-3 mb-4 text-xs">{doc.descripcion}</p>
            <button onClick={() => setModal(doc.id)} className="w-full text-sm">
              Generar documento
            </button>
          </div>
        ))}
      </div>

      {modal === 'autorizacion_maquinaria' && (
        <ModalAutorizacionMaquinaria empleados={empleados} onClose={() => setModal(null)} />
      )}
      {modal === 'entrega_epis' && (
        <ModalEntregaEpis empleados={empleados} onClose={() => setModal(null)} />
      )}
      {modal === 'informacion_riesgos' && (
        <ModalInformacionRiesgos empleados={empleados} onClose={() => setModal(null)} />
      )}
      {(modal === 'acuerdo_con_acceso' || modal === 'acuerdo_sin_acceso') && (
        <ModalAcuerdoConfidencialidad
          tipo={modal as 'acuerdo_con_acceso' | 'acuerdo_sin_acceso'}
          empleados={empleados}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}

function ModalAutorizacionMaquinaria({ empleados, onClose }: { empleados: Empleado[]; onClose: () => void }) {
  const [empleadoId, setEmpleadoId] = useState('')
  const [puesto, setPuesto] = useState('')
  const [obraCentro, setObraCentro] = useState('')
  const [equipos, setEquipos] = useState<Set<Equipo>>(new Set())
  const [otrosDesc, setOtrosDesc] = useState('')
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  const empleado = empleados.find(e => e.id === empleadoId)

  function seleccionarEmpleado(id: string) {
    setEmpleadoId(id)
    const e = empleados.find(emp => emp.id === id)
    if (e) {
      setPuesto(e.puesto ?? '')
      setObraCentro(e.centro_trabajo ?? '')
    }
    setError('')
  }

  function toggleEquipo(eq: Equipo) {
    setEquipos(prev => {
      const next = new Set(prev)
      next.has(eq) ? next.delete(eq) : next.add(eq)
      return next
    })
  }

  async function generar() {
    if (!empleadoId) { setError('Selecciona un empleado'); return }
    if (!equipos.size) { setError('Selecciona al menos un equipo'); return }
    setGenerando(true); setError('')
    const r = await fetch('/api/admin/prl/generar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tipo: 'autorizacion_maquinaria',
        empleado_id: empleadoId,
        campos: { puesto: puesto || undefined, obra_centro: obraCentro || undefined, equipos: [...equipos], otros_descripcion: otrosDesc || undefined },
      }),
    })
    const j = await r.json().catch(() => ({}))
    if (r.ok) {
      setOk(true)
    } else {
      setError(j.error ?? 'Error al generar el documento')
    }
    setGenerando(false)
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <div onClick={e => e.stopPropagation()} className="w-full max-w-lg rounded-[18px] border border-line bg-card p-5 overflow-y-auto max-h-[90vh]">
        {ok ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✅</div>
            <h2 className="text-base font-semibold mb-2">Documento generado</h2>
            <p className="text-ink-2 text-sm mb-4">
              El documento está listo para que lo firmes desde el expediente del empleado.<br />
              Una vez firmado por la empresa, el empleado lo recibirá en su portal.
            </p>
            <div className="flex gap-2 justify-center">
              <a
                href={`/admin/empleados/${empleadoId}`}
                className="inline-block px-4 py-2 text-sm"
              >
                Ver expediente del empleado
              </a>
              <button onClick={onClose} className="bg-paper-2 text-ink-2 hover:bg-line">Cerrar</button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="mb-1 text-base font-semibold">Autorización uso de maquinaria</h2>
            <p className="text-ink-3 mb-4 text-xs">Art. 17 LPRL · RD 1215/1997</p>

            {/* Empleado */}
            <label className="block text-xs text-ink-2 mb-1">Empleado *</label>
            <select
              value={empleadoId}
              onChange={e => seleccionarEmpleado(e.target.value)}
              className="w-full mb-3"
            >
              <option value="">Seleccionar empleado…</option>
              {empleados.map(e => (
                <option key={e.id} value={e.id}>
                  {[e.nombre, e.apellidos].filter(Boolean).join(' ')}
                </option>
              ))}
            </select>

            {/* Puesto */}
            <label className="block text-xs text-ink-2 mb-1">
              Puesto / Oficio *
              {empleado && !empleado.puesto && <span className="text-warn ml-1">— no está en la ficha</span>}
            </label>
            <input
              value={puesto}
              onChange={e => setPuesto(e.target.value)}
              placeholder="Ej. Operario, Gruísta…"
              className={`w-full mb-3 ${empleado && !empleado.puesto ? 'border-warn' : ''}`}
            />

            {/* Obra/Centro */}
            <label className="block text-xs text-ink-2 mb-1">Obra / Centro de trabajo (opcional)</label>
            <input
              value={obraCentro}
              onChange={e => setObraCentro(e.target.value)}
              placeholder="Nombre de la obra o centro…"
              className="w-full mb-4"
            />

            {/* Equipos */}
            <label className="block text-xs text-ink-2 mb-2">Equipos autorizados * (marca los que apliquen)</label>
            <div className="grid gap-1.5 mb-3">
              {EQUIPOS.map(eq => (
                <label key={eq.id} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={equipos.has(eq.id)}
                    onChange={() => toggleEquipo(eq.id)}
                    className="rounded"
                  />
                  {eq.label}
                </label>
              ))}
            </div>

            {equipos.has('otros') && (
              <>
                <label className="block text-xs text-ink-2 mb-1">Descripción del equipo "Otros" *</label>
                <input
                  value={otrosDesc}
                  onChange={e => setOtrosDesc(e.target.value)}
                  placeholder="Especifica el equipo…"
                  className="w-full mb-3"
                />
              </>
            )}

            {error && <p className="text-alert text-sm mb-3">{error}</p>}

            <div className="flex gap-2 mt-1">
              <button onClick={generar} disabled={generando} className="flex-1">
                {generando ? 'Generando PDF…' : 'Generar y preparar para firma'}
              </button>
              <button onClick={onClose} className="bg-paper-2 text-ink-2 hover:bg-line">Cancelar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const EPIS_LISTA: { id: EpiId; label: string }[] = [
  { id: 'casco', label: 'Casco de protección (EN 397)' },
  { id: 'calzado', label: 'Calzado de seguridad (EN ISO 20345)' },
  { id: 'gafas', label: 'Gafas de protección (EN 166)' },
  { id: 'guantes', label: 'Guantes de protección mecánica (EN 388)' },
  { id: 'alta_visibilidad', label: 'Ropa de alta visibilidad (EN ISO 20471)' },
  { id: 'auditiva', label: 'Protección auditiva (EN 352)' },
  { id: 'mascarilla', label: 'Mascarilla respiratoria FFP2/FFP3 (EN 149)' },
  { id: 'arnes', label: 'Arnés anticaídas (EN 361) — si procede' },
]

function ModalEntregaEpis({ empleados, onClose }: { empleados: Empleado[]; onClose: () => void }) {
  const [empleadoId, setEmpleadoId] = useState('')
  const [puesto, setPuesto] = useState('')
  const [obraCentro, setObraCentro] = useState('')
  const [epis, setEpis] = useState<Set<EpiId>>(new Set())
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  const empleado = empleados.find(e => e.id === empleadoId)

  function seleccionarEmpleado(id: string) {
    setEmpleadoId(id)
    const e = empleados.find(emp => emp.id === id)
    if (e) { setPuesto(e.puesto ?? ''); setObraCentro(e.centro_trabajo ?? '') }
    setError('')
  }

  function toggleEpi(id: EpiId) {
    setEpis(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  async function generar() {
    if (!empleadoId) { setError('Selecciona un empleado'); return }
    if (!puesto) { setError('Indica el puesto/oficio'); return }
    if (!epis.size) { setError('Marca al menos un EPI entregado'); return }
    setGenerando(true); setError('')
    const r = await fetch('/api/admin/prl/generar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo: 'entrega_epis', empleado_id: empleadoId, campos: { puesto: puesto || undefined, obra_centro: obraCentro || undefined, epis: [...epis] } }),
    })
    const j = await r.json().catch(() => ({}))
    if (r.ok) { setOk(true) } else { setError(j.error ?? 'Error al generar el documento') }
    setGenerando(false)
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <div onClick={e => e.stopPropagation()} className="w-full max-w-lg rounded-[18px] border border-line bg-card p-5 overflow-y-auto max-h-[90vh]">
        {ok ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✅</div>
            <h2 className="text-base font-semibold mb-2">Documento generado</h2>
            <p className="text-ink-2 text-sm mb-4">El recibo de EPIs está listo para firmar desde el expediente del empleado.</p>
            <div className="flex gap-2 justify-center">
              <a href={`/admin/empleados/${empleadoId}`} className="inline-block px-4 py-2 text-sm">Ver expediente del empleado</a>
              <button onClick={onClose} className="bg-paper-2 text-ink-2 hover:bg-line">Cerrar</button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="mb-1 text-base font-semibold">Entrega de EPIs</h2>
            <p className="text-ink-3 mb-4 text-xs">RD 773/1997 · LPRL art. 17</p>

            <label className="block text-xs text-ink-2 mb-1">Empleado *</label>
            <select value={empleadoId} onChange={e => seleccionarEmpleado(e.target.value)} className="w-full mb-3">
              <option value="">Seleccionar empleado…</option>
              {empleados.map(e => (
                <option key={e.id} value={e.id}>{[e.nombre, e.apellidos].filter(Boolean).join(' ')}</option>
              ))}
            </select>

            <label className="block text-xs text-ink-2 mb-1">
              Puesto / Oficio *
              {empleado && !empleado.puesto && <span className="text-warn ml-1">— no está en la ficha</span>}
            </label>
            <input value={puesto} onChange={e => setPuesto(e.target.value)} placeholder="Ej. Operario, Gruísta…" className={`w-full mb-3 ${empleado && !empleado.puesto ? 'border-warn' : ''}`} />

            <label className="block text-xs text-ink-2 mb-1">Obra / Centro de trabajo (opcional)</label>
            <input value={obraCentro} onChange={e => setObraCentro(e.target.value)} placeholder="Nombre de la obra o centro…" className="w-full mb-4" />

            <label className="block text-xs text-ink-2 mb-2">EPIs entregados * (marca los que apliquen)</label>
            <div className="grid gap-1.5 mb-3">
              {EPIS_LISTA.map(epi => (
                <label key={epi.id} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={epis.has(epi.id)} onChange={() => toggleEpi(epi.id)} className="rounded" />
                  {epi.label}
                </label>
              ))}
            </div>

            {error && <p className="text-alert text-sm mb-3">{error}</p>}
            <div className="flex gap-2 mt-1">
              <button onClick={generar} disabled={generando} className="flex-1">
                {generando ? 'Generando PDF…' : 'Generar y preparar para firma'}
              </button>
              <button onClick={onClose} className="bg-paper-2 text-ink-2 hover:bg-line">Cancelar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ModalInformacionRiesgos({ empleados, onClose }: { empleados: Empleado[]; onClose: () => void }) {
  const [empleadoId, setEmpleadoId] = useState('')
  const [puesto, setPuesto] = useState('')
  const [obraCentro, setObraCentro] = useState('')
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  const empleado = empleados.find(e => e.id === empleadoId)

  function seleccionarEmpleado(id: string) {
    setEmpleadoId(id)
    const e = empleados.find(emp => emp.id === id)
    if (e) { setPuesto(e.puesto ?? ''); setObraCentro(e.centro_trabajo ?? '') }
    setError('')
  }

  async function generar() {
    if (!empleadoId) { setError('Selecciona un empleado'); return }
    if (!puesto) { setError('Indica el puesto/oficio'); return }
    setGenerando(true); setError('')
    const r = await fetch('/api/admin/prl/generar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo: 'informacion_riesgos', empleado_id: empleadoId, campos: { puesto: puesto || undefined, obra_centro: obraCentro || undefined } }),
    })
    const j = await r.json().catch(() => ({}))
    if (r.ok) { setOk(true) } else { setError(j.error ?? 'Error al generar el documento') }
    setGenerando(false)
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-[18px] border border-line bg-card p-5">
        {ok ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✅</div>
            <h2 className="text-base font-semibold mb-2">Documento generado</h2>
            <p className="text-ink-2 text-sm mb-4">La ficha de riesgos está lista para firmar desde el expediente del empleado.</p>
            <div className="flex gap-2 justify-center">
              <a href={`/admin/empleados/${empleadoId}`} className="inline-block px-4 py-2 text-sm">Ver expediente del empleado</a>
              <button onClick={onClose} className="bg-paper-2 text-ink-2 hover:bg-line">Cerrar</button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="mb-1 text-base font-semibold">Información de riesgos (art. 18)</h2>
            <p className="text-ink-3 mb-4 text-xs">LPRL art. 18 · Riesgos generales y específicos de obra</p>

            <label className="block text-xs text-ink-2 mb-1">Empleado *</label>
            <select value={empleadoId} onChange={e => seleccionarEmpleado(e.target.value)} className="w-full mb-3">
              <option value="">Seleccionar empleado…</option>
              {empleados.map(e => (
                <option key={e.id} value={e.id}>
                  {[e.nombre, e.apellidos].filter(Boolean).join(' ')}{e.dni ? ` — ${e.dni}` : ''}
                </option>
              ))}
            </select>

            <label className="block text-xs text-ink-2 mb-1">
              Puesto / Oficio *
              {empleado && !empleado.puesto && <span className="text-warn ml-1">— no está en la ficha</span>}
            </label>
            <input value={puesto} onChange={e => setPuesto(e.target.value)} placeholder="Ej. Operario, Gruísta…" className={`w-full mb-3 ${empleado && !empleado.puesto ? 'border-warn' : ''}`} />

            <label className="block text-xs text-ink-2 mb-1">Obra / Centro de trabajo (opcional)</label>
            <input value={obraCentro} onChange={e => setObraCentro(e.target.value)} placeholder="Nombre de la obra o centro…" className="w-full mb-4" />

            <p className="text-ink-3 text-xs mb-4">El documento incluye automáticamente los riesgos generales de construcción y las medidas preventivas obligatorias conforme al art. 18 LPRL.</p>

            {error && <p className="text-alert text-sm mb-3">{error}</p>}
            <div className="flex gap-2">
              <button onClick={generar} disabled={generando} className="flex-1">
                {generando ? 'Generando PDF…' : 'Generar y preparar para firma'}
              </button>
              <button onClick={onClose} className="bg-paper-2 text-ink-2 hover:bg-line">Cancelar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ModalAcuerdoConfidencialidad({
  tipo, empleados, onClose,
}: {
  tipo: 'acuerdo_con_acceso' | 'acuerdo_sin_acceso'
  empleados: Empleado[]
  onClose: () => void
}) {
  const [empleadoId, setEmpleadoId] = useState('')
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  const titulo = tipo === 'acuerdo_con_acceso'
    ? 'Acuerdo de confidencialidad con acceso a datos'
    : 'Acuerdo de confidencialidad sin acceso a datos'

  async function generar() {
    if (!empleadoId) { setError('Selecciona un empleado'); return }
    setGenerando(true); setError('')
    const r = await fetch('/api/admin/prl/generar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo, empleado_id: empleadoId }),
    })
    const j = await r.json().catch(() => ({}))
    if (r.ok) {
      setOk(true)
    } else {
      setError(j.error ?? 'Error al generar el documento')
    }
    setGenerando(false)
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-[18px] border border-line bg-card p-5">
        {ok ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✅</div>
            <h2 className="text-base font-semibold mb-2">Documento generado</h2>
            <p className="text-ink-2 text-sm mb-4">
              El acuerdo está listo para firma. Fírmalo desde el expediente del empleado.<br />
              Una vez firmado por la empresa, el empleado lo recibirá en su portal.
            </p>
            <div className="flex gap-2 justify-center">
              <a href={`/admin/empleados/${empleadoId}`} className="inline-block px-4 py-2 text-sm">
                Ver expediente del empleado
              </a>
              <button onClick={onClose} className="bg-paper-2 text-ink-2 hover:bg-line">Cerrar</button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="mb-1 text-base font-semibold">{titulo}</h2>
            <p className="text-ink-3 mb-4 text-xs">RGPD art. 29 · LOPDGDD art. 5</p>

            <label className="block text-xs text-ink-2 mb-1">Empleado *</label>
            <select
              value={empleadoId}
              onChange={e => { setEmpleadoId(e.target.value); setError('') }}
              className="w-full mb-4"
            >
              <option value="">Seleccionar empleado…</option>
              {empleados.map(e => (
                <option key={e.id} value={e.id}>
                  {[e.nombre, e.apellidos].filter(Boolean).join(' ')}
                  {e.dni ? ` — ${e.dni}` : ''}
                </option>
              ))}
            </select>

            <p className="text-ink-3 text-xs mb-4">
              El sistema rellenará automáticamente los datos de la empresa y del empleado seleccionado.
            </p>

            {error && <p className="text-alert text-sm mb-3">{error}</p>}

            <div className="flex gap-2">
              <button onClick={generar} disabled={generando} className="flex-1">
                {generando ? 'Generando PDF…' : 'Generar y preparar para firma'}
              </button>
              <button onClick={onClose} className="bg-paper-2 text-ink-2 hover:bg-line">Cancelar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
