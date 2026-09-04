// Clientes de la cartera VIVA con los que NO hay forma de hablar.
//
// ─── Por qué esta lista existe ──────────────────────────────────────────────
// Medido el 02/09/2026 contra la base: de los ~79 clientes que entran por CIMA,
// 26 no tienen NI email NI teléfono. A esos no les llega el aviso de
// vencimiento, no pueden entrar al portal del cliente (que identifica por
// email) y —lo caro— desde el código se ven EXACTAMENTE IGUAL que un cliente al
// que sí se avisó: el envío no falla, es que no hay a dónde enviarlo. Es el
// «un aviso que sale por un canal que esa persona no abre es un aviso que no
// existe» de CLAUDE.md, en su forma más literal.
//
// La pantalla no manda nada: sirve para que, cuando Alberto hable con uno de
// ellos por teléfono o en el despacho, le pida el correo y deje de estar aquí.
//
// ─── Qué se cuenta como cliente (y qué NO) ──────────────────────────────────
// 🚨 Cartera VIVA = las pólizas que CIMA trae o MANTIENE (regla única en
// `cartera-viva.ts` de `@central/module-seguros`: `import_ref IS NULL` **o**
// `eiac_xml_hash IS NOT NULL`, porque una fila del volcado que CIMA actualiza
// conserva su `import_ref` viejo y también es cartera de hoy).
// Las otras ~28.700 pólizas son el volcado histórico de junio/2026 (`import_ref`
// `intranet:` / `asegura_app:`, vencimientos 2013-2018) y sus ~32.520 fichas son
// LEADS, no clientes actuales. Si se mezclaran, esta pantalla diría «32.520
// clientes ilocalizables» y sería falso — y además inútil, porque nadie revisa
// una lista de treinta mil filas.
//
// ─── PII: aquí NO se descifra nada ──────────────────────────────────────────
// `clientes.email`/`telefono` y las tablas `cliente_emails`/`cliente_telefonos`
// guardan el dato CIFRADO (`v1:iv:cipher:tag`). La pregunta de esta pantalla es
// «¿hay ALGO en esa columna?», no «¿qué pone?», así que no se abre ni se manda
// por el puerto ningún correo ni teléfono: solo el nombre (imprescindible para
// saber a quién llamar) y booleanos. Para ver el contacto está su ficha.
//
// Consecuencia honesta de esa decisión: esto mide PRESENCIA, no validez. Una
// columna con un blob que no se pueda descifrar cuenta como «tiene canal»
// aunque el envío luego falle. La pantalla lo dice; no se disfraza de garantía.

import { aseguraConfigurada, prismaAsegura } from './asegura-db'

/** Tope de filas leídas. La cartera viva son decenas, no miles: si algún día se
 *  pasa de aquí, se declara `truncado` y los recuentos pasan a «no comprobado»
 *  en vez de devolver un número más pequeño que la realidad. */
const LIMITE = 2000

export type EstadoCanal = 'sin_ninguno' | 'solo_telefono' | 'solo_email' | 'con_ambos'

export type ClienteCanal = {
  clienteId: string
  nombre: string
  /** ¿Hay algo en `clientes.email` o en `cliente_emails`? NO dice si es válido. */
  tieneEmail: boolean
  /** ¿Hay algo en `clientes.telefono` o en `cliente_telefonos`? */
  tieneTelefono: boolean
  estado: EstadoCanal
  /** Pólizas por CIMA de este cliente (siempre ≥ 1: por eso está en la lista). */
  polizasCima: number
  /** La renovación más cercana de HOY en adelante. `null` = no la hay (ver los
   *  dos contadores de abajo), NUNCA «no vence». */
  proximoVencimiento: string | null
  /** Pólizas vivas sin fecha de vencimiento: no se sabe cuándo renuevan. */
  polizasSinFecha: number
  /** Suma de las primas informadas. `null` = NINGUNA la informa, no 0,00€. */
  prima: number | null
  polizasSinPrima: number
}

export type ClientesSinCanal = {
  /** Solo los que les falta algún canal, los peores primero. Los que tienen
   *  email y teléfono no salen: no hay nada que pedirles. */
  filas: ClienteCanal[]
  resumen: {
    /** `null` = la lista se truncó y el recuento ya no sería el real. */
    vivos: number | null
    conEmail: number | null
    conTelefono: number | null
    conAlguno: number | null
    sinNinguno: number | null
  }
  truncado: boolean
}

type FilaSql = {
  cliente_id: string
  nombre: string
  tiene_email: boolean
  tiene_telefono: boolean
  polizas_cima: number
  proximo_vencimiento: string | null
  polizas_sin_fecha: number
  prima: number | null
  polizas_sin_prima: number
}

/** Puro: el estado se deriva de los dos canales, no se guarda en ninguna parte. */
export function estadoCanal(tieneEmail: boolean, tieneTelefono: boolean): EstadoCanal {
  if (tieneEmail && tieneTelefono) return 'con_ambos'
  if (tieneEmail) return 'solo_email'
  if (tieneTelefono) return 'solo_telefono'
  return 'sin_ninguno'
}

/** Los ilocalizables primero; dentro de cada grupo, el que renueva antes. */
const ORDEN: Record<EstadoCanal, number> = {
  sin_ninguno: 0,
  solo_telefono: 1,
  solo_email: 2,
  con_ambos: 3,
}

export function ordenarPorUrgencia(filas: ClienteCanal[]): ClienteCanal[] {
  return [...filas].sort((a, b) => {
    if (ORDEN[a.estado] !== ORDEN[b.estado]) return ORDEN[a.estado] - ORDEN[b.estado]
    // Sin fecha va al final del grupo: no se sabe cuándo corre prisa, y poner
    // «hoy» a lo desconocido lo colaría por delante de lo que sí vence.
    if (a.proximoVencimiento === b.proximoVencimiento) return a.nombre.localeCompare(b.nombre, 'es')
    if (a.proximoVencimiento === null) return 1
    if (b.proximoVencimiento === null) return -1
    return a.proximoVencimiento.localeCompare(b.proximoVencimiento)
  })
}

export async function clientesSinCanal(correduriaId: string): Promise<ClientesSinCanal> {
  const vacio: ClientesSinCanal = {
    filas: [],
    resumen: { vivos: null, conEmail: null, conTelefono: null, conAlguno: null, sinNinguno: null },
    truncado: false,
  }
  if (!aseguraConfigurada()) return vacio
  const db = prismaAsegura()

  // 🚨 El filtro de cartera viva es la línea que separa los ~80 clientes de hoy
  // de las ~32.500 fichas del volcado histórico. No se toca.
  // `nullif(btrim(...), '')` porque una cadena vacía es tan «sin canal» como un
  // NULL, y colarla como dato diría que sí se le puede escribir.
  const filas = await db.$queryRaw<FilaSql[]>`
    select
      c.id::text as cliente_id,
      btrim(concat_ws(' ', c.nombre, c.apellidos)) as nombre,
      (
        nullif(btrim(c.email), '') is not null
        or exists (
          select 1 from cliente_emails e
          where e.cliente_id = c.id and nullif(btrim(e.email), '') is not null
        )
      ) as tiene_email,
      (
        nullif(btrim(c.telefono), '') is not null
        or exists (
          select 1 from cliente_telefonos t
          where t.cliente_id = c.id and nullif(btrim(t.telefono), '') is not null
        )
      ) as tiene_telefono,
      v.polizas_cima,
      to_char(v.proximo_vencimiento, 'YYYY-MM-DD') as proximo_vencimiento,
      v.polizas_sin_fecha,
      v.prima,
      v.polizas_sin_prima
    from clientes c
    join lateral (
      select
        count(*)::int as polizas_cima,
        min(p.fecha_vencimiento) filter (where p.fecha_vencimiento >= current_date) as proximo_vencimiento,
        count(*) filter (where p.fecha_vencimiento is null)::int as polizas_sin_fecha,
        sum(coalesce(p.prima_anual, p.prima_bruta))::float8 as prima,
        count(*) filter (where p.prima_anual is null and p.prima_bruta is null)::int as polizas_sin_prima
      from polizas p
      where p.cliente_id = c.id
        and p.correduria_id = c.correduria_id
        and (p.import_ref is null or p.eiac_xml_hash is not null)
        and p.merged_into_poliza_id is null
    ) v on true
    where c.correduria_id = ${correduriaId}::uuid
      and c.merged_into_cliente_id is null
      and c.activo
      and v.polizas_cima > 0
    order by c.apellidos, c.nombre
    limit ${LIMITE + 1}
  `

  const truncado = filas.length > LIMITE
  const leidas = truncado ? filas.slice(0, LIMITE) : filas

  const todos: ClienteCanal[] = leidas.map((f) => ({
    clienteId: f.cliente_id,
    nombre: f.nombre,
    tieneEmail: f.tiene_email === true,
    tieneTelefono: f.tiene_telefono === true,
    estado: estadoCanal(f.tiene_email === true, f.tiene_telefono === true),
    polizasCima: f.polizas_cima,
    proximoVencimiento: f.proximo_vencimiento ?? null,
    polizasSinFecha: f.polizas_sin_fecha,
    // Sin ninguna prima informada la suma de Postgres es NULL. Se queda en
    // `null` («no se sabe cuánto hay en juego»), jamás en 0.
    prima: typeof f.prima === 'number' && Number.isFinite(f.prima) ? f.prima : null,
    polizasSinPrima: f.polizas_sin_prima,
  }))

  // Si la lista se truncó, cualquier recuento saldría MÁS BAJO que la realidad y
  // se leería como «hay menos ilocalizables de los que hay». Se declara «no
  // comprobado» (null) en vez de dar un número tranquilizador y falso.
  const resumen = truncado
    ? { vivos: null, conEmail: null, conTelefono: null, conAlguno: null, sinNinguno: null }
    : {
        vivos: todos.length,
        conEmail: todos.filter((c) => c.tieneEmail).length,
        conTelefono: todos.filter((c) => c.tieneTelefono).length,
        conAlguno: todos.filter((c) => c.tieneEmail || c.tieneTelefono).length,
        sinNinguno: todos.filter((c) => !c.tieneEmail && !c.tieneTelefono).length,
      }

  return {
    filas: ordenarPorUrgencia(todos.filter((c) => c.estado !== 'con_ambos')),
    resumen,
    truncado,
  }
}
