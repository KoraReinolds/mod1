import {
} from "../../../build/three.module.js";
import CustomGeometry from './CustomGeometry.js';

class SurfaceGeometry extends CustomGeometry {
  constructor({ size, points }) {
    super({ x: size, y: size, z: size });

    this.map = null;

    this.calcMap(size, points);
  }

  calcMap(size, points) {
    points = points.map(([x, y, z]) => {
      const radius = Math.min(x, y, z);
      return {
        x,
        y,
        z,
        radius,
        x_max: x + radius,
        x_min: x - radius,
        z_max: z + radius,
        z_min: z - radius,
      };
    });
    const yMax = Math.max(...points.map((point) => Math.max(point.y)));
    const zMax = Math.max(...points.map((point) => Math.max(point.z_max)));
    const xMax = Math.max(...points.map((point) => Math.max(point.x_max)));
    const maxValue = Math.max( yMax, xMax, zMax );
    const scaleRatio = size / maxValue;
    points.forEach((point) =>
      Object.keys(point).forEach((key) => point[key] *= scaleRatio));
    this.map = {
      x: xMax * scaleRatio,
      y: yMax * scaleRatio,
      z: zMax * scaleRatio,
      points: Array.from(new Array(xMax * scaleRatio + 1),
      () => Array.from(new Array(zMax * scaleRatio + 1),
      () => { return { max: undefined, min: undefined, surf: 0, points: [] } })),
    }
    this.points = points;
  }

  setHeight() {
    const map = this.map;
    const points = this.points;

    function smoothstep(min, max, value) {
      var x = Math.max(0, Math.min(1, (value-min)/(max-min)));
      return x*x*(3 - 2*x);
    };

    function getHeight(min, max, value) {
      return smoothstep(min, (max + min) / 2, value) *
        smoothstep(max, (max + min) / 2, value);
    };

    points.forEach(({ y, x_max, x_min, z_max, z_min }) => {
      for (let z = 0; z <= map.z; ++z) {
        for (let x = 0; x <= map.x; ++x) {
          const yx = getHeight(x_min, x_max, x);
          const yz = getHeight(z_min, z_max, z);
          const height = yx * yz * y / points.length;
          map.points[x][z].surf += height;
          this.attributes.position.array[(z * (map.x + 1) + x) * 3 + 1] += height;
        }
      }
    });
    this.computeVertexNormals();
  }
}

export default SurfaceGeometry;