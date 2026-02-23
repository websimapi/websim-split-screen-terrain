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
            this.state.push({ x: 0, y: 0, actions: { a: false, b: false, x: false, y: false } });
            this.joysticks.push(null);
        }
        
        // Local touch button states
        this.localButtons = { a: false, b: false, x: false, y: false };

        // External inputs (from network)
        this.networkInputs = new Map();

        this.initKeyboard();
        this.initGamepads();
        this.initActionButtons();
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
                m1.on('move', (evt, data) => { if (data && data.vector) this.joysticks[0] = { x: data.vector.x, y: data.vector.y }; });
                m1.on('end', () => { this.joysticks[0] = null; });
            }
            if (zone2) {
                const m2 = nipplejs.create({ zone: zone2, mode: 'static', position: { left: '50%', top: '50%' }, color: 'blue', size: 100 });
                m2.on('move', (evt, data) => { if (data && data.vector) this.joysticks[1] = { x: data.vector.x, y: data.vector.y }; });
                m2.on('end', () => { this.joysticks[1] = null; });
            }
        } else {
            // Client logic - always map zone1 to localPlayerIndex
            // Clients only have one touch zone active usually (full screen)
            if (zone1) {
                const m1 = nipplejs.create({ zone: zone1, mode: 'static', position: { left: '50%', top: '50%' }, color: 'white', size: 100 });
                m1.on('move', (evt, data) => { 
                    if (data && data.vector) this.joysticks[this.localPlayerIndex] = { x: data.vector.x, y: data.vector.y }; 
                });
                m1.on('end', () => { this.joysticks[this.localPlayerIndex] = null; });
            }
        }
    }

    initActionButtons() {
        const btns = ['a', 'b', 'x', 'y'];
        btns.forEach(key => {
            const btn = document.getElementById(`btn-${key}`);
            if (!btn) return;
            
            const activate = (e) => {
                e.preventDefault();
                this.localButtons[key] = true;
                btn.classList.add('active');
            };
            const deactivate = (e) => {
                e.preventDefault();
                this.localButtons[key] = false;
                btn.classList.remove('active');
            };

            btn.addEventListener('mousedown', activate);
            btn.addEventListener('touchstart', activate);
            
            btn.addEventListener('mouseup', deactivate);
            btn.addEventListener('touchend', deactivate);
            btn.addEventListener('mouseleave', deactivate);
        });
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
            let acts = { a: false, b: false, x: false, y: false };

            // 1. Check Network Input first (override)
            if (this.networkInputs.has(i)) {
                const netInput = this.networkInputs.get(i);
                p.x = netInput.x;
                p.y = netInput.y;
                if (netInput.actions) acts = netInput.actions;
            }

            // 2. Check Local Input (Keyboard/Gamepad)
            if (this.isHost || isLocal(i)) {
                
                // Only read local buttons if this is OUR player
                // Host controls P0 (usually), Client controls their index
                const isMyControl = (this.isHost && i === 0) || (!this.isHost && isLocal(i));

                // -- Keyboard Mappings --
                if (i === 0) { // WASD
                    if (this.keys['w']) p.y += 1;
                    if (this.keys['s']) p.y -= 1;
                    if (this.keys['a']) p.x -= 1;
                    if (this.keys['d']) p.x += 1;
                }
                // Arrow keys (local player fallback)
                if (isMyControl) {
                    if (this.keys['arrowup']) p.y += 1;
                    if (this.keys['arrowdown']) p.y -= 1;
                    if (this.keys['arrowleft']) p.x -= 1;
                    if (this.keys['arrowright']) p.x += 1;
                    
                    if (this.keys[' ']) acts.a = true; // Space = Jump
                    if (this.keys['shift']) acts.b = true; // Shift = B
                    if (this.keys['e']) acts.x = true;
                    if (this.keys['r']) acts.y = true;
                    
                    // Touch Buttons (UI)
                    if (this.localButtons.a) acts.a = true;
                    if (this.localButtons.b) acts.b = true;
                    if (this.localButtons.x) acts.x = true;
                    if (this.localButtons.y) acts.y = true;
                }

                if (i === 1 && this.isHost) { // YGHJ (Local P2 on host)
                    if (this.keys['y']) p.y += 1;
                    if (this.keys['h']) p.y -= 1;
                    if (this.keys['g']) p.x -= 1;
                    if (this.keys['j']) p.x += 1;
                }

                // Gamepad
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
                    
                    // Standard mapping: 0=A, 1=B, 2=X, 3=Y
                    if (gp.buttons[0].pressed) acts.a = true;
                    if (gp.buttons[1].pressed) acts.b = true;
                    if (gp.buttons[2].pressed) acts.x = true;
                    if (gp.buttons[3].pressed) acts.y = true;
                }

                // Touch Joystick
                if (this.joysticks[i]) {
                    p.x += this.joysticks[i].x;
                    p.y += this.joysticks[i].y;
                }
            }

            // Normalize movement
            const norm = Math.sqrt(p.x*p.x + p.y*p.y);
            if (norm > 1) { p.x /= norm; p.y /= norm; }
            
            this.state[i] = { x: p.x, y: p.y, actions: acts };
        }
    }
    
    // Get state for network transmission (only my player)
    getLocalState() {
        return this.state[this.localPlayerIndex];
    }
}