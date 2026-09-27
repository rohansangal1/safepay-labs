// Runs the owned reference checkout for manual exploration. Binds to loopback only.
import http from 'node:http';
import crypto from 'node:crypto';
import { createCheckout, DEFECTS } from './app.ts';

const port = Number(process.env.PORT || 4280);
const secret = process.env.LAB_WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex');
const defects = (process.env.LAB_DEFECTS || '').split(',').map(s => s.trim()).filter(Boolean);

const checkout = createCheckout({ secret, defects });
http.createServer(checkout.handle).listen(port, '127.0.0.1', () => {
  console.log(`Owned reference checkout on http://127.0.0.1:${port} (local only, fake provider)`);
  console.log(`Seeded defects: ${defects.length ? defects.join(', ') : 'none'}  (options: ${Object.keys(DEFECTS).join(', ')})`);
  if (!process.env.LAB_WEBHOOK_SECRET) console.log(`Lab webhook secret for this run: ${secret}`);
  console.log('Send a signed event with: LAB_WEBHOOK_SECRET=<secret> npm run checkout:event -- <order_id> <customer> [event_type]');
});
