# @schema-watch/core

Schema inference and shape-diffing for API responses. This is the engine behind
the [`schema-watch`](https://www.npmjs.com/package/schema-watch) CLI.

It infers a schema from observed JSON, then classifies the difference between
two schemas as breaking or non-breaking: a removed field, a narrowed type or a
newly nullable value is breaking; an added optional field is not.

```ts
import { inferSchema, diffSchemas } from "@schema-watch/core";

const before = inferSchema({ id: 1, name: "Ada" });
const after = inferSchema({ id: "1", name: "Ada" });

diffSchemas(before, after); // id: number -> string, breaking
```

Most people want the CLI rather than this package directly.

Apache-2.0.
