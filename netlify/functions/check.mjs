// Funzione programmata: controlla le circolari ogni 20 minuti.
import { runCheck } from '../../lib/core.mjs';

export default async () => {
  const result = await runCheck({ detailLimit: 5, notify: true });
  console.log('Controllo circolari:', JSON.stringify(result));
  return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
};

export const config = { schedule: '*/20 * * * *' };
