# Consulta al abogado — Grupo ASegura (06/09/2026)

> **Qué es esto:** las cuatro preguntas jurídicas que la correduría tiene abiertas, juntas,
> para resolverlas en **una sola consulta** en vez de cuatro. Estaban sueltas por el repo y por
> la memoria de sesiones; ninguna es urgente por separado y la 1 sí lo es antes de usar la
> lista de leads.
>
> **Qué NO es:** asesoramiento jurídico. Aquí se recogen **hechos medidos** y se señalan los
> artículos que parecen aplicar, con la etiqueta de cuánto se sabe de cada cosa. Quien decide
> es el abogado. Ninguna de estas preguntas se ha enviado a nadie: este documento es un
> borrador para que Alberto lo lleve.
>
> **Cómo leerlo:** `[Medido]` = comprobado contra la base de datos o el código, con fecha.
> `[Probable]` = inferencia razonada. `[Suposición]` = hueco que rellena el abogado.

---

## 1. Las 32.520 fichas del volcado histórico: ¿se pueden usar comercialmente?

**El hecho.** `[Medido 01/09/2026]` En el schema `seguros` hay **32.600 fichas de cliente y
28.843 pólizas**. De ellas, la cartera viva son **80 clientes / 110 pólizas** — las que entran o
mantiene CIMA. Las otras **32.520 fichas / 28.728 pólizas** son un volcado histórico cargado en
junio de 2026, con `import_ref` de tipo `intranet:` y `asegura_app:`, y **vencimientos entre 2013
y 2018**. Ninguna tiene vencimiento en los últimos 18 meses.

**Por qué se pregunta.** El estudio de posicionamiento (`ASEGURA-COMPETENCIA-POSICIONAMIENTO.md`)
las llama «leads», y la regla de trabajo de Alberto es «lo que entra por CIMA es cliente actual;
el resto son leads». Como concepto comercial es razonable. **Como base de datos de contactos a
los que escribir o llamar, probablemente no lo sea**, y esa distinción no se ha planteado hasta
ahora.

**Lo que hay que resolver, en concreto:**

1. **Base jurídica.** `[Suposición]` No consta en el repo ningún registro de consentimiento
   asociado a esas fichas: la tabla `seguros.consent_logs` existe, pero está pensada para el
   portal del cliente actual. ¿Hay alguna base del art. 6 RGPD que ampare un contacto comercial
   —interés legítimo por relación contractual previa (art. 6.1.f + considerando 47), o hace falta
   consentimiento?
2. **La ventana temporal.** `[Medido]` Los datos son de hace 8-13 años. Aunque hubiera existido
   una relación contractual, ¿sigue viva a efectos de interés legítimo, o el paso del tiempo la
   agota?
3. **Canal.** `[Probable]` El art. 21 LSSI exige consentimiento previo para comunicaciones
   comerciales por email o equivalente, con la excepción de productos similares contratados
   previamente. ¿Aplica esa excepción aquí y con qué límites? ¿Cambia la respuesta si el contacto
   es telefónico en vez de por email?
4. **El deber de supresión.** Si la respuesta es que no se pueden usar, la pregunta siguiente no
   es «guardarlas por si acaso»: es **cuánto tiempo se pueden conservar** y con qué finalidad
   (art. 5.1.e RGPD), y si conservarlas sin finalidad legítima es en sí un incumplimiento.

**Por qué importa el orden.** Si la respuesta es que no, hay que saberlo **antes** de que nadie
construya una campaña sobre esa lista. Una lista de 32.520 contactos parece un activo y puede ser
un pasivo; es el mismo error que confundir 32.600 fichas con 32.600 clientes, un piso más abajo.

---

## 2. Los textos legales de las webs: sign-off pendiente

**El hecho.** `[Medido]` El módulo `@central/module-seguros` marca su propia redacción como
provisional: `packages/module-seguros/src/mediador.ts` lleva un `PENDIENTE_REVISION_LEGAL` sobre
los puntos precontractuales del art. 19 de la Ley 16/2018 (LDS) y sobre la declaración de no
exclusividad. Esa redacción es la que ven **las tres apps de la correduría** (panel del corredor,
portal del asegurado y web pública), así que se revisa una vez y vale para las tres.

**Lo que hay que confirmar:**

- Que los **puntos precontractuales** del art. 19 LDS están completos y bien redactados.
- Que la **declaración de no exclusividad** dice lo que tiene que decir.
- La **política de privacidad, el aviso legal y la página de cookies** de `grupoasegura.es`. Ojo
  con el historial: `[Medido 05/09/2026]` esos textos llegaron a afirmar que no había analítica
  ni cookies de terceros **mientras el código ya cargaba Cookiebot y PostHog**. Se corrigió
  (versión `w2`), pero conviene que alguien de fuera lea la versión actual.

**Detalle operativo que conviene que el abogado sepa:** un cambio de fondo en un texto legal del
**portal del cliente** obliga a los ~80 clientes a volver a acreditar la información
precontractual la próxima vez que entren, porque la versión se sella en
`seguros.portal_consentimiento`. Un cambio en la **web pública** no. Son dos constantes distintas
a propósito. O sea: conviene agrupar los cambios del portal en una sola revisión.

---

## 3. ¿Está obligado a Delegado de Protección de Datos?

**El hecho.** `[Medido]` El módulo declara explícitamente que **no** publica un DPO, y dice por
qué: que exista o no es un hecho, no una redacción, y se declarará cuando esté confirmado y con un
buzón que se sepa que recibe correo. Mientras tanto los derechos se ejercen por el contacto
general, que sí está verificado.

**La pregunta.** El art. 34 de la LOPDGDD lista los responsables obligados a designar DPO, e
incluye a **entidades aseguradoras y reaseguradoras**. `[Suposición]` No está claro si un
**corredor persona física** —que no es aseguradora, sino distribuidor— entra en esa lista, ni si
el volumen de datos que maneja (una cartera de 80 clientes vivos, más un archivo histórico de
32.520 fichas) activa alguno de los otros supuestos del art. 37 RGPD (tratamiento a gran escala,
observación habitual y sistemática).

La respuesta cambia dos cosas: si hay que designarlo, y si hay que **publicarlo** en las webs.

---

## 4. La hipoteca y el seguro de hogar: ¿se puede decir en la web?

**El hecho.** `[Medido]` El estudio de posicionamiento apunta que el banco **no puede obligar** a
contratar el seguro de hogar con él al conceder una hipoteca, y cita el **art. 17 de la Ley
5/2019** de contratos de crédito inmobiliario. Es un argumento comercial fuerte para el ramo
prioritario (hogar), y el tipo de frase que distingue a un corredor de un comparador.

**La pregunta.** `[Suposición]` El artículo no se ha verificado contra el texto consolidado del
BOE — el contenedor donde se hizo el estudio **no tenía salida a internet**, y una cita legal
inventada cuesta más que no citar. Antes de publicarlo en la web hace falta:

1. Confirmar el artículo y su redacción vigente.
2. Confirmar **cómo se puede formular** sin que la frase deje de ser información y pase a ser
   asesoramiento. Es la línea que ya vigila el repo: el copy de `apps/asegura-web` no puede
   prometer precio ni superlativos, porque eso arrastraría análisis objetivo documentado e IPID
   (RDL 3/2020, arts. 11 y 17), y lo comprueba `lib/ramos.test.ts` en cada build.

---

## Resumen para la cita

| # | Pregunta | Bloquea | Urgencia |
|---|---|---|---|
| 1 | Base jurídica de los 32.520 contactos históricos | Cualquier campaña sobre esa lista | **Antes de usarla** |
| 2 | Sign-off de los textos legales de las tres apps | Nada operativo; es exposición acumulada | Media |
| 3 | Obligación de DPO (art. 34 LOPDGDD) | Publicar o no el DPO en las webs | Media |
| 4 | Cita del art. 17 Ley 5/2019 en el copy de hogar | Publicar ese argumento en la web | Antes de publicarlo |

**Las cuatro se resuelven en una sola sesión.** La 1 es la que puede convertir un supuesto activo
en un pasivo, así que es la que abre.
