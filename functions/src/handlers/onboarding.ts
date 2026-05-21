import { onRequest } from 'firebase-functions/v2/https';
import * as crypto from 'crypto';
import { db, auth } from '../utils/firebaseAdmin';
import { checkOrgMembership } from '../utils/validation';

/**
 * POST /api/auth/onboarding
 * Creates a new org for a new user, or joins an existing org via invite.
 * Migrated from server.ts Express handler.
 */
export const onboarding = onRequest(
  { region: 'us-central1', timeoutSeconds: 60, memory: '256MiB', cors: true, invoker: 'public' },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Verify Firebase Auth token
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;
    if (!token) { res.status(401).json({ error: 'Unauthorized. Missing token.' }); return; }

    let user: any;
    try {
      user = await auth.verifyIdToken(token);
    } catch {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const userRef = db.doc(`users/${user.uid}`);
      const userDoc = await userRef.get();
      let activeOrgId = '';

      if (!userDoc.exists) {
        console.log(`[Onboarding] New user: ${user.email} (${user.uid})`);
        const batch = db.batch();
        let orgIdToUse = '';
        let orgNameToUse = '';
        let isJoiningExisting = false;

        // Check for pending invite
        if (user.email) {
          const inviteSnap = await db.collection('invites')
            .where('email', '==', user.email.toLowerCase())
            .where('status', '==', 'pending')
            .limit(1)
            .get();

          if (!inviteSnap.empty) {
            const inviteDoc = inviteSnap.docs[0];
            const inviteData = inviteDoc.data();
            orgIdToUse = inviteData.orgId;
            orgNameToUse = inviteData.orgName || 'Organization';
            isJoiningExisting = true;
            batch.update(inviteDoc.ref, { status: 'accepted', acceptedAt: Date.now(), acceptedBy: user.uid });
          }
        }

        if (!isJoiningExisting) {
          orgIdToUse = crypto.randomBytes(16).toString('hex');
          orgNameToUse = `${user.displayName || 'My'}'s Org`;
          batch.set(db.doc(`organizations/${orgIdToUse}`), {
            name: orgNameToUse, ownerId: user.uid, createdAt: Date.now()
          });
          batch.set(db.doc(`organizations/${orgIdToUse}/members/${user.uid}`), {
            email: user.email, role: 'owner', createdAt: Date.now()
          });
        } else {
          batch.set(db.doc(`organizations/${orgIdToUse}/members/${user.uid}`), {
            email: user.email, role: 'member', createdAt: Date.now()
          });
        }

        batch.set(userRef, {
          name: user.displayName || 'User',
          email: user.email,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastOrgId: orgIdToUse,
        });

        await batch.commit();
        activeOrgId = orgIdToUse;
      } else {
        const userData = userDoc.data()!;
        activeOrgId = userData.lastOrgId;

        // Check for a new pending invite for an org they're not in yet
        if (user.email) {
          const inviteSnap = await db.collection('invites')
            .where('email', '==', user.email.toLowerCase())
            .where('status', '==', 'pending')
            .limit(1)
            .get();

          if (!inviteSnap.empty) {
            const inviteDoc = inviteSnap.docs[0];
            const inviteOrgId = inviteDoc.data().orgId;
            const memberDoc = await db.doc(`organizations/${inviteOrgId}/members/${user.uid}`).get();

            if (!memberDoc.exists) {
              const batch = db.batch();
              batch.set(db.doc(`organizations/${inviteOrgId}/members/${user.uid}`), {
                email: user.email, role: 'member', createdAt: Date.now()
              });
              batch.update(userRef, { lastOrgId: inviteOrgId, updatedAt: Date.now() });
              batch.update(inviteDoc.ref, { status: 'accepted', acceptedAt: Date.now(), acceptedBy: user.uid });
              await batch.commit();
              activeOrgId = inviteOrgId;
            } else {
              await inviteDoc.ref.update({ status: 'accepted', acceptedAt: Date.now(), acceptedBy: user.uid });
            }
          }
        }
      }

      // Self-heal: if no org found, create one
      if (!activeOrgId) {
        const orgIdToUse = crypto.randomBytes(16).toString('hex');
        const batch = db.batch();
        batch.set(db.doc(`organizations/${orgIdToUse}`), {
          name: `${user.displayName || 'My'}'s Org`, ownerId: user.uid, createdAt: Date.now()
        });
        batch.set(db.doc(`organizations/${orgIdToUse}/members/${user.uid}`), {
          email: user.email, role: 'owner', createdAt: Date.now()
        });
        batch.update(userRef, { lastOrgId: orgIdToUse, updatedAt: Date.now() });
        await batch.commit();
        activeOrgId = orgIdToUse;
      }

      res.json({ success: true, orgId: activeOrgId });
    } catch (err: any) {
      console.error('[Onboarding] Error:', err);
      res.status(500).json({ error: 'Internal onboarding failure.' });
    }
  }
);
