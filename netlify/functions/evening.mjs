// Funzione programmata: promemoria scadenze e riepilogo della sera, alle 19 ora italiana.
import { runEvening } from '../../lib/evening.mjs';

export default async () => {
  const result = await runEvening();
  console.log('Avvisi della sera:', JSON.stringify(result));
  return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
};

// 17 e 18 UTC: una delle due corrisponde alle 19 a Roma, in estate e in inverno
export const config = { schedule: '0 17,18 * * *' };
