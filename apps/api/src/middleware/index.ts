/**
 * Shared Express middleware utilities.
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import type { UserRole } from '@antioch/shared';
import { db } from '../db/client.js';
import { auditLog } from '../db/schema.js';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  console.error('[unhandled error]', err);
  res.status(500).json({ error: 'Internal server error' });
}

// ---------------------------------------------------------------------------
// Request body validation
// ---------------------------------------------------------------------------

export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}

// ---------------------------------------------------------------------------
// Auth guard — requires req.user to be populated by auth middleware
// ---------------------------------------------------------------------------

export function requireAuth(roles?: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorised' });
      return;
    }
    if (roles && !roles.includes(req.user.role as UserRole)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Audit logger — call after a successful admin/approver action
// ---------------------------------------------------------------------------

export async function writeAuditLog(
  actorId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLog).values({ actorId, action, resourceType, resourceId, metadata });
}
