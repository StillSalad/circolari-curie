// Riassunto di una riga con Claude (facoltativo: serve ANTHROPIC_API_KEY).
export async function summarize(title, text) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !text || text.length < 200) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Riassumi questa circolare scolastica in una sola frase (massimo 180 caratteri) per uno studente: cosa succede, quando e cosa deve fare. Rispondi solo con la frase.\n\nTitolo: ${title}\n\nTesto: ${text.slice(0, 6000)}`,
        }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.content?.map((b) => b.text || '').join('').trim().slice(0, 240) || null;
  } catch {
    return null;
  }
}
