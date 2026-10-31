import { CONTRACT_ERROR_MESSAGES, mapContractError } from '@/lib/errors';

test('error code mapping', () => {
  expect(CONTRACT_ERROR_MESSAGES[16]).toBe('Donation would exceed campaign funding cap');
  expect(mapContractError(17)).toBe('Approval threshold not yet reached');
  expect(mapContractError(999, 'fallback')).toBe('fallback');
});