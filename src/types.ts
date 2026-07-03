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

export interface BankAccount {
  id: string;
  userId: string;
  label: string;
  country: string;
  currency: string;
  accountType: string;
  beneficiary: string;
  document: string | null;
  bankName: string | null;
  branchCode: string | null;
  accountNumber: string | null;
  routingCode: string | null;
  swift: string | null;
  iban: string | null;
  pixKey: string | null;
  pixKeyType: string | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RemittanceOrder {
  id: string;
  userId: string;
  amountBrl: string;
  targetCurrency: string;
  sourceCurrency: string;
  rate: string | null;
  spreadPct: string;
  spreadCostBrl: string | null;
  receivedForeign: string | null;
  beneficiaryId: string | null;
  beneficiaryName: string | null;
  bankName: string | null;
  accountType: string | null;
  iban: string | null;
  swift: string | null;
  status: string;
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
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario"),
    response_format: z
      .nativeEnum(ResponseFormat)
      .default(ResponseFormat.JSON)
      .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable"),
  })
  .strict();

export const BrlDepositCreateInputSchema = z
  .object({
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario"),
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
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario"),
    txid: z.string().min(1, "txid is required").describe("Transaction ID of the deposit"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

export const BrlDepositListInputSchema = z
  .object({
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario"),
    limit: z.number().int().min(1).max(100).default(30).describe("Maximum results to return"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

export const ConversionCreateInputSchema = z
  .object({
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario"),
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
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario"),
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
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario"),
    external_id: z.string().min(1, "external_id is required").describe("External ID do saque"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

export const CryptoDepositAddressInputSchema = z
  .object({
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario (Ashar Management)"),
    asset: z
      .enum(["USDT", "USDC"])
      .describe("Ativo para deposito: USDT ou USDC"),
    chain: z
      .string()
      .min(1, "chain is required")
      .describe("Blockchain (ex: ethereum, polygon, bsc, trx)"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

// ── Webhook Schemas ───────────────────────────────────────────────────────────

export const WebhookListInputSchema = z
  .object({
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

export const WebhookCreateInputSchema = z
  .object({
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario"),
    label: z.string().min(1, "label is required").describe("Nome/apelido do webhook (ex: 'Meu Servidor')"),
    url: z.string().url("url must be a valid HTTPS URL").describe("URL que recebera os eventos (deve comecar com https://)"),
    events: z.string().optional().describe("Tipos de evento separados por virgula: deposit, withdrawal, conversion, crypto_deposit, crypto_withdrawal, all (default: 'all')"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

export const WebhookDeleteInputSchema = z
  .object({
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario"),
    webhook_id: z.string().min(1, "webhook_id is required").describe("ID do webhook a remover"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

export const WebhookTestInputSchema = z
  .object({
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario"),
    webhook_id: z.string().min(1, "webhook_id is required").describe("ID do webhook a testar"),
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
export type WebhookListInput = z.infer<typeof WebhookListInputSchema>;
export type WebhookCreateInput = z.infer<typeof WebhookCreateInputSchema>;
export type WebhookDeleteInput = z.infer<typeof WebhookDeleteInputSchema>;
export type WebhookTestInput = z.infer<typeof WebhookTestInputSchema>;

// ── Bank Account Schemas ──────────────────────────────────────────────────────

export const BankAccountListInputSchema = z
  .object({
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

export const BankAccountCreateInputSchema = z
  .object({
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario"),
    label: z.string().min(1, "label is required").describe("Nome/apelido da conta"),
    country: z.string().min(2, "country is required").describe("Pais ISO (ex: BR, US, PT)"),
    currency: z.enum(["BRL", "USD", "EUR"]).describe("Moeda da conta"),
    account_type: z.enum(["CHECKING", "SAVINGS"]).describe("Tipo de conta: CHECKING ou SAVINGS"),
    beneficiary: z.string().min(1, "beneficiary is required").describe("Nome do titular"),
    document: z.string().optional().describe("CPF/CNPJ do titular (opcional)"),
    bank_name: z.string().optional().describe("Nome do banco"),
    branch_code: z.string().optional().describe("Codigo da agencia"),
    account_number: z.string().optional().describe("Numero da conta"),
    routing_code: z.string().optional().describe("Codigo de roteamento (ACH/ABA para USD)"),
    swift: z.string().optional().describe("Codigo SWIFT/BIC"),
    iban: z.string().optional().describe("IBAN (para EUR)"),
    pix_key: z.string().optional().describe("Chave PIX (para BRL)"),
    pix_key_type: z.string().optional().describe("Tipo da chave PIX"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

export const BankAccountUpdateInputSchema = z
  .object({
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario"),
    account_id: z.string().min(1, "account_id is required").describe("ID da conta bancaria"),
    label: z.string().optional().describe("Novo nome/apelido"),
    beneficiary: z.string().optional().describe("Novo nome do titular"),
    document: z.string().optional(),
    bank_name: z.string().optional(),
    branch_code: z.string().optional(),
    account_number: z.string().optional(),
    routing_code: z.string().optional(),
    swift: z.string().optional(),
    iban: z.string().optional(),
    pix_key: z.string().optional(),
    pix_key_type: z.string().optional(),
    account_type: z.enum(["CHECKING", "SAVINGS"]).optional(),
    country: z.string().min(2).optional(),
    currency: z.enum(["BRL", "USD", "EUR"]).optional(),
    is_favorite: z.boolean().optional(),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

export const BankAccountDeleteInputSchema = z
  .object({
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario"),
    account_id: z.string().min(1, "account_id is required").describe("ID da conta bancaria"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

// ── Fiat Withdrawal (Remittance) Schemas ──────────────────────────────────────

export const FiatWithdrawalCreateInputSchema = z
  .object({
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario"),
    amount: z.number().positive("amount must be positive").describe("Valor a sacar"),
    source_currency: z
      .enum(["BRL", "USD", "EUR"])
      .describe("Moeda de origem (saldo que sera debitado)"),
    target_currency: z
      .enum(["BRL", "USD", "EUR"])
      .describe("Moeda de destino (moeda que sera recebida)"),
    rate: z.number().positive().optional().describe("Taxa de cambio (opcional)"),
    spread_pct: z.number().min(0).max(10).optional().describe("Spread percentual (default: 2.5%)"),
    received_foreign: z.number().positive().optional().describe("Estimativa do valor recebido"),
    beneficiary_id: z.string().optional().describe("ID da conta bancaria cadastrada"),
    beneficiary_name: z.string().optional().describe("Nome do beneficiario"),
    bank_name: z.string().optional().describe("Nome do banco destino"),
    account_type: z.enum(["CHECKING", "SAVINGS"]).optional().describe("Tipo de conta destino"),
    iban: z.string().optional().describe("IBAN (para EUR)"),
    swift: z.string().optional().describe("SWIFT/BIC do banco destino"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

export const FiatWithdrawalListInputSchema = z
  .object({
    api_key: z.string().min(1, "api_key e obrigatorio").describe("Chave API do usuario"),
    response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.JSON),
  })
  .strict();

export type BankAccountListInput = z.infer<typeof BankAccountListInputSchema>;
export type BankAccountCreateInput = z.infer<typeof BankAccountCreateInputSchema>;
export type BankAccountUpdateInput = z.infer<typeof BankAccountUpdateInputSchema>;
export type BankAccountDeleteInput = z.infer<typeof BankAccountDeleteInputSchema>;
export type FiatWithdrawalCreateInput = z.infer<typeof FiatWithdrawalCreateInputSchema>;
export type FiatWithdrawalListInput = z.infer<typeof FiatWithdrawalListInputSchema>;
