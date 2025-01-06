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
    worker = await mediasoup.createWorker({
        logLevel: "debug",
        logTags: [
            "dtls",
            "ice",
            "info",
            "rtcp",
            "rtp",
            "srtp",
        ],
        rtcMinPort: 32256,
        rtcMaxPort: 65535,
    });
    console.log('Worker created');

    router = await worker.createRouter({
        mediaCodecs: [
            {
                kind: "audio",
                mimeType: "audio/opus",
                preferredPayloadType: 111,
                clockRate: 48000,
                channels: 2,
                parameters: {
                    minptime: 10,
                    useinbandfec: 1,
                },
            },
            {
                kind: "video",
                mimeType: "video/VP8",
                preferredPayloadType: 96,
                clockRate: 90000,
            },
            {
                kind: "video",
                mimeType: "video/H264",
                preferredPayloadType: 125,
                clockRate: 90000,
                parameters: {
                    "level-asymmetry-allowed": 1,
                    "packetization-mode": 1,
                    "profile-level-id": "42e01f",
                },
            },
        ],
    });

    console.log('Router created');
})();
// Handle Socket.IO connections
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);


    socket.on('getRouterRtpCapabilities', async () => {
        console.log("Creating Router capabilities");
        console.log(router.rtpCapabilities)
        socket.emit('routerRtpCapabilities', router.rtpCapabilities);
    })

    // Create WebRTC Transport
    socket.on('createTransport', async (callback) => {
        console.log('Creating transport...');

        const transport = await router.createWebRtcTransport({
            listenIps: [{ ip: "0.0.0.0", announcedIp: "43.204.97.185" }],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
            initialAvailableOutgoingBitrate: 300000,
        });
        transport.on('dtlsstatechange', dtlsState => {
            if (dtlsState === 'closed') {
                transport.close();
            }
        });

        transport.on('close', () => {
            console.log('Transport closed');
        });

        transports.push({ socketId: socket.id, transport });

        console.log('Transport created:', transport.id);

        socket.emit('transportCreated', {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
        })
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