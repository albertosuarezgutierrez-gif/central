'use client'
// «Escanear un documento» (13/10/2026): foto o PDF de un recibo/carta de la compañía → la IA lo
// clasifica y PROPONE a qué póliza suya va → la persona confirma → se archiva. Sin key de IA el
// servidor responde `ia:false` y se archiva a mano (se elige el tipo y la póliza). Una carta de
// impago deja SIEMPRE el aviso «Contacta con tu corredor». No pide ningún permiso del navegador.
import { useEffect, useId, useRef, useState } from 'react'

import { eur } from '@/lib/dinero'
import { encogerSiHaceFalta } from '@/lib/encoger-imagen'
import { ETIQUETA_TIPO_ESCANER, TIPOS_ESCANER, polizaTrasLectura, type LecturaEscaner, type PolizaCandidata, type PropuestaPoliza, type TipoEscaner } from '@/lib/escaner-documento'

// Vercel corta el cuerpo a 4,5 MB antes de llegar a la ruta.
const MAX_BYTES = 4 * 1024 * 1024

type Respuesta = { ia: false } | { ia: true; legible: boolean; lectura: LecturaEscaner; propuesta: PropuestaPoliza | null; polizas: PolizaCandidata[] | null }
type Fase = 'reposo' | 'leyendo' | 'confirmar' | 'archivando' | 'hecho'

const MOTIVO_TEXTO: Record<PropuestaPoliza['motivo'], string> = {
  numero: 'Coincide el número de póliza.',
  compania: 'Coincide la compañía.',
  ambigua: 'Podría ser de varias: elige la tuya.',
  sin_coincidencia: 'No hemos podido saber de cuál es: elígela si quieres.',
}

/**
 * `polizaFija` (opcional): id con prefijo (`d:<id>` declarada, `c:<id>` cartera) de la póliza contra la que se archiva
 * SIEMPRE; sin él, la elige la persona (con la propuesta de la IA).
 */
export function EscanerDocumento({ polizaFija }: { polizaFija?: string } = {}) {
  const uid = useId()
  const entrada = useRef<HTMLInputElement>(null)
  const [fase, setFase] = useState<Fase>('reposo')
  const [fichero, setFichero] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ia, setIa] = useState(true)
  const [legible, setLegible] = useState(true)
  const [tipo, setTipo] = useState<TipoEscaner | ''>('')
  const [fecha, setFecha] = useState('')
  const [importeTxt, setImporteTxt] = useState('')
  const [polizas, setPolizas] = useState<PolizaCandidata[]>([])
  const [polizaId, setPolizaId] = useState('')
  const [motivo, setMotivo] = useState<PropuestaPoliza['motivo'] | null>(null)
  const [fin, setFin] = useState<{ archivado: boolean; aviso: string | null } | null>(null)
  const primerCampo = useRef<HTMLSelectElement>(null)
  const mensajeFinal = useRef<HTMLParagraphElement>(null)
  const faseAnterior = useRef<Fase>('reposo')

  // Al cambiar de fase, el foco va a lo nuevo: al primer campo tras leer, al mensaje final tras guardar.
  // (Volver a «confirmar» por un error de archivado no mueve el foco: el error ya se anuncia con role=alert.)
  useEffect(() => {
    const antes = faseAnterior.current
    faseAnterior.current = fase
    if (fase === 'confirmar' && antes === 'leyendo') primerCampo.current?.focus()
    if (fase === 'hecho') mensajeFinal.current?.focus()
  }, [fase])

  function reiniciar() {
    setFase('reposo'); setFichero(null); setError(null); setTipo(''); setFecha(''); setImporteTxt('')
    setPolizas([]); setPolizaId(''); setMotivo(null); setFin(null); setIa(true); setLegible(true)
    if (entrada.current) entrada.current.value = ''
  }

  async function elegido(f: File | undefined) {
    if (!f) return
    setError(null)
    const listo = await encogerSiHaceFalta(f)
    if (listo.size > MAX_BYTES) {
      setError('El fichero pesa demasiado (máximo 4 MB). Haz la foto más cerca o usa un PDF más ligero.')
      return
    }
    setFichero(listo)
    setFase('leyendo')
    try {
      const body = new FormData()
      body.append('documento', listo)
      const r = await fetch('/api/documentos/escanear', { method: 'POST', body })
      if (r.status === 429) throw new Error('Has escaneado muchos documentos hoy. Vuelve a intentarlo mañana.')
      if (!r.ok) throw new Error('No hemos podido leer el documento. Prueba con otra foto.')
      const j = (await r.json()) as Respuesta
      setPolizas(j.ia ? j.polizas ?? [] : [])
      if (!j.ia) {
        // Sin IA: se archiva a mano. No es un error.
        setIa(false)
        setPolizaId(polizaTrasLectura(polizaFija, null))
      } else {
        setLegible(j.legible)
        setTipo(j.lectura.tipo ?? '')
        setFecha(j.lectura.fecha ?? '')
        setImporteTxt(j.lectura.importe !== null ? String(j.lectura.importe).replace('.', ',') : '')
        setPolizaId(polizaTrasLectura(polizaFija, j.propuesta?.polizaId))
        setMotivo(j.propuesta?.motivo ?? null)
      }
      setFase('confirmar')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No hemos podido leer el documento.')
      setFase('reposo')
    }
  }

  async function archivar() {
    if (!fichero || tipo === '') return
    setFase('archivando')
    setError(null)
    try {
      const body = new FormData()
      body.append('documento', fichero)
      body.append('tipo', tipo)
      if (polizaId) body.append('polizaId', polizaId)
      if (fecha) body.append('fecha', fecha)
      if (importeTxt.trim()) body.append('importe', importeTxt.trim())
      const r = await fetch('/api/documentos/archivar', { method: 'POST', body })
      if (!r.ok) throw new Error('No hemos podido archivarlo. Inténtalo de nuevo.')
      const j = (await r.json()) as { archivado: boolean; aviso: string | null }
      setFin({ archivado: j.archivado, aviso: j.aviso })
      setFase('hecho')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No hemos podido archivarlo.')
      setFase('confirmar')
    }
  }

  const importeNum = Number(importeTxt.replace(/\./g, '').replace(',', '.'))

  return (
    <section className="editor-campo" style={{ minWidth: 0 }}>
      {fase === 'reposo' && (
        <>
          <button type="button" className="boton secundario" style={{ minHeight: 44 }} onClick={() => entrada.current?.click()}>
            Escanear un documento
          </button>
          <p className="editor-ayuda">Una foto o un PDF de un recibo o una carta de tu compañía. Te proponemos de qué póliza es y tú confirmas antes de guardarlo.</p>
        </>
      )}
      <input ref={entrada} type="file" accept="image/*,application/pdf" hidden onChange={(e) => void elegido(e.target.files?.[0])} />
      {fase === 'leyendo' && <p className="editor-ayuda" role="status" aria-live="polite">Leyendo el documento…</p>}
      {(fase === 'confirmar' || fase === 'archivando') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
          {!ia && <p className="editor-ayuda" role="status" aria-live="polite">La lectura automática no está disponible ahora. Puedes guardarlo indicando tú qué es.</p>}
          {ia && !legible && <p className="editor-ayuda" role="status" aria-live="polite">No hemos podido leer el documento. Puedes guardarlo indicando tú qué es.</p>}
          <div>
            <label htmlFor={`${uid}-tipo`}>¿Qué es?</label>
            <select ref={primerCampo} id={`${uid}-tipo`} className="campo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoEscaner | '')} style={{ minHeight: 44 }}>
              <option value="">Elige…</option>
              {TIPOS_ESCANER.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_ESCANER[t]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-poliza`}>¿De qué póliza?</label>
            {polizaFija ? (
              <p className="editor-ayuda" style={{ margin: 0 }}>De la póliza que acabas de subir.</p>
            ) : (<>
            {motivo !== null && <p className="editor-ayuda">{MOTIVO_TEXTO[motivo]}</p>}
            <select id={`${uid}-poliza`} className="campo" value={polizaId} onChange={(e) => setPolizaId(e.target.value)} style={{ minHeight: 44 }}>
              <option value="">Ninguna en concreto</option>
              {polizas.map((p) => <option key={p.id} value={p.id}>{[p.compania ?? 'Compañía sin leer', p.numeroPoliza].filter(Boolean).join(' · ')}</option>)}
            </select>
            </>)}
          </div>
          <div>
            <label htmlFor={`${uid}-fecha`}>Fecha (opcional)</label>
            <input id={`${uid}-fecha`} className="campo" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ minHeight: 44 }} />
          </div>
          <div>
            <label htmlFor={`${uid}-importe`}>Importe en € (opcional)</label>
            <input id={`${uid}-importe`} className="campo" inputMode="decimal" value={importeTxt} onChange={(e) => setImporteTxt(e.target.value)} style={{ minHeight: 44 }} />
            {Number.isFinite(importeNum) && importeNum > 0 && <p className="editor-ayuda">{eur(importeNum)}</p>}
          </div>
          {ia && legible && <p className="editor-ayuda" role="status" aria-live="polite">Lo hemos leído de tu documento; revisa que sea correcto. No es un dato confirmado por tu compañía.</p>}
          {tipo === 'carta_impago' && <p className="editor-error" role="alert">Contacta con tu corredor: una carta de impago puede acabar en la baja de la póliza.</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="boton" style={{ minHeight: 44 }} onClick={() => void archivar()} disabled={tipo === '' || fase === 'archivando'}>
              {fase === 'archivando' ? 'Guardando…' : 'Confirmar y guardar'}
            </button>
            <button type="button" className="boton secundario" style={{ minHeight: 44 }} onClick={reiniciar} disabled={fase === 'archivando'}>Cancelar</button>
          </div>
        </div>
      )}
      {fase === 'hecho' && fin && (
        <>
          <p ref={mensajeFinal} tabIndex={-1} className="editor-ayuda" role="status" aria-live="polite">{fin.archivado ? 'Documento guardado.' : 'No hemos podido guardar el fichero ahora mismo; inténtalo más tarde.'}</p>
          {fin.aviso && <p className="editor-error" role="alert">{fin.aviso}</p>}
          <button type="button" className="boton secundario" style={{ minHeight: 44 }} onClick={reiniciar}>Escanear otro</button>
        </>
      )}
      {error && <p className="editor-error" role="alert">{error}</p>}
    </section>
  )
}
