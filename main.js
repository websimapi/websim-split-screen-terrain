import * as THREE from 'three';
import { InputManager } from './input.js';
import { TerrainManager } from './terrain.js';
import { NetworkManager } from './network.js';
import { SPELL_DB, matchSpell } from './spells.js';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';

// --- Configuration ---
const CONFIG = {
    cameraHeight: 12, 
    cameraOffsetZ: 14,
    moveSpeed: 8, 
    turnSpeed: 10,
    runSpeedMultiplier: 1.5
};

// --- Globals ---
let scene, renderer;
let rendererP5; 
let players = [];
let projectiles = [];
let magicEffects = [];
let cameras = [];
let inputManager, terrainManager, networkManager;
let clock;
let playerCount = 1; // Default starts at 1
let isHost = true;
let myPlayerIndex = 0;
let clientViewMode = true; // True = Render 3D, False = Controller Only
let worldSeed = Math.floor(Math.random() * 2147483647);
let worldId = crypto.randomUUID();
let saveSlot = 1;
let currentSaveData = null;
let autoSaveInterval = null;

// Speech Bubble Helper
function createTextSprite(message) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 256;
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.lineWidth = 10;
    
    // Bubble shape
    ctx.beginPath();
    ctx.roundRect(20, 20, 472, 216, 50);
    ctx.fill();
    ctx.stroke();

    ctx.font = "Bold 60px Arial";
    ctx.fillStyle = "black";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(message, 256, 128);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(4, 2, 1);
    sprite.position.set(0, 2.5, 0);
    return sprite;
}

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
            
            // Save System Init
            const slotSelect = document.getElementById('save-slot');
            const infoSpan = document.getElementById('save-info');
            
            const updateSaveInfo = () => {
                saveSlot = parseInt(slotSelect.value);
                const dataStr = localStorage.getItem(`farm_save_${saveSlot}`);
                if (dataStr) {
                    const d = JSON.parse(dataStr);
                    infoSpan.innerText = `Exists - Seed: ${d.seed}, Items: ${d.items ? d.items.length : 0}`;
                    currentSaveData = d;
                    worldSeed = d.seed;
                    worldId = d.worldId || crypto.randomUUID();
                } else {
                    infoSpan.innerText = "New Game";
                    currentSaveData = null;
                    worldSeed = Math.floor(Math.random() * 2147483647);
                    worldId = crypto.randomUUID();
                }
            };
            slotSelect.addEventListener('change', updateSaveInfo);
            updateSaveInfo();

            const id = await networkManager.initHost();
            const joinUrl = `${window.location.origin}${window.location.pathname}?join=${id}`;
            
            const qrContainer = document.getElementById('qr-container');
            QRCode.toCanvas(joinUrl, { width: 200 }, function (err, canvas) {
                if (err) console.error(err);
                qrContainer.appendChild(canvas);
            });
            
            // Listen for joins
            networkManager.onPlayerJoined = (index, uuid, conn) => {
                // Send Lobby Info immediately so client can check saves
                conn.send({ type: 'LOBBY_INFO', worldId: worldId, seed: worldSeed });
            };

            // Listen for Ready
            networkManager.onPlayerReady = (index, charData) => {
                 const list = document.getElementById('lobby-players');
                 const badge = document.createElement('div');
                 badge.className = 'player-badge';
                 badge.innerText = `P${index + 1} Ready`;
                 badge.style.borderBottom = `4px solid #44ff44`;
                 list.appendChild(badge);
                 playerCount = index + 1;
                 
                 // Store this char data for initialization
                 if (!currentSaveData) currentSaveData = { players: {} };
                 if (!currentSaveData.players) currentSaveData.players = {};
                 currentSaveData.players[`p${index}`] = charData;
            };
        });
    }

    const startBtn = document.getElementById('btn-start-game');
    startBtn.addEventListener('click', () => {
        if (!isHost) return;
        
        // Prepare initial state (loading items)
        const initialItems = currentSaveData ? (currentSaveData.items || []) : [];
        
        // Host starts game
        networkManager.broadcastStart({ playerCount, seed: worldSeed, items: initialItems });
        launchGame();
    });
    
    // Client listener for start
    if (!isHost) {
        networkManager.onLobbyInfo = (data) => {
            worldId = data.worldId;
            worldSeed = data.seed;
            
            // Check for existing save
            const localKey = `farm_char_${worldId}`;
            const existing = localStorage.getItem(localKey);
            
            const container = document.getElementById('char-select-container');
            container.innerHTML = '';
            
            if (existing) {
                const charData = JSON.parse(existing);
                container.innerHTML = `
                    <div style="background:rgba(255,255,255,0.8); padding:15px; border-radius:10px; margin-bottom:10px;">
                        <h4>Found Saved Character</h4>
                        <p>Inventory: ${charData.inventory ? charData.inventory.branches : 0} branches</p>
                        <button id="btn-use-save">Play as Saved Character</button>
                    </div>
                `;
                document.getElementById('btn-use-save').onclick = () => {
                    sendReady(charData);
                };
            }
            
            const newBtn = document.createElement('button');
            newBtn.innerText = "Create New Character";
            newBtn.onclick = () => {
                // Default new char
                sendReady({ inventory: { branches: 0 } });
            };
            container.appendChild(newBtn);
        };

        function sendReady(charData) {
            document.getElementById('char-select-container').style.display = 'none';
            document.getElementById('client-ready-msg').style.display = 'block';
            networkManager.sendReady(charData);
        }

        networkManager.onGameStart = (config) => {
            playerCount = config.playerCount;
            if (config.seed !== undefined) worldSeed = config.seed;
            myPlayerIndex = networkManager.myPlayerIndex;
            document.getElementById('my-player-badge').innerText = `You are P${myPlayerIndex + 1}`;
            launchGame();
            
            // Load initial items
            if (config.items) {
                terrainManager.syncItems(config.items);
            }
        };
        
        networkManager.onPlayerJoined = (index) => {
            // My index assigned
             myPlayerIndex = index;
             document.getElementById('my-player-badge').innerText = `You are P${myPlayerIndex + 1}`;
        }
        
        networkManager.onHostQuit = () => {
            saveLocalChar();
            alert("Host has disconnected. Game Saved.");
            window.location.reload();
        };
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

    // QR Scanning
    const scanBtn = document.getElementById('btn-scan');
    const closeScanBtn = document.getElementById('btn-close-scanner');
    let qrScanner = null;

    if (scanBtn) {
        scanBtn.addEventListener('click', () => {
            document.getElementById('qr-scanner-overlay').style.display = 'flex';
            
            // Start Scanner
            qrScanner = new Html5Qrcode("reader");
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };
            
            qrScanner.start({ facingMode: "environment" }, config, (decodedText) => {
                // Success
                console.log("Scanned:", decodedText);
                stopScanner();
                
                // Determine if it's a URL or ID
                if (decodedText.includes(window.location.origin)) {
                    window.location.href = decodedText;
                } else if (decodedText.startsWith('http')) {
                    window.location.href = decodedText; // External URL?
                } else {
                    // Assume it's just the ID
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.set('join', decodedText);
                    window.location.href = newUrl.toString();
                }
            }, 
            (err) => { /* ignore per-frame errors */ })
            .catch(err => {
                console.error(err);
                alert("Could not access camera. Please ensure permissions are granted.");
                stopScanner();
            });
        });
    }

    if (closeScanBtn) {
        closeScanBtn.addEventListener('click', stopScanner);
    }

    function stopScanner() {
        document.getElementById('qr-scanner-overlay').style.display = 'none';
        if (qrScanner) {
            qrScanner.stop().then(() => {
                qrScanner.clear();
                qrScanner = null;
            }).catch(console.error);
        }
    }
}

function setupClientUI() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('lobby-ui').style.display = 'none';
    document.getElementById('client-wait').style.display = 'block';
    document.getElementById('view-toggle').style.display = 'block';
}

function launchGame() {
    document.getElementById('start-overlay').style.display = 'none';
    setupEscMenu();

    // Auto Save
    autoSaveInterval = setInterval(() => {
        if (isHost) saveGame();
        else saveLocalChar();
    }, 5000);

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
        networkManager.onVoiceReceived = (index, text) => {
            handleVoiceInput(index, text);
        };
    }
    
    if (!isHost) {
        // Client: Listen for state updates
        networkManager.onStateReceived = (packet) => {
            // Packet contains { players: [], items: [] }
            const pStates = packet.players;
            
            // Update all players in the scene
            for (let i = 0; i < players.length; i++) {
                if (pStates[i]) {
                    players[i].targetState = pStates[i];
                    // Direct sync inventory for display
                    if (pStates[i].inventory) players[i].inventory = pStates[i].inventory;
                }
            }
            
            // Sync items
            if (packet.items) {
                terrainManager.syncItems(packet.items);
            }
        };
    }

    const zoneP1 = document.getElementById('zone-p1');
    const zoneP2 = document.getElementById('zone-p2');
    
    // If Client, we only use zoneP1 which maps to our index
    setTimeout(() => {
        inputManager.initTouch(zoneP1, isHost ? zoneP2 : null);
    }, 100);

    // Mic Button
    const btnMic = document.getElementById('btn-mic');
    if (btnMic) {
        const start = (e) => { e.preventDefault(); inputManager.startListening(); btnMic.classList.add('active'); };
        const end = (e) => { e.preventDefault(); inputManager.stopListening(); btnMic.classList.remove('active'); };
        
        btnMic.addEventListener('mousedown', start);
        btnMic.addEventListener('touchstart', start);
        btnMic.addEventListener('mouseup', end);
        btnMic.addEventListener('touchend', end);
        btnMic.addEventListener('mouseleave', end);
    }
}

function setupWorld() {
    terrainManager = new TerrainManager(scene, worldSeed);
    
    // Load Tree State and Items if Host
    if (isHost && currentSaveData) {
        if (currentSaveData.items) {
             currentSaveData.items.forEach(i => {
                 terrainManager.droppedItems.push(i);
                 terrainManager.addItemMesh(i);
             });
        }
        if (currentSaveData.treeState) {
            terrainManager.treeState = new Map(currentSaveData.treeState);
        }
    }
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
    const defaultSpells = ["Accio", "Lumos", "Wingardium Leviosa"];

    // Restore logic
    const savedPlayers = currentSaveData ? (currentSaveData.players || {}) : {};

    for (let i = 0; i < playerCount; i++) {
        const p = {
            mesh: createRiggedCharacter(colors[i % colors.length]),
            pos: new THREE.Vector3((i - 1) * 3, 10, 0),
            rotation: 0,
            animTime: 0,
            velY: 0,
            isGrounded: false,
            inventory: { branches: 0 },
            knownSpells: [...defaultSpells],
            speechBubble: null,
            speechTimer: 0
        };
        
        // Restore Data
        let pData = null;
        if (i === 0 && isHost) pData = savedPlayers['host']; // Host local
        else if (isHost) pData = savedPlayers[`p${i}`]; // Host looking up connected peer data
        else if (i === myPlayerIndex) {
            // Client local restore for self (prediction)
            // Ideally we wait for state from host, but we can set inventory initially
        }

        if (pData) {
            if (pData.inventory) p.inventory = pData.inventory;
            if (pData.knownSpells) p.knownSpells = pData.knownSpells;
            if (pData.pos && isHost) p.pos.copy(pData.pos); // Only host sets pos authoritatively
        }

        scene.add(p.mesh);
        players.push(p);

        // Camera for this player
        const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
        cameras.push(cam);
    }
    
    // Enable Inventory UI
    if (!isHost || playerCount >= 1) {
        document.getElementById('inventory-display').style.display = 'flex';
    }
    
    // Setup Spellbook UI Actions
    document.getElementById('btn-close-book').onclick = () => {
        document.getElementById('spellbook').style.display = 'none';
    };
}

function handleVoiceInput(index, text) {
    if (!players[index]) return;
    
    const p = players[index];
    
    // 1. Show Speech Bubble (for everyone via state sync later, but local visual update now)
    updateSpeechBubble(p, text);
    
    // 2. Check for Spell Match
    const spell = matchSpell(text);
    if (spell) {
        // Unlock Spell if new
        const known = p.knownSpells.find(s => s.toLowerCase() === spell.name.toLowerCase());
        if (!known) {
            p.knownSpells.push(spell.name);
            console.log(`Player ${index} learned ${spell.name}!`);
            updateSpeechBubble(p, `${text} (Learned!)`);
        }
        
        // Trigger Spell Effect (TODO: Add particle effects)
        console.log(`Player ${index} cast ${spell.name}`);
    }
}

function updateSpeechBubble(player, text) {
    if (player.speechBubble) {
        player.mesh.remove(player.speechBubble);
        if (player.speechBubble.material.map) player.speechBubble.material.map.dispose();
        player.speechBubble.material.dispose();
    }
    
    player.lastText = text; // Store for network sync
    
    const bubble = createTextSprite(text);
    player.mesh.add(bubble);
    player.speechBubble = bubble;
    player.speechTimer = 3.0; // Show for 3 seconds
}

function updateSpellbookUI(knownSpells) {
    const list = document.getElementById('spell-list');
    list.innerHTML = '';
    
    SPELL_DB.spells.forEach(spell => {
        const isKnown = knownSpells.includes(spell.name);
        
        const el = document.createElement('div');
        el.className = `spell-entry ${isKnown ? 'known' : 'unknown'}`;
        
        const name = document.createElement('div');
        name.className = 'spell-name';
        name.innerText = isKnown ? spell.name : '???';
        
        const desc = document.createElement('div');
        desc.className = 'spell-desc';
        desc.innerText = isKnown ? spell.effect : 'Unknown spell. Speak to unlock.';
        
        el.appendChild(name);
        el.appendChild(desc);
        list.appendChild(el);
    });
}

function updatePlayer(dt, player, input) {
    // Update Speech Bubble Timer
    if (player.speechTimer > 0) {
        player.speechTimer -= dt;
        if (player.speechTimer <= 0 && player.speechBubble) {
            player.mesh.remove(player.speechBubble);
            player.speechBubble = null;
        }
    }

    // HOST Logic (Physics)
    if (isHost) {
        // Process Host Voice (Host plays as P0)
        // inputManager.spellQueue is populated by microphone
        if (player === players[0] && inputManager.spellQueue.length > 0) {
            while(inputManager.spellQueue.length > 0) {
                const txt = inputManager.spellQueue.shift();
                handleVoiceInput(0, txt);
            }
        }

        let currentSpeed = CONFIG.moveSpeed;
        
        // Calculate magnitude for Run
        let magnitude = 0;
        if (input) {
            magnitude = Math.sqrt(input.x*input.x + input.y*input.y);
            if (magnitude > 1.1) {
                currentSpeed *= CONFIG.runSpeedMultiplier;
            }
        }
        
        const speed = currentSpeed * dt;
        // Normalize input for direction if moving
        const isMoving = magnitude > 0.1;
        player.isMoving = isMoving; // Store for network
        
        // Horizontal Movement
        if (isMoving) {
            const dirX = input.x / magnitude;
            const dirY = input.y / magnitude;

            // Calculate target rotation based on input
            const targetRotation = Math.atan2(dirX, dirY);
            
            // Smooth rotation
            let rotDiff = targetRotation - player.rotation;
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            
            player.rotation += rotDiff * CONFIG.turnSpeed * dt;
            
            // Move using direction * speed * magnitude (optional, or just const speed)
            // Let's use constant speed if moving, modified by run multiplier
            player.pos.x += dirX * speed;
            player.pos.z -= dirY * speed; 
            
            // Rotate mesh to face movement (Visuals)
            player.mesh.rotation.y = Math.atan2(dirX, -dirY); 
            
            // Advance animation time
            if (player.isGrounded) player.animTime += dt * 10;
        } else {
            // Return to idle stance
            if (player.isGrounded) {
                if (Math.sin(player.animTime) > 0.1) player.animTime += dt * 10; 
                else player.animTime = 0;
            }
        }

        // Vertical Movement (Gravity & Jumping)
        const gravity = 40;
        const jumpForce = 15;
        
        player.velY -= gravity * dt;
        player.pos.y += player.velY * dt;
        
        // Resolve Collisions (Trees)
        // Player radius approx 0.3
        terrainManager.resolveCollision(player.pos, 0.3);

        // Ground Check
        const terrainHeight = terrainManager.getHeightAt(player.pos.x, player.pos.z);
        
        if (player.pos.y <= terrainHeight) {
            player.pos.y = terrainHeight;
            player.velY = 0;
            player.isGrounded = true;
        } else {
            player.isGrounded = false;
        }

        // Jumping
        if (input && input.actions && input.actions.a && player.isGrounded) {
            player.velY = jumpForce;
            player.isGrounded = false;
        }

        // Action: Shake Tree (X button)
        if (input && input.actions && input.actions.x) {
            // Debounce or just check nearby
            const tree = terrainManager.findTreeNearby(player.pos, 1.5);
            if (tree) {
                const drop = terrainManager.shakeTree(tree.id, {x: tree.x, z: tree.z});
                if (drop) {
                    // Item spawned
                    // Animate tree shake? (Visuals handled in terrain or here)
                }
            }
        }

        // Action: Spellbook (Y Button) - Host
        if (input && input.actions && input.actions.y) {
             const sb = document.getElementById('spellbook');
             // Simple toggle logic (checking display style is naive but works for single user view)
             // For split screen, we only show for the local user viewing the screen.
             // Since Host is P1, we show it on the main screen.
             if (sb.style.display === 'none' || !sb.style.display) {
                 updateSpellbookUI(player.knownSpells);
                 sb.style.display = 'flex';
             }
        }
        
        // Item Pickup
        // Iterate backwards
        for (let j = terrainManager.droppedItems.length - 1; j >= 0; j--) {
            const item = terrainManager.droppedItems[j];
            const dx = player.pos.x - item.x;
            const dz = player.pos.z - item.z;
            if (dx*dx + dz*dz < 1.0) { // Pickup radius
                // Collect
                terrainManager.removeitem(item.id);
                player.inventory.branches++;
                // Sync to this player (if not host)? We sync inventory via state maybe?
                // Or just keep host authoritative
            }
        }
        
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
            player.isMoving = player.targetState.isMoving;

            // Sync Inventory & Spells
            player.inventory = player.targetState.inventory;
            player.knownSpells = player.targetState.knownSpells;
            
            // Sync Speech Bubble (if passed in state - OR - we rely on events)
            // For now, simpler to check if text changed in state, but we used events for voice matching.
            // Let's rely on `handleVoiceInput` visual for local, but Host needs to broadcast speech text for everyone to see.
            // See "Broadcast State" section below.
            
            // Actually, we should check `lastSpeech` from state to show bubble
            if (player.targetState.lastSpeech && player.targetState.lastSpeech !== player.lastSyncedSpeech) {
                updateSpeechBubble(player, player.targetState.lastSpeech);
                player.lastSyncedSpeech = player.targetState.lastSpeech;
            }
        }

        // Send Voice Queue
        while (inputManager.spellQueue.length > 0) {
            const txt = inputManager.spellQueue.shift();
            // Show locally immediately for responsiveness
            updateSpeechBubble(players[myPlayerIndex], txt); 
            // Send to host
            networkManager.sendVoice(txt);
        }
        
        // Client Spellbook Toggle
        const myInput = inputManager.getLocalState(); // Just to check Y button locally
        if (myInput && myInput.actions && myInput.actions.y) {
             const sb = document.getElementById('spellbook');
             if (sb.style.display === 'none' || !sb.style.display) {
                 updateSpellbookUI(players[myPlayerIndex].knownSpells || []);
                 sb.style.display = 'flex';
             }
        }
    }
    
    // Sync Inventory to UI (Local Player)
    if (players[myPlayerIndex]) {
        const inv = players[myPlayerIndex].inventory;
        if (inv) {
            document.getElementById('inv-branches').innerText = inv.branches;
        }
    }

    // --- Shared Animation Logic (Visuals) ---
    // Uses player.animTime which is either calculated (Host) or synced (Client)
    // We rely on the authoritative isMoving flag for clean transitions
    const parts = player.mesh.userData;
    const legAmp = 0.6;
    const armAmp = 0.5;
    
    if (player.isMoving || (player.animTime > 0.1)) {
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
        const statePacket = {
            players: players.map(p => ({
                pos: p.pos,
                rotY: p.mesh.rotation.y,
                animTime: p.animTime,
                isMoving: p.isMoving, 
                inventory: p.inventory,
                knownSpells: p.knownSpells,
                // Send current speech text if active so clients can see it
                lastSpeech: p.speechBubble ? p.speechBubble.material.map.source.data.textContent : null // Hacky, better to store text on player
            })),
            items: terrainManager.droppedItems.map(i => ({ id: i.id, x: i.x, y: i.y, z: i.z, type: i.type }))
        };
        
        // Store text on player object for the hack above to work cleaner
        players.forEach(p => {
             // If speech timer active, send the text, otherwise null
             if (p.speechTimer > 0 && p.lastText) {
                 // We need to inject this into the packet we just made...
                 // Or just modify the map above. Let's fix updateSpeechBubble to store text.
             }
        });
        
        // Redoing the map to include lastSpeech correctly
        statePacket.players = players.map(p => ({
            pos: p.pos,
            rotY: p.mesh.rotation.y,
            animTime: p.animTime,
            isMoving: p.isMoving,
            inventory: p.inventory,
            knownSpells: p.knownSpells,
            lastSpeech: (p.speechTimer > 0) ? p.lastText : null 
        }));

        networkManager.broadcastState(statePacket);
        
        terrainManager.update(players.map(p => p.pos));
        
        // Auto Save Periodically (every 5 seconds roughly)
        if (Math.floor(Date.now() / 1000) % 5 === 0) {
            saveGame();
        }

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

function saveGame() {
    if (!isHost) return;
    
    // Save all player data
    const pData = {
        'host': { 
            inventory: players[0].inventory,
            knownSpells: players[0].knownSpells,
            pos: players[0].pos
        }
    };
    // Save connected peers (using their index as key for this session)
    for(let i=1; i<players.length; i++) {
        if(players[i]) {
            pData[`p${i}`] = {
                inventory: players[i].inventory,
                knownSpells: players[i].knownSpells,
                pos: players[i].pos
            };
        }
    }

    const data = {
        worldId: worldId,
        seed: worldSeed,
        timestamp: Date.now(),
        players: pData,
        items: terrainManager.droppedItems.map(i => ({ id: i.id, x: i.x, y: i.y, z: i.z, type: i.type })),
        treeState: Array.from(terrainManager.treeState.entries())
    };
    
    localStorage.setItem(`farm_save_${saveSlot}`, JSON.stringify(data));
    console.log("Host Saved Game");
}

function saveLocalChar() {
    if (!players[myPlayerIndex]) return;
    if (!worldId) return;

    const data = {
        inventory: players[myPlayerIndex].inventory,
        timestamp: Date.now()
    };
    localStorage.setItem(`farm_char_${worldId}`, JSON.stringify(data));
    console.log("Client Saved Local Char");
}

function setupEscMenu() {
    const menu = document.getElementById('esc-menu');
    
    // Key Listener
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
        }
    });

    document.getElementById('btn-resume').onclick = () => {
        menu.style.display = 'none';
    };
    
    document.getElementById('btn-save').onclick = () => {
        if (isHost) saveGame();
        else saveLocalChar();
        alert("Game Saved!");
        menu.style.display = 'none';
    };
    
    document.getElementById('btn-quit').onclick = () => {
        if (isHost) {
            saveGame();
            networkManager.broadcastQuit();
        } else {
            saveLocalChar();
        }
        window.location.reload();
    };
}

init();