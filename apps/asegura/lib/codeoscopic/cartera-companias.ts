// En qué compañías está YA el cliente — la parte que TOCA LA BASE. La forma de
// los datos, el tope y el porqué de todo esto viven en `cartera-companias-mapeo.ts`,
// que es PURO y se puede probar sin levantar Prisma; aquí solo están las dos
// consultas. La separación no es estética: `../asegura-db.ts` importa el cliente
// generado de Prisma sin extensión, y `node --test` no lo resuelve — un test que
// importara este fichero moriría con `ERR_MODULE_NOT_FOUND` antes de probar nada.
//
// 🚨 Ningún `catch` de aquí devuelve `[]`. `[]` significa «mirado: este cliente no
// tiene ninguna póliza NUESTRA» y con eso `defensaDeCartera()` pinta las 24 filas
// de precios como `libre` = «véndelo». Un fallo de lectura sale como
// `no_disponible`, que al otro lado es `desconocida` («sin comprobar»).

import { WHERE_CARTERA_VIVA, type CompaniaCatalogo } from '@central/module-seguros'
import { aseguraConfigurada, prismaAsegura } from '../asegura-db.ts'
import {
  aCompaniaCatalogo,
  aPolizaCliente,
  TOPE_POLIZAS_CLIENTE,
  type CarteraCompanias,
  type FilaPoliza,
} from './cartera-companias-mapeo.ts'

// Se re-exportan para que quien consuma el bloque tenga UN solo sitio del que
// importar, y el fichero puro no quede escondido.
export {
  aCompaniaCatalogo,
  aPolizaCliente,
  TOPE_POLIZAS_CLIENTE,
  type CarteraCompanias,
  type FilaPoliza,
}

/**
 * Las compañías en las que YA está este cliente, por su `clienteId`.
 *
 * 🛡️ Aislamiento: `correduriaId` viaja en la consulta. Con `prisma_seguros` en
 * BYPASSRLS un id ajeno no daría error — daría la cartera de otra correduría.
 */
export async function carteraCompaniasDeCliente(
  correduriaId: string,
  clienteId: string,
  polizaActualId: string | null = null,
): Promise<CarteraCompanias> {
  if (!aseguraConfigurada()) {
    return { estado: 'no_disponible', porque: 'la cartera no tiene conexión configurada en este despliegue.' }
  }
  const db = prismaAsegura()

  let filas: FilaPoliza[]
  try {
    filas = await db.poliza.findMany({
      where: {
        correduriaId,
        clienteId,
        mergedIntoPolizaId: null,
        ...WHERE_CARTERA_VIVA,
      },
      select: {
        id: true,
        tipo: true,
        estado: true,
        aseguradora: true,
        numeroPoliza: true,
        codigoEntidadDgs: true,
        importRef: true,
        eiacXmlHash: true,
      },
      // Uno más que el tope, para poder DISTINGUIR «justo el tope» de «se pasa».
      take: TOPE_POLIZAS_CLIENTE + 1,
    })
  } catch (e) {
    return {
      estado: 'no_disponible',
      porque: `no se han podido leer las pólizas del cliente (${e instanceof Error ? e.message : String(e)}).`,
    }
  }

  if (filas.length > TOPE_POLIZAS_CLIENTE) {
    return {
      estado: 'no_disponible',
      porque:
        `este cliente tiene más de ${TOPE_POLIZAS_CLIENTE} pólizas vivas, que no es un número creíble: ` +
        'la lista se habría quedado corta y alguna compañía ocupada saldría como libre.',
    }
  }

  let catalogo: CompaniaCatalogo[]
  try {
    // `activa: true` basta: el catálogo solo hace falta para resolver el NOMBRE
    // que manda el vendor, y el vendor no cotiza con compañías dadas de baja.
    // El lado de la póliza no depende de él — va por `codigo_entidad_dgs`.
    const filasCat = await db.companiaDgs.findMany({
      where: { activa: true },
      select: { codigoDgs: true, nombreComun: true, nombreCima: true },
      orderBy: { codigoDgs: 'asc' },
    })
    catalogo = filasCat.map(aCompaniaCatalogo)
  } catch (e) {
    // Sin catálogo NO se sigue con la lista sola: el vendor manda solo el
    // nombre, así que sin equivalencias el emparejamiento se apoyaría en el
    // nombre normalizado y eso es identidad DÉBIL sin declararlo. «No se ha
    // podido comprobar» es la respuesta honrada.
    return {
      estado: 'no_disponible',
      porque: `no se ha podido leer el catálogo de compañías por código DGS (${e instanceof Error ? e.message : String(e)}).`,
    }
  }

  return {
    estado: 'ok',
    polizas: filas.map(aPolizaCliente),
    catalogo,
    polizaActualId,
  }
}

/**
 * Lo mismo partiendo de una PÓLIZA (la que se está retarificando): resuelve su
 * cliente y marca esa póliza como la actual, para que su compañía salga
 * `actual` («aquí se renueva o se negocia») y no `ocupada`.
 */
export async function carteraCompaniasDePoliza(
  correduriaId: string,
  polizaId: string,
): Promise<CarteraCompanias> {
  if (!aseguraConfigurada()) {
    return { estado: 'no_disponible', porque: 'la cartera no tiene conexión configurada en este despliegue.' }
  }
  let clienteId: string | null
  try {
    const p = await prismaAsegura().poliza.findFirst({
      where: { id: polizaId, correduriaId, mergedIntoPolizaId: null },
      select: { clienteId: true },
    })
    clienteId = p?.clienteId ?? null
  } catch (e) {
    return {
      estado: 'no_disponible',
      porque: `no se ha podido leer de quién es esta póliza (${e instanceof Error ? e.message : String(e)}).`,
    }
  }
  if (clienteId === null) {
    // No es «el cliente no tiene pólizas»: es que no se sabe de quién es ésta.
    return {
      estado: 'no_disponible',
      porque: 'no se ha encontrado esta póliza en la cartera de esta correduría, así que no se sabe de qué cliente mirar la cartera.',
    }
  }
  return carteraCompaniasDeCliente(correduriaId, clienteId, polizaId)
}
