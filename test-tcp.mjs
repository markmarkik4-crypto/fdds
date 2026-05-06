import net from "net";
const server = net.createServer((socket) => {
    socket.end("OK\n");
});
server.listen(3000, () => console.log("TCP LISTENING on 3000"));
