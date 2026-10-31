import '@testing-library/jest-dom';
import { webcrypto } from 'node:crypto';

if (!global.crypto) {
  (global as any).crypto = webcrypto;
} else if (!global.crypto.randomUUID) {
  (global.crypto as any).randomUUID = webcrypto.randomUUID.bind(webcrypto);
}