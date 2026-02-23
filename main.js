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
        const audioEl = new Audio('./asset_farm_music.mp3');
        audioEl.loop = true;
        audioEl.volume = 0.5;
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
    scene.background = new THREE.Color(0x87CEEB); // Sky Blue
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.008);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Output encoding for brighter colors
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Bright day ambient
    scene.add(ambientLight);
    
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffee, 1.2); // Sun
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0001;
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
    player1 = {
        mesh: createRiggedCharacter(0xff4444), // Red Shirt
        pos: new THREE.Vector3(-5, 0, 0),
        vel: new THREE.Vector3(0, 0, 0),
        rotation: 0,
        animTime: 0
    };
    scene.add(player1.mesh);

    player2 = {
        mesh: createRiggedCharacter(0x4444ff), // Blue Shirt
        pos: new THREE.Vector3(5, 0, 0),
        vel: new THREE.Vector3(0, 0, 0),
        rotation: 0,
        animTime: 0
    };
    scene.add(player2.mesh);
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