import express from "express";
import { matchRouter } from "./routes/matches";
import http from "http";
import { attachWebSocketServer } from "./ws";
import { securityMiddleware } from "./arcjet";

const PORT = Number(process.env.PORT);
const HOST = process.env.HOST;

const app = express();
const server = http.createServer(app);

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello from express");
});

app.use(securityMiddleware());

app.use("/matches", matchRouter);

const { broadcastMatchCreated } = attachWebSocketServer(server);
app.locals.broadcastMatchCreated = broadcastMatchCreated;

server.listen(PORT, HOST, () => {
  const baseUrl =
    HOST === "0.0.0.0" ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
  console.log(`Server is running at ${baseUrl}`);
  console.log(
    `Websocket server is running on ${baseUrl.replace("http", "ws")}/ws`,
  );
});
