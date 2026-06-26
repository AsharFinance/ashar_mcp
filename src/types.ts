import { z } from "zod";

// ── Shared enums ──────────────────────────────────────────────────────────────

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

export enum ConversionDirection {
  FIAT_TO_CRYPTO = "FIAT_TO_CRYPTO",
  CRYPTO_TO_FIAT = "CRYPTO_TO_FIAT",
}

export enum SwapStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  COMPLETED = "COMPLETED",
  REJECTED = "REJECTED",
}

export enum WithdrawalStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export enum DepositStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  FAILED = "FAILED",
  EXPIRED = "EXPIRED",
}

// ── API response shapes ───────────────────────────────────────────────────────

export interface AsharBalance {
  brl: number;
  usd: number;
  usdt: number;
  usdc: number;
  eur: number;
}

export interface BrlDepositAccount {
  id: string;
  bankName: string;
  bankCode: string;
  agency: string;
  accountNumber: string;
  accountType: string;
  pixKey: string;
  pixKeyType: string;
  pixCopyPaste: string | null;
  beneficiary: string;
  beneficiaryDocument: string;
  isDefault: boolean;
  intermediaryBank: string | null;
  intermediaryBic: string | null;
}

export interface BrlDepositOrder {
  id: string;
  txid: string;
  amount_brl: number;
  pix_copy_paste: string;
  status: DepositStatus;
  provider_slug: string;
  retry_count: number;
  max_retries: number;
  expires_at: string;
  created_at: string;
  paid_at: string | null;
  upstream_status: string | null;
}

export interface ConversionRequest {
  id: string;
  direction: ConversionDirection;
  fromCurrency: string;
  toCurrency: string;
  amountFrom: string;
  amountToEstimate: string | null;
  status: SwapStatus;
  createdAt: string;
}

export interface CryptoWithdrawal {
  id: string;
  externalId: string;
  status: string;
  approvalTier: string;
  amount: string;
  asset: string;
  chain: string;
  destinationAddress: string;
  amountUsd: string;
  requiredSignatures: number | null;
  timelockUntil: string | null;
  createdAt: string;
}

export interface CryptoDepositAddress {
  id: string;
  chain: string;
  asset: string;
  address: string;
  label: string | null;
  createdAt: string;
}

// ── Pagination ────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  total: number;
  count: number;
  offset: number;
  items: T[];
  has_more: boolean;
  next_offset?: number;
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const BalanceInputSchema = z
  .object({
    response_format: z
      .nativeEnum(ResponseFormat)
      .default(ResponseFormat.JSON)
      .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable"),
  })
  .strict();

export const BrlDepositCreateInputSchema = z
  .object({
    amount_brl: z
      .number()
      .positive("amount_brl must be a positive number")
      .describe("Valor do deposito em BRL (ex: 100.00)"),
    response_format: z
      .nativeEnum(ResponseFormat)
      .default(ResponseFormat.JSON)
      .describe("Output format"),
  })
  .strict();

export const BrlDepositStatusInputSchema = z
  .object({
    txid: z.string().min(1, "txid is required").describe("Transaction ID of the deposit"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

export const BrlDepositListInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(30).describe("Maximum results to return"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

export const ConversionCreateInputSchema = z
  .object({
    from_currency: z
      .enum(["BRL", "USD", "EUR", "USDT", "USDC"])
      .describe("Moeda de origem: BRL, USD, EUR, USDT ou USDC"),
    to_currency: z
      .enum(["BRL", "USD", "EUR", "USDT", "USDC"])
      .describe("Moeda de destino: BRL, USD, EUR, USDT ou USDC"),
    amount_from: z.number().positive("amount_from must be positive").describe("Valor a converter"),
    amount_to_estimate: z
      .number()
      .positive()
      .optional()
      .describe("Estimativa do valor de destino (opcional)"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

export const CryptoWithdrawalCreateInputSchema = z
  .object({
    asset: z
      .enum(["USDT", "USDC"])
      .describe("Ativo a sacar: USDT ou USDC"),
    chain: z
      .string()
      .min(1, "chain is required")
      .describe("Blockchain (ex: ETHEREUM, BSC, POLYGON, TRX)"),
    amount: z.number().positive("amount must be positive").describe("Quantidade a sacar"),
    destination_address: z
      .string()
      .min(1, "destination_address is required")
      .describe("Endereco da carteira de destino"),
    external_id: z
      .string()
      .optional()
      .describe("ID externo para idempotencia (opcional)"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

export const CryptoWithdrawalStatusInputSchema = z
  .object({
    external_id: z.string().min(1, "external_id is required").describe("External ID do saque"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

export const CryptoDepositAddressInputSchema = z
  .object({
    asset: z
      .enum(["USDT", "USDC"])
      .describe("Ativo para deposito: USDT ou USDC"),
    chain: z
      .string()
      .min(1, "chain is required")
      .describe("Blockchain (ex: ETHEREUM, BSC, POLYGON, TRX)"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

export type BalanceInput = z.infer<typeof BalanceInputSchema>;
export type BrlDepositCreateInput = z.infer<typeof BrlDepositCreateInputSchema>;
export type BrlDepositStatusInput = z.infer<typeof BrlDepositStatusInputSchema>;
export type BrlDepositListInput = z.infer<typeof BrlDepositListInputSchema>;
export type ConversionCreateInput = z.infer<typeof ConversionCreateInputSchema>;
export type CryptoWithdrawalCreateInput = z.infer<typeof CryptoWithdrawalCreateInputSchema>;
export type CryptoWithdrawalStatusInput = z.infer<typeof CryptoWithdrawalStatusInputSchema>;
export type CryptoDepositAddressInput = z.infer<typeof CryptoDepositAddressInputSchema>;
