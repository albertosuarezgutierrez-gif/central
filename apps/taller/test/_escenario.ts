/* eslint-disable @typescript-eslint/no-explicit-any */
// Escenario común: un taller con config de alta + paquete, y un 2.º taller para aislamiento. BD falsa con RLS emulado.
import { configDeAlta, type ConfigTaller } from '@central/module-taller'
import { almacenSoloMetadatos } from '../lib/almacen.ts'
import { notificadorRegistro } from '../lib/notificador.ts'
import { crearRecepcion, type EntradaRecepcion } from '../lib/recepcion.ts'
import { crearConTaller } from '../lib/rls.ts'
import { crearBdFake } from './_fake-prisma.ts'

export const T = 'f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b'
export const T2 = '00000000-0000-4000-8000-000000000002'
export const AHORA = new Date('2026-11-04T10:00:00Z')

export function configTaller(): ConfigTaller {
  const c = configDeAlta()
  c.precioHoraCent = 6000 // distinto del de alta: el cálculo sale de la config
  c.paquetes = [{ codigo: 'revision', nombre: 'Revisión', baremoMinutos: 60, precioCerradoPorTipo: {}, piezas: [], requiereAceite: false, activo: true }]
  return c
}

export function montar() {
  const bd = crearBdFake()
  bd.sembrar('taller', { id: T })
  bd.sembrar('taller', { id: T2 })
  const dueno = bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Dueño', rol: 'dueno', pinHash: 'x' })
  const mec = bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Mecánico', rol: 'mecanico', pinHash: 'x' })
  const mec2 = bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Mecánico 2', rol: 'mecanico', pinHash: 'x' })
  const baja = bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Baja', rol: 'dueno', pinHash: 'x', activo: false })
  return { bd, conTaller: crearConTaller(bd.cliente), dueno, mec, mec2, baja, config: configTaller() }
}

export function entrada(o: Partial<EntradaRecepcion> = {}): EntradaRecepcion {
  return {
    tallerId: T, usuarioId: 'u', matricula: '1234 bcd', clienteId: null,
    cliente: { nombre: 'Ana Pérez', movil: '600111222', correo: '' }, direccion: null, km: 120000, combustible: '1/2', objetos: '', motivo: 'Ruido',
    danos: null, seguro: null, fotos: [], firma: { mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) },
    casillas: { asegura: false, taller: false }, ip: null, userAgent: null, ahora: AHORA, ...o,
  }
}

export async function recibir(m: ReturnType<typeof montar>, o: Partial<EntradaRecepcion> = {}) {
  return m.conTaller(T, (tx: any) =>
    crearRecepcion(tx, entrada(o), {
      config: m.config, almacen: almacenSoloMetadatos, notificador: notificadorRegistro(tx),
      textoTaller: { version: m.config.textos.versionTextoComercialTaller, texto: m.config.textos.textoConsentimientoComercialTaller },
    }),
  )
}
