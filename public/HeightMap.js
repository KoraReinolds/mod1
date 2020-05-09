import {
} from "../../../build/three.module.js";
import CustomGeometry from "./CustomGeometry.js";

class HeightMap extends CustomGeometry {
  constructor(params) {
    super(params);
    this.map = {
      ...params,
      points: Array.from(new Array(params.x + 1),
      () => Array.from(new Array(params.z + 1),
      () => { return { max: 0, min: 0, points: [] } })),
    }
  }

  setHeight() {
    const map = this.map;
    for (let z = 0; z < map.z; ++z) {
      for (let x = 0; x < map.x; ++x) {
        const height = (x == 0 || x == map.x - 1) ? 0 : map.y * map.data[[x + z * (map.x)] * 4] / 255;
        this.attributes.position.array[(z * (map.x + 1) + x) * 3 + 1] = height;
      }
    }
    this.computeVertexNormals();
  }

}

export default HeightMap;