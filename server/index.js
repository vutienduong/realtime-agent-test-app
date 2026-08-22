import { createServerApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);
const app = createServerApp();

app.listen(port, () => {
  console.log(`World Room server listening on http://localhost:${port}`);
});
