export type SaleMode = "unidad" | "granel";

export type ProductSaleSettings = {
  saleMode: SaleMode;
  tracksInventory: boolean;
};

let settingsOwner = "";

type SettingsMap = Record<string, ProductSaleSettings>;

function storageKey(): string {
  const owner = settingsOwner.trim().toLowerCase();
  return owner ? `pos.productSaleSettings:${owner}` : "pos.productSaleSettings";
}

export function bindProductSettings(email: string) {
  settingsOwner = email.trim().toLowerCase();
}

function readAll(): SettingsMap {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SettingsMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveProductSaleSettings(code: string, settings: ProductSaleSettings) {
  if (!settingsOwner) return;
  const all = readAll();
  all[code] = {
    saleMode: settings.saleMode,
    tracksInventory: settings.saleMode === "unidad" ? true : settings.tracksInventory,
  };
  localStorage.setItem(storageKey(), JSON.stringify(all));
}

export function getProductSaleSettings(code: string): ProductSaleSettings | null {
  return readAll()[code] ?? null;
}

/** Prefer API fields; fall back to local cache for older responses. Units always track inventory. */
export function normalizeProduct<T extends {
  id: number;
  code: string;
  name: string;
  category?: string;
  buyPrice?: number;
  sellPrice?: number;
  stock?: number;
  saleMode?: SaleMode;
  tracksInventory?: boolean;
}>(raw: T) {
  const stored = getProductSaleSettings(raw.code);
  const saleMode: SaleMode =
    raw.saleMode === "granel" || raw.saleMode === "unidad"
      ? raw.saleMode
      : (stored?.saleMode ?? "unidad");
  const tracksInventory =
    saleMode === "unidad"
      ? true
      : typeof raw.tracksInventory === "boolean"
        ? raw.tracksInventory
        : (stored?.tracksInventory ?? true);

  // Keep local cache aligned when the API already returns these fields.
  if (raw.saleMode === "granel" || raw.saleMode === "unidad" || typeof raw.tracksInventory === "boolean") {
    saveProductSaleSettings(raw.code, { saleMode, tracksInventory });
  }

  return {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    category: raw.category ?? "",
    buyPrice: Number(raw.buyPrice) || 0,
    sellPrice: Number(raw.sellPrice) || 0,
    stock: Number(raw.stock) || 0,
    saleMode,
    tracksInventory,
  };
}

export function normalizeProducts<T extends Parameters<typeof normalizeProduct>[0]>(list: T[]) {
  return list.map(normalizeProduct);
}
