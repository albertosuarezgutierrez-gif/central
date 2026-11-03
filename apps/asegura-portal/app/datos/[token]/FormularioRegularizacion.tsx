'use client'
import { useState } from 'react'
import { eurDeCentimos, importeEspanol, textoPeriodo, validarRespuestaRegularizacion, type PeriodoRegularizacion } from '@central/module-seguros/regularizacion-rc'
import { encogerSiHaceFalta } from '@/lib/encoger-imagen'
import { interpretarDocSubido } from '@/lib/solicitud-datos'

type Estado = { tipo: 'editando' } | { tipo: 'enviando' } | { tipo: 'hecho' } | { tipo: 'fallo'; texto: string }
type Campo = 'facturacion' | 'empleados' | 'masaSalarial'

/**
 * Regularización de RC (03/11/2026): la facturación real del periodo, y opcionalmente empleados, masa salarial y un
 * documento (modelo 390 o cuentas). Pública por token, como el enlace del presupuesto: aquí NO se enseña nada del
 * cliente (ni nombre, ni póliza, ni importes guardados). Responsive ≥320 px: una columna, campos al 100 %, botones ≥44 px.
 */
export default function FormularioRegularizacion({ token, periodo, documentoYaSubido }: { token: string; periodo: PeriodoRegularizacion; documentoYaSubido: boolean }) {
  const [valores, setValores] = useState<Record<Campo, string>>({ facturacion: '', empleados: '', masaSalarial: '' })
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({})
  const [estado, setEstado] = useState<Estado>({ tipo: 'editando' })
  const [doc, setDoc] = useState<{ estado: 'nada' | 'subiendo' | 'ok' | 'fallo'; texto: string }>(documentoYaSubido ? { estado: 'ok', texto: 'Ya nos has enviado un documento.' } : { estado: 'nada', texto: '' })

  const poner = (k: Campo, v: string) => {
    setValores((x) => ({ ...x, [k]: v }))
    setErrores((x) => ({ ...x, [k]: undefined }))
  }

  /** Eco de la cifra en formato español («125.000,00€») para que vea lo que va a mandar. */
  const eco = (k: 'facturacion' | 'masaSalarial') => {
    const n = importeEspanol(valores[k])
    return n === null || Number.isNaN(n) ? null : eurDeCentimos(Math.round(n * 100))
  }

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setDoc({ estado: 'subiendo', texto: `Subiendo «${f.name}»…` })
    try {
      const fichero = await encogerSiHaceFalta(f)
      const form = new FormData()
      form.set('token', token)
      form.set('documento', fichero, fichero.name || 'documento')
      form.set('motivo', 'regularizacion_rc')
      const res = await fetch('/api/datos/documento', { method: 'POST', body: form })
      const r = interpretarDocSubido(res.status, await res.json().catch(() => null))
      setDoc(r.estado === 'ok' ? { estado: 'ok', texto: `«${f.name}» recibido.` } : { estado: 'fallo', texto: r.texto })
    } catch {
      setDoc({ estado: 'fallo', texto: 'No se ha podido subir. Vuelve a probar en un momento.' })
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    // La misma validación que hará asegura: los errores se ven antes de enviar.
    const v = validarRespuestaRegularizacion(valores)
    if (!v.ok) { setErrores(v.errores); return }
    setEstado({ tipo: 'enviando' })
    try {
      const res = await fetch('/api/datos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, motivo: 'regularizacion_rc', regularizacion: valores }),
      })
      const j = (await res.json().catch(() => null)) as { errores?: Partial<Record<Campo, string>> } | null
      if (res.ok) { setEstado({ tipo: 'hecho' }); return }
      if (res.status === 422 && j?.errores) { setErrores(j.errores); setEstado({ tipo: 'editando' }); return }
      if (res.status === 410) { setEstado({ tipo: 'fallo', texto: 'Este enlace ya no sirve (caducado o ya contestado). Escríbenos y te mandamos uno nuevo.' }); return }
      if (res.status === 429) { setEstado({ tipo: 'fallo', texto: 'Demasiados intentos. Espera unos minutos.' }); return }
      setEstado({ tipo: 'fallo', texto: 'No se ha podido enviar. Es un fallo nuestro: vuelve a probar en un rato.' })
    } catch {
      setEstado({ tipo: 'fallo', texto: 'No se ha podido enviar. Comprueba tu conexión y vuelve a probar.' })
    }
  }

  if (estado.tipo === 'hecho') {
    return <p className="suave" role="status">¡Recibido! Gracias: con esto preparamos la regularización con la compañía y te contamos.</p>
  }

  const enviando = estado.tipo === 'enviando'
  const campo = (k: Campo, rotulo: string, ayuda: string, opcional: boolean, modo: 'decimal' | 'numeric', ej: string) => {
    const id = `reg-${k}`
    const err = errores[k]
    const vista = k === 'empleados' ? null : eco(k)
    return (
      <div className="editor-campo">
        <label htmlFor={id}>
          {rotulo}
          {opcional && <span className="suave"> (opcional)</span>}
        </label>
        <span className="editor-ayuda" id={`${id}-ayuda`}>{ayuda}</span>
        <input
          id={id}
          className="campo"
          inputMode={modo}
          autoComplete="off"
          maxLength={20}
          placeholder={ej}
          value={valores[k]}
          disabled={enviando}
          aria-invalid={err ? true : undefined}
          aria-describedby={`${id}-ayuda`}
          onChange={(e) => poner(k, e.target.value)}
          style={{ width: '100%', minHeight: 44 }}
        />
        {vista && !err && <span className="editor-ayuda">Lo leemos como {vista}</span>}
        {err && <span className="editor-error" role="alert">{err}</span>}
      </div>
    )
  }

  return (
    <form onSubmit={enviar} noValidate className="datos-form">
      {campo('facturacion', `Facturación del periodo ${textoPeriodo(periodo)}`, 'El total facturado por tu actividad en ese periodo, sin IVA.', false, 'decimal', '125.000,00')}
      {campo('empleados', 'Número de empleados', 'Si la compañía tarifica también por plantilla.', true, 'numeric', '3')}
      {campo('masaSalarial', 'Masa salarial del periodo', 'Total de salarios brutos pagados en el periodo.', true, 'decimal', '48.000,00')}

      <div className="editor-campo datos-subida">
        <span className="datos-subida-titulo">📎 Documento (opcional)</span>
        <span className="editor-ayuda">El resumen anual de IVA (modelo 390) o las cuentas del periodo. Foto o PDF.</span>
        {doc.estado !== 'ok' && (
          <label htmlFor="reg-doc" className="boton-tenue" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', justifySelf: 'start', maxWidth: '100%', cursor: doc.estado === 'subiendo' ? 'wait' : 'pointer' }}>
            {doc.estado === 'subiendo' ? 'Subiendo…' : 'Elegir fichero'}
          </label>
        )}
        <input id="reg-doc" type="file" accept="image/*,application/pdf" onChange={subir} disabled={doc.estado === 'subiendo' || doc.estado === 'ok' || enviando} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }} />
        {doc.texto && <span className={doc.estado === 'fallo' ? 'editor-error' : 'editor-ayuda'} role={doc.estado === 'fallo' ? 'alert' : 'status'} style={{ overflowWrap: 'anywhere' }}>{doc.texto}</span>}
      </div>

      {estado.tipo === 'fallo' && <p className="editor-error" role="alert">{estado.texto}</p>}
      <p className="suave" style={{ margin: 0, fontSize: 13 }}>
        Lo que nos indiques lo revisamos antes de enviarlo a la compañía. Si tienes dudas, contesta al correo.
      </p>
      <button type="submit" className="boton" style={{ minHeight: 48, width: '100%' }} disabled={enviando || doc.estado === 'subiendo'}>
        {enviando ? 'Enviando…' : 'Enviar'}
      </button>
    </form>
  )
}
