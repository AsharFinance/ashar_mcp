/**
 * Bank Account Tools
 *
 * Ferramentas para cadastro e gerenciamento de contas bancarias (receivers)
 * na Ashar Finance. Suporta BRL, USD e EUR.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  BankAccountListInputSchema,
  BankAccountCreateInputSchema,
  BankAccountUpdateInputSchema,
  BankAccountDeleteInputSchema,
  ResponseFormat,
} from "../types.js";
import {
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  handleApiError,
} from "../services/asharApi.js";

const CHARACTER_LIMIT = 25_000;

export function registerBankAccountTools(server: McpServer) {
  // ── ashar_listar_contas_bancarias ─────────────────────────────────────────
  server.registerTool(
    "ashar_listar_contas_bancarias",
    {
      title: "Listar Contas Bancarias",
      description: `Lista todas as contas bancarias cadastradas pelo usuario na Ashar Finance.

Cada conta bancaria serve como receiver/destino para saques fiat (BRL, USD, EUR).

Args:
  - response_format ('markdown' | 'json'): Formato de saida (default: 'json')

Returns:
  Para JSON: Array de contas bancarias com:
  {
    "accounts": [{
      "id": string,
      "label": string,
      "country": string,
      "currency": string,
      "accountType": string,
      "beneficiary": string,
      "bankName": string | null,
      "iban": string | null,
      "swift": string | null,
      "pixKey": string | null,
      ...
    }]
  }

Exemplos de uso:
  - "Quais contas bancarias eu tenho cadastradas?"
  - "Lista minhas contas para saque"
  - "Mostra meus receivers"`,
      inputSchema: BankAccountListInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const accounts = await listBankAccounts(params.api_key);

        if (!accounts.length) {
          return {
            content: [{ type: "text", text: "Nenhuma conta bancaria cadastrada. Use `ashar_criar_conta_bancaria` para cadastrar uma." }],
          };
        }

        const items = accounts.map((acc: any) => ({
          id: acc.id,
          label: acc.label,
          country: acc.country,
          currency: acc.currency,
          account_type: acc.accountType,
          beneficiary: acc.beneficiary,
          bank_name: acc.bankName ?? null,
          branch_code: acc.branchCode ?? null,
          account_number: acc.accountNumber ?? null,
          routing_code: acc.routingCode ?? null,
          swift: acc.swift ?? null,
          iban: acc.iban ?? null,
          pix_key: acc.pixKey ?? null,
          pix_key_type: acc.pixKeyType ?? null,
          is_favorite: acc.isFavorite ?? false,
          created_at: acc.createdAt,
        }));

        const output = { accounts: items };

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = ["# Contas Bancarias", ""];
          for (const acc of items) {
            const star = acc.is_favorite ? " ⭐" : "";
            lines.push(`## ${acc.label} (${acc.currency})${star}`);
            lines.push(`- **Titular**: ${acc.beneficiary}`);
            lines.push(`- **Pais**: ${acc.country}`);
            lines.push(`- **Tipo**: ${acc.account_type}`);
            if (acc.bank_name) lines.push(`- **Banco**: ${acc.bank_name}`);
            if (acc.account_number) lines.push(`- **Conta**: ${acc.account_number}`);
            if (acc.swift) lines.push(`- **SWIFT/BIC**: ${acc.swift}`);
            if (acc.iban) lines.push(`- **IBAN**: ${acc.iban}`);
            if (acc.pix_key) lines.push(`- **PIX**: ${acc.pix_key}`);
            lines.push(`- **ID**: \`${acc.id}\``);
            lines.push("");
          }
          text = lines.join("\n");
        } else {
          text = JSON.stringify(output, null, 2);
        }

        return {
          content: [{ type: "text", text: text.slice(0, CHARACTER_LIMIT) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    },
  );

  // ── ashar_criar_conta_bancaria ────────────────────────────────────────────
  server.registerTool(
    "ashar_criar_conta_bancaria",
    {
      title: "Cadastrar Conta Bancaria",
      description: `Cadastra uma nova conta bancaria (receiver) para receber saques fiat na Ashar Finance.

Suporta contas em BRL (PIX), USD (Wire/ACH) e EUR (SEPA/IBAN).
A conta ficara disponivel como destino para saques fiat futuros.

Args:
  - label (string): Nome/apelido para identificar a conta
  - country (string): Pais ISO de 2 letras (ex: 'BR', 'US', 'PT')
  - currency (string): Moeda da conta: 'BRL', 'USD' ou 'EUR'
  - account_type (string): Tipo de conta: 'CHECKING' ou 'SAVINGS'
  - beneficiary (string): Nome do titular da conta
  - document (string, opcional): CPF/CNPJ do titular
  - bank_name (string, opcional): Nome do banco
  - branch_code (string, opcional): Codigo da agencia
  - account_number (string, opcional): Numero da conta
  - routing_code (string, opcional): Codigo ACH/ABA (para USD)
  - swift (string, opcional): Codigo SWIFT/BIC
  - iban (string, opcional): IBAN (para EUR)
  - pix_key (string, opcional): Chave PIX (para BRL)
  - pix_key_type (string, opcional): Tipo da chave PIX
  - response_format ('markdown' | 'json'): Formato de saida

Returns:
  Para JSON:
  {
    "id": string,
    "label": string,
    "currency": string,
    "beneficiary": string,
    "created": true
  }

Exemplos de uso:
  - "Cadastra uma conta bancaria no Brasil via PIX"
  - "Adiciona uma conta em EUR com IBAN para receber na Europa"
  - "Registra uma conta nos EUA para wire transfer"`,
      inputSchema: BankAccountCreateInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const account = await createBankAccount({
          label: params.label,
          country: params.country,
          currency: params.currency,
          accountType: params.account_type,
          beneficiary: params.beneficiary,
          document: params.document,
          bankName: params.bank_name,
          branchCode: params.branch_code,
          accountNumber: params.account_number,
          routingCode: params.routing_code,
          swift: params.swift,
          iban: params.iban,
          pixKey: params.pix_key,
          pixKeyType: params.pix_key_type,
        }, params.api_key);

        const output = {
          id: account.id,
          label: account.label,
          country: account.country,
          currency: account.currency,
          beneficiary: account.beneficiary,
          account_type: account.accountType,
          created: true,
        };

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            "# Conta Bancaria Cadastrada",
            "",
            `- **ID**: \`${output.id}\``,
            `- **Label**: ${output.label}`,
            `- **Titular**: ${output.beneficiary}`,
            `- **Moeda**: ${output.currency}`,
            `- **Pais**: ${output.country}`,
            `- **Tipo**: ${output.account_type}`,
            "",
            "Use esta conta como destino em `ashar_sacar_fiat` passando o `beneficiary_id`.",
          ];
          text = lines.join("\n");
        } else {
          text = JSON.stringify(output, null, 2);
        }

        return {
          content: [{ type: "text", text: text.slice(0, CHARACTER_LIMIT) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    },
  );

  // ── ashar_editar_conta_bancaria ───────────────────────────────────────────
  server.registerTool(
    "ashar_editar_conta_bancaria",
    {
      title: "Editar Conta Bancaria",
      description: `Edita uma conta bancaria existente na Ashar Finance.

Apenas os campos enviados serao atualizados. Campos nao enviados permanecem inalterados.

Args:
  - account_id (string): ID da conta bancaria a editar
  - label (string, opcional): Novo nome/apelido
  - beneficiary (string, opcional): Novo nome do titular
  - bank_name (string, opcional)
  - account_number (string, opcional)
  - swift (string, opcional)
  - iban (string, opcional)
  - pix_key (string, opcional)
  - is_favorite (boolean, opcional): Marcar como favorita
  - response_format ('markdown' | 'json')

Exemplos de uso:
  - "Atualiza o IBAN da conta X"
  - "Marca a conta Y como favorita"`,
      inputSchema: BankAccountUpdateInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        // snake_case (Zod schema) → camelCase (API backend)
        const snakeToCamel: Record<string, string> = {
          bank_name: "bankName",
          branch_code: "branchCode",
          account_number: "accountNumber",
          routing_code: "routingCode",
          pix_key: "pixKey",
          pix_key_type: "pixKeyType",
          account_type: "accountType",
          is_favorite: "isFavorite",
        };

        const updateData: Record<string, unknown> = {};
        const fields: (keyof typeof params)[] = [
          "label", "beneficiary", "document", "bank_name", "branch_code",
          "account_number", "routing_code", "swift", "iban", "pix_key",
          "pix_key_type", "account_type", "country", "currency", "is_favorite",
        ];
        for (const f of fields) {
          const v = (params as any)[f];
          if (v !== undefined) {
            const key = snakeToCamel[f] || String(f);
            updateData[key] = v;
          }
        }

        const account = await updateBankAccount(params.account_id, updateData);

        const output = {
          id: account.id,
          label: account.label,
          currency: account.currency,
          beneficiary: account.beneficiary,
          updated: true,
        };

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            "# Conta Bancaria Atualizada",
            "",
            `- **ID**: \`${output.id}\``,
            `- **Label**: ${output.label}`,
            `- **Titular**: ${output.beneficiary}`,
            `- **Moeda**: ${output.currency}`,
          ];
          text = lines.join("\n");
        } else {
          text = JSON.stringify(output, null, 2);
        }

        return {
          content: [{ type: "text", text: text.slice(0, CHARACTER_LIMIT) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    },
  );

  // ── ashar_deletar_conta_bancaria ──────────────────────────────────────────
  server.registerTool(
    "ashar_deletar_conta_bancaria",
    {
      title: "Deletar Conta Bancaria",
      description: `Remove uma conta bancaria cadastrada na Ashar Finance.

Args:
  - account_id (string): ID da conta bancaria a remover
  - response_format ('markdown' | 'json')

Atencao: Esta acao e irreversivel. A conta sera removida permanentemente.

Exemplos de uso:
  - "Remove a conta bancaria X"
  - "Deleta o receiver Y"`,
      inputSchema: BankAccountDeleteInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        await deleteBankAccount(params.account_id, params.api_key);

        const output = { deleted: true, account_id: params.account_id };

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          text = `Conta bancaria \`${params.account_id}\` removida com sucesso.`;
        } else {
          text = JSON.stringify(output, null, 2);
        }

        return {
          content: [{ type: "text", text }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    },
  );
}
