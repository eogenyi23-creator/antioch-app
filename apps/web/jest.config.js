module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', module: 'commonjs', esModuleInterop: true } }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(uint8array-extras|@exodus/bytes|@noble/hashes|@noble/ed25519|@stellar/stellar-sdk|@creit.tech/stellar-wallets-kit)/)',
  ],
};