import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as crypto from 'crypto';

const db = getFirestore();

export const cashfreeWebhookHandler = onRequest(
  { region: 'us-central1', timeoutSeconds: 30, memory: '256MiB' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const secret = process.env.CASHFREE_SECRET || '';
    const sigHeader = req.headers['x-webhook-signature'] as string | undefined;

    if (!sigHeader || !secret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody) {
      res.status(400).json({ error: 'Missing body' });
      return;
    }

    const expectedSig = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    const sigBuffer = Buffer.from(sigHeader, 'base64');
    const expectedBuffer = Buffer.from(expectedSig, 'base64');

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const event = req.body;
    const eventType = event?.type;
    const data = event?.data;
    
    const customerId = data?.subscription?.customer_details?.customer_id || data?.customer_details?.customer_id;

    if (!customerId) {
      res.status(200).json({ received: true });
      return;
    }

    const userSnap = await db.collection('users').where('cashfreeCustomerId', '==', customerId).limit(1).get();
    if (userSnap.empty) {
      res.status(200).json({ received: true });
      return;
    }

    const userRef = userSnap.docs[0].ref;

    try {
      if (eventType === 'SUBSCRIPTION_STATUS_CHANGED' && data?.subscription?.status === 'ACTIVE') {
        if (data?.subscription?.plan_id === 'invoex_pro') {
          await userRef.update({ plan: 'pro', updatedAt: Date.now() });
        } else {
          console.warn(`[Cashfree] Ignored active subscription for unknown plan_id: ${data?.subscription?.plan_id}`);
        }
      } else if (eventType === 'SUBSCRIPTION_STATUS_CHANGED' && (data?.subscription?.status === 'CANCELLED' || data?.subscription?.status === 'EXPIRED')) {
        await userRef.update({ plan: 'free', updatedAt: Date.now() });
      }
    } catch (err) {
      console.error('Webhook error:', err);
    }

    res.status(200).json({ received: true });
  }
);
