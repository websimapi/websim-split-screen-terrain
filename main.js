import * as THREE from 'three';
import { InputManager } from './input.js';
import { TerrainManager } from './terrain.js';
import { NetworkManager } from './network.js';
import QRCode from 'qrcode';

// --- Configuration ---
const CONFIG = {
    cameraHeight: 12, 
    cameraOffsetZ: 18,
    moveSpeed: 10, 
    turnSpeed: 5,
    runSpeedMultiplier: 1.5
};

// --- Globals ---
let scene, renderer;
let rendererP5; 
let players = [];
let cameras = [];
let inputManager, terrainManager, networkManager;
let clock;
let playerCount = 1; // Default starts at 1
let isHost = true;
let myPlayerIndex = 0;
let clientViewMode = true; // True = Render 3D, False = Controller Only

// --- Initialization ---
async function init() {
    networkManager = new NetworkManager();

    // Check URL Params for Join
    const urlParams = new URLSearchParams(window.location.search);
    const joinId = urlParams.get('join');

    if (joinId) {
        // --- Client Mode ---
        isHost = false;
        setupClientUI();
        try {
            await networkManager.initClient(joinId);
            document.getElementById('join-status').innerText = "Connected to Host!";
        } catch (e) {
            document.getElementById('join-status').innerText = "Connection Failed: " + e;
        }
    } else {
        // --- Menu Mode ---
        document.getElementById('main-menu').style.display = 'block';
        document.getElementById('lobby-ui').style.display = 'none';
        
        document.getElementById('btn-host').addEventListener('click', async () => {
            document.getElementById('main-menu').style.display = 'none';
            document.getElementById('lobby-ui').style.display = 'flex';
            
            const id = await networkManager.initHost();
            const joinUrl = `${window.location.origin}${window.location.pathname}?join=${id}`;
            
            const qrContainer = document.getElementById('qr-container');
            QRCode.toCanvas(joinUrl, { width: 200 }, function (err, canvas) {
                if (err) console.error(err);
                qrContainer.appendChild(canvas);
            });
            
            // Listen for joins
            networkManager.onPlayerJoined = (index) => {
                const list = document.getElementById('lobby-players');
                const badge = document.createElement('div');
                badge.className = 'player-badge';
                // Color mapping logic later
                badge.innerText = `P${index + 1}`;
                list.appendChild(badge);
                playerCount = index + 1;
            };
        });
    }

    const startBtn = document.getElementById('btn-start-game');
    startBtn.addEventListener('click', () => {
        if (!isHost) return;
        
        // Host starts game
        networkManager.broadcastStart({ playerCount });
        launchGame();
    });
    
    // Client listener for start
    if (!isHost) {
        networkManager.onGameStart = (config) => {
            playerCount = config.playerCount;
            myPlayerIndex = networkManager.myPlayerIndex;
            document.getElementById('my-player-badge').innerText = `You are P${myPlayerIndex + 1}`;
            launchGame();
        };
        
        networkManager.onPlayerJoined = (index) => {
            // My index assigned
             myPlayerIndex = index;
             document.getElementById('my-player-badge').innerText = `You are P${myPlayerIndex + 1}`;
        }
    }
    
    // Mode Toggle (Client only)
    const toggleBtn = document.getElementById('view-toggle');
    toggleBtn.addEventListener('click', () => {
        clientViewMode = !clientViewMode;
        toggleBtn.innerText = clientViewMode ? "Switch to Controller Mode" : "Switch to Direct Screen";
        if (renderer) {
            renderer.domElement.style.display = clientViewMode ? 'block' : 'none';
        }
    });
}

function setupClientUI() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('lobby-ui').style.display = 'none';
    document.getElementById('client-wait').style.display = 'block';
    document.getElementById('view-toggle').style.display = 'block';
}

function launchGame() {
    document.getElementById('start-overlay').style.display = 'none';

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioEl = new Audio('./asset_farm_music.mp3');
    audioEl.loop = true;
    audioEl.volume = 0.5;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    // Simple play attempt
    audioEl.play().catch(() => {}); 
    
    setupThreeJS();
    setupInputs();
    setupWorld();
    setupPlayers();
    handleResize();
    
    window.addEventListener('resize', handleResize);
    
    // Start Loop
    renderer.setAnimationLoop(animate);
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

    // P5 Renderer (Diamond) - Only needed on Host if P5 is present
    if (isHost && playerCount >= 5) {
        const cP5 = document.getElementById('c-p5');
        cP5.style.display = 'block';
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
    inputManager = new InputManager(playerCount, isHost, myPlayerIndex);
    
    // Connect network callbacks
    if (isHost) {
        networkManager.onInputReceived = (index, state) => {
            inputManager.setNetworkInput(index, state);
        };
    }
    
    if (!isHost) {
        // Client: Listen for state updates
        networkManager.onStateReceived = (state) => {
            // state is array of {pos, rot, animTime}
            // Update all players in the scene
            for (let i = 0; i < players.length; i++) {
                if (state[i]) {
                    // Smoothly lerp to host state
                    // Simple snap for now to prevent drift, lerp in update loop if needed
                    // Actually, let's just update target properties and let updatePlayer handle visuals
                    // We'll store targetState in userData
                    players[i].targetState = state[i]; 
                }
            }
        };
    }

    const zoneP1 = document.getElementById('zone-p1');
    const zoneP2 = document.getElementById('zone-p2');
    
    // If Client, we only use zoneP1 which maps to our index
    setTimeout(() => {
        inputManager.initTouch(zoneP1, isHost ? zoneP2 : null);
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
    // HOST Logic (Physics)
    if (isHost) {
        const speed = CONFIG.moveSpeed * dt;
        const isMoving = (input.y !== 0 || input.x !== 0);
        
        if (isMoving) {
            // Calculate target rotation based on input
            const targetRotation = Math.atan2(input.x, input.y);
            
            // Smooth rotation
            let rotDiff = targetRotation - player.rotation;
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
            if (Math.sin(player.animTime) > 0.1) player.animTime += dt * 10; 
            else player.animTime = 0;
        }

        // Terrain Following
        const terrainHeight = terrainManager.getHeightAt(player.pos.x, player.pos.z);
        player.pos.y = THREE.MathUtils.lerp(player.pos.y, terrainHeight, dt * 10);
        
        // Apply to Mesh
        player.mesh.position.copy(player.pos);
    } 
    // CLIENT Logic (Interpolation)
    else {
        if (player.targetState) {
            // Lerp position
            player.mesh.position.lerp(player.targetState.pos, dt * 10);
            player.pos.copy(player.mesh.position);
            
            // Lerp rotation (Shortest path)
            const currentQ = player.mesh.quaternion;
            const targetQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, player.targetState.rotY, 0));
            player.mesh.quaternion.slerp(targetQ, dt * 10);
            
            // Sync anim time
            player.animTime = THREE.MathUtils.lerp(player.animTime, player.targetState.animTime, dt * 10);
        }
    }
    
    // --- Shared Animation Logic (Visuals) ---
    // Uses player.animTime which is either calculated (Host) or synced (Client)
    const isMoving = (player.animTime > 0.1 && Math.abs(Math.sin(player.animTime)) > 0.01); // Approx check
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

    if (isHost) {
        // Process Game Logic
        for(let i=0; i<players.length; i++) {
            updatePlayer(dt, players[i], inputManager.state[i]);
        }
        
        // Broadcast State
        const statePacket = players.map(p => ({
            pos: p.pos,
            rotY: p.mesh.rotation.y,
            animTime: p.animTime
        }));
        networkManager.broadcastState(statePacket);
        
        terrainManager.update(players.map(p => p.pos));
    } else {
        // Client Logic
        // Send Input
        const myInput = inputManager.getLocalState();
        if (myInput) networkManager.sendInput(myInput);
        
        // Update Visuals (Interpolation)
        for(let i=0; i<players.length; i++) {
            updatePlayer(dt, players[i], null);
        }
        
        // Update terrain around ME
        if (players[myPlayerIndex]) {
            terrainManager.update([players[myPlayerIndex].pos]);
        }
    }

    updateCameras();
    
    if (clientViewMode) {
        render();
    }
}

// --- Layout Handling ---
function handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    renderer.setSize(width, height);
    
    // Client always full screen touch zone if needed
    if (!isHost) {
        const zoneP1 = document.getElementById('zone-p1');
        zoneP1.style.width = '100%'; zoneP1.style.height = '100%';
        zoneP1.style.display = 'block';
        return; 
    }

    // --- HOST LAYOUT LOGIC ---
    if (rendererP5) {
        const size = Math.min(width, height) * 0.7;
        const cP5 = document.getElementById('c-p5');
        cP5.style.width = size + 'px';
        cP5.style.height = size + 'px';
        rendererP5.setSize(size, size, false); 
    }

    const divV = document.getElementById('divider-v');
    const divH = document.getElementById('divider-h');
    const zoneP1 = document.getElementById('zone-p1');
    const zoneP2 = document.getElementById('zone-p2');

    divV.style.display = 'none';
    divH.style.display = 'none';

    if (playerCount === 1) {
        zoneP1.style.width = '100%'; zoneP1.style.height = '100%';
        zoneP2.style.display = 'none';
    } else if (playerCount === 2) {
        if (width > height) { 
            divV.style.display = 'block'; divV.style.left = '50%'; divV.style.height = '100%'; divV.style.width = '2px';
            zoneP1.style.width = '50%'; zoneP1.style.height = '100%';
            zoneP2.style.width = '50%'; zoneP2.style.left = '50%';
        } else {
            divH.style.display = 'block'; divH.style.top = '50%'; divH.style.width = '100%'; divH.style.height = '2px';
            zoneP1.style.width = '100%'; zoneP1.style.height = '50%';
            zoneP2.style.width = '100%'; zoneP2.style.top = '50%';
        }
    } else {
        divV.style.display = 'block'; divV.style.left = '50%'; divV.style.height = '100%'; divV.style.width = '2px';
        divH.style.display = 'block'; divH.style.top = '50%'; divH.style.width = '100%'; divH.style.height = '2px';
        zoneP1.style.display = 'none';
        zoneP2.style.display = 'none';
    }
}

function render() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // CLIENT: Simple full screen render of MY player
    if (!isHost) {
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, w, h);
        if (cameras[myPlayerIndex]) {
            cameras[myPlayerIndex].aspect = w / h;
            cameras[myPlayerIndex].updateProjectionMatrix();
            renderer.render(scene, cameras[myPlayerIndex]);
        }
        return;
    }

    // HOST: Split Screen Logic
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
        if (rendererP5 && players[4]) {
            cameras[4].aspect = 1.0; 
            cameras[4].updateProjectionMatrix();
            rendererP5.render(scene, cameras[4]);
        }
    }
    
    renderer.setScissorTest(false);
}

init();