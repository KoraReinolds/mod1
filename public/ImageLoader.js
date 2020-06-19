export default class ImageLoader {
  constructor({ src, width, height }) {

    this.imageCanvasElem = document.createElement('canvas');
    this.imageCanvasElem.id = 'terrainImageCanvas';
    this.imageCanvasElem.width = width;
    this.imageCanvasElem.height = height;
    this.imageCanvasElemContext = this.imageCanvasElem.getContext('2d');

    this.scaledImageObj = new Image();
    this.origImageObj = new Image();
    this.scaledImageObj.id = 'scaledTerrainImage';

  }

  load(src) {
    return new Promise(resolve => {
      this.scaledImageObj.onload = function () {
        resolve(this.imageCanvasElemContext.getImageData(0, 0, 256, 256).data);
      }.bind(this);
      this.origImageObj.onload = function () {
          this.imageCanvasElemContext.drawImage(this.origImageObj, 0, 0, 256, 256);
          this.scaledImageObj.src = this.imageCanvasElem.toDataURL();
      }.bind(this);
      this.origImageObj.src = src;
    });
  }

}