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
        rtcMinPort: 40000,
        rtcMaxPort: 49999,
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
            }
        ],
    });

    console.log('Router created');
})();
// Handle Socket.IO connections
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);


    socket.on('getRouterRtpCapabilities', async () => {
        console.log("Creating Router capabilities");
        socket.emit('routerRtpCapabilities', JSON.stringify(router.rtpCapabilities));
    })

    // Create WebRTC Transport
    socket.on('createTransport', async () => {
        console.log('Creating transport...');

        const transport = await router.createWebRtcTransport({
            listenIps: [{ ip: "43.204.97.185", announcedIp: "43.204.97.185" }],
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
        console.log(transport.id);
        console.log(transport.iceParameters);
        console.log(transport.iceCandidates);
        console.log(transport.dtlsParameters);


        socket.emit('transportCreated', {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
        })
    });

    socket.on('connectTransport', async ({ transportId, dtlsParameters }) => {
        console.log('Connecting transport...');
        console.log({ transportId, dtlsParameters });
        const transport = transports.find(t => t.transport.id === transportId)?.transport;
        if (!transport) {
            return;
        }

        await transport.connect({ dtlsParameters });
    });

    // Handle media producing (from host)
    socket.on('produce', async ({ transportId, kind, rtpParameters }) => {
        console.log('Producing...');
        console.log(transportId);
        console.log(kind);
        console.log(rtpParameters);

        const transport = transports.find(t => t.transport.id === transportId)?.transport;
        if (!transport) {
            console.log("Transport not found");
            return;

        }
        const producer = await transport.produce({ kind, rtpParameters });
        producers.push(producer);
        console.log(`Producer created: ${producer.kind}`);

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