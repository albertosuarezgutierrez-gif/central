'use client'
import { useState } from 'react'
import Link from 'next/link'
import { MOTIVOS_PUERTO, type Busqueda, type BloqueResultados, type Hallazgo } from '@/lib/correduria-puerto'

/**
 * Un solo cuadro para encontrar a cualquiera: nombre, matrícula, nº de póliza,
 * DNI, teléfono, email, ciudad o código postal.
 *
 * 🚨 Vive FUERA del bloque de cartera a propósito. Estaba anidado dentro, y ese
 * bloque hace `return` temprano cuando el puerto falla — o sea, el día que
 * asegura no responde desaparecía también el buscador, que es justo cuando más
 * falta hace saber a quién se está buscando.
 *
 * ─── Lo que este buscador NO puede prometer ────────────────────────────────
 * El DNI, el teléfono y el email van CIFRADOS: solo se encuentran por índice
 * ciego y EXACTO, y únicamente el 12-16% de las fichas lo tienen calculado. Un
 * «no aparece» ahí es casi siempre «esa ficha no tiene hash», no «no está en la
 * cartera» — y si la clave se desincronizara, la búsqueda no daría error:
 * devolvería vacío. Por eso cada bloque enseña sobre cuántas fichas ha podido
 * mirar de verdad. La dirección no se puede buscar de ninguna forma.
 */
const ETIQUETAS: Record<string, string> = {
  nombre: '👤 Por nombre',
  matricula: '🚗 Por matrícula',
  poliza: '📄 Por nº de póliza',
  dni: '🪪 Por DNI',
  telefono: '📞 Por teléfono',
  email: '✉️ Por email',
  codigo_postal: '📮 Por código postal',
  ciudad: '📍 Por ciudad',
}

type Estado =
  | { fase: 'quieto' }
  | { fase: 'buscando' }
  | { fase: 'hecho'; r: Busqueda }

export default function BuscadorCartera() {
  const [q, setQ] = useState('')
  const [estado, setEstado] = useState<Estado>({ fase: 'quieto' })

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    const termino = q.trim()
    if (termino.length < 3) return
    setEstado({ fase: 'buscando' })
    try {
      const res = await fetch(`/api/correduria/buscar?q=${encodeURIComponent(termino)}`)
      setEstado({ fase: 'hecho', r: await res.json() })
    } catch {
      setEstado({ fase: 'hecho', r: { estado: 'error', motivo: 'red' } })
    }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
      <form onSubmit={buscar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre, matrícula, nº de póliza, DNI, teléfono, email, ciudad o CP"
          aria-label="Buscar en la cartera"
          autoFocus
          style={{
            flex: '1 1 260px', minWidth: 0, padding: '12px 14px', minHeight: 44,
            borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text)', fontSize: 15,
          }}
        />
        <button
          type="submit"
          style={{
            minHeight: 44, padding: '0 20px', borderRadius: 8, cursor: 'pointer',
            fontWeight: 700, border: '1px solid var(--border)',
          }}
        >
          Buscar
        </button>
      </form>

      <Resultado estado={estado} termino={q.trim()} />
    </div>
  )
}

function Resultado({ estado, termino }: { estado: Estado; termino: string }) {
  if (estado.fase === 'quieto') {
    return (
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
        Se busca a la vez por todo lo que el término pueda ser. La dirección no: va cifrada en la
        base y no se puede consultar — usa la ciudad o el código postal.
      </div>
    )
  }
  if (estado.fase === 'buscando') {
    return <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>Buscando…</div>
  }

  const r = estado.r
  if (r.estado === 'sin_configurar') {
    return (
      <Nota color="var(--muted)">
        ⏳ El puerto con asegura no está conectado en este proyecto (falta{' '}
        <code>ASEGURA_OPERADOR_SECRET</code>). No significa que ese cliente no exista: significa que
        desde aquí no se puede mirar.
      </Nota>
    )
  }
  if (r.estado === 'error') {
    return (
      <Nota color="#d66">
        ⚠️ No se ha podido buscar: {MOTIVOS_PUERTO[r.motivo]} <strong>No lo leas como «ese cliente
        no existe».</strong>
      </Nota>
    )
  }
  if (!r.buscable) {
    return (
      <Nota color="var(--muted)">
        Escribe al menos 3 letras o números. Esto <strong>no</strong> es «no hay resultados»: es que
        todavía no se ha buscado.
      </Nota>
    )
  }

  const conHallazgos = r.bloques.filter((b) => b.hallazgos.length > 0)
  const vacios = r.bloques.filter((b) => b.hallazgos.length === 0)

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, marginBottom: 8 }}>
        {r.distintos === 0 ? (
          <span style={{ color: 'var(--muted)' }}>
            Nadie coincide con <strong>{termino}</strong>.
          </span>
        ) : (
          <>
            <strong>{r.distintos}</strong> ficha(s) para <strong>{termino}</strong>
          </>
        )}
      </div>

      {conHallazgos.map((b) => (
        <Bloque key={`${b.tipo}-${b.valor}`} b={b} />
      ))}

      {/* Los criterios sin resultado se dicen, y con su ALCANCE: un vacío por
          DNI que solo alcanza al 12% de las fichas no es una ausencia. */}
      {vacios.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>
            Sin resultados por {vacios.length} criterio(s) — mira sobre cuánto se ha buscado
          </summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--muted)' }}>
            {vacios.map((b) => (
              <li key={`${b.tipo}-${b.valor}`} style={{ marginBottom: 4 }}>
                <strong>{ETIQUETAS[b.tipo] ?? b.tipo}</strong>: {b.explicacion}
              </li>
            ))}
          </ul>
        </details>
      )}

      {r.avisos.map((a) => (
        <Nota key={a.tema} color="#c96">
          🔒 {a.texto}
        </Nota>
      ))}
    </div>
  )
}

function Bloque({ b }: { b: BloqueResultados }) {
  const parcial = b.cobertura !== null && b.cobertura.alcanzables < b.cobertura.total
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
        {ETIQUETAS[b.tipo] ?? b.tipo}
        {parcial && b.cobertura && (
          <span
            style={{ fontWeight: 400, marginLeft: 6 }}
            title={b.explicacion}
          >
            · alcanza a {b.cobertura.alcanzables.toLocaleString('es-ES')} de{' '}
            {b.cobertura.total.toLocaleString('es-ES')} fichas
          </span>
        )}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {b.hallazgos.map((h) => (
          <li
            key={`${b.tipo}-${h.clienteId}`}
            style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}
          >
            <Link href={`/correduria/cliente/${h.clienteId}`} style={{ fontWeight: 600 }}>
              {h.nombre}
            </Link>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              <Vitalidad h={h} /> · {h.polizas} póliza(s) · {h.porque}
            </div>
            {h.aviso && (
              <div
                style={{
                  fontSize: 11,
                  marginTop: 6,
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: h.aviso.clase === 'duplicado' ? 'var(--warn-bg, #fff7ed)' : 'transparent',
                  color: h.aviso.clase === 'duplicado' ? 'var(--warn, #9a3412)' : 'var(--muted)',
                  lineHeight: 1.5,
                }}
              >
                {h.aviso.clase === 'duplicado' ? '⚠️ ' : 'ℹ️ '}
                {h.aviso.texto}{' '}
                {h.aviso.preferida && (
                  <Link href={`/correduria/cliente/${h.aviso.preferida.clienteId}`} style={{ fontWeight: 600 }}>
                    Abrir la ficha viva →
                  </Link>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * 🚨 Lo que NO se pinta aquí: `h.tipo`, el enum de la BD. Decía «✅ cliente» en
 * las DOS fichas de Jose Suarez Salas — la viva y el volcado de 2016— porque la
 * carga de junio las marcó todas igual. El rótulo sale ahora de `vitalidad`,
 * que se deriva de si sus pólizas entran por CIMA y de cuándo vencen.
 *
 * Cuatro estados, no dos: «sin comprobar» y «sin vencimiento» son distintos de
 * «volcado histórico», y ninguno de los dos entierra la ficha.
 */
function Vitalidad({ h }: { h: Hallazgo }) {
  const cima = h.polizasCima
  const detalle =
    h.vitalidad === 'viva' && cima !== null && cima > 0
      ? `${cima} póliza(s) entran por CIMA`
      : h.ultimoVencimiento !== null
        ? `último vencimiento ${h.ultimoVencimiento}`
        : 'ninguna póliza informa vencimiento'
  const pinta: Record<Hallazgo['vitalidad'], { icono: string; texto: string; color?: string }> = {
    viva: { icono: '✅', texto: 'cartera viva' },
    historica: { icono: '🗄️', texto: 'volcado histórico', color: 'var(--muted)' },
    sin_fecha: { icono: '❔', texto: 'sin vencimiento informado' },
    desconocida: { icono: '❔', texto: 'sin comprobar' },
  }
  const p = pinta[h.vitalidad]
  return (
    <span title={detalle} style={p.color ? { color: p.color } : undefined}>
      {p.icono} {p.texto}
    </span>
  )
}

function Nota({ color, children }: { color: string; children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color, marginTop: 10, lineHeight: 1.5 }}>{children}</div>
}
