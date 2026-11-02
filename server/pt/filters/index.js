'use strict';
/**
 * FilterSet interface:
 *   add(value)                 -> void
 *   has(value)                 -> boolean
 *   size()                     -> number
 *   toMongoClause(field)       -> object mergeable into a Mongo find() filter
 *   kind                       -> 'exact' | 'bloom'
 *
 * `ExactSet` (default) is an exact distinct-value set; its clause is a plain
 * `{ field: { $in: values } }` (the engine batches large sets).
 *
 * `BloomFilterSet` (experimental, PT_BLOOM=1) serialises a Bloom bitset into a
 * `$function` so the membership test runs server-side without shipping a huge
 * $in list. MongoDB cannot build a Bloom filter inside a plan, so this is a
 * best-effort approximation with false positives (removed later in the join).
 */

const K_HASHES = 3;

function hashString(s, seed) {
  let h = 0x811c9dc5 ^ (seed * 0x9e3779b9);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0);
}

class ExactSet {
  constructor(values = []) {
    this.kind = 'exact';
    this._values = [];
    this._seen = new Set();
    for (const v of values) this.add(v);
  }
  add(v) {
    if (v === null || v === undefined) return; // drop null/undefined join keys
    const k = String(v);
    if (!this._seen.has(k)) { this._seen.add(k); this._values.push(v); }
  }
  has(v) { return this._seen.has(String(v)); }
  size() { return this._values.length; }
  values() { return this._values; }
  toMongoClause(field) { return { [field]: { $in: this._values } }; }
}

class BloomFilterSet {
  constructor(values = [], bits = 0) {
    this.kind = 'bloom';
    this._n = 0;
    this._bits = bits || Math.max(64, (values.length || 1) * 12);
    this._bytes = new Uint8Array(Math.ceil(this._bits / 8));
    for (const v of values) this.add(v);
  }
  _hashes(v) {
    const s = v == null ? '' : String(v);
    const out = [];
    for (let i = 0; i < K_HASHES; i++) out.push(hashString(s, i + 1) % this._bits);
    return out;
  }
  add(v) {
    if (v === null || v === undefined) return; // drop null/undefined join keys
    for (const h of this._hashes(v)) this._bytes[h >> 3] |= (1 << (h & 7));
    this._n++;
  }
  has(v) {
    for (const h of this._hashes(v)) if (!(this._bytes[h >> 3] & (1 << (h & 7)))) return false;
    return true;
  }
  size() { return this._n; }
  values() { return null; } // cannot enumerate
  toMongoClause(field) {
    const bytes = Array.from(this._bytes);
    const m = this._bits;
    const body = `function(v){
      const bytes = ${JSON.stringify(bytes)};
      const m = ${m}, k = ${K_HASHES};
      const s = (v === null || v === undefined) ? '' : v.toString();
      function h(str, seed){ let x = (0x811c9dc5 ^ (seed * 0x9e3779b9))|0; for (let i=0;i<str.length;i++){ x ^= str.charCodeAt(i); x = Math.imul(x, 0x01000193); } return (x>>>0); }
      for (let i=1;i<=k;i++){ const idx = h(s,i) % m; if (!(bytes[idx>>3] & (1<<(idx&7)))) return false; }
      return true;
    }`;
    // Pass the STRING form ($toString) so client and server hash identical bytes
    // (raw BSON values — e.g. ObjectId — stringify differently in the JS engine).
    return { $expr: { $function: { body, args: [{ $toString: `$${field}` }], lang: 'js' } } };
  }
}

function makeSet(values, kind) {
  const clean = (values || []).filter((v) => v !== null && v !== undefined);
  const k = kind || (process.env.PT_BLOOM === '1' ? 'bloom' : 'exact');
  return k === 'bloom' ? new BloomFilterSet(clean) : new ExactSet(clean);
}

/** Probe whether this deployment allows server-side $function (used by Bloom mode). */
async function probeBloomSupport(db) {
  try {
    const res = await db.collection('categories').aggregate([
      { $limit: 1 },
      { $project: { _id: 0, ok: { $function: { body: 'function(){ return true; }', args: [], lang: 'js' } } } }
    ]).toArray();
    return { supported: Array.isArray(res) && (res.length === 0 || res[0].ok === true) };
  } catch (err) {
    return { supported: false, error: err.message };
  }
}

module.exports = { ExactSet, BloomFilterSet, makeSet, probeBloomSupport, K_HASHES };
