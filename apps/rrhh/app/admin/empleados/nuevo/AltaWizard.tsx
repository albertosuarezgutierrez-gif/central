'use client'
// Asistente de alta en 3 pasos. Cada «Siguiente» valida SOLO los campos del paso con `validarAlta` (la misma regla pura que
// usa el servidor y la importación); el servidor vuelve a validarlo todo al guardar.
//
// Dirección: NO se pide aquí. La regla del repo (CP → provincia → municipio → calle del Catastro) necesita en rrhh las rutas
// de CP/callejero que hoy solo tiene plataforma; hasta entonces se completa en la ficha del empleado.
import { useMemo, useState } from 'react'
import Boton from '@/components/ui/Boton'
import Aviso from '@/components/ui/Aviso'
import { validarAlta, salarioPropuesto, type CampoAlta, type EntradaAlta, type ErrorCampo } from '@/lib/alta-empleado'
import { categoriasDelAnio, type FilaTablaConvenio } from '@/lib/convenio-tablas'
import { fechaIso } from '@/lib/alta-empleado-validadores'
import { darDeAltaEmpleado } from './actions'

const PASOS: { titulo: string; campos: CampoAlta[] }[] = [
  { titulo: 'Datos personales', campos: ['apellidos', 'nombre', 'email', 'dni', 'nss', 'telefono', 'fecha_nacimiento'] },
  { titulo: 'Contrato y convenio', campos: ['fecha_alta', 'puesto', 'tipo_contrato', 'fecha_fin', 'grupo_cotizacion', 'categoria', 'jornada_pct'] },
  { titulo: 'Salario y banco', campos: ['salario_base', 'irpf_pct', 'iban'] },
]

const VACIO: Required<EntradaAlta> = {
  apellidos: '', nombre: '', email: '', dni: '', nss: '', telefono: '', fecha_nacimiento: '', puesto: '', fecha_alta: '',
  tipo_contrato: 'indefinido', fecha_fin: '', grupo_cotizacion: '', categoria: '', jornada_pct: '100', salario_base: '', irpf_pct: '', iban: '',
}

const REJILLA = { gridTemplateColumns: 'minmax(0, 1fr)' } as const

export default function AltaWizard({ tablas, convenio, hoy }: { tablas: FilaTablaConvenio[] | null; convenio: string | null; hoy: string }) {
  const [paso, setPaso] = useState(0)
  const [d, setD] = useState<Required<EntradaAlta>>({ ...VACIO, fecha_alta: hoy })
  const [errores, setErrores] = useState<ErrorCampo[]>([])
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ctx = useMemo(() => ({ hoy, tablas, convenio }), [hoy, tablas, convenio])
  const conContrato = d.tipo_contrato !== ''

  // Sin contrato, los campos del contrato no viajan (si no, la regla exigiría el tipo).
  const entrada = (): EntradaAlta => conContrato ? d : { ...d, fecha_fin: '', grupo_cotizacion: '', jornada_pct: '', salario_base: '', irpf_pct: '' }
  const anio = Number((fechaIso(d.fecha_alta) ?? hoy).slice(0, 4))
  const categorias = tablas ? categoriasDelAnio(tablas, anio) : []
  const propuesto = salarioPropuesto(ctx, d.categoria, d.fecha_alta)

  const set = (k: CampoAlta) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = ev.target.value
    setD(s => ({ ...s, [k]: v, ...(k === 'tipo_contrato' && v === 'indefinido' ? { fecha_fin: '' } : {}) }))
    setErrores(es => es.filter(x => x.campo !== k))
  }
  const errDe = (k: CampoAlta) => errores.find(x => x.campo === k)?.mensaje

  function erroresDelPaso(i: number): ErrorCampo[] {
    const r = validarAlta(entrada(), ctx)
    return r.ok ? [] : r.errores.filter(x => PASOS[i].campos.includes(x.campo))
  }

  function siguiente() {
    const es = erroresDelPaso(paso)
    setErrores(es)
    if (!es.length) setPaso(p => p + 1)
  }

  async function guardar() {
    const es = [0, 1, 2].flatMap(erroresDelPaso)
    setErrores(es); setError('')
    if (es.length) { setPaso(PASOS.findIndex(p => p.campos.includes(es[0].campo))); return }
    setEnviando(true)
    const r = await darDeAltaEmpleado(entrada() as Record<string, unknown>)
    setEnviando(false)
    if (r.ok) { window.location.href = `/admin/empleados/${r.id}`; return }
    setError(r.error)
    if (r.errores?.length) { setErrores(r.errores); setPaso(PASOS.findIndex(p => p.campos.includes(r.errores![0].campo))) }
  }

  const campo = (k: CampoAlta, etiqueta: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="grid min-w-0 gap-1 text-sm" style={REJILLA}>
      <span className="font-semibold">{etiqueta}</span>
      <input value={d[k]} onChange={set(k)} aria-invalid={!!errDe(k)} aria-describedby={errDe(k) ? `err-${k}` : undefined}
        className="min-h-[44px] w-full min-w-0" {...props} />
      {errDe(k) && <span id={`err-${k}`} className="text-alert text-xs">{errDe(k)}</span>}
    </label>
  )

  return (
    <div className="grid gap-4" style={REJILLA}>
      <ol className="grid gap-2 sm:grid-cols-3" aria-label="Pasos del alta">
        {PASOS.map((p, i) => (
          <li key={p.titulo} aria-current={i === paso ? 'step' : undefined}
            className={`rounded-[12px] border px-3 py-2 text-sm ${i === paso ? 'border-accent bg-accent-soft font-bold text-ink' : 'border-line text-ink-3'}`}>
            {i + 1}. {p.titulo}
          </li>
        ))}
      </ol>

      {paso === 0 && (
        <div className="grid gap-3 sm:grid-cols-2" style={REJILLA}>
          {campo('apellidos', 'Apellidos *', { autoComplete: 'off' })}
          {campo('nombre', 'Nombre *', { autoComplete: 'off' })}
          {campo('email', 'Email * (para entrar y firmar)', { type: 'email', inputMode: 'email', autoComplete: 'off' })}
          {campo('dni', 'DNI / NIE *', { autoComplete: 'off', placeholder: '12345678Z' })}
          {campo('nss', 'Nº afiliación Seguridad Social', { inputMode: 'numeric', placeholder: '12 dígitos', autoComplete: 'off' })}
          {campo('telefono', 'Teléfono', { type: 'tel', inputMode: 'tel', autoComplete: 'off' })}
          {campo('fecha_nacimiento', 'Fecha de nacimiento', { type: 'date', max: hoy })}
        </div>
      )}

      {paso === 1 && (
        <div className="grid gap-3 sm:grid-cols-2" style={REJILLA}>
          {campo('fecha_alta', 'Fecha de alta', { type: 'date' })}
          {campo('puesto', 'Puesto', { placeholder: 'Camarero, cocinero…' })}
          <label className="grid min-w-0 gap-1 text-sm" style={REJILLA}>
            <span className="font-semibold">Tipo de contrato</span>
            <select value={d.tipo_contrato} onChange={set('tipo_contrato')} className="min-h-[44px] w-full min-w-0">
              <option value="indefinido">Indefinido</option>
              <option value="temporal">Temporal</option>
              <option value="parcial">Tiempo parcial</option>
              <option value="">Sin contrato todavía</option>
            </select>
            {errDe('tipo_contrato') && <span className="text-alert text-xs">{errDe('tipo_contrato')}</span>}
          </label>
          {conContrato && d.tipo_contrato !== 'indefinido' && campo('fecha_fin', 'Fecha de fin (si se sabe)', { type: 'date' })}
          {conContrato && (
            <label className="grid min-w-0 gap-1 text-sm" style={REJILLA}>
              <span className="font-semibold">Grupo de cotización *</span>
              <select value={d.grupo_cotizacion} onChange={set('grupo_cotizacion')} className="min-h-[44px] w-full min-w-0">
                <option value="">Elige…</option>
                {Array.from({ length: 11 }, (_, i) => <option key={i + 1} value={String(i + 1)}>Grupo {i + 1}</option>)}
              </select>
              {errDe('grupo_cotizacion') && <span className="text-alert text-xs">{errDe('grupo_cotizacion')}</span>}
            </label>
          )}
          {campo('categoria', `Categoría del convenio${categorias.length ? '' : ' (texto)'}`, { list: categorias.length ? 'categorias-convenio' : undefined })}
          {categorias.length > 0 && <datalist id="categorias-convenio">{categorias.map(c => <option key={c} value={c} />)}</datalist>}
          {conContrato && campo('jornada_pct', 'Jornada (%) *', { type: 'number', min: 1, max: 100, step: '0.01', inputMode: 'decimal' })}
        </div>
      )}

      {paso === 2 && (
        <div className="grid gap-3 sm:grid-cols-2" style={REJILLA}>
          {conContrato ? (
            <>
              <div className="grid min-w-0 gap-1" style={REJILLA}>
                {campo('salario_base', 'Salario base (€/mes) *', { inputMode: 'decimal', placeholder: propuesto ? propuesto.replace('.', ',') : '1.350,00' })}
                {propuesto && d.salario_base.replace(',', '.') !== propuesto && (
                  <Boton variante="secundario" onClick={() => { setD(s => ({ ...s, salario_base: propuesto.replace('.', ',') })); setErrores(es => es.filter(x => x.campo !== 'salario_base')) }}>
                    Usar el del convenio: {propuesto.replace('.', ',')} €
                  </Boton>
                )}
                {!propuesto && d.categoria && tablas && <span className="text-ink-3 text-xs">Sin tabla del convenio para esa categoría y año: indícalo a mano.</span>}
                {!tablas && <span className="text-ink-3 text-xs">Tablas del convenio no disponibles: indica el salario a mano.</span>}
              </div>
              {campo('irpf_pct', 'Retención IRPF (%)', { inputMode: 'decimal', placeholder: '0' })}
            </>
          ) : (
            <p className="text-ink-3 text-sm sm:col-span-2">Sin contrato: el salario se indica al crear el contrato desde la ficha.</p>
          )}
          <div className="sm:col-span-2">
            {campo('iban', 'IBAN de la nómina', { autoComplete: 'off', placeholder: 'ES00 0000 0000 0000 0000 0000' })}
          </div>
        </div>
      )}

      {error && <Aviso tono="alerta">{error}</Aviso>}

      <div className="flex flex-wrap justify-between gap-2">
        {paso > 0 ? <Boton variante="secundario" onClick={() => { setErrores([]); setPaso(p => p - 1) }}>Atrás</Boton> : <span />}
        {paso < 2
          ? <Boton onClick={siguiente}>Siguiente</Boton>
          : <Boton onClick={guardar} disabled={enviando}>{enviando ? 'Guardando…' : 'Dar de alta'}</Boton>}
      </div>
    </div>
  )
}
