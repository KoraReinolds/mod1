import {
} from "../../../build/three.module.js";
import CustomGeometry from './CustomGeometry.js';

class WaterGeometry extends CustomGeometry {
  constructor(map) {
    super(map);
    
    this.maxLvl = 1;
    this.points = [];
    this.map = map.points;
    this.curLvl = 0;
    this.lvls = Array.from(new Array(map.y), () => []);
    this.initWave(1);
  }

  setMinPoint(x, z, lvl) {
    const bottomPlaneOffset = (this.x + 1) * (this.z + 1);
    this.attributes.position.array[(z * (this.x + 1) + x + bottomPlaneOffset) * 3 + 1] = lvl;
    this.map[x][z].min = lvl;
  }

  setMaxPoint(x, z, lvl) {
    this.attributes.position.array[(z * (this.x + 1) + x) * 3 + 1] = lvl;
  }

  initWave(lvl) {
    if (lvl < this.y) {
      for( let i = 0; i < this.x + 1; i++) {
      // for( let i = 0; i < 1; i++) {
        const x = i;
        const y = lvl;
        const z = 0;
        this.lvls[y].push({ x, z });
        this.points.push({ x, y, z });
        this.setMaxPoint(x, z, y);
      }
    }
  }

  move(countPoints) {
    for ( let i = 0; i < countPoints; i++ ) {
      if (this.points.length && this.maxLvl < this.y) {

        const point = this.points.shift();
        const { x, y, z } = point;
        const curPoint = this.map[x][z];
        const rightPoint = z != this.z ? this.map[x][z + 1] : null;
        const leftPoint = z != 0 ? this. map[x][z - 1] : null;
        const backPoint = x != 0 ? this. map[x - 1][z] : null;
        const fowardPoint = x != this.x ? this.map[x + 1][z] : null;
        this.setMaxPoint(x, z, y);
        
        if (curPoint.min === undefined) {
          this.setMinPoint(x, z, y - 1);
        }
        if (leftPoint && (leftPoint.max < y || leftPoint.max === undefined)) {
          leftPoint.max = y;
          this.points.push({ x, z: z - 1, y });
        }
        if (rightPoint && (rightPoint.max < y || rightPoint.max === undefined)) {
          rightPoint.max = y;
          this.points.push({ x, z: z + 1, y });
        }
        if (backPoint && (backPoint.max < y || backPoint.max === undefined)) {
          backPoint.max = y;
          this.points.push({ x: x - 1, z, y });
        }
        if (fowardPoint && (fowardPoint.max < y || fowardPoint.max === undefined)) {
          fowardPoint.max = y;
          this.points.push({ x: x + 1, z, y });
        }

      } else {
        this.initWave(++this.maxLvl);
      }
      this.attributes.position.needsUpdate = true;
    }
  }

}

export default WaterGeometry;