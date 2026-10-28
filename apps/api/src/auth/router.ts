/**
 * Auth endpoints:
 *   POST /auth/challenge  — issue SEP-10-style challenge
 *   POST /auth/verify     — verify signed challenge, issue tokens
 *   POST /auth/refresh    — rotate refresh token
 *   POST /auth/logout     — revoke refresh token (client-side only; stateless)
 */

import { Router } from 'express';
import { Keypair, Transaction } from '@stellar/stellar-sdk';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { issueAccessToken, issueRefreshToken, verifyRefreshToken } from './jwt.js';
import { validate, ApiError } from '../middleware/index.js';
import { env } from '../config/env.js';
import {
  AuthChallengeRequestSchema,
  AuthVerifyRequestSchema,
  AuthRefreshRequestSchema,
} from '@antioch/shared';

const router = Router();

// In-memory nonce store (use Redis in production for multi-instance deployments)
const pendingChallenges = new Map<string, { nonce: string; expiresAt: number }>();

// ---------------------------------------------------------------------------
// POST /auth/challenge
// ---------------------------------------------------------------------------
router.post('/challenge', validate(AuthChallengeRequestSchema), (req, res, next) => {
  try {
    const { stellarAddress } = req.body as { stellarAddress: string };
    const nonce = Keypair.random().publicKey(); // random 56-char string
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    pendingChallenges.set(stellarAddress, { nonce, expiresAt });

    res.json({
      stellarAddress,
      nonce,
      message: `Sign this nonce to authenticate with Antioch: ${nonce}`,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /auth/verify
// ---------------------------------------------------------------------------
router.post('/verify', validate(AuthVerifyRequestSchema), async (req, res, next) => {
  try {
    const { stellarAddress, signedXdr } = req.body as {
      stellarAddress: string;
      signedXdr: string;
    };

    const challenge = pendingChallenges.get(stellarAddress);
    if (!challenge || Date.now() > challenge.expiresAt) {
      throw new ApiError(401, 'Challenge expired or not found. Request a new challenge.');
    }

    // Verify the signed transaction: the transaction must contain the nonce as a
    // memo and be signed by the stellarAddress key.
    let tx: Transaction;
    try {
      tx = new Transaction(signedXdr, env.networkPassphrase);
    } catch {
      throw new ApiError(400, 'Invalid transaction XDR');
    }

    // Check memo matches nonce
    if (tx.memo.value !== challenge.nonce) {
      throw new ApiError(401, 'Nonce mismatch');
    }

    // Verify signature
    const keypair = Keypair.fromPublicKey(stellarAddress);
    const hash = tx.hash();
    const sig = tx.signatures[0];
    if (!sig || !keypair.verify(hash, sig.signature())) {
      throw new ApiError(401, 'Invalid signature');
    }

    pendingChallenges.delete(stellarAddress);

    // Upsert user
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.stellarAddress, stellarAddress))
      .limit(1);

    if (!user) {
      [user] = await db
        .insert(users)
        .values({ stellarAddress })
        .returning();
    }

    const payload = { sub: user.id, address: user.stellarAddress, role: user.role };
    const accessToken = issueAccessToken(payload);
    const refreshToken = issueRefreshToken(payload);

    res.json({ accessToken, refreshToken, expiresIn: 900 });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------
router.post('/refresh', validate(AuthRefreshRequestSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new ApiError(401, 'Invalid or expired refresh token');
    }

    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user) throw new ApiError(401, 'User not found');

    const newPayload = { sub: user.id, address: user.stellarAddress, role: user.role };
    const accessToken = issueAccessToken(newPayload);
    const newRefreshToken = issueRefreshToken(newPayload);

    res.json({ accessToken, refreshToken: newRefreshToken, expiresIn: 900 });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------
router.post('/logout', (req, res) => {
  // Stateless JWT — client discards tokens. For a stateful blacklist, add to Redis here.
  res.json({ ok: true });
});

export default router;
