# Portal del cliente — ideas, medidas y ordenadas (03/09/2026)

> Cuaderno de trabajo, no un roadmap aprobado. Cada idea lleva **por qué**, **qué
> hay ya en el repo** y **qué la bloquea de verdad**. Lo que no se ha medido se
> dice como no medido.

## 0. El dato que ordena todo lo demás

> 🔄 **Re-medido el 05/09/2026 contra la BD.** Las cifras del 03/09 que había aquí
> («0 vínculos», «32.602 fichas / 4.310 con índice ciego») ya no son ciertas, y una
> de ellas dejaba abierta una duda grave. Se corrigen abajo; el ORDEN que proponía
> esta nota no cambia, porque el cuello de botella sigue siendo el mismo.

**✅ La duda que quedaba abierta está resuelta: la `PII_LOOKUP_KEY` del portal SÍ
casa con la de `asegura`.** De los 2 vínculos que existen, **uno tiene
`origen = email_hash`**: alguien se vinculó SOLO, sin intervención. El 03/09 quedó
sin resolver si el caso del cliente que entró y vio la bóveda vacía fue por usar
otro email o porque las claves diferían — y en ese segundo caso *ningún* cliente se
habría vinculado nunca, sin un solo error en los logs. Ese escenario queda
descartado por observación directa, no por inspección de envs.

**Lo que sí sigue siendo el cuello de botella, y ahora medido donde importa:**

| Medida (05/09/2026) | Valor |
|---|---|
| Identidades que han entrado al portal | 3 |
| Vínculos (`portal_vinculo`) | 2 — uno `manual`, uno `email_hash` |
| **Cartera VIVA: titulares** | **80** |
| **Cartera VIVA: con email localizable** | **51** |
| **Cartera VIVA: SIN email localizable** | **29** |
| Toda la cartera: fichas (no fusionadas) | 31.947 |
| Toda la cartera: con email localizable | 4.663 |

🚨 **La cifra que decide es 29, no 4.663.** Más de uno de cada tres clientes VIVOS
no tiene un email por el que el portal pueda encontrarle. A esos, **entren como
entren** —código, Google, huella o WhatsApp—, la bóveda les sale vacía, y en
pantalla eso es indistinguible de «no tienes seguros con nosotros».

Los 28.000 y pico leads sin email son otro problema y no urge: no van a entrar
mañana. Los 29 son personas concretas de la cartera de hoy.

Añadir formas de entrar a un edificio en el que aún no ha entrado nadie mejora la
foto, no el negocio. Caso medido el 03/09: una clienta con **dos fichas** —la que
tiene la relación con la empresa NO tiene índice ciego, y la que sí lo tiene está
vacía—. Entre con el email que entre, hoy no llega a nada. Ese caso es de fusión
de duplicados, no de método de acceso.

## 1. Entrar con Google — pedido por Alberto (03/09/2026)

**Estado real: no existe nada** (confirmado de nuevo el 05/09/2026). Medido en todo el monorepo: cero WebAuthn, cero
passkeys, y el único Google OAuth es el de `apps/ia-rest` contra Drive/Blog
(servidor a servidor, no login de personas). `apps/sivra` usa NextAuth con
usuario y contraseña contra dos variables de entorno — es el acceso de Alberto,
no reutilizable. Lo de «casi terminado» no está en este repo.

⚠️ **Y hay un problema de fondo, no de implementación:** el portal vincula por el
índice ciego del **email de la ficha**. Si el Google del cliente no es el email
que la correduría tiene apuntado, entra y no ve nada — que es exactamente el
fallo de la clienta de las dos fichas, multiplicado. **Google login sin arreglar antes la cobertura de
emails empeora el problema, no lo arregla.**

Si se hace, el orden correcto es: (1) subir la cobertura del índice ciego, (2)
permitir que una identidad reclame su ficha por un segundo dato (DNI o número de
póliza) cuando el email no case, y (3) entonces sí, Google como atajo.

## 2. Huella digital — pedido por Alberto (03/09/2026)

**«Huella» no es un método que controlemos: es WebAuthn/passkey**, y la huella
nunca sale del móvil. Dos consecuencias que conviene tener claras antes:

- **Un passkey está atado a un dispositivo.** Quien cambie de móvil necesita otra
  vía, y esa vía —el código por email— sigue siendo el nivel de seguridad real.
  Añadir el passkey encima **hace que parezca más seguro sin serlo más**, salvo
  que se prohíba la vía de recuperación, que dejaría fuera a medio mundo.
- **La demografía juega en contra.** Esta cartera son 80 clientes vivos, muchos
  de 50-70 años. Un passkey que se pierde con el móvil es una llamada a Alberto.

Lo que sí vale, y es barato: **no pedir el código en cada entrada.** Sesión
larga con cookie firmada y re-verificación solo para lo sensible (autorizar a un
tercero, cambiar IBAN). Eso da la sensación de «entra sin fricción» que se busca
con la huella, sin dispositivo de por medio.

Veredicto: **útil como comodidad, nunca como único acceso, y después de la
cobertura de identidad.**

## 3. WhatsApp como canal de entrada

`portal_canal` ya está montado con el hueco de la WABA, y `canal_no_disponible`
(503) ya distingue «no hay canal» de «el envío falló». Para esta demografía
WhatsApp abre más que el correo, y el teléfono ya está en la ficha.

⚠️ El teléfono identifica un **hogar**, no una persona: el spec del portal ya
decide que el teléfono **no vincula solo**. Sirve para entregar el código, no
para decidir de quién es la ficha.

## 4. El aviso de vencimiento que se puede accionar

Ya existe `module-seguros-portal/obligacion.ts` con `DIAS_PREAVISO_TOMADOR = 30`
(art. 22 LCS). Hoy calcula; no habla con nadie.

La pieza que falta: 45 días antes, el cliente recibe «tu seguro del coche vence
el 19/09 y pagas 612,00€ al año — ¿quieres que mire alternativas?» con un botón
que crea la petición. **Eso es literalmente lo que hace un corredor**, y es la
única función del portal que genera ingreso en vez de ahorrar una llamada.

## 5. La póliza de OTRA compañía

`portal_poliza_declarada` y `lib/extraer-poliza.ts` ya existen. Es el gancho de
captación: «trae lo que tengas, aunque no seas cliente nuestro». Convierte el
portal de herramienta de servicio en herramienta de captación, y no necesita
ninguna integración nueva.

## 6. Traducir las coberturas a lenguaje llano

`poliza_coberturas` trae la descripción tal cual la manda la compañía. Un cliente
no sabe si tiene lunas, ni si el kilómetro cero se lo cubren. Una traducción por
ramo —hecha una vez, no por IA en cada carga— es de las cosas que más se notan y
menos cuestan.

🚨 Con la regla de los tres estados: `coberturas.total === 0` es **«la compañía no
ha informado ninguna»**, no «no tienes ninguna». No se puede pintar igual.

## 7. Duplicados en la cartera

El caso medido tiene **dos fichas** de la misma persona, con emails y teléfonos
distintos (se omite el nombre a propósito: esto es un doc del repo). Un cliente que se
ve duplicado pierde la confianza que el portal intenta construir, y el
duplicado además parte su historial. Antes de invitar a nadie conviene una
pasada de fusión con la regla de la casa: **agrupar por identificador, nunca por
el nombre** — dos DNI distintos no se funden jamás.

## 8. Lo que ya está construido y es el mensaje

No es una idea nueva: es que **ya está hecho y hay que contarlo**. El cliente ve
**quién más puede ver sus pólizas**, con qué alcance, hasta cuándo, **qué días
entró esa persona a mirar**, y se lo quita él mismo. Ningún portal de correduría
español que se haya mirado enseña el control, solo las pólizas.

## Orden que propongo

1. Cobertura de identidad (índice ciego) y fusión de duplicados — **desbloquea todo**.
2. Invitar a los primeros clientes de verdad.
3. Aviso de vencimiento accionable.
4. WhatsApp como canal.
5. Sesión larga con re-verificación para lo sensible.
6. Passkeys y Google, como comodidad, cuando haya gente dentro.
