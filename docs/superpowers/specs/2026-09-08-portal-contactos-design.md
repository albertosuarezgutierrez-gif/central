# Portal del cliente — pestaña «Contactos» (08/09/2026)

**Petición de Alberto:** *«añadir en la intranet clientes una pestaña de contactos para que los
propios clientes puedan pedir autorización de ver sus pólizas… que puedan invitar a más gente…
¿te gusta la aplicación? recomiéndanos: nombre, tipo relación y mail y se le manda un mail de
presentación. Más adelante, regalos por traer gente».* Aprobado el diseño de la Fase 1 en la misma
conversación («ok… haz todo»).

## Lo que ya existía (04/09/2026) y por qué esto es una fase corta

Las tres puertas de la autorización estaban construidas en `/autorizaciones`: conceder a alguien de
la cartera, pedir acceso, e invitar por correo a quien no está (`portal_invitacion`, token hasheado,
aceptación atada al correo). Lo que faltaba respecto a la petición: **nombre** y **relación** del
invitado (la lista de José reconocía cada invitación por su fecha, porque el correo se guarda
hasheado), un nombre de pestaña que la gente entienda, y la variante «solo te presento el portal».

## Decisiones

1. **La pestaña pasa a llamarse «Contactos»; la ruta `/autorizaciones` NO cambia** (enlaces
   guardados). Título «Mis contactos».
2. **La invitación pide nombre y relación** (obligatorios en pantalla; `NULL` en las filas
   anteriores). La relación usa **el vocabulario de `cliente_relaciones.tipo_relacion`**
   (`TIPOS_RELACION`) para poder copiarla tal cual cuando el invitado tenga ficha; el portal ofrece un
   subconjunto (`RELACIONES_INVITACION`). Un CHECK de la BD repite la lista y un cepo raíz obliga a que
   las dos sean la misma.
3. **El nombre va en el saludo del correo; la relación NUNCA.** «Su hija» es un dato de la relación
   entre dos personas y quien abre el buzón puede no ser ninguna de las dos. `relacion` entra en
   `CAMPOS_PROHIBIDOS_EN_INVITACION`.
4. **«Recomiéndanos» = alcance `ninguno` (`SIN_COMPARTIR`)**: la misma invitación sin compartir un
   solo seguro. Al aceptar se sella la invitación y **no se crea `portal_autorizacion`** (CHECK
   `portal_invitacion_acepta_con_sello` aflojado solo para ese alcance; `poliza_id` forzado a NULL).
   El correo dice quién invita y que no se comparte nada, **sin argumento de venta**: es un acto entre
   personas, no una comunicación comercial de la correduría (art. 21 LSSI).
5. **Regalos por traer gente: APARCADO.** Un premio por quien acabe contratando convierte al cliente
   en colaborador externo del mediador (RDL 3/2020: registro, formación, contrato), y el copy de la
   casa ya evita prometer ahorros para no entrar en asesoramiento. Se anota en
   `docs/CORREDURIA-INTRANET-IDEAS.md` con el bloqueo; no se toca sin revisión legal.

## Piezas

- Módulo puro `packages/module-seguros-portal/src/invitacion.ts` (apartado «Contactos»):
  `MAX_NOMBRE_INVITADO`, `normalizarNombreInvitado`, `relacionInvitacion`, `RELACIONES_INVITACION`,
  `SIN_COMPARTIR`, `ALCANCES_INVITACION`, `alcanceInvitacion`, `invitacionAbreAcceso`,
  `TEXTO_INVITACION_SIN_ACCESO`.
- Migración `apps/asegura-portal/prisma/sql/2026-09-08_portal_invitacion_contacto.sql` (aplicada).
- BD: `lib/invitaciones.ts` (crear con nombre/relación, `ninguno` sin `ya_autorizado` ni póliza;
  responder sin autorización). Correo: `lib/correo-invitacion.ts` (`invitado`, `abreAcceso`).
- Pantallas: `app/(portal)/autorizaciones/*` (formulario «Añadir una persona», lista «Personas que
  has invitado» con nombre y relación), `app/invitacion/[token]/*` (aceptar sin acceso).
- Cepos: `invitacion.test.ts` (puro), `lib/invitaciones.test.ts`, `test/regression-portal-contactos.test.ts`.

## Pendiente conocido

- Copiar la relación a `cliente_relaciones` cuando el invitado acabe teniendo ficha: hoy vive en
  `portal_invitacion` (con `autorizacion_id` como costura). El rol del portal solo tiene `SELECT`
  sobre `cliente_relaciones`; eso es trabajo del puerto del corredor, no del portal.
