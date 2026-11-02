import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchSections} from './search.mjs';

const entries = [
  {title: 'FastAPI setup', section: 'Authentication', url: '/guides/fastapi/#authentication', text: 'Use a separate bearer token for each endpoint. Shared auth is optional.'},
  {title: 'Troubleshooting', section: 'Connection errors', url: '/guides/troubleshooting/#connection-errors', text: 'Check FastAPI setup and authentication when requests fail.'},
  {title: 'Exports', section: 'Reviewed exports', url: '/guides/exports/#reviewed-exports', text: 'Remove credentials before sharing a JSON or .relay report.'},
  {title: 'Windows', section: 'Local workspaces', url: '/guides/windows/#local-workspaces', text: 'Session drafts do not persist. Café test.'},
];

test('rank an exact section before incidental body matches and ignore case', () => {
  const results = searchSections(entries, 'AUTHENTICATION');
  assert.equal(results[0].url, '/guides/fastapi/#authentication');
  assert.equal(results.length, 2);
});
test('require every query term, including terms in page titles', () => {
  assert.equal(searchSections(entries, 'fastapi bearer')[0].url, entries[0].url);
  assert.equal(searchSections(entries, 'bearer missing').length, 0);
  assert.equal(searchSections(entries, 'json .relay')[0].url, entries[2].url);
});
test('short, blank and punctuation-only queries produce no results', () => {
  for (const query of ['', ' ', 'a', '?!']) assert.deepEqual(searchSections(entries, query), []);
});
test('normalize accents and repeated words without treating query as a regex', () => {
  assert.equal(searchSections(entries, 'cafe')[0].url, entries[3].url);
  assert.equal(searchSections(entries, 'bearer bearer').length, 1);
  assert.equal(searchSections(entries, '[bearer]')[0].url, entries[0].url);
});
test('bound the number of results and keep snippets near the match', () => {
  const text = 'prefix '.repeat(100) + 'needle ' + 'suffix '.repeat(100);
  const section = {...entries[0], text};
  const results = searchSections(Array(100).fill(section), 'needle');
  assert.equal(results.length, 8);
  assert.ok(results[0].excerpt.includes('needle'));
  assert.ok(results[0].excerpt.length <= 182);
});
