import { describe, expect, test } from 'bun:test';
import { safeReturnTo } from '../src/lib/passkey-login';

const origin = 'https://caseyagollan.com';
describe('account sign-in return URL', () => {
 test('preserves the destination page, query and fragment', () => {
  const path = '/2026/11/13/against-disliteracy/syndicate?from=post#draft';
  expect(safeReturnTo(path, origin)).toBe(path);
  expect(safeReturnTo('/readwise', origin)).toBe('/readwise');
 });
 test('rejects missing, external and disguised external destinations', () => {
  for (const path of [null, '', 'https://evil.example/', '//evil.example/', '/\\evil.example/', 'javascript:alert(1)', 'readwise', '/\n/evil.example/']) {
   expect(safeReturnTo(path, origin)).toBeNull();
  }
 });
});
