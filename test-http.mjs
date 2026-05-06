import http from "http";
const server = http.createServer((req, res) => {
    res.end("OK HTTP");
});
server.listen(3000, () => console.log("HTTP LISTENING on 3000"));
