import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

// Simple seeded RNG (Mulberry32)
function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

export class TerrainManager {
    constructor(scene, seed) {
        this.scene = scene;
        this.seed = seed || 12345;
        this.rng = mulberry32(this.seed);
        this.noise2D = createNoise2D(this.rng);
        this.chunks = new Map();
        this.chunkSize = 100;
        this.resolution = 32; // Vertices per chunk edge
        
        // State for persistence
        this.treeState = new Map(); // Key: "cx,cz,index", Value: { shaken: true/false }
        this.droppedItems = []; // Array of { id, x, y, z, type, mesh }
        
        // Material
        const textureLoader = new THREE.TextureLoader();
        const grassTexture = textureLoader.load('./asset_grass.png');
        grassTexture.wrapS = THREE.RepeatWrapping;
        grassTexture.wrapT = THREE.RepeatWrapping;
        grassTexture.repeat.set(8, 8);
        grassTexture.colorSpace = THREE.SRGBColorSpace;

        this.material = new THREE.MeshStandardMaterial({
            map: grassTexture,
            color: 0x88bb88,
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.DoubleSide
        });

        // Tree Materials
        this.treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 1.0 });
        this.treeLeavesMat = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.8 });
        
        // Item Materials
        this.branchMat = new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 1.0 });

        // Reusable geometry for cloning
        this.baseGeometry = new THREE.PlaneGeometry(this.chunkSize, this.chunkSize, this.resolution, this.resolution);
        this.baseGeometry.rotateX(-Math.PI / 2);

        // Reusable geometry for cloning
        this.baseGeometry = new THREE.PlaneGeometry(this.chunkSize, this.chunkSize, this.resolution, this.resolution);
        this.baseGeometry.rotateX(-Math.PI / 2);
    }

    getChunkKey(x, z) {
        return `${x},${z}`;
    }

    update(playerPositions) {
        const activeKeys = new Set();
        
        // Determine which chunks should be visible based on player positions
        playerPositions.forEach(pos => {
            const cx = Math.floor(pos.x / this.chunkSize);
            const cz = Math.floor(pos.z / this.chunkSize);
            const range = 2; // Render radius in chunks

            for (let x = -range; x <= range; x++) {
                for (let z = -range; z <= range; z++) {
                    activeKeys.add(this.getChunkKey(cx + x, cz + z));
                }
            }
        });

        // Create new chunks
        activeKeys.forEach(key => {
            if (!this.chunks.has(key)) {
                this.createChunk(key);
            }
        });

        // Remove old chunks
        for (const [key, chunkGroup] of this.chunks) {
            if (!activeKeys.has(key)) {
                this.scene.remove(chunkGroup);
                
                // Cleanup memory for all meshes in the chunk group (terrain + trees)
                chunkGroup.traverse((child) => {
                    if (child.isMesh && child.geometry) {
                        child.geometry.dispose();
                    }
                });
                
                this.chunks.delete(key);
            }
        }
    }

    createChunk(key) {
        const [cx, cz] = key.split(',').map(Number);
        const chunkGroup = new THREE.Group();
        chunkGroup.position.set(cx * this.chunkSize, 0, cz * this.chunkSize);
        chunkGroup.userData = { trees: [] }; // Store tree collision data

        // Clone base geometry to modify vertices
        const geometry = this.baseGeometry.clone();
        const posAttribute = geometry.attributes.position;
        const vertex = new THREE.Vector3();

        for (let i = 0; i < posAttribute.count; i++) {
            vertex.fromBufferAttribute(posAttribute, i);
            
            // World coordinates
            const worldX = vertex.x + cx * this.chunkSize;
            const worldZ = vertex.z + cz * this.chunkSize;
            
            // Height generation - Gentler rolling hills for farm
            let y = 0;
            y += this.noise2D(worldX * 0.005, worldZ * 0.005) * 15; // Large gentle hills
            y += this.noise2D(worldX * 0.02, worldZ * 0.02) * 2;   // Small detail
            
            posAttribute.setY(i, y);
        }
        
        geometry.computeVertexNormals();

        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.receiveShadow = true;
        mesh.castShadow = false; // Ground usually doesn't need to cast shadows on itself in simple setups
        chunkGroup.add(mesh);

        // Add Trees
        this.populateTrees(chunkGroup, cx, cz);
        
        this.scene.add(chunkGroup);
        this.chunks.set(key, chunkGroup);
    }

    populateTrees(group, cx, cz) {
        // Chunk-specific seeded RNG for deterministic placement
        const chunkSeed = (this.seed + cx * 5915587277 + cz * 1500450271) | 0;
        const chunkRng = mulberry32(chunkSeed);

        const treeCount = Math.floor(chunkRng() * 10) + 2; 

        for(let i=0; i<treeCount; i++) {
            const rx = (chunkRng() - 0.5) * this.chunkSize * 0.8;
            const rz = (chunkRng() - 0.5) * this.chunkSize * 0.8;
            
            const worldX = rx + cx * this.chunkSize;
            const worldZ = rz + cz * this.chunkSize;
            const y = this.getHeightAt(worldX, worldZ);

            const treeId = `${cx},${cz},${i}`;
            const isShaken = this.treeState.get(treeId)?.shaken || false;

            // Visuals
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3, 6), this.treeTrunkMat);
            trunk.position.set(rx, y + 1.5, rz);
            trunk.castShadow = true;
            trunk.receiveShadow = true;
            trunk.userData = { id: treeId, type: 'tree' };

            const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.5, 5, 8), this.treeLeavesMat);
            leaves.position.set(0, 3, 0); 
            leaves.castShadow = true;
            
            if (isShaken) {
                // Visual indication tree was shaken (e.g., slightly smaller leaves or color tint)
                leaves.scale.set(0.9, 0.9, 0.9);
            }

            trunk.add(leaves);

            const s = 0.8 + chunkRng() * 0.5;
            trunk.scale.set(s, s, s);

            group.add(trunk);
            
            // Register collision data
            // radius ~ 0.7 (scaled)
            group.userData.trees.push({ x: worldX, z: worldZ, r: 0.7 * s, mesh: trunk, id: treeId });
        }
    }

    // --- Physics / Interaction ---

    resolveCollision(pos, radius) {
        // Simple circle collision against active trees
        const cx = Math.floor(pos.x / this.chunkSize);
        const cz = Math.floor(pos.z / this.chunkSize);
        
        // Check current and neighbor chunks
        for (let x = -1; x <= 1; x++) {
            for (let z = -1; z <= 1; z++) {
                const key = this.getChunkKey(cx + x, cz + z);
                const chunk = this.chunks.get(key);
                if (chunk && chunk.userData.trees) {
                    for (const tree of chunk.userData.trees) {
                        const dx = pos.x - tree.x;
                        const dz = pos.z - tree.z;
                        const distSq = dx*dx + dz*dz;
                        const minDist = radius + tree.r;
                        
                        if (distSq < minDist * minDist) {
                            const dist = Math.sqrt(distSq);
                            const pen = minDist - dist;
                            // Push out normal
                            if (dist > 0.001) {
                                pos.x += (dx / dist) * pen;
                                pos.z += (dz / dist) * pen;
                            } else {
                                // Direct center overlap, push random
                                pos.x += pen; 
                            }
                        }
                    }
                }
            }
        }
        return pos;
    }

    findTreeNearby(pos, range) {
        const cx = Math.floor(pos.x / this.chunkSize);
        const cz = Math.floor(pos.z / this.chunkSize);

        for (let x = -1; x <= 1; x++) {
            for (let z = -1; z <= 1; z++) {
                const key = this.getChunkKey(cx + x, cz + z);
                const chunk = this.chunks.get(key);
                if (chunk && chunk.userData.trees) {
                    for (const tree of chunk.userData.trees) {
                        const dx = pos.x - tree.x;
                        const dz = pos.z - tree.z;
                        const dist = Math.sqrt(dx*dx + dz*dz);
                        if (dist < range) {
                            return tree;
                        }
                    }
                }
            }
        }
        return null;
    }

    shakeTree(treeId, pos) {
        if (!this.treeState.has(treeId)) this.treeState.set(treeId, { shaken: false });
        // Can only shake once per session? Or drops multiple times? Let's say once for now
        // if (this.treeState.get(treeId).shaken) return null;
        
        // Just always drop for fun, but limit rate? 
        // Let's mark it so we can save it, but allow multi-shake for gameplay fun
        this.treeState.get(treeId).shaken = true;

        // Visual wobble (handled by main loop if we want, or simple local tween)
        
        // Drop Item
        const angle = Math.random() * Math.PI * 2;
        const dist = 1.5;
        const ix = pos.x + Math.cos(angle) * dist;
        const iz = pos.z + Math.sin(angle) * dist;
        
        const item = {
            id: 'item_' + Math.random().toString(36).substr(2, 9),
            x: ix,
            y: this.getHeightAt(ix, iz) + 0.5,
            z: iz,
            type: 'branch'
        };
        this.droppedItems.push(item);
        this.addItemMesh(item);
        return item;
    }

    addItemMesh(item) {
        // Create mesh
        const geo = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 5);
        geo.rotateZ(Math.PI / 2); // Lay flat
        const mesh = new THREE.Mesh(geo, this.branchMat);
        mesh.position.set(item.x, item.y, item.z);
        mesh.rotation.y = Math.random() * Math.PI;
        mesh.castShadow = true;
        
        this.scene.add(mesh);
        item.mesh = mesh;
    }

    removeitem(itemId) {
        const idx = this.droppedItems.findIndex(i => i.id === itemId);
        if (idx !== -1) {
            const item = this.droppedItems[idx];
            if (item.mesh) {
                this.scene.remove(item.mesh);
                item.mesh.geometry.dispose();
            }
            this.droppedItems.splice(idx, 1);
        }
    }
    
    // Sync active items from Host
    syncItems(itemsData) {
        // Naive sync: remove all, re-add all (optimize later)
        // Or diff. For now, since items are few, we can diff by ID.
        
        const currentIds = new Set(this.droppedItems.map(i => i.id));
        const newIds = new Set(itemsData.map(i => i.id));
        
        // Remove active not in new
        [...this.droppedItems].forEach(item => {
            if (!newIds.has(item.id)) this.removeitem(item.id);
        });

        // Add new not in active
        itemsData.forEach(d => {
            if (!currentIds.has(d.id)) {
                // Add
                const newItem = { ...d };
                this.droppedItems.push(newItem);
                this.addItemMesh(newItem);
            }
        });
    }
    
    getHeightAt(x, z) {
        // Re-calculate height analytically (matches generation)
        let y = 0;
        y += this.noise2D(x * 0.005, z * 0.005) * 15;
        y += this.noise2D(x * 0.02, z * 0.02) * 2;
        return y;
    }
}