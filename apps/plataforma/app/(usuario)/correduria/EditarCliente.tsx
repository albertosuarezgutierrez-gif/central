'use client'
import { useEffect, useState } from 'react'
import { ibanValido, type EdicionCliente } from '@central/module-seguros'
import { AlertTriangle, CheckCircle2, CreditCard } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import { Ico, FILA } from './iconos'
import {
  interpretarCuentaFicha,
  interpretarPonerCuenta,
  textoMotivo,
  type CuentaFichaLeida,
  type ResultadoCuentaFicha,
} from '@/lib/cliente-edicion-asegura'

// Piezas sueltas de la edición de la ficha. La identidad, la dirección y los carnés se editan en UN
// solo panel (`PanelDatosCliente`, cliente/[id]); aquí quedan la cuenta de cargo y los helpers/estilos
// que ese panel y la pestaña Contactos comparten.

// ─── Cuenta de cargo ─────────────────────────────────────────────────────────

/**
 * La cuenta de la FICHA (29/09/2026): la que leen la emisión y el bot de Telegram. Alberto la recibe
 * en foto o por WhatsApp y hasta hoy no tenía dónde ponerla. Solo se ve enmascarada («**** 0115») y el
 * IBAN tecleado no se queda en pantalla tras guardarlo.
 *
 * Un cliente puede pagar cada seguro de una cuenta distinta: eso vive en cada póliza
 * (`polizas.cuenta_bancaria`) y esto NO lo toca. La de la ficha es la cuenta por defecto para lo NUEVO.
 */
export function CuentaCargo({ clienteId }: { clienteId: string }) {
  const [leida, setLeida] = useState<CuentaFichaLeida | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [iban, setIban] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<ResultadoCuentaFicha | null>(null)

  useEffect(() => {
    let vivo = true
    fetch(`/api/correduria/cliente/cuenta?id=${encodeURIComponent(clienteId)}`, { cache: 'no-store' })
      .then(async (res) => interpretarCuentaFicha(res.status, await res.json().catch(() => null)))
      .catch((): CuentaFichaLeida => ({ estado: 'error', motivo: 'red' }))
      .then((r) => { if (vivo) setLeida(r) })
    return () => { vivo = false }
  }, [clienteId])

  const tecleadoValido = ibanValido(iban)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!tecleadoValido) return setResultado({ estado: 'iban_invalido', motivo: 'Ese IBAN no es válido (revisa los dígitos de control).' })
    setOcupado(true)
    try {
      const res = await fetch('/api/correduria/cliente/cuenta', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: clienteId, iban }),
      })
      const r = interpretarPonerCuenta(res.status, await res.json().catch(() => null))
      setResultado(r)
      if (r.estado === 'ok') {
        setIban('')
        setAbierto(false)
        setLeida({ estado: 'ok', mascara: r.mascara, ilegible: false, invalida: false })
      }
    } catch {
      setResultado({ estado: 'error', motivo: 'red' })
    } finally {
      setOcupado(false)
    }
  }

  const tiene = leida?.estado === 'ok' && (leida.mascara !== null || leida.ilegible)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 13, color: 'var(--muted)', minWidth: 0 }}>
        <CreditCard size={14} strokeWidth={1.75} aria-hidden style={{ flex: '0 0 auto', marginTop: 2 }} />
        <span style={{ overflowWrap: 'anywhere' }}>
          {leida === null ? 'Cuenta para pólizas nuevas: consultando…'
            : leida.estado === 'error' ? `Cuenta para pólizas nuevas: no se ha podido consultar (${textoMotivo(leida.motivo)}). No la leas como «no tiene».`
              : leida.mascara && leida.invalida ? `Cuenta para pólizas nuevas: ${leida.mascara}, pero NO es un IBAN válido (cuenta antigua): la emisión no la usará. Pon la buena.`
              : leida.mascara ? `Cuenta para pólizas nuevas: ${leida.mascara}`
                : leida.ilegible ? 'Cuenta para pólizas nuevas guardada pero cifrada: no se puede leer. Si pones otra, la sustituye.'
                  : 'Sin cuenta para pólizas nuevas en la ficha (se ha mirado).'}
        </span>
      </div>
      {resultado?.estado === 'ok' && (
        <div style={{ ...FILA, fontSize: 13, color: 'var(--positive)' }}><Ico i={CheckCircle2} /> Guardada: {resultado.mascara}. Ya la pueden usar la emisión y el bot.</div>
      )}
      {resultado?.estado === 'sin_cambios' && (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Esa cuenta ya era la de la ficha: no se ha cambiado nada.</div>
      )}
      {leida?.estado !== 'error' && (
        <div>
          <button type="button" onClick={() => { setAbierto((v) => !v); setResultado(null) }} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>
            {abierto ? 'Cancelar' : tiene ? 'Cambiar cuenta' : 'Poner cuenta'}
          </button>
        </div>
      )}
      {abierto && (
        <form onSubmit={guardar} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          <Campo label="IBAN" mal={resultado?.estado === 'iban_invalido'} ayuda="Es la que se usa al emitir una póliza nueva (también por Telegram). Cada póliza que ya tiene conserva su propia cuenta: esto no la cambia.">
            <input
              value={iban}
              onChange={(e) => { setIban(e.target.value); setResultado(null) }}
              autoComplete="off"
              spellCheck={false}
              placeholder="ES00 0000 0000 0000 0000 0000"
              style={campo}
            />
          </Campo>
          {iban.trim() !== '' && !tecleadoValido && (
            <div style={{ fontSize: 12, color: 'var(--negative)' }}>Todavía no es un IBAN válido (dígitos de control).</div>
          )}
          {resultado?.estado === 'iban_invalido' && (
            <div style={{ ...FILA, fontSize: 13, color: 'var(--negative)' }}><Ico i={AlertTriangle} /> {resultado.motivo}</div>
          )}
          {resultado?.estado === 'presupuesto_firmado' && (
            <div style={{ ...FILA, fontSize: 13, color: 'var(--negative)' }}><Ico i={AlertTriangle} /> No se ha cambiado: el cliente firmó la cuenta {resultado.mascara} en un presupuesto aceptado que aún no se ha emitido. Emítelo con esa cuenta o retíralo antes.</div>
          )}
          {resultado?.estado === 'error' && (
            <div style={{ ...FILA, fontSize: 13, color: 'var(--negative)' }}><Ico i={AlertTriangle} /> No se ha guardado: {textoMotivo(resultado.motivo)}</div>
          )}
          <div>
            <button type="submit" disabled={ocupado || !tecleadoValido} style={btnStyle('primario')}>{ocupado ? 'Guardando…' : 'Guardar cuenta'}</button>
          </div>
        </form>
      )}
    </div>
  )
}

// ─── Identidad ───────────────────────────────────────────────────────────────

export type Ident = { nombre: string; apellidos: string; dni: string; fechaNacimiento: string }

export const MOTIVOS_RAPIDOS = [
  'Confirmado con el cliente por teléfono',
  'Errata al dar de alta',
  'Dato de la póliza de la compañía',
] as const

const colapsar = (v: string) => v.replace(/\s+/g, ' ').trim()

/** Lo que el usuario ha tocado, comparando sin espacios de más (un espacio no es un cambio). */
export function identTocada(f: Ident, inicial: Ident): NonNullable<EdicionCliente['identidad']> {
  const ident: NonNullable<EdicionCliente['identidad']> = {}
  if (colapsar(f.nombre) !== colapsar(inicial.nombre)) ident.nombre = f.nombre
  if (colapsar(f.apellidos) !== colapsar(inicial.apellidos)) ident.apellidos = colapsar(f.apellidos) === '' ? null : f.apellidos
  if (f.dni.trim() !== '') ident.dni = f.dni
  if (f.fechaNacimiento !== inicial.fechaNacimiento) ident.fechaNacimiento = f.fechaNacimiento.trim() === '' ? null : f.fechaNacimiento
  return ident
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

export function Campo({ label, mal, ayuda, children }: { label: string; mal?: boolean; ayuda?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: mal ? 'var(--negative)' : 'var(--muted)', fontWeight: 600 }}>{label}{mal ? ' ·  revisa este campo' : ''}</span>
      {children}
      {ayuda && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{ayuda}</span>}
    </label>
  )
}

export const h3: React.CSSProperties = { margin: 0, fontSize: 13, fontWeight: 700 }
export const campo: React.CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14,
}
export const avisoAmbar: React.CSSProperties = {
  fontSize: 13, lineHeight: 1.5, color: 'var(--warning)', background: 'var(--warning-bg)', border: '1px solid var(--warning)', borderRadius: 8, padding: '8px 10px',
}
export const pendienteBox: React.CSSProperties = {
  fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 8, padding: '8px 10px',
}
