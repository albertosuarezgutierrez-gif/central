// En qué compañías está YA el cliente — los datos con los que `defensaDeCartera()`
// de `@central/module-seguros` decide si una fila de la tabla de precios se puede
// emitir o no. **PURO**: la forma de los datos y el porqué. Las dos consultas
// viven en `cartera-companias.ts`, y la REGLA en el módulo — aquí no se
// reimplementa ninguna de las dos.
//
// ─── Por qué se sirve desde aquí y no se calcula en plataforma ──────────────
// La cartera vive en el schema `seguros` y solo `apps/asegura` la lee. Plataforma
// pinta la tabla de 24 precios de retarificar y necesita saber, por fila, si esa
// compañía está ocupada. El puerto ya tiene delante la póliza y su cliente cuando
// precalifica, así que el bloque sale de la misma lectura: **ninguna llamada al
// vendor, ningún céntimo** (la respuesta de la ruta sigue diciendo `gastado: '0,00€'`).
//
// ─── Qué pólizas se mandan: la VIVA entera, no solo la EN VIGOR ─────────────
// `defensaDeCartera()` usa las dos mitades y las cuenta distinto:
//   · `polizaDefiende(p)` = `viva && esEstadoVigente(estado)` → lo que BLOQUEA.
//   · las vivas que NO defienden (canceladas) se cuentan en `exPolizas`, que es
//     un ARGUMENTO comercial («ya fue cliente suyo, se puede volver a entrar»),
//     no un veto.
// Mandar solo la cartera en vigor perdería la segunda mitad sin que nada fallara.
// Por eso la población es `WHERE_CARTERA_VIVA` —que es exactamente la unión de
// `WHERE_CARTERA_EN_VIGOR` y las vivas no vigentes— y el estado viaja TAL CUAL:
// quien decide qué es «en vigor» sigue siendo `esEstadoVigente()`, la misma
// función única que usa `esCarteraEnVigor()`. Aquí no hay ni una lista de
// estados escrita a mano ni un `import_ref is null` suelto.
//
// El volcado histórico (32.520 leads, vencimientos 2013-2018) queda fuera a
// propósito: una póliza de 2016 no defiende nada, y el módulo lo dice.
//
// ─── `null` nunca se degrada a `[]` ─────────────────────────────────────────
// 🚨 Esta es la regla cara de este fichero. `[]` significa «mirado: el cliente no
// tiene NINGUNA póliza nuestra», y con eso `defensaDeCartera()` pinta las 24
// filas como `libre` = «véndelo». Si la consulta falla, o el cliente no se
// resuelve, la respuesta es `{ estado: 'no_disponible', porque }`, que al otro
// lado se lee como `desconocida` («sin comprobar»). Por eso ninguna función de
// aquí devuelve un array vacío en un `catch`.
//
// ─── Identidad: DGS → nombre, nunca al revés ────────────────────────────────
// Se manda el `codigo_entidad_dgs` de cada póliza (las 157 vivas lo traen: el
// lado de CIMA es identidad fuerte al 100 %) y el catálogo `seguros.companias_dgs`
// para que el nombre que manda el vendor («Mapfre») resuelva a un código. El
// emparejamiento por nombre es la red de última hora del módulo, y él mismo lo
// DECLARA (`coincidencia: 'nombre'`).

import { esCarteraViva, type CompaniaCatalogo, type PolizaCliente } from '@central/module-seguros'

/**
 * Lo que viaja por el puerto. TRES estados en uno: `ok` con la lista (que puede
 * estar vacía y entonces sí significa «no tiene ninguna»), o `no_disponible`
 * con el motivo. Nunca una lista vacía que en realidad era un fallo.
 */
export type CarteraCompanias =
  | {
      estado: 'ok'
      polizas: PolizaCliente[]
      catalogo: CompaniaCatalogo[]
      /** La póliza que se está retarificando: su compañía es `actual`, no `ocupada`. */
      polizaActualId: string | null
    }
  | { estado: 'no_disponible'; porque: string }

/**
 * Tope de cordura. La cartera viva entera son 157 pólizas, así que un cliente
 * con más de esto es una consulta que no está filtrando lo que cree.
 *
 * 🚨 Al pasarse NO se trunca: truncar dejaría fuera justo la póliza que ocupa
 * una compañía y la fila saldría `libre` — un falso «véndelo» indistinguible de
 * uno bueno. Se responde `no_disponible`, que es la verdad.
 */
export const TOPE_POLIZAS_CLIENTE = 200

export type FilaPoliza = {
  id: string
  tipo: unknown
  estado: unknown
  aseguradora: string | null
  numeroPoliza: string | null
  codigoEntidadDgs: string | null
  importRef: string | null
  eiacXmlHash: string | null
}

/**
 * Fila de `polizas` → `PolizaCliente`. PURO, para poder probarlo sin BD.
 *
 * `viva` se DERIVA con `esCarteraViva()` en vez de ponerse a `true` por venir de
 * una consulta que ya filtra: si alguien amplía el `where` mañana, el campo
 * sigue diciendo la verdad en lugar de mentir en silencio.
 */
export function aPolizaCliente(f: FilaPoliza): PolizaCliente {
  return {
    id: f.id,
    codigoEntidadDgs: f.codigoEntidadDgs,
    aseguradora: f.aseguradora,
    // El enum de Prisma llega como string; se pasa TAL CUAL. Quien decide si
    // ese estado está vigente es `esEstadoVigente()` dentro del módulo.
    estado: f.estado === null || f.estado === undefined ? null : String(f.estado),
    viva: esCarteraViva({ importRef: f.importRef, eiacXmlHash: f.eiacXmlHash }),
    ramo: f.tipo === null || f.tipo === undefined ? null : String(f.tipo),
    numeroPoliza: f.numeroPoliza,
  }
}

/** Fila de `seguros.companias_dgs` → entrada del catálogo. PURO. */
export function aCompaniaCatalogo(f: {
  codigoDgs: string
  nombreComun: string
  nombreCima: string | null
}): CompaniaCatalogo {
  // `nombreCima: null` es «todavía no se ha visto ninguna póliza de CIMA de esa
  // compañía», no «no tiene nombre»: se propaga tal cual, que es lo que el
  // módulo espera.
  return { codigoDgs: f.codigoDgs, nombreComun: f.nombreComun, nombreCima: f.nombreCima }
}

