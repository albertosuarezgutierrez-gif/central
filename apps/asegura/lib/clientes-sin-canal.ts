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
// ─── 🚨 La ficha del tomador NO es el único sitio donde vive el contacto ────
// Corregido el 04/09/2026, y el fallo lo cazó Alberto mirando la pantalla:
// `Esquiansa` salía como «ilocalizable» cuando su contacto de siempre es Juan
// Manuel López Benjumea. Esta consulta miraba SOLO las columnas de la ficha del
// tomador, y con eso afirmaba «a estos no les llega NADA». Falso para 4 de 19.
//
// El contacto de un cliente puede estar en CUATRO sitios, y hay que mirar los
// cuatro antes de decir que no se le puede localizar:
//
//   1. Su ficha (`clientes.email/telefono`, `cliente_emails`, `cliente_telefonos`).
//   2. 🚨 **Su propio dato colgado de la PÓLIZA** (`poliza_intervinientes` cuyo
//      `cliente_id` es él mismo). Medido: le pasa a `Juan Manuel Duran Ibañez` y
//      a `MORALES ISABEL MALDONADO` — CIMA trajo su email en el interviniente y
//      nadie lo copió a la ficha. Este es el caso CARO: el dato está en la base
//      y el cron de avisos (`avisos-vencimiento.ts`) no lo ve, porque lee la
//      ficha. Se arregla copiándolo, no llamando a nadie.
//   3. **Otra persona de su póliza** (conductor habitual, propietario, una ficha
//      enlazada distinta).
//   4. 🚨 **Un familiar o representante declarado en `cliente_relaciones`** —
//      añadido el 05/09/2026, y lo cazó Alberto otra vez mirando la pantalla:
//      «grupo elca ya tiene a pablo y aun aparece», «Studium es una empresa y
//      tiene a victor y berta». Los tres estaban declarados (Pablo Franco Ruz
//      como «Administración» de GRUPO ELCA 83; Víctor y Berta en el Instituto
//      Studium) y esta consulta no miraba ahí. **Medido ese día contra la BD:
//      18 clientes de la cartera viva no tienen nada en su ficha, 14 seguían
//      sin contacto mirando los tres sitios de antes, y con el cuarto quedan
//      SEIS.** (En pantalla ponía 16: esa cifra es de antes de las fusiones del
//      lote 10 y no se ha vuelto a medir — la buena es la de arriba.)
//
// 🚨 **Y el 4 no es un contacto de segunda.** Se estuvo a punto de rotularlo
// «solo sirve para pedirle el correo». Alberto: «piensa q un cliente puede ser
// muy mayor y no tiene contacto… es mejor contactar con el familiar». Para un
// cliente mayor o para una empresa, el hijo o la administración ES el canal.
// Por eso el 3 y el 4 comparten estado (`contacto_via_tercero`) y la pantalla
// pinta el PARENTESCO: llamar al hijo y llamar a un desconocido no son lo mismo.
//
// ⚖️ **Tener a quién llamar sigue sin ser poder notificar.** El preaviso del
// art. 22 LCS va al TOMADOR: que su hijo tenga móvil no da por avisada a la
// persona. Por eso el caso 2 (su dato, mal guardado) y los casos 3-4 (el dato
// de otro) son estados distintos y no se funden en un «localizable» que
// tranquilizaría de más.
//
// ⚠️ La DIRECCIÓN de la relación no se usa: el convenio del repo es «fila A→B =
// B es <tipo> de A», pero el volcado no lo respeta (en Studium hay una fila que
// se leería «Berta es Empresa de Studium»). Se busca en los dos sentidos y se
// enseña el parentesco tal cual lo escribió el CRM, sin afirmar quién
// representa a quién.
//
// ─── 🚨 Y una póliza CANCELADA no renueva (04/09/2026) ─────────────────────
// La regla de cartera viva dice «CIMA la trae o la mantiene», NO «está en
// vigor»: de las 110 vivas, **42 están canceladas**. Medido ese día: de los 18
// clientes sin contacto, **8 solo tienen pólizas que ya no renuevan** —no hay
// aviso de vencimiento que mandarles— y a tres se les pintaba «Renueva el …»
// con la fecha de una póliza cancelada. `FERNANDO GOMEZ ARIZA` salía con
// 10/01/2027 (la cancelada) cuando su renovación real es el 28/05/2027.
// Qué estado sigue en juego lo decide `POLIZA_ESTADOS_VIGENTES` de
// `@central/module-seguros` —la lista que ya reproduce la del CRM de origen—,
// no un `<> 'cancelada'`: el enum tiene DIEZ valores.
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
// `clientes.email`/`telefono`, `cliente_emails`/`cliente_telefonos` y también
// `poliza_intervinientes.email`/`telefono`/`nombre` guardan el dato CIFRADO
// (`v1:iv:cipher:tag`). La pregunta de esta pantalla es «¿hay ALGO en esa
// columna?», no «¿qué pone?», así que no se abre ni se manda por el puerto
// ningún correo ni teléfono: solo nombres de FICHA (que sí están en claro,
// imprescindibles para saber a quién llamar) y booleanos. Para ver el contacto
// está su ficha.
//
// 🚨 El nombre de un interviniente SUELTO (sin ficha enlazada) viene cifrado y
// NO se manda: de esos solo viaja el recuento. Descifrarlo aquí sería sacar PII
// por el puerto para una pantalla que no la necesita.
//
// Consecuencia honesta de esa decisión: esto mide PRESENCIA, no validez. Una
// columna con un blob que no se pueda descifrar cuenta como «tiene canal»
// aunque el envío luego falle. La pantalla lo dice; no se disfraza de garantía.

import { POLIZA_ESTADOS_VIGENTES } from '@central/module-seguros'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'

/** Tope de filas leídas. La cartera viva son decenas, no miles: si algún día se
 *  pasa de aquí, se declara `truncado` y los recuentos pasan a «no comprobado»
 *  en vez de devolver un número más pequeño que la realidad. */
const LIMITE = 2000

/** Tope de fichas nombradas por cliente. Sirve para decir «llama a X», no para
 *  volcar la póliza entera; el recuento de al lado dice cuántas hay en total. */
const MAX_FICHAS = 5

export type EstadoCanal =
  /** Ni en su ficha, ni en su póliza, ni nadie más en ella. Ilocalizable de verdad. */
  | 'sin_ninguno'
  /**
   * No hay nada suyo, pero SÍ de alguien de su entorno: otra persona de su
   * póliza, o un familiar / representante declarado en `cliente_relaciones`.
   *
   * 🚨 **Esto NO es un contacto de segunda.** Se estuvo a punto de rotularlo
   * como «solo sirve para pedirle el correo», y Alberto lo corrigió el
   * 05/09/2026: «un cliente puede ser muy mayor y no tiene contacto… es mejor
   * contactar con el familiar». Para media cartera el hijo o la administración
   * de la empresa ES el canal, no un rodeo.
   *
   * ⚖️ Lo que sí sigue siendo cierto y no es opinión: el preaviso del art. 22
   * LCS va al TOMADOR. Tener a quién llamar no da por notificada a la empresa.
   */
  | 'contacto_via_tercero'
  /** 🚨 Su PROPIO email/teléfono existe, pero colgado de la póliza y no de su
   *  ficha: el cron de avisos lee la ficha, así que hoy no le sale nada. Se
   *  arregla copiando el dato, no llamando a nadie. */
  | 'canal_en_poliza'
  | 'solo_telefono'
  | 'solo_email'
  | 'con_ambos'

/** Una ficha de persona localizable que aparece en las pólizas del cliente.
 *  El nombre viene de `clientes`, que está EN CLARO; nunca de un interviniente. */
export type FichaContacto = { clienteId: string; nombre: string }

/**
 * Una persona LOCALIZABLE declarada en `cliente_relaciones` — el hijo, la
 * administración de la empresa, el contacto designado.
 *
 * 🚨 **El parentesco viaja, y no es adorno.** Dictado por Alberto (05/09/2026):
 * «piensa q un cliente puede ser muy mayor y no tiene contacto… es mejor
 * contactar con el familiar». Sin el parentesco la pantalla diría «llama a
 * Pablo Franco Ruz» sin decir que Pablo ES la administración de esa empresa, y
 * quien llama no sabe si está molestando a un desconocido.
 */
export type FichaAllegado = { clienteId: string; nombre: string; parentesco: string }

export type ClienteCanal = {
  clienteId: string
  nombre: string
  /** ¿Hay algo en `clientes.email` o en `cliente_emails`? NO dice si es válido. */
  tieneEmail: boolean
  /** ¿Hay algo en `clientes.telefono` o en `cliente_telefonos`? */
  tieneTelefono: boolean
  /** 🚨 Intervinientes de sus pólizas vivas que son ÉL MISMO y traen contacto:
   *  el dato es suyo y está en la base, solo que no en su ficha. */
  canalEnPoliza: number
  /** Personas DISTINTAS de él, localizables, en sus pólizas vivas. */
  contactoDeOtros: number
  /** 🚨 Personas localizables declaradas en `cliente_relaciones` — el CUARTO
   *  sitio donde vive un contacto, y el que faltaba hasta el 05/09/2026. */
  contactoDeAllegados: number
  /** Las de arriba que tienen ficha propia (con nombre en claro y enlace).
   *  Puede venir más corta que `contactoDeOtros`: los intervinientes sueltos no
   *  tienen ficha y su nombre va cifrado, así que solo cuentan. */
  fichasContacto: FichaContacto[]
  /** Las de `contactoDeAllegados`, con su parentesco. */
  fichasAllegado: FichaAllegado[]
  estado: EstadoCanal
  /** Pólizas por CIMA de este cliente (siempre ≥ 1: por eso está en la lista). */
  polizasCima: number
  /** De esas, las que siguen en un estado que puede renovar. **`0` = ninguna
   *  renueva**: no hay aviso de vencimiento que mandarle, así que su falta de
   *  contacto es cierta pero NO urgente. */
  polizasQueRenuevan: number
  /** La renovación más cercana de HOY en adelante, **contando SOLO pólizas en
   *  estado que renueva**. `null` = no la hay (lo dicen los contadores de al
   *  lado), NUNCA «no vence». */
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
    /** Sin contacto EN SU FICHA. Ojo: no es lo mismo que ilocalizable. */
    sinNinguno: number | null
    /** 🚨 El número que encabeza la pantalla: ni en la ficha, ni en la póliza,
     *  ni nadie más. Con estos NO hay forma de hablar. */
    ilocalizables: number | null
    /** Sin nada en la ficha pero con por dónde tirar (`canal_en_poliza` o
     *  `contacto_via_tercero`). = `sinNinguno − ilocalizables`. */
    rescatables: number | null
    /** De los ilocalizables, los que **ninguna de sus pólizas renueva**. Siguen
     *  siendo ilocalizables, pero no hay nada que avisarles: separarlos es la
     *  diferencia entre una lista de llamadas y una lista de nombres. */
    ilocalizablesSinRenovacion: number | null
  }
  truncado: boolean
}

type FilaSql = {
  cliente_id: string
  nombre: string
  tiene_email: boolean
  tiene_telefono: boolean
  canal_en_poliza: number
  contacto_de_otros: number
  fichas_contacto: unknown
  contacto_de_allegados: number
  fichas_allegado: unknown
  polizas_cima: number
  polizas_que_renuevan: number
  proximo_vencimiento: string | null
  polizas_sin_fecha: number
  prima: number | null
  polizas_sin_prima: number
}

/** Puro: el estado se deriva de dónde hay contacto, no se guarda en ninguna
 *  parte. El orden de las preguntas importa —lo de la ficha manda sobre lo de la
 *  póliza, y lo suyo sobre lo de un tercero— porque cada respuesta pide una
 *  acción distinta. */
export function estadoCanal(
  tieneEmail: boolean,
  tieneTelefono: boolean,
  canalEnPoliza = 0,
  contactoDeOtros = 0,
  contactoDeAllegados = 0,
): EstadoCanal {
  if (tieneEmail && tieneTelefono) return 'con_ambos'
  if (tieneEmail) return 'solo_email'
  if (tieneTelefono) return 'solo_telefono'
  // Sin nada en la ficha. Antes de declararlo ilocalizable, los otros dos sitios.
  if (canalEnPoliza > 0) return 'canal_en_poliza'
  if (contactoDeOtros > 0 || contactoDeAllegados > 0) return 'contacto_via_tercero'
  return 'sin_ninguno'
}

/** Los ilocalizables primero; dentro de cada grupo, el que renueva antes.
 *  `contacto_via_tercero` va por delante de `canal_en_poliza` porque el segundo
 *  se arregla copiando un dato y el primero exige llamar a alguien. */
const ORDEN: Record<EstadoCanal, number> = {
  sin_ninguno: 0,
  contacto_via_tercero: 1,
  canal_en_poliza: 2,
  solo_telefono: 3,
  solo_email: 4,
  con_ambos: 5,
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

/** Un nombre que empieza por `v1:` es un blob cifrado, no un nombre. Pintarlo
 *  sería enseñar basura; mandarlo, sacar PII sin poder leerla. Se descarta y la
 *  persona cuenta solo en el recuento. */
export function nombreEnClaro(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const n = v.trim()
  if (n === '' || n.startsWith('v1:')) return null
  return n
}

/** Las fichas llegan como `jsonb`. Una fila rota se descarta (sigue contada en
 *  `contactoDeOtros`), nunca se inventa un nombre. */
function leerFichas(v: unknown): FichaContacto[] {
  if (!Array.isArray(v)) return []
  const out: FichaContacto[] = []
  for (const f of v) {
    if (typeof f !== 'object' || f === null) continue
    const o = f as Record<string, unknown>
    const id = typeof o.clienteId === 'string' && o.clienteId !== '' ? o.clienteId : null
    const nombre = nombreEnClaro(o.nombre)
    if (id === null || nombre === null) continue
    out.push({ clienteId: id, nombre })
    if (out.length >= MAX_FICHAS) break
  }
  return out
}

/** Igual que `leerFichas`, pero conservando el parentesco. Una fila sin
 *  parentesco legible se descarta: «llama a alguien» sin decir quién es no
 *  ayuda a nadie, y sigue contada en `contactoDeAllegados`. */
function leerAllegados(v: unknown): FichaAllegado[] {
  if (!Array.isArray(v)) return []
  const out: FichaAllegado[] = []
  for (const f of v) {
    if (typeof f !== 'object' || f === null) continue
    const o = f as Record<string, unknown>
    const id = typeof o.clienteId === 'string' && o.clienteId !== '' ? o.clienteId : null
    const nombre = nombreEnClaro(o.nombre)
    const parentesco = typeof o.parentesco === 'string' ? o.parentesco.trim() : ''
    if (id === null || nombre === null || parentesco === '') continue
    out.push({ clienteId: id, nombre, parentesco })
    if (out.length >= MAX_FICHAS) break
  }
  return out
}

export async function clientesSinCanal(correduriaId: string): Promise<ClientesSinCanal> {
  const vacio: ClientesSinCanal = {
    filas: [],
    resumen: {
      vivos: null, conEmail: null, conTelefono: null, conAlguno: null,
      sinNinguno: null, ilocalizables: null, rescatables: null,
      ilocalizablesSinRenovacion: null,
    },
    truncado: false,
  }
  if (!aseguraConfigurada()) return vacio
  const db = prismaAsegura()
  // Copia mutable para la interpolación de Prisma: `POLIZA_ESTADOS_VIGENTES` es
  // `readonly` (`as const`) y el driver espera un array normal.
  const VIGENTES: string[] = [...POLIZA_ESTADOS_VIGENTES]

  // 🚨 El filtro de cartera viva es la línea que separa los ~80 clientes de hoy
  // de las ~32.500 fichas del volcado histórico. No se toca.
  // `nullif(btrim(...), '')` porque una cadena vacía es tan «sin canal» como un
  // NULL, y colarla como dato diría que sí se le puede escribir.
  //
  // La búsqueda de contacto en las pólizas va en un `lateral` APARTE y DESPUÉS
  // de filtrar (`base` ya se queda en las decenas de clientes vivos): metida en
  // el primer lateral se ejecutaría para las 32.600 fichas de la tabla.
  const filas = await db.$queryRaw<FilaSql[]>`
    with base as (
      select
        c.id,
        c.correduria_id,
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
        v.polizas_que_renuevan,
        v.proximo_vencimiento,
        v.polizas_sin_fecha,
        v.prima,
        v.polizas_sin_prima
      from clientes c
      join lateral (
        select
          count(*)::int as polizas_cima,
          -- La lista de estados que renuevan viaja como parámetro desde
          -- POLIZA_ESTADOS_VIGENTES: una sola fuente para el CRM, la ficha y
          -- esta pantalla. Un estado NULL no cuenta como vigente, que es la
          -- semántica que ya fija esEstadoVigente.
          -- (Sin acentos graves aquí dentro: cierran el template literal.)
          count(*) filter (where p.estado::text = any(${VIGENTES}))::int
            as polizas_que_renuevan,
          min(p.fecha_vencimiento) filter (
            where p.fecha_vencimiento >= current_date
              and p.estado::text = any(${VIGENTES})
          ) as proximo_vencimiento,
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
        -- 🚨 Los dados de baja no son «clientes a los que no se puede avisar»:
        --    es que no hay que avisarles. Este filtro EXISTÍA y se perdió al
        --    reescribir el fichero el 04/09/2026; sin él la lista crece con
        --    gente de la que nadie espera nada.
        and c.activo
        and v.polizas_cima > 0
    )
    select
      b.id::text as cliente_id,
      b.nombre,
      b.tiene_email,
      b.tiene_telefono,
      coalesce(w.canal_en_poliza, 0) as canal_en_poliza,
      coalesce(w.contacto_de_otros, 0) as contacto_de_otros,
      coalesce(w.fichas_contacto, '[]'::jsonb) as fichas_contacto,
      coalesce(rl.contacto_de_allegados, 0) as contacto_de_allegados,
      coalesce(rl.fichas_allegado, '[]'::jsonb) as fichas_allegado,
      b.polizas_cima,
      b.polizas_que_renuevan,
      to_char(b.proximo_vencimiento, 'YYYY-MM-DD') as proximo_vencimiento,
      b.polizas_sin_fecha,
      b.prima,
      b.polizas_sin_prima
    from base b
    left join lateral (
      select
        count(*) filter (where x.es_el_mismo)::int as canal_en_poliza,
        count(*) filter (where not x.es_el_mismo)::int as contacto_de_otros,
        coalesce(
          jsonb_agg(jsonb_build_object('clienteId', x.ficha_id, 'nombre', x.ficha_nombre))
            filter (where not x.es_el_mismo and x.ficha_id is not null),
          '[]'::jsonb
        ) as fichas_contacto
      from (
        -- Una PERSONA, no una fila: el mismo conductor en tres pólizas no son
        -- tres contactos. Sin ficha enlazada el interviniente es su propia
        -- identidad (no hay NIF en claro con el que agrupar mejor).
        select distinct on (coalesce(i.cliente_id::text, 'i:' || i.id::text))
          (i.cliente_id = b.id) as es_el_mismo,
          ic.id::text as ficha_id,
          btrim(concat_ws(' ', ic.nombre, ic.apellidos)) as ficha_nombre
        from polizas p
        join poliza_intervinientes i on i.poliza_id = p.id
        left join clientes ic on ic.id = i.cliente_id and ic.merged_into_cliente_id is null
        where p.cliente_id = b.id
          and p.correduria_id = b.correduria_id
          and (p.import_ref is null or p.eiac_xml_hash is not null)
          and p.merged_into_poliza_id is null
          and (
            nullif(btrim(i.email), '') is not null
            or nullif(btrim(i.telefono), '') is not null
            or nullif(btrim(ic.email), '') is not null
            or nullif(btrim(ic.telefono), '') is not null
            or exists (
              select 1 from cliente_emails e
              where e.cliente_id = ic.id and nullif(btrim(e.email), '') is not null
            )
            or exists (
              select 1 from cliente_telefonos t
              where t.cliente_id = ic.id and nullif(btrim(t.telefono), '') is not null
            )
          )
        order by coalesce(i.cliente_id::text, 'i:' || i.id::text)
      ) x
    ) w on true
    -- 🚨 EL CUARTO SITIO. Hasta el 05/09/2026 esta consulta miraba la ficha, sus
    -- tablas hijas y los intervinientes de la póliza, y con eso declaraba a 16
    -- clientes «ilocalizables». Alberto miró la pantalla: «grupo elca ya tiene a
    -- pablo y aun aparece», «Studium es una empresa y tiene a victor y berta».
    -- Los tres estaban en cliente_relaciones — Pablo como «Administración» de
    -- ELCA, Víctor como «Empleado/a» y Berta como «Accionista» de Studium.
    -- Medido ese día: 18 sin nada en su ficha, 14 ilocalizables con los tres
    -- sitios de antes, SEIS con este cuarto.
    --
    -- ⚠️ La dirección de la relación NO se usa para nada aquí. El convenio del
    -- repo es «fila A→B = B es <tipo> de A», pero el volcado no lo respeta (en
    -- Studium hay una fila que se leería «Berta es Empresa de Studium»), así que
    -- afirmar quién representa a quién sería inventarse un dato. Se busca en las
    -- DOS direcciones y se enseña el parentesco tal cual lo escribió el CRM.
    left join lateral (
      select
        count(*)::int as contacto_de_allegados,
        coalesce(
          jsonb_agg(jsonb_build_object(
            'clienteId', y.ficha_id, 'nombre', y.ficha_nombre, 'parentesco', y.parentesco)),
          '[]'::jsonb
        ) as fichas_allegado
      from (
        -- Una PERSONA, no una fila: cada vínculo está dos veces (un sentido por
        -- fila) y una misma persona puede ser a la vez «Propietario» y «Empresa».
        select distinct on (o.id)
          o.id::text as ficha_id,
          btrim(concat_ws(' ', o.nombre, o.apellidos)) as ficha_nombre,
          r.tipo_relacion as parentesco
        from cliente_relaciones r
        join clientes o
          on o.id = case when r.cliente_a_id = b.id then r.cliente_b_id else r.cliente_a_id end
         and o.merged_into_cliente_id is null
         and o.correduria_id = b.correduria_id
        where (r.cliente_a_id = b.id or r.cliente_b_id = b.id)
          and o.id <> b.id
          and (
            nullif(btrim(o.email), '') is not null
            or nullif(btrim(o.telefono), '') is not null
            or exists (
              select 1 from cliente_emails e
              where e.cliente_id = o.id and nullif(btrim(e.email), '') is not null
            )
            or exists (
              select 1 from cliente_telefonos t
              where t.cliente_id = o.id and nullif(btrim(t.telefono), '') is not null
            )
          )
        order by o.id, r.tipo_relacion
      ) y
    ) rl on true
    order by b.nombre
    limit ${LIMITE + 1}
  `

  const truncado = filas.length > LIMITE
  const leidas = truncado ? filas.slice(0, LIMITE) : filas

  const todos: ClienteCanal[] = leidas.map((f) => {
    const tieneEmail = f.tiene_email === true
    const tieneTelefono = f.tiene_telefono === true
    const canalEnPoliza = Number.isFinite(f.canal_en_poliza) ? f.canal_en_poliza : 0
    const contactoDeOtros = Number.isFinite(f.contacto_de_otros) ? f.contacto_de_otros : 0
    const contactoDeAllegados = Number.isFinite(f.contacto_de_allegados) ? f.contacto_de_allegados : 0
    return {
      clienteId: f.cliente_id,
      nombre: f.nombre,
      tieneEmail,
      tieneTelefono,
      canalEnPoliza,
      contactoDeOtros,
      contactoDeAllegados,
      fichasContacto: leerFichas(f.fichas_contacto),
      fichasAllegado: leerAllegados(f.fichas_allegado),
      estado: estadoCanal(tieneEmail, tieneTelefono, canalEnPoliza, contactoDeOtros, contactoDeAllegados),
      polizasCima: f.polizas_cima,
      polizasQueRenuevan: Number.isFinite(f.polizas_que_renuevan) ? f.polizas_que_renuevan : 0,
      proximoVencimiento: f.proximo_vencimiento ?? null,
      polizasSinFecha: f.polizas_sin_fecha,
      // Sin ninguna prima informada la suma de Postgres es NULL. Se queda en
      // `null` («no se sabe cuánto hay en juego»), jamás en 0.
      prima: typeof f.prima === 'number' && Number.isFinite(f.prima) ? f.prima : null,
      polizasSinPrima: f.polizas_sin_prima,
    }
  })

  // Si la lista se truncó, cualquier recuento saldría MÁS BAJO que la realidad y
  // se leería como «hay menos ilocalizables de los que hay». Se declara «no
  // comprobado» (null) en vez de dar un número tranquilizador y falso.
  const sinFicha = todos.filter((c) => !c.tieneEmail && !c.tieneTelefono)
  const resumen = truncado
    ? {
        vivos: null, conEmail: null, conTelefono: null, conAlguno: null,
        sinNinguno: null, ilocalizables: null, rescatables: null,
        ilocalizablesSinRenovacion: null,
      }
    : {
        vivos: todos.length,
        conEmail: todos.filter((c) => c.tieneEmail).length,
        conTelefono: todos.filter((c) => c.tieneTelefono).length,
        conAlguno: todos.filter((c) => c.tieneEmail || c.tieneTelefono).length,
        sinNinguno: sinFicha.length,
        ilocalizables: todos.filter((c) => c.estado === 'sin_ninguno').length,
        rescatables: sinFicha.filter((c) => c.estado !== 'sin_ninguno').length,
        ilocalizablesSinRenovacion: todos.filter(
          (c) => c.estado === 'sin_ninguno' && c.polizasQueRenuevan === 0,
        ).length,
      }

  return {
    filas: ordenarPorUrgencia(todos.filter((c) => c.estado !== 'con_ambos')),
    resumen,
    truncado,
  }
}
