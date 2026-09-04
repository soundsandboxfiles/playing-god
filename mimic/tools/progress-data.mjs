import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const BASE = join(dirname(fileURLToPath(import.meta.url)), '..');
const { decodeGenomeString } = await import(join(BASE, 'lib/genome-string.js'));
const { WAVE_SLOTS, GENES_PER_WAVE, WAVE_INDEX, GLOBAL_INDEX } = await import(join(BASE, '../src/genome.js'));
const out = {};
for (const run of ['chimes-24h-random', 'chimes-24h-artisan']) {
  const dir = `${BASE}/output/${run}`;
  const log = readFileSync(`${BASE}/output/${run}.log`, 'utf8');
  const gens = [];
  for (const m of log.matchAll(/gen\s+(\d+)\/\d+\s+bestSSE (\S+)\s+sim \S+\s+renders (\d+)/g))
    gens.push([+m[1], +m[2], +m[3]]);
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
  const saved = [];
  for (const g of manifest.generations) {
    const st = statSync(`${dir}/${g.file}`);
    const genome = decodeGenomeString(readFileSync(`${dir}/${g.genomeFile}`, 'utf8'));
    let act = 0;
    const ai = WAVE_INDEX['active'], oi = WAVE_INDEX['gain_out_on'];
    for (let w = 0; w < WAVE_SLOTS; w++) {
      const b = w * GENES_PER_WAVE;
      if (genome.data[b + ai] >= 0.5 && genome.data[b + oi] >= 0.5) act++;
    }
    const sg = genome.data[WAVE_SLOTS * GENES_PER_WAVE + GLOBAL_INDEX['sigma_global']];
    saved.push({ gen: g.generation, sse: g.sse, island: g.island ?? null, peak: g.peak,
      mtime: st.mtimeMs, activeWaves: act, sigmaGlobalStored: +sg.toFixed(4) });
  }
  const logStart = statSync(`${BASE}/output/${run}.log`).birthtimeMs || null;
  out[run] = { gens, saved, logStart, now: Date.now() };
}
console.log(JSON.stringify(out));
