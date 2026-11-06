import { describe, expect, test } from 'bun:test';
import { renderContent } from '../src/lib/utils/renderContent';

describe('publishing content rendering', () => {
 test('HTML preserves markup and literal Markdown without auto embeds', () => {
  const html = renderContent('<article class="h-entry"><p class="e-content">**literal** https://youtu.be/dQw4w9WgXcQ @casey@example.com</p><img class="u-photo" src="/photo.jpg" alt="A &amp; B"></article>', 'html');
  expect(html).toContain('<article class="h-entry">');
  expect(html).toContain('**literal** https://youtu.be/dQw4w9WgXcQ @casey@example.com');
  expect(html).toContain('alt="A &#x26; B"');
  expect(html).not.toContain('iframe');
 });
 test('removes active HTML and encoded unsafe URLs', () => {
  const html = renderContent('<script>alert(1)</script><img src="data:image/svg+xml,x" onerror="alert(2)"><a href="jav&#x61;script:alert(3)">x</a><a href="java&#10;script:alert(4)">y</a><svg><a xlink:href="javascript:x">z</a></svg><form action="https://evil.test"><input></form>', 'html');
  expect(html).not.toMatch(/script|onerror|data:|svg|form|input|xlink/i);
  expect(html).toContain('<a>x</a>');
 });
 test('allows only trusted HTTPS video frames', () => {
  const html = renderContent('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" onload="x" srcdoc="bad"></iframe><iframe src="https://www.youtube.com.evil.test/embed/x"></iframe><iframe src="https://evil.test"></iframe>', 'html');
  expect(html.match(/<iframe/g)).toHaveLength(1);
  expect(html).not.toMatch(/onload|srcdoc|evil/);
 });
 test('sanitized malformed HTML survives repeated parsing unchanged', () => {
  const once = renderContent('<p id="note"><b>A & B</p><img src="/x" onerror="x"><a href="vbscript:x">link</a>', 'html');
  expect(renderContent(once, 'html')).toBe(once);
  expect(once).not.toMatch(/onerror|vbscript/);
 });
 test('text remains literal and Markdown retains video and social links safely', () => {
  expect(renderContent('<b>**a**</b>\nhttps://example.com', 'text')).toBe('&#x3C;b>**a**&#x3C;/b><br><a href="https://example.com">https://example.com</a>');
  const html = renderContent('https://youtu.be/dQw4w9WgXcQ\n@casey@example.com\n<script>x</script>\n[unsafe](javascript:alert(1))');
  expect(html).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ');
  expect(html).toContain('https://example.com/@casey');
  expect(html).not.toMatch(/<script|href="javascript:/);
 });
});

test('plain text links public URLs while preserving literal markup and Markdown', () => {
 const html = renderContent('*literal* <img src=x onerror="attack"> https://example.com/post?a=1&b=2.\n"http://example.org/a" <script>bad()</script>', 'text');
 expect(html).toContain('*literal* &#x3C;img src=x onerror="attack">');
 expect(html).toContain('<a href="https://example.com/post?a=1&#x26;b=2">https://example.com/post?a=1&#x26;b=2</a>.');
 expect(html).toContain('<a href="http://example.org/a">http://example.org/a</a>');
 expect(html).not.toMatch(/<img|<script|<em>|<iframe/);
});

test('plain text links cannot introduce attributes or interpret surrounding HTML entities', () => {
 const html = renderContent('https://example.com/" onclick="attack &lt;b&gt; https://example.org/path).', 'text');
 expect(html).toContain('<a href="https://example.com/">https://example.com/</a>');
 expect(html).toContain('&#x26;lt;b&#x26;gt;');
 expect(html).toContain('<a href="https://example.org/path">https://example.org/path</a>).');
 expect(html).not.toContain(' onclick="attack"');
});
