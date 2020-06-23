import * as StackBlur from './js/stackblur/stackblur-es.min.js';

export default class ImageLoader {
  constructor({ width, height }) {

    this.imageCanvasElem = document.createElement('canvas');
    this.imageCanvasElem.id = 'terrainImageCanvas';
    this.imageCanvasElem.width = width;
    this.imageCanvasElem.height = height;
    this.imageCanvasElemContext = this.imageCanvasElem.getContext('2d');

    this.scaledImageObj = new Image();
    this.origImageObj = new Image();
    this.scaledImageObj.id = 'scaledTerrainImage';

  }

  __getPointsData(points, terrainImageData) {
    let maxVal = 0;
    let { width, height } = this.imageCanvasElem;
    // debugger;
    points = points.map(([x, y, z]) => {
        const radius = Math.min(x, y, z);
        let x_max = x + radius;
        let x_min = x - radius;
        let z_max = z + radius;
        let z_min = z - radius;
        maxVal = Math.max(x_max, y, z_max, maxVal);
        return { x, y, z, radius, x_max, x_min, z_max, z_min };
    });
    points.forEach((point) =>
        Object.keys(point).forEach((key) => point[key] /= maxVal));

    function smoothstep(min, max, value) {
        var x = Math.max(0, Math.min(1, (value-min)/(max-min)));
        return x*x*(3 - 2*x);
    };

    function getHeight(min, max, value) {
        return smoothstep(min, (max + min) / 2, value) *
            smoothstep(max, (max + min) / 2, value);
    };

    // let terrainImageData = new Uint8ClampedArray(width * height * 4);
    points.forEach(({ y, x_max, x_min, z_max, z_min }) => {
        for (let z = 0; z < width; ++z) {
            for (let x = 0; x < height; ++x) {
                const yx = getHeight(x_min, x_max, x / height);
                const yz = getHeight(z_min, z_max, z / width);
                const imageHeight = yx * yz * y / points.length * 255;
                const i = (z * height + x) * 4;
                terrainImageData[i + 0] += imageHeight;
                terrainImageData[i + 1] += imageHeight;
                terrainImageData[i + 2] += imageHeight;
                terrainImageData[i + 3] = 255;
            }
        }
    });
    return terrainImageData
  }

  load({ src, points, preblur }) {
    let { width, height } = this.imageCanvasElem;

    return new Promise(resolve => {
      if (src === undefined) {
        let imageData = this.imageCanvasElemContext.getImageData(0, 0, width, height);
        this.__getPointsData(points, imageData.data);
        this.imageCanvasElemContext.putImageData(imageData, 0, 0);
        StackBlur.imageDataRGBA(imageData, 0, 0, width, height, preblur);
        resolve(imageData.data)
      } else {
        this.scaledImageObj.onload = function () {
          // StackBlur.imageDataRGBA(this.imageCanvasElemContext.getImageData(0, 0, 256, 256).data, 0, 0, 256, 256, 10);
          // console.log(StackBlur.image('scaledTerrainImage', 'terrainImageCanvas', 100.0, false))
          StackBlur.image(this.scaledImageObj, this.imageCanvasElem, preblur, false);
          resolve(this.imageCanvasElemContext.getImageData(0, 0, width, height).data);
        }.bind(this);
        this.origImageObj.onload = function () {
            this.imageCanvasElemContext.drawImage(this.origImageObj, 0, 0, width, height);
            this.scaledImageObj.src = this.imageCanvasElem.toDataURL();
        }.bind(this);
        this.origImageObj.src = src;
      }
    });
  }

}