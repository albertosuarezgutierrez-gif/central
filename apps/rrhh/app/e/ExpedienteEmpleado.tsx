'use client'
import { useEffect, useState } from 'react'
import SolicitudesEmpleado from '@/components/SolicitudesEmpleado'
import FichajeEmpleado from '@/components/FichajeEmpleado'
import MaterialEmpleado from '@/components/MaterialEmpleado'
import ActivarPush from '@/components/ActivarPush'
import AvisoPushEmpleado from '@/components/AvisoPushEmpleado'
import NavEmpleado from '@/components/NavEmpleado'
import { seccionDeUrl, seccionDisponible, type Seccion } from '@/lib/seccion-empleado'
import { PieAsegura } from '@/components/MarcaAsegura'
import CabeceraApp from '@/components/CabeceraApp'
import { marcaCabecera } from '@/lib/marca-empresa'
import AvisoSeguros from '@/components/AvisoSeguros'
import Modal from '@/components/ui/Modal'
import Boton from '@/components/ui/Boton'
import Chip from '@/components/ui/Chip'
import { saludoEmpleado } from '@/lib/saludo'

type Carpeta = { id: string; etiqueta: string }
type Doc = { id: string; carpeta: string; nombre: string; estado_firma: string; firmado_empresa_at: string | null; firmado_empresa_nombre: string | null; creada_at: string; url: string | null; resumen?: string | null }
type Aviso = { id: string; tipo: string; titulo: string; cuerpo: string | null; creado_at: string; visto_en: string | null; documento_id: string | null; documento_nombre: string | null; estado_firma: string | null }
type Avisos = { avisos: Aviso[]; sin_ver: number }
type Branding = { nombre: string; color_primario: string | null; logo_url: string | null }

// Mismo criterio que antes en los dos sitios donde sale «Firmar» (avisos y lista): solo cambia que ahora se nombra.
const puedeFirmar = (d: { estado_firma: string; carpeta: string }) => d.estado_firma === 'pendiente' && d.carpeta !== 'datos_personales' && d.carpeta !== 'formacion'

function IconoDoc() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h5" /></svg>
}

const CONSENTIMIENTO = 'He leído el documento y lo firmo electrónicamente. Acepto que esta firma electrónica avanzada (Reglamento eIDAS, art. 26) queda vinculada a mi identidad y al contenido del documento, y tiene la misma validez que mi firma manuscrita.'

export default function ExpedienteEmpleado({ visibles, subibles, inicial, branding, tieneFichaje, avisosIniciales, urlSeguros, nombreEmpleado }: { urlSeguros: string; nombreEmpleado?: string | null; visibles: Carpeta[]; subibles: Carpeta[]; inicial: Doc[]; branding?: Branding; tieneFichaje?: boolean; avisosIniciales?: Avisos | null }) {
  const [docs, setDocs] = useState<Doc[]>(inicial)
  const [avisos, setAvisos] = useState<Avisos | null>(avisosIniciales ?? null)
  const [verAvisos, setVerAvisos] = useState(false)
  const [carpeta, setCarpeta] = useState(subibles[0]?.id ?? '')
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const [firmarDoc, setFirmarDoc] = useState<Doc | null>(null)
  const [nombreFirma, setNombreFirma] = useState('')
  const [codigo, setCodigo] = useState('')
  const [otp, setOtp] = useState<{ enviado: boolean; email_parcial?: string } | null>(null)
  const [firmando, setFirmando] = useState(false)
  const [firmaError, setFirmaError] = useState('')
  const [seccion, setSeccion] = useState<Seccion>('inicio')
  // La sección vive en la URL (#documentos / ?seccion=documentos): enlaces y push siguen funcionando.
  useEffect(() => {
    const leer = () => setSeccion(seccionDisponible(seccionDeUrl(location.hash, location.search), !!tieneFichaje))
    leer(); window.addEventListener('hashchange', leer)
    return () => window.removeEventListener('hashchange', leer)
  }, [tieneFichaje])
  function irA(s: Seccion) {
    setSeccion(s)
    try { history.replaceState(null, '', s === 'inicio' ? location.pathname : `#${s}`) } catch { /* solo cambia la vista */ }
    window.scrollTo({ top: 0 })
  }
  const etiqueta = (id: string) => visibles.find(c => c.id === id)?.etiqueta ?? id

  // Abrir un documento marca sus avisos como vistos (y la primera apertura, que ve RR.HH.).
  function marcarVisto(docId: string) {
    const body = JSON.stringify({ documento_id: docId })
    try {
      if (!navigator.sendBeacon?.('/api/e/avisos/visto', body)) {
        fetch('/api/e/avisos/visto', { method: 'POST', body, keepalive: true }).catch(() => {})
      }
    } catch { /* no bloquea abrir el documento */ }
    setAvisos(a => {
      if (!a) return a
      const quedan = a.avisos.map(x => x.documento_id === docId && !x.visto_en ? { ...x, visto_en: new Date().toISOString() } : x)
      const sinVer = new Set(quedan.filter(x => !x.visto_en).map(x => x.documento_id ?? x.id)).size
      return { avisos: quedan, sin_ver: Math.min(a.sin_ver, sinVer) }
    })
  }

  async function recargar() {
    const r = await fetch('/api/e/expediente'); if (r.ok) setDocs((await r.json()).documentos)
  }

  async function abrirFirma(d: Doc) {
    marcarVisto(d.id)
    setFirmarDoc(d); setNombreFirma(''); setCodigo(''); setFirmaError(''); setOtp(null)
    // Pide un código OTP por email (refuerzo). Si no hay email/SMTP, se firma sin él.
    const r = await fetch(`/api/e/expediente/${d.id}/firmar/codigo`, { method: 'POST' })
    setOtp(r.ok ? await r.json() : { enviado: false })
  }

  async function confirmarFirma() {
    if (!firmarDoc) return
    setFirmando(true); setFirmaError('')
    const r = await fetch(`/api/e/expediente/${firmarDoc.id}/firmar`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre_confirmado: nombreFirma, codigo: codigo || undefined }),
    })
    if (r.ok) { setFirmarDoc(null); setNombreFirma(''); setCodigo(''); await recargar() }
    else setFirmaError((await r.json()).error ?? 'No se pudo firmar')
    setFirmando(false)
  }
  async function subir(file: File) {
    setSubiendo(true); setError('')
    const fd = new FormData(); fd.set('carpeta', carpeta); fd.set('file', file)
    const r = await fetch('/api/e/expediente', { method: 'POST', body: fd })
    if (r.ok) await recargar(); else setError((await r.json()).error ?? 'Error')
    setSubiendo(false)
  }

  const marca = marcaCabecera({ nombre: branding?.nombre, logoUrl: branding?.logo_url, color: branding?.color_primario })
  const porFirmarLista = docs.filter(puedeFirmar)
  const porFirmar = porFirmarLista.length
  const secciones: Seccion[] = tieneFichaje ? ['inicio', 'documentos', 'vacaciones', 'fichaje'] : ['inicio', 'documentos', 'vacaciones']
  return (
    <div className="min-h-screen pb-[calc(72px+env(safe-area-inset-bottom))] lg:pb-0" style={marca.estilo}>
      <CabeceraApp perfil="empleado" marca={marca} urlSeguros={urlSeguros} />
    <main className="mx-auto max-w-[520px] lg:max-w-5xl">
      <div className="p-4">

      <NavEmpleado activa={seccion} secciones={secciones} onCambiar={irA} insignias={{ documentos: porFirmar }} />

      {seccion === 'inicio' && (
      <>
      <section aria-labelledby="saludo" className="mb-1 mt-2 rounded-card border border-accent/20 bg-accent-soft px-4 py-4 sm:px-5">
        <h1 id="saludo" className="text-2xl text-accent-ink">{saludoEmpleado(nombreEmpleado)}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {branding?.nombre ? <>Tu portal en <strong className="font-semibold text-ink">{branding.nombre}</strong>.</> : 'Tu portal del empleado.'}
        </p>
      </section>

      <AvisoSeguros />
      <AvisoPushEmpleado endpoint="/api/e/push/subscribe" hayAlgoQueFirmar={porFirmar > 0} />

      {/* Arriba, SOLO lo que pide acción: documentos por firmar y fichar. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-2">
      <div>
      {porFirmar > 0 && (
        <section aria-labelledby="por-firmar" className="my-3 rounded-card border border-accent/40 bg-card p-4">
          <h2 id="por-firmar" className="text-base">{porFirmar === 1 ? 'Tienes 1 documento por firmar' : `Tienes ${porFirmar} documentos por firmar`}</h2>
          <ul className="mt-2 divide-y divide-line">
            {porFirmarLista.slice(0, 5).map(d => (
              <li key={d.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent"><IconoDoc /></span>
                <span className="min-w-0 flex-1 break-words text-sm font-semibold">{d.nombre}</span>
                <Boton onClick={() => abrirFirma(d)} className="shrink-0">Firmar</Boton>
              </li>
            ))}
          </ul>
          {porFirmar > 5 && <button type="button" onClick={() => irA('documentos')} className="mt-2 min-h-[44px] bg-transparent px-0 text-sm text-accent hover:bg-transparent hover:underline">Ver los {porFirmar} en Documentos</button>}
        </section>
      )}
      {porFirmar === 0 && (
        <p className="my-3 rounded-[12px] border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ink">No tienes nada pendiente de firmar.</p>
      )}

      {avisos && avisos.avisos.length > 0 && (
        <section className="my-3 rounded-card border border-line bg-card p-4">
          <button type="button" onClick={() => setVerAvisos(v => !v)}
            className="flex min-h-[44px] w-full items-center justify-between gap-2 bg-transparent p-0 text-left text-ink">
            <span className="text-base font-semibold">Avisos</span>
            {avisos.sin_ver > 0
              ? <span className="rounded-full bg-alert px-2.5 py-0.5 text-xs font-bold text-card">{avisos.sin_ver} sin ver</span>
              : <span className="text-xs text-ink-3">{verAvisos ? 'Ocultar' : 'Ver'}</span>}
          </button>
          {(verAvisos || avisos.sin_ver > 0) && (
            <ul className="mt-2 grid gap-2">
              {avisos.avisos.filter(a => verAvisos || !a.visto_en).slice(0, verAvisos ? 30 : 5).map(a => {
                const d = a.documento_id ? docs.find(x => x.id === a.documento_id) : null
                return (
                  <li key={a.id} className={`rounded-lg border px-3 py-2 text-sm ${a.visto_en ? 'border-line' : 'border-accent bg-accent-soft'}`}>
                    <p className="font-medium">{a.titulo}</p>
                    {a.cuerpo && <p className="text-xs text-ink-2">{a.cuerpo}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                      <span>{new Date(a.creado_at).toLocaleDateString('es-ES')}</span>
                      {d?.url && <a href={d.url} target="_blank" rel="noreferrer" onClick={() => marcarVisto(d.id)} className="text-accent no-underline hover:underline">Abrir documento</a>}
                      {d && puedeFirmar(d) && (
                        <Boton onClick={() => abrirFirma(d)} className="ml-auto">Firmar</Boton>
                      )}
                      {d && d.estado_firma === 'firmado' && <Chip tono="ok">Firmado</Chip>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}


      </div>
      <div>
      {tieneFichaje && <FichajeEmpleado compacto />}
      </div>
      </div>

      <details className="mt-4 text-sm text-ink-3">
        <summary className="inline-flex min-h-[44px] cursor-pointer items-center">Ajustes</summary>
        <div className="pb-2"><ActivarPush endpoint="/api/e/push/subscribe" /></div>
      </details>
      </>
      )}

      {seccion === 'documentos' && (
      <div className="mt-2">
      <section className="my-3 rounded-card border border-line bg-card p-4">
        <h2 className="text-base">Enviar un documento a RR.HH.</h2>
        <p className="mt-0.5 text-xs text-ink-3">Por ejemplo, un parte médico o un cambio de cuenta bancaria. Solo lo ve RR.HH. de tu empresa.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
          <label className="grid gap-1 text-xs font-semibold text-ink-2">Tipo
            <select value={carpeta} onChange={e => setCarpeta(e.target.value)} className="text-sm font-normal">
              {subibles.map(c => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-ink-2">Archivo (PDF o foto)
            <input type="file" disabled={subiendo} className="text-sm font-normal" onChange={e => { const f = e.target.files?.[0]; if (f) subir(f); e.currentTarget.value = '' }} />
          </label>
        </div>
        {subiendo && <p role="status" className="mt-2 text-sm text-ink-3">Subiendo…</p>}
        {error && <p role="alert" className="mt-2 text-sm text-alert">{error}</p>}
      </section>


      <section className="my-3 rounded-card border border-line bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base">Mis documentos</h2>
          {docs.length > 0 && <span className="text-xs text-ink-3">{docs.length === 1 ? '1 documento' : `${docs.length} documentos`}</span>}
        </div>
        {docs.length === 0 ? (
          <div className="mt-3 flex flex-col items-center gap-2 rounded-[12px] border border-dashed border-line-2 px-4 py-6 text-center">
            <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-paper-2 text-ink-3"><IconoDoc /></span>
            <p className="text-sm font-semibold text-ink">Aún no tienes documentos</p>
            <p className="max-w-xs text-xs text-ink-3">Cuando RR.HH. te mande una nómina, un contrato o algo para firmar, aparecerá aquí y te avisaremos.</p>
          </div>
        ) : (
        <ul className="mt-2 divide-y divide-line">
          {docs.map(d => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-1 last:pb-0">
              <span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${puedeFirmar(d) ? 'bg-accent-soft text-accent' : 'bg-paper-2 text-ink-3'}`}><IconoDoc /></span>
              <div className="min-w-0 flex-1">
                {d.url
                  ? <a href={d.url} target="_blank" rel="noreferrer" onClick={() => marcarVisto(d.id)} className="break-words text-sm font-semibold text-ink no-underline hover:text-accent hover:underline">{d.nombre}</a>
                  : <span className="break-words text-sm font-semibold">{d.nombre}</span>}
                <p className="text-xs text-ink-3">{etiqueta(d.carpeta)} · {new Date(d.creada_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
              {puedeFirmar(d) && (
                <Boton onClick={() => abrirFirma(d)} className="shrink-0">Firmar</Boton>
              )}
              {(d.estado_firma === 'pendiente_empresa' || (d.estado_firma === 'pendiente' && d.firmado_empresa_nombre) || d.estado_firma === 'firmado') && (
                <div className="flex w-full flex-wrap items-center gap-2 pl-12">
                  {d.estado_firma === 'pendiente_empresa' && <Chip tono="aviso">En espera de firma empresa</Chip>}
                  {d.estado_firma === 'pendiente' && d.firmado_empresa_nombre && <Chip tono="ok">Firmado por empresa</Chip>}
                  {d.estado_firma === 'firmado' && <Chip tono="ok">Firmado por ambas partes</Chip>}
                  {d.estado_firma === 'firmado' && (
                    <a href={`/v/${d.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center text-xs text-accent underline">Verificar firma</a>
                  )}
                </div>
              )}
              {d.resumen && <p className="w-full pl-12 text-xs text-ink-3">{d.resumen}</p>}
            </li>
          ))}
        </ul>
        )}
      </section>

      </div>
      )}

      {seccion === 'documentos' && <MaterialEmpleado />}

      {seccion === 'vacaciones' && <div className="mt-2"><SolicitudesEmpleado /></div>}

      {seccion === 'fichaje' && tieneFichaje && (
        <div className="mt-2">
          <FichajeEmpleado />
        </div>
      )}

      {firmarDoc && (
        <Modal titulo="Firmar documento" ancho="sm" onCerrar={() => setFirmarDoc(null)}
          pie={<>
            <Boton variante="secundario" onClick={() => setFirmarDoc(null)}>Cancelar</Boton>
            <Boton onClick={confirmarFirma} disabled={firmando || !nombreFirma.trim() || (!!otp?.enviado && codigo.length !== 6)}>
              {firmando ? 'Firmando…' : 'Firmar'}
            </Boton>
          </>}>
          <p className="text-sm font-medium">{firmarDoc.nombre}</p>
          {firmarDoc.firmado_empresa_nombre && (
            <p className="mt-2 rounded-lg bg-ok/10 px-3 py-2 text-xs text-ok">
              La empresa ya firmó este documento ({firmarDoc.firmado_empresa_nombre})
            </p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-ink-2">{CONSENTIMIENTO}</p>
          {otp?.enviado && (
            <>
              <label className="mt-3 block text-xs text-ink-2">
                Código enviado a tu email{otp.email_parcial ? ` (${otp.email_parcial})` : ''}:
              </label>
              <input className="mt-1 w-full tracking-widest" value={codigo} inputMode="numeric" maxLength={6}
                onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))} placeholder="6 dígitos" />
            </>
          )}
          <label className="mt-3 block text-xs text-ink-2">Escribe tu nombre completo para firmar:</label>
          <input className="mt-1 w-full" value={nombreFirma} onChange={e => setNombreFirma(e.target.value)} placeholder="Nombre y apellidos" />
          {firmaError && <p role="alert" className="mt-2 text-alert text-sm">{firmaError}</p>}
        </Modal>
      )}
      </div>
      <PieAsegura />
    </main>
    </div>
  )
}
