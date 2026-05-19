import express from "express";
import agentsRouter from "./routers/agents";
import enrollmentTokensRouter from "./routers/enrollmentTokens";
import scopesRouter from "./routers/scopes";
import storageExplorerRouter from "./routers/storageexplorer";

declare global {
  namespace Express {
    interface Request {
      cookies: Record<string, string>;
    }
  }
}

const app = express();
const port = 3100;

app.use(express.json());
app.use((req, _res, next) => {
  req.cookies = Object.fromEntries(
    (req.headers.cookie ?? "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const [name, ...value] = cookie.split("=");
        return [name, decodeURIComponent(value.join("="))];
      })
  );
  next();
});

app.use("/v1/scopes", scopesRouter);

app.use("/v1/enrollment-tokens", enrollmentTokensRouter);

app.use("/v1/agents", agentsRouter);

app.use("/v1/storageexplorer", storageExplorerRouter);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
