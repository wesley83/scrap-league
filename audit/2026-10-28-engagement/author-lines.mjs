// One-time, targeted semantic source edit. Normal build never executes this.
import fs from 'node:fs/promises';
import { DOMParser } from 'linkedom';
import { parseTrack, serializeTrack } from '../../app/model.js';
import { compile, pointAtPiece } from '../../app/track.js';
const root = new URL('../../', import.meta.url);
const specs = [
  ['yard-loop', 'The yellow gantry', 'Yellow gantry: keep the center asphalt for a safe exit, or cross the inside gravel to catch the turquoise boost pad. Straighten before boosting.'],
  ['dockside-dash', 'The twin dock lights', 'Twin dock lights: the gravel-side boost strip rewards a precise line. The center asphalt leaves room to pass and brake. Keep every checkpoint in order.'],
  ['furnace-bend', 'The furnace stacks', 'Furnace stacks: a tight inside gravel line leads to a boost strip; the outside asphalt gives more grip and recovery room. Save charge for the exit.'],
];
for (const [slug, landmark, description] of specs) {
  const url = new URL(`content/tracks/${slug}/definition.html`, root);
  const html = await fs.readFile(url, 'utf8');
  const t = parseTrack(html, DOMParser);
  if (t.description === description) throw Error('Already authored; refusing duplicate mutation.');
  const bend = t.pieces.find(p => ['quarter', 'hairpin'].includes(p.kind));
  const exit = t.pieces.find(p => p.id === bend.nextPiece);
  // All three selected layouts have a legal 60 m exit straight.
  if (exit.kind !== 'straight' || exit.length < 40) throw Error('Unexpected exit geometry');
  t.description = description;
  t.patches.push({ id: crypto.randomUUID(), pieceId: bend.id, surface: 'gravel',
    start: 5, end: Math.PI * bend.radius * (bend.kind === 'hairpin' ? 1 : 0.5) - 5,
    lateralMin: bend.turn > 0 ? 1.5 : -bend.width / 2,
    lateralMax: bend.turn > 0 ? bend.width / 2 : -1.5 });
  t.patches.push({ id: crypto.randomUUID(), pieceId: exit.id, surface: 'gravel',
    start: 0, end: 36, lateralMin: 1.5, lateralMax: exit.width / 2 });
  const p = pointAtPiece(exit, 20);
  t.props.push({ id: crypto.randomUUID(), kind: 'pad',
    x: p.x - Math.sin(p.heading) * 3.1, z: p.z + Math.cos(p.heading) * 3.1,
    heading: p.heading, length: 6, width: 2.4, duration: 1, damping: 0 });
  // Recognizable non-solid landmark pair, clear of the road and racing line.
  for (const distance of [8, 18]) {
    const q = pointAtPiece(exit, distance);
    t.props.push({ id: crypto.randomUUID(), kind: 'light',
      x: q.x + Math.sin(q.heading) * (q.width / 2 + 5),
      z: q.z - Math.cos(q.heading) * (q.width / 2 + 5), heading: q.heading,
      length: 4, width: 4, duration: 1, damping: 0 });
  }
  const c = compile(t);
  if (!c.valid) throw Error(JSON.stringify(c.problems));
  // Update only owned fields/collections in the original document.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const next = new DOMParser().parseFromString(serializeTrack(t), 'text/html');
  doc.querySelector('[itemprop="description"]').textContent = description;
  for (const collection of ['patches', 'props']) {
    const list = doc.querySelector(`[data-collection="${collection}"]`);
    list.replaceChildren(...next.querySelector(`[data-collection="${collection}"]`).children);
  }
  const output = doc.toString();
  parseTrack(output, DOMParser);
  await fs.writeFile(url, output);
  console.log(`${slug}: ${landmark}; ${Math.round(c.length)}m; valid corridor`);
}
