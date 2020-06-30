import Shaders from "../../../shaders.js";
import * as THREE from "../../../build/three.module.js";

export default class GpuPipeModelWater {
  constructor(options) {

    this.__mesh = options.mesh;
    this.__renderer = options.renderer;
    this.__size = options.size;
    this.__scene = options.scene;
    this.__res = options.res;
    this.__dampingFactor = options.dampingFactor;

    // initial water height
    this.__minWaterHeight = -0.05;
    this.__initialWaterHeight = options.initialWaterHeight || 0.0;
    this.__initialWaterHeight += this.__minWaterHeight;

    //number of full steps to take per frame, to speed up some of algorithms that are slow to propagate at high mesh resolutions.
    //this is different from substeps which are reduces dt per step for stability.
    this.__multisteps = options.multisteps || 1;

    this.__gravity = 9.81;

    this.__halfSize = this.__size / 2.0;
    this.__segmentSize = this.__size / this.__res;
    this.__segmentSizeSquared = this.__segmentSize * this.__segmentSize;
    this.__texelSize = 1.0 / this.__res;

    this.__supportsTextureFloatLinear = this.__renderer.getContext().getExtension('OES_texture_float_linear') !== null;

    this.__floatRgbaParams = {
        minFilter: this.__supportsTextureFloatLinear ? THREE.LinearFilter : THREE.NearestFilter,
        magFilter: this.__supportsTextureFloatLinear ? THREE.LinearFilter : THREE.NearestFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        format: THREE.RGBAFormat,
        stencilBuffer: false,
        depthBuffer: false,
        type: THREE.FloatType
    };

    //create a boundary texture
    this.__boundaryData = new Float32Array(4 * this.__res * this.__res);

    this.__sourceSize = new THREE.Vector2(0.1, 0.1);
    this.__isSourcing = false;
    this.__sourceUvPos = new THREE.Vector2();
    this.__sourceAmount = 0;

    this.__init();
    
    this.__terrainTexture = options.terrainTexture || this.__emptyTexture;


    //some constants
    this.__pipeLength = this.__segmentSize;
    this.__pipeCrossSectionArea = this.__pipeLength * this.__pipeLength;  //square cross-section area
    this.__pipeCrossSectionArea *= this.__res / 10;  //scale according to resolution
    this.__heightToFluxFactorNoDt = this.__pipeCrossSectionArea * this.__gravity / this.__pipeLength;
    this.__maxHorizontalSpeed = 10.0;  //just an arbitrary upper-bound estimate //TODO: link this to cross-section area
    this.__maxDt = this.__segmentSize / this.__maxHorizontalSpeed;  //based on CFL condition
  
  }

  __init() {
    this.__setupRttScene();
    //create an empty texture because the default value of textures does not seem to be 0?
    this.__emptyTexture = new THREE.WebGLRenderTarget(this.__res, this.__res, this.__floatRgbaParams);
    this.__emptyTexture.texture.generateMipmaps = false;

    //create a DataTexture for the boundary, with filtering type based on whether linear filtering is available
    if (this.__supportsTextureFloatLinear) {
      //use linear with mipmapping
      this.__boundaryTexture = new THREE.DataTexture(null, this.__res, this.__res, THREE.RGBAFormat, THREE.FloatType);
      this.__boundaryTexture.generateMipmaps = true;
    } else {
      //resort to nearest filter only, without mipmapping
      this.__boundaryTexture = new THREE.DataTexture(null, this.__res, this.__res, THREE.RGBAFormat, THREE.FloatType, undefined, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.NearestFilter, THREE.NearestFilter);
      this.__boundaryTexture.generateMipmaps = false;
    }

    this.__initDataAndTextures();
    this.__setupRttRenderTargets();
    this.__setupShaders();
    this.__setupVtf();
  }

  __setupRttScene() {
    //create a RTT scene
    this.__rttScene = new THREE.Scene();
    //create an orthographic RTT camera
    let far = 10000;
    let near = -far;
    this.__rttCamera = new THREE.OrthographicCamera(-this.__halfSize, this.__halfSize, this.__halfSize, -this.__halfSize, near, far);
    //create a quad which we will use to invoke the shaders
    this.__rttQuadGeom = new THREE.PlaneGeometry(this.__size, this.__size);
    this.__rttQuadMesh = new THREE.Mesh(this.__rttQuadGeom, this.__waterSimMaterial);
    this.__rttScene.add(this.__rttQuadMesh);
  };

  __initDataAndTextures() {

    let i, j, idx;

    //init everything to 1 first
    for (i = 0; i < this.__boundaryData.length; i++) {
        this.__boundaryData[i] = 1.0;
    }

    //init all boundary values to 0
    j = 0;
    for (i = 0; i < this.__res; i++) {
        idx = 4 * (i + this.__res * j);
        this.__boundaryData[idx] = 0.0;
        this.__boundaryData[idx + 1] = 0.0;
        this.__boundaryData[idx + 2] = 0.0;
        this.__boundaryData[idx + 3] = 0.0;
    }
    j = this.__res - 1;
    for (i = 0; i < this.__res; i++) {
        idx = 4 * (i + this.__res * j);
        this.__boundaryData[idx] = 0.0;
        this.__boundaryData[idx + 1] = 0.0;
        this.__boundaryData[idx + 2] = 0.0;
        this.__boundaryData[idx + 3] = 0.0;
    }
    i = 0;
    for (j = 0; j < this.__res; j++) {
        idx = 4 * (i + this.__res * j);
        this.__boundaryData[idx] = 0.0;
        this.__boundaryData[idx + 1] = 0.0;
        this.__boundaryData[idx + 2] = 0.0;
        this.__boundaryData[idx + 3] = 0.0;
    }
    i = this.__res - 1;
    for (j = 0; j < this.__res; j++) {
        idx = 4 * (i + this.__res * j);
        this.__boundaryData[idx] = 0.0;
        this.__boundaryData[idx + 1] = 0.0;
        this.__boundaryData[idx + 2] = 0.0;
        this.__boundaryData[idx + 3] = 0.0;
    }

    //finally assign data to texture
    this.__boundaryTexture.image.data = this.__boundaryData;
    this.__boundaryTexture.needsUpdate = true;
  
  }

  __setupRttRenderTargets() {
    //create RTT render targets (need two for feedback)
    this.__rttRenderTarget1 = new THREE.WebGLRenderTarget(this.__res, this.__res, this.__floatRgbaParams);
    this.__rttRenderTarget1.texture.generateMipmaps = false;
    this.__rttRenderTarget2 = this.__rttRenderTarget1.clone();
    //create render targets purely for display purposes
    this.__rttWaterDisplay = this.__rttRenderTarget1.clone();
    //create render target for storing the disturbed map (due to interaction with rigid bodes)
    this.__rttDisturbMapRenderTarget = this.__rttRenderTarget1.clone();
    //create RTT render targets for flux (we need two to do feedback)
    this.__rttRenderTargetFlux1 = this.__rttRenderTarget1.clone();
    this.__rttRenderTargetFlux2 = this.__rttRenderTarget1.clone();
    //create another RTT render target for storing the combined terrain + water heights
    this.__rttCombinedHeight = this.__rttRenderTarget1.clone();
  }

  __setupShaders() {

    this.__disturbAndSourceMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { type: 't', value: this.__emptyTexture },
        uIsSourcing: { type: 'i', value: 0 },
        uSourcePos: { type: 'v2', value: new THREE.Vector2(0.5, 0.5) },
        uSourceAmount: { type: 'f', value: this.__sourceAmount },
        uSourceSize: { type: 'v2', value: this.__sourceSize },
        uIsFlooding: { type: 'i', value: 0 },  //for pipe model water only
        uFloodAmount: { type: 'f', value: 0 },  //for pipe model water only
        uWaveHeight: { type: 'f', value: 0 }
      },
      vertexShader: Shaders.vert['passUv'],
      fragmentShader: Shaders.frag['hfWater_disturb']
    });

    this.__waterSimMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTerrainTexture: { type: 't', value: this.__emptyTexture },
        uWaterTexture: { type: 't', value: this.__emptyTexture },
        uFluxTexture: { type: 't', value: this.__emptyTexture },
        uBoundaryTexture: { type: 't', value: this.__emptyTexture },
        uTexelSize: { type: 'v2', value: new THREE.Vector2(this.__texelSize, this.__texelSize) },
        uDampingFactor: { type: 'f', value: this.__dampingFactor },
        uHeightToFluxFactor: { type: 'f', value: 0.0 },
        uSegmentSizeSquared: { type: 'f', value: this.__segmentSizeSquared },
        uDt: { type: 'f', value: 0.0 },
        uMinWaterHeight: { type: 'f', value: this.__minWaterHeight }
      },
      vertexShader: Shaders.vert['passUv'],
      fragmentShader: Shaders.frag['hfWater_pipeModel_calcFlux']
    });

    this.__waterSimMaterial2 = new THREE.ShaderMaterial({
      uniforms: {
        uWaterTexture: { type: 't', value: this.__emptyTexture },
        uFluxTexture: { type: 't', value: this.__emptyTexture },
        uTexelSize: { type: 'v2', value: new THREE.Vector2(this.__texelSize, this.__texelSize) },
        uSegmentSize: { type: 'f', value: this.__segmentSize },
        uDt: { type: 'f', value: 0.0 },
        uMinWaterHeight: { type: 'f', value: this.__minWaterHeight }
      },
      vertexShader: Shaders.vert['passUv'],
      fragmentShader: Shaders.frag['hfWater_pipeModel'],
    });

    this.__calcFinalWaterHeightMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTerrainTexture: { type: 't', value: this.__emptyTexture },
        uWaterTexture: { type: 't', value: this.__emptyTexture },
        uMultiplyTexture: { type: 't', value: this.__emptyTexture },
        uMaskOffset: { type: 'f', value: this.__minWaterHeight }
      },
      vertexShader: Shaders.vert['passUv'],
      fragmentShader: Shaders.frag['hfWater_pipeModel_calcFinalWaterHeight']
    });

    //add flood uniforms into disturb material
    this.__disturbAndSourceMaterial.uniforms['uIsFlooding'] = { type: 'i', value: 0 };
    this.__disturbAndSourceMaterial.uniforms['uFloodAmount'] = { type: 'f', value: this.__floodAmount };
  }

  //Sets up the vertex-texture-fetch for the given mesh
  __setupVtf = function () {
    this.__mesh.material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { type: 't', value: this.__rttRenderTarget1.texture },
        uTexelSize: { type: 'v2', value: new THREE.Vector2(this.__texelSize, this.__texelSize) },
        uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.__segmentSize, this.__segmentSize) },
        uHeightMultiplier: { type: 'f', value: 1.0 },
        uBaseColor: { type: 'v3', value: new THREE.Vector3(0.45, 0.95, 1.0) }
      },
      vertexShader: Shaders.vert['heightMapWater'],
      fragmentShader: Shaders.frag['lambert'],
    });
    this.__mesh.material.transparent = true;
  };

  update(dt) {
    //fix dt for the moment (better to be in slow-mo in extreme cases than to explode)
    dt = 1.0 / 60.0;
    //do multiple full steps per frame to speed up some of algorithms that are slow to propagate at high mesh resolutions
    for (let i = 0; i < this.__multisteps; i++) { this.__step(dt); }
    //post step
    this.__postStepPass();
  }

  __step(dt) {
    //calculate the number of substeps needed
    let substeps = Math.ceil(5.0 * dt / this.__maxDt);  //not always stable without a multiplier
    let substepDt = dt / substeps;
    //disturb
    this.__disturbPass();
    //water sim
    for (let i = 0; i < substeps; i++) {
        this.__waterSimPass(substepDt);
    }
  }

  __setShaderAndRender(shader, renderTarget) {
    this.__rttQuadMesh.material = shader;
    this.__renderer.setRenderTarget(renderTarget);
    this.__renderer.clear();
    this.__renderer.render(this.__rttScene, this.__rttCamera);
    this.__renderer.setRenderTarget(null);
  }

  __disturbPass() {
    let shouldRender = false;
    if (this.__isSourcing && this.__sourceAmount !== 0.0) {
      this.__disturbAndSourceMaterial.uniforms['uIsSourcing'].value = this.__isSourcing;
      this.__disturbAndSourceMaterial.uniforms['uSourcePos'].value.copy(this.__sourceUvPos);
      this.__disturbAndSourceMaterial.uniforms['uSourceAmount'].value = this.__sourceAmount;
      this.__disturbAndSourceMaterial.uniforms['uSourceSize'].value.copy(this.__sourceSize);
      shouldRender = true;
    }
    if (this.__isFlooding && this.__floodAmount !== 0.0) {
      this.__disturbAndSourceMaterial.uniforms['uIsFlooding'].value = this.__isFlooding;
      this.__disturbAndSourceMaterial.uniforms['uFloodAmount'].value = this.__floodAmount;
      shouldRender = true;
    }
    if (shouldRender) {
      this.__disturbAndSourceMaterial.uniforms['uTexture'].value = this.__rttRenderTarget2.texture;
      this.__setShaderAndRender(this.__disturbAndSourceMaterial, this.__rttRenderTarget1);
      this.__swapRenderTargets();
      this.__isSourcing = false;
      this.__disturbAndSourceMaterial.uniforms['uIsSourcing'].value = false;
      this.__isFlooding = false;
      this.__disturbAndSourceMaterial.uniforms['uIsFlooding'].value = false;
    }
  }

  __waterSimPass(substepDt) {
    //calculate flux
    this.__waterSimMaterial.uniforms['uTerrainTexture'].value = this.__terrainTexture;
    this.__waterSimMaterial.uniforms['uWaterTexture'].value = this.__rttRenderTarget2.texture;
    this.__waterSimMaterial.uniforms['uFluxTexture'].value = this.__rttRenderTargetFlux2.texture;
    this.__waterSimMaterial.uniforms['uBoundaryTexture'].value = this.__boundaryTexture;
    this.__waterSimMaterial.uniforms['uHeightToFluxFactor'].value = this.__heightToFluxFactorNoDt * substepDt;
    this.__waterSimMaterial.uniforms['uDt'].value = substepDt;
    this.__setShaderAndRender(this.__waterSimMaterial, this.__rttRenderTargetFlux1);
    this.__swapFluxRenderTargets();
    //water sim
    this.__waterSimMaterial2.uniforms['uWaterTexture'].value = this.__rttRenderTarget2.texture;
    this.__waterSimMaterial2.uniforms['uFluxTexture'].value = this.__rttRenderTargetFlux2.texture;
    this.__waterSimMaterial2.uniforms['uDt'].value = substepDt;
    this.__setShaderAndRender(this.__waterSimMaterial2, this.__rttRenderTarget1);
    this.__swapRenderTargets();
  }

  __postStepPass() {
    //combine terrain, static obstacle and water heights
    this.__calcFinalWaterHeightMaterial.uniforms['uTerrainTexture'].value = this.__terrainTexture;
    this.__calcFinalWaterHeightMaterial.uniforms['uWaterTexture'].value = this.__rttRenderTarget2.texture;
    this.__calcFinalWaterHeightMaterial.uniforms['uMultiplyTexture'].value = this.__boundaryTexture;
    this.__setShaderAndRender(this.__calcFinalWaterHeightMaterial, this.__rttCombinedHeight)
    //rebind render target to water mesh to ensure vertex shader gets the right texture
    this.__mesh.material.uniforms['uTexture'].value = this.__rttCombinedHeight.texture;
  }

  __swapRenderTargets() {
    let temp = this.__rttRenderTarget1;
    this.__rttRenderTarget1 = this.__rttRenderTarget2;
    this.__rttRenderTarget2 = temp;
  }
  __swapFluxRenderTargets() {
    let temp = this.__rttRenderTargetFlux1;
    this.__rttRenderTargetFlux1 = this.__rttRenderTargetFlux2;
    this.__rttRenderTargetFlux2 = temp;
  }

  source(position, amount, sizeX, sizeY) {
    this.__isSourcing = true;
    this.__sourceUvPos.x = (position.x + this.__halfSize) / this.__size;
    this.__sourceUvPos.y = (position.z + this.__halfSize) / this.__size;
    this.__sourceAmount = amount;
    this.__sourceSize = new THREE.Vector2(sizeX, sizeY);
  }

  flood(volume) {
    this.__isFlooding = true;
    this.__floodAmount = volume / (this.__size * this.__size);
  }

}