import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { upgradeTenantPlan, cancelTenantPlan } from '../../services/TenantService.js';
import { sendUpgradeConfirmation } from '../../services/EmailService.js';

// Paddle price ID → plan name mapping (set your actual price IDs in env)
const PRICE_TO_PLAN: Record<string, 'starter' | 'pro'> = {
  [process.env.PADDLE_PRICE_STARTER ?? 'pri_starter']: 'starter',
  [process.env.PADDLE_PRICE_PRO     ?? 'pri_pro']:     'pro',
};

function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader) return false;
  // Paddle v2 signature: ts=...;h1=...
  const parts = Object.fromEntries(signatureHeader.split(';').map(s => s.split('=')));
  const ts    = parts['ts'];
  const h1    = parts['h1'];
  if (!ts || !h1) return false;

  const signed  = `${ts}:${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(h1, 'hex'), Buffer.from(expected, 'hex'));
}

export async function paddleWebhook(app: FastifyInstance) {
  app.post('/paddle', {
    config: { rawBody: true },
  }, async (req, reply) => {
    const rawBody = (req as any).rawBody as string;
    const secret  = process.env.PADDLE_WEBHOOK_SECRET ?? '';
    const sig     = req.headers['paddle-signature'] as string | undefined;

    if (!verifyPaddleSignature(rawBody, sig, secret)) {
      req.log.warn('Invalid Paddle signature');
      return reply.code(401).send({ error: 'INVALID_SIGNATURE' });
    }

    const { event_type, data } = req.body as { event_type: string; data: any };
    req.log.info({ event_type }, 'Paddle webhook received');

    try {
      if (event_type === 'subscription.created' || event_type === 'subscription.updated') {
        const customerId = data.customer_id;
        const subId      = data.id;
        const priceId    = data.items?.[0]?.price?.id;
        const plan       = PRICE_TO_PLAN[priceId];
        const email      = data.customer?.email;

        if (plan) {
          await upgradeTenantPlan(customerId, subId, plan, email);
          if (email) sendUpgradeConfirmation(email, plan).catch(() => {});
        }
      }

      if (event_type === 'subscription.cancelled') {
        await cancelTenantPlan(data.id);
      }
    } catch (err) {
      req.log.error(err, 'Paddle webhook processing failed');
    }

    reply.code(200).send({ received: true });
  });
}
