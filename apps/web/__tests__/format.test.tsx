import { formatUsdc } from '@/lib/format';
import { toStroops, fromStroops } from '@antioch/shared';

test('amount formatting', () => {
  expect(fromStroops(10000000n)).toBe('1.0000000');
  expect(formatUsdc('10000000')).toBe('1.0000000');
  expect(toStroops('2.5000000')).toBe(25000000n);
});

test('over-cap block logic', () => {
  const remaining = 5000000n;
  const amount = toStroops('1.0000000');
  expect(amount > remaining).toBe(true);
});