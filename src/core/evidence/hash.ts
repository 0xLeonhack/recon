import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

import { canonicalize, type JsonValue } from './canonicalize';

export const HASH_ALGORITHM = 'sha256' as const;

export type Sha256Hash = `0x${string}`;

export function sha256Hex(value: string): Sha256Hash {
  return `0x${bytesToHex(sha256(utf8ToBytes(value)))}`;
}

export function hashCanonicalJson(value: JsonValue): Sha256Hash {
  return sha256Hex(canonicalize(value));
}
