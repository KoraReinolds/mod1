import WaterGeometry from './WaterGeometry.js';
import {
	Clock,
	Matrix4,
	Mesh,
	RepeatWrapping,
	ShaderMaterial,
	TextureLoader,
	Vector2,
	Vector4
} from "../../../build/three.module.js";
import Reflector from './Reflector.js';

class Water extends Mesh {

  constructor(map) {
    super();

    this.clock = new Clock();
    this.cycle = 0.15;

    this.geometry = new WaterGeometry(map);

    const loader = new TextureLoader();
    this.textureMatrix = new Matrix4();
    const normalMap0 = loader.load( './textures/Water_1_M_Normal.jpg' );
    const normalMap1 = loader.load( './textures/Water_2_M_Normal.jpg' );
    normalMap0.wrapS = normalMap0.wrapT = RepeatWrapping;
    normalMap1.wrapS = normalMap1.wrapT = RepeatWrapping;

    const reflector = new Reflector( this.geometry );
    reflector.matrixAutoUpdate = false;
    const vertexShader = `
      varying vec3 v_color;
      varying vec3 v_normal;
      varying vec2 vUv;
      uniform mat4 textureMatrix;
      varying vec4 vCoord;
      varying vec3 vToEye;
      
      void main() {
    
        vUv = uv;
        vCoord = textureMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        v_color = position;
        v_normal = normal;
      }`;  
    const fragmentShader = `
      varying vec3 v_color;
      varying vec3 v_normal;
      varying vec2 vUv;
      uniform sampler2D tNormalMap0;
      uniform sampler2D tNormalMap1;
      varying vec4 vCoord;
      uniform sampler2D tReflectionMap;
      varying vec3 vToEye;
      uniform vec4 config;
      uniform vec2 flowDirection;
    
      void main() {
        vec3 toEye = normalize( vToEye );

        float flowMapOffset0 = config.x;
        float flowMapOffset1 = config.y;
        float halfCycle = config.z;
        float scale = config.w;

        vec3 normal = normalize(v_normal);
        float light = dot(normal, vec3(0.5, 0.9182, 0.3));
        vec3 color = vec3( 1.0, 1.0, 1.0 );
        

        vec4 normalColor0 = texture2D( tNormalMap0, ( vUv * scale ) + flowDirection * flowMapOffset0 );
        vec4 normalColor1 = texture2D( tNormalMap1, ( vUv * scale ) + flowDirection * flowMapOffset1 );
        float flowLerp = abs( halfCycle - flowMapOffset0 ) / halfCycle;
        vec4 normalColor = mix( normalColor0, normalColor1, flowLerp );
        vec3 normal2 = normalize( vec3(
          normalColor.r * 2.0 - 1.0,
          normalColor.b,
          normalColor.g * 2.0 - 1.0 ) );


        vec3 coord = vCoord.xyz / vCoord.w;
        vec2 uv = coord.xy + coord.z * normal2.xz * 0.05;
        
        vec4 reflectColor = texture2D( tReflectionMap, vec2( 1.0 - uv.x, uv.y ) );
        if (normal.x != 0.0 || normal.z != 0.0 || normal.y < 0.0)
        {
          reflectColor = vec4( reflectColor.xyz, dot(abs(normal), vec3(0.5, 0.9182, 0.3)) );
        }
        float opacity = 0.79;
        gl_FragColor = vec4( color, opacity ) * mix( reflectColor, reflectColor, 1.0 );
        
      }`;
      this.material = new ShaderMaterial({
        uniforms: {
          config: {
            type: 'v4',
            value: new Vector4(
              0, // flowMapOffset0
              this.cycle / 2, // flowMapOffset1
              this.cycle / 2, // halfCycle
              1.0, // scale
            ),
          },
          color: {
            type: 'c',
            value: null,
          },
          textureMatrix: {
            value: this.textureMatrix,
          },
          tNormalMap0: {
            type: 'sampler2D',
            value: normalMap0,
          },
          tNormalMap1: {
            type: 'sampler2D',
            value: normalMap1,
          },
          tReflectionMap: {
            type: 'sampler2D',
            value: reflector.getRenderTarget().texture,
          },
          flowDirection: {
            type: 'v2',
            value: new Vector2( 0, -1 ),
          },
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        transparent: true,
      });
  
  
    this.onBeforeRender = function ( renderer, scene, camera ) {

      this.updateTextureMatrix( camera );
      this.updateFlow();
      this.geometry.drawCubes();
      this.visible = false;
      reflector.matrixWorld.copy( this.matrixWorld );
      reflector.onBeforeRender( renderer, scene, camera );
      this.visible = true;
    };
  }

  updateFlow() {
    const cycle = this.cucle; // a cycle of a flow map phase
    const halfCycle = this.cycle * 0.5;

		const delta = this.clock.getDelta();
		const config = this.material.uniforms[ "config" ];

		config.value.x += 0.03 * delta; // flowMapOffset0
		config.value.y = config.value.x + halfCycle; // flowMapOffset1

		// Important: The distance between offsets should be always the value of "halfCycle".
		// Moreover, both offsets should be in the range of [ 0, cycle ].
		// This approach ensures a smooth water flow and avoids "reset" effects.

		if ( config.value.x >= cycle ) {
			config.value.x = 0;
			config.value.y = halfCycle;
		} else if ( config.value.y >= cycle ) {
			config.value.y = config.value.y - cycle;
		}
  }
  
  updateTextureMatrix( camera ) {

		this.textureMatrix.set(
			0.5, 0.0, 0.0, 0.5,
			0.0, 0.5, 0.0, 0.5,
			0.0, 0.0, 0.5, 0.5,
			0.0, 0.0, 0.0, 1.0
		);

		this.textureMatrix.multiply( camera.projectionMatrix );
		this.textureMatrix.multiply( camera.matrixWorldInverse );
		this.textureMatrix.multiply( this.matrixWorld );

	}
}

export default Water;