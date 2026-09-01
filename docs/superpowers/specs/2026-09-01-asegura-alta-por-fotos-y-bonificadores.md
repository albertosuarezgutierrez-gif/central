# Alta por fotos y bonificadores — diseño (01/09/2026)

> Dictado de Alberto: *«el cliente manda foto y el agente ya se encarga de rellenar. Inclusive
> nuevo cliente: foto DNI, carnet de conducir, ficha técnica, póliza actual o alguna que tenga en
> vigor para bonificadores (esto sí hay que tenerlo muy en cuenta, la consulta SINCO). Y en varias
> fotos, precios al instante.»*

Estado: **diseño, sin implementar.** Lo que hay construido hoy es el botón manual sobre la cartera
(PR #1996). Esto es el paso siguiente y las preguntas que hay que cerrar antes de empezarlo.

---

## 1. 🚨 La ficha técnica SÍ trae la versión — corrige la suposición de partida

Alberto daba por hecho que la ficha técnica «no trae la versión, solo la marca». **No es así**, y
cambia el diseño entero: la tarjeta ITV española sigue el formato europeo de campos codificados, y
la versión está en el **campo D.2**.

| Campo | Qué es | Para qué nos sirve |
|---|---|---|
| **A** | Matrícula | Casar con la póliza / con CIMA |
| **B** | Fecha de primera matriculación | La que hoy pedimos a Codeoscopic; aquí viene **exacta**, no aproximada |
| **D.1** | Marca | Primer nivel del catálogo |
| **D.2** | **Tipo homologado + código de VARIANTE + código de VERSIÓN** | 🎯 el dato que faltaba |
| **D.3** | Denominación comercial (el «modelo» de toda la vida) | Segundo nivel del catálogo |
| **E** | Nº de bastidor (VIN) | Identificador único del vehículo |
| **K** | Nº de homologación de tipo (K.1/K.2 para completado y certificado ITV) | Confirma variante/versión |
| **P.1 / P.2 / P.3** | Cilindrada · potencia (kW) · combustible | Los ejes que separan versiones entre sí |
| **Q** | Relación potencia/masa | Relevante en motos |
| **S.1** | Plazas | Dato de tarificación |

### ⚠️ Pero D.2 no es un código Base7, y eso NO se puede saltar

El D.2 son los códigos de **homologación europea** del fabricante (tipo/variante/versión). Codeoscopic
tarifica con **códigos Base7**, que son de su proveedor de datos. **No hay una equivalencia directa
publicada entre ambos**, así que seguirá habiendo un paso de emparejamiento.

La buena noticia es que con la ficha técnica ese emparejamiento **deja de ser adivinar**. La lista de
`GET car/brands/{id}/models/{id}/vehicles` se filtra por los ejes que la propia ficha da exactos:

```
D.1 marca  →  D.3 denominación comercial  →  filtrar por P.1 cilindrada + P.2 potencia
              + P.3 combustible + B año           →  normalmente 1 candidato, a veces 2
```

**Regla que NO se negocia, y es la misma que ya aplica `emparejar()` en `catalogos.ts`:** si tras
filtrar quedan 2 o más candidatos, **no se elige uno**. Se enseñan y decide la persona. Un
emparejamiento por parecido cuela una versión equivocada, y eso no da error: da un precio que no es
el de ese coche.

### Lo que NO resuelve una BD de matrículas gratis

Medido el 01/09/2026 al buscar alternativas: los datos abiertos de la DGT publican matriculaciones
**anonimizadas, sin matrícula**; el resto de fuentes (Ganvam, GT Motive, revendedores) son de pago; y
EUCARIS es solo para administraciones. Y aunque hubiera una gratis, devolvería **texto**
(«Seat León 1.6 TDI»), no el código Base7 — o sea, el mismo problema de emparejamiento, pero
partiendo de peor información que la ficha técnica.

**Conclusión: la foto de la ficha técnica es mejor fuente que cualquier BD de matrículas**, porque
trae cilindrada, potencia y combustible exactos, que es justo lo que separa versiones.

---

## 2. Qué aporta cada foto

| Foto | Campos que rellena | Notas |
|---|---|---|
| **DNI** (anverso/reverso) | `dni`, `nombre`, `apellido1`, `apellido2`, `fechaNacimiento`, `sexo` | Cierra de golpe **todos** los datos personales que hoy el mapeador se niega a suponer |
| **Carnet de conducir** | `fechaCarnet` (campo 4a = fecha de expedición del permiso B, en el reverso por categorías) | Ojo: la fecha del carnet **B** es la del reverso, no la de la tarjeta |
| **Ficha técnica** | `matricula`, `fechaMatriculacion`, marca/modelo/versión, plazas | Ver §1 |
| **Póliza actual** | `polizaAnterior`, `companiaAnteriorCodigo`, `aniosAsegurado`, bonus declarado | Para un cliente NUEVO es la única fuente; para uno de cartera ya lo tenemos |

🔒 **Estas fotos son PII sensible de verdad.** Antes de implementar hay que decidir dónde se guardan
(Vercel Blob privado, como los EIAC) y **cuánto tiempo**. La ficha de cliente ya tiene el hueco
documentado: `cliente_documentos` **no existe** todavía y `poliza_documentos.poliza_id` es NOT NULL,
así que a un lead sin póliza **hoy no se le puede adjuntar nada**. Eso hay que resolverlo antes, no
después.

---

## 3. 🎯 SINCO — el bonificador de verdad, y el punto que Alberto marcó como importante

**Qué es** (confirmado en fuentes públicas, 01/09/2026): TIREA pone a disposición de las **Entidades
Aseguradoras del ramo de Automóvil** el *Sistema de Información Histórico del Seguro del Automóvil*
(**SIHSA**), conocido como **fichero SINCO**. Guarda el **historial de siniestralidad de los últimos
CINCO años** y se consulta **en el momento de tarificar**.

### Por qué importa tanto aquí

Nuestro mapeador presume hoy que **no ha habido siniestros** (decisión de negocio de Alberto) y lo
marca como supuesto **optimista**. SINCO es exactamente el dato que convierte esa presunción en
hecho — y encima cubre **cinco años**, que es justo la ventana del campo `lastFiveYearsAccidents`
que exige Codeoscopic.

🚨 **Y hay que asumir lo siguiente: la compañía va a consultar SINCO igual, al emitir.** O sea que
una precalificación con siniestralidad presumida limpia **se corregirá sola** si el cliente sí tuvo
partes. Eso no invalida la precalificación —sigue siendo el precio orientativo con la fricción
mínima que quiere Alberto—, pero **obliga a decirlo en pantalla**, que es lo que ya hace el aviso
«puede abaratar el precio».

### Quién puede consultarlo — y aquí hay que preguntar, no suponer

- Las fuentes públicas dicen «Entidades Aseguradoras» y remiten a un **listado de entidades
  adheridas** de UNESPA. **Una correduría no es una entidad aseguradora**, así que **NO está
  confirmado que Grupo Asegura pueda consultarlo directamente.**
- ✅ **Lo que sí está claro:** el **propio asegurado puede pedir su historial gratis** identificándose
  con DNI y número de póliza. Esa es una vía inmediata y sin contrato: **pedírselo al cliente**.
- 📮 **Lo que hay que preguntar** (y Alberto ya tiene relación con TIREA por CIMA, así que puede ser
  un anexo y no un contrato nuevo): si el acceso a SINCO se puede añadir al acuerdo existente.
  Contacto que ya está en la skill: `accesos.cima@tirea.es`.

⚠️ **No se ha verificado en la web de TIREA directamente**: el proxy de la sesión bloquea
`tirea.es` por política de la organización. Lo de arriba sale de fuentes secundarias del sector
(Mapfre, Allianz, Reale, AMV, comparadores) y del glosario de TIREA vía buscador. **Antes de
diseñar sobre esto, confirmarlo con TIREA.**

🔒 **Y es dato personal**: consultar el historial de siniestros de alguien exige su consentimiento
y encaja en el registro de tratamientos. No es un detalle burocrático — es la diferencia entre un
servicio y una sanción.

---

## 4. El flujo que dibuja todo esto

```
Cliente por WhatsApp
   └─ manda 2-4 fotos (DNI · carnet · ficha técnica · póliza actual)
        └─ el agente extrae campos  →  precalificación con MENOS supuestos
             ├─ versión: filtrada por cilindrada/potencia/combustible
             │    ├─ 1 candidato  → sigue solo
             │    └─ 2+           → los enseña y decide una persona
             └─ siniestralidad: presumida limpia, marcada
                  └─ (si algún día hay SINCO: deja de presumirse)
        └─ POST /insurances  →  precios CON su firmeza
```

Lo que cambia respecto de hoy no es el motor —el mapeador, el tope y el libro ya están— sino **de
dónde salen los campos**: hoy de la ficha del CRM y del corredor; mañana de las fotos.

**Y el contrato del mapeador no cambia:** siga viniendo de donde venga, `precalificarAuto()` seguirá
devolviendo *lo que se manda · lo supuesto · lo que falta*. Una extracción de una foto es una fuente
más, y una fuente con confianza: **un OCR dudoso es un supuesto, no un dato**, y entra por el mismo
sitio.

---

## 4-bis. 📄 Subir la póliza y que el agente la lea — el caso que lo engloba todo

Dictado de Alberto (01/09/2026): *«poder subir las pólizas de los clientes; al subirlas, que el
agente la lea y rellene los datos que necesite.»*

Esto es **más amplio que la foto en el momento de cotizar**, y conviene no confundirlos:

| | Foto al cotizar | Subir la póliza |
|---|---|---|
| Cuándo | El cliente pide precio | Cuando sea: también en frío, sobre cartera ya existente |
| Qué produce | Los campos de UNA cotización | **Rellena la ficha**: cliente, bien asegurado, coberturas, primas |
| Quién lo dispara | El cliente | El corredor, en lote |

**Por qué esto vale más que el otro:** hoy las 80 pólizas de auto vivas traen matrícula y nada más
(§1). Un PDF de póliza trae **el vehículo completo, las coberturas, la prima y la franquicia**. O
sea, subir las pólizas **rellena de golpe justo los huecos que obligan a preguntar**, y lo hace una
vez por cliente en vez de una vez por cotización.

### Lo que hay que respetar al implementarlo

- 🚨 **Lo extraído de un PDF es un dato con PROCEDENCIA, no un dato sin más.** Debe quedar marcado
  como «leído de la póliza tal» y no pisar lo que venga de CIMA, que es la fuente de la compañía.
  Es la lección de `subastas.tipo_bien`: un extractor que escribe encima de una fuente mejor
  degrada el dato sin que nadie se entere.
- **Un OCR dudoso es un SUPUESTO, no un dato.** Entra por el mismo carril que los supuestos del
  mapeador y se enseña igual. Nunca se escribe un valor de cajón («otro», «desconocido»): se deja
  NULL, que sí se ve.
- **La confianza por campo importa más que la confianza global.** Una póliza puede tener la
  matrícula clarísima y la fecha de efecto borrosa; guardar «85% de confianza» del documento entero
  no sirve para nada.
- 🔒 **Documentos: sigue sin haber dónde ponerlos.** `cliente_documentos` NO existe y
  `poliza_documentos.poliza_id` es NOT NULL. Para subir la póliza de un cliente **nuevo** (que
  todavía no tiene póliza en nuestro sistema) hace falta resolver eso primero.
- **Reconciliar, no duplicar:** si la póliza subida ya existe en la cartera (por número + compañía),
  se enriquece la que hay; no se crea otra. El CRM ya tiene `poliza_merge_log` para las fusiones.

## 5. Siguiente ramo: HOGAR

Dictado de Alberto: *«cerramos que funcione auto y apunta para ir viendo otros ramos, hogar es el
segundo más vendido y es mucho más fácil.»*

Tiene razón en que es más fácil, y hay dos motivos concretos:

1. **No hay que identificar un vehículo.** Todo el problema de §1 —el código Base7, el
   emparejamiento, los créditos de `/vehicles`— **desaparece**. Un hogar se describe con los
   catálogos, y los catálogos son gratis.
2. **La API ya lo sirve, y la ficha del CRM ya tiene los campos.** Los 11 catálogos de
   `/home/*` (`property-types`, `build-materials`, `build-qualities`, `door-types`, `alarm-types`,
   `locations`, `occupancy-types`, `settlement-types`, `uses`, `person-roles`, y
   `POST /home/recommend-limits`) encajan con lo que `bienes_asegurables` ya guarda: `m2`,
   `tipoVivienda`, `yearConstruccion`, `rejas`, `puertaBlindada`, `alarmaConectada`.

**Lo primero que hay que hacer, y es gratis:** preguntarle a la API si hogar tarifica para nosotros.
`GET /insurance-lines` devuelve por ramo `supports.rating` y `supports.policyApplication` para
nuestra organización. **No hay que preguntárselo a nadie por email.**

⚠️ **La dirección del riesgo va CIFRADA** en `datos_especificos` (`v1:iv:cipher:tag`). Sin
`PII_ENCRYPTION_KEY` sale el `v1:` intacto, y eso hay que decirlo como **«cifrado»**, nunca como
«sin dirección» — ya lo hace `objetoAsegurado`.

---

## 6. Qué está decidido y qué hay que preguntar

| | |
|---|---|
| ✅ Decidido | La ficha técnica es la fuente del vehículo, no una BD de matrículas |
| ✅ Decidido | Ante 2+ candidatos de versión, elige una persona. Nunca el código |
| ✅ Decidido | Hogar es el siguiente ramo |
| ❓ Preguntar a TIREA | ¿Puede una correduría consultar SINCO? ¿Se añade al acuerdo de CIMA? |
| ❓ Preguntar a Codeoscopic | Precio de los créditos de `GET /vehicles` (por si el cliente teclea matrícula sin foto) |
| ❓ Preguntar a la API (gratis) | `GET /insurance-lines` → ¿hogar tarifica para nuestra organización? |
| 🔧 Resolver antes de las fotos | Dónde se guardan (Blob privado), cuánto tiempo, y que `cliente_documentos` no existe |
