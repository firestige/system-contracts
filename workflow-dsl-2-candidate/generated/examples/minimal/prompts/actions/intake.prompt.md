# Intake and Authority Scan

Bind the exact request identity, authority order and blocked/derivable facts before review. Investigate repository facts first; ask one measurement/intent decision at a time.

Return a structured intake result with `status` = `confirmed` or `needs-user`, an authority map, and blockers. Do not create artifacts yet, do not modify the candidate, and do not accept an ambiguous input as confirmed.
