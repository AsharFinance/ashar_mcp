/** Shared constants for the Ashar MCP server. */

/** Maximum response size in characters before truncation. */
export const CHARACTER_LIMIT = 25_000;

/** Default API base URL (can be overridden via ASHAR_API_URL env var). */
export const DEFAULT_API_URL = "https://api.ashar.finance";

/** Supported chains for crypto operations. */
export const SUPPORTED_CHAINS = ["ETHEREUM", "BSC", "POLYGON", "TRX", "BTC"] as const;

/** Supported crypto assets. */
export const SUPPORTED_ASSETS = ["USDT", "USDC"] as const;

/** Supported fiat currencies. */
export const SUPPORTED_FIAT = ["BRL", "USD", "EUR"] as const;
