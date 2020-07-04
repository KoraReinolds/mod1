import Shaders from "../shaders.js";
import * as THREE from "../build/three.module.js";

export default class GpuPipeModelWater {
  constructor(options) {

    this.__mesh = options.mesh;
    this.__camera = options.camera;
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

    //some constants
    this.__pipeLength = this.__segmentSize;
    this.__pipeCrossSectionArea = this.__pipeLength * this.__pipeLength;  //square cross-section area
    this.__pipeCrossSectionArea *= this.__res / 10;  //scale according to resolution
    this.__heightToFluxFactorNoDt = this.__pipeCrossSectionArea * this.__gravity / this.__pipeLength;
    this.__maxHorizontalSpeed = 10.0;  //just an arbitrary upper-bound estimate //TODO: link this to cross-section area
    this.__maxDt = this.__segmentSize / this.__maxHorizontalSpeed;  //based on CFL condition
    this.__terrainTexture = options.terrainTexture || this.__emptyTexture;
  
    this.__init();
    
  }

  __initReflector() {
    this.__clock = new THREE.Clock();
    this.__cycle = 0.15;
    const loader = new THREE.TextureLoader();
    this.__textureMatrix = new THREE.Matrix4();
    loader.load( './textures/Water_1_M_Normal.jpg', function(texture) {
      this.__normalMapTexture0 = texture;
      this.__normalMapTexture0.wrapS = this.__normalMapTexture0.wrapT = THREE.RepeatWrapping;
      this.__mesh.material.uniforms['uTextureNormalMap0'].value = texture;
    }.bind(this));
    loader.load( './textures/Water_2_M_Normal.jpg', function(texture) {
      this.__normalMapTexture1 = texture;
      this.__normalMapTexture1.wrapS = this.__normalMapTexture1.wrapT = THREE.RepeatWrapping;
      this.__mesh.material.uniforms['uTextureNormalMap1'].value = texture;
    }.bind(this));
    this.__reflector = new THREE.Mesh(this.__mesh.geometry, null);
    this.__reflector.matrixAutoUpdate = false;
    this.__textureMatrix = new THREE.Matrix4();
  }

  __renderReflector() {
    let geometry = this.__mesh.geometry;
    this.__updateTextureMatrix();
    this.updateFlow();
    geometry.visible = false;
    this.__reflector.matrixWorld.copy( this.__mesh.matrixWorld );

    let renderer = this.__renderer;
    let scene = this.__scene;
    let camera = this.__camera;
    let reflectorWorldPosition = new THREE.Vector3(); // this reflector position
    let cameraWorldPosition = new THREE.Vector3(); // camera position
    let rotationMatrix = new THREE.Matrix4(); // camera rotation matrix
    let normal = new THREE.Vector3();
    let view = new THREE.Vector3();
    let lookAtPosition = new THREE.Vector3();
    let target = new THREE.Vector3(); 
    let virtualCamera = new THREE.PerspectiveCamera();
    let reflectorPlane = new THREE.Plane();
    let clipPlane = new THREE.Vector4();
    let q = new THREE.Vector4();

    reflectorWorldPosition.setFromMatrixPosition( this.__reflector.matrixWorld );
    // reflectorWorldPosition.y = 1.0;
    cameraWorldPosition.setFromMatrixPosition( camera.matrixWorld );
    rotationMatrix.extractRotation( this.__reflector.matrixWorld );
    
    // rotate normal without translate
    normal.set( 0, 1, 0 );
    normal.applyMatrix4( rotationMatrix );
    
    view.subVectors( reflectorWorldPosition, cameraWorldPosition ); // distance between camera and reflector
    view.reflect( normal ).negate();
		view.add( reflectorWorldPosition );
    
    rotationMatrix.extractRotation( camera.matrixWorld );

		lookAtPosition.set( 0, 0, -1 );
		lookAtPosition.applyMatrix4( rotationMatrix );
    lookAtPosition.add( cameraWorldPosition );

    
    target.subVectors( reflectorWorldPosition, lookAtPosition );
		target.reflect( normal ).negate();
    target.add( reflectorWorldPosition );
    
    virtualCamera.position.copy( view );
		virtualCamera.up.set( 0, 1, 0 );
		virtualCamera.up.applyMatrix4( rotationMatrix );
		virtualCamera.up.reflect( normal );
		virtualCamera.lookAt( target );
		virtualCamera.far = camera.far; // Used in WebGLBackground
		virtualCamera.updateMatrixWorld();
    virtualCamera.projectionMatrix.copy( camera.projectionMatrix );

		// Update the texture matrix
		this.__textureMatrix.set(
			0.5, 0.0, 0.0, 0.5,
			0.0, 0.5, 0.0, 0.5,
			0.0, 0.0, 0.5, 0.5,
			0.0, 0.0, 0.0, 1.0
		);
		this.__textureMatrix.multiply( virtualCamera.projectionMatrix );
		this.__textureMatrix.multiply( virtualCamera.matrixWorldInverse );
		this.__textureMatrix.multiply( this.__reflector.matrixWorld );

		// Now update projection matrix with new clip plane, implementing code from: http://www.terathon.com/code/oblique.html
    // Paper explaining this technique: http://www.terathon.com/lengyel/Lengyel-Oblique.pdf
		reflectorPlane.setFromNormalAndCoplanarPoint( normal, reflectorWorldPosition );
		reflectorPlane.applyMatrix4( virtualCamera.matrixWorldInverse );

		clipPlane.set( reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant );

		var projectionMatrix = virtualCamera.projectionMatrix;

		q.x = ( Math.sign( clipPlane.x ) + projectionMatrix.elements[ 8 ] ) / projectionMatrix.elements[ 0 ];
		q.y = ( Math.sign( clipPlane.y ) + projectionMatrix.elements[ 9 ] ) / projectionMatrix.elements[ 5 ];
		q.z = - 1.0;
		q.w = ( 1.0 + projectionMatrix.elements[ 10 ] ) / projectionMatrix.elements[ 14 ];

		// Calculate the scaled plane vector
		clipPlane.multiplyScalar( 2.0 / clipPlane.dot( q ) );

		// Replacing the third row of the projection matrix
		projectionMatrix.elements[ 2 ] = clipPlane.x;
		projectionMatrix.elements[ 6 ] = clipPlane.y;
		projectionMatrix.elements[ 10 ] = clipPlane.z + 1.0;
		projectionMatrix.elements[ 14 ] = clipPlane.w;
    
		renderer.setRenderTarget( this.__rttRenderTargetReflector );
		renderer.clear();
		renderer.render( scene, virtualCamera );
    renderer.setRenderTarget( null );
    
    this.__mesh.material.uniforms["uTextureReflectionMap"].value = this.__rttRenderTargetReflector.texture;

    geometry.visible = true;
  };

  updateFlow() {
    const delta = this.__clock.getDelta();
    const config = this.__mesh.material.uniforms[ "uConfig" ];
		config.value.x += 0.03 * delta; // flowMapOffset0
    config.value.y = config.value.x + this.__cycle * 0.5; // flowMapOffset1
  }
  
  __updateTextureMatrix() {

    let camera = this.__camera;

    // console.log(geometry.textureMatrix, geometry)
		this.__textureMatrix.set(
			0.5, 0.0, 0.0, 0.5,
			0.0, 0.5, 0.0, 0.5,
			0.0, 0.0, 0.5, 0.5,
			0.0, 0.0, 0.0, 1.0
		);

		this.__textureMatrix.multiply( camera.projectionMatrix );
		this.__textureMatrix.multiply( camera.matrixWorldInverse );
    this.__textureMatrix.multiply( this.__mesh.matrixWorld );
    this.__mesh.material.uniforms["uTextureMatrix"].value = this.__textureMatrix;

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
    this.__initReflector();
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
    //reflector RTT
    this.__rttRenderTargetReflector = this.__rttRenderTarget1.clone();
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
        uConfig: {
          type: 'v4',
          value: new THREE.Vector4(
            0, // flowMapOffset0
            this.__cycle / 2, // flowMapOffset1
            this.__cycle / 2, // halfCycle
            1.0, // scale
          ),
        },
        uColor: { type: 'c', value: null },
        uTextureMatrix: { value: this.__textureMatrix },
        uTextureNormalMap0: { type: 'sampler2D', value: this.__normalMapTexture0 },
        uTextureNormalMap1: { type: 'sampler2D', value: this.__normalMapTexture1 },
        uTextureReflectionMap: { type: 'sampler2D', value: this.__emptyTexture },
        uFlowDirection: { type: 'v2', value: new THREE.Vector2( 0, -1 ) },

        uTexture: { type: 't', value: this.__rttRenderTarget1.texture },
        uTexelSize: { type: 'v2', value: new THREE.Vector2(this.__texelSize, this.__texelSize) },
        uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.__segmentSize, this.__segmentSize) },
        uHeightMultiplier: { type: 'f', value: 1.0 },
        uNormalTexture0: { type: 't', value: this.__emptyTexture },
        uNormalTexture1: { type: 't', value: this.__emptyTexture },
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
    this.__renderReflector()
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