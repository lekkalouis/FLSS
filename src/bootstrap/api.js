import express from "express";

import { apiRouters } from "../routes/index.js";
import { API_BASE_PATH } from "../constants/http.js";

export function mountApiRouters(app, basePath = API_BASE_PATH) {
  const apiRouter = express.Router();

  apiRouters.forEach(({ router }) => {
    apiRouter.use(router);
  });

  app.use(basePath, apiRouter);
  app.use(basePath, (_req, res) => res.status(404).json({ error: "Not found" }));
}
