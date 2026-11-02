'use strict';
/**
 * Query-spec helpers.
 *
 * A spec is plain data:
 * {
 *   name, description,
 *   relations: [ { alias, collection, localFilter } ],
 *   edges:     [ { left: 'alias.field', right: 'alias.field' } ],   // equality joins only
 *   group:     { keys: [{ expr, as }], aggregates: [{ op, expr, as }] },
 *   orderBy:   [ { field | expr, dir } ],
 *   limit:     number
 * }
 *
 * `localFilter` may contain time tokens like "@now-7d" (days) / "@now-12h"
 * resolved against the run's `now`.
 */
const models = require('./schema');

const COLLECTIONS = {
  users: models.User,
  vendors: models.Vendor,
  categories: models.Category,
  products: models.Product,
  orders: models.Order,
  order_items: models.OrderItem,
  reviews: models.Review
};

function modelForCollection(name) {
  const m = COLLECTIONS[name];
  if (!m) throw new Error(`Unknown collection in spec: ${name}`);
  return m;
}

function parseRef(ref) {
  const i = ref.indexOf('.');
  if (i < 0) throw new Error(`Invalid field reference '${ref}' (expected alias.field)`);
  return { alias: ref.slice(0, i), field: ref.slice(i + 1) };
}

const TIME_TOKEN = /^@now-(\d+)([dh])$/;

function resolveLocalFilter(filter, now) {
  if (filter == null) return {};
  if (typeof filter === 'string') {
    const m = TIME_TOKEN.exec(filter);
    if (m) {
      const ms = parseInt(m[1], 10) * (m[2] === 'd' ? 86400000 : 3600000);
      return new Date(now.getTime() - ms);
    }
    return filter;
  }
  if (Array.isArray(filter)) return filter.map((v) => resolveLocalFilter(v, now));
  if (typeof filter === 'object') {
    if (filter instanceof Date) return filter;
    const out = {};
    for (const [k, v] of Object.entries(filter)) out[k] = resolveLocalFilter(v, now);
    return out;
  }
  return filter;
}

module.exports = { COLLECTIONS, modelForCollection, parseRef, resolveLocalFilter };
