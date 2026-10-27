# Estudio — Patrimonio (gestión de inmuebles en alquiler) como producto (26/10/2026)

> Encargo de Alberto: ¿hay nicho para la herramienta de patrimonio entre propietarios con varios
> inmuebles que hoy usan Excel? ¿Landing propia / adaptar web?
> Fuentes: inventario del código (`apps/asegura-portal/app/(portal)/patrimonio`, `packages/module-patrimonio`)
> y búsqueda web + OpenSEO/DataForSEO (es-ES, 26/10/2026). Precios de competidores sacados de
> Capterra/Appvizer/softwaredoit, **no verificados en sus webs**.

## 1. Lo incómodo primero
- **Sí existe competencia, y barata.** Rentger (de Idealista, ~3,75 €/inmueble/mes), Homming (gratis hasta
  5 inmuebles, >580 M€ de rentas gestionadas), Rentila (0-8 €/mes), RentPackage (gratis), Alphaletz.
  La idea «no hay nada, todos usan Excel» es falsa para la operativa (cobros, recibos, contratos, incidencias).
- **La búsqueda genérica es pequeña.** «gestión de alquileres» 320/mes; «software gestión alquileres» 70;
  «gestión patrimonial inmobiliaria» 50; «programa gestión alquileres» 30; «app gestión alquileres» 20;
  «plantilla excel alquileres» 10. El volumen va a las MARCAS (homming 2.400, rentger 1.000, rentila 720).
  CPC 5-7 €: los competidores ya pagan anuncios. La SERP la dominan directorios (Capterra, Appvizer).
  → **Una landing SEO aislada traería decenas de visitas/mes, no un negocio.** [Seguro sobre las cifras; Probable sobre la lectura]
- **Nuestra herramienta no es un SaaS autoservicio.** Vive en el portal del cliente de Grupo ASegura
  (titular = `cliente_id`, se activa desde `/correduria`). No hay alta autónoma, ni cobro, ni banca PSD2 en el
  portal. Pendientes abiertos: activar Patrimonio en `/correduria` aún no abre `/patrimonio`, topes de renta por
  verificar en BOE, prueba a 320 px, OK legal P15/P16.

## 2. Dónde SÍ hay hueco (lo que nadie cubre bien)
Los competidores son herramientas de **operativa del casero**. Ninguno consta con:
1. **Fiscalidad**: rendimiento neto por inmueble listo para el modelo 100 (gastos, amortización 3 %, reducción
   del 60 %) — nosotros ya tenemos `rentabilidad/fiscal`.
2. **Patrimonio y rentabilidad real**: valor, hipoteca/obligaciones, rentabilidad bruta/neta, calendario.
3. **Catastro** autorrellenado (referencia, superficie, callejero) — lo tenemos.
4. **Seguros del inmueble**: póliza enlazada + infraseguro + «pedir precio» — **esto no lo puede copiar un
   software de alquileres; es nuestro foso.**
5. IA que lee facturas, actualización IRAV/IPC con índices INE, avisos push.
Hueco que tampoco cubrimos aún: multi-titular persona física + SL patrimonial en un cuadro, y conciliación
bancaria por inmueble.

Público: ~2,66 M declaraciones IRPF con rendimientos de capital inmobiliario (AEAT 2018 vía OCU; no hay dato
reciente). Multipropietarios 3-30 inmuebles: sin dato oficial; [Suposición] decenas a pocos cientos de miles.

## 3. Recomendación
**No lanzarlo como SaaS independiente para competir con Rentger/Homming.** Partir de 0 € frente a
herramientas gratis o de 4 €/mes, con poca búsqueda y CPC alto, es quemar dinero y tiempo.
**Sí usarlo como lo que ya es: herramienta GRATIS de Grupo ASegura que capta y fideliza propietarios**
(mismo patrón que la decisión de RRHH gratis del 26/10). El dinero está en las pólizas que genera cada
inmueble (hogar, impago, RC, comunidad), no en una cuota de 5 €/mes.

Pasos, en orden:
1. **Cerrar los pendientes** del portal (activación desde `/correduria`, topes BOE, 320 px, OK legal) — sin eso
   no se puede enseñar.
2. **Validar con clientes reales antes de construir más**: sacar de la cartera en vigor los clientes con ≥2
   pólizas de hogar/comunidad y ofrecérselo a 10-20 (borrador, sin enviar sin OK). Métrica: ¿cuántos dan de alta
   ≥2 inmuebles y vuelven al mes?
3. **Una sección/landing dentro de grupoasegura.es** (no dominio nuevo): «Gestiona tus pisos de alquiler gratis:
   rentabilidad, IRPF y seguros en un sitio». Captación por contenido de cola larga con intención real:
   calculadora «cuánto tributa mi alquiler» / rentabilidad, y la plantilla Excel descargable como gancho
   («excel gestión alquileres» KD 46) que lleva a la herramienta. El lead entra por el flujo de lead web ya
   existente.
4. Solo si el paso 2 da tracción: alta autónoma, multi-titular (física + SL) y banca PSD2 (ya existe en
   plataforma, `lib/psd2.ts`) — ahí sí habría producto diferencial vendible.

## 4. Lo que no se ha verificado
Precios en webs oficiales; Arrenta, Smoobu/Hostaway, Alquiler Seguro; volumen de «declarar alquiler renta»
en temporada (110/mes media anual, probablemente concentrado en abril-junio).

## 5. Modelo de ingresos — conclusiones del 27/10/2026
- **«Gratis si traes los seguros» — mejor en dos niveles.** Si la herramienta solo se abre trayendo las
  pólizas, se pierde la captación: el propietario que aún no es cliente no entra y no hay a quién convertir.
  Propuesta: nivel básico gratis para cualquiera (inmuebles, gastos, rentabilidad, calendario); nivel completo
  gratis con pólizas en Grupo ASegura (IA de facturas, fiscalidad, avisos, cobro de rentas). Sin pólizas, el
  nivel completo es de pago.
  ⚖️ Antes de publicarlo: revisión legal de la venta cruzada (RDL 3/2020, prácticas de venta combinada/vinculada)
  y del deber de asesoramiento del corredor. [Probable que sea viable; hay que confirmarlo]
- **Cobro de rentas con Stripe — viable, pero no es lo que nos diferencia** (Homming y Rentger ya lo hacen).
  Tiene que ir por **Stripe Connect** (cada propietario es una cuenta conectada con su KYC; Stripe es la entidad
  regulada y nosotros cobramos `application_fee`). Si el dinero pasa por una cuenta nuestra, prestamos un servicio
  de pago sin licencia (PSD2). Connect ya se usa en el repo (`stripe.accounts`, en plataforma/sivra e ia-rest).
  Riesgos: el inquilino puede devolver un adeudo SEPA hasta 8 semanas después (13 meses si no estaba autorizado),
  hay que dar de alta a cada propietario (fricción) y nuestra comisión se factura con IVA.
  Comisión: un % sobre la renta choca con competidores que cobran gratis. Mejor una cuota fija por recibo o meterlo
  en el nivel de pago. El ingreso grande es el **seguro de impago**, que se ofrece justo cuando se activa el cobro.
- ✅ **Decisión de Alberto (27/10/2026):** aprobado el modelo de dos niveles (básico gratis; plus gratis con sus
  seguros en Grupo ASegura). El **cobro de rentas con Stripe queda como idea para MÁS ADELANTE**: reutilizar el
  Stripe Connect que ya funciona en ia-rest (cliente Saboga) cuando Patrimonio tenga tracción. No se construye ahora.

## 6. Estrategia: herramientas gratis para captar clientes de seguros (27/10/2026)
Idea de Alberto: ofrecer como servicio añadido todo lo ya construido (Patrimonio, RRHH, agente fiscal) para captar
clientes de seguros. Orden propuesto, según lo directo que es el seguro que arrastra cada herramienta:
1. **Patrimonio** → hogar, impago, comunidad, RC del arrendador. Arrastre directo. Primero.
2. **RRHH** (ya gratis desde el 26/10) → accidentes de convenio, salud colectivo, RC y D&O de la empresa.
3. **Agente fiscal** → poco seguro directo y **riesgo alto**: dar asesoramiento fiscal a terceros genera
   responsabilidad, y la RC profesional de la correduría probablemente no la cubre [Probable]. Solo como
   *orientación informativa* con aviso legal, o derivando a una gestoría colaboradora. Nunca presentar declaraciones.
Condiciones: un solo portal del cliente con módulos (no una app por herramienta). Usar los datos para ofrecer seguros
exige informarlo en el RGPD, como ya se hizo con las señales de Patrimonio. Medir la conversión a pólizas de cada
herramienta antes de invertir más en ella.

## 7. Hoja de ruta aprobada por Alberto (27/10/2026)
Piloto: José Suárez Salas (gestiona) y María Antonia Gutiérrez Alcalá (titular), edificio de C/ Busto Tavera 22,
RC 5731022TG3453B0001AK, sin división horizontal, 12 pisos. Borrador de WhatsApp preparado (no enviado; José tiene
`wa_opt_in`=false, así que mejor una llamada primero). Orden:
1. ✅ **Edificio con unidades** (#5134): rentabilidad por piso + reparto de gastos comunes.
2. ✅ **El titular autoriza a quien gestiona** (#5134): `patrimonio_gestion`/`patrimonio_total` desde /autorizaciones.
3. ✅ **Cupo de IA según el valor del cliente** (#5134; hoy por nº de pólizas en vigor): tramos por comisión anual en vigor del grupo familiar (hoy no hay comisión
   anual consolidada, solo por recibo → calcularla; mientras tanto, por nº de pólizas).
4. ✅ **Volcado inicial semiautomático** (#5134): el cliente sube su Excel o sus PDF → la IA propone edificio, pisos, inquilinos,
   rentas y gastos → el cliente confirma. Leer el xlsx de forma segura en el servidor (la librería anterior se quitó por un CVE).
5. ⏳ **Inquilinos como canal** (borrador de consentimiento entregado a Alberto 27/10; espera revisión legal): en el enlace del inquilino, oferta de contenido + RC del inquilino, con consentimiento expreso.
6. ⏳ **Señales automáticas** (motor ya hecho; espera el OK legal a los textos de P15): contrato nuevo → impago; piso vacío →
   vivienda desocupada; infraseguro → revisar el continente; hipoteca → vida vinculada.
7. ✅ **Informe anual para el gestor** (#5134, CSV + imprimible): PDF por inmueble con ingresos y gastos clasificados para la renta (exportar datos, no asesorar).
8. ✅ **Calendario único** (#5134): renovaciones de pólizas + IBI + actualización de rentas + fin de contratos + ITV.
9. ✅ **Recomendación entre propietarios** (#5134, cupo amplio 90 días): «invita a otro propietario» → nivel completo gratis un tiempo para ambos.
10. ✅ **Panel de conversión para Alberto** (#5134, /correduria → Más → Referencia; coste IA estimado): coste por cliente (IA, almacenamiento) frente a pólizas y comisión generadas.
Descartado: valorar inmuebles con el conector de Idealista (sus condiciones prohíben usarlo para métricas o para alimentar
una herramienta).
