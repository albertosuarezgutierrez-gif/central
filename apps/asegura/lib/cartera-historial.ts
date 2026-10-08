// Lectura del historial de una ficha (`seguros.historial_interno`) y detección
// de pólizas duplicadas en la cartera viva. Solo lectura; `correduriaId`
// explícito en todo. `null` = no se pudo consultar, nunca `[]`.

import { origenFicha, polizasDuplicadas, type GrupoDuplicado, type PolizaParaDuplicados } from '@central/module-seguros'
import { leerParesNoDuplicado } from './no-duplicados'
import { prismaAsegura } from './asegura-db'

export type HistorialFila = { id: string; tipo: string; texto: string; fecha: string }

export type NotasCliente = {
  /** Notas fechadas (`historial_interno` tipo `nota`), la más reciente primero. */
  lista: HistorialFila[]
  /** El campo `clientes.notas` del CRM anterior: un solo texto sin fecha. Se enseña, no se edita. */
  antigua: string | null
}

/**
 * Las notas de la ficha, aparte del historial: el historial trae las 50 últimas anotaciones de
 * cualquier tipo, y en una ficha con mucha gestión una nota de hace un año quedaría fuera.
 * `null` = no se pudo leer.
 */
export async function notasCliente(correduriaId: string, clienteId: string, antigua: string | null, limite = 100): Promise<NotasCliente | null> {
  try {
    const filas = await prismaAsegura().$queryRaw<{ id: string; texto: string; created_at: Date }[]>`
      select id, texto, created_at
      from historial_interno
      where correduria_id = ${correduriaId}::uuid and cliente_id = ${clienteId}::uuid
        and tipo = 'nota' and deleted_at is null
      order by created_at desc
      limit ${limite}`
    return {
      lista: filas.map((f) => ({ id: f.id, tipo: 'nota', texto: f.texto, fecha: f.created_at.toISOString() })),
      antigua: antigua !== null && antigua.trim() !== '' ? antigua.trim() : null,
    }
  } catch {
    return null
  }
}

/** Últimas 50 anotaciones de la ficha, la más reciente primero. `null` = no se pudo leer. */
export async function historialCliente(correduriaId: string, clienteId: string, limite = 50): Promise<HistorialFila[] | null> {
  try {
    const filas = await prismaAsegura().$queryRaw<{ id: string; tipo: string; texto: string; created_at: Date }[]>`
      select id, tipo::text as tipo, texto, created_at
      from historial_interno
      where correduria_id = ${correduriaId}::uuid and cliente_id = ${clienteId}::uuid and deleted_at is null
      order by created_at desc
      limit ${limite}`
    return filas.map((f) => ({ id: f.id, tipo: f.tipo, texto: f.texto, fecha: f.created_at.toISOString() }))
  } catch {
    return null
  }
}

/**
 * Cotizaciones vivas de un cliente (pendiente/enviada, últimos `dias` días).
 * Es lo que convierte a un lead en «con presupuesto». `null` = no se pudo contar.
 */
export async function cotizacionesVivas(correduriaId: string, clienteId: string, dias: number): Promise<number | null> {
  try {
    const r = await prismaAsegura().$queryRaw<{ n: bigint }[]>`
      select count(*)::bigint as n
      from cotizaciones
      where correduria_id = ${correduriaId}::uuid and cliente_id = ${clienteId}::uuid
        and estado::text in ('pendiente', 'enviada')
        and created_at >= now() - make_interval(days => ${dias}::int)`
    return Number(r[0]?.n ?? 0)
  } catch {
    return null
  }
}

/**
 * Las fichas candidatas a duplicado: UNA consulta para la pantalla «Duplicadas»
 * (`duplicadasCartera`) y la señal 🔁 del vigía (`leerIngesta`). Fichas sin
 * fusionar (sin `merged_into_poliza_id` contaría las lápidas recién fusionadas),
 * con DGS y de fichas de cliente NO descartadas (una ficha descartada no sale en
 * ninguna lista: `test/regression-cliente-descartado.test.ts`). El criterio
 * exacto —número comparable, comodines, pares marcados, una correduría nunca se
 * funde con otra— lo pone `agruparDuplicadas` de `@central/module-seguros`.
 * Medido el 04/10/2026: ~940 filas de 28.900, así que no hace falta prefiltro SQL.
 * Con `correduriaId`, solo esa correduría (la pantalla); sin él, todas (el
 * vigía). Lanza si la consulta falla: quien llama decide el «no se pudo mirar».
 */
export async function leerFichasCandidatasDuplicadas(correduriaId?: string): Promise<PolizaParaDuplicados[]> {
  const filas = await prismaAsegura().poliza.findMany({
    where: {
      ...(correduriaId ? { correduriaId } : {}),
      mergedIntoPolizaId: null,
      codigoEntidadDgs: { not: null },
      cliente: { activo: true },
    },
    select: {
      id: true, correduriaId: true, clienteId: true, numeroPoliza: true, codigoEntidadDgs: true, aseguradora: true,
      estado: true, importRef: true, eiacXmlHash: true, idPolizaEntidad: true, origen: true,
    },
  })
  return filas.map((p) => ({
    id: p.id,
    correduriaId: p.correduriaId,
    clienteId: p.clienteId,
    numeroPoliza: p.numeroPoliza,
    codigoEntidadDgs: p.codigoEntidadDgs,
    aseguradora: p.aseguradora,
    estado: String(p.estado),
    origen: origenFicha({ eiacXmlHash: p.eiacXmlHash, idPolizaEntidad: p.idPolizaEntidad, importRef: p.importRef, origen: String(p.origen) }),
    // Filtrado arriba: solo entran fichas de cliente activo.
    clienteActivo: true,
  }))
}

/**
 * Pólizas duplicadas (mismo número sin separadores ni ceros + mismo DGS, fichas
 * sin fusionar de clientes no descartados, sin comodines ni pares marcados) en
 * toda la correduría. MISMO criterio y MISMA consulta que la señal 🔁 del vigía
 * (`leerFichasCandidatasDuplicadas` + `agruparDuplicadas`). `null` = no se pudo leer.
 */
export async function duplicadasCartera(correduriaId: string): Promise<GrupoDuplicado[] | null> {
  try {
    // Pares ya decididos «no duplicado» (mig 0108). `null` = no se sabe qué hay
    // marcado: se responde «no se pudo comprobar», nunca la lista sin filtrar
    // como si estuviera filtrada.
    const noDuplicados = await leerParesNoDuplicado(correduriaId)
    if (noDuplicados === null) return null
    return polizasDuplicadas(await leerFichasCandidatasDuplicadas(correduriaId), noDuplicados)
  } catch {
    return null
  }
}
