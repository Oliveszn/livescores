// import { WebSocketServer, WebSocket } from "ws";

// const wss = new WebSocketServer({ port: 8080 });

// //connection event
// wss.on("connection", (socket, request) => {
//   const ip = request.socket.remoteAddress;

//   socket.on("message", (rawData) => {
//     const message = rawData.toString();
//     console.log({ rawData });

//     wss.clients.forEach((client) => {
//       if (client.readyState === WebSocket.OPEN)
//         client.send(`Server Broadcast: ${message}`);
//     });
//   });

//   socket.on("error", (err) => {
//     console.error(`Error: ${err.message}: ${ip}`);
//   });

//   socket.on("close", () => {
//     console.log("Client disconnected");
//   });
// });

// console.log("websocket server is live on ws://localhost:8080");
import express from "express";

const app = express();
const port = 8000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello from express");
});
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
