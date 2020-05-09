import {
	BufferGeometry,
	BufferAttribute,
} from "../../../build/three.module.js";

class CustomGeometry extends BufferGeometry {
  constructor(map) {
    super();
    
    this.x = map.x;
    this.z = map.z;
    this.y = map.y;
    this.map = map;
    this.positions = [];
    this.uvs = [];
    this.indexes = [];

    this.initBuffersTop();
    this.initBuffersBottom();
    this.setTopIndex();
    this.setBottomIndex();
    this.setBackIndex();
    this.setFrontIndex();
    this.setLeftIndex();
    this.setRightIndex();

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
  }

  setTopIndex() {
    for (let z = 0; z < this.z; z++) {
      for (let x = 0; x < this.x; x++) {
        const i = x + z * (this.x + 1);
        const i0 = (i + 0);
        const i1 = (i + 1);
        const i2 = (i + 0) + (this.x + 1);
        const i3 = (i + 1) + (this.x + 1);
        this.indexes.push(...[i0, i2, i1, i2, i3, i1]);
      }
    }
  }
  setBottomIndex() {
    for (let z = 0; z < this.z; z++) {
      for (let x = 0; x < this.x; x++) {
        const i = x + z * (this.x + 1) + (this.x + 1) * (this.z + 1);
        const i0 = (i + 0);
        const i1 = (i + 1);
        const i2 = (i + 0) + (this.x + 1);
        const i3 = (i + 1) + (this.x + 1);
        this.indexes.push(...[i0, i1, i2, i1, i3, i2]);
      }
    }
  }
  setBackIndex() {
    for (let x = 0; x < this.x; x++) {
      const i = x;
      const i0 = (i + 0);
      const i1 = (i + 1);
      const i2 = (i + 0) + (this.x + 1) * (this.z + 1);
      const i3 = (i + 1) + (this.x + 1) * (this.z + 1);
      this.indexes.push(...[i0, i1, i2, i1, i3, i2]);
    }
  }
  setFrontIndex() {
    for (let x = 0; x < this.x; x++) {
      const i = x + this.z * (this.x + 1);
      const i0 = (i + 0);
      const i1 = (i + 1);
      const i2 = (i + 0) + (this.x + 1) * (this.z + 1);
      const i3 = (i + 1) + (this.x + 1) * (this.z + 1);
      this.indexes.push(...[i0, i2, i1, i2, i3, i1]);
    }
  }
  setLeftIndex() {
    for (let z = 0; z < this.z; z++) {
      const i = z * (this.x + 1) + this.x;
      const i0 = (i + 0);
      const i1 = (i + (this.x + 1));
      const i2 = (i + 0) + (this.x + 1) * (this.z + 1);
      const i3 = (i + (this.x + 1)) + (this.x + 1) * (this.z + 1);
      this.indexes.push(...[i0, i1, i2, i1, i3, i2]);
    }
  }
  setRightIndex() {
    for (let z = 0; z < this.z; z++) {
      const i = z * (this.x + 1);
      const i0 = (i + 0);
      const i1 = (i + (this.x + 1));
      const i2 = (i + 0) + (this.x + 1) * (this.z + 1);
      const i3 = (i + (this.x + 1)) + (this.x + 1) * (this.z + 1);
      this.indexes.push(...[i0, i2, i1, i2, i3, i1]);
    }
  }
  initBuffersTop() {
    for (let z = 0; z <= this.z; z++) {
      for (let x = 0; x <= this.x; x++) {
        this.positions.push(x - this.x / 2, -0.1, z - this.z / 2);
        this.uvs.push(x / this.x, z / this.z);
      }
    }
  }
  initBuffersBottom() {
    for (let z = 0; z <= this.z; z++) {
      for (let x = 0; x <= this.x; x++) {
        this.positions.push(x - this.x / 2, -0.1, z - this.z / 2);
        this.uvs.push(x / this.x, z / this.z);
      }
    }
  }
}

export default CustomGeometry;