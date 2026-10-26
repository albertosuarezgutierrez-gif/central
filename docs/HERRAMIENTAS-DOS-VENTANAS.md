# Arquitectura «dos ventanas»: Herramientas y Seguros (propuesta, 26/10/2026, v2 con los requisitos nuevos de Alberto)

Esto es solo análisis: no se ha tocado código. [Seguro] = lo he leído en el código · [Probable] = deducido · [Suposición] = depende de Alberto o del abogado.

## 0. Lo que hay hoy y condiciona el diseño
- **rrhh, responsable:** entra con **correo + código de 6 cifras** (`/api/auth/acceso/{solicitar,verificar}`). La contraseña bcrypt es **opcional y solo para los correos de `RRHH_LOGIN_PASSWORD_EMAILS`** (sin la variable, nadie entra con contraseña ni se ofrece el botón; `/api/auth/acceso/password`). [Seguro, 26/10/2026]
- **rrhh, empleado:** entra con OTP, o por **enlace/token sin email verificado** (`/e/[token]`) + PIN. [Seguro]
- **Un solo `JWT_SECRET`** para cuatro tipos de token, separados por `typ`. [Seguro]
- **Un único rol:** `usuarios_rrhh` (email UNIQUE global) + `usuario_empresas` N:N. **`rrhh.empresas` no tiene NIF.** [Seguro]
- **El alta** (`POST /api/operador/empresas`, adaptador `plataforma/lib/adapters/rrhh.ts`) exige la contraseña del responsable. [Seguro]
- **La marca** se decide por la env `RRHH_EMPRESAS_MARCA_ASEGURA`. [Seguro]
- **El portal** tiene cookie, secreto y rol de BD propios, separados **a propósito** de `apps/asegura`. [Seguro]
- **El catálogo de herramientas** es `MODULOS_PORTAL = flota|rrhh|alquileres`. Las solicitudes caen en `portal_modulo`, sin pantalla de activar. [Seguro]
- **Representación societaria:** sale de `cliente_relaciones` `Dueño`/`Administración` (`lib/representacion.ts`). Solo cuenta si la empresa es `juridica` explícita. [Seguro]
- **`portal_autorizacion` ya tiene alcances** `ver|ver_economico|partes|documentos|gestion|total`. Hoy solo se conceden `ver_economico|gestion|total`. [Seguro]
  - Se puede acotar a **una póliza** con `poliza_id` (§3b). No se puede acotar por sección: no existe un ámbito «actividad». [Seguro]
- **El índice `dni_lookup_hash` estaba incompleto** (15.800 fichas sin hash a 03/09). Que un NIF no se encuentre **no quiere decir que no sea cliente**. [Probable: hay que medirlo hoy]

## 1. Modelo: la «cuenta de herramientas»
Una **cuenta** es la unidad que contrata las herramientas. Hoy en rrhh es `empresas`; mañana la misma idea en transporte, alquiler…

- **Titular:** persona física o jurídica, con `titular_tipo` (`fisica|juridica`), `titular_doc_tipo` (`NIF|NIE|CIF`) y `titular_doc`.
- **El autónomo es un caso normal, no una excepción:** p. ej., un autónomo con 2 empleados y una administrativa. [Requisito Alberto]
- **Dónde vive la cuenta (recomendado):**
  - Una cuenta por herramienta, dentro de cada app (`rrhh.empresas` + columnas de titular).
  - Una costura central en la trastienda: `seguros.herramienta_cuenta`.
    - Columnas: `herramienta`, `cuenta_externa_id`, `cliente_id` (la ficha del titular en la cartera), `estado propuesto|confirmado|retirado`, `vinculado_por`, fechas.
    - Lleva `REVOKE crm_seguros`.
  - Alternativa descartada: una tabla «cuenta» compartida por todas las apps. Acoplaría paquete y vertical y obligaría a que rrhh leyera de otro schema.
- **El documento del titular:**
  - Un **CIF** de sociedad no es dato personal.
  - **El NIF/NIE de un autónomo SÍ lo es.** No va en claro en rrhh: o va cifrado con clave de rrhh, o lo guarda solo `asegura` en la costura. [Probable: recomiendo lo segundo]
  - rrhh guarda solo el tipo y los 4 últimos caracteres, para mostrarlo.
- **El cruce con la cartera** lo calcula `asegura` con `computeDniLookupHash`.
  - `PII_LOOKUP_KEY` **nunca sale** a una herramienta: es irreversible.
  - El cruce solo **propone** y Alberto confirma.
  - Tres estados: `null` = no consta · sin coincidencia = «no encontrado, el índice puede estar incompleto», nunca «no es cliente» · coincidencia = propuesta.

## 2. Dos accesos separados en diseño y en datos [Requisito Alberto, regla dura]

| | Acceso a HERRAMIENTAS | Acceso a SEGUROS |
|---|---|---|
| Dónde vive | En cada app de herramienta: `usuario_empresas` + permisos (§4) | En el portal: `portal_vinculo` (lo propio) + `portal_autorizacion` (lo de otro) + `cliente_relaciones` (lo mantiene Alberto) |
| Quién lo da | El **titular**, dentro de su cuenta | El titular **en el portal** (autorización explícita, aceptada por las dos partes) o Alberto (relaciones de la cartera) |
| Qué abre | Datos de la empresa como **responsable del tratamiento**, que nosotros tratamos como encargados | La cartera de la correduría, de la que somos responsables |

- **Tener acceso a una herramienta NUNCA abre los seguros de la cuenta.** No hay ninguna tabla compartida que lo permita y ningún código que lo deduzca.
- Si el titular quiere que su administrativa gestione los seguros de la actividad, se lo concede **en el portal**: es una `portal_autorizacion` aceptada por las dos partes, con alcance por sección (§3).
- La pantalla de permisos de la herramienta puede tener un **enlace** «¿Quieres que también vea tus seguros? Hazlo desde Grupo ASegura». No escribe nada en el portal.
- **Cepo:** ninguna app de herramienta importa `module-seguros*` ni lee el schema `seguros`. El portal no lee ningún schema de herramienta.

## 3. Una sola ventana Seguros con «Personal» y «Actividad» (autónomo)
- **Autónomo = una sola ficha y un solo NIF.** No se duplica la ficha ni se crea una «empresa ficticia».
- La bóveda de esa identidad muestra **dos secciones dentro de la misma ventana**: «Personal» (hogar, vida, coche particular…) y «Actividad» (RC profesional, local, flota, accidentes de convenio…).
- **Una sociedad** sale en su propia sección «Empresa X» por representación, como hoy. La sección «Actividad» es solo para los NIF de persona física con cuenta o actividad.
- **Cómo se decide la sección de una póliza:**
  - Una columna nueva `seguros.polizas.ambito` = `personal|actividad|null`.
  - Valor inicial por ramo/producto: propuesta automática, revisada por Alberto.
  - El titular puede reclasificar en el portal.
  - `null` → bloque «Sin clasificar», **nunca** dentro de «Personal» por defecto. Si se metiera ahí, una autorización «solo actividad» dejaría fuera algo que sí era de la actividad, y al revés. [Probable]
- **La autorización** (`portal_autorizacion`) necesita un nuevo **ámbito** `todo|actividad|personal`, aparte del alcance.
  - La administrativa del autónomo recibiría `actividad` + `gestion`.
  - Sin esto, autorizarla le enseñaría también el seguro de vida y el hogar del titular. **Alto riesgo**: el filtro tiene que ir dentro de `carteraDeIdentidad`, no en la pantalla.
  - Las `null`/«Sin clasificar» **no** entran en un ámbito parcial.

## 3b. Permisos en SEGUROS: se reutiliza `portal_autorizacion`, no se inventa nada [Seguro, leído en código]
**Los tres niveles** que se conceden (`ALCANCES_CONCEDIBLES`, `module-seguros-portal/src/autorizacion.ts`, 12/10/2026):

| Nivel | Valor | Qué permite |
|---|---|---|
| Consulta | `ver_economico` | Ver sus seguros y lo que pagan. No actúa |
| Gestión | `gestion` | Consulta + **dar partes** + documentos de la póliza. Nunca el DNI ni el IBAN de una persona física |
| Total | `total` | Todo lo que hace el titular, incluidas sus pólizas añadidas a mano. En una persona física incluye DNI e IBAN, con su propio texto de consentimiento |

**Reglas comunes a los tres:**
- Ninguno deja autorizar a un cuarto.
- Con una sociedad, Gestión y Total exigen `titulo_representacion`: `administrador` · `apoderado` · `empleado_autorizado`.
- La concesión necesita doble aceptación, no caduca y tiene revisión anual.

**Valores que siguen en la BD pero no son niveles concedibles:**
- `ver`, `partes` y `documentos` son heredados.
- `flota` es el jefe de flota (`ALCANCE_FLOTA`): el dueño nombra al jefe, que ve los vehículos en vigor, su compañía, vencimiento e ITV, sin primas ni siniestros (`lib/flota.ts`).

**Ya se puede acotar por póliza.** La columna `portal_autorizacion.poliza_id` (SQL `2026-09-04_portal_autorizacion_por_poliza.sql`) lo permite:
- `null` = todas, también las futuras.
- Si tiene valor, abre esa póliza sola.
- La FK compuesta `(cliente_id, id)` impide citar la póliza de otro.
- `conceder()` e `invitaciones.ts` aceptan `polizaId`. `polizasParaParte()` (`lib/cartera-lectura.ts`) solo abre las pólizas autorizadas con permiso de parte.

**Cómo encajan los casos:**
- **El conductor de una furgoneta de la flota:**
  - Si figura en la póliza (conductor habitual/interviniente) y su identidad está vinculada a su ficha, **ya puede dar el parte de ESA póliza** (`intervinientes`, decisión de Alberto del 27/09/2026). [Seguro]
  - Si no figura: hoy se le invita con `polizaId` de esa furgoneta, y luego se amplía a `gestion` + `empleado_autorizado`. [Probable: `ampliarAcceso` conserva `polizaId`; falta confirmarlo con un test]
  - **Hueco 1 (S-M):** Gestión arrastra Consulta (prima y recibos) y documentos. Al conductor le sobra todo eso. Hace falta un preset «**Solo dar parte de este vehículo**»: lectura mínima del bien + parte, sin dinero. Sería un nivel nuevo en el vocabulario, con su CHECK, su texto de consentimiento y su fila en `capacidades.ts`, y el corredor no lo concedería. Es mejor que reutilizar el `partes` heredado, que exige título y lleva semántica vieja.
- **La administrativa que da partes de la actividad:**
  - Sociedad: `gestion` + `empleado_autorizado` sobre toda la ficha (`poliza_id null`). [Seguro, ya existe]
  - Autónomo, hoy: **una fila `gestion` por cada póliza de actividad**. Funciona, pero **no cubre las pólizas futuras** y obliga a conceder N veces.
  - **Hueco 2 (M):** el ámbito `actividad` de §3. Depende de `polizas.ambito`, el filtro va en `carteraDeIdentidad`, y entra la regla de que las `null` no se abren en un ámbito parcial.
- **Lo que no se toca:** el corredor por `apps/asegura` sigue sin conceder `gestion` (422). La autogestión es del titular.

**¿Persona o invitación compartida entre las dos ventanas? Recomiendo que NO.** [Probable]
- Si la administrativa está en rrhh y en Seguros, son **dos invitaciones** con dos aceptaciones y dos textos. Las da el mismo titular, cada una en su app.
- En la pantalla de miembros de rrhh basta un **enlace** «Darle también acceso a tus seguros». Abre el formulario de invitación del portal con el email prerrellenado. No escribe nada.
- Compartir la fila de persona entre los dos sistemas sería exactamente la puerta que §2 prohíbe: revocar en uno debería revocar en el otro, y una persona dada de alta por la empresa (encargado) acabaría convertida en un sujeto de la cartera.

## 4. Roles: plantillas + permisos por herramienta, los da el titular [Requisito Alberto]
- **Modelo** (en cada app de herramienta, rrhh primero):
  - `cuenta_miembro(cuenta_id, usuario_id, plantilla, estado invitado|activo|revocado, invitado_por, fechas)`
  - `cuenta_permiso(miembro_id, herramienta, permiso, alcance_obras uuid[] null)`
  - **La plantilla solo rellena los permisos al invitar.** Después se afinan uno a uno; lo que manda es la fila de permisos, no el nombre de la plantilla.
- **Catálogo cerrado de permisos de rrhh:**
  - `rrhh.empleados.ver|editar`, `rrhh.nominas`, `rrhh.documentos`, `rrhh.prl`
  - `rrhh.fichajes.ver|corregir`, `rrhh.solicitudes.aprobar`, `rrhh.informes`
  - `rrhh.notas`, `rrhh.firmas`, `cuenta.miembros` (solo titular), `cuenta.encargo` (solo titular)
- **Plantillas:**

| Plantilla | Qué permisos trae |
|---|---|
| `titular` | Todos. Es único, no se revoca desde dentro y se transfiere solo con Alberto |
| `administracion` | Todo RRHH, sin `cuenta.*` |
| `encargado` | Fichajes, solicitudes y empleados.ver de **sus obras** |
| `gestoria` | Nóminas, documentos e informes. Puede llevar varias cuentas. Sin geolocalización (minimización) [Suposición] |
| A medida | p. ej. la administrativa: «solo nóminas y documentos» |

- **Comprobación:** un helper puro `puede(permisos, accion, obraId?)` en cada `/api/admin/*`. Cepo de matriz permiso×ruta, cada brazo visto en rojo.
- **Migración:**
  - Primer usuario de cada empresa → `titular`; el resto → `administracion` (conserva lo que tienen hoy).
  - **Alto riesgo:** un valor por defecto mal puesto abre las nóminas.
- **Invitar:**
  - El titular invita por email y el invitado entra por OTP (§5).
  - Lo envía **el titular**, no Grupo ASegura. Así no es una comunicación nuestra a terceros [Probable].
  - El token de invitación no abre sesión, igual que en el portal.
- **Nosotros no damos roles.** Alberto solo da de alta al titular y puede **transferir la titularidad** en un caso de soporte, dejándolo registrado.

## 5. Identidad: ¿una común o dos accesos?

| Opción | Coste | Riesgo | Veredicto |
|---|---|---|---|
| (a) Dos logins + enlace con el email prerrellenado | S | Bajo | **Base** |
| (b) Lanzador común + token de traspaso de un solo uso | M | **Alto** | Solo el lanzador, sin el token que autentica |
| (c) SSO con `core-identity` | L | Muy alto | Descartado |

**Por qué (b) y (c) no:**
1. Con un token, **cualquier fallo en rrhh** (BYPASSRLS, subidas, IA, `JWT_SECRET` compartido) **se convierte en una toma de cuenta en Seguros**.
2. El email del empleado lo **teclea la empresa** y `/e/[token]` no verifica ningún email. Un responsable que pusiera el email de otra persona abriría los seguros de esa persona.
3. RGPD: si el encargado firma una identidad para el negocio propio de la correduría, roza el art. 28.10. [Suposición: abogado]
4. (c) además mezcla en un solo dominio de confianza los dos accesos que §2 obliga a separar.

**Recomendación:**
- Las dos apps entran igual, con **OTP** de `@central/core-identity/codigo-otp`, y una **cabecera común** «Herramientas · Seguros» que solo tiene enlaces.
- El salto cuesta un código de correo y no añade riesgo.
- (b) se vuelve a plantear solo si se mide que la gente abandona, y en ese caso: únicamente portal→herramienta, `aud` por app, `jti` en BD, 2 min, secreto propio por par de apps y email verificado obligatorio.
- **Mejora barata:** en `/e`, prerrellenar con el email que el empleado **verificó por OTP** en esa sesión y no con `empleados.email`. Si entró por enlace/PIN, el campo va vacío.

## 6. Qué ve cada perfil y cómo salta

| Perfil | Herramientas | Seguros | Salto |
|---|---|---|---|
| Empleado | `/e` | Solo lo suyo, con su identidad | «Mis seguros» (PR #5089). El portal no sabe que es empleado: `origen` no se guarda y así tiene que seguir |
| Administrativa / encargado / gestoría | Lo que le dé su fila de permisos | **Nada**, salvo una autorización explícita del titular en el portal (ámbito `actividad` o empresa) | Enlace de la cabecera a la entrada del portal. No le da ningún acceso por sí solo |
| Titular, sociedad | Todo, más gestionar miembros | Bóveda propia + sección «Empresa X» por `Dueño` | Cabecera. En el portal, la tarjeta RRHH lleva un `hrefExterno` al `/login` de rrhh |
| Titular, autónomo | Igual | **Una sola** bóveda con «Personal» · «Actividad» · «Sin clasificar» | Igual |
| Alberto (`/correduria`) | Solo el estado del servicio: alta, titular, encargo aceptado, fecha. **No ve los datos de la cuenta** | La cartera completa | Ficha → bloque «Herramientas»: alta, enlace, transferir titular, retirar |

## 7. Dónde vive cada pieza
- **rrhh:** cuenta + titular (sin el NIF personal en claro), miembros y permisos, login OTP, aceptación del encargo y `ofrecida_por` (sustituye a la env).
- **asegura-portal:**
  - Bóveda con secciones, `portal_autorizacion.ambito` y la cabecera común.
  - La tarjeta de herramienta con `hrefExterno`, y `portal_modulo`.
  - No guarda nada de las herramientas.
- **asegura:** `herramienta_cuenta`, `polizas.ambito`, el cálculo del hash del NIF y la cola de módulos.
- **plataforma `/correduria`:** la pantalla de alta, enlace y activación. Llama al puerto de cada herramienta.
- **Escalar a una 2ª herramienta:** un contrato común, no una sesión común.
  1. El mismo puerto `/api/operador/cuentas {titular_tipo, doc_tipo, doc_ultimos4, nombre, titular_email, ofrecida_por}`.
  2. El mismo OTP.
  3. La misma cabecera (componente en `packages/brand`, con la marca por `emitirRootCss`).
  4. El mismo modelo `cuenta_miembro/cuenta_permiso` en `packages/core-identity` como lógica pura; las tablas, en cada schema.
  5. Una fila más en `MODULOS_PORTAL` + el CHECK, y en `herramienta_cuenta`.
- **Lo que NO cruza jamás hacia la cartera:** empleados, su número, nóminas, CNAE ni convenio. Esos datos se le piden al titular en el portal. [Seguro: lo decidió Alberto]

## 8. Alta desde `/correduria`
1. En la ficha del cliente (física o jurídica): «Ofrecer herramienta → Portal del Empleado».
2. Se elige el titular: la propia ficha si es persona física; su `Dueño`/`Administración` si es sociedad. El email sale de la ficha.
3. plataforma → `POST /api/operador/cuentas` **sin contraseña**.
4. Se escribe `herramienta_cuenta=confirmado` y `portal_modulo=activo` (con `historial_interno`).
5. El correo de bienvenida queda en **BORRADOR** hasta el OK de Alberto para ese envío.
6. En su primer login, el titular **acepta el encargo** (append-only, versionado). Hasta entonces no se cargan empleados ni se invita a nadie.

## 9. Fases

| # | Qué | Tamaño | Riesgo |
|---|---|---|---|
| F0 | Contrato de encargo, revisión de incentivos (RDL 3/2020), a quién se ofrece, criterio `personal/actividad` | S, sin código | Legal; bloquea F4+ |
| F1 | Cabecera común con enlaces, `hrefExterno` en la tarjeta, prerrellenar con el email verificado | S | Bajo |
| F2 | OTP para el responsable de rrhh y alta sin contraseña | M | Medio (todos vuelven a entrar una vez; ahora es barato) |
| F3 | `cuenta_miembro` + `cuenta_permiso` + plantillas + invitación del titular + comprobación en cada ruta | L | **Alto**: control de acceso y migración de los usuarios que ya existen |
| F4 | Titular físico/jurídico, `herramienta_cuenta`, pantalla de alta en `/correduria`, fuera la env de marca | M | **Alto / a medias irreversible**: la forma de la costura, el NIF personal |
| F5 | Aceptación del encargo, sellada | S-M | Legal |
| F6 | `polizas.ambito` + secciones en la bóveda | M | Medio. Clasificar mal confunde, pero no expone mientras no exista F7 |
| F7 | `portal_autorizacion.ambito` (la administrativa ve o gestiona solo «Actividad»). Hueco 2 | M | **Alto**: filtro en `carteraDeIdentidad`, cepo por ámbito |
| F7b | Preset «Solo dar parte de este vehículo» (hueco 1) + test de que `ampliarAcceso` conserva `polizaId` | S-M | Medio: nivel nuevo con texto y CHECK propios |
| F8 | 2ª herramienta con el mismo contrato | M/app | Bajo si F1–F5 están bien |

- **Orden:** F7 depende de F6, y F3 de F2.
- **Irreversible:**
  - Repartir `PII_LOOKUP_KEY`.
  - La forma de `herramienta_cuenta` cuando ya haya enlaces confirmados.
  - Los textos de encargo y de autorización aceptados: quedan sellados con su versión.
  - Los permisos por defecto de F3.
- **Cómo se verifica:**
  - F2: el patrón de `acceso-email-rutas.test.ts`.
  - F3: una matriz permiso×ruta.
  - F4: un cepo de que ninguna herramienta importa `module-seguros*`, + `regression-portal-sin-crm`.
  - F7: tests de `carteraDeIdentidad` con una autorización `actividad`. No debe devolver ni `personal` ni `null`.
