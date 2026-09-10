import { AccountId, Client, PrivateKey, TopicMessageSubmitTransaction } from '@hashgraph/sdk';

import { canonicalize, parseEvidenceEvent, type EvidenceEvent } from '../../core';

const hederaTopicId = /^\d+\.\d+\.\d+$/;

export interface EvidenceSubmitResult {
  /** Consensus sequence number assigned to the submitted message. */
  readonly sequenceNumber: number;
  /** Hedera transaction id of the submit transaction. */
  readonly transactionId: string;
}

/** Transport that submits raw message bytes to one HCS topic. */
export type HcsSubmitTransport = (message: Uint8Array) => Promise<EvidenceSubmitResult>;

export class HcsPublishError extends Error {
  constructor(readonly code: 'INVALID_TOPIC_ID' | 'INVALID_EVENT' | 'SUBMIT_FAILED') {
    super(`HCS publish failed (${code})`);
    this.name = 'HcsPublishError';
  }
}

/**
 * Evidence messages are canonical JSON so that the bytes we publish are
 * byte-stable and the mirror reader can parse them back into EvidenceEvent.
 */
export function encodeEvidenceEvent(event: EvidenceEvent): Uint8Array {
  return new TextEncoder().encode(canonicalize(event));
}

export async function publishEvidenceEvent(
  topicId: string,
  event: EvidenceEvent,
  submit: HcsSubmitTransport,
): Promise<EvidenceSubmitResult> {
  if (!hederaTopicId.test(topicId)) {
    throw new HcsPublishError('INVALID_TOPIC_ID');
  }
  // Validate exactly what the mirror reader will parse back.
  let validated: EvidenceEvent;
  try {
    validated = parseEvidenceEvent(event);
  } catch {
    throw new HcsPublishError('INVALID_EVENT');
  }

  try {
    return await submit(encodeEvidenceEvent(validated));
  } catch (error) {
    if (error instanceof HcsPublishError) throw error;
    throw new HcsPublishError('SUBMIT_FAILED');
  }
}

export interface HcsClientConfig {
  /** Hedera account id paying for the submit transactions, e.g. `0.0.1234`. */
  readonly operatorId: string;
  /** Operator private key (DER, raw ECDSA or ED25519). */
  readonly operatorKey: string;
}

export function createTestnetClient(config: HcsClientConfig): Client {
  const client = Client.forTestnet();
  client.setOperator(
    AccountId.fromString(config.operatorId),
    PrivateKey.fromString(config.operatorKey),
  );
  return client;
}

export function createSdkSubmitter(client: Client, topicId: string): HcsSubmitTransport {
  return async (message) => {
    const response = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .execute(client);
    const receipt = await response.getReceipt(client);
    const sequence = receipt.topicSequenceNumber;
    if (sequence === null || sequence === undefined) {
      throw new HcsPublishError('SUBMIT_FAILED');
    }
    return {
      sequenceNumber: sequence.toNumber(),
      transactionId: response.transactionId.toString(),
    };
  };
}
