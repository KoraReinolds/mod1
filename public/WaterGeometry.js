import {
	BufferAttribute,
  BufferGeometry,
} from "../../../build/three.module.js";
import CustomGeometry from './CustomGeometry.js';

class WaterGeometry extends BufferGeometry {

  constructor(map) {
    super();
    this.cube = new CustomGeometry({x: 1, y: 1, z: 1});
    this.map = map;
    this.maxLvl = 1; // reflection plane lvl
    this.maxCubes = map.x * map.y * map.z;
    console.log(this.maxCubes)
    this.indexes = this.getIndexes();
    this.positions = this.getPositions();
    this.uvs = this.getUVs();
    
    this.setIndex(this.indexes);
    this.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(this.positions), 3)
    );
    this.computeVertexNormals()
    this.setAttribute(
      'uv',
      new BufferAttribute(new Float32Array(this.uvs), 2)
    );
    this.attributes.position.needsUpdate = true;
    
    this.points = []
    for (let x = 0; x < this.map.x; x++) {
      for (let y = 0; y < this.map.y; y++) {
        for (let z = 0; z < this.map.z; z++) {
          this.points.push({x, y, z})
        }
      }
    }

    this.drawCubes();

  }

  drawCubes() {
    let cube = 0;
    this.points.forEach((coords) => {
      this.moveCube(cube++, coords);
    });
  }

  moveCube(cube, {x, y, z}) {
    const index = cube * this.cube.positions.length;
    const pos = this.attributes.position.array;
    for (let [i, val] of Object.entries(this.cube.positions)) {
      if ((i + 1) % 3 === 1) {
        pos[+i + index] += x - this.map.x / 2 + 0.5;
      } else if ((i + 1) % 3 === 2) {
        pos[+i + index] += y;
      } else {
        pos[+i + index] += z - this.map.z / 2 + 0.5;
      }
    }
  }

  getUVs() {
    const uvs = []
    for (let cube = 0; cube < this.maxCubes; cube++) {
      for (let i of this.cube.uvs) {
        uvs.push(i);
      }
    }
    return uvs;
  }

  getPositions() {
    const positions = []
    for (let cube = 0; cube < this.maxCubes; cube++) {
      for (let i of this.cube.positions) {
        positions.push(i);
      }
    }
    return positions;
  }

  getIndexes() {
    const indexes = []
    const length = this.cube.positions.length / 3;
    for (let cube = 0; cube < this.maxCubes; cube++) {
      for (let i of this.cube.indexes) {
        indexes.push(cube * length + i);
      }
    }
    return indexes;
  }

}

export default WaterGeometry;