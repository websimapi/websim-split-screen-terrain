import nipplejs from 'nipplejs';

export class InputManager {
    constructor(playerCount = 5, isHost = true, localPlayerIndex = 0) {
        this.playerCount = playerCount;
        this.isHost = isHost;
        this.localPlayerIndex = localPlayerIndex; // Which player controls are we listening for locally?
        
        this.keys = {};
        this.gamepads = {};
        this.joysticks = []; // Array of joystick inputs
        
        // Initialize state array
        this.state = [];
        for(let i=0; i<this.playerCount; i++) {
            this.state.push({ x: 0, y: 0 });
            this.joysticks.push(null);
        }

        // External inputs (from network)
        this.networkInputs = new Map();

        this.initKeyboard();
        this.initGamepads();
    }

    // Called by NetworkManager when client sends input
    setNetworkInput(index, inputState) {
        this.networkInputs.set(index, inputState);
    }

    initKeyboard() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }

    initGamepads() {
        window.addEventListener("gamepadconnected", (e) => {
            console.log("Gamepad connected at index %d: %s. %d buttons, %d axes.",
                e.gamepad.index, e.gamepad.id,
                e.gamepad.buttons.length, e.gamepad.axes.length);
        });
    }

    initTouch(zone1, zone2) {
        // Host logic for split screen touch (P1 and P2)
        if (this.isHost) {
            if (zone1) {
                const m1 = nipplejs.create({ zone: zone1, mode: 'static', position: { left: '50%', top: '50%' }, color: 'red', size: 100 });
                m1.on('move', (evt, data) => { if (data && data.vector) this.joysticks[0] = { x: data.vector.x, y: -data.vector.y }; });
                m1.on('end', () => { this.joysticks[0] = null; });
            }
            if (zone2) {
                const m2 = nipplejs.create({ zone: zone2, mode: 'static', position: { left: '50%', top: '50%' }, color: 'blue', size: 100 });
                m2.on('move', (evt, data) => { if (data && data.vector) this.joysticks[1] = { x: data.vector.x, y: -data.vector.y }; });
                m2.on('end', () => { this.joysticks[1] = null; });
            }
        } else {
            // Client logic - always map zone1 to localPlayerIndex
            // Clients only have one touch zone active usually (full screen)
            if (zone1) {
                const m1 = nipplejs.create({ zone: zone1, mode: 'static', position: { left: '50%', top: '50%' }, color: 'white', size: 100 });
                m1.on('move', (evt, data) => { 
                    if (data && data.vector) this.joysticks[this.localPlayerIndex] = { x: data.vector.x, y: -data.vector.y }; 
                });
                m1.on('end', () => { this.joysticks[this.localPlayerIndex] = null; });
            }
        }
    }

    update() {
        // If not host, we only care about processing our own local input and setting it in state
        // The main loop will then read this state and send it to network
        // If host, we process P1 local, plus apply network inputs for others

        const navGamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const isLocal = (idx) => idx === this.localPlayerIndex;

        // Iterate all players to build state
        for (let i = 0; i < this.playerCount; i++) {
            let p = { x: 0, y: 0 };

            // 1. Check Network Input first (override)
            if (this.networkInputs.has(i)) {
                const netInput = this.networkInputs.get(i);
                p.x = netInput.x;
                p.y = netInput.y;
            }

            // 2. Check Local Input (Keyboard/Gamepad)
            // Only apply local input if this player index matches our local index
            // OR if we are Host (P1) and we support split screen local controls for P2?
            // For simplicity:
            // - Client only controls their assigned index.
            // - Host controls P1. (Split screen local multiplayer + network is complex, assume P1 is Host user)
            
            // Allow keyboard fallbacks for debugging/local play if isHost
            if (this.isHost || isLocal(i)) {
                // -- Keyboard Mappings --
                if (i === 0) { // WASD
                    if (this.keys['w']) p.y += 1;
                    if (this.keys['s']) p.y -= 1;
                    if (this.keys['a']) p.x -= 1;
                    if (this.keys['d']) p.x += 1;
                }
                if (i === 1 && this.isHost) { // YGHJ (Only on host for local P2)
                    if (this.keys['y']) p.y += 1;
                    if (this.keys['h']) p.y -= 1;
                    if (this.keys['g']) p.x -= 1;
                    if (this.keys['j']) p.x += 1;
                }
                // Arrow keys for P(local)
                if (this.keys['arrowup']) p.y += 1;
                if (this.keys['arrowdown']) p.y -= 1;
                if (this.keys['arrowleft']) p.x -= 1;
                if (this.keys['arrowright']) p.x += 1;

                // Gamepad
                // If Host, map pads to slots. If client, map Pad 0 to my slot
                let gp = null;
                if (this.isHost) {
                     gp = navGamepads[i];
                } else if (isLocal(i)) {
                    gp = navGamepads[0]; // Client uses first gamepad
                }
                
                if (gp) {
                    const deadzone = 0.1;
                    if (Math.abs(gp.axes[0]) > deadzone) p.x += gp.axes[0];
                    if (Math.abs(gp.axes[1]) > deadzone) p.y -= gp.axes[1];
                }

                // Touch
                if (this.joysticks[i]) {
                    p.x += this.joysticks[i].x;
                    p.y += this.joysticks[i].y;
                }
            }

            // Normalize
            const norm = Math.sqrt(p.x*p.x + p.y*p.y);
            if (norm > 1) { p.x /= norm; p.y /= norm; }
            
            this.state[i] = p;
        }
    }
    
    // Get state for network transmission (only my player)
    getLocalState() {
        return this.state[this.localPlayerIndex];
    }
}