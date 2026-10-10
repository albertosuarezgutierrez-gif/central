// Fase 4 — lo que el portal LEE de la cartera para una identidad.
//
// 🔒 Aislamiento por CÓDIGO (no hay RLS: el rol es NOBYPASSRLS pero las tablas
// de la cartera no tienen políticas para él). Toda lectura parte de
// `portal_vinculo` filtrado por `identidadId`, que sale de la cookie por
// `lib/session`. Ningún `clienteId` entra desde fuera de este fichero.
//
// Tres estados que la UI tiene que poder decir por separado (regla global
// «dato que NO hay ≠ dato que NO se ha mirado»):
//   - `vinculada: false`         → esta identidad no tiene ficha en la cartera.
//   - vinculada y sin pólizas    → la ficha está, pero no tiene pólizas VIVAS.
//   - campo a `null`             → el dato existe pero el NIVEL no lo enseña.
//     (`prima: null` no es «sin prima»: es «no visible en tu nivel».)
//
// Y un CUARTO estado que NO es ninguno de los tres: el dato que sencillamente
// no va en la vista del cliente (referencias internas de gestión, datos de
// terceros). Ese no se pinta vacío ni «pendiente»: no existe en el tipo ni en
// el `select`. Desde el 28/09/2026 el tramitador, el perito, la reserva y la
// culpa SÍ van («el seguro es suyo, tiene que saber todo», Alberto).
//
// «Vivas» = las que entran o se MANTIENEN por CIMA, más lo que hemos emitido
// nosotros y CIMA aún no ha traído — el criterio único de `WHERE_CARTERA_VIVA`
// (`@central/module-seguros/cartera-viva`), y sin lápida de fusión.
//
// 🚨 Hasta el 03/09/2026 esto era solo `import_ref IS NULL`, y ese filtro tenía
// un agujero MEDIDO: cuando la ingesta de CIMA trae una póliza que YA existía en
// el volcado histórico no crea fila nueva — actualiza la vieja y le deja su
// `import_ref` de 2017. Esa póliza, que CIMA mantiene al día, desaparecía de la
// bóveda de su dueño: el cliente entraba y veía «no tienes pólizas» de un seguro
// que está pagando. Por eso el criterio es la UNIÓN de dos preguntas:
// `import_ref IS NULL` (nació fuera del volcado) O `eiac_xml_hash IS NOT NULL`
// (la ingesta EIAC la ha escrito alguna vez, venga de donde venga).
//
// Las ~28.700 del volcado histórico (vencimientos 2013-2018, sin hash) siguen SIN
// enseñarse: un cliente vería «tu seguro venció en 2016» de una póliza que no
// existe. `confirmadaCima` = CIMA la ha traído (`id_poliza_entidad`); una
// emitida por nosotros aún sin confirmar se dice como tal.
import {
  ordenarHistorialSiniestros,
  siniestroAbierto,
  autorizacionVigente,
  camposDeAlcances,
  puedeDarParte,
  camposVisibles,
  describirBienConGemela,
  describirBien,
  bienTieneAlgo,
  esAlcance,
  etiquetaNivelAlcances,
  NIVELES,
  type Alcance,
  type BienAsegurado,
  type TipoOtorgante,
  type TramitacionSiniestro,
  lugarSiniestro,
  tipoSiniestroLegible,
  descripcionSiniestro,
  tramitacionSiniestro,
  detalleSiniestroCompania,
  type DetalleSiniestroCompania,
  ordenarRecibos,
  estadoRecibos,
  resumirRecibos,
  fechaReciboFiable,
  vistaCobertura,
  capitalDeCobertura,
  nombreCobertura,
  normalizarCodigoCoberturaNumerico,
  type CoberturaVista,
  tonoSituacionRecibo,
  type ReciboHistorial,
  type ResumenRecibos,
  type CamposVisibles,
  type Nivel,
  IDENTIDAD_CORREDOR_ID,
} from '@central/module-seguros-portal'
import {
  esEstadoVigente,
  importeEiac,
  interpretarCapital,
  primaConRecibos,
  devueltoPorSustitucion,
  sustituidasARetirar,
  vencimientoConRecibos,
  vigenciaPoliza,
  WHERE_CARTERA_VIVA,
  type ReciboVigencia,
  type Vigencia,
} from '@central/module-seguros'

import { decryptField } from '@central/module-seguros-pii'

import { identidadesTitulares, TITULAR_TIPO_VISIBLE_A_TERCERO, type DeclaradaDeTitular } from './declaradas-de-titular'
import { datosPolizaCima, primaAnualDudosa, type DatosPolizaCima } from './datos-poliza-cima'
import { prisma } from './db'
import { historialCompanias, type EslabonHistorial } from './historial-companias'
import { camposDeInterviniente, capaInterviniente, figuraEnPropias, figuraYaServidaEnPropias, figurasDeFichasVistas, figurasEnPolizas, rolesPropiosPorPoliza, nivelMasAlto, ordenarRoles } from './intervinientes'
import { empresasDeFichas } from './representacion'
import { getIdentidad } from './session'

/**
 * Un recibo tal y como lo ve el cliente.
 *
 * 🚫 **`formaPago` NO está, y no es un olvido:** en la BD es un CÓDIGO del EIAC
 * —en la cartera viva vale `CC` (117 recibos), `OF` (6) y `TA` (4), y 56 no lo
 * traen—. `CC` se adivina, `OF` no, y pintar «OF» al lado de un importe es
 * exactamente el mismo fallo que pintar «Tipo 1107» en un siniestro. No se pide
 * al `select`, así que no hay nada que se pueda colar en pantalla por descuido.
 */
export type ReciboPortal = ReciboHistorial & {
  /** `clase_recibo` EIAC (CA/NP/SU…) tal cual; `null` = no consta. */
  clase: string | null
  /** Efecto del recibo (`fecha_efecto_actual`); `null` = no consta o centinela. */
  fechaEfecto: Date | null
  /** Día en que pasó a su situación actual; `null` = no consta o centinela. */
  fechaSituacion: Date | null
}

export type RecibosPortal = ResumenRecibos & {
  /**
   * Qué se le puede decir al cliente. **Tres estados, no dos** — lo decide
   * `estadoRecibos()` de `@central/module-seguros-portal`, que es donde está
   * medido por qué: `solo_anulados` son 20 pólizas de las 110 vivas, y con el
   * resumen anterior no pintaban absolutamente nada.
   *
   * 🚨 `sin_informar` significa que **la compañía no ha informado recibos**, y
   * eso NO es «al corriente»: nadie lo ha comprobado. La pantalla lo dice con
   * esas palabras porque el silencio se leería como lo contrario.
   */
  estado: 'sin_informar' | 'solo_anulados' | 'con_recibos'
  /** Los que el cliente ve, del más reciente al más antiguo y sin los anulados. */
  historial: ReciboPortal[]
}

/**
 * Lo que el CLIENTE ve de un siniestro suyo.
 *
 * ✅ **Desde el 28/09/2026 SÍ lleva tramitador, perito, reserva y culpa**
 * (Alberto: «el seguro es suyo, tiene que saber todo»; deroga la regla del
 * 03/09/2026 que los ocultaba). Viajan dentro de `detalle`, traducidos por
 * `detalleSiniestroCompania`, que descarta los datos de TERCEROS (cifrados).
 *
 * ⚠️ Esto NO deroga la regla del `CLAUDE.md` de la raíz («dato que NO hay ≠
 * dato que NO se ha mirado»): la afina. Lo que se calla es lo que NO cambia lo
 * que el cliente haría. Lo que sí cambiaría su decisión —sin vencimiento,
 * `recibos.total === 0`, `coberturas.total === 0`— se sigue diciendo en voz
 * alta, y para eso este fichero tiene que SEGUIR trayendo el dato.
 *
 * Lo protege `test/regression-portal-visibilidad.test.ts`.
 */
export type SiniestroPortal = {
  id: string
  estado: string
  referencia: string | null
  fechaHora: Date | null
  /**
   * QUÉ pasó, en las palabras de quien lo tramitó (`siniestros.comentario`).
   * `null` = la compañía no lo contó — que NO es «no pasó nada».
   *
   * 🚨 Llega desde el 07/09/2026, con GRANT propio
   * (`prisma/sql/2026-09-07_portal_siniestro_descripcion.sql`) y decisión
   * explícita de Alberto con la cartera delante: es texto LIBRE y a veces trae
   * nombres y teléfonos de terceros. Va con el MISMO permiso que el resto del
   * historial (`ve.siniestros`), no con uno propio.
   */
  descripcion: string | null
  /** DÓNDE pasó, ya legible («Dos Hermanas (Sevilla)»). `null` = no consta. */
  lugar: string | null
  /**
   * QUÉ TIPO de siniestro, con la tabla oficial de TIREA («Daños por agua -
   * Responsabilidad civil»). `null` = código fuera de tabla o no informado:
   * nunca se pinta el código crudo.
   */
  tipoLegible: string | null
  /**
   * Cómo va, según la COMPAÑÍA (EIAC): pasos con fecha y lo pagado. `null` = la
   * compañía no lo manda (no todas lo hacen; visto en Occident y Allianz) o el
   * fichero es anterior al 24/09/2026 y no se ha reprocesado. Sin reserva ni culpa, y sin nombres: ver
   * `siniestro-tramitacion.ts` de `@central/module-seguros-portal`.
   */
  tramitacion: TramitacionSiniestro | null
  /**
   * TODO lo demás que cuenta la compañía (28/09/2026): fecha de declaración,
   * culpa, reserva, expedientes, asistencias, tramitador y perito. `null` = no
   * informa nada de esto. Los datos de terceros (matrícula/conductor del
   * contrario, persona física de una asistencia) NO llegan: ver
   * `siniestro-detalle.ts` de `@central/module-seguros-portal`.
   */
  detalle: DetalleSiniestroCompania | null
}

export type PolizaPortal = {
  id: string
  compania: string
  ramo: string
  numeroPoliza: string | null
  fechaInicio: Date | null
  fechaVencimiento: Date | null
  /** Fecha de emisión de la póliza (EIAC). `null` = la compañía no la ha mandado: no se pinta. */
  fechaEmision: Date | null
  /** Desde cuándo corre el periodo actual (EIAC). `null` = no se pinta. */
  fechaEfectoActual: Date | null
  /** Cuándo se solicitó la póliza (EIAC). `null` = no consta O no visible en este nivel (`coberturas`): no se pinta. */
  fechaSolicitud: Date | null
  estado: string
  vigencia: Vigencia
  /**
   * 🚨 En vigor según la compañía (estado vigente, entra por CIMA) pero con el vencimiento ya
   * pasado y sin renovación informada (27/09/2026: Mapfre estuvo tres meses sin mandar nada y
   * sus pólizas desaparecían de «En vigor» como si hubieran caducado). No se sabe si se renovó:
   * se enseña como «Renovación sin confirmar», nunca como vencida.
   */
  renovacionSinConfirmar: boolean
  /** CIMA la ha traído. `false` = emitida por nosotros y la compañía aún no la confirma. */
  confirmadaCima: boolean
  /**
   * Cuándo se marcó esta póliza como SUSTITUIDA (baja por cambio de compañía o por sustitución). `null` = no lo está.
   * Interno: el puente de asegura exige `sustituida_at IS NULL` para aceptar «mejorar el precio»
   * (`sqlCarteraEnVigor`), así que quien ofrezca esa acción debe filtrar por lo mismo.
   */
  sustituidaAt: Date | null
  /** Id de la póliza a la que esta sustituye (cambio de compañía). Interno: sirve para cruzar. */
  sustituyeAId: string | null
  /** La póliza a la que sustituye, SOLO si este lector también la ve. `null` = ninguna o no visible. */
  sustituyeA: { compania: string; fechaVencimiento: Date | null } | null
  /**
   * 🚨 La que ocupa su sitio, cuando esta ya se RETIRA DE LA LISTA (`sustituidasARetirar`: la nueva está
   * vigente, aunque aún no haya empezado, este lector la ve y esta no tiene nada pendiente). Retirar de la lista no
   * quita el acceso: la ficha, los partes y los recibos siguen siendo suyos. Por eso la póliza sigue
   * en `TitularPortal.polizas` y solo `carteraALaVista()` la quita, para PINTAR la bóveda.
   */
  sustituidaPor: { compania: string; desde: Date | null } | null
  /** Cambios de compañía de este seguro, de la más antigua a la actual (`lib/historial-companias.ts`).
   *  `[]` = no hay cambio o este lector no ve la otra póliza. Se decide POR LECTOR, como `sustituyeA`. */
  cambiosCompania: EslabonHistorial[]
  /**
   * Papeles de ESTA identidad en la póliza (`tomador`, `propietario`, `conductor_habitual`…),
   * en el orden de `ORDEN_ROLES`. En propias e intervinientes siempre; en las autorizadas y las
   * de sus empresas solo si ADEMÁS figura en ellas (si no, las ve por permiso y no hay papel).
   */
  figura?: string[]
  /**
   * Presente SOLO cuando la póliza cuelga de un titular que NO es su tomador: la
   * ficha que se ve (una empresa autorizada, la del dueño) FIGURA en ella
   * (propietaria, asegurada…) y el tomador es otro. `roles` son los de esa
   * ficha, no los de la identidad; `tomador` = nombre del tomador (`null` si su
   * ficha no se pudo leer). Los campos van capados como los de un interviniente.
   */
  figuraTitular?: { roles: string[]; tomador: string | null }
  /**
   * De dónde viene la fila, tal cual está en la BD. NO es para pintarlo: es lo
   * que necesitan aguas abajo (`lib/obligaciones.ts`) para volver a preguntar
   * «¿es cartera viva?» con los datos REALES en vez de darlo por hecho.
   */
  procedencia: { importRef: string | null; eiacXmlHash: string | null }
  /** `null` = no visible en este nivel (no «sin prima»). `anual: null` = la compañía no la ha informado. */
  /** `anual` es la prima NETA (`polizas.prima_anual`); `bruta` es lo que el cliente paga de verdad
   *  (`prima_bruta`: neta + impuestos y recargos, y coincide con `prima_total` del recibo). Medido el
   *  03/09/2026 en la 548238086: anual 67,86€, bruta 73,39€, recibo 73,39€. Enseñar solo la neta al
   *  lado de un recibo mayor parece un error de cuentas. */
  /** 🚨 `dudosa: true` = CIMA marcó `primaAnualDudosa` (póliza fraccionada cuya compañía manda el
   *  importe del PERIODO): `anual`/`bruta`/`mensual` llegan a `null` A PROPÓSITO aunque la BD guarde
   *  un número, para que ninguna pantalla lo presente como prima anual. */
  prima: { anual: number | null; bruta: number | null; mensual: number | null; fraccionamiento: string | null; dudosa?: boolean } | null
  /**
   * Lo que CIMA guarda en `datos_especificos` y sirve al cliente (cobro, cuenta
   * `•••• 1234`, producto, riesgos), ya filtrado por nivel y por LISTA BLANCA en
   * `lib/datos-poliza-cima.ts`. El JSONB crudo no viaja nunca en este tipo: trae
   * el `iban` cifrado y las comisiones del corredor.
   */
  datosCompania: DatosPolizaCima
  /**
   * `total: 0` = ninguna cobertura informada. `null` = no visible en este nivel.
   *
   * 🚨 `lista` va ENTERA, sin recortar (07/09/2026, dictado de Alberto: «que el
   * cliente vea todas las coberturas que tiene»). Antes se cortaba a 4 aquí, en
   * la lectura, y la ficha —el único sitio que la pinta— remataba con «y 6 más»:
   * las coberturas que el cliente paga y no sabe que tiene no las veía nadie.
   * Cuántas caben en pantalla es cosa de quien pinta, no de quien lee.
   *
   * `total > lista.length` significa que hay coberturas informadas SIN
   * descripción ni código (la fila existe, el texto no): no es que se hayan
   * escondido.
   */
  coberturas: {
    total: number
    lista: string[]
    /** Capital de cada cobertura, alineado con `lista`; `null` = no informado. */
    capitales?: (number | 'ilimitado' | null)[]
    /**
     * Capital (con «sin capital propio» / «ilimitado»), franquicia y vigencia propia de cada
     * cobertura, alineado con `lista` (`vistaCobertura`). Cada campo `null` = no se pinta.
     */
    detalle?: CoberturaVista[]
  } | null
  /** `null` = no visible en este nivel. */
  recibos: RecibosPortal | null
  /** `null` = no visible en este nivel. `[]` = no hay ninguno abierto. */
  siniestrosAbiertos: SiniestroPortal[] | null
  /**
   * El HISTORIAL entero (los cuatro estados), del más reciente al más antiguo y
   * con lo que no tiene fecha al final.
   *
   * `null` = no visible en este nivel — el MISMO permiso que los abiertos
   * (`ve.siniestros`), porque un siniestro cerrado sigue siendo un hecho de la
   * vida de su dueño, no un dato del contrato: si acaso es MÁS personal, porque
   * es un historial. `[]` = **no nos consta ninguno**, que no es «no has tenido
   * ninguno»: la compañía los informa por EIAC y puede no haberlo hecho.
   */
  siniestros: SiniestroPortal[] | null
  /**
   * QUÉ está asegurado. `cosa` (marca/modelo/matrícula) es dato del CONTRATO y
   * se ve desde el nivel más bajo; `ubicacion` (la dirección del inmueble) es
   * dato de la PERSONA y un tercero no la ve nunca si quien cede es física.
   * En los dos, `null` = **no informado o no visible**, jamás «no tiene»: la
   * pantalla no pinta nada, que es la regla de visibilidad del portal.
   */
  bien: BienAsegurado & {
    /**
     * `true` = la fila (o su gemela) TRAE la dirección pero llega cifrada y
     * aquí no se ha podido abrir (sin `PII_ENCRYPTION_KEY` o con otra). Es
     * un «no lo puedo leer», no un «no la hay»: la ficha no dice entonces
     * que la compañía no la ha comunicado.
     */
    ubicacionCifrada: boolean
  }
}

export type TitularPortal = {
  clienteId: string
  nombre: string
  /**
   * Persona física o jurídica, para decidir en qué bloque de la bóveda se
   * pinta (`agruparCartera` de `@central/module-seguros-portal`).
   *
   * ⚠️ El `NULL` de la BD ya viene colapsado a `fisica` — el mismo lado
   * restrictivo con el que se deciden los alcances, y una sola fuente para los
   * dos usos. Consecuencia buscada: una ficha de tipo desconocido cae en «Tus
   * seguros», no en «Seguros de tus empresas»; inventarle una sociedad a
   * alguien sí se vería, y sería falso.
   */
  tipoPersona: TipoOtorgante
  /**
   * Etiqueta para pintar («ve la tarjeta» / «ve también lo económico»). Lo que
   * DE VERDAD se ha servido son los campos que trae cada `PolizaPortal`; esto
   * no decide nada. En `autorizadas` sale de `etiquetaNivelAlcances`, que va
   * capada, así que decir `completo` aquí NO significa que se haya enseñado el
   * IBAN — no se enseña nunca.
   */
  nivel: Nivel
  /** Presente SOLO en `autorizadas`: de qué consentimiento viene y hasta cuándo. */
  autorizacion?: {
    ids: string[]
    alcances: Alcance[]
    /** `null` = no caduca (las concedidas desde el 25/09/2026). */
    caducaEn: Date | null
    /**
     * Pólizas sobre las que esta identidad puede DAR UN PARTE (`puedeDarParte`).
     * Por póliza y no por ficha: una concesión suelta con `partes` abre esa póliza,
     * no las demás de quien la dio. Ver no basta para declarar.
     */
    partes: string[]
    /** `'dueno'` = no es una autorización: es su EMPRESA (relación `Dueño`). No se «deja de ver». */
    via?: 'dueno'
  }
  /**
   * Presente SOLO en `intervinientes`: la identidad FIGURA en estas pólizas del
   * tomador (propietaria, conductora…) sin ser su tomadora. `roles` es la unión
   * para la cabecera; `rolesPorPoliza` lo que dice la ficha de cada una.
   */
  interviniente?: {
    roles: string[]
    rolesPorPoliza: Record<string, string[]>
  }
  polizas: PolizaPortal[]
  /**
   * Presente SOLO en `autorizadas` de ficha entera: ids de pólizas PROPIAS de quien mira
   * donde esta ficha figura como interviniente y que por eso no se repiten en su bloque
   * (ya se sirven en `propias`). Solo para el aviso «Figura en N póliza(s) que ya está(n)
   * en las tuyas»; sin roles ni datos nuevos. `undefined` = ninguna.
   */
  figuraEnTusPolizas?: string[]
  /**
   * Presente SOLO en `autorizadas` abiertas ENTERAS por consentimiento: las que
   * el titular añadió en su portal (`identidadesTitulares`). `undefined` = esta
   * vía no aplica (propias, dueño, concesión suelta); `[]` = se miró y no hay.
   */
  declaradas?: DeclaradaDeTitular[]
}

/**
 * Cómo salió el último intento de vincular esta identidad con una ficha, leído
 * de `portal_identidad.ultimo_vinculo`.
 *
 * 🚨 `null` = **no consta** (nunca se intentó, o el sello falló), y NO es
 * `sin_ficha`. Son la misma pantalla vacía y dos frases distintas: una dice
 * «no eres cliente» y la otra no puede decir nada.
 */
export type VinculoPortal = 'ok' | 'ya_vinculada' | 'sin_ficha' | 'ambiguo' | 'sin_clave' | 'error'

const VINCULOS: readonly string[] = ['ok', 'ya_vinculada', 'sin_ficha', 'ambiguo', 'sin_clave', 'error']

/**
 * La columna es `text` con un CHECK en la BD, pero un despliegue viejo o una
 * escritura por otro camino pueden dejar cualquier cosa: lo que no se reconoce
 * es «no se sabe», nunca el estado que menos molesta de pintar.
 */
function leerVinculo(v: string | null): VinculoPortal | null {
  return v !== null && VINCULOS.includes(v) ? (v as VinculoPortal) : null
}

export type CarteraPortal = {
  vinculada: boolean
  /**
   * El resultado del último intento de vínculo. Lo usa la bóveda para no
   * decirle «no hemos encontrado ninguna póliza» a alguien cuyo correo SÍ
   * encontramos en dos fichas. `null` = no consta.
   */
  vinculo: VinculoPortal | null
  /** Nombre de la correduría del vínculo (única columna legible de `corredurias`). */
  correduria: string | null
  /** Fichas de la propia identidad, con el nivel de su vínculo. */
  propias: TitularPortal[]
  /** Fichas de OTROS que han autorizado a ver sus pólizas (`portal_autorizacion`). */
  autorizadas: TitularPortal[]
  /**
   * Pólizas de OTROS tomadores donde una ficha PROPIA de la identidad figura
   * como interviniente (`poliza_intervinientes`), agrupadas por tomador. SOLO
   * esas pólizas, nunca las demás del tomador. Decisión de Alberto, 27/09/2026:
   * quien figura en una póliza la ve como su tomador y puede dar parte de ella.
   */
  intervinientes: TitularPortal[]
  /**
   * Las autorizaciones que esta lectura ha USADO de verdad, para que el
   * llamante lo anote en el registro de accesos que ve el otorgante
   * (`registrarUso` de `lib/autorizaciones`). Vacío = no se abrió nada ajeno.
   *
   * Va aquí y no se escribe dentro de esta función a propósito: leer no
   * escribe. Quien pinta la bóveda decide si registra.
   */
  autorizacionesUsadas: string[]
}

// 🚨 Constante COMPARTIDA entre todas las llamadas: `vinculo` va a `null` aquí
// y el valor real se esparce en el `return` (`{ ...SIN_VINCULO, vinculo }`).
// Rellenarlo aquí dentro filtraría el motivo de una identidad a la siguiente.
const SIN_VINCULO: CarteraPortal = {
  vinculada: false,
  vinculo: null,
  correduria: null,
  propias: [],
  autorizadas: [],
  intervinientes: [],
  autorizacionesUsadas: [],
}

/** `nivel` es `text` en la BD (CHECK). Un valor fuera del vocabulario cae al nivel MÁS bajo. */
function nivelDeVinculo(v: string): Nivel {
  return (NIVELES as readonly string[]).includes(v) ? (v as Nivel) : 'tarjeta'
}

/**
 * La cartera para PINTAR la lista (bóveda, hoja QR): sin las pólizas ya sustituidas. Los permisos
 * (partes, ficha, recordatorios) usan la cartera entera, nunca esta.
 */
export function carteraALaVista(c: CarteraPortal, opciones: { soloSiYaCubre?: boolean } = {}, hoy: Date = new Date()): CarteraPortal {
  // 🚨 `soloSiYaCubre` (hoja QR): la que se enseña tras un accidente es la que cubre HOY. Mientras la
  // sustituta no ha empezado, la vieja se queda. La bóveda, en cambio, la retira ya (una sola fila).
  const aunCubre = (p: PolizaPortal) => opciones.soloSiYaCubre === true && p.sustituidaPor?.desde != null && p.sustituidaPor.desde > hoy
  const quitar = (ts: TitularPortal[]) =>
    ts.map((t) => ({ ...t, polizas: t.polizas.filter((p) => p.sustituidaPor === null || aunCubre(p)) }))
  return { ...c, propias: quitar(c.propias), autorizadas: quitar(c.autorizadas), intervinientes: quitar(c.intervinientes) }
}

export async function carteraDeSesion(): Promise<CarteraPortal | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return carteraDeIdentidad(identidad.id)
}

/**
 * La clave con la que se empareja una póliza con su GEMELA duplicada.
 *
 * Los CUATRO campos van juntos y ninguno sobra: `clienteId` para que el
 * emparejamiento no pueda cruzar dos fichas, `numeroPoliza` porque es lo que
 * identifica el contrato, `tipo` porque el mismo número puede repetirse entre
 * ramos, y `fechaInicio` porque **la compañía REUTILIZA el número al renovar**.
 *
 * 🚨 La fecha no es cinturón y tirantes: medido el 07/09/2026, la póliza
 * `0732200153700` tiene DOS gemelas del mismo cliente con direcciones DISTINTAS
 * (41011 con efecto 2016 y 41001 con efecto 2022). Sin la fecha, cuál gana
 * depende del orden de la consulta, y el resultado sería la dirección de otra
 * casa: plausible, sin error y equivocada — exactamente el fallo que la regla de
 * «agrupar por identidad, nunca por la etiqueta» persigue. Con la fecha, 10 de
 * las 11 huérfanas se emparejan y la ambigua se queda sin dirección, que es la
 * respuesta correcta.
 *
 * Sin número no hay identidad que emparejar: `null`, y esa póliza no busca
 * gemela. Emparejar «todo lo que no tenga número» juntaría contratos distintos.
 */
function claveGemela(
  clienteId: string,
  numeroPoliza: string | null,
  tipo: string | null,
  fechaInicio: Date | null,
): string | null {
  if (numeroPoliza === null || numeroPoliza.trim() === '') return null
  return `${clienteId}|${numeroPoliza.trim()}|${tipo ?? ''}|${fechaInicio?.toISOString() ?? ''}`
}

/**
 * La dirección del riesgo viaja CIFRADA dentro de `datos_especificos`
 * (`v1:iv:cipher:tag`, `@central/module-seguros-pii`). Se descifra aquí, que es
 * donde se lee la BD: el módulo puro que describe el bien no sabe de claves.
 *
 * 🔑 Con `PII_ENCRYPTION_KEY` puesta en el Vercel de `asegura-portal` sale la
 * calle en claro. **SIN ella `decryptField` devuelve el sobre tal cual**, y
 * entonces `describirBien` lo anula (ver su `campo()`): la fila cae a
 * «compañía · ramo», que es lo que se veía antes. O sea que la app no se rompe
 * sin la clave — simplemente no enseña la dirección, y eso NO se nota en ningún
 * log. Es el mismo despiste que dejó `central-asegura` muerta en silencio el
 * 02/09/2026: la clave y el despliegue van en el mismo paso.
 *
 * El `catch` deja el valor intacto en vez de borrarlo, por la misma razón: un
 * fallo de descifrado tiene que acabar en el cepo de `campo()`, no en un hueco
 * indistinguible de «la compañía no lo ha informado».
 */
/** ¿Queda un sobre `v1:` SIN abrir tras intentar descifrar? Entonces la dirección
 *  EXISTE y solo no se puede leer aquí: la ficha no puede afirmar que falta. */
function direccionSigueCifrada(datos: unknown): boolean {
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) return false
  const d = (datos as Record<string, unknown>).direccion
  return typeof d === 'string' && d.startsWith('v1:')
}

function descifrarDireccion(datos: unknown): unknown {
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) return datos
  const d = datos as Record<string, unknown>
  if (typeof d.direccion !== 'string' || !d.direccion.startsWith('v1:')) return datos
  try {
    return { ...d, direccion: decryptField(d.direccion) }
  } catch {
    return datos
  }
}

export async function carteraDeIdentidad(identidadId: string): Promise<CarteraPortal> {
  // Cómo salió el último intento de vínculo. Se LEE, no se recalcula: aquí no
  // existe el correo en claro (`portal_canal` guarda un hash con pimienta
  // propia, que no sirve para el índice ciego y no se revierte), así que el
  // único sitio donde se supo es el canje del código y de ahí viene sellado.
  const identidad = await prisma.portalIdentidad.findUnique({
    where: { id: identidadId },
    select: { ultimoVinculo: true },
  })
  const vinculo = leerVinculo(identidad?.ultimoVinculo ?? null)

  // El filtro por identidadId es la única frontera entre una bóveda y otra.
  const vinculos = await prisma.portalVinculo.findMany({
    where: { identidadId },
    select: { clienteId: true, correduriaId: true, nivel: true },
    orderBy: { creadoEn: 'asc' },
  })

  const propiosIds = vinculos.map((v) => v.clienteId)
  const nivelPorCliente = new Map(vinculos.map((v) => [v.clienteId, nivelDeVinculo(v.nivel)]))

  // ── Las EMPRESAS de las que es DUEÑO (25/09/2026) ─────────────────────────
  // Decisión de Alberto: el dueño ve su empresa entera sin que nadie lo active. Se DERIVA de la
  // relación `Dueño` en cada lectura (ver `empresasDelDueno` del módulo): no se escribe ninguna fila,
  // así que borrar la relación lo corta en la siguiente visita. Solo desde fichas con nivel para
  // gestionar o administrar — el mismo umbral que para autorizar, dentro de `empresasDeFichas`.
  const representadasIds = (await empresasDeFichas(vinculos)).filter((id) => !propiosIds.includes(id))

  // ── Lo AJENO: quién me ha autorizado ──────────────────────────────────────
  //
  // 🚨 Hasta el 03/09/2026 esto salía de `cliente_relaciones.puede_ver_polizas`,
  // un booleano del CRM sin autor, sin fecha y sin revocación. Las 104 filas que
  // lo tenían a `true` se crearon TODAS el día del volcado (21/06/2026): nadie
  // las otorgó. Se apagaron, y al rol de esta app se le quitó el permiso de leer
  // esa columna — así que aunque alguien reescriba esto, no puede volver.
  //
  // Se traen las NO revocadas y la vigencia la decide `autorizacionVigente`, en
  // el módulo puro: una sola fuente para la regla, en vez de repetirla en el
  // WHERE y otra vez en la UI (que es como se desincronizan).
  //
  // 🚨 Y me alcanzan por DOS caminos, no por uno: por una FICHA mía (soy cliente
  // de la correduría) o por mi IDENTIDAD (no lo soy, y me invitaron). El segundo
  // brazo se añadió el 04/09/2026 con `autorizado_identidad_id`: sin él, el
  // hijo que no es cliente de nadie tenía su autorización en la BD y la bóveda
  // ni la miraba — no fallaba, salía vacía.
  const filasAutorizacion = await prisma.portalAutorizacion.findMany({
    where: {
      revocadoEn: null,
      OR: [
        { autorizadoIdentidadId: identidadId },
        ...(propiosIds.length > 0 ? [{ autorizadoClienteId: { in: propiosIds } }] : []),
      ],
    },
    select: {
      id: true,
      correduriaId: true,
      otorganteClienteId: true,
      polizaId: true,
      alcance: true,
      aceptadoEn: true,
      caducaEn: true,
      revocadoEn: true,
    },
  })

  // 🚨 El corte de «aquí no hay nada» se decide con LAS DOS listas. Hasta el
  // 04/09/2026 bastaba con no tener vínculo para devolver `SIN_VINCULO`, y eso
  // dejaba fuera justo a quien el producto quiere dentro: el invitado.
  // 🚨 El corte de «aquí no hay nada» conserva el MOTIVO. Se parte de la
  // constante COMPARTIDA y se le esparce el vínculo de ESTA identidad, en una
  // local con nombre: `SIN_VINCULO` no puede llevar el motivo dentro (lo
  // filtraría de una identidad a la siguiente), y la bóveda sí lo necesita para
  // no decirle «no hemos encontrado ninguna póliza» a quien tiene dos fichas.
  const SIN_VINCULO_DE_ESTA_IDENTIDAD: CarteraPortal = { ...SIN_VINCULO, vinculo }
  if (vinculos.length === 0 && filasAutorizacion.length === 0) return SIN_VINCULO_DE_ESTA_IDENTIDAD

  // La correduría sale del vínculo si lo hay y, si no, de la autorización que
  // me deja entrar: un invitado sin ficha también tiene que ver de quién es la
  // pantalla en la que está.
  const correduriaId = vinculos[0]?.correduriaId ?? filasAutorizacion[0]?.correduriaId ?? null
  const correduria =
    correduriaId === null
      ? null
      : await prisma.correduria.findUnique({ where: { id: correduriaId }, select: { nombre: true } })

  const ahora = new Date()
  /** Lo que abre una autorización: qué filas, con qué alcances y hasta cuándo. */
  type Concesion = { ids: string[]; alcances: Alcance[]; caducaEn: Date | null }
  const acumular = (m: Map<string, Concesion>, clave: string, id: string, alcance: Alcance, caducaEn: Date | null) => {
    const g = m.get(clave)
    if (g) {
      g.ids.push(id)
      g.alcances.push(alcance)
      // Se ve hasta que caduque la ÚLTIMA que sigue abriéndolo.
      g.caducaEn = caducaMasTarde(g.caducaEn, caducaEn)
    } else {
      m.set(clave, { ids: [id], alcances: [alcance], caducaEn })
    }
  }

  // Dos vocabularios distintos y no intercambiables: `porOtorgante` son las
  // autorizaciones sobre la ficha ENTERA (`poliza_id IS NULL`, que es lo que
  // significaban todas las filas antes de esa columna, futuras incluidas), y
  // `porPoliza` las que abren UNA sola. Los alcances de las dos SE SUMAN sobre
  // esa póliza: quien te deja ver todo y además lo económico de la del coche ve
  // lo económico de esa y solo de esa.
  const porOtorgante = new Map<string, Concesion>()
  const porPoliza = new Map<string, Concesion>()
  /** Qué ficha concedió cada póliza suelta, para no servirla bajo otro titular. */
  const otorganteDePoliza = new Map<string, string>()
  const vigentes: typeof filasAutorizacion = []
  for (const f of filasAutorizacion) {
    // Un alcance que la BD tiene y el módulo no conoce NO abre nada: se ignora.
    // (Al revés que un `?? 'ver'`, que convertiría un valor desconocido en acceso.)
    if (!esAlcance(f.alcance)) continue
    if (!autorizacionVigente(f, ahora)) continue
    if (propiosIds.includes(f.otorganteClienteId)) continue
    // Si además es dueño, gana el acceso de dueño y la empresa no sale dos veces.
    if (representadasIds.includes(f.otorganteClienteId)) continue
    vigentes.push(f)
  }

  // 🚨 Una póliza FUSIONADA deja la autorización apuntando a una fila muerta (5
  // fusionadas hoy, no es teórico) y el autorizado perdería el acceso SIN QUE
  // NADIE SE ENTERE: no falla, deja de funcionar. Se sigue un salto de
  // `merged_into_poliza_id`. Si la fusión se llevó la póliza a OTRA ficha, la
  // póliza ya no es del otorgante y no se sirve: quien la cedió cedió la suya.
  const idsConcedidos = [...new Set(vigentes.map((f) => f.polizaId).filter((x): x is string => x !== null))]
  const trasFusion = new Map<string, string>()
  if (idsConcedidos.length > 0) {
    const filas = await prisma.poliza.findMany({
      where: { id: { in: idsConcedidos } },
      select: { id: true, mergedIntoPolizaId: true },
    })
    for (const f of filas) trasFusion.set(f.id, f.mergedIntoPolizaId ?? f.id)
  }

  for (const f of vigentes) {
    if (!esAlcance(f.alcance)) continue
    if (f.polizaId === null) {
      acumular(porOtorgante, f.otorganteClienteId, f.id, f.alcance, f.caducaEn)
    } else {
      // Una concedida que ya no existe en la cartera no abre nada, y tampoco se
      // inventa: sin fila no hay destino y se cae fuera.
      const destino = trasFusion.get(f.polizaId)
      if (destino === undefined) continue
      acumular(porPoliza, destino, f.id, f.alcance, f.caducaEn)
      otorganteDePoliza.set(destino, f.otorganteClienteId)
    }
  }
  const autorizadosIds = [...new Set([...porOtorgante.keys(), ...otorganteDePoliza.values()])]

  // ── Pólizas AJENAS donde FIGURA (27/09/2026) ──────────────────────────────
  //
  // Decisión de Alberto: quien figura como interviniente en una póliza
  // (propietario del coche, conductor, asegurado…) la ve como su tomador y puede
  // dar parte. Caso fundacional: Nieves, propietaria del Toyota cuya póliza es
  // de Víctor, no la veía.
  //
  // 🔒 La frontera es la MISMA que la de las propias: solo se buscan filas cuyo
  // `cliente_id` es una ficha de `portal_vinculo` de ESTA identidad
  // (`propiosIds`). Y se traen solo ESAS pólizas por id —nunca «las del tomador»
  // por `cliente_id`—, así que las demás del tomador ni se leen. El cepo
  // `test/regression-portal-intervinientes.test.ts` falla si este `where` deja
  // de nombrar `propiosIds`.
  const filasInterviniente =
    propiosIds.length === 0
      ? []
      : await prisma.polizaInterviniente.findMany({
          where: { clienteId: { in: propiosIds } },
          select: { polizaId: true, clienteId: true, rol: true },
        })
  const polizasDondeFigura =
    filasInterviniente.length === 0
      ? []
      : await prisma.poliza.findMany({
          where: {
            AND: [
              {
                id: { in: [...new Set(filasInterviniente.map((f) => f.polizaId))] },
                clienteId: { notIn: propiosIds },
                mergedIntoPolizaId: null,
              },
              WHERE_CARTERA_VIVA,
            ],
          },
          select: { id: true, clienteId: true },
        })
  const idsDondeFigura = polizasDondeFigura.map((p) => p.id)
  const tomadoresIds = [...new Set(polizasDondeFigura.map((p) => p.clienteId))]

  // ── Pólizas de otro tomador donde figura una ficha que ve ENTERA (28/09/2026) ──
  // Quien ve una ficha entera (autorización sin póliza suelta, o empresa del
  // dueño) ve también las pólizas donde ESA ficha figura: la furgoneta de GLOBAL 2
  // cuyo tomador es su conductor. 🔒 Misma frontera que arriba: las filas se
  // buscan SOLO por esas fichas y las pólizas SOLO por id — nunca «las del
  // tomador». La regla vive pura en `figurasDeFichasVistas`.
  const fichasVistasEnteras = [...porOtorgante.keys(), ...representadasIds].filter((id) => !propiosIds.includes(id))
  const filasFiguraAjena =
    fichasVistasEnteras.length === 0
      ? []
      : await prisma.polizaInterviniente.findMany({
          where: { clienteId: { in: fichasVistasEnteras } },
          select: { polizaId: true, clienteId: true, rol: true },
        })
  // Solo las fichas que se ven ENTERAS: un otorgante que concedió UNA póliza suelta no «sirve» sus
  // demás pólizas, así que excluirlo aquí haría desaparecer la furgoneta de todas partes.
  const tomadoresYaServidos = [...propiosIds, ...porOtorgante.keys(), ...representadasIds]
  const polizasFiguraAjena =
    filasFiguraAjena.length === 0
      ? []
      : await prisma.poliza.findMany({
          where: {
            AND: [
              {
                id: { in: [...new Set(filasFiguraAjena.map((f) => f.polizaId))] },
                clienteId: { notIn: tomadoresYaServidos },
                mergedIntoPolizaId: null,
              },
              WHERE_CARTERA_VIVA,
            ],
          },
          select: { id: true, clienteId: true },
        })
  const figuraAjena = figurasDeFichasVistas({
    filas: filasFiguraAjena,
    polizas: polizasFiguraAjena,
    fichasVistas: fichasVistasEnteras,
    tomadoresYaServidos,
  })
  const idsFiguraAjena = [...figuraAjena.values()].flatMap((m) => [...m.keys()])
  const tomadoresFiguraAjena = [
    ...new Set(polizasFiguraAjena.filter((p) => idsFiguraAjena.includes(p.id)).map((p) => p.clienteId)),
  ]

  const todosIds = [...propiosIds, ...autorizadosIds, ...representadasIds]
  const [clientes, polizas] = await Promise.all([
    prisma.cliente.findMany({
      // Los tomadores de las pólizas donde figura entran SOLO aquí (su nombre y
      // su tipo), no en el `clienteId: { in }` de las pólizas de abajo.
      where: { id: { in: [...todosIds, ...tomadoresIds, ...tomadoresFiguraAjena] }, mergedIntoClienteId: null },
      // `tipoPersona` decide QUÉ se sirve de una ficha ajena: una sociedad no
      // tiene datos personales, así que quien la representa ve su CIF y su
      // cuenta y puede actuar por ella. Sin este campo, la bóveda serviría una
      // autorización de empresa con el tope de una persona: caería del lado
      // seguro, pero un `partes` concedido no se honraría y parecería un bug.
      select: { id: true, nombre: true, apellidos: true, tipoPersona: true },
    }),
    prisma.poliza.findMany({
      // `WHERE_CARTERA_VIVA` va DENTRO del `AND`: es un `OR` de dos brazos y
      // dejarlo suelto al lado del resto mezclaría las ramas (devolvería
      // pólizas de otros clientes con `import_ref IS NULL`).
      // Las de un tomador ajeno donde figura entran por ID, nunca por su ficha.
      where: {
        AND: [
          {
            OR: [{ clienteId: { in: todosIds } }, { id: { in: [...idsDondeFigura, ...idsFiguraAjena] } }],
            mergedIntoPolizaId: null,
          },
          WHERE_CARTERA_VIVA,
        ],
      },
      orderBy: [{ fechaVencimiento: 'desc' }, { createdAt: 'desc' }],
    }),
  ])

  // A quién sustituye cada póliza: solo cuenta si la vieja está marcada `sustituida_at` (un
  // `poliza_origen_id` suelto es una referencia, no una sustitución).
  const sustituidas = new Set(polizas.filter((p) => p.sustituidaAt != null).map((p) => p.id))
  const polizaIds = polizas.map((p) => p.id)

  // ── Las GEMELAS del volcado ───────────────────────────────────────────────
  //
  // 🚨 En la cartera hay pólizas DUPLICADAS: la misma entró dos veces —una por
  // el volcado del CRM (`import_ref`, con `datos_especificos` completos) y otra
  // por CIMA (`eiac_xml_hash`, con las fechas al día pero SIN
  // `datos_especificos`)— porque el nombre de la aseguradora no coincidía y la
  // ingesta no las emparejó. `WHERE_CARTERA_VIVA` sirve la de CIMA, que es la
  // buena en todo menos en el único campo que dice QUÉ CASA es. Medido el
  // 07/09/2026: le pasa a **11 de las 19 hogar vivas**, y por eso Alberto veía
  // dos «Occident · Hogar» idénticas.
  //
  // Se lee solo para las que no traen nada, y solo del MISMO cliente: la clave
  // de emparejamiento lleva `clienteId` dentro, así que el `in` cruzado de la
  // consulta no puede colar la póliza de otro. Quién puede ver luego la calle
  // sigue decidiéndolo `ve.direccionRiesgo`, igual que antes.
  //
  // Esto NO arregla el duplicado: lo tapa para que el dato deje de estar
  // escondido. El duplicado se arregla en la ingesta.
  // «Huérfana» = no describe ningún bien, NO «datos NULL»: desde el 24/09/2026
  // CIMA escribe también suplementos, anulación u «otros datos», y una póliza
  // con solo eso en `datos_especificos` dejaba de buscar su gemela y perdía la
  // dirección que venía de ella (7 hogares medidos ese día).
  const huerfanas = polizas.filter(
    (p) => p.numeroPoliza !== null && !bienTieneAlgo(describirBien(p.tipo, descifrarDireccion(p.datosEspecificos))),
  )
  const gemelas =
    huerfanas.length === 0
      ? []
      : await prisma.poliza.findMany({
          where: {
            clienteId: { in: [...new Set(huerfanas.map((p) => p.clienteId))] },
            numeroPoliza: { in: [...new Set(huerfanas.map((p) => p.numeroPoliza as string))] },
            id: { notIn: polizaIds },
            mergedIntoPolizaId: null,
          },
          select: {
            clienteId: true,
            numeroPoliza: true,
            tipo: true,
            fechaInicio: true,
            datosEspecificos: true,
          },
        })
  //
  // 🚨 Y si DOS gemelas caen en la misma clave, no gana ninguna: se marca la
  // clave como ambigua y esa póliza se queda sin dirección. Quedarse con «la
  // última» sería elegir por el orden de la consulta, y equivocarse aquí no
  // produce un hueco visible sino la dirección de OTRA casa.
  const datosDeGemela = new Map<string, unknown>()
  const ambiguas = new Set<string>()
  for (const g of gemelas) {
    if (g.datosEspecificos == null) continue
    const clave = claveGemela(g.clienteId, g.numeroPoliza, g.tipo, g.fechaInicio)
    if (clave === null) continue
    if (datosDeGemela.has(clave)) {
      ambiguas.add(clave)
      continue
    }
    datosDeGemela.set(clave, g.datosEspecificos)
  }
  for (const clave of ambiguas) datosDeGemela.delete(clave)

  /** Los `datos_especificos` de la gemela de esta póliza, si hay UNA sola. */
  const gemelaDe = (p: { clienteId: string; numeroPoliza: string | null; tipo: string; fechaInicio: Date | null }) => {
    const clave = claveGemela(p.clienteId, p.numeroPoliza, p.tipo, p.fechaInicio)
    return clave === null ? undefined : datosDeGemela.get(clave)
  }
  const [coberturas, recibos, siniestros] =
    polizaIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          prisma.polizaCobertura.findMany({
            where: { polizaId: { in: polizaIds } },
            select: {
              polizaId: true, descripcion: true, codigo: true, numeroOrden: true, capitalAsegurado: true,
              franquicia: true, fechaInicio: true, fechaFin: true,
              // Solo para leer el LÍMITE por siniestro (`capitalDeCobertura`); la prima y demás NO salen de la lectura.
              datosExtra: true,
            },
            orderBy: { numeroOrden: 'asc' },
          }),
          prisma.polizaRecibo.findMany({
            where: { polizaId: { in: polizaIds } },
            select: {
              polizaId: true,
              situacion: true,
              primaTotal: true,
              fechaEmision: true,
              fechaVencimiento: true,
              // Para saber si un devuelto de una póliza sustituida es de un periodo que ya no es suyo.
              fechaEfectoActual: true,
              // CA/NP: el recibo de anualidad. Allianz manda la prima y la
              // renovación SOLO ahí (27/09/2026). Tiene GRANT desde el 02/09.
              claseRecibo: true,
              // Para «cobrado el…». Tiene GRANT desde el 02/09. NUNCA comisiones ni prima neta aquí.
              fechaSituacion: true,
              // 🚨 `formaPago` NO se pide: es un código del EIAC (`CC`/`OF`/`TA`).
              // Ver la cabecera de `ReciboPortal`.
            },
            // El orden REAL se hace en código (`ordenarRecibos`): aquí un `desc`
            // implicaría `NULLS FIRST` y subiría arriba lo que no tiene fecha.
            orderBy: { fechaEmision: 'desc' },
          }),
          prisma.siniestro.findMany({
            // 🚨 Sin filtro de estado, y es el cambio (05/09/2026): antes decía
            // `estado IN ('abierto','en_tramitacion')`, así que de los 67
            // siniestros de la cartera viva el portal enseñaba 7 y los 60
            // CERRADOS no los veía nadie. El historial es lo que un cliente
            // pregunta al renovar.
            // Sin las altas manuales ya FUSIONADAS en el siniestro de CIMA (03/10/2026):
            // son el mismo siniestro y el cliente lo vería dos veces.
            where: { polizaId: { in: polizaIds }, fusionadoEnSiniestroId: null },
            select: {
              id: true,
              polizaId: true,
              estado: true,
              referencia: true,
              fechaHora: true,
              // QUÉ pasó y DÓNDE. `comentario` tiene GRANT desde el 07/09/2026;
              // las tres de lugar lo tenían desde los grants del 02/09 y
              // sencillamente no se pedían. `lugar_direccion` sigue SIN grant a
              // propósito: es la casa de alguien.
              comentario: true,
              lugarCiudad: true,
              lugarProvincia: true,
              // `tipo` es un CÓDIGO de la compañía (`1107`, `1915`…). Se pide
              // desde el 24/09/2026 porque ya se traduce con la tabla oficial de
              // TIREA (`tipoSiniestroLegible`); el código crudo no sale de aquí.
              tipo: true,
              // La tramitación que manda la compañía (GRANT por columnas del
              // 24/09/2026). `reserva_cima` y `posicion_cima` NO: ni tienen
              // grant ni son del cliente.
              situacionesCima: true,
              accionesCima: true,
              pagosCima: true,
              indemnizacionCima: true,
              totalPagosCima: true,
              // Todo el siniestro (28/09/2026, «el seguro es suyo»): se traduce
              // en `detalleSiniestroCompania`, que descarta lo cifrado (`v1:`).
              fechaDeclaracion: true,
              posicionCima: true,
              responsabilidadCima: true,
              daaCima: true,
              reservaCima: true,
              reservaDesgloseCima: true,
              totalRecobrosCima: true,
              expedientesCima: true,
              riesgoCima: true,
              vehiculoCima: true,
              vehiculoContrarioCima: true,
              asistenciasCima: true,
              descripcionCima: true,
              tramitadorNombre: true,
              tramitadorTelefono: true,
              tramitadorEmail: true,
              peritoNombre: true,
              peritoTelefono: true,
              peritoEmail: true,
              // No hay hay columna con la fecha de CIERRE: `updated_at` es la
              // última vez que se tocó la fila, no el día que se cerró, y
              // pintarlo como tal sería inventarse una fecha.
            },
            orderBy: { fechaHora: 'desc' },
          }),
        ])

  const agrupar = <T extends { polizaId: string }>(lista: T[]) => {
    const m = new Map<string, T[]>()
    for (const x of lista) {
      const g = m.get(x.polizaId)
      if (g) g.push(x)
      else m.set(x.polizaId, [x])
    }
    return m
  }
  const coberturasPor = agrupar(coberturas)
  const recibosPor = agrupar(recibos)
  const siniestrosPor = agrupar(siniestros)
  const hoy = new Date()

  const aPortal = (p: (typeof polizas)[number], ve: CamposVisibles): PolizaPortal => {
    const cobs = coberturasPor.get(p.id) ?? []
    const recs = recibosPor.get(p.id) ?? []
    // Código de cobertura de ESTA póliza → nombre (la reserva de un siniestro llega por código).
    const nombresPorCodigo: Record<string, string> = {}
    for (const c of cobs) {
      const n = nombreCobertura((c.descripcion ?? '').trim())
      const k = normalizarCodigoCoberturaNumerico(c.codigo ?? '')
      if (k !== null && n !== '') nombresPorCodigo[k] = n
    }
    // Allianz no manda prima en la póliza ni avanza su vencimiento al renovar:
    // solo el recibo anual (27/09/2026). Los recibos son los de ESTA póliza,
    // ya leídos arriba bajo el mismo `polizaIds` autorizado: no se amplía nada.
    const recsVig: ReciboVigencia[] = recs.map((r) => ({
      claseRecibo: r.claseRecibo ?? null,
      situacion: r.situacion === null ? null : String(r.situacion),
      primaTotal: r.primaTotal,
      fechaVencimiento: r.fechaVencimiento ? r.fechaVencimiento.toISOString() : null,
    }))
    const hoyIso = hoy.toISOString()
    const vencIso = vencimientoConRecibos(p.fechaVencimiento ? p.fechaVencimiento.toISOString() : null, recsVig, hoyIso)
    const fechaVencimiento =
      vencIso === null ? null : p.fechaVencimiento && vencIso === p.fechaVencimiento.toISOString() ? p.fechaVencimiento : new Date(`${vencIso.slice(0, 10)}T00:00:00Z`)
    // 🚨 Prima DUDOSA (CIMA, 28/09/2026): la compañía manda el importe del periodo y no la
    // anual. Lo que haya en `prima_anual`/`prima_bruta` no se presenta como anual en ninguna
    // pantalla: se anula AQUÍ, en la fuente única, y no en cada consumidor.
    const dudosa = primaAnualDudosa(p.datosEspecificos)
    const primaAnual = dudosa || p.primaAnual === null ? null : Number(p.primaAnual)
    const primaBruta = dudosa || p.primaBruta === null ? null : Number(p.primaBruta)
    const deRecibo = primaConRecibos({ primaAnual, primaBruta, fraccionamiento: p.fraccionamiento }, recsVig, hoyIso)
    // El historial se ordena AQUÍ y no en el `orderBy` de Prisma: en Postgres
    // un `DESC` implica `NULLS FIRST`, así que los siniestros sin fecha se
    // colarían arriba y enterrarían los que sí la tienen. Es la misma trampa
    // que ya mordió en la ficha del corredor (PR #2346).
    const historial: SiniestroPortal[] | null = ve.siniestros
      ? ordenarHistorialSiniestros(
          (siniestrosPor.get(p.id) ?? []).map((x) => ({
            id: x.id,
            estado: x.estado,
            referencia: x.referencia,
            fechaHora: x.fechaHora,
            // Las dos normalizaciones viven en el módulo puro: la provincia es
            // un CÓDIGO («41») y la ciudad viene en MAYÚSCULAS. Aquí solo se
            // traduce la fila.
            descripcion: descripcionSiniestro(x.comentario),
            lugar: lugarSiniestro({ ciudad: x.lugarCiudad, provincia: x.lugarProvincia }),
            tipoLegible: tipoSiniestroLegible(x.tipo),
            tramitacion: tramitacionSiniestro({
              situaciones: x.situacionesCima,
              acciones: x.accionesCima,
              pagos: x.pagosCima,
              totalPagos: x.totalPagosCima,
              indemnizacion: x.indemnizacionCima,
            }),
            detalle: detalleSiniestroCompania({
              fechaDeclaracion: x.fechaDeclaracion,
              posicion: x.posicionCima,
              responsabilidad: x.responsabilidadCima,
              daa: x.daaCima,
              reserva: x.reservaCima,
              reservaDesglose: x.reservaDesgloseCima,
              totalRecobros: x.totalRecobrosCima,
              expedientes: x.expedientesCima,
              riesgo: x.riesgoCima,
              vehiculo: x.vehiculoCima,
              vehiculoContrario: x.vehiculoContrarioCima,
              asistencias: x.asistenciasCima,
              descripcion: x.descripcionCima,
              tramitador: { nombre: x.tramitadorNombre, telefono: x.tramitadorTelefono, email: x.tramitadorEmail },
              perito: { nombre: x.peritoNombre, telefono: x.peritoTelefono, email: x.peritoEmail },
            }, nombresPorCodigo),
          })),
        )
      : null
    return {
      id: p.id,
      compania: p.aseguradora,
      ramo: p.tipo,
      numeroPoliza: ve.numeroPoliza ? p.numeroPoliza : null,
      fechaInicio: p.fechaInicio,
      fechaVencimiento,
      fechaEmision: p.fechaEmision,
      fechaEfectoActual: p.fechaEfectoActual,
      fechaSolicitud: ve.coberturas ? p.fechaSolicitud : null,
      estado: p.estado,
      vigencia: vigenciaPoliza({ estado: p.estado, fechaVencimiento }, hoy),
      renovacionSinConfirmar:
        esEstadoVigente(p.estado) &&
        p.eiacXmlHash !== null &&
        vigenciaPoliza({ estado: p.estado, fechaVencimiento }, hoy) === 'no_vigente',
      confirmadaCima: p.idPolizaEntidad !== null,
      sustituidaAt: p.sustituidaAt ?? null,
      sustituyeAId: p.polizaOrigenId !== null && sustituidas.has(p.polizaOrigenId) ? p.polizaOrigenId : null,
      // Los dos se deciden POR LECTOR en `titular()`, con lo que ese lector puede ver.
      sustituyeA: null,
      sustituidaPor: null,
      cambiosCompania: [],
      procedencia: { importRef: p.importRef, eiacXmlHash: p.eiacXmlHash },
      prima: ve.prima
        ? {
            // `Decimal` de Prisma → número ANTES de formatear; null se queda null.
            anual: primaAnual,
            // El `prima_total` del recibo es lo que el cliente paga (con
            // impuestos): por eso, si sale de ahí, va en `bruta`.
            bruta: deRecibo.deRecibo ? deRecibo.prima : primaBruta,
            mensual: dudosa || p.primaMensual === null ? null : Number(p.primaMensual),
            fraccionamiento: p.fraccionamiento,
            ...(dudosa ? { dudosa: true } : {}),
          }
        : null,
      coberturas: ve.coberturas
        ? {
            total: cobs.length,
            // Sin `slice`: la lista va entera. Ver el comentario del tipo.
            ...listaCoberturas(cobs, { inicio: p.fechaEfectoActual ?? p.fechaInicio, fin: p.fechaVencimiento }),
          }
        : null,
      recibos: ve.recibos ? recibosDePoliza(recs) : null,
      // Solo de ESTA fila (la de CIMA), no de la gemela del volcado: cobro y producto son del contrato vivo.
      datosCompania: datosPolizaCima(p.datosEspecificos, ve),
      // 🚨 `null` = NO VISIBLE EN TU NIVEL. `[]` = no hay ninguno abierto. Son
      // cosas distintas y la UI dice cada una con sus palabras. Hasta el
      // 04/09/2026 esto no miraba `ve` y un tercero con el alcance más bajo
      // veía los siniestros abiertos de quien le autorizó.
      // 🚨 Los DOS campos se filtran por SU flag, no por uno común: `bien` es
      // la cosa (visible desde `tarjeta`) y `direccionRiesgo` es dónde vive el
      // titular (nunca a un tercero de una persona física). Un solo `if` aquí
      // regalaría la dirección de una casa a quien solo pidió ver la compañía.
      bien: (() => {
        const b = describirBienConGemela(
          p.tipo,
          descifrarDireccion(p.datosEspecificos),
          descifrarDireccion(gemelaDe(p)),
        )
        return {
          cosa: ve.bien ? b.cosa : null,
          ubicacion: ve.direccionRiesgo ? b.ubicacion : null,
          detalles: ve.bien ? b.detalles : [],
          // Mismo nivel que `cosa`: es el mismo dato de contrato, solo que
          // suelto para poder autorrellenar un campo sin parsear el texto.
          matricula: ve.bien ? b.matricula : null,
          // Se vuelve a intentar abrir, a propósito: lo que importa es si el
          // sobre `v1:` SIGUE cerrado después del descifrado, en cualquiera de
          // las dos filas.
          ubicacionCifrada:
            direccionSigueCifrada(descifrarDireccion(p.datosEspecificos)) ||
            direccionSigueCifrada(descifrarDireccion(gemelaDe(p))),
        }
      })(),
      // Una sola lectura y una sola guarda: los abiertos se DERIVAN del
      // historial con `siniestroAbierto()`, que es la fuente única del
      // vocabulario. Dos listas de estados escritas a mano acaban divergiendo
      // el día que la compañía añada uno, y el síntoma sería que un siniestro
      // deja de contar como abierto sin que nada falle.
      siniestros: historial,
      siniestrosAbiertos: historial === null ? null : historial.filter((s) => siniestroAbierto(s.estado)),
    }
  }

  const nombrePor = new Map(clientes.map((c) => [c.id, `${c.nombre} ${c.apellidos}`.trim()]))
  // NULL o cualquier otra cosa → `fisica`, el lado restrictivo. La cartera real
  // tiene `tipo_persona` casi vacía (medido 03/09/2026), así que este default
  // NO es teórico: es el caso normal, y tiene que ser el que menos abre.
  //
  // ⚠️ Matiz medido el 07/09/2026, y es el que importa para agrupar la bóveda:
  // ese «casi vacía» son las 31.730 fichas del VOLCADO (de 31.810 vivas). Las
  // 80 que tienen una póliza viva —las únicas que llegan a un portal— la tienen
  // TODAS: 74 físicas y 6 jurídicas. O sea que el cajón «Seguros de tus
  // empresas» de `agruparCartera` no sale vacío por falta de dato; el default
  // de arriba sigue haciendo falta para el resto.
  const tipoPor = new Map<string, TipoOtorgante>(
    clientes.map((c) => [c.id, c.tipoPersona === 'juridica' ? 'juridica' : 'fisica']),
  )
  // `ve` puede ser los mismos campos para toda la ficha (lo propio) o una
  // función que los decide PÓLIZA A PÓLIZA (lo autorizado, desde que se puede
  // conceder una sola). Devolver `null` para una póliza no la sirve capada: la
  // deja fuera, que es lo que significa «esa no te la han abierto».
  const titular = (
    clienteId: string,
    nivel: Nivel,
    ve: CamposVisibles | ((polizaId: string) => CamposVisibles | null),
    autorizacion?: TitularPortal['autorizacion'],
  ): TitularPortal | null => {
    // Una ficha fusionada o que ya no existe no se pinta: sin nombre no hay titular.
    const nombre = nombrePor.get(clienteId)
    if (nombre === undefined) return null
    // Las de otro tomador donde ESTA ficha figura (vacío salvo para fichas vistas enteras).
    const figura = figuraAjena.get(clienteId)
    const suyas = polizas
      .filter((p) => p.clienteId === clienteId || (figura?.has(p.id) ?? false))
      .map((p) => {
        const campos = typeof ve === 'function' ? ve(p.id) : ve
        if (campos === null) return null
        const rolesTitular = p.clienteId === clienteId ? undefined : figura?.get(p.id)
        if (rolesTitular === undefined) return aPortal(p, campos)
        // No es su póliza: lo de la PERSONA del tomador (IBAN, DNI, documentos, actuar por él) no se hereda.
        const fila = aPortal(p, capaInterviniente(campos))
        fila.figuraTitular = { roles: rolesTitular, tomador: nombrePor.get(p.clienteId) ?? null }
        return fila
      })
      .filter((x): x is PolizaPortal => x !== null)
    // Sustituciones POR LECTOR (caso José Suárez, 23/09/2026): con lo que este lector ve, nunca antes.
    const porId = new Map(suyas.map((p) => [p.id, p]))
    // El devuelto de la vieja por un periodo que ya cubre su sustituta NO es deuda (José, 29/09/2026:
    // la renovación Mapfre del Kona llegó devuelta y el portal le pedía pagarla). No cuenta como
    // pendiente: ni para dejar la vieja en la lista ni para «Tienes un recibo devuelto».
    const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
    for (const n of suyas) {
      const v = n.sustituyeAId === null ? undefined : porId.get(n.sustituyeAId)
      if (v === undefined || n.vigencia === 'no_vigente' || !v.recibos || v.recibos.devueltos === 0) continue
      const esperados = (recibosPor.get(v.id) ?? []).filter(
        (r) =>
          r.situacion !== null &&
          tonoSituacionRecibo(String(r.situacion)) === 'devuelto' &&
          devueltoPorSustitucion(dia(r.fechaEfectoActual), { fechaVencimiento: dia(v.fechaVencimiento) }, { fechaInicio: dia(n.fechaInicio) }),
      ).length
      if (esperados > 0) v.recibos = { ...v.recibos, devueltos: Math.max(0, v.recibos.devueltos - esperados) }
    }
    const retirar = sustituidasARetirar(
      suyas.map((p) => ({
        id: p.id,
        sustituyeAId: p.sustituyeAId,
        vigente: p.vigencia === 'vigente',
        conPendientes: (p.siniestrosAbiertos?.length ?? 0) > 0 || (p.recibos?.devueltos ?? 0) > 0,
      })),
    )
    for (const p of suyas) {
      const v = p.sustituyeAId === null ? undefined : porId.get(p.sustituyeAId)
      p.sustituyeA = v ? { compania: v.compania, fechaVencimiento: v.fechaVencimiento } : null
      const n = porId.get(retirar.get(p.id) ?? '')
      p.sustituidaPor = n ? { compania: n.compania, desde: n.fechaInicio } : null
      p.cambiosCompania = historialCompanias(p.id, suyas)
    }
    return {
      clienteId,
      nombre,
      // Del MISMO mapa que ya usan los alcances: dos fuentes para «¿esta ficha
      // es una sociedad?» se separan sin que falle nada, y entonces la bóveda
      // diría una cosa y los permisos otra.
      tipoPersona: tipoPor.get(clienteId) ?? 'fisica',
      nivel,
      ...(autorizacion ? { autorizacion } : {}),
      polizas: suyas,
    }
  }

  const propias = propiosIds
    .map((id) => {
      const nivel = nivelPorCliente.get(id) ?? 'tarjeta'
      return titular(id, nivel, camposVisibles(nivel))
    })
    .filter((t): t is TitularPortal => t !== null)
  const figuraPropia = figuraEnPropias({
    polizaIds: propias.flatMap((t) => t.polizas.map((p) => p.id)),
    filas: filasInterviniente,
    propiosIds,
  })
  for (const t of propias) for (const p of t.polizas) p.figura = figuraPropia.get(p.id)

  const caducaPorId = new Map(vigentes.map((f) => [f.id, f.caducaEn]))
  const autorizadas: TitularPortal[] = []
  const autorizacionesUsadas: string[] = []
  for (const clienteId of autorizadosIds) {
    const tipo = tipoPor.get(clienteId) ?? 'fisica'
    // Lo concedido sobre la ficha ENTERA. `null` = solo hay concesiones sueltas.
    const deLaFicha = porOtorgante.get(clienteId) ?? null
    // Lo que de verdad se ha servido, que es lo único que cuenta como USO: una
    // autorización sobre una póliza que ya no está viva no se anota como que
    // alguien miró algo.
    const usadas = new Set<string>()
    const alcancesServidos = new Set<Alcance>()
    const conPartes = new Set<string>()

    const veDe = (polizaId: string): CamposVisibles | null => {
      // La suelta solo cuenta si la concedió ESTA ficha: dos otorgantes pueden
      // aparecer en la misma vuelta y una póliza es de uno solo.
      const suelta = otorganteDePoliza.get(polizaId) === clienteId ? (porPoliza.get(polizaId) ?? null) : null
      if (deLaFicha === null && suelta === null) return null
      const alcances = [...(deLaFicha?.alcances ?? []), ...(suelta?.alcances ?? [])]
      // `camposDeAlcances` va capada: pase lo que pase con los niveles, un
      // tercero no ve el IBAN ni el DNI del otorgante, ni actúa en su nombre.
      const campos = camposDeAlcances(alcances, tipo)
      if (campos === null) return null
      for (const id of deLaFicha?.ids ?? []) usadas.add(id)
      for (const id of suelta?.ids ?? []) usadas.add(id)
      for (const a of alcances) alcancesServidos.add(a)
      if (puedeDarParte(alcances, tipo)) conPartes.add(polizaId)
      return campos
    }

    const t = titular(clienteId, 'tarjeta', veDe)
    if (t === null) continue
    // Sin una sola póliza servida y sin concesión sobre la ficha entera, no hay
    // nada que enseñar: pintar el nombre de quien te autorizó y una lista vacía
    // sería contar que esa persona existe en la cartera sin abrir nada.
    if (t.polizas.length === 0 && deLaFicha === null) continue
    const alcances = [...alcancesServidos]
    const ids = [...usadas]
    // Con la ficha abierta y cero pólizas vivas no se ha llamado a `veDe` ni una
    // vez: la concesión es real y sigue siendo lo que hay que enseñar.
    const idsFinales = ids.length > 0 ? ids : (deLaFicha?.ids ?? [])
    const alcancesFinales = alcances.length > 0 ? alcances : [...new Set(deLaFicha?.alcances ?? [])]
    // 🚨 `null` aquí YA NO es «sin concesión»: desde el 25/09/2026 es «no
    // caduca». La ausencia de concesión es `undefined`, y es lo único que corta.
    // Con el `null` de antes como corte, toda cartera compartida sin caducidad
    // desaparecía de la bóveda sin que fallara nada.
    let caduca: Date | null | undefined = deLaFicha === null ? undefined : deLaFicha.caducaEn
    for (const id of idsFinales) {
      const c = caducaPorId.get(id)
      if (c === undefined) continue
      caduca = caduca === undefined ? c : caducaMasTarde(caduca, c)
    }
    if (caduca === undefined) continue
    autorizadas.push({
      ...t,
      nivel: etiquetaNivelAlcances(alcancesFinales),
      autorizacion: { ids: idsFinales, alcances: alcancesFinales, caducaEn: caduca, partes: [...conPartes] },
    })
    autorizacionesUsadas.push(...idsFinales)
  }

  // ── Las que AÑADIÓ en su portal quien te abrió su ficha ENTERA (08/10/2026) ──
  // Para quien mira es un seguro más de esa persona. La regla de QUIÉN es la
  // titular de la ficha vive pura en `identidadesTitulares` (fail-closed); aquí
  // solo se lee. 🔒 Solo fichas de `porOtorgante` —concesión sobre la ficha
  // entera, nunca una suelta— y solo las autorizadas por consentimiento: el
  // acceso de dueño se queda como estaba. Se buscan por `identidadId` de las
  // identidades que la regla da por titulares, nunca por otra columna.
  const fichasEnteras = autorizadas.map((t) => t.clienteId).filter((id) => porOtorgante.has(id))
  if (fichasEnteras.length > 0) {
    const candidatas = await prisma.portalVinculo.findMany({
      where: { clienteId: { in: fichasEnteras }, identidadId: { not: identidadId } },
      select: { identidadId: true },
    })
    const idsCandidatas = [...new Set(candidatas.map((v) => v.identidadId))]
    const titulares = identidadesTitulares({
      fichasEnteras,
      // TODOS los vínculos de cada candidata: la regla necesita saber si tiene otra ficha.
      vinculos:
        idsCandidatas.length === 0
          ? []
          : await prisma.portalVinculo.findMany({
              where: { identidadId: { in: idsCandidatas } },
              select: { identidadId: true, clienteId: true, nivel: true, origen: true },
            }),
      identidadQueMira: identidadId,
      identidadCorredor: IDENTIDAD_CORREDOR_ID,
    })
    const filasDeclaradas =
      titulares.size === 0
        ? []
        : await prisma.portalPolizaDeclarada.findMany({
            where: { identidadId: { in: [...titulares.keys()] }, titularTipo: TITULAR_TIPO_VISIBLE_A_TERCERO },
            select: { id: true, identidadId: true, compania: true, ramo: true, fechaVencimiento: true, documentoNombre: true },
            orderBy: { creadaEn: 'desc' },
            take: 200,
          })
    for (const t of autorizadas) {
      if (!fichasEnteras.includes(t.clienteId)) continue
      t.declaradas = filasDeclaradas
        .filter((d) => titulares.get(d.identidadId) === t.clienteId)
        .map((d) => ({
          id: d.id,
          compania: d.compania,
          ramo: d.ramo,
          fechaVencimiento: d.fechaVencimiento,
          deDocumento: d.documentoNombre !== null,
        }))
    }
  }

  // Las empresas del dueño: acceso TOTAL de sociedad (CIF, cuenta, dar parte), como las de un
  // representante. Van con las ajenas porque NO son su ficha —«Mis datos», mensajes y la hoja QR
  // siguen solo sobre la personal— pero `via: 'dueno'` las lleva al cajón «Seguros de tus empresas».
  // 🚨 No entran en `autorizacionesUsadas`: el dueño no es un tercero, no hay visita que anotar.
  const camposDueno = camposDeAlcances(['total'], 'juridica')
  for (const clienteId of representadasIds) {
    if (camposDueno === null) break
    const t = titular(clienteId, 'gestionar', camposDueno)
    if (t === null) continue
    autorizadas.push({
      ...t,
      nivel: etiquetaNivelAlcances(['total']),
      autorizacion: { ids: [], alcances: ['total'], caducaEn: null, partes: t.polizas.map((p) => p.id), via: 'dueno' },
    })
  }

  // Las que ve por permiso o por ser dueño y donde ADEMÁS figura (el coche de su sociedad, él
  // conductor habitual): se le dice su papel. Las demás autorizadas no llevan `figura`.
  const rolesSuyos = rolesPropiosPorPoliza(filasInterviniente, propiosIds)
  for (const t of autorizadas) {
    for (const p of t.polizas) {
      const r = rolesSuyos.get(p.id)
      if (r !== undefined) p.figura = r
    }
  }

  // Aviso «figura en N que ya están en las tuyas»: solo cruza lo ya leído (filas de las fichas
  // vistas enteras + las pólizas que `propias` ya sirve); no lee nada nuevo.
  const yaEnPropias = figuraYaServidaEnPropias({
    filas: filasFiguraAjena,
    fichasVistas: fichasVistasEnteras,
    polizasPropiasIds: propias.flatMap((t) => t.polizas.map((p) => p.id)),
  })
  for (const t of autorizadas) {
    const ids = yaEnPropias.get(t.clienteId)
    if (ids !== undefined && ids.length > 0) t.figuraEnTusPolizas = ids
  }

  // Las pólizas donde FIGURA, agrupadas por tomador. La regla (qué abre, con qué
  // nivel y qué campos NO) vive pura y testeada en `lib/intervinientes.ts`.
  // Lo que ya se sirve por una autorización o por ser dueño no se duplica.
  const figuras = figurasEnPolizas({
    filas: filasInterviniente,
    polizas: polizasDondeFigura,
    propiosIds,
    nivelPorCliente,
    yaVisibles: new Set(autorizadas.flatMap((t) => t.polizas.map((p) => p.id))),
  })
  const intervinientes: TitularPortal[] = []
  for (const tomadorId of tomadoresIds) {
    // `null` para cualquier póliza del tomador donde no figura: `titular()` la deja FUERA.
    const t = titular(tomadorId, 'tarjeta', (polizaId) => {
      const f = figuras.get(polizaId)
      return f !== undefined && f.tomadorId === tomadorId ? camposDeInterviniente(f.nivel) : null
    })
    if (t === null || t.polizas.length === 0) continue
    const rolesPorPoliza: Record<string, string[]> = {}
    const niveles: Nivel[] = []
    for (const p of t.polizas) {
      const f = figuras.get(p.id)
      if (f === undefined) continue
      rolesPorPoliza[p.id] = f.roles
      p.figura = f.roles
      niveles.push(f.nivel)
    }
    intervinientes.push({
      ...t,
      nivel: nivelMasAlto(niveles),
      interviniente: { roles: ordenarRoles(Object.values(rolesPorPoliza).flat()), rolesPorPoliza },
    })
  }

  return {
    vinculada: vinculos.length > 0,
    vinculo,
    correduria: correduria?.nombre ?? null,
    propias,
    autorizadas,
    intervinientes,
    autorizacionesUsadas,
  }
}

type ReciboFila = {
  situacion: string | null
  primaTotal: string | null
  fechaEmision: Date | null
  fechaVencimiento: Date | null
  fechaEfectoActual?: Date | null
  claseRecibo?: string | null
  fechaSituacion?: Date | null
}

/**
 * Los recibos de UNA póliza, tal y como los ve el cliente.
 *
 * Todo el vocabulario —qué es un anulado, qué está al cobro, qué fecha es de
 * fiar y en qué orden van— vive en `@central/module-seguros-portal`, que es
 * donde están medidos los 183 recibos de la cartera viva. Aquí solo se traduce
 * la fila de la BD.
 *
 * 🚨 `estado` se calcula sobre la lista CRUDA (con anulados) y el resto sobre la
 * limpia: es la única forma de distinguir «la compañía no informó nada» de
 * «informó y está todo anulado», que eran las 20 pólizas mudas.
 */
/**
 * Nombre y capital de cada cobertura, alineados. Un capital 0, vacío o que no
 * se sabe leer sale `null` («no informado»), nunca «0,00€».
 */
function listaCoberturas(
  cobs: Array<{
    descripcion: string | null
    codigo: string | null
    capitalAsegurado: string | null
    franquicia: string | null
    fechaInicio: Date | null
    fechaFin: Date | null
    datosExtra?: unknown
  }>,
  periodoPoliza: { inicio: Date | null; fin: Date | null },
): { lista: string[]; capitales: (number | 'ilimitado' | null)[]; detalle: CoberturaVista[] } {
  const lista: string[] = []
  const capitales: (number | 'ilimitado' | null)[] = []
  const detalle: CoberturaVista[] = []
  for (const c of cobs) {
    const nombre = nombreCobertura((c.descripcion ?? c.codigo ?? '').trim())
    if (!nombre) continue
    // El MISMO lector que el resto de la cartera: un «1.500» o un texto raro
    // no se adivina (sale `null`), y «INF» es ilimitado, no «sin importe».
    const cap = capitalDeCobertura(c)
    lista.push(nombre)
    capitales.push(cap.tipo === 'importe' && cap.importe > 0 ? cap.importe : cap.tipo === 'ilimitado' ? 'ilimitado' : null)
    detalle.push(vistaCobertura(c, periodoPoliza))
  }
  return { lista, capitales, detalle }
}

function recibosDePoliza(lista: ReciboFila[]): RecibosPortal {
  const crudos = lista.map((r) => ({
    situacion: (r.situacion ?? '').trim() || 'sin_informar',
    importe: importeEiac(r.primaTotal),
    // Las fechas pasan por el filtro de centinelas: hay un recibo con
    // `fecha_emision` 0001-01-01, que es un «no lo sé» con forma de dato.
    fechaEmision: fechaReciboFiable(r.fechaEmision),
    fechaVencimiento: fechaReciboFiable(r.fechaVencimiento),
    clase: (r.claseRecibo ?? '').trim() || null,
    fechaEfecto: fechaReciboFiable(r.fechaEfectoActual),
    fechaSituacion: fechaReciboFiable(r.fechaSituacion),
  }))
  const historial = ordenarRecibos(crudos)
  return {
    ...resumirRecibos(historial, crudos.length - historial.length),
    estado: estadoRecibos(crudos),
    historial,
  }
}

/**
 * Las pólizas sobre las que esta cartera puede DAR UN PARTE: todas las propias y,
 * de las autorizadas, solo las que traen el alcance `partes` (`puedeDarParte`).
 * Una sola fuente para la ruta que lo crea y la pantalla que lo ofrece: si
 * divergen, se ofrece una póliza que luego se rechaza con 403.
 */
export function polizasParaParte(c: Pick<CarteraPortal, 'propias' | 'autorizadas' | 'intervinientes'>): Set<string> {
  return new Set([
    ...c.propias.flatMap((t) => t.polizas.map((p) => p.id)),
    ...c.autorizadas.flatMap((t) => t.autorizacion?.partes ?? []),
    // Figurar en la póliza da derecho a dar parte de ella (decisión de Alberto, 27/09/2026).
    ...c.intervinientes.flatMap((t) => t.polizas.map((p) => p.id)),
  ])
}

/** La más tardía de dos caducidades, donde `null` = no caduca (gana siempre). */
function caducaMasTarde(a: Date | null, b: Date | null): Date | null {
  if (a === null || b === null) return null
  return b.getTime() > a.getTime() ? b : a
}

/** Cuenta como «en vigor» para la lista, el parte y los avisos: vigente, sin fecha (no se sabe)
 *  o con la renovación sin confirmar. Lo único que sale es lo que la compañía da por terminado. */
export function cuentaComoEnVigor(p: Pick<PolizaPortal, 'vigencia' | 'renovacionSinConfirmar'>): boolean {
  return p.vigencia !== 'no_vigente' || p.renovacionSinConfirmar
}
