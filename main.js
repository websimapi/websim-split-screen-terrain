import * as THREE from 'three';
import { InputManager } from './input.js';
import { TerrainManager } from './terrain.js';

// --- Configuration ---
const CONFIG = {
    cameraHeight: 12, // Higher view for open world feel
    cameraOffsetZ: 18,
    moveSpeed: 10, // Slower, more walking speed
    turnSpeed: 5,
    runSpeedMultiplier: 1.5
};

// --- Globals ---
let scene, renderer;
let rendererP5; // Dedicated renderer for player 5 (diamond)
let players = [];
let cameras = [];
let inputManager, terrainManager;
let clock;
let playerCount = 2; // Default

// --- Initialization ---
function init() {
    // Player Selection UI Logic
    const selBtns = document.querySelectorAll('#player-select button');
    selBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // update UI
            selBtns.forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
            // update state
            playerCount = parseInt(e.target.getAttribute('data-players'));
        });
    });

    const startBtn = document.getElementById('start-btn');
    startBtn.addEventListener('click', () => {
        document.getElementById('start-overlay').style.display = 'none';
        
        // Initialize Audio context
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioEl = new Audio('./asset_farm_music.mp3');
        audioEl.loop = true;
        audioEl.volume = 0.5;
        const source = audioCtx.createMediaElementSource(audioEl);
        source.connect(audioCtx.destination);
        audioEl.play().catch(e => console.log("Audio play failed", e));
        
        startGame();

        // Start Loop
        renderer.setAnimationLoop(animate);
    });
}

function startGame() {
    setupThreeJS();
    setupInputs();
    setupWorld();
    setupPlayers();
    handleResize();
    
    window.addEventListener('resize', handleResize);
}

function setupThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky Blue
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.008);

    // Main Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(renderer.domElement);

    // P5 Renderer (Diamond)
    if (playerCount === 5) {
        const cP5 = document.getElementById('c-p5');
        cP5.style.display = 'block';
        // Size is controlled by CSS usually, but we need to set internal resolution
        rendererP5 = new THREE.WebGLRenderer({ canvas: cP5, antialias: true, alpha: true });
        rendererP5.shadowMap.enabled = true;
        rendererP5.outputColorSpace = THREE.SRGBColorSpace;
    }

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffee, 1.2);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    clock = new THREE.Clock();
}

function setupInputs() {
    inputManager = new InputManager(playerCount);
    
    const zoneP1 = document.getElementById('zone-p1');
    const zoneP2 = document.getElementById('zone-p2');
    
    // Only init touch if 2 or fewer players, or just for P1/P2 always
    setTimeout(() => {
        inputManager.initTouch(zoneP1, zoneP2);
    }, 100);
}

function setupWorld() {
    terrainManager = new TerrainManager(scene);
}

function createRiggedCharacter(color) {
    const group = new THREE.Group();
    
    // Materials
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.5 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.8 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.9 });
    
    const faceTexture = new THREE.TextureLoader().load('./asset_farmer_face.png');
    
    // --- Rig Hierarchy ---
    // Root -> Hip/Body
    // Body -> Head
    // Body -> ArmL, ArmR
    // Body -> LegL, LegR
    
    // Body Center (Pivot is approx center of torso)
    const bodyGeo = new THREE.BoxGeometry(0.6, 0.7, 0.4);
    const body = new THREE.Mesh(bodyGeo, shirtMat);
    body.position.y = 1.1; // Float above ground so legs touch 0
    body.castShadow = true;
    group.add(body);
    
    // Head
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    // Multi-material for face? Or just simple cube with texture on front
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture, transparent: true, color: 0xffccaa });
    const headMaterials = [
        skinMat, // right
        skinMat, // left
        skinMat, // top
        skinMat, // bottom
        faceMat, // front
        skinMat  // back
    ];
    
    const head = new THREE.Mesh(headGeo, headMaterials);
    head.position.y = 0.6; 
    head.castShadow = true;
    body.add(head); 

    // Hat (Straw hat)
    const hatGeo = new THREE.ConeGeometry(0.6, 0.3, 32);
    const hatMat = new THREE.MeshStandardMaterial({ color: 0xeebb55 });
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.y = 0.35;
    head.add(hat);
    
    // Arms (Pivot at shoulder top)
    const armGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    armGeo.translate(0, -0.25, 0); // Shift pivot to top
    
    const armL = new THREE.Mesh(armGeo, shirtMat);
    armL.position.set(-0.4, 0.3, 0);
    armL.castShadow = true;
    body.add(armL);
    
    const armR = new THREE.Mesh(armGeo, shirtMat);
    armR.position.set(0.4, 0.3, 0);
    armR.castShadow = true;
    body.add(armR);
    
    // Legs (Pivot at hip top)
    const legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
    legGeo.translate(0, -0.35, 0); // Shift pivot to top
    
    const legL = new THREE.Mesh(legGeo, pantsMat);
    legL.position.set(-0.15, -0.35, 0);
    legL.castShadow = true;
    body.add(legL);
    
    const legR = new THREE.Mesh(legGeo, pantsMat);
    legR.position.set(0.15, -0.35, 0);
    legR.castShadow = true;
    body.add(legR);
    
    // Return parts for animation
    group.userData = { body, head, armL, armR, legL, legR };
    return group;
}

function setupPlayers() {
    const colors = [0xff4444, 0x4444ff, 0x44ff44, 0xffff44, 0xff44ff]; // Red, Blue, Green, Yellow, Magenta
    
    for (let i = 0; i < playerCount; i++) {
        const p = {
            mesh: createRiggedCharacter(colors[i % colors.length]),
            pos: new THREE.Vector3((i - 1) * 3, 0, 0), // Simple stagger
            rotation: 0,
            animTime: 0
        };
        scene.add(p.mesh);
        players.push(p);

        // Camera for this player
        const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
        cameras.push(cam);
    }
}

function updatePlayer(dt, player, input) {
    // Movement Logic
    const speed = CONFIG.moveSpeed * dt;
    const isMoving = (input.y !== 0 || input.x !== 0);
    
    if (isMoving) {
        // Calculate target rotation based on input
        const targetRotation = Math.atan2(input.x, input.y);
        
        // Smooth rotation
        let rotDiff = targetRotation - player.rotation;
        // Normalize angle
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        
        player.rotation += rotDiff * CONFIG.turnSpeed * dt;
        
        // Move in direction of facing
        player.pos.x += input.x * speed;
        player.pos.z -= input.y * speed; 
        
        // Rotate mesh to face movement
        player.mesh.rotation.y = Math.atan2(input.x, -input.y); 
        
        // Advance animation time
        player.animTime += dt * 10;
    } else {
        // Reset animation to stand pose smoothly
        // For now, just reset time
        if (Math.sin(player.animTime) > 0.1) player.animTime += dt * 10; 
        else player.animTime = 0;
    }

    // --- Animation (Walk Cycle) ---
    const parts = player.mesh.userData;
    const legAmp = 0.6;
    const armAmp = 0.5;
    
    if (isMoving) {
        // Simple sin wave walk cycle
        parts.legL.rotation.x = Math.sin(player.animTime) * legAmp;
        parts.legR.rotation.x = Math.sin(player.animTime + Math.PI) * legAmp;
        
        parts.armL.rotation.x = Math.sin(player.animTime + Math.PI) * armAmp;
        parts.armR.rotation.x = Math.sin(player.animTime) * armAmp;
        
        // Bobbing body
        parts.body.position.y = 1.1 + Math.abs(Math.sin(player.animTime * 2)) * 0.05;
    } else {
        // Idle breathing
        parts.legL.rotation.x = THREE.MathUtils.lerp(parts.legL.rotation.x, 0, dt * 5);
        parts.legR.rotation.x = THREE.MathUtils.lerp(parts.legR.rotation.x, 0, dt * 5);
        parts.armL.rotation.x = THREE.MathUtils.lerp(parts.armL.rotation.x, 0, dt * 5);
        parts.armR.rotation.x = THREE.MathUtils.lerp(parts.armR.rotation.x, 0, dt * 5);
        parts.body.position.y = THREE.MathUtils.lerp(parts.body.position.y, 1.1, dt * 5);
    }

    // Terrain Following
    const terrainHeight = terrainManager.getHeightAt(player.pos.x, player.pos.z);
    // Smooth lerp for height to prevent snapping
    player.pos.y = THREE.MathUtils.lerp(player.pos.y, terrainHeight, dt * 10);

    // Apply Position
    player.mesh.position.copy(player.pos);
}

function updateCameras() {
    const offset = new THREE.Vector3(0, CONFIG.cameraHeight, CONFIG.cameraOffsetZ);
    const lookOffset = new THREE.Vector3(0, 2, -5);

    for(let i=0; i<players.length; i++) {
        cameras[i].position.copy(players[i].pos).add(offset);
        cameras[i].lookAt(players[i].pos.clone().add(lookOffset));
    }
}

function animate() {
    const dt = clock.getDelta();
    inputManager.update();

    for(let i=0; i<players.length; i++) {
        updatePlayer(dt, players[i], inputManager.state[i]);
    }

    terrainManager.update(players.map(p => p.pos));
    updateCameras();

    render();
}

// --- Layout Handling ---
function handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    renderer.setSize(width, height);
    
    if (rendererP5) {
        // Resize P5 canvas to be a diamond box
        // Scaled up to 70% of min dimension (approx 1.75x larger than previous 40%)
        const size = Math.min(width, height) * 0.7;
        const cP5 = document.getElementById('c-p5');
        cP5.style.width = size + 'px';
        cP5.style.height = size + 'px';
        rendererP5.setSize(size, size, false); // false to not resize styling
    }

    const divV = document.getElementById('divider-v');
    const divH = document.getElementById('divider-h');
    const zoneP1 = document.getElementById('zone-p1');
    const zoneP2 = document.getElementById('zone-p2');

    // Default everything hidden
    divV.style.display = 'none';
    divH.style.display = 'none';

    if (playerCount === 1) {
        zoneP1.style.width = '100%'; zoneP1.style.height = '100%';
        zoneP2.style.display = 'none';
    } else if (playerCount === 2) {
        // Simple Split Logic
        if (width > height) { // Landscape
            divV.style.display = 'block'; divV.style.left = '50%'; divV.style.height = '100%'; divV.style.width = '2px';
            zoneP1.style.width = '50%'; zoneP1.style.height = '100%';
            zoneP2.style.width = '50%'; zoneP2.style.left = '50%';
        } else { // Portrait
            divH.style.display = 'block'; divH.style.top = '50%'; divH.style.width = '100%'; divH.style.height = '2px';
            zoneP1.style.width = '100%'; zoneP1.style.height = '50%';
            zoneP2.style.width = '100%'; zoneP2.style.top = '50%';
        }
    } else {
        // 3+ Players: Grid Layout
        divV.style.display = 'block'; divV.style.left = '50%'; divV.style.height = '100%'; divV.style.width = '2px';
        divH.style.display = 'block'; divH.style.top = '50%'; divH.style.width = '100%'; divH.style.height = '2px';
        // Hide touch for >2 players simple
        zoneP1.style.display = 'none';
        zoneP2.style.display = 'none';
    }
}

function render() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    renderer.setScissorTest(true);

    if (playerCount === 1) {
        renderer.setScissor(0, 0, w, h);
        renderer.setViewport(0, 0, w, h);
        cameras[0].aspect = w / h;
        cameras[0].updateProjectionMatrix();
        renderer.render(scene, cameras[0]);
    } else if (playerCount === 2) {
        if (w > h) {
            // Split Vertically (Side by Side)
            const hw = w / 2;
            renderer.setScissor(0, 0, hw, h);
            renderer.setViewport(0, 0, hw, h);
            cameras[0].aspect = hw / h;
            cameras[0].updateProjectionMatrix();
            renderer.render(scene, cameras[0]);

            renderer.setScissor(hw, 0, hw, h);
            renderer.setViewport(hw, 0, hw, h);
            cameras[1].aspect = hw / h;
            cameras[1].updateProjectionMatrix();
            renderer.render(scene, cameras[1]);
        } else {
            // Split Horizontally (Top/Bottom)
            const hh = h / 2;
            renderer.setScissor(0, hh, w, hh);
            renderer.setViewport(0, hh, w, hh);
            cameras[0].aspect = w / hh;
            cameras[0].updateProjectionMatrix();
            renderer.render(scene, cameras[0]);

            renderer.setScissor(0, 0, w, hh);
            renderer.setViewport(0, 0, w, hh);
            cameras[1].aspect = w / hh;
            cameras[1].updateProjectionMatrix();
            renderer.render(scene, cameras[1]);
        }
    } else {
        // 3, 4, or 5 Players (Grid Layout)
        const hw = w / 2;
        const hh = h / 2;

        // P1 Top Left
        renderer.setScissor(0, hh, hw, hh);
        renderer.setViewport(0, hh, hw, hh);
        cameras[0].aspect = hw / hh;
        cameras[0].updateProjectionMatrix();
        renderer.render(scene, cameras[0]);

        // P2 Top Right
        renderer.setScissor(hw, hh, hw, hh);
        renderer.setViewport(hw, hh, hw, hh);
        cameras[1].aspect = hw / hh;
        cameras[1].updateProjectionMatrix();
        renderer.render(scene, cameras[1]);

        // P3 Bottom Left
        if (players[2]) {
            renderer.setScissor(0, 0, hw, hh);
            renderer.setViewport(0, 0, hw, hh);
            cameras[2].aspect = hw / hh;
            cameras[2].updateProjectionMatrix();
            renderer.render(scene, cameras[2]);
        }

        // P4 Bottom Right
        if (players[3]) {
            renderer.setScissor(hw, 0, hw, hh);
            renderer.setViewport(hw, 0, hw, hh);
            cameras[3].aspect = hw / hh;
            cameras[3].updateProjectionMatrix();
            renderer.render(scene, cameras[3]);
        }

        // P5 Diamond (Separate Renderer)
        if (playerCount === 5 && rendererP5 && players[4]) {
            // rendererP5 uses its own canvas, so no scissor needed on main
            // We just render full canvas of rendererP5
            // But we need to make sure camera matches aspect of that square canvas
            // The canvas is square (see handleResize)
            cameras[4].aspect = 1.0; 
            cameras[4].updateProjectionMatrix();
            rendererP5.render(scene, cameras[4]);
        }
    }
    
    renderer.setScissorTest(false);
}

init();