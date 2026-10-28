import type { UserRole } from '@antioch/shared';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        stellarAddress: string;
        role: UserRole;
      };
    }
  }
}

export {};
