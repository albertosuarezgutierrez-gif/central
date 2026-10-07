'use client'

// El bloque de UNA figura de la variante (propietario / conductor habitual / ocasional) en las
// pantallas de pedir precio. Lo comparten `AutoNuevo.tsx` y `MotoNuevo.tsx` (29/09/2026): la lógica
// pura (qué falta, qué viaja al puerto) vive en `figuras-form.ts`.

import { Badge } from '@/components/ui'
import type { RolExtra } from './variante'
import { ROTULO_FIGURA, esCampoFigura, type CampoFigura, type PersonaForm } from './figuras-form'

const input: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 14, minHeight: 44, background: 'var(--surface)', color: 'var(--text)', width: '100%',
}

/** Un papel que ocupa OTRA ficha: su nombre, su estado civil y solo lo que falte en su ficha. */
export function BloqueFigura({
  rol,
  nombre,
  faltan,
  persona,
  onPersona,
  civiles,
  empresa = false,
  soloCondiciones = false,
}: {
  rol: RolExtra
  nombre: string | null
  /** `null` = no se pudo leer su ficha: se deja teclear todo, y lo tecleado manda. */
  faltan: string[] | null
  persona: PersonaForm
  onPersona: (p: PersonaForm) => void
  civiles: { id: string; nombre: string }[]
  /** Su ficha es una EMPRESA: se declara con CIF y razón social, sin estado civil ni nacimiento. */
  empresa?: boolean
  /**
   * Cotizador EMBEBIDO en la oportunidad (07/10/2026): la ficha se edita en «Intervinientes», así que aquí solo se
   * pide lo que es de la COTIZACIÓN (estado civil y, si falta, la fecha del carné de quien conduce). Lo demás que
   * falte se dice y bloquea (`figuraCompleta`), nunca se teclea por segunda vez.
   */
  soloCondiciones?: boolean
}) {
  function set<K extends keyof PersonaForm>(campo: K, valor: PersonaForm[K]) {
    onPersona({ ...persona, [campo]: valor })
  }
  const conCarnet = rol !== 'propietario'
  const pedir = (c: CampoFigura) => (faltan === null ? c !== 'fechaCarnet' || conCarnet : faltan.includes(c))
  const obligatorio = (c: CampoFigura) => faltan !== null && faltan.includes(c)
  const sinFicha = faltan !== null && faltan.some((c) => !esCampoFigura(c))
  // En modo condiciones solo se teclean estado civil y carné: el resto de lo que falte se completa en su ficha.
  const enFicha = soloCondiciones && faltan !== null ? faltan.filter((c) => esCampoFigura(c) && c !== 'fechaCarnet') : []
  const enPantalla = (c: CampoFigura) => !soloCondiciones || c === 'fechaCarnet'
  return (
    <div>
      <p style={{ margin: 0, fontSize: 13 }}>
        <strong>{ROTULO_FIGURA[rol]}:</strong> {nombre ?? 'sin nombre'}{' '}
        <span style={{ color: 'var(--muted)' }}>{empresa ? '(empresa, con su CIF, de su ficha)' : '(de su ficha)'}</span>
      </p>
      {faltan === null && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--warning)' }}>
          No se ha podido leer qué le falta en su ficha. Lo que teclees aquí manda; si falta algo, el servidor lo dirá sin cobrar.
        </p>
      )}
      {sinFicha && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--negative)' }}>
          Su ficha no se puede usar para cotizar ({faltan!.filter((c) => !esCampoFigura(c)).join(', ')}). Cámbialo en la pantalla del riesgo.
        </p>
      )}
      {enFicha.length > 0 && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--negative)' }}>
          A su ficha le falta {enFicha.join(', ')}: complétalo en «Intervinientes» («Editar datos») antes de pedir precio.
        </p>
      )}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', marginTop: 8 }}>
        {!empresa && (
          <Campo etiqueta="Estado civil" falta={persona.estadoCivil === ''} ayuda="La ficha no lo guarda como lo pide la compañía: elígelo.">
            <select value={persona.estadoCivil} onChange={(e) => set('estadoCivil', e.target.value)} style={input}>
              <option value="">Elige estado civil</option>
              {civiles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
        )}
        {enPantalla('dni') && pedir('dni') && (
          <Campo etiqueta={empresa ? 'CIF' : 'DNI/NIF'} falta={obligatorio('dni') && !persona.dni.trim()}>
            <input value={persona.dni} onChange={(e) => set('dni', e.target.value)} style={input} />
          </Campo>
        )}
        {enPantalla('nombre') && pedir('nombre') && (
          <Campo etiqueta={empresa ? 'Razón social' : 'Nombre'} falta={obligatorio('nombre') && !persona.nombre.trim()}>
            <input value={persona.nombre} onChange={(e) => set('nombre', e.target.value)} style={input} />
          </Campo>
        )}
        {!empresa && enPantalla('apellido1') && pedir('apellido1') && (
          <Campo etiqueta="Primer apellido" falta={obligatorio('apellido1') && !persona.apellido1.trim()}>
            <input value={persona.apellido1} onChange={(e) => set('apellido1', e.target.value)} style={input} />
          </Campo>
        )}
        {!empresa && enPantalla('fechaNacimiento') && pedir('fechaNacimiento') && (
          <Campo etiqueta="Fecha de nacimiento" falta={obligatorio('fechaNacimiento') && !persona.fechaNacimiento}>
            <input type="date" value={persona.fechaNacimiento} onChange={(e) => set('fechaNacimiento', e.target.value)} style={input} />
          </Campo>
        )}
        {!empresa && enPantalla('sexo') && pedir('sexo') && (
          <Campo etiqueta="Sexo" falta={obligatorio('sexo') && persona.sexo === ''}>
            <select value={persona.sexo} onChange={(e) => set('sexo', e.target.value as PersonaForm['sexo'])} style={input}>
              <option value="">Elige</option>
              <option value="hombre">Hombre</option>
              <option value="mujer">Mujer</option>
            </select>
          </Campo>
        )}
        {enPantalla('telefono') && pedir('telefono') && (
          <Campo etiqueta="Móvil" falta={obligatorio('telefono') && !persona.telefono.trim()}>
            <input value={persona.telefono} onChange={(e) => set('telefono', e.target.value)} style={input} />
          </Campo>
        )}
        {!empresa && conCarnet && pedir('fechaCarnet') && (
          <Campo etiqueta="Fecha del carnet" falta={obligatorio('fechaCarnet') && !persona.fechaCarnet} ayuda="Es SU carnet, no el del tomador.">
            <input type="date" value={persona.fechaCarnet} onChange={(e) => set('fechaCarnet', e.target.value)} style={input} />
          </Campo>
        )}
      </div>
    </div>
  )
}

function Campo({ etiqueta, falta, ayuda, children }: { etiqueta: string; falta: boolean; ayuda?: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        <span>{etiqueta}</span>
        {falta && <Badge tono="aviso">falta</Badge>}
      </label>
      {children}
      {ayuda && <span style={{ color: 'var(--muted)', fontSize: 12, display: 'block', marginTop: 4 }}>{ayuda}</span>}
    </div>
  )
}
