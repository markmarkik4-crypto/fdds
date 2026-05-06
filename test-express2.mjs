import http from "http";
import express from "express";
const app = express();
app.get("/test", (r, res) => res.json({ok: 1}));
const server = http.createServer(app);
server.listen(3000, () => console.log("EXPRESS via http LISTENING on 3000"));
