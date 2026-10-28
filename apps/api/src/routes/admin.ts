/**
 * Admin endpoints:
 *   GET   /admin/campaigns
 *   GET   /admin/audit-log
 *   GET   /admin/users
 *   PATCH /admin/users/:id/role
 */

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { campaigns, auditLog, users } from '../db/schema.js';
import { requireAuth, validate, ApiError, writeAuditLog } from '../middleware/index.js';
import { UpdateUserRoleRequestSchema } from '@antioch/shared';

const router = Router();

// ---------------------------------------------------------------------------
// GET /admin/campaigns
// ---------------------------------------------------------------------------
router.get('/campaigns', requireAuth(['admin']), async (_req, res, next) => {
  try {
    const rows = await db.select().from(campaigns);
    res.json(
      rows.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        beneficiary: c.beneficiary,
        goalStroops: c.goalStroops.toString(),
        contractId: c.contractId,
        createdAt: c.createdAt,
        publishedAt: c.publishedAt,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/audit-log
// ---------------------------------------------------------------------------
router.get('/audit-log', requireAuth(['admin']), async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(auditLog)
      .orderBy(auditLog.createdAt);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/users
// ---------------------------------------------------------------------------
router.get('/users', requireAuth(['admin']), async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: users.id,
        stellarAddress: users.stellarAddress,
        role: users.role,
        displayName: users.displayName,
        createdAt: users.createdAt,
      })
      .from(users);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/users/:id/role
// ---------------------------------------------------------------------------
router.patch(
  '/users/:id/role',
  requireAuth(['admin']),
  validate(UpdateUserRoleRequestSchema),
  async (req, res, next) => {
    try {
      const { role } = req.body as { role: string };
      const userId = req.params['id'] as string;

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) throw new ApiError(404, 'User not found');

      const [updated] = await db
        .update(users)
        .set({ role: role as typeof users.$inferInsert['role'] })
        .where(eq(users.id, userId))
        .returning();

      await writeAuditLog(req.user!.id, 'user.role_change', 'user', userId, {
        from: user.role,
        to: role,
      });

      res.json({ id: updated.id, role: updated.role });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
