import { expect, test } from 'bun:test';
import { authorLabel, compareFilterValues } from '../src/lib/search-filter-display';

test('years sort numerically with the newest first', () => {
 expect(['1999', '2026', '2000', '900'].sort((a, b) => compareFilterValues('Year', a, b)))
  .toEqual(['2026', '2000', '1999', '900']);
});

test('authors display given names first but sort by surname, including uninverted names', () => {
 const values = ['Hyde, Lewis', 'Casey Gollan', 'Adams, Zadie', 'Adams, Amy', '@somebody'];
 expect(values.sort((a, b) => compareFilterValues('Author', a, b)).map(authorLabel))
  .toEqual(['@somebody', 'Amy Adams', 'Zadie Adams', 'Casey Gollan', 'Lewis Hyde']);
 expect(authorLabel('Le Guin, Ursula K.')).toBe('Ursula K. Le Guin');
 expect(authorLabel('Plato')).toBe('Plato');
});
