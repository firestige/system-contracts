# Evidence Task Query candidate

`evidence.query@1.0.0` adds the read-only `/v1/evidence/tasks` route, the exact
non-paginated `/v1/evidence/manifests?manifest_digest=...` route, and the
read-model 2.0 Task/Manifest projection. It is a sibling package because the published
`evidence-query/` directory is an immutable historical inventory.

An accepted Profile 2.0 `task.binding` record atomically creates Task declaration,
Delivery membership, a Delivery uniqueness guard, optional display metadata, and
the immutable evidence-safe Manifest reading. Task and Manifest effects are
permanent Evidence authority; dependent Facts and Traces retain their independent
expiry semantics.

The route supports bounded Task discovery and exact membership traversal at an
`as_of` cutoff. Each traversal uses its own repeatable-read snapshot and cursor;
there is no cross-route or global snapshot Oracle.
