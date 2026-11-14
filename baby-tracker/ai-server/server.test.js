import test from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { createServer } from './server.js';

// A stand-in for the Anthropic client, so these tests never call the real API.
function stub(reply) {
  const calls = [];
  return { calls, beta: { messages: { create: async (params) => { calls.push(params); if (reply instanceof Error) throw reply; return reply; } } } };
}
async function start(client, opts) {
  const server = createServer({ client, ...opts });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const ask = (body) => fetch(`${base}/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { base, ask, close: () => new Promise((r) => server.close(r)) };
}

test('returns the model text and sends the summary, question and system prompt', async () => {
  const client = stub({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Try avocado next.' }] });
  const s = await start(client);
  const res = await s.ask({ question: 'What next?', summary: 'Baby: Mia, 6 months old.' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await res.json(), { text: 'Try avocado next.' });
  const sent = client.calls[0];
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.match(sent.system, /TinyLog/);
  assert.match(sent.messages[0].content, /Baby: Mia, 6 months old\./);
  assert.match(sent.messages[0].content, /What next\?/);
  await s.close();
});

test('validates input, handles refusals and API failures, and rate limits', async () => {
  const s = await start(stub({ stop_reason: 'refusal', content: [] }), { perMinute: 4 });
  assert.equal((await s.ask({ question: '   ' })).status, 400);
  assert.equal((await s.ask({ question: 'x'.repeat(501) })).status, 413);
  const refused = await (await s.ask({ question: 'hi', summary: '' })).json();
  assert.match(refused.text, /can’t help/);
  assert.equal((await fetch(`${s.base}/health`)).status, 200);
  assert.equal((await s.ask({ question: 'again' })).status, 200);
  assert.equal((await s.ask({ question: 'and again' })).status, 429); // 5th POST within the minute
  await s.close();

  const failing = await start(stub(new Anthropic.APIError(500, { type: 'error' }, 'boom', new Headers())));
  const res = await failing.ask({ question: 'hi' });
  assert.equal(res.status, 502);
  assert.ok((await res.json()).error);
  await failing.close();
});
