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
        
        // Wand / Voice state
        this.wandOrientation = { alpha: 0, beta: 0, gamma: 0, calibratedAlpha: 0 };
        this.spellQueue = []; // Queue of spells to send
        this.isWandActive = false;

        // External inputs (from network)
        this.networkInputs = new Map();

        this.initKeyboard();
        this.initGamepads();
        this.initActionButtons();
        this.initSpeech();
    }
    
    enableWandMode() {
        this.isWandActive = true;
        this.initMotion();
        // Set calibration on start
        this.wandOrientation.calibratedAlpha = this.wandOrientation.alpha || 0;
    }

    calibrateWand() {
        // Reset "Forward" to current heading
        this.wandOrientation.calibratedAlpha = this.wandOrientation.rawAlpha || 0;
    }

    initSpeech() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.warn("Speech API not supported");
            return;
        }
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true; 
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';
        this.isListening = false;

        this.recognition.onstart = () => {
            console.log("Speech recognition started");
            this.isListening = true;
        };

        this.recognition.onend = () => {
            console.log("Speech recognition ended");
            this.isListening = false;
        };

        this.recognition.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    const transcript = event.results[i][0].transcript.trim();
                    console.log("Voice Input:", transcript);
                    this.spellQueue.push(transcript);
                }
            }
        };

        this.recognition.onerror = (e) => { 
            console.error("Speech Error", e.error);
            // Ignore no-speech errors which happen often
            if (e.error === 'no-speech') return; 
            
            if (e.error === 'not-allowed') {
                alert("Microphone access blocked. Please check browser permissions.");
            }
        };
    }

    startListening() {
        if (this.recognition && !this.isListening) {
            try { 
                this.recognition.start(); 
            } catch(e) { 
                console.error("Start error:", e); 
            }
        }
    }

    stopListening() {
        if (this.recognition && this.isListening) {
            try { 
                this.recognition.stop(); 
            } catch(e) { 
                console.error("Stop error:", e); 
            }
        }
    }

    initMotion() {
        const handleOrientation = (event) => {
            this.wandOrientation.rawAlpha = event.alpha;
            let alpha = event.alpha - this.wandOrientation.calibratedAlpha;
            if (alpha < 0) alpha += 360;
            this.wandOrientation.alpha = alpha; 
            this.wandOrientation.beta = event.beta;
            this.wandOrientation.gamma = event.gamma;
        };

        if (window.DeviceOrientationEvent) {
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission()
                    .then(response => {
                        if (response === 'granted') {
                            window.addEventListener('deviceorientation', handleOrientation);
                        } else {
                            console.warn("Device Motion permission denied");
                        }
                    })
                    .catch(console.error);
            } else {
                window.addEventListener('deviceorientation', handleOrientation);
            }
        }
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
        // Helper to extract vector scaled by force
        const handleMove = (data) => {
            if (data && data.vector) {
                // Apply force scale. nipplejs force is ~1.0 at edge, can go higher if dragged past.
                // We clamp at 1.5 to allow for "run" threshold
                const force = Math.min(data.force, 2.0); 
                return { x: data.vector.x * force, y: data.vector.y * force };
            }
            return { x: 0, y: 0 };
        };

        // Host logic for split screen touch (P1 and P2)
        if (this.isHost) {
            if (zone1) {
                const m1 = nipplejs.create({ zone: zone1, mode: 'static', position: { left: '50%', top: '50%' }, color: 'red', size: 100 });
                m1.on('move', (evt, data) => { this.joysticks[0] = handleMove(data); });
                m1.on('end', () => { this.joysticks[0] = null; });
            }
            if (zone2) {
                const m2 = nipplejs.create({ zone: zone2, mode: 'static', position: { left: '50%', top: '50%' }, color: 'blue', size: 100 });
                m2.on('move', (evt, data) => { this.joysticks[1] = handleMove(data); });
                m2.on('end', () => { this.joysticks[1] = null; });
            }
        } else {
            // Client logic - always map zone1 to localPlayerIndex
            if (zone1) {
                // Joystick at Bottom Left
                const m1 = nipplejs.create({ 
                    zone: zone1, 
                    mode: 'static', 
                    position: { left: '80px', bottom: '80px' }, 
                    color: 'white', 
                    size: 100 
                });
                m1.on('move', (evt, data) => { this.joysticks[this.localPlayerIndex] = handleMove(data); });
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

            // Normalize movement - but allow running (magnitude > 1)
            // Keyboard is always 1. Joystick can be > 1.
            
            // Just clamp to 1.5 to prevent infinite speed
            const norm = Math.sqrt(p.x*p.x + p.y*p.y);
            if (norm > 1.5) { 
                p.x = (p.x / norm) * 1.5; 
                p.y = (p.y / norm) * 1.5; 
            }
            
            this.state[i] = { x: p.x, y: p.y, actions: acts };
        }
    }
    
    // Get state for network transmission (only my player)
    getLocalState() {
        return this.state[this.localPlayerIndex];
    }
}