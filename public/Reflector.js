import {
	Mesh,
	WebGLRenderTarget,
	Matrix4,
	ShaderMaterial,
  Vector4,
  Vector3,
  PerspectiveCamera,
  Plane,
} from "../../../build/three.module.js";

class Reflector extends Mesh {
  constructor( geometry ) {
    super( geometry );

    const renderTarget = new WebGLRenderTarget(512, 512);
    this.textureMatrix = new Matrix4();

    this.renderTarget = renderTarget;

    const vertexShader = `
    uniform mat4 textureMatrix;
    varying vec2 vUv;
    
    void main() {

      vUv = textureMatrix * vec4( position, 1.0 );
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
    const fragmentShader = `varying vec2 vUv;
    uniform sampler2D tDiffuse;


    void main() {
      vec3 color = texture2D(tDiffuse, vUv).xyz;
      gl_FragColor = vec4( color, 1.0 );
      
    }`;
    this.material = new ShaderMaterial({
      uniforms: {
      
        textureMatrix: {
          value: this.textureMatrix,
        },
        tDiffuse: {
          type: 'sampler2D',
          value: renderTarget.texture,
        },

      },
      vertexShader:   vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
    });

  }
	getRenderTarget() {
		return this.renderTarget;
  };
  
  onBeforeRender( renderer, scene, camera ) {
    const reflectorWorldPosition = new Vector3(); // this reflector position
    const cameraWorldPosition = new Vector3(); // camera position
    const rotationMatrix = new Matrix4(); // camera rotation matrix
    const normal = new Vector3();
    const view = new Vector3();
    const lookAtPosition = new Vector3();
    const target = new Vector3(); 
    const virtualCamera = new PerspectiveCamera();
    var reflectorPlane = new Plane();
    var clipPlane = new Vector4();
    var q = new Vector4();

    reflectorWorldPosition.setFromMatrixPosition( this.matrixWorld );
    reflectorWorldPosition.y = this.geometry.maxLvl;
    cameraWorldPosition.setFromMatrixPosition( camera.matrixWorld );
    rotationMatrix.extractRotation( this.matrixWorld );

    // rotate normal without translate
    normal.set( 0, 1, 0 );
    normal.applyMatrix4( rotationMatrix );
    
    view.subVectors( reflectorWorldPosition, cameraWorldPosition ); // distance between camera and reflector
    // if ( view.dot( normal ) > 0 ) return;
    view.reflect( normal ).negate();
		view.add( reflectorWorldPosition );
    
    rotationMatrix.extractRotation( camera.matrixWorld );

		lookAtPosition.set( 0, 0, - 1 );
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
		this.textureMatrix.set(
			0.5, 0.0, 0.0, 0.5,
			0.0, 0.5, 0.0, 0.5,
			0.0, 0.0, 0.5, 0.5,
			0.0, 0.0, 0.0, 1.0
		);
		this.textureMatrix.multiply( virtualCamera.projectionMatrix );
		this.textureMatrix.multiply( virtualCamera.matrixWorldInverse );
		this.textureMatrix.multiply( this.matrixWorld );

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
    
    this.visible = false;
		var currentRenderTarget = renderer.getRenderTarget();
		var currentXrEnabled = renderer.xr.enabled;
		var currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;
		renderer.xr.enabled = false; // Avoid camera modification
		renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows
		renderer.setRenderTarget( this.renderTarget );
		renderer.state.buffers.depth.setMask( true ); // make sure the depth buffer is writable so it can be properly cleared, see #18897
		if ( renderer.autoClear === false ) renderer.clear();
		renderer.render( scene, virtualCamera );
		renderer.xr.enabled = currentXrEnabled;
		renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
    renderer.setRenderTarget( currentRenderTarget );
    // renderer.render(scene, camera);
    this.visible = true;
  }
}

export default Reflector;