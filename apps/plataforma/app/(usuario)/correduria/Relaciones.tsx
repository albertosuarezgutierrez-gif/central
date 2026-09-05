'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FUENTE_PERSONA_CONTACTO,
  GRUPOS_RELACION,
  SIN_VINCULO,
  coincidenciaBloquea,
  combinarPersonaContacto,
  permiteAutorizar,
  revisarAlta,
  textoPersonaContacto,
  tiposContactoSugeridos,
  type ResultadoPersonaContacto,
  type TipoRelacion,
} from '@central/module-seguros'
import { btnStyle } from '@/components/ui'
import {
  ALCANCE_TEXTO_PORTAL,
  TITULOS_REPRESENTACION_PORTAL,
  TITULO_TEXTO_PORTAL,
  alcancesAnotables,
  comoTitulo,
  esApoderamientoPortal,
  explicarEstadoAutorizacion,
  fechaLarga,
  interpretarRelaciones,
  textoMotivoRelaciones,
  type AlcancePortal,
  type AutorizacionCartera,
  type RelacionCartera,
  type RespuestaRelaciones,
  type TituloRepresentacionPortal,
} from '@/lib/relaciones-asegura'
import { interpretarEscritura, textoMotivo as textoMotivoAlta, type ResultadoEscritura } from '@/lib/cliente-edicion-asegura'
import type { RespuestaBusqueda } from '@/lib/ficha-asegura'

/**
 * Relaciones de un cliente de la correduría (cónyuge, hijos, empresa…) y la
 * AUTORIZACIÓN para ver los seguros del otro, desde la ficha de plataforma.
 *
 * Semántica (fijada en `@central/module-seguros/relaciones.ts`):
 *   · Un vínculo se lee DESDE la ficha: «María Antonia · Cónyuge/Pareja de
 *     Hecho» = María Antonia es cónyuge de la ficha.
 *   · `autorizaVer` = LA FICHA autoriza al relacionado a ver los seguros de la
 *     ficha. `puedeVer` = la ficha puede ver los del relacionado — y eso se
 *     decidió desde la OTRA ficha. Por eso aquí solo hay botón para lo primero:
 *     una autorización es un consentimiento del titular y se anota desde la
 *     ficha de quien lo da.
 *
 * 🚨 Desde el 03/09/2026 esto NO es un sí/no. La pantalla dice TRES cosas
 * distintas, porque mandan a hacer cosas distintas:
 *   · **sin autorización** — no hay ninguna anotada.
 *   · **anotada, pendiente de aceptar** — Alberto anotó el consentimiento que le
 *     dieron por teléfono, y el autorizado **TODAVÍA NO VE NADA** hasta que la
 *     acepte en su portal. Es el estado que antes no existía y que un booleano
 *     pintaba como si ya viera.
 *   · **en vigor hasta el <fecha>** — con su alcance, y diciendo si la anotó la
 *     correduría o la concedió el cliente desde su pantalla.
 *
 * Dos «no lo sé» que NO se pintan como «no tiene»: `inicial === null` (asegura
 * no manda el bloque o no pudo leerlo) y `polizasVivas === null` (sin contar).
 *
 * La BD vive en asegura: aquí se habla con `/api/correduria/cliente/relaciones`,
 * que reenvía al puerto con el secreto y pone el `actor` desde la sesión.
 */
export default function Relaciones({
  clienteId,
  nombreFicha,
  inicial,
  sinVinculo = [],
  tipoPersona = null,
}: {
  clienteId: string
  nombreFicha: string
  inicial: RelacionCartera[] | null
  /** Qué es la ficha de la que cuelga el contacto. Solo ordena los tipos que se
   *  ofrecen primero; `null` (no se sabe) no reordena nada. */
  tipoPersona?: 'fisica' | 'juridica' | null
  /** Personas que salen en SUS pólizas, con ficha propia y sin vínculo anotado.
   *  Se ofrecen aquí para declararlas de un clic: antes salían en la tarjeta
   *  👤 con un «se anota en Relaciones» y aquí no aparecían por ningún lado. */
  sinVinculo?: SugerenciaVinculo[]
}) {
  const router = useRouter()
  const [lista, setLista] = useState<RelacionCartera[] | null>(inicial)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [resultado, setResultado] = useState<RespuestaRelaciones | null>(null)
  // El contador fuerza a remontar `Anadir` en cada clic: así el formulario nace
  // ya con esa ficha elegida sin tocar el estado de otro componente mientras se
  // pinta (React lo prohíbe), y volver a pulsar el mismo nombre lo reabre.
  const [preseleccion, setPreseleccion] = useState<{ cand: Candidato; n: number } | null>(null)

  async function llamar(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>): Promise<RespuestaRelaciones> {
    try {
      const res = await fetch('/api/correduria/cliente/relaciones', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clienteId, ...body }),
      })
      return interpretarRelaciones(res.status, await res.json().catch(() => null))
    } catch {
      return { estado: 'error', motivo: 'red' }
    }
  }

  async function ejecutar(clave: string, method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>): Promise<RespuestaRelaciones> {
    setOcupado(clave)
    setResultado(null)
    try {
      const r = await llamar(method, body)
      setResultado(r)
      if (r.estado === 'ok') {
        setLista(r.relaciones)
        router.refresh()
      }
      return r
    } finally {
      setOcupado(null)
    }
  }

  /**
   * Anota (o revoca) la autorización. `extra` solo llega desde una ficha de
   * SOCIEDAD: el alcance elegido y el título con el que se la representa. Desde
   * una ficha de persona no se manda ninguno de los dos y asegura anota el
   * alcance más pequeño («ver»), que es lo único que una persona puede delegar.
   */
  function autorizar(
    r: RelacionCartera,
    autoriza: boolean,
    extra?: { alcance: AlcancePortal; tituloRepresentacion: TituloRepresentacionPortal | null },
  ) {
    if (!autoriza) {
      // Una PENDIENTE todavía no abría nada: decir «dejará de ver» ahí sería falso.
      const efecto = r.autorizacion?.estado === 'vigente'
        ? `${r.nombre} dejará de poder ver los seguros de ${nombreFicha}.`
        : `Se retira la autorización anotada (${r.nombre} todavía no veía nada).`
      if (!confirm(`¿Revocar la autorización? ${efecto}`)) return
    }
    // 🚨 Un apoderamiento se confirma aparte: no es «deja mirar», es que esa
    // persona puede obligar a la sociedad frente a la compañía.
    if (autoriza && extra && esApoderamientoPortal(extra.alcance)) {
      const titulo = comoTitulo(extra.tituloRepresentacion)
      const ok = confirm(
        `¿Anotar que ${nombreFicha} apodera a ${r.nombre} para ${ALCANCE_TEXTO_PORTAL[extra.alcance]}` +
          `${titulo ? ` (${titulo})` : ''}? Lo que declare en nombre de la sociedad la OBLIGA frente a la compañía.`,
      )
      if (!ok) return
    }
    void ejecutar(`aut-${r.relacionadoId}`, 'PATCH', {
      relacionadoId: r.relacionadoId,
      autoriza,
      ...(autoriza && extra
        ? {
            alcance: extra.alcance,
            ...(extra.tituloRepresentacion ? { tituloRepresentacion: extra.tituloRepresentacion } : {}),
          }
        : {}),
    })
  }

  // «Revisado: no son nada» en un clic, sin pasar por el formulario. Es la
  // respuesta correcta para la mayoría de los que salen ahí (Alberto, 03/09/2026:
  // «Antonio Sevico no tiene vinculación ninguna») y hasta hoy no se podía decir.
  function sinVinculoDe(p: SugerenciaVinculo) {
    void ejecutar(`nada-${p.fichaId}`, 'POST', { relacionadoId: p.fichaId, tipo: SIN_VINCULO })
  }

  /**
   * Corregir el tipo de un vínculo ya anotado, sin quitarlo y volver a ponerlo.
   *
   * 🚨 No es un atajo de comodidad (Alberto, 04/09/2026, «¿cómo podría cambiar la
   * relación?»): `quitar` REVOCA de paso la autorización del portal que hubiera
   * —y lo hace bien, para dejar constancia—, así que corregir una etiqueta mal
   * puesta costaba el consentimiento del cliente. El puerto rechaza el cambio si
   * la autorización viva no cabe en el tipo nuevo, y ahí sí hay que revocar antes.
   */
  function cambiarTipo(r: RelacionCartera, tipo: string) {
    if (tipo === '' || tipo === r.tipo) return
    void ejecutar(`tipo-${r.relacionadoId}`, 'PATCH', { relacionadoId: r.relacionadoId, tipo })
  }

  /**
   * Alta de una ficha NUEVA desde aquí (la persona de contacto que no está en
   * la cartera). Es la primera de las dos escrituras; la segunda es la relación,
   * que sale por `onCrear` como cualquier otra.
   */
  async function altaPersona(body: Record<string, unknown>): Promise<ResultadoEscritura> {
    try {
      const res = await fetch('/api/correduria/cliente', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      return interpretarEscritura(res.status, await res.json().catch(() => null))
    } catch {
      return { estado: 'error', motivo: 'red' }
    }
  }

  function quitar(r: RelacionCartera) {
    // La relación se borra; la autorización NO se borra, se REVOCA — es la prueba
    // de que existió y hasta cuándo, y eso es justo lo que no se puede perder.
    if (!confirm(`¿Quitar la relación con ${r.nombre}? Se borra en los dos sentidos, y la autorización que hubiera queda revocada (se conserva en el registro).`)) return
    void ejecutar(`del-${r.relacionadoId}`, 'DELETE', { relacionadoId: r.relacionadoId })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
      {lista === null ? (
        <div style={pendienteBox}>
          ⚠️ No se han podido leer las relaciones de esta ficha (asegura no manda el bloque o no pudo
          consultarlo). No significa que no tenga: significa que desde aquí no se ve. Se puede añadir
          igualmente.
        </div>
      ) : lista.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Sin relaciones anotadas: se ha mirado y no hay ninguna.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
          {lista.map((r) => (
            <Vinculo
              key={r.relacionadoId}
              r={r}
              nombreFicha={nombreFicha}
              ocupado={ocupado}
              onAutorizar={autorizar}
              onQuitar={quitar}
              onCambiarTipo={cambiarTipo}
            />
          ))}
        </ul>
      )}

      {resultado && resultado.estado !== 'ok' && <Aviso r={resultado} />}

      {/* `lista === null` = no se han podido leer las relaciones. Entonces no se sabe
          quién tiene vínculo y quién no, y ofrecer «declarar» a todos sería afirmar
          que no lo tienen: se calla (regla `null` ≠ `[]`). */}
      <SinVinculo
        personas={lista === null ? [] : sinVinculo.filter((p) => !lista.some((r) => r.relacionadoId === p.fichaId))}
        nombreFicha={nombreFicha}
        onDeclarar={(p) => setPreseleccion((v) => ({ cand: { id: p.fichaId, nombre: p.nombre, tipo: '', polizas: 0 }, n: (v?.n ?? 0) + 1 }))}
        onSinVinculo={sinVinculoDe}
        ocupado={ocupado}
      />

      <Anadir
        key={preseleccion?.n ?? 0}
        clienteId={clienteId}
        nombreFicha={nombreFicha}
        yaRelacionados={lista ? lista.map((r) => r.relacionadoId) : []}
        ocupado={ocupado === 'add'}
        onCrear={(body) => ejecutar('add', 'POST', body)}
        onAlta={altaPersona}
        tipoPersona={tipoPersona}
        preseleccion={preseleccion?.cand ?? null}
      />

      <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
        La autorización es un consentimiento del titular: <strong>tú la ANOTAS, no la das</strong>. Anótala solo si te
        la ha dado por teléfono o en papel (queda registrado quién, cuándo y con qué texto). Caduca al año y no abre
        nada hasta que la persona autorizada la acepte en su portal.{' '}
        <strong>Si la ficha es una sociedad</strong>, lo que se anota no es un permiso para mirar sino{' '}
        <strong>quién la representa</strong>: por eso se pide el título y por eso ahí sí caben los partes y la
        documentación. De una persona solo se puede anotar que deja mirar.
      </p>
    </div>
  )
}

// ─── Un vínculo ──────────────────────────────────────────────────────────────

function Vinculo({ r, nombreFicha, ocupado, onAutorizar, onQuitar, onCambiarTipo }: {
  r: RelacionCartera
  nombreFicha: string
  ocupado: string | null
  onAutorizar: (
    r: RelacionCartera,
    autoriza: boolean,
    extra?: { alcance: AlcancePortal; tituloRepresentacion: TituloRepresentacionPortal | null },
  ) => void
  onQuitar: (r: RelacionCartera) => void
  onCambiarTipo: (r: RelacionCartera, tipo: string) => void
}) {
  const ficha = `/correduria/cliente/${r.relacionadoId}`
  const enCurso =
    ocupado === `aut-${r.relacionadoId}` ||
    ocupado === `del-${r.relacionadoId}` ||
    ocupado === `tipo-${r.relacionadoId}`
  // `Sin vínculo` no es un parentesco: es la constancia de que se miró y no hay
  // ninguno. Ni se explica quién ve qué ni se ofrece autorizar (el puerto lo
  // rechaza igualmente con un 422, y el portal ni mira esas filas).
  const revisadoSinVinculo = !permiteAutorizar(r.tipo)
  const viva = r.autorizacion?.estado === 'vigente' || r.autorizacion?.estado === 'pendiente'
  // `null` (asegura no lo manda o no lo pudo leer) NO cuenta como sociedad: se
  // ofrece solo lo de siempre, que es el lado que no apodera a nadie de más.
  const esSociedad = r.tipoOtorgante === 'juridica'
  if (revisadoSinVinculo) {
    return (
      <li style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', minWidth: 0 }}>
          <Link href={ficha} style={{ fontWeight: 700, fontSize: 14, overflowWrap: 'anywhere' }}>{r.nombre}</Link>
          <span style={{ fontSize: 13 }}>· revisado: no hay vínculo</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Sale en las pólizas de {nombreFicha} pero no es nada suyo. Queda anotado para no volver
          a preguntarlo, y <strong>no puede ver sus seguros</strong>: para autorizar a alguien hace
          falta antes una relación de verdad.
        </div>
        {r.observaciones && (
          <div style={{ fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>📝 {r.observaciones}</div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" disabled={enCurso} onClick={() => onQuitar(r)} style={{ ...btnStyle('sutil'), whiteSpace: 'normal', minHeight: 44 }}>
            Quitar la anotación
          </button>
        </div>
        {/* Aquí es donde más falta hace: «revisado, no hay vínculo» es la
            respuesta rápida del día a día, y cuando resulta que sí lo había
            (el conductor ERA el hijo) se corrige sin perder nada. */}
        <CambiarTipo r={r} enCurso={enCurso} onCambiarTipo={onCambiarTipo} />
      </li>
    )
  }
  return (
    <li style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', minWidth: 0 }}>
        <Link href={ficha} style={{ fontWeight: 700, fontSize: 14, overflowWrap: 'anywhere' }}>{r.nombre}</Link>
        <span style={{ fontSize: 13 }}>· {r.tipo}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {/* null = asegura no las contó: no es «0 pólizas». */}
          {r.polizasVivas === null ? 'pólizas sin contar' : `${r.polizasVivas} póliza${r.polizasVivas === 1 ? '' : 's'} viva${r.polizasVivas === 1 ? '' : 's'}`}
        </span>
      </div>

      <EstadoAutorizacion a={r.autorizacion} nombreOtro={r.nombre} nombreFicha={nombreFicha} />

      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
        ¿{nombreFicha} ve los de {r.nombre}? <strong>{r.puedeVer ? 'sí' : 'no'}</strong> · se decide desde{' '}
        <Link href={ficha}>la ficha de {r.nombre}</Link>
      </div>

      {r.observaciones && (
        <div style={{ fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>📝 {r.observaciones}</div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {/* Hay algo que revocar mientras la autorización no esté ya cerrada: una
            PENDIENTE también se revoca (existe, aunque no abra nada todavía). */}
        {viva ? (
          <button type="button" disabled={enCurso} onClick={() => onAutorizar(r, false)} style={{ ...btnStyle('secundario'), whiteSpace: 'normal', textAlign: 'left', minHeight: 44 }}>
            🔒 {r.autorizacion?.estado === 'pendiente' ? 'Retirar la autorización anotada' : 'Revocar la autorización'}
          </button>
        ) : esSociedad ? null : (
          <button type="button" disabled={enCurso} onClick={() => onAutorizar(r, true)} style={{ ...btnStyle('primario'), whiteSpace: 'normal', textAlign: 'left', minHeight: 44 }}>
            🔓 Anotar que {nombreFicha} autoriza a {r.nombre} a ver sus seguros
          </button>
        )}
        <button type="button" disabled={enCurso} onClick={() => onQuitar(r)} style={{ ...btnStyle('sutil'), whiteSpace: 'normal', minHeight: 44 }}>
          Quitar relación
        </button>
      </div>

      <CambiarTipo r={r} enCurso={enCurso} onCambiarTipo={onCambiarTipo} />

      {/* 🚨 Desde una ficha de SOCIEDAD no basta un botón: hay que decir QUÉ se
          delega (mirar o actuar) y con qué TÍTULO se la representa. Desde una
          ficha de persona esto no aparece — ahí solo se puede dejar mirar, y
          ofrecer un apoderamiento sería ofrecer algo que el puerto rechaza. */}
      {!viva && esSociedad && (
        <AnotarSociedad r={r} nombreFicha={nombreFicha} enCurso={enCurso} onAutorizar={onAutorizar} />
      )}
    </li>
  )
}

/**
 * «Cambiar el tipo» de un vínculo que ya existe.
 *
 * Va PLEGADO y en tono sutil a propósito: corregir una etiqueta es raro
 * comparado con autorizar o quitar, y un desplegable abierto en cada vínculo
 * convierte la lista en un formulario. El `<details>` nativo evita el `useState`
 * y se cierra solo al recargar la lista.
 *
 * El botón solo se enciende con un tipo DISTINTO del que ya tiene: mandar el
 * mismo devuelve un 422 del puerto, y un error por pulsar un botón que la
 * pantalla ofrecía es la pantalla mintiendo.
 */
function CambiarTipo({ r, enCurso, onCambiarTipo }: {
  r: RelacionCartera
  enCurso: boolean
  onCambiarTipo: (r: RelacionCartera, tipo: string) => void
}) {
  const [tipo, setTipo] = useState<string>(r.tipo)
  return (
    <details>
      <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer', listStyle: 'none', userSelect: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 32 }}>
        Cambiar el tipo de relación
      </summary>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          aria-label={`Tipo de relación con ${r.nombre}`}
          style={{
            flex: '1 1 200px', minWidth: 0, minHeight: 44, padding: '8px 10px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 15,
          }}
        >
          {GRUPOS_RELACION.map((g) => (
            <optgroup key={g.categoria} label={g.categoria}>
              {g.tipos.map((t) => <option key={t} value={t}>{t}</option>)}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          disabled={enCurso || tipo === r.tipo}
          onClick={() => onCambiarTipo(r, tipo)}
          style={{ ...btnStyle('secundario'), minHeight: 44 }}
        >
          Guardar
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
        Se cambia en las dos fichas y queda en el historial. La autorización del
        portal NO se toca — si la que hay no cabe en el tipo nuevo, hay que
        revocarla antes y la pantalla lo dirá.
      </div>
    </details>
  )
}

/**
 * El alta de una autorización cuando la ficha es una SOCIEDAD.
 *
 * Lo que se delega no es consentimiento de datos personales —una sociedad no los
 * tiene— sino REPRESENTACIÓN mercantil, y por eso aquí sí caben `partes` y
 * `documentos`. El TÍTULO es obligatorio en esos dos (lo exige un CHECK de la BD)
 * y aquí se pide siempre: si quien actúa por la empresa da un parte, la que queda
 * obligada es ella, y «alguien de la empresa» no es un título.
 */
function AnotarSociedad({ r, nombreFicha, enCurso, onAutorizar }: {
  r: RelacionCartera
  nombreFicha: string
  enCurso: boolean
  onAutorizar: (
    r: RelacionCartera,
    autoriza: boolean,
    extra?: { alcance: AlcancePortal; tituloRepresentacion: TituloRepresentacionPortal | null },
  ) => void
}) {
  // `''` = todavía no ha elegido, que NO es haber elegido lo más pequeño.
  const [alcance, setAlcance] = useState<AlcancePortal | ''>('')
  const [titulo, setTitulo] = useState<TituloRepresentacionPortal | ''>('')
  const opciones = alcancesAnotables(r.tipoOtorgante)
  const listo = alcance !== '' && titulo !== ''

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        <strong>{nombreFicha} es una sociedad</strong>, así que aquí no se anota un permiso para mirar:
        se anota <strong>quién puede representarla</strong>. Quien la represente ve lo que paga, su CIF y
        su cuenta bancaria —son datos de la empresa— y, con «dar partes», lo que declare{' '}
        <strong>obliga a la sociedad</strong>. Lo que no puede hacer nunca es autorizar a nadie más.
      </div>

      <Campo label={`¿Qué puede hacer ${r.nombre} por ${nombreFicha}?`}>
        <select value={alcance} onChange={(e) => setAlcance(e.target.value as AlcancePortal | '')} style={campo} disabled={enCurso}>
          <option value="">Elige qué se delega…</option>
          {opciones.map((a) => (
            <option key={a} value={a}>{ALCANCE_TEXTO_PORTAL[a]}</option>
          ))}
        </select>
      </Campo>

      <Campo
        label="¿Con qué título la representa?"
        ayuda="Queda guardado con la autorización. Obligatorio para dar partes o manejar documentos: sin él, lo que declare no se le puede oponer a la compañía."
      >
        <select value={titulo} onChange={(e) => setTitulo(e.target.value as TituloRepresentacionPortal | '')} style={campo} disabled={enCurso}>
          <option value="">Elige el título…</option>
          {TITULOS_REPRESENTACION_PORTAL.map((t) => (
            <option key={t} value={t}>{TITULO_TEXTO_PORTAL[t]}</option>
          ))}
        </select>
      </Campo>

      <div>
        <button
          type="button"
          disabled={enCurso || !listo}
          onClick={() => {
            if (alcance === '' || titulo === '') return
            onAutorizar(r, true, { alcance, tituloRepresentacion: titulo })
          }}
          style={{ ...btnStyle('primario'), whiteSpace: 'normal', textAlign: 'left', minHeight: 44 }}
        >
          🔓 Anotar la autorización de {nombreFicha} a {r.nombre}
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
        Nace <strong>pendiente</strong>: no abre nada hasta que {r.nombre} la acepte en su portal.
      </div>
    </div>
  )
}

// ─── El estado de la autorización ────────────────────────────────────────────

/**
 * 🚨 Los TRES estados en pantalla. El titular sale de
 * `explicarEstadoAutorizacion` (puro y con test) para que la frase que decide
 * Alberto no viva dentro del JSX, que es donde «pendiente» se convertiría en
 * «ve» al tocar un `?:`.
 */
function EstadoAutorizacion({ a, nombreOtro, nombreFicha }: {
  a: AutorizacionCartera | null
  nombreOtro: string
  nombreFicha: string
}) {
  const icono = a === null ? '🔒' : a.estado === 'vigente' ? '🔓' : a.estado === 'pendiente' ? '🕐' : '🔒'
  const color = a?.estado === 'vigente' ? 'var(--positive)' : a?.estado === 'pendiente' ? 'var(--warning)' : 'var(--muted)'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4, borderLeft: `3px solid ${color}`, paddingLeft: 8 }}>
      <div style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'flex-start', minWidth: 0 }}>
        <span aria-hidden>{icono}</span>
        <span style={{ overflowWrap: 'anywhere' }}>{explicarEstadoAutorizacion(a, nombreOtro, nombreFicha)}</span>
      </div>
      {a?.estado === 'pendiente' && (
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          Está anotada y registrada, pero <strong>no abre nada todavía</strong>: la doble aceptación es lo que deja
          constancia de que {nombreOtro} sabe que hay un permiso a su nombre.
        </div>
      )}
      {a?.estado === 'vigente' && (
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          {a.origen === 'corredor' ? 'La anotó la correduría' : 'La concedió el cliente desde su portal'} · caduca el{' '}
          {fechaLarga(a.caducaEn)} (no se renueva sola) · puede:{' '}
          {a.alcances.length > 0 ? a.alcances.map((x) => ALCANCE_TEXTO_PORTAL[x]).join(' · ') : 'sin detallar'}
          {/* El título solo consta cuando cede una sociedad. `null` ahí es lo
              normal entre personas: no se representa a nadie, se mira. */}
          {comoTitulo(a.tituloRepresentacion) ? ` · ${comoTitulo(a.tituloRepresentacion)}` : ''}
        </div>
      )}
    </div>
  )
}

// ─── Añadir ──────────────────────────────────────────────────────────────────

type Candidato = { id: string; nombre: string; tipo: string; polizas: number }

function Anadir({ clienteId, nombreFicha, yaRelacionados, ocupado, onCrear, onAlta, tipoPersona, preseleccion }: {
  clienteId: string
  nombreFicha: string
  yaRelacionados: string[]
  ocupado: boolean
  onCrear: (body: Record<string, unknown>) => Promise<RespuestaRelaciones>
  /** Alta de una ficha que todavía no existe, para la persona de contacto. */
  onAlta: (body: Record<string, unknown>) => Promise<ResultadoEscritura>
  tipoPersona: 'fisica' | 'juridica' | null
  /** Ficha ya elegida desde «sin vínculo declarado»: se salta el buscador.
   *  El padre remonta este componente al cambiarla, así que basta con nacer con ella. */
  preseleccion: Candidato | null
}) {
  const [abierto, setAbierto] = useState(preseleccion !== null)
  // Dar de alta a alguien que NO está en la cartera. Se llega aquí por el botón
  // de arriba o desde el «no está» de una búsqueda, y por eso hereda el término
  // buscado: teclear el nombre dos veces era el sitio donde se abandonaba.
  const [modoAlta, setModoAlta] = useState(false)
  const [q, setQ] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [busqueda, setBusqueda] = useState<RespuestaBusqueda | null>(null)
  const [elegido, setElegido] = useState<Candidato | null>(preseleccion)
  const [tipo, setTipo] = useState<TipoRelacion>('Cónyuge/Pareja de Hecho')
  const [observaciones, setObservaciones] = useState('')

  async function buscar() {
    const termino = q.trim()
    if (termino === '') return
    setBuscando(true)
    setElegido(null)
    try {
      const res = await fetch(`/api/correduria/clientes?q=${encodeURIComponent(termino)}`, { cache: 'no-store' })
      // El endpoint ya devuelve la búsqueda interpretada por el servidor.
      const json = (await res.json().catch(() => null)) as RespuestaBusqueda | null
      setBusqueda(json && typeof json === 'object' && 'estado' in json ? json : { estado: 'error', motivo: 'respuesta_ilegible' })
    } catch {
      setBusqueda({ estado: 'error', motivo: 'red' })
    } finally {
      setBuscando(false)
    }
  }

  async function crear() {
    if (!elegido) return
    const r = await onCrear({ relacionadoId: elegido.id, tipo, observaciones: observaciones.trim() || undefined })
    if (r.estado === 'ok') {
      setAbierto(false)
      setQ('')
      setBusqueda(null)
      setElegido(null)
      setObservaciones('')
    }
  }

  if (!abierto) {
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => { setModoAlta(false); setAbierto(true) }} style={btnStyle('secundario')}>➕ Añadir relación</button>
        {/* La persona que lleva los seguros de una sociedad casi nunca está en la
            cartera: mandarla a /correduria/cliente/nuevo era perder la ficha,
            volver y buscarla. Desde aquí se crea y se vincula de una vez. */}
        <button type="button" onClick={() => { setModoAlta(true); setAbierto(true) }} style={btnStyle('secundario')}>
          ➕ Nueva persona de contacto
        </button>
      </div>
    )
  }

  if (modoAlta) {
    return (
      <AltaPersona
        nombreFicha={nombreFicha}
        tipoPersona={tipoPersona}
        ocupado={ocupado}
        terminoInicial={q.trim()}
        onAlta={onAlta}
        onCrear={onCrear}
        onCancelar={() => { setModoAlta(false); setAbierto(false) }}
        onBuscar={() => setModoAlta(false)}
      />
    )
  }

  const candidatos = busqueda?.estado === 'ok'
    ? busqueda.clientes.filter((c) => c.id !== clienteId && !yaRelacionados.includes(c.id))
    : []

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Añadir relación a {nombreFicha}</div>

      <form
        onSubmit={(e) => { e.preventDefault(); void buscar() }}
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'end' }}
      >
        {/* Solo NOMBRE y APELLIDOS: `buscarClientes` (apps/asegura/lib/cartera-ficha.ts)
            no mira DNI, teléfono ni email, y un DNI tecleado aquí devuelve vacío,
            que se lee como «no está en la cartera». */}
        <Campo label="Buscar la otra ficha por nombre y apellidos">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="María Antonia…" style={campo} autoComplete="off" />
        </Campo>
        <button type="submit" disabled={buscando || q.trim() === ''} style={btnStyle('secundario')}>
          {buscando ? '…' : 'Buscar'}
        </button>
      </form>

      {busqueda && busqueda.estado !== 'ok' && (
        <div style={pendienteBox}>
          {busqueda.estado === 'sin_configurar'
            ? 'El puerto con asegura no está conectado (falta ASEGURA_OPERADOR_SECRET).'
            : `No se ha podido buscar: ${textoMotivoRelaciones(busqueda.motivo)}`}
        </div>
      )}
      {busqueda?.estado === 'ok' && !busqueda.buscado && (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Término demasiado corto: escribe algo más.</div>
      )}
      {busqueda?.estado === 'ok' && busqueda.buscado && candidatos.length === 0 && (
        <div style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
          <span>Nadie en la cartera con «{busqueda.termino}» que no esté ya relacionado.</span>
          <div>
            <button type="button" onClick={() => setModoAlta(true)} style={btnStyle('secundario', 'sm')}>
              ➕ Darla de alta y vincularla a {nombreFicha}
            </button>
          </div>
        </div>
      )}
      {candidatos.length > 0 && !elegido && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
          {candidatos.slice(0, 20).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setElegido(c)}
                style={{ ...btnStyle('secundario'), width: '100%', justifyContent: 'space-between', whiteSpace: 'normal', textAlign: 'left' }}
              >
                <span style={{ overflowWrap: 'anywhere' }}>{c.nombre}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{c.tipo} · {c.polizas} pól.</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {elegido && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
          <div style={{ fontSize: 13, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>Ficha elegida: <strong style={{ overflowWrap: 'anywhere' }}>{elegido.nombre}</strong></span>
            <button type="button" onClick={() => setElegido(null)} style={btnStyle('sutil', 'sm')}>cambiar</button>
          </div>
          <Campo label={`¿Qué es ${elegido.nombre} para ${nombreFicha}?`} ayuda="Se lee desde esta ficha: «Cónyuge» = la persona elegida es cónyuge de la ficha. El sentido inverso se anota solo.">
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoRelacion)} style={campo}>
              {GRUPOS_RELACION.map((g) => (
                <optgroup key={g.categoria} label={g.categoria}>
                  {g.tipos.map((t) => <option key={t} value={t}>{t}</option>)}
                </optgroup>
              ))}
            </select>
          </Campo>
          <Campo label="Observaciones (opcional)">
            <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} style={campo} maxLength={500} />
          </Campo>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={ocupado} onClick={() => void crear()} style={btnStyle('primario')}>
              {ocupado ? 'Guardando…' : 'Guardar relación'}
            </button>
            <button type="button" disabled={ocupado} onClick={() => setAbierto(false)} style={btnStyle('sutil')}>Cancelar</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            Guardar la relación NO autoriza a nadie a ver nada: la autorización se da después, con su botón.
          </div>
        </div>
      )}

      {!elegido && (
        <div>
          <button type="button" onClick={() => setAbierto(false)} style={btnStyle('sutil')}>Cancelar</button>
        </div>
      )}
    </div>
  )
}

// ─── Alta de la persona de contacto ──────────────────────────────────────────

/**
 * Crear la ficha de la persona que lleva los seguros de esta otra (el
 * administrador de una sociedad, típicamente) y vincularla, sin salir de aquí.
 *
 * Por qué una ficha propia y no un campo «persona de contacto» dentro de la
 * sociedad (Alberto, 05/09/2026): **esa persona es un futuro cliente**. El
 * estado se DERIVA de sus pólizas, así que nace 🕐 Lead sola y pasará a
 * ✅ Cliente el día que CIMA confirme la primera que le vendas, sin migrar nada.
 * Con un campo de texto habría que crearla de cero ese día y se perdería todo lo
 * anterior.
 *
 * 🚨 Son DOS escrituras y la segunda puede fallar sola. Lo que se pinta entonces
 * lo decide `combinarPersonaContacto`, no este JSX: la frase de «creada pero sin
 * vincular» es la que evita que el siguiente clic dé de alta una segunda ficha
 * de la misma persona.
 *
 * 🔒 Y lo que este formulario NO hace: dar acceso. Crear la ficha y anotar el
 * vínculo no abre nada — la autorización del portal es un consentimiento con su
 * alcance, su caducidad y su aceptación por parte de quien la recibe, y se anota
 * después desde la fila del vínculo. Meterla aquí de paso la convertiría en una
 * casilla marcada por defecto.
 */
function AltaPersona({ nombreFicha, tipoPersona, ocupado, terminoInicial, onAlta, onCrear, onCancelar, onBuscar }: {
  nombreFicha: string
  tipoPersona: 'fisica' | 'juridica' | null
  ocupado: boolean
  /** Lo que se tecleó en el buscador, para no escribir el nombre dos veces. */
  terminoInicial: string
  onAlta: (body: Record<string, unknown>) => Promise<ResultadoEscritura>
  onCrear: (body: Record<string, unknown>) => Promise<RespuestaRelaciones>
  onCancelar: () => void
  onBuscar: () => void
}) {
  const tipos = tiposContactoSugeridos(tipoPersona)
  const [f, setF] = useState({ nombre: terminoInicial, apellidos: '', telefono: '', email: '' })
  const [tipo, setTipo] = useState<TipoRelacion>(tipos[0])
  const [observaciones, setObservaciones] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [campoMal, setCampoMal] = useState<string | null>(null)
  const [resAlta, setResAlta] = useState<ResultadoEscritura | null>(null)
  const [resVinculo, setResVinculo] = useState<RespuestaRelaciones | null>(null)
  const [resumen, setResumen] = useState<ResultadoPersonaContacto | null>(null)
  /** Ficha que YA existía y se ha vinculado sin crear nada (el caso del 409). */
  const [reutilizada, setReutilizada] = useState<string | null>(null)

  const nombreCompleto = [f.nombre.trim(), f.apellidos.trim()].filter((x) => x !== '').join(' ') || 'esta persona'

  function set<K extends keyof typeof f>(k: K, v: string) {
    setF((prev) => ({ ...prev, [k]: v }))
  }

  async function vincular(id: string): Promise<RespuestaRelaciones> {
    const r = await onCrear({ relacionadoId: id, tipo, observaciones: observaciones.trim() || undefined })
    setResVinculo(r)
    return r
  }

  async function crear(forzar = false) {
    const rev = revisarAlta({ ...f, fuente: FUENTE_PERSONA_CONTACTO })
    if (!rev.ok) {
      setCampoMal(rev.campo ?? null)
      setResAlta({ estado: 'invalido', motivo: rev.motivo, campo: rev.campo ?? null })
      return
    }
    setCampoMal(null)
    setTrabajando(true)
    setResVinculo(null)
    setResumen(null)
    setReutilizada(null)
    try {
      // `tipoPersona` lo deduce el módulo del DNI y el puerto lo vuelve a
      // deducir: mandarlo desde aquí sería una tercera opinión sobre lo mismo.
      const { tipoPersona: _tp, ...alta } = rev.alta
      void _tp
      const ra = await onAlta({ ...alta, forzar })
      setResAlta(ra)
      if (ra.estado === 'invalido') setCampoMal(ra.campo)
      const id = ra.estado === 'ok' ? ra.id : null
      const rv = ra.estado === 'ok' && id ? await vincular(id) : null
      setResumen(combinarPersonaContacto(
        ra.estado === 'ok' ? { ok: true, id } : { ok: false },
        rv === null ? null : { ok: rv.estado === 'ok' },
      ))
    } finally {
      setTrabajando(false)
    }
  }

  /** Reintento del vínculo SOLO: la ficha ya existe y volver a darla de alta la duplicaría. */
  async function reintentarVinculo(id: string) {
    setTrabajando(true)
    try {
      const rv = await vincular(id)
      setResumen(combinarPersonaContacto({ ok: true, id }, { ok: rv.estado === 'ok' }))
    } finally {
      setTrabajando(false)
    }
  }

  /** Vincular una ficha que ya estaba (la del 409): no se crea nada. */
  async function usarExistente(c: { id: string; nombre: string }) {
    setTrabajando(true)
    try {
      const rv = await vincular(c.id)
      if (rv.estado === 'ok') {
        setReutilizada(c.nombre)
        setResAlta(null)
        setResumen(null)
      }
    } finally {
      setTrabajando(false)
    }
  }

  const ocupadoYa = ocupado || trabajando
  const hecho = resumen?.estado === 'creada_y_vinculada' || reutilizada !== null

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Nueva persona de contacto de {nombreFicha}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        Se crea su <strong>propia ficha</strong> y se vincula a {nombreFicha}. Nace como 🕐 lead —que es lo que
        es— y pasará a cliente sola el día que le vendas algo y CIMA lo confirme.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        <Campo label="Nombre *">
          <input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} style={{ ...campo, ...(campoMal === 'nombre' ? malo : {}) }} autoFocus />
        </Campo>
        <Campo label="Apellidos">
          <input value={f.apellidos} onChange={(e) => set('apellidos', e.target.value)} style={{ ...campo, ...(campoMal === 'apellidos' ? malo : {}) }} />
        </Campo>
      </div>

      {/* El teléfono y el email no son un adorno: son POR DONDE ENTRARÁ al
          portal el día que se le autorice (la identidad se prueba con un código
          de un solo uso a uno de los dos). Sin ninguno de los dos, ni se le
          puede dar acceso ni se vuelve a encontrar la ficha. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        <Campo label="Teléfono" ayuda="Hace falta el teléfono o el email: es por donde entrará al portal cuando le des acceso.">
          <input type="tel" value={f.telefono} onChange={(e) => set('telefono', e.target.value)} placeholder="600 000 000" style={{ ...campo, ...(campoMal === 'telefono' ? malo : {}) }} />
        </Campo>
        <Campo label="Email">
          <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="nombre@dominio.es" style={{ ...campo, ...(campoMal === 'email' ? malo : {}) }} />
        </Campo>
      </div>

      <Campo label={`¿Qué es de ${nombreFicha}?`} ayuda="Se lee desde esta ficha: «Administración» = la persona administra la sociedad.">
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoRelacion)} style={campo}>
          {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Campo>
      <Campo label="Observaciones (opcional)">
        <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} style={campo} maxLength={500} />
      </Campo>

      {!hecho && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" disabled={ocupadoYa} onClick={() => void crear()} style={btnStyle('primario')}>
            {ocupadoYa ? 'Guardando…' : 'Crear y vincular'}
          </button>
          <button type="button" disabled={ocupadoYa} onClick={onBuscar} style={btnStyle('sutil')}>Buscarla en la cartera</button>
          <button type="button" disabled={ocupadoYa} onClick={onCancelar} style={btnStyle('sutil')}>Cancelar</button>
        </div>
      )}

      {/* 🚨 Ya existe alguien con ese DNI, teléfono o email. Vincular la ficha que
          hay es SIEMPRE mejor que crear otra: dos fichas de la misma persona no
          se ven —y se descubren cuando una tiene las pólizas y la otra el móvil. */}
      {resAlta?.estado === 'conflicto' && (
        <div style={{ fontSize: 13, lineHeight: 1.5, borderRadius: 8, padding: '8px 10px', color: 'var(--warning)', background: 'var(--warning-bg)' }}>
          ⚠️ <strong>Ya hay una ficha con ese dato:</strong>
          <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
            {resAlta.coincidencias.map((c) => (
              <li key={`${c.por}-${c.id}`} style={{ marginBottom: 4 }}>
                <Link href={`/correduria/cliente/${c.id}`} style={{ fontWeight: 600 }}>{c.nombre}</Link>{' '}
                <span style={{ color: 'var(--muted)' }}>(mismo {c.por} · {c.tipo})</span>{' '}
                <button type="button" disabled={ocupadoYa} onClick={() => void usarExistente(c)} style={btnStyle('secundario', 'sm')}>
                  Es esta: vincularla
                </button>
              </li>
            ))}
            {resAlta.coincidencias.length === 0 && <li>asegura no dice con cuál.</li>}
          </ul>
          {coincidenciaBloquea(resAlta.coincidencias) || !resAlta.forzable ? (
            <div>Con el mismo DNI es la misma persona: no se crea otra ficha.</div>
          ) : (
            <button type="button" disabled={ocupadoYa} onClick={() => void crear(true)} style={btnStyle('secundario')}>
              Es otra persona: crearla igualmente (comparten teléfono/email)
            </button>
          )}
        </div>
      )}

      {resAlta && resAlta.estado !== 'ok' && resAlta.estado !== 'conflicto' && (
        <div style={{ fontSize: 13, borderRadius: 8, padding: '8px 10px', color: 'var(--negative)', background: 'var(--negative-bg)' }}>
          {resAlta.estado === 'invalido' ? `✖ ${textoMotivoAlta(resAlta.motivo)}` :
            resAlta.estado === 'sin_configurar' ? '⏳ El puerto con asegura no está conectado (falta ASEGURA_OPERADOR_SECRET). No se ha creado nada.' :
            resAlta.estado === 'no_encontrado' ? 'asegura respondió «no encontrado» a un alta: revisa el puerto.' :
            `⚠️ No se ha podido crear: ${textoMotivoAlta(resAlta.motivo)}`}
        </div>
      )}

      {resumen && resumen.estado !== 'no_creada' && (
        <div
          style={{
            fontSize: 13, lineHeight: 1.5, borderRadius: 8, padding: '8px 10px',
            color: resumen.estado === 'creada_y_vinculada' ? 'var(--positive)' : 'var(--warning)',
            background: resumen.estado === 'creada_y_vinculada' ? 'var(--positive-bg)' : 'var(--warning-bg)',
          }}
        >
          {textoPersonaContacto(resumen, nombreCompleto, nombreFicha)}
          {resumen.estado === 'creada_sin_vinculo' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
              <button type="button" disabled={ocupadoYa} onClick={() => void reintentarVinculo(resumen.id)} style={btnStyle('secundario', 'sm')}>
                Reintentar solo el vínculo
              </button>
              <Link href={`/correduria/cliente/${resumen.id}`} style={{ fontSize: 12 }}>abrir su ficha</Link>
            </div>
          )}
          {resumen.estado === 'creada_y_vinculada' && (
            <div style={{ marginTop: 6 }}>
              <Link href={`/correduria/cliente/${resumen.id}`} style={{ fontSize: 12 }}>abrir la ficha de {nombreCompleto}</Link>
            </div>
          )}
        </div>
      )}

      {/* Por qué falló el vínculo, con el mismo aviso que el resto de la tarjeta. */}
      {resumen?.estado === 'creada_sin_vinculo' && resVinculo && resVinculo.estado !== 'ok' && <Aviso r={resVinculo} />}

      {reutilizada && (
        <div style={{ fontSize: 13, lineHeight: 1.5, borderRadius: 8, padding: '8px 10px', color: 'var(--positive)', background: 'var(--positive-bg)' }}>
          ✅ {reutilizada} ya estaba en la cartera y se ha vinculado a {nombreFicha} (no se ha creado ninguna ficha
          nueva). Todavía NO ve nada: el acceso al portal se le da aparte, con «Autorizar» en su fila.
        </div>
      )}

      {hecho && (
        <div>
          <button type="button" onClick={onCancelar} style={btnStyle('secundario')}>Cerrar</button>
        </div>
      )}
    </div>
  )
}

// ─── Las que salen en sus pólizas y no tienen vínculo ────────────────────────

export type SugerenciaVinculo = {
  fichaId: string
  nombre: string
  papel: string
  /** Hay otra fila con el mismo nombre y no se distinguen: puede ser la misma
   *  persona con dos fichas, y una de ellas quizá ya tenga el vínculo puesto. */
  ojoDuplicada: boolean
}

/**
 * 🚨 Alberto, 03/09/2026, sobre la ficha de José Suárez Salas: «Antonio Sevico,
 * y aquí no aparece en Relaciones y autorizaciones».
 *
 * No era un fallo de lectura: Antonio tiene ficha propia (interviene como
 * conductor ocasional en 18 pólizas de la cartera) pero NADIE le anotó un
 * vínculo, y esta tarjeta solo pinta `cliente_relaciones`. La tarjeta 👤 lo
 * mandaba a anotarlo «en Relaciones y autorizaciones» y al llegar aquí había
 * que teclear su nombre en un buscador y acertar. Ahora sale, y con su botón.
 *
 * Medido el 03/09/2026 en la cartera: 17 pares persona↔ficha así, en 15 fichas.
 *
 * Que estén aquí NO es un vínculo: es «esta persona sale en sus pólizas y no
 * has dicho qué es tuyo». La lista vacía se calla; no se inventa una relación.
 */
function SinVinculo({ personas, nombreFicha, onDeclarar, onSinVinculo, ocupado }: {
  personas: SugerenciaVinculo[]
  nombreFicha: string
  onDeclarar: (p: SugerenciaVinculo) => void
  onSinVinculo: (p: SugerenciaVinculo) => void
  ocupado: string | null
}) {
  if (personas.length === 0) return null
  return (
    <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>En sus pólizas, sin vínculo declarado</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        Salen en las pólizas de {nombreFicha} y tienen ficha propia, pero nadie ha anotado qué relación
        tienen con {nombreFicha}. Declararla NO autoriza a nadie a ver nada: la autorización se da
        después, con su botón.
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
        {personas.map((p) => (
          <li key={p.fichaId} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href={`/correduria/cliente/${p.fichaId}`} style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{p.nombre}</Link>
            {p.papel && <span style={{ fontSize: 12, color: 'var(--muted)' }}>· {p.papel}</span>}
            <button type="button" onClick={() => onDeclarar(p)} style={{ ...btnStyle('secundario', 'sm'), whiteSpace: 'normal', textAlign: 'left' }}>
              👪 Declarar vínculo
            </button>
            {/* La otra respuesta posible, y la más frecuente. Sin ella, esta lista
                pediría el vínculo de un conductor ocasional hasta el fin de los días. */}
            <button
              type="button"
              disabled={ocupado === `nada-${p.fichaId}`}
              onClick={() => onSinVinculo(p)}
              style={{ ...btnStyle('sutil', 'sm'), whiteSpace: 'normal', textAlign: 'left' }}
            >
              {ocupado === `nada-${p.fichaId}` ? 'Guardando…' : 'No hay vínculo'}
            </button>
            {p.ojoDuplicada && (
              <span style={{ fontSize: 11, color: 'var(--warning)', flexBasis: '100%' }}>
                ⚠️ Hay otra ficha con este mismo nombre en sus pólizas: mira arriba antes de declararlo,
                que el vínculo puede estar ya puesto en la otra.
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Avisos ──────────────────────────────────────────────────────────────────

function Aviso({ r }: { r: Exclude<RespuestaRelaciones, { estado: 'ok' }> }) {
  const texto =
    r.estado === 'conflicto' ? `Ya están relacionados: ${r.motivo}` :
    r.estado === 'invalido' ? `No se ha guardado: ${r.motivo}` :
    r.estado === 'no_encontrado' ? `No se encuentra la ficha${r.motivo ? `: ${r.motivo}` : ''}.` :
    r.estado === 'sin_configurar' ? 'El puerto con asegura no está conectado (falta ASEGURA_OPERADOR_SECRET).' :
    `No se ha podido hacer: ${textoMotivoRelaciones(r.motivo)}`
  const grave = r.estado === 'error' || r.estado === 'sin_configurar'
  return (
    <div role="alert" style={{ ...pendienteBox, color: grave ? 'var(--negative)' : 'var(--text)', borderColor: grave ? 'var(--negative)' : 'var(--border)' }}>
      {texto}
    </div>
  )
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Campo({ label, ayuda, children }: { label: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
      {children}
      {ayuda && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{ayuda}</span>}
    </label>
  )
}

// 16 px y no 14: por debajo de 16, Safari en iPhone hace ZOOM al enfocar el
// campo y descoloca la pantalla entera. Los 44 px son el mínimo táctil.
const campo: React.CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 16,
}
/** Un campo que el módulo ha rechazado. `Campo` no lo sabe: se compone al vuelo. */
const malo: React.CSSProperties = { borderColor: 'var(--negative)' }

const pendienteBox: React.CSSProperties = {
  fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 8, padding: '8px 10px',
}
