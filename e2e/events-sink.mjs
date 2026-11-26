// Stand-in for the Flagsmith events API during E2E tests: records every event so tests can
// assert exactly what each shopper sent. GET /events returns them all.
import http from "node:http";

const port = Number(process.argv[2] ?? 3299);
const events = [];

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url?.endsWith("/v1/events")) {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        try {
          events.push(...JSON.parse(Buffer.concat(chunks).toString()).events);
          res.writeHead(202).end();
        } catch {
          res.writeHead(400).end();
        }
      });
      return;
    }
    if (req.method === "GET" && req.url === "/events") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(events));
      return;
    }
    res.writeHead(200).end("events sink");
  })
  .listen(port, "127.0.0.1");
