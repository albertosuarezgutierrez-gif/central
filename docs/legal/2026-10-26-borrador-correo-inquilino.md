# BORRADOR — Correo de invitación al inquilino (P17) y texto de consentimiento

> **Estado: BORRADOR. NO SE HA ENVIADO NADA.** Sin revisar por un jurista y sin OK de Alberto para ningún envío concreto.
> El portal **no envía** este correo: lo genera el propietario (nivel Total) como un ENLACE de un solo uso que copia o comparte él
> mismo (botón «Copiar enlace» / «Compartir…» del móvil). Este texto es, si Alberto lo aprueba, lo que el propietario podría
> pegar al compartirlo, o lo que ofrecería el portal como texto sugerido. Cualquier envío desde `apps/asegura` exigiría un OK
> explícito de Alberto **para ese envío** (CLAUDE.md raíz).

## 1. Reglas que el texto cumple (checklist para la revisión)

- **Sin datos de póliza**: ni compañía, ni importe, ni matrícula, ni número de póliza (`CAMPOS_PROHIBIDOS_EN_INVITACION`).
- **Sin argumento comercial**: ninguna oferta, descuento ni mención a seguros de hogar. Es una comunicación **operativa** del
  propietario hacia su inquilino (art. 21 LSSI: no es comunicación comercial). Si algún día se quisiera añadir una oferta, ya no
  vale este texto: pasa a necesitar consentimiento previo.
- **El token no abre sesión**: el enlace lleva a una pantalla que pide el código de un solo uso al correo o móvil del inquilino.
- **Nada del propietario salvo el nombre que él mismo escribe** al crear el enlace.
- **El inquilino nunca es lead sin su propio consentimiento**, que es opcional, separado, no premarcado y se pide DENTRO, después
  de entrar, nunca en este correo.

## 2. Texto del correo / mensaje (para que lo envíe el propietario)

**Asunto:** Tu contrato de alquiler, en un enlace

> Hola {nombre del inquilino}:
>
> Te dejo un enlace para que puedas ver tu contrato de alquiler (la renta, las fechas y los recibos que te comparta) y subir
> justificantes, por ejemplo el recibo de tu seguro de hogar, sin tener que mandármelos por mensaje.
>
> {enlace de un solo uso}
>
> - El enlace sirve **una sola vez** y caduca a los 14 días.
> - Para entrar te pedirá tu correo o móvil y te mandará un código; no hace falta contraseña.
> - Solo verás **tu** contrato, nada más.
> - Puedes dejar de verlo cuando quieras desde la propia página, y yo también puedo retirártelo.
>
> {nombre con el que se presenta el propietario}

Notas para quien lo revise:
- El `{enlace}` lo genera el portal; el correo **no** incluye el nombre del inmueble ni la dirección (el enlace es reenviable y,
  sin haber probado quién es, la página tampoco los enseña).
- No se menciona a Grupo ASegura en el cuerpo: lo hace la propia pantalla del portal.

## 3. Texto de consentimiento comercial propio del inquilino (versión `2026-10-26-borrador-1`)

Vive en `packages/module-patrimonio/src/inquilino-acceso.ts` (`TEXTO_CONSENTIMIENTO_INQUILINO`, `VERSION_CONSENTIMIENTO_INQUILINO`).
Se muestra dentro de «Mi alquiler», con la casilla **sin marcar**:

> Quiero que Grupo ASegura, correduría de seguros, me haga llegar por este portal ofertas de seguros que puedan interesarme como
> inquilino (por ejemplo, un seguro de hogar). Es opcional: puedes usar esta página sin aceptar, y puedes retirarlo cuando quieras
> desde aquí mismo. Tu propietario no sabrá si lo aceptas o no. Mientras no lo aceptes no te mostraremos ninguna oferta.

Comportamiento (ya implementado y cubierto por tests):
- Mientras no haya un «sí» **de la versión vigente**, **cero ofertas** (`puedeRecibirOfertasInquilino`).
- El último gesto manda (tabla append-only): retirar corta las ofertas al instante.
- Si el texto cambia (versión nueva), el «sí» anterior deja de valer hasta que lo vuelva a dar.
- El consentimiento es de la **persona** (identidad), no del contrato; sin acceso vivo tampoco hay ofertas.
- «Tu propietario no sabrá si lo aceptas»: ninguna pantalla del propietario lee el consentimiento.

## 4. Pendiente para jurídico / Alberto (nada de esto está hecho)

1. Revisar el texto del correo (sección 2) y el de consentimiento (sección 3); confirmar que el consentimiento cumple el art. 6.1.a
   y 7 RGPD y el art. 21 LSSI para su canal (aviso dentro del portal).
2. **Política de privacidad** (`app/legal/*`): añadir el tratamiento del inquilino (qué se guarda: acceso, consentimiento,
   justificantes que sube; base jurídica; plazo) y **subir `VERSION_TEXTOS_LEGALES`** en el mismo cambio. No se ha tocado en este
   paso para no publicar una afirmación sin revisar.
3. **Encargo de tratamiento** del propietario sobre los datos de su inquilino (`encargo_patrimonio`, P15): el inquilino accede por
   su propia identidad, pero sus datos (nombre, NIF, contacto) siguen cifrados en el puente de `apps/asegura`.
4. Decidir si la **renta actualizada** se muestra solo cuando consta como notificada (así está hecho ahora: una subida aplicada y no
   notificada no se enseña como vigente) o también la anotada sin notificar.
5. Decidir el plazo de acceso tras terminar el contrato (hoy 60 días, `DIAS_ENLACE_TRAS_TERMINAR`).
6. OK de Alberto antes de **cualquier envío real** (a través de `apps/asegura`, si algún día se quiere que el portal lo mande en
   lugar de que lo comparta el propietario).
