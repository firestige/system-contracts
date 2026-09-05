# Contract publication release adapter

This adapter publishes existing immutable publication records and a digest inventory. It does not use npm publication semantics.

```sh
node release/cli/release.cjs config
```

Commit `release/request.json` with `candidate_tag`, the exact superproject `authority_ref`, and exact workflow-package `consumer_ref`, then push it to `release/next`. That push is the only candidate entry point. Stable remains a separate post-repin action, and only its final GitHub Release step uses the short-lived release App token.
