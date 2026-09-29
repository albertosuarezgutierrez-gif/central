import { prismaAsegura } from '../asegura-db'
import { descifrarCampo } from '../cartera-edicion'
import { contrasenasDesdeDni } from './pdf-contrasena'

/**
 * Contraseñas candidatas para un PDF protegido, sacadas del DNI de la ficha (de ESA
 * correduría). Se descifra aquí y no sale de asegura. `[]` = la ficha no tiene DNI;
 * un DNI guardado que no descifra LANZA: eso es «no se ha podido mirar», no «no hay».
 */
export async function contrasenasDeLaFicha(correduriaId: string, clienteId: string): Promise<string[]> {
  const cliente = await prismaAsegura().cliente.findFirst({ where: { id: clienteId, correduriaId }, select: { dni: true } })
  const dni = descifrarCampo(cliente?.dni)
  if (cliente?.dni && dni === null) throw new Error('el DNI de la ficha no se puede descifrar')
  return contrasenasDesdeDni(dni)
}
