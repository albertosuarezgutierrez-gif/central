'use client'
import { useState, useTransition } from 'react'
import Card from '@/components/ui/Card'
import Boton from '@/components/ui/Boton'
import Aviso from '@/components/ui/Aviso'
import {
  CONTINGENCIAS, ETIQUETA_CONTINGENCIA, TEXTO_CONSENTIMIENTO_LEAD, TIPOS_SEGURO, fraseObligacion, situacionCobertura, textoAfectados, vigenteEn,
  type Afectados, type Contingencia, type ObligacionConCobertura, type Situacion,
} from '@/lib/seguro-convenio'
import { borrarObligacionAccion, guardarCoberturaAccion, guardarObligacionAccion, pedirRevisionAccion, sinObligacionAccion } from './actions'

const INPUT = 'border border-line rounded px-2 py-1'
const fechaEs = (s: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '')
const centAEuroTexto = (c: number) => (c / 100).toFixed(2).replace('.', ',')

const SITUACION: Record<Situacion, { texto: string; tono: 'aviso' | 'alerta' | 'ok' }> = {
  no_se_sabe: { texto: 'Sin contestar: ¿lo tienes?', tono: 'aviso' },
  no_cubierto: { texto: 'No lo tenéis contratado', tono: 'alerta' },
  cubierto: { texto: 'Cubierto', tono: 'ok' },
  cubierto_vencido: { texto: 'La póliza indicada está vencida', tono: 'alerta' },
}

type Contacto = { nombre: string; email: string } | null

/** Último lead vivo de la obligación. `reintentable`: un 'incierto' de ≥ 24 h (lo calcula el servidor). */
type LeadVivo = { estado: string; at: string; reintentable?: boolean }

export default function SeguroConvenioClient({ obligaciones, afectados, leads, convenioEmpresa, contacto, hoy, sinObligacionAt }: {
  obligaciones: ObligacionConCobertura[]
  afectados: Record<string, Afectados>
  leads: Record<string, LeadVivo>
  convenioEmpresa: string | null
  contacto: Contacto
  hoy: string
  /** null = nadie ha revisado si el convenio obliga (≠ «revisado: no obliga»). */
  sinObligacionAt: string | null
}) {
  const [pendienteSin, empezarSin] = useTransition()
  const [errorSin, setErrorSin] = useState('')
  const marcarSin = (v: boolean) => { setErrorSin(''); empezarSin(async () => { const r = await sinObligacionAccion(v); if (!r.ok) setErrorSin(r.error) }) }
  const [editando, setEditando] = useState<ObligacionConCobertura | null>(null)
  const [verForm, setVerForm] = useState(obligaciones.length === 0)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {obligaciones.length === 0 && (sinObligacionAt
        ? <Aviso tono="ok" titulo="Revisado: tu convenio no obliga a ningún seguro">
            Lo marcaste el {fechaEs(sinObligacionAt)}. Si el convenio se renueva, vuelve a mirarlo.{' '}
            <Boton variante="fantasma" type="button" disabled={pendienteSin} onClick={() => marcarSin(false)}>Deshacer</Boton>
          </Aviso>
        : <Aviso tono="info" titulo="Aún no has registrado ninguna obligación">
            No sabemos si tu convenio obliga a tener un seguro (que no esté aquí no quiere decir que no obligue). Búscalo en el
            convenio: suele estar en un artículo llamado «Seguro de accidentes», «Póliza de seguro» o «Indemnización por muerte o invalidez».
            <span className="mt-2 block"><Boton variante="secundario" type="button" disabled={pendienteSin} onClick={() => marcarSin(true)}>Lo he revisado: mi convenio no obliga</Boton></span>
          </Aviso>)}
      {errorSin && <p className="text-alert text-sm">{errorSin}</p>}

      {obligaciones.map(o => (
        <TarjetaObligacion key={o.id} o={o} afectados={afectados[o.id] ?? null} lead={leads[o.id] ?? null}
          contacto={contacto} hoy={hoy} onEditar={() => { setEditando(o); setVerForm(true) }} />
      ))}

      {verForm
        ? <FormObligacion key={editando?.id ?? 'nueva'} inicial={editando} convenioEmpresa={convenioEmpresa}
            onHecho={() => { setEditando(null); setVerForm(false) }} onCancelar={obligaciones.length ? () => { setEditando(null); setVerForm(false) } : undefined} />
        : <div><Boton variante="secundario" onClick={() => setVerForm(true)}>Añadir otra obligación</Boton></div>}
    </div>
  )
}

function TarjetaObligacion({ o, afectados, lead, contacto, hoy, onEditar }: {
  o: ObligacionConCobertura; afectados: Afectados; lead: LeadVivo | null; contacto: Contacto; hoy: string; onEditar: () => void
}) {
  const [pendiente, empezar] = useTransition()
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [estado, setEstado] = useState<string>(o.cobertura.estado ?? '')
  const [aseguradora, setAseguradora] = useState(o.cobertura.aseguradora ?? '')
  const [poliza, setPoliza] = useState(o.cobertura.poliza ?? '')
  const [vencimiento, setVencimiento] = useState(o.cobertura.vencimiento ?? '')
  const [pedir, setPedir] = useState(false)
  const vigente = vigenteEn(o, hoy)
  const sit = SITUACION[situacionCobertura(o.cobertura, hoy)]

  function guardarCobertura(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMsg('')
    empezar(async () => {
      const r = await guardarCoberturaAccion(o.id, { estado, aseguradora, poliza, vencimiento })
      if (r.ok) setMsg('Respuesta guardada'); else setError(r.error)
    })
  }
  function borrar() {
    if (!confirm('¿Borrar esta obligación?')) return
    setError(''); setMsg('')
    empezar(async () => { const r = await borrarObligacionAccion(o.id); if (!r.ok) setError(r.error) })
  }

  return (
    <Card as="section" className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="min-w-0">
        <h2 className="text-lg break-words">Tu convenio obliga a tener {fraseObligacion(o)}{o.cobertura.estado === null ? ' — ¿lo tienes?' : ''}</h2>
        <p className="text-ink-3 text-sm break-words">
          {o.convenio} · {o.articulo} · <a href={o.fuenteUrl} target="_blank" rel="noopener noreferrer" className="underline">ver la fuente</a>
          {' · '}vigente desde {fechaEs(o.vigenteDesde)}{o.vigenteHasta ? ` hasta ${fechaEs(o.vigenteHasta)}` : ' (sin fin conocido)'}
          {!vigente && <strong> · no vigente hoy</strong>}
        </p>
        <p className="text-ink-3 text-sm break-words">
          {o.ambito === 'todas' ? 'Todas las categorías' : `Categorías: ${(o.categorias ?? []).join(', ')}`} · {textoAfectados(afectados)}
        </p>
      </div>

      <Aviso tono={sit.tono}>{sit.texto}{o.cobertura.estado === 'cubierto' && <> — {o.cobertura.aseguradora}{o.cobertura.poliza ? `, póliza ${o.cobertura.poliza}` : ''}{o.cobertura.vencimiento ? `, vence el ${fechaEs(o.cobertura.vencimiento)}` : ', vencimiento no indicado'}</>}</Aviso>

      <form onSubmit={guardarCobertura} className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <fieldset className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <legend className="text-sm font-bold">¿Tenéis una póliza que lo cubra?</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {[['cubierto', 'Sí, lo tenemos'], ['no_cubierto', 'No'], ['', 'No lo sé']].map(([v, t]) => (
              <label key={v} className="flex min-h-[44px] items-center gap-2">
                <input type="radio" name={`estado-${o.id}`} value={v} checked={estado === v} onChange={() => setEstado(v)} /> {t}
              </label>
            ))}
          </div>
        </fieldset>
        {estado === 'cubierto' && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">Aseguradora
              <input required value={aseguradora} onChange={e => setAseguradora(e.target.value)} className={INPUT} /></label>
            <label className="flex flex-col gap-1 text-sm">Nº de póliza (opcional)
              <input value={poliza} onChange={e => setPoliza(e.target.value)} className={INPUT} placeholder="vacío = no se sabe" /></label>
            <label className="flex flex-col gap-1 text-sm">Vencimiento (opcional)
              <input type="date" value={vencimiento} onChange={e => setVencimiento(e.target.value)} className={INPUT} /></label>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Boton type="submit" disabled={pendiente}>{pendiente ? 'Guardando…' : 'Guardar respuesta'}</Boton>
          <Boton variante="secundario" type="button" onClick={onEditar}>Editar obligación</Boton>
          <Boton variante="peligroSuave" type="button" onClick={borrar} disabled={pendiente}>Borrar</Boton>
        </div>
      </form>

      {lead?.estado === 'incierto' && (
        <Aviso tono="info">Tu petición del {fechaEs(lead.at)} no se pudo confirmar: puede que ya se enviara y Grupo ASegura te contactará.
          {lead.reintentable ? ' Si no te han contactado, puedes volver a pedirlo.' : ' Si en 24 horas no sabes nada, podrás volver a pedirlo.'}</Aviso>
      )}
      {lead?.estado === 'enviado'
        ? <Aviso tono="ok">Pediste a Grupo ASegura que lo revisara el {fechaEs(lead.at)}. Te contactarán.</Aviso>
        : lead?.estado === 'incierto' && !lead.reintentable ? null
        : pedir
          ? <FormLead obligacionId={o.id} contacto={contacto} onCerrar={() => setPedir(false)} />
          : <div><Boton variante="secundario" type="button" onClick={() => setPedir(true)}>Quiero que Grupo ASegura me lo revise</Boton></div>}

      {msg && <p className="text-ok text-sm">{msg}</p>}
      {error && <p className="text-alert text-sm">{error}</p>}
    </Card>
  )
}

function FormLead({ obligacionId, contacto, onCerrar }: { obligacionId: string; contacto: Contacto; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(contacto?.nombre ?? '')
  const [email, setEmail] = useState(contacto?.email ?? '')
  const [telefono, setTelefono] = useState('')
  // RGPD: la casilla NUNCA viene marcada.
  const [acepto, setAcepto] = useState(false)
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState('')
  const [pendiente, empezar] = useTransition()

  function enviar(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!acepto) { setError('Marca la casilla para aceptar el envío de los datos'); return }
    empezar(async () => {
      const r = await pedirRevisionAccion(obligacionId, { nombre, email, telefono, consentimiento: acepto })
      if (r.ok) setHecho(r.mensaje ?? 'Hecho'); else setError(r.error)
    })
  }
  if (hecho) return <Aviso tono="ok">{hecho}</Aviso>

  return (
    <form onSubmit={enviar} className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-card border border-line p-3">
      <p className="text-sm">Grupo ASegura (correduría de seguros) revisará si lo tenéis cubierto y te llamará o escribirá con una propuesta. Nadie más recibe estos datos.</p>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">Tu nombre
          <input required value={nombre} onChange={e => setNombre(e.target.value)} className={INPUT} autoComplete="name" /></label>
        <label className="flex flex-col gap-1 text-sm">Correo
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={INPUT} autoComplete="email" /></label>
        <label className="flex flex-col gap-1 text-sm">Teléfono (opcional)
          <input type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} className={INPUT} autoComplete="tel" /></label>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={acepto} onChange={e => setAcepto(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />
        <span>{TEXTO_CONSENTIMIENTO_LEAD}</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit" disabled={pendiente || !acepto}>{pendiente ? 'Enviando…' : 'Enviar a Grupo ASegura'}</Boton>
        <Boton variante="fantasma" type="button" onClick={onCerrar}>Cancelar</Boton>
      </div>
      {error && <p className="text-alert text-sm">{error}</p>}
    </form>
  )
}

function FormObligacion({ inicial, convenioEmpresa, onHecho, onCancelar }: {
  inicial: ObligacionConCobertura | null; convenioEmpresa: string | null; onHecho: () => void; onCancelar?: () => void
}) {
  const [convenio, setConvenio] = useState(inicial?.convenio ?? convenioEmpresa ?? '')
  const [tipo, setTipo] = useState<string>(inicial?.tipo ?? 'accidentes')
  const [cont, setCont] = useState<Contingencia[]>(inicial?.contingencias ?? [])
  const [capital, setCapital] = useState(inicial ? centAEuroTexto(inicial.capitalCent) : '')
  const [ambito, setAmbito] = useState<string>(inicial?.ambito ?? 'todas')
  const [categorias, setCategorias] = useState((inicial?.categorias ?? []).join('\n'))
  const [articulo, setArticulo] = useState(inicial?.articulo ?? '')
  const [fuenteUrl, setFuenteUrl] = useState(inicial?.fuenteUrl ?? '')
  const [desde, setDesde] = useState(inicial?.vigenteDesde ?? '')
  const [hasta, setHasta] = useState(inicial?.vigenteHasta ?? '')
  const [error, setError] = useState('')
  const [pendiente, empezar] = useTransition()

  function guardar(e: React.FormEvent) {
    e.preventDefault(); setError('')
    empezar(async () => {
      const r = await guardarObligacionAccion(inicial?.id ?? null, {
        convenio, tipo, contingencias: cont, capital, ambito, categorias, articulo, fuenteUrl, vigenteDesde: desde, vigenteHasta: hasta,
      })
      if (r.ok) onHecho(); else setError(r.error)
    })
  }

  return (
    <Card as="section">
      <form onSubmit={guardar} className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <h2 className="text-lg">{inicial ? 'Editar obligación' : 'Registrar la obligación del convenio'}</h2>
        {inicial && <p className="text-ink-3 text-xs">Si cambias el tipo, las contingencias, el capital o las categorías, la respuesta «¿lo tenéis?» vuelve a «sin contestar».</p>}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <label className="flex flex-col gap-1 text-sm">Convenio
            <input required value={convenio} onChange={e => setConvenio(e.target.value)} className={INPUT} placeholder="p. ej. Hostelería de Sevilla" /></label>
          <label className="flex flex-col gap-1 text-sm">Tipo de seguro
            <select value={tipo} onChange={e => setTipo(e.target.value)} className={INPUT}>
              {TIPOS_SEGURO.map(t => <option key={t} value={t}>{t === 'accidentes' ? 'Accidentes' : t === 'vida' ? 'Vida' : 'Otro'}</option>)}
            </select></label>
        </div>
        <fieldset className="grid grid-cols-[minmax(0,1fr)] gap-1">
          <legend className="text-sm">Contingencias que cubre</legend>
          <div className="flex flex-wrap gap-x-4">
            {CONTINGENCIAS.map(c => (
              <label key={c} className="flex min-h-[44px] items-center gap-2 text-sm">
                <input type="checkbox" checked={cont.includes(c)} onChange={e => setCont(e.target.checked ? [...cont, c] : cont.filter(x => x !== c))} />
                {ETIQUETA_CONTINGENCIA[c]}
              </label>
            ))}
          </div>
          <p className="text-ink-3 text-xs">Si el convenio da un capital distinto por contingencia, registra una obligación por cada capital.</p>
        </fieldset>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">Capital por trabajador (€)
            <input required inputMode="decimal" value={capital} onChange={e => setCapital(e.target.value)} className={INPUT} placeholder="30.000" /></label>
          <label className="flex flex-col gap-1 text-sm">A quién obliga
            <select value={ambito} onChange={e => setAmbito(e.target.value)} className={INPUT}>
              <option value="todas">A todas las categorías</option>
              <option value="algunas">Solo a algunas categorías</option>
            </select></label>
        </div>
        {ambito === 'algunas' && (
          <label className="flex flex-col gap-1 text-sm">Categorías (una por línea, como en el contrato)
            <textarea required rows={3} value={categorias} onChange={e => setCategorias(e.target.value)} className={INPUT} /></label>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">Artículo
            <input required value={articulo} onChange={e => setArticulo(e.target.value)} className={INPUT} placeholder="p. ej. Art. 42" /></label>
          <label className="flex flex-col gap-1 text-sm">Enlace al BOE / boletín
            <input required type="url" value={fuenteUrl} onChange={e => setFuenteUrl(e.target.value)} className={INPUT} placeholder="https://www.boe.es/…" /></label>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">Vigente desde
            <input required type="date" value={desde} onChange={e => setDesde(e.target.value)} className={INPUT} /></label>
          <label className="flex flex-col gap-1 text-sm">Vigente hasta (opcional)
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={INPUT} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Boton type="submit" disabled={pendiente}>{pendiente ? 'Guardando…' : 'Guardar obligación'}</Boton>
          {onCancelar && <Boton variante="fantasma" type="button" onClick={onCancelar}>Cancelar</Boton>}
          {error && <span className="text-alert text-sm">{error}</span>}
        </div>
      </form>
    </Card>
  )
}
