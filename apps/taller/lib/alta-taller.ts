/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Alta de un taller por el OPERADOR (Grupo ASegura): fila del taller + configuración de alta + primer dueño con PIN temporal.
//   · El PIN temporal se devuelve UNA vez en la respuesta; en BD solo el hash, y `debe_cambiar_pin` obliga a cambiarlo al entrar.
//   · Idempotente por NIF: un NIF ya dado de alta (y completo) responde 409 con el id existente y NO crea nada ni genera otro PIN.
//   · Los valores de alta salen de `configDeAlta()` (module-taller): ni un precio, IVA o intervalo literal aquí.
import { z } from 'zod'
import { configDeAlta } from '@central/module-taller'
import { auditar, escalaresDeConfig, guardarConfig, type TxConfig } from './config-repo.ts'
import { altaUsuario, ErrorPersonal, type TxPersonal } from './personal.ts'
import type { ConTaller } from './rls.ts'

const NIF = /^[A-Z0-9]{8,12}$/

export const EntradaAlta = z.object({
  razonSocial: z.string().trim().min(1).max(200),
  nombreComercial: z.string().trim().min(1).max(200).optional(),
  nif: z.string().trim().max(20).optional(),
  duenoNombre: z.string().trim().min(1).max(200),
})

export type ResultadoAlta =
  | { ok: true; tallerId: string; usuarioId: string; pinTemporal: string }
  | { ok: false; status: 400 | 409; error: string; tallerId?: string }

type TxAlta = TxConfig & TxPersonal

export async function altaTaller(
  deps: { crearTaller(d: { razonSocial: string; nombreComercial: string; nif: string | null }): Promise<{ id: string; creado: boolean }>; conTaller: ConTaller<TxAlta> },
  entrada: unknown,
  aleatorio?: () => number,
): Promise<ResultadoAlta> {
  const p = EntradaAlta.safeParse(entrada)
  if (!p.success) return { ok: false, status: 400, error: 'Faltan datos (razonSocial y duenoNombre) o no son válidos' }
  const nif = p.data.nif ? p.data.nif.toUpperCase().replace(/[\s-]/g, '') : null
  if (nif !== null && !NIF.test(nif)) return { ok: false, status: 400, error: 'NIF no válido' }
  const t = await deps.crearTaller({ razonSocial: p.data.razonSocial, nombreComercial: p.data.nombreComercial ?? p.data.razonSocial, nif })

  return deps.conTaller(t.id, async (tx) => {
    const yaCompleto = !!(await (tx as any).configuracion.findUnique({ where: { tallerId: t.id } }))
    // Taller ya dado de alta Y completo: nada que hacer (idempotente). Si quedó a medias (fila sin configuración), se completa.
    if (!t.creado && yaCompleto) return { ok: false as const, status: 409 as const, error: 'Ya existe un taller con ese NIF', tallerId: t.id }
    const alta = configDeAlta()
    await (tx as any).configuracion.create({ data: { tallerId: t.id, ...escalaresDeConfig(alta) } })
    await guardarConfig(tx, t.id, alta)
    const dueno = await altaUsuario(tx, t.id, { nombre: p.data.duenoNombre, rol: 'dueno' }, aleatorio)
    await auditar(tx, { tallerId: t.id, usuarioId: dueno.id, entidad: 'talleres', entidadId: t.id, accion: 'alta_operador', antes: null, despues: { nif, dueno: p.data.duenoNombre } })
    return { ok: true as const, tallerId: t.id, usuarioId: dueno.id, pinTemporal: dueno.pin }
  }, { timeout: 30_000 }).catch((e: unknown) => {
    if (e instanceof ErrorPersonal) return { ok: false as const, status: 400 as const, error: e.message }
    throw e
  })
}

/** Manejador del POST (separado de la ruta para poder probarlo: la autorización se inyecta). */
export function crearManejadorAlta(deps: { autorizado(req: Request): boolean; alta(entrada: unknown): Promise<ResultadoAlta> }) {
  return async function POST(req: Request): Promise<Response> {
    if (!deps.autorizado(req)) return json({ error: 'No autorizado' }, 401)
    const cuerpo = await req.json().catch(() => null)
    const r = await deps.alta(cuerpo)
    if (!r.ok) return json({ error: r.error, ...(r.tallerId ? { tallerId: r.tallerId } : {}) }, r.status)
    return json({ tallerId: r.tallerId, usuarioId: r.usuarioId, pinTemporal: r.pinTemporal, debeCambiarPin: true }, 201)
  }
}

// `no-store`: la respuesta lleva el PIN temporal, que no debe quedar en ninguna caché.
const json = (o: unknown, status: number) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
