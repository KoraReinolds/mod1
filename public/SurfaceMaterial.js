import {
  TextureLoader,
  MeshPhongMaterial,
} from "../../../build/three.module.js";

class SurfaceMaterial extends MeshPhongMaterial {
  constructor() {
    super();

    const loader = new TextureLoader();
    const textureMap = loader.load('textures/SandBig.jpg');
    const normalMap = loader.load('textures/Ground_Normal.jpg');
    // textureMap.wrapS = textureMap.wrapT = RepeatWrapping;
    // normalMap.wrapS = normalMap.wrapT = RepeatWrapping;
    this.map = textureMap;
    this.normalMap = normalMap;
    this.needsUpdate = true;

  }
}

export default SurfaceMaterial;