/**
 * Express middleware that reads the Authorization header,
 * verifies the JWT, and sets req.user.
 */

import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from './jwt.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { UserRole } from '@antioch/shared';

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (user) {
      req.user = {
        id: user.id,
        stellarAddress: user.stellarAddress,
        role: user.role as UserRole,
      };
    }
  } catch {
    // Invalid / expired token — leave req.user undefined; protected routes will 401
  }

  next();
}
