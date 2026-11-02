import { ASSET_CODE } from '@/lib/config';

describe('ASSET_CODE', () => {
  const orig = process.env.NEXT_PUBLIC_ASSET_CODE;

  afterEach(() => {
    if (orig === undefined) {
      delete process.env.NEXT_PUBLIC_ASSET_CODE;
    } else {
      process.env.NEXT_PUBLIC_ASSET_CODE = orig;
    }
    jest.resetModules();
  });

  test('defaults to USDC when NEXT_PUBLIC_ASSET_CODE is unset', async () => {
    delete process.env.NEXT_PUBLIC_ASSET_CODE;
    jest.resetModules();
    const mod = await import('@/lib/config');
    expect(mod.ASSET_CODE).toBe('USDC');
  });

  test('reads NEXT_PUBLIC_ASSET_CODE from the environment', async () => {
    process.env.NEXT_PUBLIC_ASSET_CODE = 'TESTUSD';
    jest.resetModules();
    const mod = await import('@/lib/config');
    expect(mod.ASSET_CODE).toBe('TESTUSD');
  });
});
