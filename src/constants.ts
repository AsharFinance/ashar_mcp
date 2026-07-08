/** Shared constants for the Ashar MCP server. */

/** Maximum response size in characters before truncation. */
export const CHARACTER_LIMIT = 25_000;

/** Default API base URL (can be overridden via ASHAR_API_URL env var). */
export const DEFAULT_API_URL = "https://api.ashar.finance";

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
