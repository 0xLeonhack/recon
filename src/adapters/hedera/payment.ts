import { z } from 'zod';

import type { PaymentReceipt } from '../../core';

const accountId = z.string().regex(/^\d+\.\d+\.\d+$/);
const amountValue = z.union([z.number().int().safe(), z.string().regex(/^-?\d+$/)]);

const MirrorTransactionSchema = z.object({
  consensus_timestamp: z.string().min(1),
  name: z.string().min(1),
  result: z.string().min(1),
  transaction_id: z.string().min(1),
  transfers: z.array(
    z.object({
      account: accountId,
      amount: amountValue,
    }),
  ),
});

const MirrorTransactionsSchema = z.object({
  transactions: z.array(MirrorTransactionSchema),
});

export interface HbarPaymentReceiptInput {
  readonly settlementRef: string;
  readonly payer: string;
  readonly payTo: string;
  readonly service: string;
}

export class HederaPaymentReceiptError extends Error {
  constructor(
    readonly code:
      | 'INVALID_INPUT'
      | 'HTTP_ERROR'
      | 'INVALID_RESPONSE'
      | 'TRANSACTION_NOT_FOUND'
      | 'PAYMENT_MISMATCH',
  ) {
    super(`Hedera payment receipt lookup failed (${code})`);
    this.name = 'HederaPaymentReceiptError';
  }
}

function mirrorTransactionId(settlementRef: string): string {
  const match = /^(\d+\.\d+\.\d+)@(\d+)\.(\d{1,9})$/.exec(settlementRef);
  if (match === null) throw new HederaPaymentReceiptError('INVALID_INPUT');
  return `${match[1]}-${match[2]}-${match[3]?.padStart(9, '0')}`;
}

function sumTransfers(
  transfers: ReadonlyArray<{ readonly account: string; readonly amount: string | number }>,
  target: string,
): bigint {
  return transfers
    .filter((transfer) => transfer.account === target)
    .reduce((total, transfer) => total + BigInt(transfer.amount), 0n);
}

export async function readHbarPaymentReceipt(
  mirrorBaseUrl: string,
  input: HbarPaymentReceiptInput,
  fetchImpl: typeof fetch = fetch,
): Promise<PaymentReceipt> {
  if (
    !accountId.safeParse(input.payer).success ||
    !accountId.safeParse(input.payTo).success ||
    input.service.trim().length === 0
  ) {
    throw new HederaPaymentReceiptError('INVALID_INPUT');
  }

  let endpoint: URL;
  try {
    const base = new URL(mirrorBaseUrl);
    if (base.protocol !== 'https:') throw new Error('HTTPS required');
    endpoint = new URL(`/api/v1/transactions/${mirrorTransactionId(input.settlementRef)}`, base);
  } catch {
    throw new HederaPaymentReceiptError('INVALID_INPUT');
  }

  let response: Response;
  try {
    response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new HederaPaymentReceiptError('HTTP_ERROR');
  }
  if (!response.ok) throw new HederaPaymentReceiptError('HTTP_ERROR');

  const parsed = MirrorTransactionsSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) throw new HederaPaymentReceiptError('INVALID_RESPONSE');

  const expectedId = mirrorTransactionId(input.settlementRef);
  const transaction = parsed.data.transactions.find(
    (candidate) => candidate.transaction_id === expectedId,
  );
  if (transaction === undefined) {
    throw new HederaPaymentReceiptError('TRANSACTION_NOT_FOUND');
  }
  if (transaction.result !== 'SUCCESS' || transaction.name !== 'CRYPTOTRANSFER') {
    throw new HederaPaymentReceiptError('PAYMENT_MISMATCH');
  }

  const received = sumTransfers(transaction.transfers, input.payTo);
  const paid = sumTransfers(transaction.transfers, input.payer);
  if (received <= 0n || paid !== -received) {
    throw new HederaPaymentReceiptError('PAYMENT_MISMATCH');
  }

  return {
    asset: '0.0.0',
    amount: received.toString(),
    service: input.service,
    settlementRef: input.settlementRef,
    sourceRef: endpoint.toString(),
  };
}
