/** Shared constants for the Ashar MCP server. */

/** Maximum response size in characters before truncation. */
export const CHARACTER_LIMIT = 25_000;

/** Default API base URL (can be overridden via ASHAR_API_URL env var). */
export const DEFAULT_API_URL = "https://api.ashar.finance";

/** Default CaaS API URL. */
export const DEFAULT_CAAS_URL = "https://api-assets.up.railway.app";

/** Request timeout in milliseconds. Can be overridden via ASHAR_TIMEOUT_MS. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Maximum retry attempts for transient failures. */
export const MAX_RETRIES = 3;

/** Base delay for exponential backoff in ms. */
export const RETRY_BASE_DELAY_MS = 500;

/** HTTP status codes that are safe to retry (transient). */
export const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

// ── Error codes for structured error handling ─────────────────────────────

export enum ErrorCode {
  /** Authentication failure — invalid/expired API key or token. */
  AUTH_FAILED = "AUTH_FAILED",
  /** Authorization failure — valid credentials but insufficient permissions. */
  ACCESS_DENIED = "ACCESS_DENIED",
  /** Request validation error — bad parameters. */
  VALIDATION_ERROR = "VALIDATION_ERROR",
  /** Resource not found. */
  NOT_FOUND = "NOT_FOUND",
  /** Rate limit exceeded. */
  RATE_LIMITED = "RATE_LIMITED",
  /** Network error — DNS, connection refused, TLS failure. */
  NETWORK_ERROR = "NETWORK_ERROR",
  /** Request timed out. */
  TIMEOUT = "TIMEOUT",
  /** Upstream API returned an unexpected error. */
  UPSTREAM_ERROR = "UPSTREAM_ERROR",
  /** Unknown / unclassified error. */
  UNKNOWN = "UNKNOWN",
  /** Configuration error — missing or invalid env vars. */
  CONFIG_ERROR = "CONFIG_ERROR",
}

// ── Log levels for structured logging ──────────────────────────────────────

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// ── Environment modes ──────────────────────────────────────────────────────

export type EnvMode = "production" | "sandbox" | "development";

// ── Wallet Composition: 3 provedores (Notus, BlindPay, Alchemy) ──────────

/**
 * Cadeias servidas pelo provider Notus (Smart Accounts ERC-4337 via Kernel v3.3).
 * O CaaS gera uma EOA signer local, criptografa e usa para assinar UserOperations.
 * Um unico endereco Smart Account por chain, multi-asset (USDT + USDC na mesma chain).
 */
export const NOTUS_CHAINS = ["eth", "polygon", "bsc"] as const;

/**
 * Cadeias servidas pelo provider BlindPay (custodia terceirizada).
 * BlindPay gerencia chave privada — nao ha signer EOA local.
 */
export const BLINDPAY_CHAINS = ["solana", "tron", "stellar", "base", "arbitrum"] as const;

/** Todas as chains suportadas para operacoes crypto (Notus + BlindPay). */
export const ALL_SUPPORTED_CHAINS = [...NOTUS_CHAINS, ...BLINDPAY_CHAINS] as const;

/** Mapeamento chain → provider: qual provedor atende cada blockchain. */
export const CHAIN_PROVIDER: Record<string, "notus" | "blindpay" | "alchemy"> = {
  // Canonical (lowercase)
  eth: "notus",
  polygon: "notus",
  bsc: "notus",
  solana: "blindpay",
  tron: "blindpay",
  stellar: "blindpay",
  base: "blindpay",
  arbitrum: "blindpay",
  // Aliases aceitos (case-insensitive no resolveProvider)
  ethereum: "notus",
  trx: "blindpay",
};

/**
 * Chains legadas (formato UPPERCASE usado pelo backend Management).
 * @deprecated use ALL_SUPPORTED_CHAINS (lowercase) para novas integracoes.
 */
export const SUPPORTED_CHAINS = ["ETHEREUM", "BSC", "POLYGON", "TRX", "BTC", "SOLANA", "STELLAR", "BASE", "ARBITRUM"] as const;

/** Supported crypto assets. */
export const SUPPORTED_ASSETS = ["USDT", "USDC"] as const;

/** Supported fiat currencies. */
export const SUPPORTED_FIAT = ["BRL", "USD", "EUR"] as const;

/** Todas as moedas suportadas para conversao (5 moedas). */
export const ALL_CURRENCIES = ["BRL", "USD", "EUR", "USDT", "USDC"] as const;
