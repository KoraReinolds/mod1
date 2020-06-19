import * as THREE from "../../../build/three.module.js";

export default class GpuSkulpt {
  constructor({ mesh, renderer, size, res, proxyRes }) {

    // size: TERRAIN_SIZE, 6
    // res: TERRAIN_RES, 256
    // proxyRes: PROXY_TERRAIN_RES 64

    this.__shaders = {
      vert: {

        passUv: [
          //Pass-through vertex shader for passing interpolated UVs to fragment shader
          "varying vec2 vUv;",

          "void main() {",
            "vUv = vec2(uv.x, uv.y);",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
          "}"
        ].join('\n'),

        heightMap: [
          //Vertex shader that displaces vertices in local Y based on a texture

          "uniform sampler2D uTexture;",
          "uniform vec2 uTexelSize;",
          "uniform vec2 uTexelWorldSize;",
          "uniform float uHeightMultiplier;",

          "varying vec3 vViewPos;",
          "varying vec3 vViewNormal;",
          "varying vec2 vUv;",

          THREE.ShaderChunk['shadowmap_pars_vertex'],

          "void main() {",

            "vUv = uv;",

            //displace y based on texel value
            "vec4 t = texture2D(uTexture, vUv) * uHeightMultiplier;",
            
            "vec3 displacedPos = vec3(position.x, t.r, position.z);",

            //find normal
            "vec2 du = vec2(uTexelSize.r, 0.0);",
            "vec2 dv = vec2(0.0, uTexelSize.g);",
            "vec3 vecPosU = vec3(displacedPos.x + uTexelWorldSize.r,",
                                "texture2D(uTexture, vUv + du).r * uHeightMultiplier,",
                                "displacedPos.z) - displacedPos;",
            "vec3 vecNegU = vec3(displacedPos.x - uTexelWorldSize.r,",
                                "texture2D(uTexture, vUv - du).r * uHeightMultiplier,",
                                "displacedPos.z) - displacedPos;",
            "vec3 vecPosV = vec3(displacedPos.x,",
                                "texture2D(uTexture, vUv + dv).r * uHeightMultiplier,",
                                "displacedPos.z - uTexelWorldSize.g) - displacedPos;",
            "vec3 vecNegV = vec3(displacedPos.x,",
                                "texture2D(uTexture, vUv - dv).r * uHeightMultiplier,",
                                "displacedPos.z + uTexelWorldSize.g) - displacedPos;",
            "vViewNormal = normalize(normalMatrix * 0.25 * (cross(vecPosU, vecPosV) + cross(vecPosV, vecNegU) + cross(vecNegU, vecNegV) + cross(vecNegV, vecPosU)));",

            "vec4 worldPosition = modelMatrix * vec4(displacedPos, 1.0);",
            "vec4 viewPos = modelViewMatrix * vec4(displacedPos, 1.0);",
            "vViewPos = viewPos.rgb;",

            "gl_Position = projectionMatrix * viewPos;",

            THREE.ShaderChunk['shadowmap_vertex'],

          "}"
        ].join('\n')

      },
      frag: {

        setColor: [
          //Fragment shader to set colors on a render target
          "uniform vec4 uColor;",

          "void main() {",
              "gl_FragColor = uColor;",
          "}"
        ].join('\n'),

        skulpt: [
          //Fragment shader for sculpting
          "uniform sampler2D uBaseTexture;",
          "uniform sampler2D uSculptTexture1;",
          "uniform vec2 uTexelSize;",
          "uniform int uIsSculpting;",
          "uniform int uSculptType;",
          "uniform float uSculptAmount;",
          "uniform float uSculptRadius;",
          "uniform vec2 uSculptPos;",

          "varying vec2 vUv;",

          "float add(vec2 uv) {",
            "float len = length(uv - vec2(uSculptPos.x, 1.0 - uSculptPos.y));",
            "return uSculptAmount * smoothstep(uSculptRadius, 0.0, len);",
          "}",

          "void main() {",
            //r channel: height
            //read base texture
            "vec4 tBase = texture2D(uBaseTexture, vUv);",
            //read texture from previous step
            "vec4 t1 = texture2D(uSculptTexture1, vUv);",
            //add sculpt
            "if (uIsSculpting == 1) {",
              "if (uSculptType == 1) {",  //add
                "t1.r += add(vUv);",
              "} else if (uSculptType == 2) {",  //remove
                "t1.r -= add(vUv);",
                "t1.r = max(0.0, tBase.r + t1.r) - tBase.r;",
              "}",
            "}",
            //write out to texture for next step
            "gl_FragColor = t1;",
          "}"
        ].join('\n'),

        combineTextures: [
          //Fragment shader to combine textures
          "uniform sampler2D uTexture1;",
          "uniform sampler2D uTexture2;",

          "varying vec2 vUv;",

          "void main() {",
            "gl_FragColor = texture2D(uTexture1, vUv) + texture2D(uTexture2, vUv);",
          "}"
        ].join('\n'),

        encodeFloat: [
          //Fragment shader that encodes float value in input R channel to 4 unsigned bytes in output RGBA channels
          //Most of this code is from original GLSL codes from Piotr Janik, only slight modifications are done to fit the needs of this script
          //http://concord-consortium.github.io/lab/experiments/webgl-gpgpu/script.js
          //Using method 1 of the code.

          "uniform sampler2D uTexture;",
          "uniform vec4 uChannelMask;",

          "varying vec2 vUv;",

          "float shift_right(float v, float amt) {",
            "v = floor(v) + 0.5;",
            "return floor(v / exp2(amt));",
          "}",

          "float shift_left(float v, float amt) {",
            "return floor(v * exp2(amt) + 0.5);",
          "}",

          "float mask_last(float v, float bits) {",
            "return mod(v, shift_left(1.0, bits));",
          "}",

          "float extract_bits(float num, float from, float to) {",
            "from = floor(from + 0.5);",
            "to = floor(to + 0.5);",
            "return mask_last(shift_right(num, from), to - from);",
          "}",

          "vec4 encode_float(float val) {",

            "if (val == 0.0) {",
              "return vec4(0, 0, 0, 0);",
            "}",

            "float sign = val > 0.0 ? 0.0 : 1.0;",
            "val = abs(val);",
            "float exponent = floor(log2(val));",
            "float biased_exponent = exponent + 127.0;",
            "float fraction = ((val / exp2(exponent)) - 1.0) * 8388608.0;",

            "float t = biased_exponent / 2.0;",
            "float last_bit_of_biased_exponent = fract(t) * 2.0;",
            "float remaining_bits_of_biased_exponent = floor(t);",

            "float byte4 = extract_bits(fraction, 0.0, 8.0) / 255.0;",
            "float byte3 = extract_bits(fraction, 8.0, 16.0) / 255.0;",
            "float byte2 = (last_bit_of_biased_exponent * 128.0 + extract_bits(fraction, 16.0, 23.0)) / 255.0;",
            "float byte1 = (sign * 128.0 + remaining_bits_of_biased_exponent) / 255.0;",

            "return vec4(byte4, byte3, byte2, byte1);",
          "}",

          "void main() {",
            "vec4 t = texture2D(uTexture, vUv);",
            "gl_FragColor = encode_float(dot(t, uChannelMask));",
          "}"
        ].join('\n'),

        scaleAndFlipV: [
          //Fragment shader to scale and flip a texture

          "uniform sampler2D uTexture;",
          "uniform float uScale;",

          "varying vec2 vUv;",

          "void main() {",
            "vec2 scaledAndFlippedUv = vec2(vUv.x * uScale, 1.0 - (vUv.y * uScale));",
            "gl_FragColor = texture2D(uTexture, scaledAndFlippedUv);",
          "}"
        ].join('\n'),

        lambertCursor: [

          //Fragment shader that does basic lambert shading.
          //This is the version that overlays a circular cursor patch.

          "uniform vec3 uBaseColor;",
          "uniform vec3 uAmbientLightColor;",
          "uniform float uAmbientLightIntensity;",

          "uniform int uShowCursor;",
          "uniform vec2 uCursorPos;",
          "uniform float uCursorRadius;",
          "uniform vec3 uCursorColor;",

          "varying vec3 vViewPos;",
          "varying vec3 vViewNormal;",
          "varying vec2 vUv;",

          THREE.ShaderChunk['shadowmap_pars_fragment'],

          "void main() {",

            //ambient component
            "vec3 ambient = uAmbientLightColor * uAmbientLightIntensity;",

            //diffuse component
            "vec3 diffuse = vec3(0.0);",
            //combine components to get final color
            "vec4 lightVector = viewMatrix * vec4(vec3(1.0, 0.5, 0.275), 0.0);",
            "float normalModulator = dot(normalize(vViewNormal), normalize(lightVector.xyz));",
            "diffuse += normalModulator * vec3(1.0, 1.0, 1.0);",
            "vec3 finalColor = uBaseColor * (ambient + diffuse);",

            //mix in cursor color
            "if (uShowCursor == 1) {",
              "float len = length(vUv - vec2(uCursorPos.x, 1.0 - uCursorPos.y));",
              "finalColor = mix(finalColor, uCursorColor, smoothstep(uCursorRadius, 0.0, len));",
            "}",

            "gl_FragColor = vec4(finalColor, 1.0);",

            THREE.ShaderChunk['shadowmap_fragment'],

          "}"

        ].join('\n')
      }
    }
    this.__mesh = mesh;
    this.__renderer = renderer;
    this.__size = size || 6;
    this.__halfSize = this.__size / 2.0;
    this.__res = res || 256;
    this.__proxyRes = proxyRes || 64 || this.__res;
    this.__actualToProxyRatio = this.__res / this.__proxyRes;
    this.__gridSize = this.__size / this.__res;
    this.__texelSize = 1.0 / this.__res;
    this.__imageProcessedData = new Float32Array(4 * this.__res * this.__res);
    this.__isSculpting = false;
    this.__sculptUvPos = new THREE.Vector2();
    this.__cursorHoverColor = new THREE.Vector3(0.4, 0.4, 0.4);
    this.__cursorAddColor = new THREE.Vector3(0.3, 0.5, 0.1);
    this.__cursorRemoveColor = new THREE.Vector3(0.5, 0.2, 0.1);
    this.__shouldClear = false;
    
    this.__linearFloatRgbParams = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      format: THREE.RGBFormat,
      stencilBuffer: false,
      depthBuffer: false,
      type: THREE.FloatType
    };

    this.__nearestFloatRgbParams = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      format: THREE.RGBFormat,
      stencilBuffer: false,
      depthBuffer: false,
      type: THREE.FloatType
    };

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

    this.__pixelByteData = new Uint8Array(this.__res * this.__res * 4);
    this.__proxyPixelByteData = new Uint8Array(this.__proxyRes * this.__proxyRes * 4);

    this.__callbacks = {};
    this.__supportsTextureFloatLinear = this.__renderer.getContext().getExtension('OES_texture_float_linear') !== null;

    this.__setupRttScene();

    //setup a reset material for clearing render targets
    this.__clearMaterial = new THREE.ShaderMaterial({
      uniforms: {
          uColor: { type: 'v4', value: new THREE.Vector4() }
      },
      vertexShader: this.__shaders.vert['passUv'],
      fragmentShader: this.__shaders.frag['setColor']
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
    console.log(this)
  }

  __setupRttScene() {
    //create a RTT scene
    this.__rttScene = new THREE.Scene();
    
    //create an orthographic RTT camera
    var far = 10000;
    var near = -far;
    this.__rttCamera = new THREE.OrthographicCamera(-this.__halfSize, this.__halfSize, this.__halfSize, -this.__halfSize, near, far);
    
    //create a quad which we will use to invoke the shaders
    this.__rttQuadGeom = new THREE.PlaneGeometry(this.__size, this.__size);
    this.__rttQuadMesh = new THREE.Mesh(this.__rttQuadGeom, this.__skulptMaterial);
    this.__rttScene.add(this.__rttQuadMesh);
  }

  __clearRenderTarget(renderTarget, r, g, b, a) {
    this.__rttQuadMesh.material = this.__clearMaterial;
    this.__clearMaterial.uniforms['uColor'].value.set(r, g, b, a);
    this.__renderer.setRenderTarget(renderTarget);
    this.__renderer.render(this.__rttScene, this.__rttCamera);
    this.__renderer.setRenderTarget(null);
  }
    
  __setupRttRenderTargets() {
    //create RTT render targets (we need two to do feedback)
    if (this.__supportsTextureFloatLinear) {
      this.__rttRenderTarget1 = new THREE.WebGLRenderTarget(this.__res, this.__res, this.__linearFloatRgbParams);
    } else {
      this.__rttRenderTarget1 = new THREE.WebGLRenderTarget(this.__res, this.__res, this.__nearestFloatRgbParams);
    }
    // this.__rttRenderTarget1.generateMipmaps = false;
    this.__clearRenderTarget(this.__rttRenderTarget1, 0.1, 0.120, 0.40, 0.90);
    this.__rttRenderTarget2 = this.__rttRenderTarget1.clone();
    this.__clearRenderTarget(this.__rttRenderTarget2, 0.1, 0.120, 0.40, 0.90);

    //create a RTT render target for storing the combine results of all layers
    this.__rttCombinedLayer = this.__rttRenderTarget1.clone();
    this.__clearRenderTarget(this.__rttCombinedLayer, 0.1, 0.120, 0.40, 0.90);

    //create RTT render target for storing proxy terrain data
    if (this.__supportsTextureFloatLinear) {
        this.__rttProxyRenderTarget = new THREE.WebGLRenderTarget(this.__proxyRes, this.__proxyRes, this.__linearFloatRgbParams);
    } else {
        this.__rttProxyRenderTarget = new THREE.WebGLRenderTarget(this.__proxyRes, this.__proxyRes, this.__nearestFloatRgbParams);
    }
    // this.__rttProxyRenderTarget.generateMipmaps = false;
    this.__clearRenderTarget(this.__rttProxyRenderTarget, 0.1, 0.120, 0.40, 0.90);

    //create another RTT render target encoding float to 4-byte data
    this.__rttFloatEncoderRenderTarget = new THREE.WebGLRenderTarget(this.__res, this.__res, this.__nearestFloatRgbaParams);
    // this.__rttFloatEncoderRenderTarget.generateMipmaps = false;
    this.__clearRenderTarget(this.__rttFloatEncoderRenderTarget, 0.1, 0.120, 0.40, 0.90);
  }

  __setupShaders() {
    
    this.__skulptMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uBaseTexture: { type: 't', value: null },
        uSculptTexture1: { type: 't', value: null },
        uTexelSize: { type: 'v2', value: new THREE.Vector2(this.__texelSize, this.__texelSize) },
        uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.__size / this.__res, this.__size / this.__res) },
        uIsSculpting: { type: 'i', value: 0 },
        uSculptType: { type: 'i', value: 0 },
        uSculptPos: { type: 'v2', value: new THREE.Vector2() },
        uSculptAmount: { type: 'f', value: 0.05 },
        uSculptRadius: { type: 'f', value: 0.0 }
      },
      vertexShader: this.__shaders.vert['passUv'],
      fragmentShader: this.__shaders.frag['skulpt']
    });
    
    this.__combineTexturesMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTexture1: { type: 't', value: null },
        uTexture2: { type: 't', value: null }
      },
      vertexShader: this.__shaders.vert['passUv'],
      fragmentShader: this.__shaders.frag['combineTextures']
    });
    
    this.__rttEncodeFloatMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { type: 't', value: null },
        uChannelMask: { type: 'v4', value: new THREE.Vector4() }
      },
      vertexShader: this.__shaders.vert['passUv'],
      fragmentShader: this.__shaders.frag['encodeFloat']
    });
    
    this.__rttProxyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { type: 't', value: null },
        uScale: { type: 'f', value: 0 }
      },
      vertexShader: this.__shaders.vert['passUv'],
      fragmentShader: this.__shaders.frag['scaleAndFlipV']
    });
    
    this.__channelVectors = {
      'r': new THREE.Vector4(1, 0, 0, 0),
      'g': new THREE.Vector4(0, 1, 0, 0),
      'b': new THREE.Vector4(0, 0, 1, 0),
      'a': new THREE.Vector4(0, 0, 0, 1)
    };
  };
  
  __setupVtf() {
    this.__mesh.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib['lights'],
        THREE.UniformsLib[ 'ambient' ],
        THREE.UniformsLib['shadowmap'],
        {
          uTexture: { type: 't', value: null },
          uTexelSize: { type: 'v2', value: new THREE.Vector2(1.0 / this.__res, 1.0 / this.__res) },
          uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.__gridSize, this.__gridSize) },
          uHeightMultiplier: { type: 'f', value: 1.0 },
          uBaseColor: { type: 'v3', value: new THREE.Vector3(0.6, 0.8, 0.0) },
          uShowCursor: { type: 'i', value: 0 },
          uCursorPos: { type: 'v2', value: new THREE.Vector2() },
          uCursorRadius: { type: 'f', value: 0.0 },
          uCursorColor: { type: 'v3', value: new THREE.Vector3() }
        }
      ]),
      vertexShader: this.__shaders.vert['heightMap'],
      fragmentShader: this.__shaders.frag['lambertCursor'],
      lights: true
    });
  }
  
  loadFromImageData(data, amount, midGreyIsLowest) {
    //convert data from Uint8ClampedArray to Float32Array so that DataTexture can use
    let normalizedHeight;
    let min = 99999;
    let i, len;
    for (i = 0, len = this.__imageProcessedData.length; i < len; i++) {
      if (midGreyIsLowest) {
        normalizedHeight = Math.abs(data[i] / 255.0 - 0.5);
      } else {
        normalizedHeight = data[i] / 255.0;
      }
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
    this.__skulptMaterial.uniforms['uBaseTexture'].value = this.__imageDataTexture.texture;
    this.__combineTexturesMaterial.uniforms['uTexture1'].value = this.__imageDataTexture.texture;
    // this.__mesh.material.uniforms['uBaseTexture'].value = this.__imageDataTexture.texture;
    this.__updateCombinedLayers = true;
  }

  update(dt) {

    //have to set flags from other places and then do all steps at once during update
    // debugger;
    //clear sculpts if necessary
    if (this.__shouldClear) {
    
      // debugger
      this.__rttQuadMesh.material = this.__clearMaterial;
      this.__clearMaterial.uniforms['uColor'].value.set(0.0, 0.0, 0.0, 0.0);
      this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttRenderTarget1, false);
      this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttRenderTarget2, false);
      this.__shouldClear = false;
      this.__updateCombinedLayers = true;
    }

    //do the main sculpting
    if (this.__isSculpting) {
    
      // debugger
      this.__rttQuadMesh.material = this.__skulptMaterial;
      this.__skulptMaterial.uniforms['uBaseTexture'].value = this.__imageDataTexture;
      this.__skulptMaterial.uniforms['uSculptTexture1'].value = this.__rttRenderTarget2.texture;
      this.__skulptMaterial.uniforms['uIsSculpting'].value = this.__isSculpting.texture;
      this.__skulptMaterial.uniforms['uSculptPos'].value.copy(this.__sculptUvPos);
      this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttRenderTarget1, false);
      this.__swapRenderTargets();
      this.__isSculpting = false;
      this.__updateCombinedLayers = true;
    }

    //combine layers into one
    if (this.__updateCombinedLayers) {  //this can be triggered somewhere else without sculpting
      // debugger
      this.__rttQuadMesh.material = this.__combineTexturesMaterial;
      this.__combineTexturesMaterial.uniforms['uTexture1'].value = this.__imageDataTexture;
      this.__combineTexturesMaterial.uniforms['uTexture2'].value = this.__rttRenderTarget2.texture;
      
      this.__renderer.setRenderTarget(this.__rttCombinedLayer);
      this.__renderer.clear();
      this.__renderer.render(this.__rttScene, this.__rttCamera);
      this.__renderer.setRenderTarget(null);
      // this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttCombinedLayer, false);
      this.__updateCombinedLayers = false;

      //need to rebind rttCombinedLayer to uTexture
      this.__mesh.material.uniforms['uTexture'].value = this.__rttCombinedLayer.texture;

      //check for the callback of type 'update'
      if (this.__callbacks.hasOwnProperty('update')) {
        var renderCallbacks = this.__callbacks['update'];
        var i, len;
        for (i = 0, len = renderCallbacks.length; i < len; i++) {
          renderCallbacks[i]();
        }
      }
    }
  }
}
