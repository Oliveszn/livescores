import { WebSocketServer, WebSocket } from "ws";
import { Server as HttpServer } from "http";
import { wsArcjet } from "../arcjet";

type JsonPayload = Record<string, unknown>;

interface CustomWebSocket extends WebSocket {
  isAlive: boolean;
}

function sendJson(socket: WebSocket, payload: JsonPayload) {
  if (socket.readyState === WebSocket.OPEN) return;

  socket.send(JSON.stringify(payload));
}

function broadcast(wss: WebSocketServer, payload: JsonPayload) {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) continue;

    client.send(JSON.stringify(payload));
  }
}

export function attachWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: 1024 * 1024,
  });

  wss.on("connection", async (socket: CustomWebSocket, req) => {
    if (wsArcjet) {
      try {
        const decision = await wsArcjet.protect(req);
        if (decision.isDenied()) {
          const code = decision.reason.isRateLimit() ? 1013 : 1008;
          const reason = decision.reason.isRateLimit()
            ? "Rate limit exceeded"
            : "Access denied";

          socket.close(code, reason);
          return;
        }
      } catch (error) {
        console.error("WS connection error", error);
        socket.close(1011, "Server security error");
        return;
      }
    }

    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });
    sendJson(socket, { type: "welcome" });

    socket.on("error", console.error);
  });

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = ws as CustomWebSocket;

      if (client.isAlive === false) {
        return client.terminate();
      }

      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  wss.on("close", () => clearInterval(interval));

  function broadcastMatchCreated(match: JsonPayload) {
    broadcast(wss, {
      type: "match_created",
      data: match,
    });
  }

  return { broadcastMatchCreated };
}
