# Scaling Cloudflare D1 Beyond the 10 GB Limit

## Problem
Cloudflare D1 limits each database to **10 GB**.  As groups accumulate millions of transactions over several years, a single shard can exceed this limit.

## Assumptions
* Every logical “group” is identified by an integer `group_id`.
* Each read or write request touches **exactly one** `group_id`; there are no cross-group joins.
* Each data table includes the `group_id` column and every query filters on it.
* Individual groups are small relative to the 10 GB cap; the aggregate across groups is large.
* The Worker can bind up to **~5,000** D1 databases (per current [Cloudflare limits](https://developers.cloudflare.com/d1/platform/limits/#limits)).
* Routing metadata (mapping a `group_id` or range → DB binding) lives in KV or a small “core” D1.
* Examples below use placeholder IDs (`bucket 0`, `Group X`) purely for illustration.

## Baseline – Shard by `group_id`
* Each table already carries `group_id`/`groupid` and every query filters on it.
* Reads/writes never need data from more than one group, making `group_id` a natural partition key.

### Initial layout
| Shard | Condition (example) | Binding |
|-------|--------------------|---------|
| `DB_0` | `group_id % SHARD_COUNT = 0` | `DB_0` |
| `DB_1` | `group_id % SHARD_COUNT = 1` | `DB_1` |
| … | … | … |

The Worker chooses the shard using `groupId % SHARD_COUNT`.

## Rollover When a Shard Nears 10 GB
Instead of migrating data, **add a new generation of the same range**.

1.  Create a new D1 database, e.g. `DB_0_G1`.
2.  Add it as a new binding in `wrangler.toml`.
3.  Insert/Update a tiny routing table (stored in KV or a “core” D1) to mark this binding as the *active generation* for the affected bucket.

| range_start | range_end | generation | db_binding |
|-------------|-----------|------------|------------|
| 0 | 0 | 0 | `DB_0_G0` |
| 0 | 0 | **1** | `DB_0_G1` ← active |

4.  **No data migration required.** New writes go to `DB_0_G1`. Historical reads consult the routing table to know which generations to query.

### Helper functions
```ts
function writeDbFor(env: Env, groupId: number): D1Database {
  const route = getActiveRoute(env, groupId);   // highest generation
  return (env as any)[route.db_binding] as D1Database;
}

function readDbsFor(env: Env, groupId: number): D1Database[] {
  return getAllRoutes(env, groupId)             // usually 1–2 items
    .map(r => (env as any)[r.db_binding]);
}
```
Handlers replace `env.DB` with `writeDbFor(...)` for inserts/updates. Reads that only need **current** data remain single-DB; full-history reads can loop over `readDbsFor(...)`.

## If a *single group* exceeds 10 GB
Very unlikely (≈80 M rows) but use the same pattern with **time-based generations**:

| group_id | period_start | period_end | generation | db_binding |
|----------|--------------|------------|------------|------------|
| X | 2020-01-01 | 2026-12-31 | 0 | `DB_GX_G0` |
| X | 2027-01-01 | – | 1 | `DB_GX_G1` |

Routing now keys on `(group_id, created_at)`.

## Archiving & Cold Storage
* Once a generation is cold, copy it to R2 or another D1, delete it from the hot shard, and update the routing table.
* Analytical jobs can stitch across generations or archives as needed.

## Capacity Planning
* 16 shards ⇒ ~160 GB hot storage; increase to 32/64/128 as needed.
* A single Worker can have **≈ 5,000 D1 bindings** (1 MB metadata limit, ~150 bytes per binding). This provides ample headroom for additional shards or per-tenant databases.

---
This strategy keeps every live shard comfortably below the 10 GB cap, requires only minor code changes, and avoids expensive bulk migrations. 