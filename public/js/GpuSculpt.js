import Shaders from "../shaders.js";
import * as THREE from "../build/three.module.js";

const ADD = 1;
const REMOVE = 2;

export default class GpuSkulpt {
  constructor({ mesh, renderer, size, res, proxyRes }) {

    this.__mesh = mesh;
    this.__renderer = renderer;
    this.__size = size || 6;
    this.__halfSize = this.__size / 2.0;
    this.__res = res || 256;
    this.__proxyRes = proxyRes || 64 || this.__res;
    this.__gridSize = this.__size / this.__res;
    this.__texelSize = 1.0 / this.__res;
    this.__imageProcessedData = new Float32Array(4 * this.__res * this.__res);
    this.__isSculpting = false;
    this.__sculptUvPos = new THREE.Vector2();
    this.__cursorHoverColor = new THREE.Vector3(0.4, 0.4, 0.4);
    this.__cursorAddColor = new THREE.Vector3(0.3, 0.5, 0.1);
    this.__cursorRemoveColor = new THREE.Vector3(0.5, 0.2, 0.1);
    this.__shouldClear = false;
    
    this.__supportsTextureFloatLinear = this.__renderer.getContext().getExtension('OES_texture_float_linear') !== null;

    this.__floatRgbParams = {
      minFilter: this.__supportsTextureFloatLinear ? THREE.LinearFilter : THREE.NearestFilter,
      magFilter: this.__supportsTextureFloatLinear ? THREE.LinearFilter : THREE.NearestFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      format: THREE.RGBFormat,
      stencilBuffer: false,
      depthBuffer: false,
      type: THREE.FloatType
    }

    this.__nearestFloatRgbaParams = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      format: THREE.RGBAFormat,
      stencilBuffer: false,
      depthBuffer: false,
      type: THREE.FloatType
    };

    this.__setupRttScene();

    //setup a reset material for clearing render targets
    this.__clearMaterial = new THREE.ShaderMaterial({
      uniforms: {
          uColor: { type: 'v4', value: new THREE.Vector4() }
      },
      vertexShader: Shaders.vert['passUv'],
      fragmentShader: Shaders.frag['setColor']
    });
    this.__setupRttRenderTargets();
    this.__setupShaders();
    this.__setupVtf();

    //create a DataTexture, with filtering type based on whether linear filtering is available
    if (this.__supportsTextureFloatLinear) {
      //use linear with mipmapping
      this.__imageDataTexture = new THREE.DataTexture(null, this.__res, this.__res, THREE.RGBAFormat, THREE.FloatType, undefined, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.LinearFilter, THREE.LinearMipMapLinearFilter);
      this.__imageDataTexture.generateMipmaps = true;
    } else {
      //resort to nearest filter only, without mipmapping
      this.__imageDataTexture = new THREE.DataTexture(null, this.__res, this.__res, THREE.RGBAFormat, THREE.FloatType, undefined, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.NearestFilter, THREE.NearestFilter);
      this.__imageDataTexture.generateMipmaps = false;
    }
  };

  __setupRttScene() {
    //create a RTT scene
    this.__rttScene = new THREE.Scene();
    //create an orthographic RTT camera
    let far = 10000;
    let near = -far;
    this.__rttCamera = new THREE.OrthographicCamera(-this.__halfSize, this.__halfSize, this.__halfSize, -this.__halfSize, near, far);
    //create a quad which we will use to invoke the shaders
    this.__rttQuadGeom = new THREE.PlaneGeometry(this.__size, this.__size);
    this.__rttQuadMesh = new THREE.Mesh(this.__rttQuadGeom, this.__skulptMaterial);
    this.__rttScene.add(this.__rttQuadMesh);
  };
    
  __setupRttRenderTargets() {
    //create RTT render targets (we need two to do feedback)
    this.__rttRenderTarget1 = new THREE.WebGLRenderTarget(this.__res, this.__res, this.__floatRgbParams);
    this.__rttRenderTarget2 = this.__rttRenderTarget1.clone();
    //create a RTT render target for storing the combine results of all layers
    this.__rttCombinedLayer = this.__rttRenderTarget1.clone();
    //create RTT render target for storing proxy terrain data
    this.__rttProxyRenderTarget = new THREE.WebGLRenderTarget(this.__proxyRes, this.__proxyRes, this.__floatRgbParams);
    //create another RTT render target encoding float to 4-byte data
    this.__rttFloatEncoderRenderTarget = new THREE.WebGLRenderTarget(this.__res, this.__res, this.__nearestFloatRgbaParams);
  };

  __setupShaders() {
    
    this.__skulptMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uBaseTexture: { type: 't', value: null },
        uSculptTexture1: { type: 't', value: null },
        uTexelSize: { type: 'v2', value: new THREE.Vector2(this.__texelSize, this.__texelSize) },
        uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.__size / this.__res, this.__size / this.__res) },
        uIsSculpting: { type: 'i', value: 0 },
        uSculptPos: { type: 'v2', value: new THREE.Vector2() },
        uSculptAmount: { type: 'f', value: 0.05 },
        uSculptRadius: { type: 'f', value: 0.1 }
      },
      vertexShader: Shaders.vert['passUv'],
      fragmentShader: Shaders.frag['skulpt']
    });
    
    this.__combineTexturesMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTexture1: { type: 't', value: null },
        uTexture2: { type: 't', value: null }
      },
      vertexShader: Shaders.vert['passUv'],
      fragmentShader: Shaders.frag['combineTextures']
    });

  };
  
  __setupVtf() {
    this.__mesh.material = new THREE.ShaderMaterial({
      uniforms: {
        uLightDirection: { type: 'v3', value: new THREE.Vector3() },
        uAmbientLightIntensity: { type: 'f', value: null },
        uImageTexture: { type: 't', value: null },
        uTexture: { type: 't', value: null },
        uTexelSize: { type: 'v2', value: new THREE.Vector2(1.0 / this.__res, 1.0 / this.__res) },
        uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.__gridSize, this.__gridSize) },
        uHeightMultiplier: { type: 'f', value: 1.0 },
        uBaseColor: { type: 'v3', value: new THREE.Vector3(0.6, 0.8, 0.0) },
        uShowCursor: { type: 'i', value: 0 },
        uCursorPos: { type: 'v2', value: new THREE.Vector2() },
        uCursorRadius: { type: 'f', value: 0.1 },
        uCursorColor: { type: 'v3', value: new THREE.Vector3() }
      },
      vertexShader: Shaders.vert['heightMap'],
      fragmentShader: Shaders.frag['lambertCursor'],
    });
  };
  
  loadFromImageData(data, amount) {
    //convert data from Uint8ClampedArray to Float32Array so that DataTexture can use
    let normalizedHeight;
    let min = 99999;
    let i, len;
    for (i = 0, len = this.__imageProcessedData.length; i < len; i++) {
      normalizedHeight = data[i] / 255.0;
      this.__imageProcessedData[i] = normalizedHeight * amount;
      //store min
      if (this.__imageProcessedData[i] < min) {
        min = this.__imageProcessedData[i];
      }
    }
    //shift down so that min is at 0
    for (i = 0, len = this.__imageProcessedData.length; i < len; i++) {
      this.__imageProcessedData[i] -= min;
    }
    //assign data to DataTexture
    this.__imageDataTexture.image.data = this.__imageProcessedData;
    this.__imageDataTexture.needsUpdate = true;
    this.__skulptMaterial.uniforms['uBaseTexture'].value = this.__imageDataTexture;
    this.__combineTexturesMaterial.uniforms['uTexture1'].value = this.__imageDataTexture;
    this.__updateCombinedLayers = true;
  };

  __setShaderAndRender(shader, renderTarget) {
    this.__rttQuadMesh.material = shader;
    this.__renderer.setRenderTarget(renderTarget);
    this.__renderer.clear();
    this.__renderer.render(this.__rttScene, this.__rttCamera);
    this.__renderer.setRenderTarget(null);
  };

  update() {
    //have to set flags from other places and then do all steps at once during update
    //clear sculpts if necessary
    if (this.__shouldClear) {
      this.__clearMaterial.uniforms['uColor'].value.set(0.0, 0.0, 0.0, 0.0);
      this.__setShaderAndRender(this.__clearMaterial, this.__rttRenderTarget1);
      this.__setShaderAndRender(this.__clearMaterial, this.__rttRenderTarget2);
      this.__shouldClear = false;
      this.__updateCombinedLayers = true;
    }

    //do the main sculptings
    if (this.__isSculpting) {
      this.__skulptMaterial.uniforms['uBaseTexture'].value = this.__imageDataTexture;
      this.__skulptMaterial.uniforms['uSculptTexture1'].value = this.__rttRenderTarget2.texture;
      this.__skulptMaterial.uniforms['uIsSculpting'].value = this.__isSculpting;
      this.__skulptMaterial.uniforms['uSculptPos'].value.copy(this.__sculptUvPos);
      this.__setShaderAndRender(this.__skulptMaterial, this.__rttRenderTarget1);
      this.__swapRenderTargets();
      this.__isSculpting = false;
      this.__updateCombinedLayers = true;
    }

    //combine layers into one
    if (this.__updateCombinedLayers) {  //this can be triggered somewhere else without sculpting
      this.__combineTexturesMaterial.uniforms['uTexture1'].value = this.__imageDataTexture;
      this.__combineTexturesMaterial.uniforms['uTexture2'].value = this.__rttRenderTarget2.texture;
      this.__setShaderAndRender(this.__combineTexturesMaterial, this.__rttCombinedLayer)
      this.__updateCombinedLayers = false;
      //need to rebind rttCombinedLayer to uTexture
      this.__mesh.material.uniforms['uTexture'].value = this.__rttCombinedLayer.texture;
    }
  };
  
  __swapRenderTargets() {
    let temp = this.__rttRenderTarget1;
    this.__rttRenderTarget1 = this.__rttRenderTarget2;
    this.__rttRenderTarget2 = temp;
  };

  showCursor() {
    this.__mesh.material.uniforms['uShowCursor'].value = 1;
  };

  hideCursor() {
    this.__mesh.material.uniforms['uShowCursor'].value = 0;
  };
  
  updateCursor(position) {
    this.__sculptUvPos.x = (position.x + this.__halfSize) / this.__size;
    this.__sculptUvPos.y = (position.z + this.__halfSize) / this.__size;
    this.__mesh.material.uniforms['uCursorPos'].value.set(this.__sculptUvPos.x, this.__sculptUvPos.y);
    this.__mesh.material.uniforms['uCursorColor'].value.copy(this.__cursorHoverColor);
  };
  
  sculpt(type, position) {
    this.__isSculpting = true;
    this.__sculptUvPos.x = (position.x + this.__halfSize) / this.__size;
    this.__sculptUvPos.y = (position.z + this.__halfSize) / this.__size;
    if (type === 1) {
        this.__mesh.material.uniforms['uCursorColor'].value.copy(this.__cursorAddColor);
    } else if (type === 2) {
        this.__mesh.material.uniforms['uCursorColor'].value.copy(this.__cursorRemoveColor);
    }
  };

  setTexture(texture) {
    this.__mesh.material.uniforms['uImageTexture'].value = texture;
  };

  getSculptDisplayTexture() {
    return this.__rttCombinedLayer.texture;
  };

  clear() {
    this.__shouldClear = true;
  };
  
  setBrushSize(size) {
    let normSize = size / (this.__size * 2.0);
    this.__skulptMaterial.uniforms['uSculptRadius'].value = normSize;
    this.__mesh.material.uniforms['uCursorRadius'].value = normSize;
  };
  
  setBrushAmount(amount) {
    this.__skulptMaterial.uniforms['uSculptAmount'].value = amount;
  };
  
  setAmbientLightIntensity(intencity) {
    this.__mesh.material.uniforms['uAmbientLightIntensity'].value = intencity;
  };

  setLightDirection(dir) {
    this.__mesh.material.uniforms['uLightDirection'].value.copy(dir);
  };

  static get ADD() {
    return ADD;
  }

  static get REMOVE() {
    return REMOVE;
  }

}
