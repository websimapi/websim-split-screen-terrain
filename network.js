import Peer from 'peerjs';

export class NetworkManager {
    constructor() {
        this.peer = null;
        this.conn = null; // For client: connection to host
        this.connections = []; // For host: list of client connections
        this.isHost = false;
        this.myPlayerIndex = 0;
        
        // Callbacks
        this.onPlayerJoined = null;
        this.onGameStart = null;
        this.onInputReceived = null;
        this.onStateReceived = null;
    }

    initHost() {
        this.isHost = true;
        this.peer = new Peer(); // Auto-gen ID
        
        return new Promise((resolve) => {
            this.peer.on('open', (id) => {
                console.log('Host ID:', id);
                resolve(id);
            });

            this.peer.on('connection', (conn) => {
                this.handleHostConnection(conn);
            });
        });
    }

    initClient(hostId) {
        this.isHost = false;
        this.peer = new Peer();

        return new Promise((resolve, reject) => {
            this.peer.on('open', () => {
                const conn = this.peer.connect(hostId);
                conn.on('open', () => {
                    this.conn = conn;
                    this.setupClientConnection();
                    resolve();
                });
                conn.on('error', (err) => reject(err));
            });
        });
    }

    handleHostConnection(conn) {
        // Assign player index based on connection count + 1 (Host is 0)
        // Note: Logic assumes P1 is host.
        // If we want 5 players total, we accept 4 connections.
        if (this.connections.length >= 4) {
            conn.close(); // Full
            return;
        }

        const newIndex = this.connections.length + 1;
        let playerUUID = null;
        
        conn.on('open', () => {
            console.log(`Player ${newIndex} connected`);
            this.connections.push({ conn, index: newIndex, uuid: null });
            
            // Tell client who they are
            conn.send({ type: 'WELCOME', index: newIndex });
        });

        conn.on('data', (data) => {
            if (data.type === 'HANDSHAKE') {
                playerUUID = data.uuid;
                // Update connection info
                const c = this.connections.find(c => c.index === newIndex);
                if (c) c.uuid = playerUUID;
                
                if (this.onPlayerJoined) this.onPlayerJoined(newIndex, playerUUID);
            }
            if (data.type === 'INPUT') {
                if (this.onInputReceived) this.onInputReceived(newIndex, data.state);
            }
        });

        conn.on('close', () => {
            console.log(`Player ${newIndex} disconnected`);
            // Simple handling: just log for now, reconnect logic is complex
        });
    }

    setupClientConnection() {
        // Generate or retrieve UUID
        let myUUID = localStorage.getItem('farm_uuid');
        if (!myUUID) {
            myUUID = crypto.randomUUID();
            localStorage.setItem('farm_uuid', myUUID);
        }

        this.conn.on('data', (data) => {
            if (data.type === 'WELCOME') {
                this.myPlayerIndex = data.index;
                console.log("Assigned Player Index:", this.myPlayerIndex);
                
                // Send Handshake
                this.conn.send({ type: 'HANDSHAKE', uuid: myUUID });

                if (this.onPlayerJoined) this.onPlayerJoined(this.myPlayerIndex);
            }
            if (data.type === 'START') {
                if (this.onGameStart) this.onGameStart(data.config);
            }
            if (data.type === 'STATE') {
                if (this.onStateReceived) this.onStateReceived(data.state);
            }
        });
    }

    broadcastStart(config) {
        if (!this.isHost) return;
        this.connections.forEach(c => c.conn.send({ type: 'START', config }));
    }

    broadcastState(state) {
        if (!this.isHost) return;
        // Optimization: Could serialize to array buffer for perf, using JSON for simplicity
        this.connections.forEach(c => c.conn.send({ type: 'STATE', state }));
    }

    sendInput(inputState) {
        if (this.isHost) return; // Host applies input directly
        if (this.conn) {
            this.conn.send({ type: 'INPUT', state: inputState });
        }
    }
}