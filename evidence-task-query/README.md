# Evidence Task Query candidate

`evidence.query@1.0.0` supersedes frozen historical 0.1 and adds the read-only `/v1/evidence/tasks` route, the exact
non-paginated `/v1/evidence/manifests?manifest_digest=...` route, and the
read-model 2.0 Task/Manifest projection. It is a sibling package because the published
`evidence-query/` directory is an immutable historical inventory.

An accepted Profile 2.0 `task.binding` record atomically creates Task declaration,
Delivery membership, a Delivery uniqueness guard, optional display metadata, and
the immutable evidence-safe Manifest reading. Task and Manifest effects are
Delivery-scoped Evidence authority. Ordinary routes expose only active Delivery datasets. After an
accepted terminal `delivery.summary` ages past the configured Delivery TTL, Evidence atomically and
physically deletes that Delivery's queryable Facts, Trace detail, membership, guard and Manifest.
Retention cannot create a partial Trace and has no restore path. A minimal non-queryable deletion
guard may remain only to reject late resurrection. Frozen 0.1 bytes remain immutable historical input.

The route supports bounded Task discovery and exact membership traversal at an
`as_of` cutoff over active Delivery memberships. Each traversal uses its own repeatable-read snapshot and cursor;
there is no cross-route or global snapshot Oracle.
