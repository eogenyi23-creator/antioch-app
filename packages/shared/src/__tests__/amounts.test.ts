import { toStroops, fromStroops, parseStroops } from '../amounts';

describe('toStroops', () => {
  it('converts a whole number', () => {
    expect(toStroops('1')).toBe(10_000_000n);
  });

  it('converts zero', () => {
    expect(toStroops('0')).toBe(0n);
  });

  it('converts a value with exactly 7 decimal places', () => {
    expect(toStroops('1.0000001')).toBe(10_000_001n);
  });

  it('converts a value with fewer than 7 decimal places', () => {
    expect(toStroops('1.5')).toBe(15_000_000n);
  });

  it('converts a large value', () => {
    expect(toStroops('5000.0000000')).toBe(50_000_000_000n);
  });

  it('handles leading zeros in fractional part', () => {
    expect(toStroops('1.0000100')).toBe(10_000_100n);
  });

  it('converts the showcase milestone amounts', () => {
    expect(toStroops('200.0000000')).toBe(2_000_000_000n);
    expect(toStroops('300.0000000')).toBe(3_000_000_000n);
  });

  it('throws for more than 7 decimal places', () => {
    expect(() => toStroops('1.00000001')).toThrow(RangeError);
  });

  it('throws for a negative value', () => {
    expect(() => toStroops('-1')).toThrow(RangeError);
  });

  it('throws for an empty string', () => {
    expect(() => toStroops('')).toThrow(RangeError);
  });

  it('throws for a non-numeric string', () => {
    expect(() => toStroops('abc')).toThrow(RangeError);
  });

  it('throws for a float with exponent notation', () => {
    expect(() => toStroops('1e7')).toThrow(RangeError);
  });

  it('throws for a value with more than one decimal point', () => {
    expect(() => toStroops('1.1.1')).toThrow(RangeError);
  });
});

describe('fromStroops', () => {
  it('converts zero stroops', () => {
    expect(fromStroops(0n)).toBe('0.0000000');
  });

  it('converts one stroop', () => {
    expect(fromStroops(1n)).toBe('0.0000001');
  });

  it('converts one whole unit', () => {
    expect(fromStroops(10_000_000n)).toBe('1.0000000');
  });

  it('produces exactly 7 decimal places', () => {
    const result = fromStroops(10_000_001n);
    expect(result).toBe('1.0000001');
    expect(result.split('.')[1]).toHaveLength(7);
  });

  it('converts a large value', () => {
    expect(fromStroops(50_000_000_000n)).toBe('5000.0000000');
  });

  it('round-trips with toStroops', () => {
    const original = '123.4567890';
    expect(fromStroops(toStroops(original))).toBe(original);
  });

  it('throws for negative stroops', () => {
    expect(() => fromStroops(-1n)).toThrow(RangeError);
  });
});

describe('parseStroops', () => {
  it('parses a valid stroop string', () => {
    expect(parseStroops('10000000')).toBe(10_000_000n);
  });

  it('parses zero', () => {
    expect(parseStroops('0')).toBe(0n);
  });

  it('throws for a decimal string', () => {
    expect(() => parseStroops('1.5')).toThrow(RangeError);
  });

  it('throws for a negative string', () => {
    expect(() => parseStroops('-1')).toThrow(RangeError);
  });

  it('throws for an empty string', () => {
    expect(() => parseStroops('')).toThrow(RangeError);
  });
});
