import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

export class TerrainManager {
    constructor(scene) {
        this.scene = scene;
        this.noise2D = createNoise2D();
        this.chunks = new Map();
        this.chunkSize = 100;
        this.resolution = 32; // Vertices per chunk edge
        
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
        for (const [key, mesh] of this.chunks) {
            if (!activeKeys.has(key)) {
                this.scene.remove(mesh);
                // Dispose geometry to free memory, but we use cloned geometry so be careful.
                // Since we modify heights, we cloned it.
                mesh.geometry.dispose();
                this.chunks.delete(key);
            }
        }
    }

    createChunk(key) {
        const [cx, cz] = key.split(',').map(Number);
        const chunkGroup = new THREE.Group();
        chunkGroup.position.set(cx * this.chunkSize, 0, cz * this.chunkSize);

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
        // Simple deterministic random based on chunk coord
        const seed = Math.abs(Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453);
        const treeCount = Math.floor((seed - Math.floor(seed)) * 10) + 2; // 2 to 12 trees per chunk

        for(let i=0; i<treeCount; i++) {
            // Local position in chunk
            const rx = (Math.random() - 0.5) * this.chunkSize * 0.8;
            const rz = (Math.random() - 0.5) * this.chunkSize * 0.8;
            
            const worldX = rx + cx * this.chunkSize;
            const worldZ = rz + cz * this.chunkSize;
            
            const y = this.getHeightAt(worldX, worldZ);

            // Simple Tree Geometry
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3, 6), this.treeTrunkMat);
            trunk.position.set(rx, y + 1.5, rz);
            trunk.castShadow = true;
            trunk.receiveShadow = true;

            const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.5, 5, 8), this.treeLeavesMat);
            leaves.position.set(0, 3, 0); // relative to trunk center
            leaves.castShadow = true;
            
            trunk.add(leaves);
            group.add(trunk);
        }
    }
    
    getHeightAt(x, z) {
        // Re-calculate height analytically (matches generation)
        let y = 0;
        y += this.noise2D(x * 0.005, z * 0.005) * 15;
        y += this.noise2D(x * 0.02, z * 0.02) * 2;
        return y;
    }
}