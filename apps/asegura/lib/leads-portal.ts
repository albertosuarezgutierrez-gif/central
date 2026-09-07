// Las pólizas que los clientes suben al portal, vistas como OPORTUNIDADES.
//
// ── El agujero que cierra (medido el 07/09/2026) ────────────────────────────
//
// `seguros.portal_poliza_declarada` solo la leían `partes-portal.ts` y
// `export-rgpd.ts`. **Ninguna pantalla del corredor la miraba.** El cliente
// subía la póliza que tiene con otra compañía —con su vencimiento— y Alberto no
// se enteraba nunca. Este fichero es la mitad de BD; las reglas están en el
// módulo puro `@central/module-seguros-portal` (`lead-declarada.ts`) y la
// pantalla vive en `apps/plataforma` → `/correduria`, por el puerto
// `/api/operador/leads`.
//
// Se corre con `prisma_seguros` (BYPASSRLS), que tiene `SELECT` sobre las 20
// columnas de la tabla (comprobado en `information_schema.column_privileges`).
//
// ── Las tres ausencias que NO se rellenan ───────────────────────────────────
//
//   1. `cliente: null` = quien la subió no tiene fila en `portal_vinculo`: no lo
//      hemos casado con ninguna ficha. No es «Cliente desconocido» ni motivo
//      para esconder el lead — es el aviso de que hay que identificarlo antes
//      de llamar a nadie. Misma regla que en `partes-portal.ts`.
//   2. `yaEnCartera: null` = **no se ha podido comprobar** si esa póliza ya la
//      lleva la casa, que es exactamente lo que pasa cuando no hay ficha contra
//      la que cotejar el número. `false` diría que se miró y no estaba.
//   3. `estado: 'sin_confirmar'` = las fechas las leyó una máquina y nadie las
//      ha revisado. No se esconde y no se disfraza: se etiqueta, porque es
//      sobre esa fecha sobre la que Alberto decidiría a quién llama.
//
// 🚨 Y lo que este fichero NO hace, a propósito: **no retarifica**.
// Avant2/Codeoscopic cuesta 0,50 € por consulta y no es idempotente, así que
// ninguna pantalla ni ningún cron puede dispararlo desde aquí. El lead llega a
// Alberto y decide él.
import {
  fichaParaCotejar,
  leadDeclarada,
  leadUrgente,
  normalizarNumeroPoliza,
  normalizarTitular,
  ordenarLeads,
  type EntradaLead,
  type Lead,
  type TitularDeclarado,
} from '@central/module-seguros-portal'

import { prismaAsegura } from './asegura-db'
import { vinculosPorIdentidad } from './vinculos-portal'

export type LeadPortal = Lead & {
  /**
   * Si es trabajo de HOY. Se calcula AQUÍ, con `leadUrgente()` del módulo puro,
   * y viaja ya resuelto: así la regla vive en un solo sitio y plataforma no
   * necesita depender del módulo del portal para pintar su badge. Copiar el
   * umbral allí sería tener dos verdades sobre qué es urgente.
   */
  urgente: boolean
  /** `null` = no lo hemos casado con ninguna ficha de la cartera (ver cabecera). */
  clienteId: string | null
  /** Cuándo lo subió. Sirve para saber si es de hoy o lleva tres meses ahí. */
  subidaEn: Date
  /** El nombre del PDF, que es lo único que se guarda de él (no hay bucket todavía). */
  documentoNombre: string | null
  primaAnual: number | null
  /**
   * De quién dijo el cliente que era. TRES estados, y `sin_preguntar` es uno:
   * son todas las filas anteriores al 07/09/2026. La pantalla lo pinta, porque
   * «la subió a nombre de su empresa» cambia a quién llamas y qué le dices.
   */
  titular: TitularDeclarado
}

export type ResultadoLeads =
  | { ok: true; leads: LeadPortal[]; sinIdentificar: number }
  | { ok: false; motivo: string }

/**
 * 🚨 Degrada a `ok: false`, JAMÁS a una lista vacía. «No he podido leer los
 * leads» y «no hay ninguno» se pintan igual de vacíos, y solo uno de los dos
 * autoriza a decirle a Alberto que ahí no hay nada que trabajar. Es la misma
 * regla que gobierna `cartera-lista-asegura.ts` en plataforma.
 */
export async function listarLeads(correduriaId: string, hoy: Date = new Date()): Promise<ResultadoLeads> {
  try {
    const db = prismaAsegura()
    const filas = await db.portalPolizaDeclarada.findMany({
      select: {
        id: true,
        identidadId: true,
        compania: true,
        numeroPoliza: true,
        ramo: true,
        primaAnual: true,
        fechaVencimiento: true,
        confirmadaPorUsuario: true,
        documentoNombre: true,
        creadaEn: true,
        titularTipo: true,
        titularEmpresaNombre: true,
        titularEmpresaCif: true,
      },
      orderBy: { creadaEn: 'desc' },
    })
    if (filas.length === 0) return { ok: true, leads: [], sinIdentificar: 0 }

    const vinculos = await vinculosPorIdentidad(correduriaId, [...new Set(filas.map((f) => f.identidadId))])

    // Qué números de póliza tiene YA cada ficha en la cartera. Se pregunta de
    // una vez para todas las fichas implicadas: una consulta por lead sería N+1
    // sobre una pantalla que Alberto abre a diario.
    const clienteIds = [...new Set([...vinculos.values()])]
    const yaTiene = await numerosEnCartera(correduriaId, clienteIds)

    const leads: LeadPortal[] = []
    let sinIdentificar = 0
    for (const f of filas) {
      const clienteId = vinculos.get(f.identidadId) ?? null
      if (clienteId === null) sinIdentificar++

      const titular = normalizarTitular({
        tipo: f.titularTipo,
        nombre: f.titularEmpresaNombre,
        cif: f.titularEmpresaCif,
      })
      // 🚨 Contra QUÉ ficha se coteja lo decide el módulo puro, no este fichero.
      // Si se cotejara siempre contra la ficha personal de quien la sube, una
      // póliza que su SOCIEDAD ya tiene contratada con la casa saldría como
      // oportunidad — y se llamaría a un cliente para ofrecerle lo que ya se le
      // vendió. `null` = no hay contra qué cotejar, que NO es «no es nuestra».
      const fichaCotejo = fichaParaCotejar(titular, clienteId)

      const entrada: EntradaLead = {
        id: f.id,
        compania: f.compania,
        numeroPoliza: f.numeroPoliza,
        ramo: f.ramo,
        fechaVencimiento: f.fechaVencimiento,
        confirmadaPorUsuario: f.confirmadaPorUsuario,
        // Sin ficha CONTRA LA QUE COTEJAR no hay comprobación: `null`, no
        // `false`. Y eso pasa por dos motivos distintos que aquí dan lo mismo —
        // no lo hemos casado con nadie, o la dijo de su empresa.
        yaEnCartera: fichaCotejo === null ? null : yaEnLaCartera(yaTiene, fichaCotejo, f.numeroPoliza),
      }
      const lead = leadDeclarada(entrada, hoy)
      if (lead === null) continue

      leads.push({
        ...lead,
        urgente: leadUrgente(lead),
        clienteId,
        subidaEn: f.creadaEn,
        documentoNombre: f.documentoNombre,
        // `Decimal` de Prisma → number, y `null` sigue siendo `null`: 0 sería
        // decir que la póliza cuesta cero euros.
        primaAnual: f.primaAnual === null ? null : Number(f.primaAnual),
        titular,
      })
    }

    return { ok: true, leads: ordenarLeads(leads) as LeadPortal[], sinIdentificar }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * `null` cuando la póliza declarada no trae número: sin número no se puede
 * cotejar, y decir `false` afirmaría que se miró. Es el mismo «no lo sé» que la
 * falta de ficha, por otra causa.
 */
function yaEnLaCartera(
  porCliente: Map<string, Set<string>>,
  clienteId: string,
  numeroPoliza: string | null,
): boolean | null {
  const numero = normalizarNumeroPoliza(numeroPoliza)
  if (numero === null) return null
  return porCliente.get(clienteId)?.has(numero) ?? false
}

/** Números de póliza que cada ficha ya tiene en la cartera VIVA. */
async function numerosEnCartera(correduriaId: string, clienteIds: string[]): Promise<Map<string, Set<string>>> {
  const mapa = new Map<string, Set<string>>()
  if (clienteIds.length === 0) return mapa
  const filas = await prismaAsegura().poliza.findMany({
    where: { correduriaId, clienteId: { in: clienteIds } },
    select: { clienteId: true, numeroPoliza: true },
  })
  for (const f of filas) {
    const n = normalizarNumeroPoliza(f.numeroPoliza)
    if (n === null) continue
    const set = mapa.get(f.clienteId) ?? new Set<string>()
    set.add(n)
    mapa.set(f.clienteId, set)
  }
  return mapa
}
