import { startServer } from "./server";

const port = Number(process.env.PORT ?? 8787);
startServer(port);
console.log(`rift-survivors server listening on :${port}`);
