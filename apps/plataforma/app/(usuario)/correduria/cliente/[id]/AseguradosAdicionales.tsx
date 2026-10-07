'use client'

// Asegurados ADICIONALES de salud y decesos (`risk.insureds[1..]`). El tomador es siempre el
// primero y no se repite aquí. De cada uno se recoge lo que el esquema documenta y la pantalla
// puede dar: nombre, apellidos, fecha de nacimiento, sexo y DNI (opcional). Parentesco, capital
// por persona y cualquier otro dato NO existen en `HealthRisk_V1`/`BurialRisk_V1`: no se piden.
// Si el vendor exige algo más de un asegurado (`person-roles`), el servidor lo devuelve como
// «dato que falta» y no cotiza.

import { btnStyle, cardStyle } from '@/components/ui'
import type { AseguradoAdicional } from '@central/module-seguros'

export type AseguradoForm = {
  nombre: string
  apellido1: string
  apellido2: string
  fechaNacimiento: string
  sexo: '' | 'hombre' | 'mujer'
  dni: string
  nacionalidad: string
}

export const ASEGURADO_VACIO: AseguradoForm = { nombre: '', apellido1: '', apellido2: '', fechaNacimiento: '', sexo: '', dni: '', nacionalidad: '' }

const input: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 14, minHeight: 44, background: 'var(--surface)', color: 'var(--text)', width: '100%',
}

/**
 * Los asegurados anotados en el riesgo (`datosCapital.asegurados`) como filas del formulario; `null` = ninguno anotado.
 * 🔒 El riesgo no guarda DNI/NIE ni nacionalidad: salen vacíos y se teclean aquí si la compañía los exige.
 */
export function aseguradosDeRiesgo(l: readonly AseguradoAdicional[] | null | undefined): AseguradoForm[] {
  return (l ?? []).map((a) => ({
    nombre: a.nombre, apellido1: a.apellido1, apellido2: a.apellido2 ?? '', fechaNacimiento: a.fechaNacimiento, sexo: a.sexo,
    dni: '', nacionalidad: '',
  }))
}

/** ¿Está completo lo mínimo de uno? (el servidor revisa el resto: DNI, letra, NIE…). */
export function aseguradoCompleto(a: AseguradoForm): boolean {
  return a.nombre.trim() !== '' && a.apellido1.trim() !== '' && a.fechaNacimiento !== '' && a.sexo !== ''
}

/** Lo que viaja en `resueltos.asegurados`: solo claves con valor. */
export function aseguradosParaEnviar(lista: AseguradoForm[]): Record<string, string>[] {
  return lista.map((a) => {
    const o: Record<string, string> = {}
    for (const [k, v] of Object.entries(a)) if (v.trim() !== '') o[k] = v.trim()
    return o
  })
}

export default function AseguradosAdicionales({
  lista,
  onChange,
  deshabilitado = false,
  sinDni = false,
}: {
  lista: AseguradoForm[]
  onChange: (l: AseguradoForm[]) => void
  deshabilitado?: boolean
  /** En «Datos del riesgo» de la oportunidad no se pide ni se guarda el DNI (se teclea al pedir precio). */
  sinDni?: boolean
}) {
  const cambiar = (i: number, parte: Partial<AseguradoForm>) => onChange(lista.map((a, j) => (j === i ? { ...a, ...parte } : a)))
  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 8px' }}>
        Asegurados además del tomador (viajan en <code>insureds[]</code>). Parentesco y capital por persona no existen en la API: no se piden.
        {sinDni && ' El DNI no se guarda en el riesgo: se teclea al pedir precio si la compañía lo exige.'}
      </p>
      {lista.map((a, i) => (
        <div key={i} style={{ ...cardStyle, padding: 12, marginBottom: 10 }}>
          <p style={{ fontWeight: 700, fontSize: 13, margin: '0 0 8px' }}>Asegurado adicional {i + 1}</p>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <Celda etiqueta="Nombre" falta={a.nombre.trim() === ''}>
              <input value={a.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} style={input} />
            </Celda>
            <Celda etiqueta="Primer apellido" falta={a.apellido1.trim() === ''}>
              <input value={a.apellido1} onChange={(e) => cambiar(i, { apellido1: e.target.value })} style={input} />
            </Celda>
            <Celda etiqueta="Segundo apellido" ayuda="Obligatorio si das DNI.">
              <input value={a.apellido2} onChange={(e) => cambiar(i, { apellido2: e.target.value })} style={input} />
            </Celda>
            <Celda etiqueta="Fecha de nacimiento" falta={a.fechaNacimiento === ''}>
              <input type="date" value={a.fechaNacimiento} onChange={(e) => cambiar(i, { fechaNacimiento: e.target.value })} style={input} />
            </Celda>
            <Celda etiqueta="Sexo" falta={a.sexo === ''}>
              <select value={a.sexo} onChange={(e) => cambiar(i, { sexo: e.target.value as AseguradoForm['sexo'] })} style={input}>
                <option value="">Elige</option>
                <option value="hombre">Hombre</option>
                <option value="mujer">Mujer</option>
              </select>
            </Celda>
            {!sinDni && (
            <Celda etiqueta="DNI / NIE (opcional)" ayuda="Solo si el vendor no lo exige puede quedar vacío; si lo exige, el servidor lo dirá sin gastar.">
              <input value={a.dni} onChange={(e) => cambiar(i, { dni: e.target.value })} style={input} />
            </Celda>
            )}
            {!sinDni && /^[XYZxyz]/.test(a.dni.trim()) && (
              <Celda etiqueta="Nacionalidad (ISO de 3 letras)" falta={a.nacionalidad.trim() === ''}>
                <input value={a.nacionalidad} onChange={(e) => cambiar(i, { nacionalidad: e.target.value })} placeholder="MAR" style={input} />
              </Celda>
            )}
          </div>
          <button type="button" disabled={deshabilitado} onClick={() => onChange(lista.filter((_, j) => j !== i))} style={{ ...btnStyle('secundario'), marginTop: 10 }}>
            Quitar este asegurado
          </button>
        </div>
      ))}
      <button type="button" disabled={deshabilitado} onClick={() => onChange([...lista, { ...ASEGURADO_VACIO }])} style={btnStyle('secundario')}>
        Añadir asegurado
      </button>
    </div>
  )
}

function Celda({ etiqueta, falta = false, ayuda, children }: { etiqueta: string; falta?: boolean; ayuda?: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        {etiqueta}{falta && <span style={{ color: 'var(--warning)', fontWeight: 600 }}> · falta</span>}
      </label>
      {children}
      {ayuda && <span style={{ color: 'var(--muted)', fontSize: 12, display: 'block', marginTop: 4 }}>{ayuda}</span>}
    </div>
  )
}
