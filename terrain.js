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
        const gridTexture = textureLoader.load('./ground_grid.png');
        gridTexture.wrapS = THREE.RepeatWrapping;
        gridTexture.wrapT = THREE.RepeatWrapping;
        gridTexture.repeat.set(4, 4);

        this.material = new THREE.MeshStandardMaterial({
            map: gridTexture,
            color: 0x444444,
            emissive: 0x001122,
            emissiveIntensity: 0.2,
            roughness: 0.4,
            metalness: 0.8,
            wireframe: false,
            side: THREE.DoubleSide
        });

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
        
        // Clone base geometry to modify vertices
        const geometry = this.baseGeometry.clone();
        const posAttribute = geometry.attributes.position;
        const vertex = new THREE.Vector3();

        for (let i = 0; i < posAttribute.count; i++) {
            vertex.fromBufferAttribute(posAttribute, i);
            
            // World coordinates
            const worldX = vertex.x + cx * this.chunkSize;
            const worldZ = vertex.z + cz * this.chunkSize;
            
            // Height generation
            let y = 0;
            // Base large hills
            y += this.noise2D(worldX * 0.01, worldZ * 0.01) * 10;
            // Detailed noise
            y += this.noise2D(worldX * 0.05, worldZ * 0.05) * 2;
            
            // Make center path flatter (optional, maybe not for endless)
            
            posAttribute.setY(i, y);
        }
        
        geometry.computeVertexNormals();

        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.position.set(cx * this.chunkSize, 0, cz * this.chunkSize);
        mesh.receiveShadow = true;
        
        this.scene.add(mesh);
        this.chunks.set(key, mesh);
    }
    
    getHeightAt(x, z) {
        // Re-calculate height analytically for physics (matches generation)
        let y = 0;
        y += this.noise2D(x * 0.01, z * 0.01) * 10;
        y += this.noise2D(x * 0.05, z * 0.05) * 2;
        return y;
    }
}