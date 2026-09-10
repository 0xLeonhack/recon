export function parseUnsigned(value: string, field: string): bigint {
  if (!isUnsignedDecimal(value)) {
    throw new TypeError(`${field} must be an unsigned decimal string`);
  }
  return BigInt(value);
}

export function isUnsignedDecimal(value: string): boolean {
  return /^(0|[1-9]\d*)$/.test(value);
}

export function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
