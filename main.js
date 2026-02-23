import * as THREE from 'three';
import { InputManager } from './input.js';
import { TerrainManager } from './terrain.js';

// --- Configuration ---
const CONFIG = {
    cameraHeight: 8,
    cameraOffsetZ: 12,
    moveSpeed: 20,
    turnSpeed: 3
};

// --- Globals ---
let scene, renderer;
let camera1, camera2;
let player1, player2;
let inputManager, terrainManager;
let clock;
let engineSound;

// --- Initialization ---
function init() {
    const startBtn = document.getElementById('start-btn');
    startBtn.addEventListener('click', () => {
        document.getElementById('start-overlay').style.display = 'none';
        
        // Initialize Audio context on user interaction
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioEl = new Audio('./engine_hum.mp3');
        audioEl.loop = true;
        const source = audioCtx.createMediaElementSource(audioEl);
        source.connect(audioCtx.destination);
        audioEl.play().catch(e => console.log("Audio play failed", e));
        
        // Start Loop
        renderer.setAnimationLoop(animate);
    });

    setupThreeJS();
    setupInputs();
    setupWorld();
    setupPlayers();
    handleResize();
    
    // Initial resize call
    window.addEventListener('resize', handleResize);
}

function setupThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.FogExp2(0x050510, 0.02);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 2); // Soft white light
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 500;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    scene.add(dirLight);

    // Cameras
    const aspect = (window.innerWidth / 2) / window.innerHeight;
    camera1 = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    camera2 = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    
    clock = new THREE.Clock();
}

function setupInputs() {
    inputManager = new InputManager();
    
    // Setup touch zones
    const zoneP1 = document.getElementById('zone-p1');
    const zoneP2 = document.getElementById('zone-p2');
    
    // Wait a tick for layout
    setTimeout(() => {
        inputManager.initTouch(zoneP1, zoneP2);
    }, 100);
}

function setupWorld() {
    terrainManager = new TerrainManager(scene);
}

function createPlayerMesh(color, texturePath) {
    const group = new THREE.Group();

    // Body
    const geometry = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
    const texture = new THREE.TextureLoader().load(texturePath);
    const material = new THREE.MeshStandardMaterial({ 
        map: texture,
        color: color,
        roughness: 0.2,
        metalness: 0.8,
        emissive: color,
        emissiveIntensity: 0.5
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 1; // Center of capsule is 0, so lift it up half height + radius approx
    mesh.castShadow = true;
    
    // Glow ring
    const ringGeo = new THREE.TorusGeometry(0.8, 0.05, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: color });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.2;
    
    group.add(mesh);
    group.add(ring);
    
    // Add a spot light for the ray-traced feel
    const spotLight = new THREE.SpotLight(color, 20);
    spotLight.position.set(0, 5, 0);
    spotLight.target = mesh;
    spotLight.angle = 0.5;
    spotLight.penumbra = 0.5;
    spotLight.distance = 20;
    spotLight.castShadow = true;
    group.add(spotLight);

    return group;
}

function setupPlayers() {
    player1 = {
        mesh: createPlayerMesh(0xff0000, './player_1.png'),
        pos: new THREE.Vector3(-5, 0, 0),
        vel: new THREE.Vector3(0, 0, 0),
        rotation: 0
    };
    scene.add(player1.mesh);

    player2 = {
        mesh: createPlayerMesh(0x0000ff, './player_2.png'),
        pos: new THREE.Vector3(5, 0, 0),
        vel: new THREE.Vector3(0, 0, 0),
        rotation: 0
    };
    scene.add(player2.mesh);
}

function updatePlayer(dt, player, input) {
    // Movement Logic
    const speed = CONFIG.moveSpeed * dt;
    
    if (input.y !== 0 || input.x !== 0) {
        // Calculate target rotation based on input
        const targetRotation = Math.atan2(input.x, input.y);
        
        // Smooth rotation
        let rotDiff = targetRotation - player.rotation;
        // Normalize angle
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        
        player.rotation += rotDiff * CONFIG.turnSpeed * dt;
        
        // Move in direction of facing
        // Actually, let's move in direction of input relative to camera?
        // For simplicity: simple absolute direction movement
        player.pos.x += input.x * speed;
        player.pos.z -= input.y * speed; // -y is forward in 3D usually (negative Z)
        
        // Rotate mesh to face movement
        player.mesh.rotation.y = Math.atan2(input.x, -input.y); // face direction
    }

    // Terrain Following
    const terrainHeight = terrainManager.getHeightAt(player.pos.x, player.pos.z);
    // Smooth lerp for height to prevent snapping
    player.pos.y = THREE.MathUtils.lerp(player.pos.y, terrainHeight, dt * 10);

    // Apply Position
    player.mesh.position.copy(player.pos);
}

function updateCameras() {
    // Camera 1 Follow
    const offset1 = new THREE.Vector3(0, CONFIG.cameraHeight, CONFIG.cameraOffsetZ);
    // Rotate offset by player rotation if we want third person lock, 
    // but fixed angle is often better for simple arcade games.
    // Let's do simple follow with fixed offset
    camera1.position.copy(player1.pos).add(offset1);
    camera1.lookAt(player1.pos.clone().add(new THREE.Vector3(0, 2, -5)));

    // Camera 2 Follow
    const offset2 = new THREE.Vector3(0, CONFIG.cameraHeight, CONFIG.cameraOffsetZ);
    camera2.position.copy(player2.pos).add(offset2);
    camera2.lookAt(player2.pos.clone().add(new THREE.Vector3(0, 2, -5)));
}

function animate() {
    const dt = clock.getDelta();
    inputManager.update();

    updatePlayer(dt, player1, inputManager.state.p1);
    updatePlayer(dt, player2, inputManager.state.p2);

    terrainManager.update([player1.pos, player2.pos]);
    updateCameras();

    render();
}

// --- Layout Handling ---
let splitType = 'vertical'; // vertical line splitting left/right

function handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    renderer.setSize(width, height);

    // Determine split based on aspect ratio
    // If width > height (Landscape), split Left/Right
    // If height > width (Portrait), split Top/Bottom
    
    const divider = document.getElementById('divider');
    const zoneP1 = document.getElementById('zone-p1');
    const zoneP2 = document.getElementById('zone-p2');

    if (width > height) {
        // Landscape -> Side by Side
        splitType = 'vertical';
        divider.style.width = '2px';
        divider.style.height = '100%';
        divider.style.top = '0';
        divider.style.left = '50%';
        divider.style.transform = 'translateX(-50%)';

        zoneP1.style.width = '50%';
        zoneP1.style.height = '100%';
        zoneP1.style.left = '0';
        zoneP1.style.top = '0';

        zoneP2.style.width = '50%';
        zoneP2.style.height = '100%';
        zoneP2.style.left = '50%';
        zoneP2.style.top = '0';

    } else {
        // Portrait -> Top and Bottom
        splitType = 'horizontal';
        divider.style.width = '100%';
        divider.style.height = '2px';
        divider.style.top = '50%';
        divider.style.left = '0';
        divider.style.transform = 'translateY(-50%)';

        zoneP1.style.width = '100%';
        zoneP1.style.height = '50%';
        zoneP1.style.left = '0';
        zoneP1.style.top = '0'; // Top half

        zoneP2.style.width = '100%';
        zoneP2.style.height = '50%';
        zoneP2.style.left = '0';
        zoneP2.style.top = '50%'; // Bottom half
    }
    
    // Re-init nipplejs if needed or just let CSS handle zones? 
    // NippleJS binds to the element dimensions, so it might handle resize automatically if container resizes.
    // Ideally we re-run initTouch but nipplejs instances are static. 
    // For this simple demo, we assume CSS handles the zone size and nipple renders relative to it.
}

function render() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    renderer.setScissorTest(true);

    if (splitType === 'vertical') {
        // Player 1 (Left)
        const halfWidth = width / 2;
        renderer.setScissor(0, 0, halfWidth, height);
        renderer.setViewport(0, 0, halfWidth, height);
        camera1.aspect = halfWidth / height;
        camera1.updateProjectionMatrix();
        renderer.render(scene, camera1);

        // Player 2 (Right)
        renderer.setScissor(halfWidth, 0, halfWidth, height);
        renderer.setViewport(halfWidth, 0, halfWidth, height);
        camera2.aspect = halfWidth / height;
        camera2.updateProjectionMatrix();
        renderer.render(scene, camera2);
    } else {
        // Player 1 (Top) - Wait, standard coordinate system: 0,0 is bottom left.
        // So Top is y = height/2 to height
        const halfHeight = height / 2;
        
        // P1 Top View
        renderer.setScissor(0, halfHeight, width, halfHeight);
        renderer.setViewport(0, halfHeight, width, halfHeight);
        camera1.aspect = width / halfHeight;
        camera1.updateProjectionMatrix();
        renderer.render(scene, camera1);

        // P2 Bottom View
        renderer.setScissor(0, 0, width, halfHeight);
        renderer.setViewport(0, 0, width, halfHeight);
        camera2.aspect = width / halfHeight;
        camera2.updateProjectionMatrix();
        renderer.render(scene, camera2);
    }

    renderer.setScissorTest(false);
}

init();