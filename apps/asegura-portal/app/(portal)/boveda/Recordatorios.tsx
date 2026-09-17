'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { SUGERENCIAS_RECORDATORIO, type TipoRecordatorio } from '@central/module-seguros-portal'

import { fechaEs } from '@/lib/fechas'
import type { RecordatorioVista } from '@/lib/recordatorios'

import type { PolizaOpcionParte } from './ParteSiniestro'

/**
 * «Tus recordatorios» — la pestaña de recordatorios que el CLIENTE se pone a
 * sí mismo (ITV, carnet, caldera, extintores… o texto libre), sin que haga
 * falta ninguna póliza con nosotros de por medio.
 *
 * Dictado de Alberto (13/09/2026): «añade todo, texto libre y cuándo quiera
 * que le avise, todo modular». Por eso hay un único mecanismo — título +
 * fecha + repetir cada X meses (o nunca) — y las «sugerencias» de
 * `SUGERENCIAS_RECORDATORIO` no son más que atajos que rellenan ese mismo
 * formulario: no hay cinco flujos distintos, hay uno.
 *
 * Objetivo declarado: que se use la intranet. Por eso el título de una
 * sugerencia sigue siendo EDITABLE (alguien puede tener dos coches y querer
 * «ITV del Ibiza» y «ITV de la furgoneta») y «Personalizado» no pide elegir
 * nada — abre el mismo formulario en blanco.
 */

const OPCIONES_REPITE: { valor: string; etiqueta: string; meses: number | null }[] = [
  { valor: 'nunca', etiqueta: 'Una vez (no se repite)', meses: null },
  { valor: '1', etiqueta: 'Cada mes', meses: 1 },
  { valor: '3', etiqueta: 'Cada 3 meses', meses: 3 },
  { valor: '6', etiqueta: 'Cada 6 meses', meses: 6 },
  { valor: '12', etiqueta: 'Cada año', meses: 12 },
  { valor: '24', etiqueta: 'Cada 2 años', meses: 24 },
  { valor: '60', etiqueta: 'Cada 5 años', meses: 60 },
  { valor: '120', etiqueta: 'Cada 10 años', meses: 120 },
  { valor: 'otro', etiqueta: 'Otro número de meses…', meses: undefined as unknown as number },
]

function opcionRepiteDe(meses: number | null): string {
  if (meses === null) return 'nunca'
  const conocida = OPCIONES_REPITE.find((o) => o.meses === meses)
  return conocida ? conocida.valor : 'otro'
}

type Formulario = {
  tipo: TipoRecordatorio
  titulo: string
  fecha: string
  repite: string
  repiteOtro: string
  /** `''` = sin asignar. Si no, `cartera:<id>` / `declarada:<id>` — el mismo
   *  `valor` que ya usa `ParteSiniestro`. */
  poliza: string
}

const VACIO: Formulario = { tipo: 'libre', titulo: '', fecha: '', repite: 'nunca', repiteOtro: '', poliza: '' }

type Estado = { tipo: 'listo' } | { tipo: 'guardando' } | { tipo: 'error'; texto: string }

export function Recordatorios({
  recordatorios,
  polizas,
}: {
  recordatorios: RecordatorioVista[]
  /** Para poder decir «ITV del Ibiza» en vez de «ITV»: Alberto, 13/09/2026
   *  («lo lógico es asignarlo al bien asegurado»). La MISMA lista que ya arma
   *  `page.tsx` para `ParteSiniestro` — matrícula/dirección, no nº de póliza. */
  polizas: readonly PolizaOpcionParte[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState<Formulario>(VACIO)
  const [estado, setEstado] = useState<Estado>({ tipo: 'listo' })
  const [borrandoId, setBorrandoId] = useState<string | null>(null)

  function abrirConSugerencia(clave: string) {
    // Con un guardado en curso, abrir otra sugerencia pisaría `form`/`estado` con datos de
    // OTRO recordatorio mientras el `fetch` del primero sigue volando: al resolver, su
    // `then` sobrescribiría en silencio lo que la persona acaba de teclear en el segundo
    // formulario. Hallazgo de code-review (Graphify).
    if (estado.tipo === 'guardando') return
    const s = SUGERENCIAS_RECORDATORIO.find((x) => x.clave === clave)
    setForm(
      s
        ? {
            tipo: s.tipo,
            titulo: s.titulo,
            fecha: '',
            repite: opcionRepiteDe(s.repiteCadaMesesPorDefecto),
            repiteOtro: '',
            poliza: '',
          }
        : VACIO,
    )
    setEstado({ tipo: 'listo' })
    setAbierto(true)
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    const titulo = form.titulo.trim()
    if (titulo === '' || form.fecha === '') {
      setEstado({ tipo: 'error', texto: 'Ponle un título y una fecha.' })
      return
    }
    const opcion = OPCIONES_REPITE.find((o) => o.valor === form.repite)
    let repiteCadaMeses: number | null = opcion?.meses ?? null
    if (form.repite === 'otro') {
      const n = Number(form.repiteOtro)
      if (!Number.isInteger(n) || n < 1 || n > 120) {
        setEstado({ tipo: 'error', texto: 'El número de meses tiene que estar entre 1 y 120.' })
        return
      }
      repiteCadaMeses = n
    }

    const [tipoPoliza, idPoliza] = form.poliza ? form.poliza.split(':') : [null, null]

    setEstado({ tipo: 'guardando' })
    try {
      const r = await fetch('/api/recordatorios', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tipo: form.tipo,
          titulo,
          fechaEvento: form.fecha,
          repiteCadaMeses,
          polizaId: tipoPoliza === 'cartera' ? idPoliza : null,
          polizaDeclaradaId: tipoPoliza === 'declarada' ? idPoliza : null,
        }),
      })
      if (r.ok) {
        setForm(VACIO)
        setAbierto(false)
        setEstado({ tipo: 'listo' })
        router.refresh()
        return
      }
      if (r.status === 403) {
        setEstado({ tipo: 'error', texto: 'Esa póliza no es tuya, así que no podemos colgarle el recordatorio. Elige otra o déjalo en «No asignar».' })
        return
      }
      setEstado({ tipo: 'error', texto: 'No hemos podido guardarlo. Revisa el título y la fecha e inténtalo otra vez.' })
    } catch {
      setEstado({ tipo: 'error', texto: 'No hemos podido guardarlo: comprueba tu conexión e inténtalo otra vez.' })
    }
  }

  async function borrar(id: string) {
    setBorrandoId(id)
    try {
      const r = await fetch(`/api/recordatorios/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (r.ok) router.refresh()
    } finally {
      setBorrandoId(null)
    }
  }

  return (
    <section className="seccion" aria-labelledby="recordatorios-titulo">
      <p className="antetitulo">Que no se te pase nada</p>
      <h2 id="recordatorios-titulo">Tus recordatorios</h2>
      <p className="supresion-intro">
        Además de los vencimientos de tus pólizas, te avisamos de lo que TÚ nos digas: la ITV, el carnet
        de conducir, la revisión de la caldera, los extintores del local… lo que sea, con la fecha que
        elijas. Y si es cíclico, se repite solo.
      </p>

      <div className="recordatorio-sugerencias">
        {SUGERENCIAS_RECORDATORIO.map((s) => (
          <button
            key={s.clave}
            type="button"
            className="boton-tenue"
            onClick={() => abrirConSugerencia(s.clave)}
            disabled={estado.tipo === 'guardando'}
          >
            + {s.titulo}
          </button>
        ))}
        <button
          type="button"
          className="boton-tenue"
          onClick={() => abrirConSugerencia('')}
          disabled={estado.tipo === 'guardando'}
        >
          + Personalizado
        </button>
      </div>

      {abierto && (
        <form onSubmit={guardar} className="mi-direccion-form" style={{ marginBottom: 20 }}>
          <label className="mi-direccion-campo">
            <span>Qué</span>
            <input
              type="text"
              value={form.titulo}
              onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
              placeholder="Ej. ITV del coche, revisión de la caldera…"
              maxLength={80}
              autoFocus
            />
          </label>
          <label className="mi-direccion-campo">
            <span>Cuándo quieres que te avisemos</span>
            <input type="date" value={form.fecha} onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))} />
          </label>
          {polizas.length > 0 && (
            <label className="mi-direccion-campo">
              <span>De qué seguro es (opcional)</span>
              <select value={form.poliza} onChange={(e) => setForm((p) => ({ ...p, poliza: e.target.value }))}>
                <option value="">No asignar a ningún seguro</option>
                {polizas.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.etiqueta}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="mi-direccion-campo">
            <span>Se repite</span>
            <select value={form.repite} onChange={(e) => setForm((p) => ({ ...p, repite: e.target.value }))}>
              {OPCIONES_REPITE.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </label>
          {form.repite === 'otro' && (
            <label className="mi-direccion-campo">
              <span>Cada cuántos meses</span>
              <input
                type="number"
                min={1}
                max={120}
                value={form.repiteOtro}
                onChange={(e) => setForm((p) => ({ ...p, repiteOtro: e.target.value }))}
              />
            </label>
          )}

          {estado.tipo === 'error' && (
            <p className="mi-direccion-aviso" role="alert">
              {estado.texto}
            </p>
          )}

          <div className="editor-acciones">
            <button type="submit" className="boton" disabled={estado.tipo === 'guardando'}>
              {estado.tipo === 'guardando' ? 'Guardando…' : 'Guardar recordatorio'}
            </button>
            <button
              type="button"
              className="boton secundario"
              onClick={() => {
                setAbierto(false)
                setForm(VACIO)
                setEstado({ tipo: 'listo' })
              }}
              disabled={estado.tipo === 'guardando'}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {recordatorios.length === 0 && !abierto && (
        <p className="suave" style={{ fontSize: 14 }}>
          Todavía no tienes ningún recordatorio propio. Añade uno de arriba o toca «Personalizado».
        </p>
      )}

      {recordatorios.length > 0 && (
        <ul className="lista-recordatorios">
          {recordatorios.map((r) => {
            // `r.poliza` puede apuntar a una póliza que ya no está en la lista
            // (se canceló, se revocó la autorización…): el recordatorio sigue
            // siendo válido, solo deja de poder decir de cuál era.
            const bien = r.poliza ? polizas.find((p) => p.valor === r.poliza)?.etiqueta : null
            return (
              <li key={r.id} className="recordatorio-fila">
                <div>
                  <strong>{r.titulo}</strong>
                  <div className="suave" style={{ fontSize: 13 }}>
                    {fechaEs(r.fechaEvento)}
                    {bien && ` · ${bien}`}
                    {r.repiteCadaMeses !== null && ` · se repite cada ${etiquetaMeses(r.repiteCadaMeses)}`}
                    {r.avisada && ' · ya avisado'}
                  </div>
                </div>
                <button
                  type="button"
                  className="boton-tenue"
                  onClick={() => void borrar(r.id)}
                  disabled={borrandoId === r.id}
                >
                  {borrandoId === r.id ? 'Quitando…' : 'Quitar'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function etiquetaMeses(meses: number): string {
  if (meses === 1) return 'mes'
  if (meses % 12 === 0) {
    const anios = meses / 12
    return anios === 1 ? 'año' : `${anios} años`
  }
  return `${meses} meses`
}
