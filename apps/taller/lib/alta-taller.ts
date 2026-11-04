/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Alta de un taller por el OPERADOR (Grupo ASegura): fila del taller + configuración de alta + primer dueño con PIN temporal.
//   · El PIN temporal se devuelve UNA vez en la respuesta; en BD solo el hash, y `debe_cambiar_pin` obliga a cambiarlo al entrar.
//   · Idempotente por NIF: un NIF ya dado de alta (y completo) responde 409 con el id existente y NO crea nada ni genera otro PIN.
//   · El NIF es OBLIGATORIO (validado): la idempotencia del alta es por NIF y sin NIF dos altas crearían dos talleres.
//   · Se genera el CÓDIGO del taller (paso 1 del login) y se devuelve al operador; también en el 409 (sin él, el dueño no podría entrar).
//   · La empresa de rrhh (`rrhhEmpresaId`) la fija SOLO el operador, aquí o por PATCH; el dueño no puede cambiarla desde Ajustes.
//   · Los valores de alta salen de `configDeAlta()` (module-taller): ni un precio, IVA o intervalo literal aquí.
import { z } from 'zod'
import { configDeAlta } from '@central/module-taller'
import { auditar, escalaresDeConfig, guardarConfig, type TxConfig } from './config-repo.ts'
import { altaUsuario, ErrorPersonal, type TxPersonal } from './personal.ts'
import { fijarCodigoTaller } from './bloqueos-ajustes.ts'
import { validarEmpresaRrhh } from './vinculo-rrhh.ts'
import { direccionOpcional, type Direccion } from './direccion.ts'
import type { ConTaller } from './rls.ts'

const NIF = /^[A-Z0-9]{8,12}$/

export const EntradaAlta = z.object({
  razonSocial: z.string().trim().min(1).max(200),
  nombreComercial: z.string().trim().min(1).max(200).optional(),
  nif: z.string().trim().min(1).max(20),
  // uuid de la empresa en rrhh (opcional): solo el operador la fija.
  rrhhEmpresaId: z.string().trim().max(60).nullish(),
  duenoNombre: z.string().trim().min(1).max(200),
  // Opcional: CP → provincia → municipio → calle → número. Vacía = sin dirección; a medias = 400 (nunca se inventa).
  direccion: z.object({ cp: z.string(), provincia: z.string(), municipio: z.string(), via: z.string(), numero: z.string() }).partial().optional(),
})

export type ResultadoAlta =
  | { ok: true; tallerId: string; usuarioId: string; pinTemporal: string; codigoTaller: string }
  | { ok: false; status: 400 | 409; error: string; tallerId?: string; codigoTaller?: string }

type TxAlta = TxConfig & TxPersonal

export async function altaTaller(
  deps: {
    crearTaller(d: { razonSocial: string; nombreComercial: string; nif: string | null }): Promise<{ id: string; creado: boolean }>
    conTaller: ConTaller<TxAlta>
    fijarRrhhEmpresa?(tallerId: string, empresaId: string | null): Promise<boolean>
  },
  entrada: unknown,
  aleatorio?: () => number,
): Promise<ResultadoAlta> {
  const p = EntradaAlta.safeParse(entrada)
  if (!p.success) return { ok: false, status: 400, error: 'Faltan datos (razonSocial, nif y duenoNombre) o no son válidos' }
  const nif = p.data.nif.toUpperCase().replace(/[\s-]/g, '')
  if (!NIF.test(nif)) return { ok: false, status: 400, error: 'NIF no válido' }
  let rrhhEmpresaId: string | null = null
  try {
    rrhhEmpresaId = p.data.rrhhEmpresaId ? validarEmpresaRrhh(p.data.rrhhEmpresaId) : null
  } catch (e) {
    if (e instanceof ErrorPersonal) return { ok: false, status: 400, error: e.message }
    throw e
  }
  const dir = direccionOpcional({ cp: '', provincia: '', municipio: '', via: '', numero: '', ...(p.data.direccion ?? {}) } as Direccion)
  if (!dir.ok) return { ok: false, status: 400, error: dir.errores.join('. ') }
  const t = await deps.crearTaller({ razonSocial: p.data.razonSocial, nombreComercial: p.data.nombreComercial ?? p.data.razonSocial, nif })
  // Vínculo con rrhh: solo en un alta NUEVA (en un taller que ya existe se cambia con PATCH, a propósito). Antes de la transacción del
  // dueño para no perder el PIN temporal si esto falla.
  if (t.creado && rrhhEmpresaId && deps.fijarRrhhEmpresa) await deps.fijarRrhhEmpresa(t.id, rrhhEmpresaId)

  return deps.conTaller(t.id, async (tx) => {
    const yaCompleto = !!(await (tx as any).configuracion.findUnique({ where: { tallerId: t.id } }))
    // Taller ya dado de alta Y completo: nada que hacer (idempotente). Si quedó a medias (fila sin configuración), se completa.
    if (!t.creado && yaCompleto) {
      const ya = await (tx as any).taller.findFirst({ where: { id: t.id }, select: { codigoAcceso: true } })
      return { ok: false as const, status: 409 as const, error: 'Ya existe un taller con ese NIF', tallerId: t.id, ...(ya?.codigoAcceso ? { codigoTaller: ya.codigoAcceso as string } : {}) }
    }
    const alta = configDeAlta()
    await (tx as any).configuracion.create({ data: { tallerId: t.id, ...escalaresDeConfig(alta) } })
    await guardarConfig(tx, t.id, alta)
    // Dirección del alta (columnas con UPDATE concedido, 0002). Solo si vino completa; si no, queda sin dirección.
    if (dir.direccion) await (tx as any).taller.update({ where: { id: t.id }, data: dir.direccion })
    const existente = await (tx as any).taller.findFirst({ where: { id: t.id }, select: { codigoAcceso: true } })
    const codigoTaller: string = existente?.codigoAcceso ?? (await fijarCodigoTaller(tx as any, t.id, null))
    const dueno = await altaUsuario(tx, t.id, { nombre: p.data.duenoNombre, rol: 'dueno' }, aleatorio)
    await auditar(tx, { tallerId: t.id, usuarioId: dueno.id, entidad: 'talleres', entidadId: t.id, accion: 'alta_operador', antes: null, despues: { nif, dueno: p.data.duenoNombre } })
    return { ok: true as const, tallerId: t.id, usuarioId: dueno.id, pinTemporal: dueno.pin, codigoTaller }
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
    if (!r.ok) return json({ error: r.error, ...(r.tallerId ? { tallerId: r.tallerId } : {}), ...(r.codigoTaller ? { codigoTaller: r.codigoTaller } : {}) }, r.status)
    return json({ tallerId: r.tallerId, usuarioId: r.usuarioId, pinTemporal: r.pinTemporal, codigoTaller: r.codigoTaller, debeCambiarPin: true }, 201)
  }
}

const UuidOp = z.string().trim().uuid()
const EntradaVinculo = z.object({ tallerId: UuidOp, rrhhEmpresaId: z.string().trim().max(60).nullable() })

/** PATCH { tallerId, rrhhEmpresaId | null }: el operador fija (o quita) la empresa de rrhh de un taller. El dueño NO puede (0006). */
export function crearManejadorVinculoRrhh(deps: { autorizado(req: Request): boolean; fijar(tallerId: string, empresaId: string | null): Promise<boolean> }) {
  return async function PATCH(req: Request): Promise<Response> {
    if (!deps.autorizado(req)) return json({ error: 'No autorizado' }, 401)
    const b = EntradaVinculo.safeParse(await req.json().catch(() => null))
    if (!b.success) return json({ error: 'Faltan tallerId (uuid) y rrhhEmpresaId (uuid o null)' }, 400)
    let empresa: string | null
    try {
      empresa = b.data.rrhhEmpresaId ? validarEmpresaRrhh(b.data.rrhhEmpresaId) : null
    } catch (e) {
      if (e instanceof ErrorPersonal) return json({ error: e.message }, 400)
      throw e
    }
    if (!(await deps.fijar(b.data.tallerId, empresa))) return json({ error: 'Taller no encontrado' }, 404)
    return json({ tallerId: b.data.tallerId, rrhhEmpresaId: empresa }, 200)
  }
}

// `no-store`: la respuesta lleva el PIN temporal, que no debe quedar en ninguna caché.
const json = (o: unknown, status: number) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
