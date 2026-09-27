import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyWhatsappSignature, generateReply, processAutoReply, autoReplyConfigured } from '../src/modules/crm/whatsapp/whatsapp.ai.js';

test('webhook authentication rejects altered payloads and missing signatures', () => {
  const body = Buffer.from('{"hello":1}');
  const signature = 'sha256=' + createHmac('sha256', 'secret').update(body).digest('hex');
  assert.equal(verifyWhatsappSignature(body, signature, 'secret'), true);
  assert.equal(verifyWhatsappSignature(Buffer.from('{}'), signature, 'secret'), false);
  assert.equal(verifyWhatsappSignature(body, undefined, 'secret'), false);
  assert.equal(verifyWhatsappSignature(body, signature, ''), false);
});

test('auto-replies require opt-in and both providers credentials', () => {
  const config = { anthropic: { apiKey: 'test' }, whatsapp: { autoReply: true, appSecret: 's', accessToken: 't', phoneNumberId: 'p' } };
  assert.equal(autoReplyConfigured(config), true);
  assert.equal(autoReplyConfigured({ ...config, anthropic: {} }), false);
  config.whatsapp.autoReply = false;
  assert.equal(autoReplyConfigured(config), false);
});

test('Claude request uses API authentication and limits WhatsApp text length', async () => {
  const result = await generateReply([{ direction: 'inbound', messageType: 'text', body: 'Hello' }], { apiKey: 'test-key', model: 'test-model', systemPrompt: 'Support' }, async (url, options) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(options.headers['x-api-key'], 'test-key');
    assert.deepEqual(JSON.parse(options.body).messages, [{ role: 'user', content: 'Hello' }]);
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'x'.repeat(5000) }] }) };
  });
  assert.equal(result.length, 4096);
  await assert.rejects(generateReply([{ direction: 'inbound', messageType: 'text', body: 'Hi' }], {}, async () => ({ ok: false, status: 429 })), /429/);
});

function fixture({ claimed = true, old = false, superseded = false, fail = false } = {}) {
  const message = { id: 'incoming', conversationId: 'chat', sentAt: new Date(Date.now() - (old ? 25 * 3600000 : 0)), body: 'Hello', direction: 'inbound', messageType: 'text' };
  let reads = 0;
  const states = [], sent = [];
  return { states, sent, args: {
    config: { anthropic: {} },
    db: { crmWhatsappMessage: {
      findFirst: async () => ++reads === 1 || !superseded ? message : { id: 'staff-reply' },
      updateMany: async () => ({ count: claimed ? 1 : 0 }),
      findMany: async () => [message],
      update: async ({ data }) => states.push(data.status),
    } },
    generate: async () => { if (fail) throw new Error('API unavailable'); return 'Hello back'; },
    send: async (...args) => sent.push(args),
  } };
}

test('worker replies once only after winning the persistent claim', async () => {
  const f = fixture(); await processAutoReply(f.args);
  assert.deepEqual(f.sent, [['chat', 'Hello back']]);
  assert.deepEqual(f.states, ['ai_replied']);
  const duplicate = fixture({ claimed: false }); await processAutoReply(duplicate.args);
  assert.equal(duplicate.sent.length, 0);
});

test('worker skips expired or superseded messages', async () => {
  for (const options of [{ old: true }, { superseded: true }]) {
    const f = fixture(options); await processAutoReply(f.args);
    assert.equal(f.sent.length, 0); assert.deepEqual(f.states, ['ai_skipped']);
  }
});

test('provider failures leave a persistent failed state without sending', async () => {
  const f = fixture({ fail: true }); await assert.rejects(processAutoReply(f.args), /unavailable/);
  assert.equal(f.sent.length, 0); assert.deepEqual(f.states, ['ai_failed']);
});

test('Claude sends workspace header when configured and omits it otherwise', async () => {
  for (const workspaceId of ['wrkspc_example', undefined]) {
    await generateReply([{direction:'inbound',messageType:'text',body:'Hello'}], {workspaceId}, async (_url, options) => {
      assert.equal(options.headers['anthropic-workspace-id'], workspaceId);
      assert.equal(Object.hasOwn(options.headers, 'anthropic-workspace-id'), Boolean(workspaceId));
      return {ok:true,json:async()=>({content:[{type:'text',text:'Hi'}]})};
    });
  }
});

test('missing workspace error gives actionable diagnostics without leaking provider text', async () => {
  await assert.rejects(generateReply([{direction:'inbound',messageType:'text',body:'Hello'}], {}, async () => ({
    ok:false,status:400,json:async()=>({error:{message:'This API key secret-value is not scoped to a workspace'}}),
  })), error => {
    assert.match(error.autoReplyDiagnostic, /ANTHROPIC_WORKSPACE_ID/);
    assert.doesNotMatch(error.message, /secret-value/);
    return true;
  });
});

test('raw webhook body survives trailing slash, query string, and Express case-insensitive routing', async () => {
  const { captureWhatsappBody } = await import('../src/modules/crm/whatsapp/whatsapp.ai.js');
  const body = Buffer.from('{"entry":[]}');
  const signature = 'sha256=' + createHmac('sha256', 'secret').update(body).digest('hex');
  for (const originalUrl of ['/api/crm/whatsapp/webhook', '/api/crm/whatsapp/webhook/', '/api/crm/whatsapp/webhook/?x=1', '/API/CRM/WHATSAPP/WEBHOOK']) {
    const req = {originalUrl};
    captureWhatsappBody(req, {}, body);
    assert.equal(verifyWhatsappSignature(req.rawBody, signature, 'secret'), true);
  }
  const other = {originalUrl:'/api/auth/login'};
  captureWhatsappBody(other, {}, body);
  assert.equal(other.rawBody, undefined);
});
