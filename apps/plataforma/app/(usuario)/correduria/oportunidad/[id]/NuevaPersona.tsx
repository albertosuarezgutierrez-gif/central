'use client'

// «+ Nueva persona» dentro del riesgo: alta (lead) + vínculo con el cliente + asignada al papel, en un
// solo paso y sin salir de la pantalla. Pide lo que la compañía exige y nada más. Si el DNI ya existe,
// asegura usa esa ficha en vez de crear otra (misma persona = misma ficha). Si va a CONDUCIR un coche o
// una moto, pide también su carné (fecha, y tipo en moto): Avant2 no da precio sin él.

import { useState } from 'react'
import { btnStyle, cardStyle } from '@/components/ui'
import { TIPOS_RELACION, SIN_VINCULO, type RolFigura } from '@central/module-seguros'
import { ROTULO_ROL } from '@/lib/riesgo-asegura'
import { llamarFiguras, motivoDe } from './piezas-riesgo'

const RELACIONES = TIPOS_RELACION.filter((t) => t !== SIN_VINCULO)

const campo: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, minHeight: 44,
  background: 'var(--surface)', color: 'var(--text)', width: '100%',
}
const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }

type Form = {
  nombre: string; apellidos: string; dni: string; fechaNacimiento: string; telefono: string
  email: string; sexo: '' | 'hombre' | 'mujer'; tipoRelacion: string; fechaCarnet: string; tipoCarnet: string
}
const VACIO: Form = { nombre: '', apellidos: '', dni: '', fechaNacimiento: '', telefono: '', email: '', sexo: '', tipoRelacion: '', fechaCarnet: '', tipoCarnet: '' }

/** Los de moto del catálogo `/motorcycle/driving-licenses`, y el B por si solo tiene el de coche. */
const CARNETS_MOTO = [
  { id: 'A', nombre: 'A' }, { id: 'A2', nombre: 'A2' }, { id: 'A1', nombre: 'A1' }, { id: 'AM', nombre: 'AM (ciclomotor)' },
  { id: 'B', nombre: 'Solo el B (coche)' },
]

export default function NuevaPersona({ rol, ramo, conduce, oportunidadId, clienteNombre, onCerrar, onHecho }: {
  rol: RolFigura
  /** El ramo del riesgo: en moto se pide además el TIPO de carné. */
  ramo: string
  /** Va a conducir el vehículo de este riesgo: su carné es obligatorio. */
  conduce: boolean
  oportunidadId: string
  clienteNombre: string
  onCerrar: () => void
  onHecho: (texto: string) => void
}) {
  const [f, setF] = useState<Form>(VACIO)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))

  const moto = ramo === 'moto'
  const falta =
    !f.nombre.trim() || !f.apellidos.trim() || !f.dni.trim() || !f.fechaNacimiento || !f.telefono.trim() ||
    (f.sexo !== 'hombre' && f.sexo !== 'mujer') || !f.tipoRelacion ||
    (conduce && (!f.fechaCarnet || (moto && !f.tipoCarnet)))

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (falta || enviando) return
    setEnviando(true)
    setError(null)
    const persona: Record<string, unknown> = {
      nombre: f.nombre.trim(), apellidos: f.apellidos.trim(), dni: f.dni.trim().toUpperCase(),
      fechaNacimiento: f.fechaNacimiento, telefono: f.telefono.trim(), sexo: f.sexo,
      ...(f.email.trim() ? { email: f.email.trim() } : {}),
      ...(conduce ? { fechaCarnet: f.fechaCarnet, tipoCarnet: moto ? f.tipoCarnet : 'B' } : {}),
    }
    const r = await llamarFiguras('POST', { accion: 'nueva', oportunidadId, rol, tipoRelacion: f.tipoRelacion, persona })
    setEnviando(false)
    if (!r.ok) {
      const conflicto = r.status === 409 ? ' Ya hay una ficha con esos datos (teléfono o correo): búscala y añádela como familiar desde su ficha.' : ''
      setError(`No se ha podido dar de alta: ${motivoDe(r)}.${conflicto}`)
      return
    }
    const existente = r.json?.existente === true
    const nombre = `${f.nombre.trim()} ${f.apellidos.trim()}`
    // El carné tiene su propio desenlace: la persona puede estar dada de alta y el carné no.
    const carnet = r.json?.carnet
    const notaCarnet = !conduce
      ? ''
      : carnet === 'guardado'
        ? ' Su carné queda en su ficha.'
        : carnet === 'ya_tenia'
          ? ' Su ficha ya tenía ese carné: se ha dejado el que había.'
          : carnet === 'no_guardado'
            ? ' ⚠️ El carné NO se ha guardado: añádelo en su ficha antes de pedir precio.'
            : ' ⚠️ No consta que se haya guardado el carné: revísalo en su ficha.'
    onHecho((existente
      ? `Ese DNI ya tenía ficha: se ha usado la de ${nombre} como ${ROTULO_ROL[rol].toLowerCase()}.`
      : `${nombre} dado de alta y puesto como ${ROTULO_ROL[rol].toLowerCase()}.`) + notaCarnet)
  }

  return (
    <form onSubmit={(e) => void guardar(e)} style={{ ...cardStyle, border: '1px solid var(--primary)', display: 'grid', gap: 12, minWidth: 0 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Nueva persona · {ROTULO_ROL[rol]}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          Solo la da de alta y la pone en este riesgo: todavía no se pide precio y no cuesta nada.
        </div>
      </div>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
        <label style={etiqueta}>Nombre<input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} style={campo} autoComplete="off" /></label>
        <label style={etiqueta}>Apellidos<input value={f.apellidos} onChange={(e) => set('apellidos', e.target.value)} style={campo} autoComplete="off" /></label>
        <label style={etiqueta}>DNI/NIE<input value={f.dni} onChange={(e) => set('dni', e.target.value)} style={campo} autoComplete="off" /></label>
        <label style={etiqueta}>Fecha de nacimiento<input type="date" value={f.fechaNacimiento} onChange={(e) => set('fechaNacimiento', e.target.value)} style={campo} /></label>
        <label style={etiqueta}>Móvil<input type="tel" inputMode="tel" value={f.telefono} onChange={(e) => set('telefono', e.target.value)} style={campo} autoComplete="off" /></label>
        <label style={etiqueta}>
          Sexo
          <select value={f.sexo} onChange={(e) => set('sexo', e.target.value as Form['sexo'])} style={campo}>
            <option value="">Elige</option>
            <option value="hombre">Hombre</option>
            <option value="mujer">Mujer</option>
          </select>
        </label>
        <label style={etiqueta}>
          ¿Qué es de {clienteNombre}?
          <select value={f.tipoRelacion} onChange={(e) => set('tipoRelacion', e.target.value)} style={campo}>
            <option value="">Elige relación</option>
            {RELACIONES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label style={etiqueta}>Correo (opcional)<input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} style={campo} autoComplete="off" /></label>
        {conduce && (
          <label style={etiqueta}>
            Fecha del carné
            <input type="date" value={f.fechaCarnet} onChange={(e) => set('fechaCarnet', e.target.value)} style={campo} />
          </label>
        )}
        {conduce && moto && (
          <label style={etiqueta}>
            Tipo de carné
            <select value={f.tipoCarnet} onChange={(e) => set('tipoCarnet', e.target.value)} style={campo}>
              <option value="">Elige</option>
              {CARNETS_MOTO.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
        )}
      </div>
      {conduce && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
          Va a conducir: sin la fecha de SU carné{moto ? ' y su tipo' : ''} la compañía no da precio.
        </p>
      )}
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" disabled={falta || enviando} style={{ ...btnStyle('primario'), minHeight: 44 }}>
          {enviando ? 'Guardando…' : 'Dar de alta y asignar'}
        </button>
        <button type="button" onClick={onCerrar} style={{ ...btnStyle('secundario'), minHeight: 44 }}>Cancelar</button>
      </div>
      {falta && <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Rellena todo salvo el correo para poder guardar.</p>}
    </form>
  )
}
