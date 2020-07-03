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

    heightMapWater: [

      "varying vec3 v_normal;",
      "uniform mat4 uTextureMatrix;",
      "varying vec4 vCoord;",

      "uniform sampler2D uTexture;",
      "uniform vec2 uTexelSize;",
      "uniform vec2 uTexelWorldSize;",
      "uniform float uHeightMultiplier;",

      "varying vec3 vViewPos;",
      "varying vec3 vViewNormal;",
      "varying vec2 vUv;",

      "void main() {",

          "vUv = uv;",

          "vCoord = uTextureMatrix * vec4( position, 1.0 );",

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
          "v_normal = vViewNormal;",

          "vec4 worldPosition = modelMatrix * vec4(displacedPos, 1.0);",
          "vec4 viewPos = modelViewMatrix * vec4(displacedPos, 1.0);",
          "vViewPos = viewPos.rgb;",

          "gl_Position = projectionMatrix * viewPos;",

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
          "t1.r += add(vUv);",
          "t1.r = max(0.0, tBase.r + t1.r) - tBase.r;",
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

    lambert: [

      "varying vec4 vCoord;",
      "varying vec3 v_normal;",
      "uniform vec4 uConfig;",

      "uniform vec3 uBaseColor;",
      "uniform vec3 uAmbientLightColor;",
      "uniform float uAmbientLightIntensity;",

      "uniform sampler2D uNormalTexture0;",
      "uniform sampler2D uNormalTexture1;",
      "uniform sampler2D uTextureNormalMap0;",
      "uniform sampler2D uTextureNormalMap1;",
      "uniform sampler2D uTextureReflectionMap;",
      "uniform vec2 uFlowDirection;",

      "varying vec3 vViewPos;",
      "varying vec3 vViewNormal;",
      "varying vec2 vUv;",

      "void main() {",

        "float flowMapOffset0 = uConfig.x;",
        "float flowMapOffset1 = uConfig.y;",
        "float halfCycle = uConfig.z;",
        "float scale = uConfig.w;",

        "vec3 normal = normalize(v_normal);",
        "float light = dot(normal, vec3(0.5, 0.9182, 0.3));",

        "vec4 normalColor0 = texture2D( uTextureNormalMap0, ( vUv ) + uFlowDirection * flowMapOffset0 );",
        "vec4 normalColor1 = texture2D( uTextureNormalMap1, ( vUv ) + uFlowDirection * flowMapOffset1 );",
        "float flowLerp = abs( halfCycle - flowMapOffset0 ) / halfCycle;",
        "vec4 normalColor = mix( normalColor0, normalColor1, 1.0 );",
        "vec3 normal2 = normalize( vec3(",
          "normalColor.r * 2.0 - 1.0,",
          "normalColor.b,",
          "normalColor.g * 2.0 - 1.0 ) );",

        "vec3 coord = vCoord.xyz / vCoord.w;",
        "vec2 uv = coord.xy + coord.z * normal2.xz * 0.05;",
        
        "vec4 reflectColor = texture2D( uTextureReflectionMap, vec2( 1.0 - uv.x, uv.y ) );",
        //ambient component
        "vec3 ambient = uAmbientLightColor * uAmbientLightIntensity;",

        //diffuse component
        "vec3 diffuse = vec3(0.0);",

        "vec4 lightVector = viewMatrix * vec4(vec3(1.0, 0.5, 0.275), 0.0);",
        "float normalModulator = dot(normalize(vViewNormal), normalize(lightVector.xyz));",
        "diffuse += normalModulator * vec3(1.0, 1.0, 1.0);",

        "gl_FragColor = vec4(reflectColor.xyz * diffuse, 0.66);",

      "}"

    ].join('\n'),

    lambertCursor: [

      //Fragment shader that does basic lambert shading.
      //This is the version that overlays a circular cursor patch.

      "uniform sampler2D uImageTexture;",
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
        "vec3 finalColor = texture2D(uImageTexture, vUv).xyz * (ambient + diffuse);",

        //mix in cursor color
        "if (uShowCursor == 1) {",
          "float len = length(vUv - vec2(uCursorPos.x, 1.0 - uCursorPos.y));",
          "finalColor = mix(finalColor, uCursorColor, smoothstep(uCursorRadius, 0.0, len));",
        "}",

        "gl_FragColor = vec4(finalColor, 1.0);",

        THREE.ShaderChunk['shadowmap_fragment'],

      "}"

    ].join('\n'),

    hfWater_disturb: [

      //Wave height
      "uniform float uWaveHeight;",
      
      "uniform sampler2D uTexture;",

      //source is not masked by obstacles
      "uniform int uIsSourcing;",
      "uniform float uSourceAmount;",
      "uniform vec2 uSourceSize;",
      "uniform vec2 uSourcePos;",

      //flood is source for every cell
      "uniform int uIsFlooding;",
      "uniform float uFloodAmount;",

      "varying vec2 vUv;",

      "void main() {",

          //read texture from previous step
          //r channel: height
          "vec4 t = texture2D(uTexture, vUv);",

          //add source
          "if (uIsSourcing == 1) {",
            "float len = length(vUv - vec2(uSourcePos.x, 1.0 - uSourcePos.y));",
            "float len_x = length(vUv.x - uSourcePos.x);",
            "float len_y = length(vUv.y - (1.0 - uSourcePos.y));",
            "float wave_height = uSourceAmount * ",
              "(1.0 - smoothstep(0.0, uSourceSize.x, len_x)) *",
              "(1.0 - smoothstep(0.0, uSourceSize.y, len_y));",
            
            "t.r += wave_height;",
          "}",

          //add flood
          "if (uIsFlooding == 1) {",
              "t.r += uFloodAmount;",
          "}",
          
          //write out to texture for next step
          "gl_FragColor = t;",
      "}"

    ].join('\n'),

    hfWater_pipeModel: [

      //GPU version of pipe model water.
      //Need to run the flux calculation pre-pass first before running this.

      "uniform sampler2D uWaterTexture;",
      "uniform sampler2D uFluxTexture;",
      "uniform vec2 uTexelSize;",
      "uniform float uSegmentSize;",
      "uniform float uDt;",
      "uniform float uMinWaterHeight;",

      "varying vec2 vUv;",

      "void main() {",

          "vec2 du = vec2(uTexelSize.r, 0.0);",
          "vec2 dv = vec2(0.0, uTexelSize.g);",

          //read water texture
          //r channel: water height
          //g channel: horizontal velocity x
          //b channel: horizontal velocity z
          //a channel: UNUSED
          "vec4 tWater = texture2D(uWaterTexture, vUv);",

          //read flux textures
          //r channel: fluxR
          //g channel: fluxL
          //b channel: fluxB
          //a channel: fluxT
          "vec4 tFlux = texture2D(uFluxTexture, vUv);",
          "vec4 tFluxPixelLeft = texture2D(uFluxTexture, vUv-du);",
          "vec4 tFluxPixelRight = texture2D(uFluxTexture, vUv+du);",
          "vec4 tFluxPixelTop = texture2D(uFluxTexture, vUv+dv);",
          "vec4 tFluxPixelBottom = texture2D(uFluxTexture, vUv-dv);",

          "float avgWaterHeight = tWater.r;",

          //calculate new height
          "float fluxOut = tFlux.r + tFlux.g + tFlux.b + tFlux.a;",
          "float fluxIn = tFluxPixelLeft.r + tFluxPixelRight.g + tFluxPixelTop.b + tFluxPixelBottom.a;",
          "tWater.r += (fluxIn - fluxOut) * uDt / (uSegmentSize * uSegmentSize);",
          "tWater.r = max(uMinWaterHeight, tWater.r);",

          "avgWaterHeight = 0.5 * (avgWaterHeight + tWater.r);",  //this will get the average height of that from before and after the change

          //calculate horizontal velocities, from amount of water passing through per unit time
          "if (avgWaterHeight == 0.0) {",  //prevent division by 0
              "tWater.g = 0.0;",
              "tWater.b = 0.0;",
          "} else {",
              "float threshold = float(tWater.r > 0.2);",  //0/1 threshold value for masking out weird velocities at terrain edges
              "float segmentSizeTimesAvgWaterHeight = uSegmentSize * avgWaterHeight;",
              "tWater.g = threshold * 0.5 * (tFluxPixelLeft.r - tFlux.g + tFlux.r - tFluxPixelRight.g) / segmentSizeTimesAvgWaterHeight;",
              "tWater.b = threshold * 0.5 * (tFluxPixelTop.b - tFlux.a + tFlux.b - tFluxPixelBottom.a) / segmentSizeTimesAvgWaterHeight;",
          "}",

          //write out to texture for next step
          "gl_FragColor = tWater;",
      "}"

    ].join('\n'),

    hfWater_pipeModel_calcFlux: [

      //GPU version of pipe model water.
      //This is the pre-pass to calculate flux.

      "uniform sampler2D uTerrainTexture;",
      "uniform sampler2D uWaterTexture;",
      "uniform sampler2D uFluxTexture;",
      "uniform sampler2D uBoundaryTexture;",
      "uniform vec2 uTexelSize;",
      "uniform float uDampingFactor;",
      "uniform float uHeightToFluxFactor;",
      "uniform float uSegmentSizeSquared;",
      "uniform float uDt;",
      "uniform float uMinWaterHeight;",

      "varying vec2 vUv;",

      "void main() {",

          "vec2 du = vec2(uTexelSize.r, 0.0);",
          "vec2 dv = vec2(0.0, uTexelSize.g);",

          //read terrain texture
          //r channel: terrain height
          "vec4 tTerrain = texture2D(uTerrainTexture, vUv);",

          //read water texture
          //r channel: water height
          //g, b channels: vel
          //a channel: UNUSED
          "vec4 tWater = texture2D(uWaterTexture, vUv);",

          "float waterHeight = tWater.r;",
          // "float totalHeight = max(tTerrain.r, tObstacle.r) + waterHeight;",
          "float totalHeight = tTerrain.r + waterHeight;",

          //read flux texture
          //r channel: fluxR
          //g channel: fluxL
          //b channel: fluxB
          //a channel: fluxT
          "vec4 tFlux = texture2D(uFluxTexture, vUv);",

          //calculate new flux
          "tFlux *= uDampingFactor;",
          "vec4 neighbourTotalHeights = vec4(texture2D(uWaterTexture, vUv + du).r + texture2D(uTerrainTexture, vUv + du).r,",
                                            "texture2D(uWaterTexture, vUv - du).r + texture2D(uTerrainTexture, vUv - du).r,",
                                            "texture2D(uWaterTexture, vUv - dv).r + texture2D(uTerrainTexture, vUv - dv).r,",
                                            "texture2D(uWaterTexture, vUv + dv).r + texture2D(uTerrainTexture, vUv + dv).r);",
          "tFlux += (totalHeight - neighbourTotalHeights) * uHeightToFluxFactor;",
          "tFlux = max(vec4(0.0), tFlux);",

          //read boundary texture
          //r channel: fluxR
          //g channel: fluxL
          //b channel: fluxB
          //a channel: fluxT
          "vec4 tBoundary = texture2D(uBoundaryTexture, vUv);",

          //multiply flux with boundary texture to mask out fluxes
          "tFlux *= tBoundary;",

          //scale down outflow if it is more than available volume in the column
          "float currVol = (waterHeight - uMinWaterHeight) * uSegmentSizeSquared;",
          "float outVol = uDt * (tFlux.r + tFlux.g + tFlux.b + tFlux.a);",
          "tFlux *= min(1.0, currVol / outVol);",

          //write out to texture for next step
          "gl_FragColor = tFlux;",
      "}"

    ].join('\n'),

    hfWater_pipeModel_calcFinalWaterHeight: [

      //Fragment shader to combine textures

      "uniform sampler2D uTerrainTexture;",
      "uniform sampler2D uWaterTexture;",
      "uniform sampler2D uMultiplyTexture;",  //texture to multiply the results of uTerrainTexture
      "uniform float uMaskOffset;",  //using uMultiplyTexture as a mask to offset the 0 regions

      "varying vec2 vUv;",

      "void main() {",

          "vec4 t = texture2D(uTerrainTexture, vUv) + texture2D(uWaterTexture, vUv);",

          //read multiply texture and multiply
          "vec4 tMultiply = texture2D(uMultiplyTexture, vUv);",
          "t *= tMultiply;",

          //do offset with masking
          "t += (1.0 - tMultiply) * uMaskOffset;",

          "gl_FragColor = t;",
      "}"

    ].join('\n')
  }
}