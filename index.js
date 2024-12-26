import express from "express";
import http from "http";
import { Server } from "socket.io";
import mediasoup from "mediasoup";
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
//media soup

let worker;
let router;
let transports = [];
let producers = [];
//worker and router

(async () => {
    worker = await mediasoup.createWorker();
    console.log('Worker created');

    router = await worker.createRouter({
        mediaCodecs: [
            {
                kind: 'audio',
                mimeType: 'audio/opus',
                clockRate: 48000,
                channels: 2,
            },
            {
                kind: 'video',
                mimeType: 'video/VP8',
                clockRate: 90000,
            },
        ],
    });

    console.log('Router created');
})();
// Handle Socket.IO connections
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Create WebRTC Transport
    socket.on('createTransport', async (callback) => {
        console.log('Creating transport...');

        const transport = await router.createWebRtcTransport({
            listenIps: [{ ip: '0.0.0.0', announcedIp: 'YOUR_PUBLIC_IP' }],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
        });

        transports.push({ socketId: socket.id, transport });

        console.log('Transport created:', transport.id);

        callback({
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
        });
    });

    // Handle media producing (from host)
    socket.on('produce', async ({ transportId, kind, rtpParameters }, callback) => {
        const transport = transports.find(t => t.transport.id === transportId)?.transport;
        if (!transport) {
            return callback({ error: 'Transport not found' });
        }

        const producer = await transport.produce({ kind, rtpParameters });
        producers.push(producer);

        console.log(`Producer created: ${producer.kind}`);
        callback({ id: producer.id });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        transports = transports.filter(t => t.socketId !== socket.id);
    });
});

app.get("/", (req, res) => {
    res.send("<h1>Hello world</h1>");
});
httpServer.listen(3000, () => {
    console.log('Server running on port 3000');
});