import { describe, expect, test } from 'bun:test';
import { authorize, ProtocolError } from '../src/lib/server/publishing/auth';

const config = { me: 'https://example.com/', introspectionEndpoint: 'https://auth.example/introspect', introspectionToken: 'server-credential' };
const request = () => new Request('https://example.com/micropub', { headers: { Authorization: 'Bearer client-token' } });
const valid = { active: true, me: 'https://example.com', scope: 'create update delete undelete', client_id: 'https://quill.example/', exp: 9999999999 };

describe('Micropub authorization', () => {
  test('verifies at a fixed provider with separate server authorization and no caching or redirects', async () => {
    const identity = await authorize(request(), 'create', config, async (url, init) => {
      expect(url).toBe(config.introspectionEndpoint);
      expect(init.method).toBe('POST');
      expect(init.redirect).toBe('error');
      expect(init.cache).toBe('no-store');
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer server-credential');
      expect(String(init.body)).toBe('token=client-token');
      return Response.json(valid);
    });
    expect(identity.clientId).toBe('https://quill.example/');
  });

  test('requires a token and scopes before any write', async () => {
    await expect(authorize(new Request('https://example.com/micropub'), 'create', config)).rejects.toMatchObject({ status: 401 });
    await expect(authorize(request(), 'create', config, async () => Response.json({ ...valid, scope: 'update' }))).rejects.toMatchObject({ status: 403, code: 'insufficient_scope' });
  });

  test('rejects inactive, expired, malformed and different-profile tokens', async () => {
    for (const changes of [{ active: false }, { active: 'true' }, { exp: 1 }, { exp: '9999999999' }, { me: 'https://example.com/someone-else' }, { me: 'https://evil.example/' }, { scope: null }, { client_id: '' }]) {
      await expect(authorize(request(), 'create', config, async () => Response.json({ ...valid, ...changes }))).rejects.toBeInstanceOf(ProtocolError);
    }
  });

  test('does not trust identities in failed verification responses and fails closed on outage', async () => {
    await expect(authorize(request(), 'create', config, async () => Response.json(valid, { status: 401 }))).rejects.toMatchObject({ status: 401 });
    await expect(authorize(request(), 'create', config, async () => { throw new Error('secret upstream details'); })).rejects.toMatchObject({ status: 503 });
  });

  test('rejects query tokens and insecure verification configuration', async () => {
    await expect(authorize(new Request('https://example.com/micropub?access_token=bad'), 'create', config)).rejects.toMatchObject({ status: 400 });
    await expect(authorize(request(), 'create', { ...config, introspectionEndpoint: 'http://auth.example/token' })).rejects.toMatchObject({ status: 503 });
  });
});
