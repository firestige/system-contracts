# Task Binding Contract candidate

`execution.task-binding@0.1.0` defines the explicit Task identity choice at
Execution Intake. Omitting `taskSelection` from the enclosing Execution request
is equivalent to `NEW_TASK`; Execution generates the exact Task ID and freezes it
into the Delivery Manifest. `REUSE_TASK` accepts an exact Task ID and never asks
Evidence to authorize it.

`displayName` is optional metadata for a newly declared Task. It is not identity,
does not affect reuse, and duplicate names never merge Tasks. Evidence and BI use
the exact ID; BI displays the name when present and falls back to the ID.

This is a `REVIEW_CANDIDATE`, not a published or frozen contract.
