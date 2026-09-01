export interface UnitOption {
  unit_name: string;
  conversion_factor_to_base: number;
}

// Every item implicitly supports its own base unit at factor 1, plus
// whatever secondary units (box, bag, carton...) are configured for it.
export function unitOptionsForItem(
  baseUnit: string,
  itemUnits: Array<{ unit_name: string; conversion_factor_to_base: number }>
): UnitOption[] {
  return [
    { unit_name: baseUnit, conversion_factor_to_base: 1 },
    ...itemUnits.map((u) => ({
      unit_name: u.unit_name,
      conversion_factor_to_base: u.conversion_factor_to_base,
    })),
  ];
}

export function toBaseQuantity(quantity: number, conversionFactor: number): number {
  return quantity * conversionFactor;
}

export function formatQuantity(quantity: number): string {
  return quantity.toLocaleString("en-LK", { maximumFractionDigits: 2 });
}

export function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 2,
  });
}
