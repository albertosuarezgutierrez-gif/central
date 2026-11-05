// El presupuesto, visto desde el PORTAL. Solo lectura (PR 2): ni se elige, ni
// se firma, ni se manda nada. Lo único que este fichero escribe son dos sellos
// que no son del cliente sino SOBRE el cliente: `visto_at` y la telemetría.
//
// Diseño: `docs/superpowers/specs/2026-09-21-asegura-presupuesto-al-cliente-design.md`
// (§3.1 la puerta, §4 la pantalla). Lo puro vive en `lib/presupuesto-vista.ts`.
//
// ─── La puerta, que es lo que hay que leer antes de tocar nada ───────────────
//
// 🚨 **EL TOKEN NO ABRE SESIÓN.** El token dice QUÉ presupuesto es; QUIÉN eres
// lo dice el código de un solo uso que llega a tu correo. Por tres razones que
// ya están medidas en `portal_invitacion` y valen igual aquí:
//
//   1. Un GET que consume estado se lo comen el antivirus del correo y el
//      prefetch antes de que la persona lo toque.
//   2. Un token en un correo es una llave REENVIABLE. Con el contenido detrás
//      del token, quien lee un buzón compartido ve el precio, la compañía y el
//      bien asegurado de un tercero — y en salud, vida o decesos eso roza un
//      dato de categoría especial.
//   3. «Aceptado por el que tenía el enlace» no es prueba de consentimiento
//      (art. 7.1 RGPD), y aquí encima se acabará firmando.
//
// ─── Quién lo puede ver, ya con sesión ───────────────────────────────────────
//
// DOS ramas, porque una persona puede tener dos correos suyos y entrar por el
// otro:
//   (a) el `portal_canal.valor_hash` de quien entra coincide con
//       `presupuesto.destino_hash` — o sea, entró por el mismísimo canal al que
//       Alberto lo mandó;
//   (b) su `portal_vinculo.cliente_id` es el `presupuesto.cliente_id`.
//
// 🚨 Y una landmine que hay que decir en voz alta: la rama (a) **no puede
// funcionar hasta que `apps/asegura` escriba `destino_hash` con ESTA misma
// función** (`hashCanal`, SHA-256 con `ASEGURA_PORTAL_CANAL_PEPPER`), que hoy
// es una pimienta que solo existe en el portal. Mientras la columna siga a NULL
// —que es como la deja el PR 1— la rama (a) no concede nada, y eso NO es «no
// coincide»: es «no consta a quién se avisó». Se trata como tal.
//
// ─── Aislamiento ─────────────────────────────────────────────────────────────
// No hay RLS que rescate un olvido: el rol es NOBYPASSRLS pero estas tablas no
// tienen políticas para él, así que una consulta sin filtro responde 200 con el
// presupuesto de cualquiera. Toda lectura parte de la identidad de la cookie
// (`lib/session`) y del vínculo (`portal_vinculo`). Ningún `clienteId` entra
// desde fuera de este fichero.

import { duenoDeEleccion, eleccionDeOtraPersona, formatoTokenVistaValido, hashTokenVista, nivelPuedeOperar } from '@central/module-seguros-portal'
import { WHERE_CARTERA_VIVA, claveProducto, primaConRecibos, vencimientoConRecibos, type GarantiasClasificadas } from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'

import { hashCanal } from './auth'
import { prisma } from './db'
import { getAccesoWhatsapp, getIdentidad } from './session'
import type { AccesoPuente } from './presupuesto-firma'
import { coberturasDeOpcion, type CoberturasOpcion } from './tabla-coberturas'
import { garantiasDeJson } from './todas-las-opciones'
import { origenVista, type OrigenVista } from './presupuesto-ofertas-vista'
import { abiertoAlCliente } from './presupuesto-publicado'
import { coberturasDeJson, leerFirmeza, leerSinEquivalente, esPapel, type Firmeza, type PapelPortada, type SinEquivalente } from './presupuesto-vista'
import { RENOVACION_NO_DISPONIBLE, renovacionTrasFallo } from './renovacion-vista'
import { autorizadoEligeRenovacion, tomadorParaAutorizado } from './renovacion-autorizado'

// ─── Lo que la pantalla necesita ─────────────────────────────────────────────

export type OpcionCliente = {
  id: string
  orden: number
  compania: string
  producto: string
  modalidad: string | null
  /** `null` = no se pudo clasificar el nivel de cobertura. No es «sin cobertura». */
  grupoCobertura: string | null
  primaEur: number | null
  entradaEur: number | null
  /** 🚨 `null` = el producto NO declara franquicia. Jamás «sin franquicia». */
  franquiciaEur: number | null
  firmeza: Firmeza
  /** Las que la compañía manda con el precio. Se enseñan SIEMPRE. */
  avisos: string[]
  /** Las garantías congeladas. Vacío = **no se congelaron**, no «no cubre nada». */
  coberturas: string[]
  /** Las coberturas de la compañía con sus TRES estados (sí / no / ver texto), para la tabla.
   *  `lista: null` = no constan (no se intentó o no se pudieron leer). */
  coberturasDetalle: CoberturasOpcion
  /** Coberturas llevadas al catálogo del ramo (`presupuesto_opcion.garantias`).
   *  🚨 `null` = no clasificada (o con forma rara): el filtro la trata como `no_consta`, nunca `no`. */
  garantias: GarantiasClasificadas | null
  papeles: PapelPortada[]
  /** La de menor importe NO comparte cobertura con la actual. Se pinta. */
  coberturaDistinta: boolean
  esPortada: boolean
  /** Ficha IPID vigente de esta compañía + producto. `null` = no hay ninguna subida. */
  ipidId: string | null
}

/** Lo que el cliente tiene HOY. `null` entero = venta nueva (`poliza_id IS NULL`). */
export type ActualCliente = {
  compania: string
  ramo: string
  /** El bien, descrito. NUNCA el número de póliza como identificador. */
  bien: string | null
  ubicacion: string | null
  /** Con los recibos (`vencimientoConRecibos`): si ya renovó y solo llegó el recibo, el fin de ese recibo. */
  fechaVencimiento: Date | null
  /**
   * 🚨 La prima de HOY con los recibos (`primaConRecibos`, 04/11/2026), nunca la de la póliza sola: hay compañías que
   * solo la mandan en el recibo de la renovación. `null` = no consta (nunca 0).
   */
  primaAnual: number | null
  /** La prima sale del recibo (la de la renovación ya emitida). */
  primaDeRecibo: boolean
  /** `null` = no se ha podido leer el desglose; `[]` = leído y vacío. */
  coberturas: string[] | null
}

/**
 * Modo RENOVACIÓN (2026-11-05b): «tu renovación actual» vs. alternativas de una póliza nuestra. `null` = presupuesto de
 * siempre, o la migración no está (fail-closed: se pinta como siempre y NO se ofrece elegir sin firma).
 */
export type RenovacionCliente = {
  /** Lo que ya eligió (sin firmar). `null` = no consta que haya elegido. */
  eleccion: { tipo: 'renovacion' } | { tipo: 'opcion'; opcionId: string } | null
  eleccionAt: Date | null
  /**
   * (05/11/2026) La eligió OTRA persona (vale la primera): quien mira ve «ya elegida por <nombre de pila>» y no la cambia.
   * `null` = nadie ha elegido, o fue quien mira.
   */
  elegidaPorOtro: { nombre: string | null } | null
}

export type PresupuestoCliente = {
  id: string
  ramo: string
  /** De dónde salen los precios. `null` = origen que no se reconoce: no se pinta ni se acepta nada. */
  origen: OrigenVista | null
  creadoAt: Date
  venceEl: Date
  caducado: boolean
  /** Retirado por el corredor. El motivo NO cruza: es una nota interna suya. */
  retirado: boolean
  enviadoAt: Date | null
  elegidoAt: Date | null
  aceptadoAt: Date | null
  emitidoAt: Date | null
  /** Por qué no hay equivalente, cuando no lo hay. DOS motivos, no uno. */
  motivoSinEquivalente: SinEquivalente | null
  opciones: OpcionCliente[]
  actual: ActualCliente | null
  /** `true` cuando quien mira es Alberto con la vista de corredor. */
  vistaDeCorredor: boolean
  /** Ver `RenovacionCliente`. `'no_disponible'` = no se ha podido leer: ni se elige ni se acepta/firma (fail-closed). */
  renovacion: RenovacionCliente | null | typeof RENOVACION_NO_DISPONIBLE
  /** Lo que el cliente pidió, según lo anotó el corredor. `null` = no consta por escrito. */
  necesidades: string | null
  /** Entró con el CÓDIGO DEL WHATSAPP (no con su correo): puede firmar con ese mismo código. */
  accesoWhatsapp: boolean
  /**
   * (21/10/2026) Entró con el código de un correo a una PERSONA DE CONTACTO del tomador: lo VE, no lo acepta ni firma ni
   * marca un dato (asegura le devuelve `sin_permiso`). `null` = no es ese caso. `tomador` = su nombre (`null` = no se
   * pudo leer); `juridica` = el tomador es empresa explícita (cambia cómo se le dice).
   */
  accesoTercero: { tomador: string | null; juridica: boolean } | null
  /**
   * (05/11/2026) Lo ve como AUTORIZADO del tomador con Gestión o Total (solo una RENOVACIÓN): puede elegir, no ve los datos
   * personales del tomador (ni la dirección del riesgo ni «Revisa tus datos»), ni acepta ni firma. `tomador` = su nombre de
   * pila (`null` = no se pudo leer). `null` = no es ese caso.
   */
  accesoAutorizado: { tomador: string | null } | null
}

export type LecturaPresupuesto =
  | { estado: 'ok'; presupuesto: PresupuestoCliente }
  /** No existe, o no es de nadie que podamos nombrar. Texto NEUTRO. */
  | { estado: 'no_encontrado' }
  /** Existe y NO es de quien mira. 403 neutro + `presupuesto_evento`. */
  | { estado: 'ajeno' }
  /** El correo de quien mira aparece en más de una ficha: lo revisa el corredor. */
  | { estado: 'vinculo_ambiguo' }
  | { estado: 'sin_sesion' }
  | { estado: 'error' }

// ─── La carátula pública: solo si el enlace VIVE ─────────────────────────────

export type Caratula =
  /** El enlace vale. `id` se usa para llevar a la pantalla de dentro TRAS entrar. */
  | { estado: 'viva'; id: string }
  /** No existe, caducó, se retiró o no tiene ni forma de token: **lo mismo**. */
  | { estado: 'muerta' }

/**
 * Resuelve el token del enlace, SIN sesión y SIN contar nada.
 *
 * 🚨 Devuelve `{estado, id}` y ni un dato más: hasta que hay sesión no hay a
 * quien enseñarle nada. Y los cuatro finales malos se colapsan en `muerta` a
 * propósito — distinguir «no existe» de «ya no vale» convierte esta URL en un
 * oráculo con el que averiguar tokens válidos a base de probar.
 *
 * Es la ÚNICA consulta de este fichero sin identidad, igual que
 * `invitacionPorToken`: el token no concede nada, solo dice si merece la pena
 * pintar el formulario de entrada.
 */
export async function caratulaPorToken(tokenCrudo: unknown): Promise<Caratula> {
  // La FORMA se valida antes de tocar la BD: un valor cualquiera metido en la
  // URL no tiene por qué llegar a una consulta.
  if (!formatoTokenVistaValido(tokenCrudo)) return { estado: 'muerta' }
  try {
    const fila = await prisma.presupuesto.findUnique({
      where: { tokenHash: await hashTokenVista(tokenCrudo) },
      select: { id: true, retiradoAt: true },
    })
    // 🚨 Un presupuesto CADUCADO sigue vivo para esta puerta: la pantalla de
    // dentro lo sigue enseñando con los precios marcados como caducados (es
    // información suya, tachar la página sería peor). Lo único que mata el
    // enlace es que el corredor lo retire.
    if (!fila || fila.retiradoAt !== null) return { estado: 'muerta' }
    return { estado: 'viva', id: fila.id }
  } catch (e) {
    registrar('caratulaPorToken', e)
    // Un fallo de BD NO se cuenta como enlace muerto hacia fuera: se colapsa
    // igual (no hay nada que enseñar) pero queda en el log para saber que la
    // causa fue nuestra y no del enlace.
    return { estado: 'muerta' }
  }
}

// ─── La segunda puerta: el código del WhatsApp (07/10/2026) ──────────────────
//
// Quien entra con el código que Alberto le mandó por WhatsApp no tiene identidad (puede no tener
// correo). Lleva una cookie APARTE (`lib/auth.ts`) que vale para UN presupuesto. Aquí se comprueba,
// en cada lectura, que:
//   · el id que pide es el de la cookie (la cookie no abre otro presupuesto);
//   · el token de la cookie SIGUE siendo el del presupuesto (si se regeneró el enlace o se avisó por
//     correo, el token rotó y no abre);
//   · no está retirado ni vencido (el código del WhatsApp vale hasta `vence_el`).
// El código ya se comprobó en asegura antes de poner la cookie; aquí no se vuelve a ver.

/**
 * El token del acceso por WhatsApp a ESE presupuesto, o `null`. Fallo de BD = `null` (no abre). `tercero` = el código
 * era el de una PERSONA DE CONTACTO (lo dijo asegura al comprobarlo): ve, no opera.
 */
export async function accesoWhatsappDe(id: string): Promise<{ token: string; tercero: boolean } | null> {
  if (!UUID.test(id)) return null
  const a = await getAccesoWhatsapp()
  if (!a || a.presupuestoId !== id || !formatoTokenVistaValido(a.token)) return null
  try {
    const fila = await prisma.presupuesto.findFirst({
      where: { id, tokenHash: await hashTokenVista(a.token), retiradoAt: null, venceEl: { gt: new Date() } },
      select: { id: true },
    })
    return fila ? { token: a.token, tercero: a.tercero } : null
  } catch (e) {
    registrar('accesoWhatsappDe', e)
    return null
  }
}

/**
 * Con qué se llama al puente para ESTE presupuesto: el token del WhatsApp si entró así (va
 * primero: es la puerta de este presupuesto en concreto), si no la identidad de la sesión.
 * `corredor` = es Alberto con la vista de corredor (no firma). `tercero` = entró con el código de una PERSONA DE
 * CONTACTO: las rutas que escriben cortan con `sin_permiso` antes de llamar al puente (que también lo niega).
 */
export async function accesoPuenteDe(id: string): Promise<{ acceso: AccesoPuente; corredor: boolean; tercero: boolean } | null> {
  const identidad = await getIdentidad()
  const corredor = identidad !== null && identidad.corredor !== null
  const w = await accesoWhatsappDe(id)
  if (w) return { acceso: { tokenWhatsapp: w.token }, corredor, tercero: w.tercero }
  return identidad ? { acceso: { identidadId: identidad.id }, corredor, tercero: false } : null
}

// ─── La pantalla de dentro ───────────────────────────────────────────────────

/** ¿Consta el evento `enlace_generado` (WhatsApp abierto por el corredor)? Un fallo de BD LANZA: lo recoge quien llama. */
async function constaEnlaceGenerado(id: string): Promise<boolean> {
  const e = await prisma.presupuestoEvento.findFirst({ where: { presupuestoId: id, tipo: 'enlace_generado' }, select: { id: true } })
  return e !== null
}

/**
 * Puerta de la comparativa con IA (`/api/presupuesto/ia`): el presupuesto está enviado o enlazado. NO
 * autoriza QUIÉN (eso lo decide el puente de asegura por `portal_vinculo`): solo que no sea un borrador.
 * Fallo de BD = `false` (cerrado: la IA cuesta).
 */
export async function presupuestoAbiertoAlCliente(id: string): Promise<boolean> {
  if (!UUID.test(id)) return false
  try {
    const p = await prisma.presupuesto.findUnique({ where: { id }, select: { id: true, enviadoAt: true, retiradoAt: true } })
    if (!p || p.retiradoAt !== null) return false
    const enlaceGenerado = p.enviadoAt === null ? await constaEnlaceGenerado(p.id) : false
    return abiertoAlCliente({ enviadoAt: p.enviadoAt, enlaceGenerado, porWhatsapp: false, vistaDeCorredor: false })
  } catch (e) {
    registrar('presupuestoAbiertoAlCliente', e)
    return false
  }
}

/**
 * El presupuesto `id`, para la identidad de la cookie.
 *
 * El `id` viene de la URL, así que **la autorización va antes de cualquier otra
 * lectura**: primero se decide si esta persona lo puede ver y solo después se
 * bajan las opciones y la póliza actual.
 */
export async function presupuestoDeSesion(id: string): Promise<LecturaPresupuesto> {
  const identidad = await getIdentidad()
  // Segunda puerta: el código del WhatsApp, SOLO para este presupuesto (ver `accesoWhatsappDe`).
  const accesoW = await accesoWhatsappDe(id)
  const porWhatsapp = accesoW !== null
  // El código de un correo a una PERSONA DE CONTACTO: ve el presupuesto, no opera (21/10/2026).
  const porTercero = accesoW?.tercero === true
  if (!identidad && !porWhatsapp) return { estado: 'sin_sesion' }
  const vistaDeCorredor = identidad !== null && identidad.corredor !== null

  if (!UUID.test(id)) return { estado: 'no_encontrado' }

  try {
    const p = await prisma.presupuesto.findUnique({
      where: { id },
      select: {
        id: true,
        correduriaId: true,
        clienteId: true,
        polizaId: true,
        ramo: true,
        origen: true,
        destinoHash: true,
        venceEl: true,
        creadoAt: true,
        enviadoAt: true,
        vistoAt: true,
        elegidoAt: true,
        aceptadoAt: true,
        emitidoAt: true,
        retiradoAt: true,
        necesidades: true,
      },
    })
    if (!p) return { estado: 'no_encontrado' }

    // 🚨 Un BORRADOR no lo abre el cliente (ni dispara la IA, que cuesta). `enlazado` sí: el WhatsApp
    // ya salió del móvil de Alberto aunque no haya confirmado el envío (ver `presupuesto-publicado.ts`).
    // Va ANTES de la autorización: a quien no es suyo tampoco se le dice que existe.
    const enlaceGenerado = p.enviadoAt === null && !vistaDeCorredor && !porWhatsapp ? await constaEnlaceGenerado(p.id) : false
    if (!abiertoAlCliente({ enviadoAt: p.enviadoAt, enlaceGenerado, porWhatsapp, vistaDeCorredor })) return { estado: 'no_encontrado' }

    // Por el código del WhatsApp ya está autorizado (cookie de ESTE id + token vigente). Si no,
    // las dos ramas de siempre, que parten de la identidad de la cookie de sesión (y la del autorizado, en renovación).
    let porAutorizado = false
    // ¿Mira el lado del TOMADOR? Su enlace (no el de una persona de contacto), el canal avisado o su ficha con nivel de operar.
    let visorTomador = porWhatsapp && !porTercero
    if (!porWhatsapp) {
      // Inalcanzable (se cortó arriba), pero escrito para fallar CERRADO si alguien mueve ese corte.
      if (identidad === null) return { estado: 'sin_sesion' }
      const identidadId = identidad.id
      // ── ¿Quién mira? ──────────────────────────────────────────────────────
      //
      // Rama (b): el vínculo identidad ↔ ficha, que es la costura de siempre. El
      // `where` lleva el `identidadId` de la cookie DENTRO, no comprobado en la
      // línea siguiente.
      const vinculo = await prisma.portalVinculo.findFirst({
        where: { identidadId, clienteId: p.clienteId },
        select: { id: true, correduriaId: true, nivel: true },
      })

      // Rama (a): el canal por el que entró es el mismo al que se avisó.
      //
      // 🚨 `destinoHash === null` **no es «no coincide»**: es «no consta a quién
      // se avisó» (hoy, todas las filas — el envío es el PR 3). Un `null` que
      // entrara en la comparación daría acceso a cualquiera cuyo canal hashee a
      // `null`, o sea a nadie, pero escrito de forma que el día que alguien
      // relaje el tipo se abra solo. Se corta antes.
      let porCanal = false
      if (p.destinoHash !== null && p.destinoHash !== '') {
        const canal = await prisma.portalCanal.findFirst({
          where: { identidadId, valorHash: p.destinoHash },
          select: { id: true },
        })
        porCanal = canal !== null
      }

      // 🚨 Cinturón de la rama (a), simétrico al de la (b) de más abajo:
      // `portal_canal` no lleva `correduria_id` (un canal es de la identidad, no
      // de una correduria), así que no hay con qué comprobarlo directamente. Lo
      // que SÍ se puede comprobar es que esta identidad no tenga ya un vínculo
      // establecido con OTRA correduria: si lo tiene, coincidir por canal aquí
      // no basta para creer que es la misma persona en ESTA correduria. Hoy es
      // inalcanzable (una sola correduria en todo el sistema), pero el día que
      // haya una segunda, esta guarda ya está puesta.
      if (porCanal) {
        const otraCorreduria = await prisma.portalVinculo.findFirst({
          where: { identidadId, correduriaId: { not: p.correduriaId } },
          select: { id: true },
        })
        if (otraCorreduria !== null) porCanal = false
      }

      // Rama (c), 05/11/2026: una RENOVACIÓN la ve también el AUTORIZADO del tomador con Gestión o Total (regla única
      // `identidadesQueEligenRenovacion`, la misma que aplica asegura al escribir). Solo si no entra ya con la ficha del
      // tomador con nivel de operar. Un fallo de lectura LANZA → `error` (nunca «no es tuyo» ni abrir por defecto).
      if (!vistaDeCorredor && !(vinculo !== null && nivelPuedeOperar(vinculo.nivel)) && (await esRenovacion(p.id, p.correduriaId))) {
        porAutorizado = await autorizadoEligeRenovacion(identidadId, { correduriaId: p.correduriaId, clienteId: p.clienteId, polizaId: p.polizaId })
      }

      visorTomador = porCanal || (vinculo !== null && nivelPuedeOperar(vinculo.nivel))

      if (vinculo === null && !porCanal && !porAutorizado) {
        // ¿Es que su correo está en dos fichas? Entonces no es «esto no es tuyo»:
        // es «no lo hemos podido decidir», y se dice con la misma frase que ya
        // usa la bóveda. Un «no eres tú» sobre un empate es una acusación falsa.
        const estadoVinculo = await ultimoVinculoDe(identidadId)
        if (estadoVinculo === 'ambiguo') return { estado: 'vinculo_ambiguo' }
        await anotarAperturaAjena(p.id)
        return { estado: 'ajeno' }
      }

      // Cinturón: el presupuesto y el vínculo tienen que ser de la MISMA
      // correduría. Con un rol sin RLS, un id de otra correduría no falla: da los
      // datos de otro.
      if (vinculo !== null && vinculo.correduriaId !== p.correduriaId) {
        await anotarAperturaAjena(p.id)
        return { estado: 'ajeno' }
      }
    }

    const hoy = new Date()
    const caducado = p.venceEl.getTime() < hoy.getTime()

    // Quién mira, para «ya elegida por…»: el lado del tomador (su cuenta o su enlace) o el autorizado (su identidad).
    // Quien no es ni el tomador ni un autorizado que elige (solo consulta, contacto) se trata como «otra persona»: nunca
    // se le dice «Elegiste…» por una elección del tomador.
    const visor = { papel: visorTomador ? 'tomador' as const : 'autorizado' as const, identidadId: visorTomador ? null : identidad?.id ?? null }
    const [opciones, actualLeido, renovacion] = await Promise.all([
      leerOpciones(p.id, p.correduriaId),
      p.polizaId === null ? Promise.resolve(null) : leerActual(p.polizaId, p.clienteId, p.correduriaId),
      leerRenovacion(p.id, p.correduriaId, visor),
    ])
    // 🚨 Al autorizado no se le enseña la dirección del riesgo: es un dato de la PERSONA del tomador (NUNCA_A_UN_TERCERO).
    const actual = porAutorizado && actualLeido ? { ...actualLeido, ubicacion: null } : actualLeido

    // ── El sello ──────────────────────────────────────────────────────────
    //
    // 🚨 Alberto mirando con la vista de corredor NO sella `visto_at`. Si lo
    // hiciera, la cola de Hoy diría «el cliente lo ha abierto» sobre una
    // pantalla que abrió él — y eso decide si se le vuelve a llamar o se le
    // deja en paz creyendo que ya lo ha visto.
    if (!vistaDeCorredor) await sellarVisto(p.id, p.clienteId, p.vistoAt)

    // Persona de contacto: a quién representa, para decírselo (el nombre ya iba en su correo). Si no se lee, sin nombre.
    const accesoTercero = porTercero ? await tomadorParaTercero(p.clienteId, p.correduriaId) : null
    const accesoAutorizado = porAutorizado ? { tomador: await tomadorParaAutorizado(p.clienteId, p.correduriaId) } : null

    return {
      estado: 'ok',
      presupuesto: {
        id: p.id,
        ramo: p.ramo,
        origen: origenVista(p.origen),
        creadoAt: p.creadoAt,
        venceEl: p.venceEl,
        caducado,
        retirado: p.retiradoAt !== null,
        enviadoAt: p.enviadoAt,
        elegidoAt: p.elegidoAt,
        aceptadoAt: p.aceptadoAt,
        emitidoAt: p.emitidoAt,
        motivoSinEquivalente: motivoSinEquivalenteDe(opciones, actual),
        opciones,
        actual,
        vistaDeCorredor,
        renovacion,
        necesidades: p.necesidades?.trim() || null,
        accesoWhatsapp: porWhatsapp,
        accesoTercero,
        accesoAutorizado,
      },
    }
  } catch (e) {
    registrar('presupuestoDeSesion', e)
    return { estado: 'error' }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Nombre y tipo del TOMADOR del presupuesto, para el aviso a una persona de contacto. Solo se llama con el presupuesto
 * ya autorizado (cookie de ESTE id + token vigente) y con SU `cliente_id`/`correduria_id`, nunca con uno de fuera. Un
 * fallo no tumba la pantalla: se dice sin nombre (`juridica: false` = no se afirma que sea una empresa).
 */
async function tomadorParaTercero(clienteId: string, correduriaId: string): Promise<{ tomador: string | null; juridica: boolean }> {
  try {
    const c = await prisma.cliente.findFirst({
      where: { id: clienteId, correduriaId },
      select: { nombre: true, apellidos: true, tipoPersona: true },
    })
    if (!c) return { tomador: null, juridica: false }
    const nombre = `${c.nombre ?? ''} ${c.apellidos ?? ''}`.trim()
    return { tomador: nombre === '' ? null : nombre, juridica: c.tipoPersona === 'juridica' }
  } catch (e) {
    registrar('tomadorParaTercero', e)
    return { tomador: null, juridica: false }
  }
}

/**
 * Por qué no hay «la equivalente». Se DERIVA, porque el motivo que calculó
 * `elegirPortada()` al preparar no se guarda en ninguna columna (lo devuelve
 * `PresupuestoPreparado` y muere ahí).
 *
 * 🚨 Los dos motivos NO se colapsan, que es lo que exige el §4.2: sin póliza
 * actual o sin su desglose, es `actual_sin_coberturas` («no puedo compararlo
 * con lo que tienes»); con desglose leído y ninguna opción marcada equivalente,
 * es `sin_equivalente` («ninguna compañía me ha dado tu misma cobertura»).
 *
 * ⚠️ Derivarlo es una aproximación declarada: si algún día el preparador congela
 * su `motivoSinEquivalente` en una columna, esta función se cambia por esa
 * lectura — no se dejan las dos.
 */
function motivoSinEquivalenteDe(opciones: OpcionCliente[], actual: ActualCliente | null): SinEquivalente | null {
  if (opciones.some((o) => o.papeles.includes('equivalente'))) return null
  const sinDesglose = actual === null || actual.coberturas === null || actual.coberturas.length === 0
  return leerSinEquivalente(sinDesglose ? 'actual_sin_coberturas' : 'sin_equivalente')
}

async function leerOpciones(presupuestoId: string, correduriaId: string): Promise<OpcionCliente[]> {
  // Solo id y clave: el PDF se sirve aparte, en /api/ipid/[id].
  const fichas = await prisma.ipid.findMany({ where: { correduriaId, retiradoAt: null }, select: { id: true, clave: true } })
  const ipidPorClave = new Map(fichas.map((f) => [f.clave, f.id]))
  // 🚨 `ocultaAt: null` SIEMPRE: lo que el corredor quitó antes de enviar no lo ve el cliente.
  const filas = await prisma.presupuestoOpcion.findMany({
    where: { presupuestoId, ocultaAt: null },
    orderBy: { orden: 'asc' },
    select: {
      id: true,
      orden: true,
      compania: true,
      producto: true,
      modalidad: true,
      grupoCobertura: true,
      primaEur: true,
      entradaEur: true,
      franquiciaEur: true,
      firmeza: true,
      avisos: true,
      coberturas: true,
      garantias: true,
      papeles: true,
    },
  })
  return filas.map((f) => {
    const papeles = f.papeles.filter(esPapel)
    return {
      id: f.id,
      orden: f.orden,
      compania: f.compania,
      producto: f.producto,
      modalidad: f.modalidad,
      grupoCobertura: f.grupoCobertura,
      primaEur: decimal(f.primaEur),
      entradaEur: decimal(f.entradaEur),
      franquiciaEur: decimal(f.franquiciaEur),
      firmeza: leerFirmeza(f.firmeza),
      avisos: coberturasDeJson(f.avisos),
      coberturas: coberturasDeJson(f.coberturas),
      coberturasDetalle: coberturasDeOpcion(f.coberturas),
      garantias: garantiasDeJson(f.garantias),
      papeles,
      // `coberturaDistinta` tampoco se congela: se deriva de que la opción haga
      // de «menor importe» sin que ninguna haga de equivalente, que es
      // exactamente la condición con la que `elegirPortada()` la marca.
      coberturaDistinta:
        papeles.includes('mas_barata') && !filas.some((o) => o.papeles.includes('equivalente')),
      esPortada: papeles.length > 0,
      ipidId: ipidPorClave.get(claveProducto(f.compania, f.producto) ?? '') ?? null,
    }
  })
}

/**
 * La póliza que se compara. Se lee por su id **y** por el `cliente_id` del
 * presupuesto: un `poliza_id` que apuntara a otra ficha no puede pintar aquí la
 * casa de otro.
 *
 * Y se exige cartera VIVA: una del volcado histórico (vencimientos 2013-2018)
 * pintada como «lo que tienes hoy» sería una comparación contra un seguro que
 * ya no existe.
 */
/**
 * El modo renovación y la elección (columnas de 2026-11-05b, leídas en crudo: el schema no las declara para que su
 * ausencia no tumbe el resto de lecturas del presupuesto). Solo se llama DESPUÉS de autorizar (`presupuestoDeSesion`).
 * Sin la migración (falta la columna) → `null`: el presupuesto de siempre. Cualquier OTRO fallo (sin GRANT, red) →
 * `'no_disponible'`: la página no ofrece ni elegir ni Aceptar/Firmar (`renovacionTrasFallo`).
 */
async function leerRenovacion(
  presupuestoId: string, correduriaId: string, visor: { papel: 'tomador' | 'autorizado'; identidadId: string | null },
): Promise<RenovacionCliente | null | typeof RENOVACION_NO_DISPONIBLE> {
  let f: { modo: string | null; eleccion_cliente: string | null; eleccion_opcion_id: string | null; eleccion_at: Date | null } | undefined
  try {
    ;[f] = await prisma.$queryRaw<{ modo: string | null; eleccion_cliente: string | null; eleccion_opcion_id: string | null; eleccion_at: Date | null }[]>`
      select modo, eleccion_cliente, eleccion_opcion_id::text as eleccion_opcion_id, eleccion_at
      from seguros.presupuesto where id = ${presupuestoId}::uuid and correduria_id = ${correduriaId}::uuid`
  } catch (e) {
    registrar('leerRenovacion', e)
    return renovacionTrasFallo(e)
  }
  if (!f || f.modo !== 'renovacion') return null
  // Quién eligió (2026-11-05c). 🚨 En una RENOVACIÓN, cualquier fallo aquí —también «falta la columna»— es NO DISPONIBLE:
  // sin saber quién eligió no se ofrece elegir (ni, por ser renovación, aceptar/firmar). Nunca se pinta como presupuesto normal.
  try {
    const [q] = await prisma.$queryRaw<{ eleccion_por_papel: string | null; eleccion_por_identidad_id: string | null; eleccion_por_nombre: string | null }[]>`
      select eleccion_por_papel, eleccion_por_identidad_id::text as eleccion_por_identidad_id, eleccion_por_nombre
      from seguros.presupuesto where id = ${presupuestoId}::uuid and correduria_id = ${correduriaId}::uuid`
    const eleccion = f.eleccion_cliente === 'renovacion'
      ? { tipo: 'renovacion' as const }
      : f.eleccion_cliente === 'opcion' && f.eleccion_opcion_id ? { tipo: 'opcion' as const, opcionId: f.eleccion_opcion_id } : null
    const dueno = duenoDeEleccion(
      { papel: q?.eleccion_por_papel ?? undefined, identidadId: q?.eleccion_por_identidad_id ?? null, porNombre: q?.eleccion_por_nombre ?? null },
      f.eleccion_cliente !== null,
    )
    return { eleccion, eleccionAt: eleccion ? f.eleccion_at : null, elegidaPorOtro: eleccionDeOtraPersona(dueno, visor) }
  } catch (e) {
    registrar('leerRenovacion/quien', e)
    return RENOVACION_NO_DISPONIBLE
  }
}

/**
 * ¿Es una RENOVACIÓN? Para la rama del autorizado, ANTES de enseñar nada. Sin la migración 2026-11-05b no puede serlo
 * (`false`); cualquier otro fallo LANZA (lo recoge `presupuestoDeSesion` como `error`).
 */
async function esRenovacion(presupuestoId: string, correduriaId: string): Promise<boolean> {
  try {
    const [f] = await prisma.$queryRaw<{ modo: string | null }[]>`
      select modo from seguros.presupuesto where id = ${presupuestoId}::uuid and correduria_id = ${correduriaId}::uuid`
    return f?.modo === 'renovacion'
  } catch (e) {
    if (renovacionTrasFallo(e) === null) return false
    throw e
  }
}

async function leerActual(polizaId: string, clienteId: string, correduriaId: string): Promise<ActualCliente | null> {
  // `WHERE_CARTERA_VIVA` va DENTRO del `AND`: es un `OR` de dos brazos y
  // esparcirlo al lado de los demás filtros lo convertiría en un `OR` que se
  // come el resto de la consulta (la misma trampa que ya documenta
  // `cartera-lectura.ts`).
  const p = await prisma.poliza.findFirst({
    where: {
      AND: [{ id: polizaId, clienteId, correduriaId, mergedIntoPolizaId: null }, WHERE_CARTERA_VIVA],
    },
    select: {
      aseguradora: true,
      tipo: true,
      fechaVencimiento: true,
      primaAnual: true,
      primaBruta: true,
      fraccionamiento: true,
      datosEspecificos: true,
    },
  })
  if (!p) return null

  // La prima y el vencimiento CON LOS RECIBOS (la misma regla que la cartera de asegura). Si los recibos no se leen, la
  // prima de la póliza sola NO se da por buena: `null` (no consta) antes que enseñar la del año pasado como «la de hoy».
  let primaAnual: number | null = null
  let primaDeRecibo = false
  let fechaVencimiento: Date | null = p.fechaVencimiento
  try {
    const recibos = (await prisma.polizaRecibo.findMany({
      where: { polizaId, correduriaId },
      select: { claseRecibo: true, situacion: true, primaTotal: true, fechaVencimiento: true },
    })).map((r) => ({
      claseRecibo: r.claseRecibo ?? null, situacion: r.situacion === null ? null : String(r.situacion), primaTotal: r.primaTotal ?? null,
      fechaVencimiento: r.fechaVencimiento ? r.fechaVencimiento.toISOString().slice(0, 10) : null,
    }))
    const hoy = new Date().toISOString()
    const dudosa = (p.datosEspecificos as { primaAnualDudosa?: unknown } | null)?.primaAnualDudosa === true
    const r = primaConRecibos({
      primaAnual: dudosa ? null : decimal(p.primaAnual), primaBruta: dudosa ? null : decimal(p.primaBruta),
      fraccionamiento: p.fraccionamiento === null ? null : String(p.fraccionamiento),
    }, recibos, hoy)
    primaAnual = r.prima
    primaDeRecibo = r.deRecibo
    const v = vencimientoConRecibos(p.fechaVencimiento ? p.fechaVencimiento.toISOString().slice(0, 10) : null, recibos, hoy)
    fechaVencimiento = v ? new Date(`${v.slice(0, 10)}T00:00:00Z`) : p.fechaVencimiento
  } catch (e) {
    registrar('leerActual/recibos', e)
  }

  // 🚨 `null` = NO SE HA PODIDO LEER, nunca `[]`. Si esta consulta falla, la
  // tabla de garantías tiene que poder decir «no lo sé» en vez de pintar cada
  // garantía de la nueva como una mejora.
  let coberturas: string[] | null = null
  try {
    const cob = await prisma.polizaCobertura.findMany({
      where: { polizaId, correduriaId },
      orderBy: { numeroOrden: 'asc' },
      select: { descripcion: true },
    })
    coberturas = cob.map((c) => c.descripcion).filter((d): d is string => typeof d === 'string' && d.trim() !== '')
  } catch (e) {
    registrar('leerActual/coberturas', e)
  }

  const { bien, ubicacion } = describirBienDeDatos(p.datosEspecificos)

  return {
    compania: p.aseguradora ?? 'tu compañía',
    ramo: p.tipo ?? 'seguro',
    // 🚨 `numero_poliza` NO viaja: regla permanente del portal, el número de
    // póliza no identifica una póliza para el cliente. Nadie se lo sabe, y la
    // pantalla del corredor ya aprendió que dos hogares de la misma compañía se
    // distinguen por la casa, no por un número de trece dígitos.
    bien,
    ubicacion,
    fechaVencimiento,
    primaAnual,
    primaDeRecibo,
    coberturas,
  }
}

/**
 * El bien, en corto. No se usa `describirBien()` del módulo porque aquí no hace
 * falta la ficha entera: en la cabecera de la comparativa cabe una línea.
 *
 * La dirección viaja CIFRADA dentro de `datos_especificos` (`v1:iv:cipher:tag`).
 * Si no se abre, se devuelve `null` — un criptograma en pantalla es peor que un
 * hueco, y un hueco aquí no afirma nada.
 */
function describirBienDeDatos(datos: unknown): { bien: string | null; ubicacion: string | null } {
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) return { bien: null, ubicacion: null }
  const d = datos as Record<string, unknown>
  const partes = [d.marca, d.modelo, d.matricula].filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  const bien = partes.length > 0 ? partes.join(' · ') : null
  return { bien, ubicacion: direccion(d) }
}

function direccion(d: Record<string, unknown>): string | null {
  const bruta = d.direccion
  if (typeof bruta !== 'string' || bruta.trim() === '') return null
  let clara = bruta
  if (bruta.startsWith('v1:')) {
    try {
      clara = decryptField(bruta)
    } catch {
      return null
    }
  }
  // Sin `PII_ENCRYPTION_KEY`, `decryptField` devuelve el sobre TAL CUAL. Un
  // `v1:…` en pantalla no es una dirección: es la prueba de que falta la clave.
  if (clara.startsWith('v1:')) return null
  const localidad = typeof d.localidad === 'string' ? d.localidad.trim() : ''
  return [clara.trim(), localidad].filter((s) => s !== '').join(', ')
}

/**
 * `enviado → visto`, filtrado por el `cliente_id` que YA se ha autorizado
 * arriba, y solo la primera vez (`coalesce(visto_at, now())` escrito como un
 * `where vistoAt: null`).
 *
 * Best-effort a propósito: el presupuesto ya se está enseñando, y un sello que
 * falla no puede convertirse en una pantalla que no carga. Lo que se pierde es
 * que la cola de Hoy diga que lo abrió.
 *
 * ⚠️ Decisión que la spec no cierra, dicha en voz alta: **no se exige
 * `enviado_at`** aunque su tabla de transiciones diga «enviado → visto». Con el
 * enlace de WhatsApp el mensaje sale del móvil de Alberto y `enviado_at` solo
 * se sella si él marca «ya lo he mandado» — una casilla opcional. Si el sello
 * exigiera `enviado_at`, el caso más valioso de todos (alguien con su correo
 * probado abre un presupuesto que consta solo como `enlazado`, o sea: SÍ se
 * mandó) no dejaría rastro. Lo que `visto_at` afirma es «consta que lo abrió
 * quien puede verlo», y eso es cierto en las dos ramas.
 */
async function sellarVisto(id: string, clienteId: string, vistoAt: Date | null): Promise<void> {
  if (vistoAt !== null) return
  try {
    await prisma.presupuesto.updateMany({
      where: { id, clienteId, vistoAt: null },
      data: { vistoAt: new Date() },
    })
  } catch (e) {
    registrar('sellarVisto', e)
  }
}

/**
 * Alguien con sesión ha abierto un presupuesto que no es suyo. Se anota para
 * que Alberto lo sepa (§3.1) — no para bloquear a nadie.
 *
 * ⚠️ **Se anota UNA vez por hora y por presupuesto**, no una por recarga: la
 * tabla es append-only y un F5 sostenido la llenaría. Es un aviso, no un
 * registro de auditoría; el detalle del embudo vive en la telemetría del PR 3.
 *
 * 🚫 Y en el `detalle` NO va ni el correo ni la identidad de quien abrió: el
 * historial de la casa no guarda valores de datos de identidad.
 */
async function anotarAperturaAjena(presupuestoId: string): Promise<void> {
  try {
    const desde = new Date(Date.now() - 60 * 60 * 1000)
    const ya = await prisma.presupuestoEvento.findFirst({
      where: { presupuestoId, tipo: 'apertura_ajena', ocurridoAt: { gte: desde } },
      select: { id: true },
    })
    if (ya) return
    await prisma.presupuestoEvento.createMany({
      data: [{ presupuestoId, tipo: 'apertura_ajena', origen: 'cliente' }],
    })
  } catch (e) {
    registrar('anotarAperturaAjena', e)
  }
}

/**
 * Cómo salió el último intento de vínculo de esta identidad. Se LEE del sello
 * que dejó el canje del código: aquí no existe el correo en claro, así que no
 * se puede recalcular.
 */
async function ultimoVinculoDe(identidadId: string): Promise<string | null> {
  try {
    const i = await prisma.portalIdentidad.findUnique({
      where: { id: identidadId },
      select: { ultimoVinculo: true },
    })
    return i?.ultimoVinculo ?? null
  } catch (e) {
    registrar('ultimoVinculoDe', e)
    return null
  }
}

/** Prisma devuelve `numeric` como `Decimal`. Se convierte en UN solo sitio. */
function decimal(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(String(v))
  return Number.isFinite(n) ? n : null
}

/** El motivo sí se registra; ni el token, ni el hash del canal, ni el correo. */
function registrar(donde: string, e: unknown): void {
  console.error(`[portal/presupuesto] ${donde}:`, e instanceof Error ? e.message : e)
}

/** `hashCanal` se re-exporta para que el cepo vea que la rama (a) usa ESTA función. */
export { hashCanal }

// ─── «Pendiente de ti»: los presupuestos que esperan algo de la persona ─────
//
// Hasta hoy un presupuesto solo se abría desde el enlace del correo: quien lo borraba no lo
// encontraba en su portal. Aquí se listan los de SUS fichas (por `portal_vinculo` de la sesión,
// nunca un id de fuera) que siguen vivos: avisados, sin retirar ni emitir, y —si no se han
// aceptado— sin caducar. Un aceptado sin emitir sigue aquí aunque venza (hasta 90 días): es el que espera sus datos.

export type PresupuestoParaPendientes = { id: string; ramo: string; venceEl: Date; aceptado: boolean }

/** `null` = no se ha podido leer. Nunca `[]` por un fallo: eso se leería como «no tienes ninguno». */
export async function presupuestosPendientesDeIdentidad(identidadId: string): Promise<PresupuestoParaPendientes[] | null> {
  try {
    const vinculos = await prisma.portalVinculo.findMany({
      where: { identidadId },
      select: { clienteId: true, correduriaId: true },
    })
    if (vinculos.length === 0) return []
    const ahora = new Date()
    const filas = await prisma.presupuesto.findMany({
      where: {
        OR: vinculos.map((v) => ({ clienteId: v.clienteId, correduriaId: v.correduriaId })),
        enviadoAt: { not: null },
        retiradoAt: null,
        emitidoAt: null,
        // Aceptado sin emitir: 90 días como mucho — más allá ya no es algo que espere al cliente.
        AND: [{ OR: [{ aceptadoAt: { gte: new Date(ahora.getTime() - 90 * 86_400_000) } }, { venceEl: { gte: ahora } }] }],
      },
      select: { id: true, ramo: true, venceEl: true, aceptadoAt: true },
      orderBy: { venceEl: 'asc' },
      take: 10,
    })
    return filas.map((p) => ({ id: p.id, ramo: p.ramo, venceEl: p.venceEl, aceptado: p.aceptadoAt !== null }))
  } catch (e) {
    console.error('[presupuesto] no se pudieron leer los pendientes:', e instanceof Error ? e.message : e)
    return null
  }
}
