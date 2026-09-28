import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../fixtures/', import.meta.url);
export function demoSnapshot(variant = 'before') {
  if (!['before', 'after', 'delegated'].includes(variant)) throw new Error('Unknown demo variant.');
  const data = JSON.parse(readFileSync(new URL('demo-' + variant + '.json', root), 'utf8'));
  const files = Object.entries(data.files).map(([path, text]) => ({
    path,
    text,
    blob: createHash('sha1').update(text).digest('hex'),
  }));
  return {
    repository: 'fixture/checkout-kit',
    url: null,
    source: 'fixture',
    variant,
    commit: createHash('sha1').update(JSON.stringify(data.files)).digest('hex'),
    inventory: [...files.map((f) => f.path), 'src/cart.test.js', 'vitest.config.js'],
    inventoryComplete: true,
    files,
    exclusions: [],
    state: 'complete',
    fixtureNote:
      'Synthetic fixture, not a GitHub repository. Commit and blob identifiers are content hashes for this demonstration.',
  };
}
