import * as THREE from "../../../build/three.module.js";

export default {
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