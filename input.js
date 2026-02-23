import nipplejs from 'nipplejs';

export class InputManager {
    constructor(playerCount = 5) {
        this.playerCount = playerCount;
        this.keys = {};
        this.gamepads = {};
        this.joysticks = []; // Array of joystick inputs
        // Initialize state array
        this.state = [];
        for(let i=0; i<this.playerCount; i++) {
            this.state.push({ x: 0, y: 0 });
            this.joysticks.push(null);
        }

        this.initKeyboard();
        this.initGamepads();
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
        // Only mapping P1 and P2 to touch for now
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
    }

    update() {
        const navGamepads = navigator.getGamepads ? navigator.getGamepads() : [];

        for (let i = 0; i < this.playerCount; i++) {
            let p = { x: 0, y: 0 };

            // -- Keyboard Mappings --
            // P1: WASD
            if (i === 0) {
                if (this.keys['w']) p.y += 1;
                if (this.keys['s']) p.y -= 1;
                if (this.keys['a']) p.x -= 1;
                if (this.keys['d']) p.x += 1;
            }
            // P2: YGHJ
            if (i === 1) {
                if (this.keys['y']) p.y += 1;
                if (this.keys['h']) p.y -= 1;
                if (this.keys['g']) p.x -= 1;
                if (this.keys['j']) p.x += 1;
            }
            // P3: IJKL
            if (i === 2) {
                if (this.keys['i']) p.y += 1;
                if (this.keys['k']) p.y -= 1;
                if (this.keys['j']) p.x -= 1;
                if (this.keys['l']) p.x += 1;
            }
            // P4: Arrow Keys
            if (i === 3) {
                if (this.keys['arrowup']) p.y += 1;
                if (this.keys['arrowdown']) p.y -= 1;
                if (this.keys['arrowleft']) p.x -= 1;
                if (this.keys['arrowright']) p.x += 1;
            }
            // P5: Numpad 8456
            if (i === 4) {
                if (this.keys['8']) p.y += 1;
                if (this.keys['5']) p.y -= 1;
                if (this.keys['4']) p.x -= 1;
                if (this.keys['6']) p.x += 1;
            }

            // -- Gamepad --
            // Map Gamepad Index i to Player i
            // If gamepad[i] exists, add input
            if (navGamepads[i]) {
                const gp = navGamepads[i];
                const deadzone = 0.1;
                if (Math.abs(gp.axes[0]) > deadzone) p.x += gp.axes[0];
                if (Math.abs(gp.axes[1]) > deadzone) p.y -= gp.axes[1];
            }

            // -- Touch --
            if (this.joysticks[i]) {
                p.x = this.joysticks[i].x;
                p.y = this.joysticks[i].y;
            }

            // Normalize
            const norm = Math.sqrt(p.x*p.x + p.y*p.y);
            if (norm > 1) { p.x /= norm; p.y /= norm; }
            
            this.state[i] = p;
        }
    }
}