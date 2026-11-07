import { expect, test } from 'bun:test';
import { publishingConfig } from '../src/lib/server/publishing/config';
import { forbiddenForm } from '../src/lib/server/form-origin';

test('publishing requires an explicit flag and a complete configuration', () => {
  expect(publishingConfig({})).toBeUndefined();
  expect(publishingConfig({ PUBLISHING_ENABLED: 'true' })).toBeUndefined();
  const env = { PUBLISHING_ENABLED: 'true', PUBLISHING_ME: 'https://example.com/', PUBLISHING_INTROSPECTION_ENDPOINT: 'https://auth.example/introspect', PUBLISHING_INTROSPECTION_TOKEN: 'secret', PUBLISHING_GITHUB_OWNER: 'caseyg', PUBLISHING_GITHUB_REPO: 'test', PUBLISHING_GITHUB_BRANCH: 'test', PUBLISHING_GITHUB_TOKEN: 'git-secret' };
  expect(publishingConfig(env)?.repo).toBe('test');
  const { PUBLISHING_INTROSPECTION_TOKEN, ...indiekit } = env;
  expect(publishingConfig(indiekit)?.repo).toBe('test');
  expect(publishingConfig({ ...indiekit, PUBLISHING_GITHUB_TOKEN: '' })).toBeUndefined();
  expect(publishingConfig({ ...env, PUBLISHING_ENABLED: 'false' })).toBeUndefined();
});

test('keeps same-origin form protection outside the token-authenticated Micropub route', () => {
  const form = (origin?: string) => new Request('https://example.com/api/update-document', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(origin ? { Origin: origin } : {}) }, body: 'x=y' });
  expect(forbiddenForm(form(), '/api/update-document')).toBe(true);
  expect(forbiddenForm(form('https://evil.example'), '/api/update-document')).toBe(true);
  expect(forbiddenForm(form('https://example.com'), '/api/update-document')).toBe(false);
  expect(forbiddenForm(form('https://quill.example'), '/micropub')).toBe(false);
  expect(forbiddenForm(form('https://quill.example'), '/micropub/media')).toBe(false);
  expect(forbiddenForm(form('https://quill.example'), '/api/other/media')).toBe(true);
  expect(forbiddenForm(new Request('https://example.com/'), '/')).toBe(false);
});
