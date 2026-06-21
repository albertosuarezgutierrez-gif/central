# Contabilidad de sivra — separación de cuentas (REGLA, no opcional)

> **Por qué existe este doc (15/06/2026):** la gráfica "Evolución mensual" del dashboard
> mete TODO en un único Ingresos/Gastos. Eso a Alberto **no le vale**: mezcla cuentas
> bancarias y mezcla gastos personales con los de los pisos → el resultado es **poco
> informativo**. La contabilidad tiene que poder **segregarse por unidad contable**.

## Las dos cuentas bancarias (NO se mezclan)

| Cuenta | Qué paga | Tratamiento |
|---|---|---|
| **BBVA** | **Duplex Center** + **seguros** | Unidad contable **APARTE**. No se mezcla con los 3 apartamentos turísticos. |
| **Kutxa** | Gastos **personales** de Alberto **+** gastos de los **3 apartamentos turísticos** | **HOY van mezclados** → hay que **separarlos**: la contabilidad de los 3 apartamentos debe salir **limpia**, sin lo personal. |

## Los 3 apartamentos turísticos (explotación, cuenta Kutxa)

La contabilidad que hay que sacar limpia es la de estos 3 (confirmado contra la BD):

| Apartamento (como lo dice Alberto) | Propiedad en el sistema | `propiedad` id | Smoobu | Ubicación |
|---|---|---|---|---|
| **Socorro** | House Sevillana | `prop_house_sevillana` | #352007 | Calle Socorro 24, 41003 Sevilla |
| **Busto Tavera (1)** | Busto Reform | `prop_busto_reform` | #352418 | Sevilla (Busto Tavera) |
| **Busto Tavera (2)** | Luxury Busto | `prop_luxury_busto` | #352943 | Sevilla (Busto Tavera) |

> Mapeo **confirmado por Alberto (15/06/2026)**: "Socorro" = House Sevillana (su dirección en BD
> es *Calle Socorro 24*); "los pisos de Busto Tavera" = los dos "Busto" → **Busto Reform + Luxury Busto**.

## Lo que NO entra en la contabilidad de los 3 apartamentos

- **Duplex Center** (`prop_duplex_center`) → va por **BBVA**, junto con **seguros**. **Aparte.**
  ⚠️ Es el piso que Alberto llama **"Villasís"** (Pasaje Villasís 1 / Pasaje Francisco Molina 4, el
  mismo piso con dos accesos). Alias a reconocer: *Villasís*, *Pasaje Francisco Molina*.
- **Gastos personales** de Alberto (`prop_personal`) → fuera de la P&L de pisos. Salen de Kutxa
  pero **no son** de la explotación.
- `prop_multi_apartamentos` ("Gastos compartidos") → comunes a la explotación; se reparten entre
  los 3 turísticos, **no** con Duplex/seguros.

## Implicación para los informes (pendiente de implementar)

El dashboard / "Evolución mensual" debe poder mostrar, como mínimo, **separado**:

1. **Explotación turística (Kutxa, sin personal):** ingresos y gastos SOLO de los 3 apartamentos
   (Socorro + Busto Reform + Luxury Busto) + su parte de gastos compartidos. **Sin** gastos personales.
2. **Duplex + seguros (BBVA):** su propia unidad, aparte.
3. **Personal:** excluido de lo anterior (ya existe `prop_personal`).

> **Gap actual en el modelo de datos:** los gastos tienen `propiedad` pero **no** un campo de
> cuenta bancaria ni un agrupador "unidad de explotación". Hoy la separación se puede hacer por
> `propiedad` (filtrando los 3 turísticos vs Duplex vs personal), pero conviene formalizar el
> agrupador para no depender de recordar qué piso va con qué cuenta. Decidir al implementar.

## Tributación (IRPF) vs contabilidad de explotación — NO confundir

> Aclarado revisando la **Renta 2025** (19/06/2026). La separación de arriba es **contable** (por
> cuenta/explotación). La **tributación en el IRPF** es otra capa. Detalle completo y mapa
> entidad↔propiedad en la skill **`perfil-fiscal`**.

- **Socorro (House Sevillana)** y el **Dúplex/Villasís** → su alquiler turístico **tributa en el
  IRPF personal** de Alberto (Socorro **50/50** con Pilar), **aunque** las plataformas ingresen en
  la cuenta de la **sociedad Punto y Coma SL**: ingresar ahí **no** significa tributar ahí, y **no
  hay contrato** de cesión que respalde el desvío → debe declararse en personal (riesgo de paralela
  si no). Es un punto **recurrente** (ya pasó en 2024). Confirmado por la asesoría (Asecon).
- **Busto Reform / Luxury Busto** → vía **Punto y Coma SL** hasta dic-2025; **desde 2026 a nombre de
  Alberto (personal)**.
- ⚠️ **Punto y Coma SL DORMIDA / INACTIVA desde finales de 2025** (NO disuelta ni liquidada — la SL
  sigue existiendo, solo cesa la actividad; más barato que liquidarla). Al estar dormida mantiene
  obligaciones formales mínimas (baja de actividad, IS inactiva a cero, depósito de cuentas) pero
  **sin** evento de liquidación. **➡️ Desde 2026 TODOS los pisos van a nombre de Alberto (IRPF
  personal); nada por la sociedad.**
- **Asesoría:** Asecon Consultores (lleva renta personal + la sociedad).
