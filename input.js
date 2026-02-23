import nipplejs from 'nipplejs';

export class InputManager {
    constructor() {
        this.keys = {};
        this.gamepads = {};
        this.joysticks = { p1: null, p2: null };
        this.state = {
            p1: { x: 0, y: 0 },
            p2: { x: 0, y: 0 }
        };

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
            this.gamepads[e.gamepad.index] = e.gamepad;
        });

        window.addEventListener("gamepaddisconnected", (e) => {
            delete this.gamepads[e.gamepad.index];
        });
    }

    initTouch(zone1, zone2) {
        // Player 1 Joystick (Left side of screen usually)
        const manager1 = nipplejs.create({
            zone: zone1,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'red',
            size: 100
        });

        manager1.on('move', (evt, data) => {
            if (data && data.vector) {
                this.joysticks.p1 = { x: data.vector.x, y: -data.vector.y }; // Invert Y for 3D
            }
        });
        manager1.on('end', () => { this.joysticks.p1 = null; });

        // Player 2 Joystick
        const manager2 = nipplejs.create({
            zone: zone2,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'blue',
            size: 100
        });

        manager2.on('move', (evt, data) => {
            if (data && data.vector) {
                this.joysticks.p2 = { x: data.vector.x, y: -data.vector.y };
            }
        });
        manager2.on('end', () => { this.joysticks.p2 = null; });
    }

    update() {
        // Reset states
        let p1 = { x: 0, y: 0 };
        let p2 = { x: 0, y: 0 };

        // Keyboard P1 (WASD)
        if (this.keys['w']) p1.y += 1;
        if (this.keys['s']) p1.y -= 1;
        if (this.keys['a']) p1.x -= 1;
        if (this.keys['d']) p1.x += 1;

        // Keyboard P2 (YGHJ)
        if (this.keys['y']) p2.y += 1; // Top
        if (this.keys['h']) p2.y -= 1; // Bottom
        if (this.keys['g']) p2.x -= 1; // Left
        if (this.keys['j']) p2.x += 1; // Right

        // Gamepad Polling
        const gpIndexes = Object.keys(this.gamepads);
        const navGamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        
        // Assign first gamepad to P1, second to P2 if available
        if (navGamepads[0]) {
            const gp = navGamepads[0];
            // Deadzone
            const deadzone = 0.1;
            if (Math.abs(gp.axes[0]) > deadzone) p1.x += gp.axes[0];
            if (Math.abs(gp.axes[1]) > deadzone) p1.y -= gp.axes[1]; // Y is often inverted on stick
        }
        
        if (navGamepads[1]) {
            const gp = navGamepads[1];
            const deadzone = 0.1;
            if (Math.abs(gp.axes[0]) > deadzone) p2.x += gp.axes[0];
            if (Math.abs(gp.axes[1]) > deadzone) p2.y -= gp.axes[1];
        }

        // Touch Joysticks override
        if (this.joysticks.p1) {
            p1.x = this.joysticks.p1.x;
            p1.y = this.joysticks.p1.y;
        }
        if (this.joysticks.p2) {
            p2.x = this.joysticks.p2.x;
            p2.y = this.joysticks.p2.y;
        }

        // Normalize vectors
        const norm1 = Math.sqrt(p1.x*p1.x + p1.y*p1.y);
        if (norm1 > 1) { p1.x /= norm1; p1.y /= norm1; }

        const norm2 = Math.sqrt(p2.x*p2.x + p2.y*p2.y);
        if (norm2 > 1) { p2.x /= norm2; p2.y /= norm2; }

        this.state.p1 = p1;
        this.state.p2 = p2;
    }
}