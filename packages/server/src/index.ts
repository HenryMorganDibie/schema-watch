import { buildApp } from "./app.js";

const app = buildApp();
const port = Number(process.env.PORT ?? 4000);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => app.log.info(`schema-watch cloud API listening on :${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
