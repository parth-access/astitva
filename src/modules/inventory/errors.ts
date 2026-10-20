export type Shortage = { variantId: string; requested: number; available: number };

export class InventoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "InventoryError";
  }
}

/** Not enough unreserved stock: for the last one in a size, "someone else just got it". */
export class InsufficientStockError extends InventoryError {
  constructor(readonly shortages: Shortage[]) {
    super("insufficient_stock", `Insufficient stock for ${shortages.map((s) => s.variantId).join(", ")}`);
    this.name = "InsufficientStockError";
  }
}

/** Variant missing, deactivated, or its product is not published. */
export class VariantUnavailableError extends InventoryError {
  constructor(readonly variantIds: string[]) {
    super("variant_unavailable", `Variants not purchasable: ${variantIds.join(", ")}`);
    this.name = "VariantUnavailableError";
  }
}

export class ReservationStateError extends InventoryError {
  constructor(message: string) {
    super("reservation_state", message);
    this.name = "ReservationStateError";
  }
}
