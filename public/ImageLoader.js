import * as StackBlur from './js/stackblur/stackblur-es.min.js';

export default class ImageLoader {
  constructor({ width, height }) {

    this.__width = width;
    this.__height = height;
    this.__imageCanvasElem = document.createElement('canvas');
    this.__imageCanvasElem.id = 'terrainImageCanvas';
    this.__imageCanvasElem.width = width;
    this.__imageCanvasElem.height = height;
    this.__imageCanvasElemContext = this.__imageCanvasElem.getContext('2d');

    this.__scaledImageObj = new Image();
    this.__origImageObj = new Image();
    this.__scaledImageObj.id = 'scaledTerrainImage';

    this.__curSrc = '';

  }

  __getPointsData(points, terrainImageData) {
    let maxVal = 0;
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
      let x = Math.max(0, Math.min(1, (value-min)/(max-min)));
      return x*x*(3 - 2*x);
    };

    function getHeight(min, max, value) {
      return smoothstep(min, (max + min) / 2, value) *
        smoothstep(max, (max + min) / 2, value);
    };

    // clear data
    for (let i = 0; i < terrainImageData.length; i++) {
      terrainImageData[i] = 0;
    }

    // let terrainImageData = new Uint8ClampedArray(width * height * 4);
    points.forEach(({ y, x_max, x_min, z_max, z_min }) => {
      for (let z = 0; z < this.__width; ++z) {
        for (let x = 0; x < this.__height; ++x) {
          const yx = getHeight(x_min, x_max, x / this.__height);
          const yz = getHeight(z_min, z_max, z / this.__width);
          const imageHeight = yx * yz * y / points.length * 255;
          const i = (z * this.__height + x) * 4;
          terrainImageData[i + 0] += imageHeight;
          terrainImageData[i + 1] += imageHeight;
          terrainImageData[i + 2] += imageHeight;
          terrainImageData[i + 3] = 255;
        }
      }
    });
  }

  load({ src, points, preblur }) {
    this.__curSrc = src;

    return new Promise(resolve => {
      this.__scaledImageObj.onload = function () {
        this.changePreBlur(preblur)
        resolve(this.__imageCanvasElemContext.getImageData(0, 0, this.__width, this.__height).data);
      }.bind(this);
      if (src === 'points') {
        let imageData = this.__imageCanvasElemContext.getImageData(0, 0, this.__width, this.__height);
        this.__getPointsData(points, imageData.data);
        this.__imageCanvasElemContext.putImageData(imageData, 0, 0);
        this.__scaledImageObj.src = this.__imageCanvasElem.toDataURL();
      } else {
        this.__origImageObj.onload = function () {
            this.__imageCanvasElemContext.drawImage(this.__origImageObj, 0, 0, this.__width, this.__height);
            this.__scaledImageObj.src = this.__imageCanvasElem.toDataURL();
        }.bind(this);
        this.__origImageObj.src = src;
      }
    });
  }

  getData() {
    return this.__imageCanvasElemContext.getImageData(0, 0, this.__width, this.__height).data;
  }
  
  changePreBlur(preblur) {
    StackBlur.image(this.__scaledImageObj, this.__imageCanvasElem, preblur, false);
  }
}