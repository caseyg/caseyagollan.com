import { describe, expect, test } from 'bun:test';
import { createDocument, readDocument, updateDocument } from '../src/lib/server/publishing/document';
import { parsePost } from '../src/lib/server/parse-post';

const source = `---
# Keep my comment
date: "2026-11-06T23:30:00-05:00"
title: Old title
category: [one, two]
custom:
  nested: [keep, this]
photo:
  - url: https://media.example/photo.jpg
    alt: A moon
---
**Original Markdown**\n`;

describe('publishing document', () => {
  test('preserves the exact source on a no-op', () => {
    expect(updateDocument(source, {})).toBe(source);
  });

  test('edits metadata without losing comments, offsets, unknown fields, or body', () => {
    const next = updateDocument(source, { replace: { name: ['New title'] } });
    expect(next).toContain('# Keep my comment');
    expect(next).toContain('2026-11-06T23:30:00-05:00');
    expect(next.endsWith('**Original Markdown**\n')).toBe(true);
    const doc = readDocument(next);
    expect(doc.properties.name).toEqual(['New title']);
    expect(doc.properties.published).toEqual(['2026-11-06T23:30:00-05:00']);
    expect(doc.properties.custom).toEqual([{ nested: ['keep', 'this'] }]);
    expect(doc.properties.photo).toEqual([{ url: 'https://media.example/photo.jpg', alt: 'A moon' }]);
  });

  test('applies all mixed operations and compares nested values structurally', () => {
    const next = updateDocument(source, {
      replace: { name: ['Changed'] },
      add: { category: ['three'], location: [{ type: ['h-card'], properties: { name: ['Home'] } }] },
      delete: { category: ['one'], photo: [{ alt: 'A moon', url: 'https://media.example/photo.jpg' }] }
    });
    const { properties } = readDocument(next);
    expect(properties.name).toEqual(['Changed']);
    expect(properties.category).toEqual(['two', 'three']);
    expect(properties.photo).toBeUndefined();
    expect(properties.location).toEqual([{ type: ['h-card'], properties: { name: ['Home'] } }]);
  });

  test('stores unknown property arrays without flattening nested structures', () => {
    const properties = { published: ['2026-11-06T12:00:00-05:00'], content: ['hello'], 'x-example': ['a', { nested: [1, true] }] };
    expect(readDocument(createDocument(properties)).properties).toEqual(properties);
  });

  test('round-trips literal text and HTML without interpreting their source', () => {
    for (const value of ['# literal *text*', { html: '<p>Hello <em>moon</em></p>' }]) {
      expect(readDocument(createDocument({ content: [value] })).properties.content).toEqual([value]);
    }
  });

  test('exposes legacy Markdown as explicit source rather than claiming it is plain text', () => {
    const doc = readDocument(source);
    expect(doc.bodyFormat).toBe('markdown');
    expect(doc.body).toBe('**Original Markdown**\n');
    expect(doc.properties.content).toBeUndefined();
  });

  test('deletes complete properties without touching the rest of the document', () => {
    const { properties } = readDocument(updateDocument(source, { delete: ['name', 'category'] }));
    expect(properties.name).toBeUndefined();
    expect(properties.category).toBeUndefined();
    expect(properties.custom).toEqual([{ nested: ['keep', 'this'] }]);
  });

  test('deletes a legacy Markdown body and refuses to silently replace it through add', () => {
    const next = readDocument(updateDocument(source, { delete: ['content'] }));
    expect(next.body).toBe('');
    expect(next.properties.name).toEqual(['Old title']);
    expect(() => updateDocument(source, { add: { content: ['accidental replacement'] } })).toThrow();
    expect(() => updateDocument(source, { delete: { content: ['Original Markdown'] } })).toThrow();
  });

  test('preserves legacy mp-photo-alt when editing unrelated metadata', () => {
    const legacy = '---\nphoto: [https://example.com/photo.jpg]\nmp-photo-alt: [Moon]\n---\nCaption';
    const edited = updateDocument(legacy, { replace: { name: ['A photo'] } });
    expect(parsePost(edited, 'photos', '2026-11-06-photo.md').photo?.[0].alt).toBe('Moon');
    expect(readDocument(edited).properties.name).toEqual(['A photo']);
    expect(readDocument(edited).body).toBe('Caption');
  });

  test('rejects ambiguous frontmatter aliases rather than masking edits', () => {
    expect(() => updateDocument('---\ntitle: Title\nname: Other\n---\nBody', { replace: { name: ['New'] } })).toThrow();
  });

  test('rejects invalid YAML, duplicate keys, non-mappings, and unsafe property names', () => {
    for (const markdown of ['---\na: [\n---\nx', '---\na: 1\na: 2\n---\nx', '---\n- item\n---\nx', '---\na: 1\nx']) {
      expect(() => readDocument(markdown)).toThrow();
    }
    for (const key of ['__proto__', 'constructor', 'prototype', 'mp-slug']) {
      expect(() => updateDocument(source, { replace: { [key]: ['bad'] } })).toThrow();
    }
    expect(() => updateDocument(source, { replace: { name: 'not an array' } } as never)).toThrow();
  });

  test('rejects date changes that would move an existing permalink and invalid content', () => {
    expect(() => updateDocument(source, { replace: { published: ['2026-11-07T00:30:00-05:00'] } })).toThrow();
    expect(() => updateDocument(source, { delete: ['published'] })).toThrow();
    expect(() => createDocument({ content: ['a', 'b'] })).toThrow();
    expect(() => createDocument({ content: [{ invalid: true }] })).toThrow();
  });
});
