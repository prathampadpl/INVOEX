import { onRequest } from 'firebase-functions/v2/https';
import { getStorage } from 'firebase-admin/storage';

export const fixCorsHttp = onRequest(
  { region: 'us-central1' },
  async (req, res) => {
    try {
      const bucket = getStorage().bucket();
      await bucket.setCorsConfiguration([
        {
          origin: ['*'],
          method: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'HEAD'],
          responseHeader: ['*'],
          maxAgeSeconds: 3600
        }
      ]);
      res.send('CORS Fixed successfully!');
    } catch (err: any) {
      res.status(500).send(`Error: ${err.message}`);
    }
  }
);
