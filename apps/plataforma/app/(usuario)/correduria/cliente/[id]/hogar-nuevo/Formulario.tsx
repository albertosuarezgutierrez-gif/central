'use client'

// La ficha de HOGAR sin póliza, DENTRO de `/correduria` — mismo diseño que el
// resto del panel (`components/ui.tsx`), sin saltar a `apps/asegura`.
//
// Es un port de `apps/asegura/.../retarificador-hogar.tsx` (mismo modelo: la
// ficha se LEE, no se rellena; cada fila dice de dónde sale su valor y el
// corredor solo toca lo que esté mal), pero con una diferencia deliberada:
// **el recálculo al corregir un campo va al SERVIDOR** (la acción
// `pedirPrecalificacionHogar`, gratis), no se rehace en el navegador con las
// funciones puras de asegura. `apps/plataforma` no las importa (dos apps
// separadas, se hablan por el puerto HTTP y por nada más — ver la nota final
// de `lib/hogar-nuevo-asegura.ts`), así que recalcular aquí sin ellas
// duplicaría `resumen-hogar.ts` con riesgo de divergir. Un roundtrip gratis
// por corrección es el precio, y es barato: no hay ningún cargo de por medio
// hasta el botón final.

import { useState } from 'react'
import { Loader2, Pencil, X } from 'lucide-react'
import { btnStyle, Badge, cardStyle, CardHeader } from '@/components/ui'
import { eur } from '@/lib/dinero'
import type {
  Control as TipoControl,
  Fila,
  Opcion,
  PrecalificacionHogar,
  Precio,
  Reparo,
  Supuesto,
} from '@/lib/hogar-nuevo-asegura'
import { pedirCotizacionHogar, pedirPrecalificacionHogar } from './acciones'

type Grupo = 'donde' | 'como' | 'protecciones' | 'capitales' | 'tomador' | 'cotizacion'

const GRUPOS: { id: Grupo; titulo: string; nota?: string }[] = [
  { id: 'donde', titulo: 'Dónde está', nota: 'La compañía exige la calle entera, no solo el código postal.' },
  { id: 'como', titulo: 'Cómo es' },
  { id: 'protecciones', titulo: 'Protecciones', nota: 'Cada una que tengas baja el precio. Lo que no sepamos va como «no».' },
  { id: 'capitales', titulo: 'Qué se asegura' },
  { id: 'tomador', titulo: 'El tomador', nota: 'Nada de aquí se supone: o está en la ficha o falta.' },
  { id: 'cotizacion', titulo: 'La cotización' },
]

/** Campo de la fila → clave del cuerpo `resueltos`. Solo dos difieren de nombre
 *  (`estadoCivil`→`estadoCivilId`); el resto de catálogo comparte nombre. */
const CAMPO_A_RESUELTO: Record<string, string> = {
  municipioId: 'municipioId',
  estadoCivil: 'estadoCivilId',
  tipoViaId: 'tipoViaId',
  propietarioEsTomador: 'propietarioEsTomador',
  tipoVivienda: 'tipoVivienda',
  uso: 'uso',
  ocupacion: 'ocupacion',
  ubicacion: 'ubicacion',
  material: 'material',
  calidad: 'calidad',
  alarma: 'alarma',
  puertasSecundarias: 'puertasSecundarias',
  asentamiento: 'asentamiento',
}
/** Los nueve campos de catálogo cuya «letra pequeña» viaja como supuesto. */
const CAMPOS_CATALOGO_9 = [
  'tipoVivienda', 'uso', 'ocupacion', 'ubicacion', 'material', 'calidad', 'alarma', 'puertasSecundarias', 'asentamiento',
]

type Resultado =
  | { estado: 'idle' }
  | { estado: 'cotizando' }
  | {
      estado: 'ok'
      coste: string
      restantesHoy: number | null
      simulado: boolean
      avisoSimulacion: string | null
      resumen: string
      precios: Precio[]
      supuestos: Supuesto[]
    }
  | { estado: 'faltan'; faltan: Reparo[] }
  | { estado: 'error'; mensaje: string; tope?: boolean; gastoDesconocido: boolean }

function euroODash(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '—' : eur(n)
}

export default function Formulario({
  clienteId,
  referencia,
  preInicial,
}: {
  clienteId: string
  referencia: string
  preInicial: PrecalificacionHogar
}) {
  const [pre, setPre] = useState(preInicial)
  const [resueltos, setResueltos] = useState<Record<string, unknown>>({})
  const [correcciones, setCorrecciones] = useState<Record<string, unknown>>({})
  const [recalculando, setRecalculando] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [borrador, setBorrador] = useState('')
  const [resultado, setResultado] = useState<Resultado>({ estado: 'idle' })

  async function recalcular(nuevosResueltos: Record<string, unknown>, nuevasCorrecciones: Record<string, unknown>) {
    setRecalculando(true)
    try {
      const r = await pedirPrecalificacionHogar({
        clienteId,
        referencia,
        resueltos: nuevosResueltos,
        correcciones: nuevasCorrecciones,
      })
      if (r.estado === 'ok') setPre(r.pre)
    } finally {
      setRecalculando(false)
    }
  }

  function abrir(f: Fila) {
    setEditando(f.campo)
    setBorrador(aTexto(f))
  }

  function guardar(f: Fila) {
    const valor = deTexto(f, borrador)
    const claveResuelto = CAMPO_A_RESUELTO[f.campo]
    if (claveResuelto) {
      const nuevos = { ...resueltos, [claveResuelto]: valor }
      setResueltos(nuevos)
      setEditando(null)
      void recalcular(nuevos, correcciones)
    } else {
      const nuevas = { ...correcciones, [f.campo]: valor }
      setCorrecciones(nuevas)
      setEditando(null)
      void recalcular(resueltos, nuevas)
    }
  }

  function deshacer(f: Fila) {
    const claveResuelto = CAMPO_A_RESUELTO[f.campo]
    setEditando(null)
    if (claveResuelto) {
      const { [claveResuelto]: _fuera, ...resto } = resueltos
      void _fuera
      setResueltos(resto)
      void recalcular(resto, correcciones)
    } else {
      const { [f.campo]: _fuera, ...resto } = correcciones
      void _fuera
      setCorrecciones(resto)
      void recalcular(resueltos, resto)
    }
  }

  function cuerpoResueltosFinal(): Record<string, unknown> {
    const porCampo = new Map(pre.resumen.filas.map((f) => [f.campo, f]))
    const supuestos: Record<string, boolean> = {}
    for (const campo of CAMPOS_CATALOGO_9) {
      supuestos[campo] = !(campo in resueltos) && porCampo.get(campo)?.procedencia === 'supuesto'
    }
    supuestos.tipoVia = !('tipoViaId' in resueltos) && porCampo.get('tipoViaId')?.procedencia === 'supuesto'
    return { ...resueltos, supuestos }
  }

  async function cotizar() {
    setResultado({ estado: 'cotizando' })
    const r = await pedirCotizacionHogar({
      clienteId,
      referencia,
      resueltos: cuerpoResueltosFinal(),
      correcciones,
    })
    switch (r.estado) {
      case 'faltan':
        setResultado({ estado: 'faltan', faltan: r.faltan })
        return
      case 'tope':
        setResultado({ estado: 'error', mensaje: r.mensaje, tope: true, gastoDesconocido: false })
        return
      case 'ramo':
      case 'no_encontrada':
      case 'sin_configurar':
        setResultado({ estado: 'error', mensaje: r.mensaje, gastoDesconocido: false })
        return
      case 'error':
        setResultado({ estado: 'error', mensaje: r.mensaje, gastoDesconocido: r.gastoDesconocido })
        return
      case 'ok':
        setResultado({
          estado: 'ok',
          coste: r.coste,
          restantesHoy: r.restantesHoy,
          simulado: r.simulado,
          avisoSimulacion: r.avisoSimulacion,
          resumen: r.resumen,
          precios: r.precios,
          supuestos: r.supuestos,
        })
        return
    }
  }

  const cotizando = resultado.estado === 'cotizando'
  const consumoPermite = pre.consumo.estado === 'ok' ? pre.consumo.veredicto.permitido : pre.consumo.estado === 'no_disponible'
  const puedePulsar =
    pre.ramo.estado === 'disponible' &&
    pre.fallosCatalogo.length === 0 &&
    pre.resumen.listo &&
    !cotizando &&
    !recalculando &&
    consumoPermite

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {pre.fallosCatalogo.length > 0 && (
        <div style={{ ...cardStyle, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13 }}>
          No se han podido leer estos catálogos: {pre.fallosCatalogo.join(', ')}. Todos son obligatorios para el
          vendor, así que no se puede cotizar todavía. No es un problema de la ficha.
        </div>
      )}

      {(pre.resumen.faltan.length > 0) && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: 15, margin: '0 0 8px', color: 'var(--negative)' }}>Falta esto para poder pedir precio</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
            {pre.resumen.faltan.map((f) => (
              <li key={f.campo} style={{ marginBottom: 6 }}>
                <strong>{f.etiqueta}</strong>: {f.falta}{' '}
                <button type="button" onClick={() => abrir(f)} style={{ ...btnStyle('sutil', 'sm'), padding: 0 }}>
                  corregir ↓
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {GRUPOS.map((g) => {
        const filas = pre.resumen.filas.filter((f) => f.grupo === g.id)
        if (filas.length === 0) return null
        return (
          <div style={cardStyle} key={g.id}>
            <CardHeader title={g.titulo} sub={g.nota} />
            <div style={{ display: 'grid', gap: 0 }}>
              {filas.map((f) => (
                <FilaFicha
                  key={f.campo}
                  fila={f}
                  editando={editando === f.campo}
                  borrador={borrador}
                  setBorrador={setBorrador}
                  abrir={() => abrir(f)}
                  cerrar={() => setEditando(null)}
                  guardar={() => guardar(f)}
                  deshacer={() => deshacer(f)}
                  pre={pre}
                />
              ))}
            </div>
          </div>
        )
      })}

      <div style={cardStyle}>
        <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>Pedir precio</h2>
        {pre.ramo.estado !== 'disponible' && (
          <p style={{ color: 'var(--negative)', fontSize: 13 }}>
            {pre.ramo.estado === 'ausente'
              ? `Hogar NO está entre los ramos que Codeoscopic tarifica para esta organización (hay: ${pre.ramo.ramos.join(', ')}). Hay que pedírselo a Codeoscopic; hasta entonces el botón no hace nada.`
              : 'No se ha podido comprobar si hogar tarifica para esta organización (la lista de ramos no llegó). No se cotiza a ciegas.'}
          </p>
        )}
        {pre.consumo.estado === 'error' ? (
          <p style={{ color: 'var(--negative)', fontSize: 13 }}>{pre.consumo.error}</p>
        ) : pre.consumo.estado === 'no_disponible' ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            No se ha podido leer el contador de gasto. {pre.consumo.porque} El tope lo sigue aplicando asegura: si
            estuviera alcanzado, la respuesta lo dirá y no se cobrará nada.
          </p>
        ) : (
          <p style={{ color: pre.consumo.veredicto.permitido ? 'var(--muted)' : 'var(--negative)', fontSize: 13 }}>
            Gastado este mes: <strong>{pre.consumo.gastadoMes}</strong>
            {pre.consumo.veredicto.permitido ? (
              <> · quedan hoy <strong>{pre.consumo.veredicto.restantesHoy}</strong> cotizaciones.</>
            ) : (
              <> — {pre.consumo.veredicto.explicacion}</>
            )}
          </p>
        )}
        {pre.resumen.optimistas.length > 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            ⚠️ {pre.resumen.optimistas.length} de los supuestos ABARATAN el precio (
            {pre.resumen.optimistas.map((f) => f.etiqueta.toLowerCase()).join(', ')}): si el cliente los desmiente,
            la prima real sube.
          </p>
        )}

        <button
          type="button"
          onClick={() => void cotizar()}
          disabled={!puedePulsar}
          style={{ ...btnStyle('primario'), width: '100%', maxWidth: 420, marginTop: 8 }}
        >
          {cotizando ? 'Cotizando… (puede tardar hasta 2 min)' : 'Pedir precio (0,50€)'}
        </button>
        {!pre.resumen.listo && (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
            El botón se enciende cuando no falte nada arriba. Corregir la ficha no cuesta nada.
          </p>
        )}

        {resultado.estado === 'faltan' && (
          <div style={{ marginTop: 12 }}>
            <Badge tono="positivo">No se ha gastado nada</Badge>
            <ul style={{ fontSize: 13 }}>
              {resultado.faltan.map((f) => (
                <li key={f.campo}>
                  <strong>{f.campo}</strong>: {f.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}

        {resultado.estado === 'error' && (
          <p style={{ color: 'var(--negative)', fontSize: 13, marginTop: 12, whiteSpace: 'pre-wrap' }}>
            {resultado.tope ? '🛑 Tope alcanzado: ' : '⚠️ '}
            {resultado.mensaje}
            {resultado.gastoDesconocido && (
              <>
                {' '}
                <strong>No se sabe si esto se ha cobrado.</strong> Comprueba el consumo antes de volver a pulsar.
              </>
            )}
          </p>
        )}

        {resultado.estado === 'ok' && <Precios r={resultado} />}
      </div>
    </div>
  )
}

// ─── Una fila de la ficha ────────────────────────────────────────────────────

function FilaFicha({
  fila,
  editando,
  borrador,
  setBorrador,
  abrir,
  cerrar,
  guardar,
  deshacer,
  pre,
}: {
  fila: Fila
  editando: boolean
  borrador: string
  setBorrador: (v: string) => void
  abrir: () => void
  cerrar: () => void
  guardar: () => void
  deshacer: () => void
  pre: PrecalificacionHogar
}) {
  const sePuedeTocar = fila.editable || fila.falta !== null

  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8,
        padding: '10px 0', borderTop: '1px solid var(--border)',
      }}
    >
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{fila.etiqueta}</div>
        {!editando && (
          <>
            <div style={{ fontSize: 14, wordBreak: 'break-word' }}>
              {fila.falta !== null && fila.legible === '—' ? <span style={{ color: 'var(--muted)' }}>—</span> : fila.legible}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, alignItems: 'center' }}>
              {fila.procedencia && <Badge tono={fila.procedencia === 'corregido' ? 'positivo' : 'neutral'}>{PROCEDENCIAS[fila.procedencia] ?? fila.procedencia}</Badge>}
              {fila.optimista && <Badge tono="aviso">esto puede subir</Badge>}
              {fila.falta !== null && <Badge tono="negativo">falta: {fila.falta}</Badge>}
            </div>
            {fila.porque && (
              <details style={{ marginTop: 4 }}>
                <summary style={{ color: 'var(--muted)', fontSize: 12, cursor: 'pointer', minHeight: 24 }}>por qué</summary>
                <p style={{ color: 'var(--muted)', fontSize: 12, margin: '4px 0 0' }}>{fila.porque}</p>
              </details>
            )}
          </>
        )}

        {editando && (
          <div style={{ marginTop: 4 }}>
            <ControlCampo fila={fila} borrador={borrador} setBorrador={setBorrador} pre={pre} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={guardar} style={btnStyle('primario', 'sm')}>Guardar</button>
              <button type="button" onClick={cerrar} style={btnStyle('secundario', 'sm')}>Cancelar</button>
              {fila.procedencia === 'corregido' && (
                <button type="button" onClick={deshacer} style={btnStyle('secundario', 'sm')}>Volver al valor de la ficha</button>
              )}
            </div>
          </div>
        )}
      </div>

      {!editando && sePuedeTocar && (
        <button
          type="button"
          onClick={abrir}
          aria-label={`Corregir ${fila.etiqueta}`}
          title={`Corregir ${fila.etiqueta}`}
          style={{ ...btnStyle('sutil', 'sm'), minWidth: 44, minHeight: 44, flex: '0 0 auto' }}
        >
          <Pencil size={16} />
        </button>
      )}
    </div>
  )
}

const PROCEDENCIAS: Record<string, string> = {
  poliza: 'de la póliza',
  volcado: 'del volcado de 2026',
  catastro: 'del Catastro',
  ficha: 'de la ficha del cliente',
  supuesto: 'supuesto',
  corregido: 'lo has puesto tú',
}

function ControlCampo({
  fila,
  borrador,
  setBorrador,
  pre,
}: {
  fila: Fila
  borrador: string
  setBorrador: (v: string) => void
  pre: PrecalificacionHogar
}) {
  const alto: React.CSSProperties = { minHeight: 44, width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }

  if (fila.control === 'siNo') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, fontSize: 14 }}>
        <input type="checkbox" checked={borrador === 'si'} onChange={(e) => setBorrador(e.target.checked ? 'si' : 'no')} style={{ width: 20, height: 20 }} />
        Sí
      </label>
    )
  }
  if (fila.control === 'siNoNoSe') {
    return (
      <select value={borrador} onChange={(e) => setBorrador(e.target.value)} style={alto}>
        <option value="">No se sabe (no viaja)</option>
        <option value="si">Sí</option>
        <option value="no">No</option>
      </select>
    )
  }
  if (fila.control === 'municipio') {
    return (
      <>
        <select value={borrador} onChange={(e) => setBorrador(e.target.value)} style={alto}>
          <option value="">{pre.municipios.length === 0 ? 'Sin código postal utilizable' : 'Elige municipio'}</option>
          {pre.municipios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        {pre.municipios.length > 1 && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Este CP tiene {pre.municipios.length} municipios: decide tú.</span>
        )}
      </>
    )
  }
  if (fila.control === 'opcion' || fila.campo === 'tipoViaId') {
    const esVia = fila.campo === 'tipoViaId'
    const lista: Opcion[] = esVia ? pre.vias : fila.campo === 'estadoCivil' ? pre.estadosCiviles : (fila.catalogo ? pre.catalogos[fila.catalogo] : undefined) ?? []
    const porDefecto = esVia ? pre.defectos['road-types'] : fila.catalogo ? pre.defectos[fila.catalogo] : null
    return (
      <select value={borrador} onChange={(e) => setBorrador(e.target.value)} style={alto} disabled={lista.length === 0}>
        <option value="">{lista.length === 0 ? 'Catálogo no disponible' : 'Elige'}</option>
        {lista.map((o) => (
          <option key={o.id} value={o.id}>{o.nombre}{o.id === porDefecto ? ' (el de la pantalla)' : ''}</option>
        ))}
      </select>
    )
  }
  if (fila.control === 'fecha') {
    return <input type="date" value={borrador} onChange={(e) => setBorrador(e.target.value)} style={alto} />
  }
  if (fila.control === 'numero' || fila.control === 'euros') {
    return <input type="number" min={0} inputMode="decimal" value={borrador} onChange={(e) => setBorrador(e.target.value)} style={alto} />
  }
  return <input value={borrador} onChange={(e) => setBorrador(e.target.value)} style={alto} />
}

// ─── Conversión entre el valor de la fila y el control ───────────────────────

function aTexto(f: Fila): string {
  if (f.control === 'siNo') return f.valor === true ? 'si' : 'no'
  if (f.control === 'siNoNoSe') return typeof f.valor === 'boolean' ? (f.valor ? 'si' : 'no') : ''
  if (f.valor === null || f.valor === undefined) return ''
  return String(f.valor)
}

function deTexto(f: Fila, t: string): unknown {
  switch (f.control) {
    case 'siNo':
      return t === 'si'
    case 'siNoNoSe':
      return t === '' ? null : t === 'si'
    case 'numero':
    case 'euros':
    case 'municipio': {
      const n = Number(t.trim())
      return t.trim() === '' || !Number.isFinite(n) ? null : n
    }
    default:
      return t.trim() === '' ? null : t.trim()
  }
}

// ─── El resultado ────────────────────────────────────────────────────────────

function Precios({ r }: { r: Extract<Resultado, { estado: 'ok' }> }) {
  return (
    <div style={{ marginTop: 12 }}>
      {r.simulado && (
        <div style={{ ...cardStyle, borderColor: 'var(--warning)', background: 'var(--warning-bg)', marginBottom: 12 }}>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--warning)' }}>🧪 ESTO ES UNA SIMULACIÓN</p>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>
            {r.avisoSimulacion ?? 'Precio inventado por central para probar la pantalla: ninguna compañía lo ha dado y no se ha gastado ni un céntimo.'}
          </p>
        </div>
      )}
      <p style={{ fontWeight: 700 }}>{r.resumen}</p>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>
        Coste de esta consulta: {r.coste}
        {r.restantesHoy !== null && <> · quedan hoy {r.restantesHoy}</>}.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr>
              <th style={th}>Compañía</th>
              <th style={th}>Producto</th>
              <th style={th}>Prima anual</th>
              <th style={th}>Firmeza</th>
            </tr>
          </thead>
          <tbody>
            {r.precios.map((p, i) => (
              <tr key={`${p.compania}-${p.producto}-${i}`}>
                <td style={td}>{p.compania ?? '—'}</td>
                <td style={td}>{p.producto ?? '—'}</td>
                <td style={td}>{euroODash(p.primaEur)}</td>
                <td style={td}><Badge tono={p.firmeza === 'firme' ? 'positivo' : 'aviso'} title={p.avisos?.join(' · ')}>{p.firmeza ?? 'sin determinar'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.supuestos.length > 0 && (
        <>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>Este precio sale con estos supuestos:</p>
          <ul style={{ fontSize: 13 }}>
            {r.supuestos.map((s) => (
              <li key={`${String(s.campo)}-${String(s.valor)}`}>
                <strong>{String(s.campo)}</strong>: <code>{s.oculto ? '(dato personal, se queda en asegura)' : String(s.valor)}</code> — {s.porque}
                {s.optimista && <> <Badge tono="aviso">puede abaratar el precio</Badge></>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--border)' }
