import { OrbitControls } from "./js/threejs/OrbitControls.js";
import ImageLoader from "./ImageLoader.js";
import dat from "./js/dat.gui/dat.gui.module.js";
import SKULPT from "./js/GpuSculpt.js";
import GpuPipeModelWater from "./js/GpuPipeModelWater.js";
import * as THREE from "./build/three.module.js";

const TERRAIN_RES = 256, WATER_RES = 256;
const TERRAIN_SIZE = 6, WATER_SIZE = 6;
const WATER_DENSITY = 1000;
const PROXY_TERRAIN_RES = 64;
const POINTS = [ [10, 10, 10], [10, 5, 5] ];
let skyBoxTextures = {
	park: "Park2",
	bridge: "Bridge2",
	space: "MilkyWay",
	parkWinter: "Park3Med",
	castle: "SwedishRoyalCastle",
};
let terrainImageSettings = {
	'points': { src: 'points', preblur: 2, height: 5, points: POINTS, },
	'image_1': { src: 'textures/hm/hm1.png', preblur: 1, height: 3.0, },
	'image_2': { src: 'textures/hm/hm2.jpg', preblur: 5, height: 1.0, },
	'image_3': { src: 'textures/hm/hm3.jpg', preblur: 4, height: 3.0, },
	'image_4': { src: 'textures/hm/hm4.png', preblur: 1, height: 3.0, },
	'image_5': { src: 'textures/hm/hm5.jpg', preblur: 5, height: 1.0, },
	'image_6': { src: 'textures/hm/hm6.png', preblur: 1, height: 3.0, },
};
let terrainTextures = {
  grass: './textures/grass.jpg',
  sand: './textures/SandBig.jpg',
};
let terrainGeom, terrainMesh, renderer, camera, gpuSkulpt, controls, gpuWater, waterGeom, waterMesh;
let options = {
	skyBoxTexture: Object.keys(skyBoxTextures)[0],
	terrainImage: Object.keys(terrainImageSettings)[0],
	terrainTexture: Object.keys(terrainTextures)[0],
	terrainPreblur: 1.0,
	terrainHeight: 1.0,
	waterSourceAmount: 0.08,
	waterSourceSizeX: 0.1,
	waterSourceSizeY: 0.1,
	waterFloodVolRate: 0.0,
	waterResetFloodRate: function () {
		options.waterFloodVolRate = 0.0;
	},
	sculptSize: 0.3,
	sculptAmount: 0.08,
	sculptClearSculpts: function () {
		gpuSkulpt.clear();
	},
};
let clock = new THREE.Clock();
let scene = new THREE.Scene();
let imageLoader = new ImageLoader({ width: TERRAIN_RES, height: TERRAIN_RES })

function initRenderer() {
	renderer = new THREE.WebGLRenderer({
		antialias : true
	});
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setClearColor('#111111', 1);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFShadowMap;
	renderer.shadowMapSoft = true;
	renderer.domElement.id = 'threejs-canvas';
	document.getElementById('threejs-container').append(renderer.domElement);
}

function initCamera() {
	camera = new THREE.PerspectiveCamera(25, renderer.domElement.width / renderer.domElement.height, 0.1, 1000);
	camera.position.set(15, 15, 15);
	camera.lookAt(new THREE.Vector3(0, 0, 0));
	controls = new OrbitControls(camera, renderer.domElement);
	controls.enabled = false;
	controls.target.set(0, 0, 0);
	controls.update();
}

function initWater() {
	//create a plane for height field water sim
	waterGeom = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_RES - 1, WATER_RES - 1);
	waterGeom.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
	waterMesh = new THREE.Mesh(waterGeom, new THREE.MeshPhongMaterial({ color: '#fff' }));
	waterMesh.castShadow = true;
	waterMesh.receiveShadow = true;
	waterMesh.type = 'water';
	gpuWater = new GpuPipeModelWater({
		camera: camera,
		renderer: renderer,
		scene: scene,
		mesh: waterMesh,
		size: WATER_SIZE,
		res: WATER_RES,
		dampingFactor: 0.995,
		initialWaterHeight: 2.5,
		terrainTexture: gpuSkulpt.getSculptDisplayTexture(),
		density: WATER_DENSITY,
	})
	scene.add(waterMesh);
}

function initTerrain() {
	terrainGeom = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_RES - 1, TERRAIN_RES - 1);
	terrainGeom.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
	terrainMesh = new THREE.Mesh(terrainGeom, null);
	terrainMesh.type = 'terrain';
	gpuSkulpt = new SKULPT({
		renderer: renderer,
		mesh: terrainMesh,
		size: TERRAIN_SIZE,
		res: TERRAIN_RES,
		proxyRes: PROXY_TERRAIN_RES,
	});
	new THREE.TextureLoader().load(terrainTextures[options.terrainTexture], function ( texture ) {
		gpuSkulpt.setTexture(texture);
	});
	terrainMesh.castShadow = true;
	terrainMesh.receiveShadow = true;
	scene.add(terrainMesh);
};

function loadSkyBox(dir) {
	const cubeTextureLoader = new THREE.CubeTextureLoader();
	cubeTextureLoader.setPath( `textures/cube/${dir}/` );

	const cubeTexture = cubeTextureLoader.load( [
		"px.jpg", "nx.jpg",
		"py.jpg", "ny.jpg",
		"pz.jpg", "nz.jpg"
	] );

	scene.background = cubeTexture;
}

function setupEvents() {
	let canvas = renderer.domElement;
	let intersectPoint = new THREE.Vector3();
	let objectControlEnableKeyCode = 'KeyQ';
	let waterActivateKeyCode = 32;
	
	function detectIntersection(event, mesh) {

		let raycaster = new THREE.Raycaster();
		let onClickPosition = new THREE.Vector2();
		let mouse = new THREE.Vector2();
		let getMousePosition = function ( dom, x, y ) {
			let rect = dom.getBoundingClientRect();
			return [ ( x - rect.left ) / rect.width, ( y - rect.top ) / rect.height ];
		};
		let getIntersects = function ( point, objects ) {
			mouse.set( ( point.x * 2 ) - 1, - ( point.y * 2 ) + 1 );
			raycaster.setFromCamera( mouse, camera );
			return raycaster.intersectObjects( objects );
		};
		event.preventDefault();
		onClickPosition.fromArray( getMousePosition( renderer.domElement, event.clientX, event.clientY ) );

		let intersects = getIntersects( onClickPosition, [mesh] );
		if ( intersects.length > 0 && intersects[0] ) return intersects[0].point;
		return null;
	}

	function detectIntersectionAndShowSculptCursor(event, mesh) {	
		//detect intersection and show cursor
		intersectPoint = detectIntersection(event, mesh);
		if (intersectPoint) {
			//show cursor at intersection point
			gpuSkulpt.updateCursor(intersectPoint);
			gpuSkulpt.showCursor();
		} else {
			//cursor is out of terrain, so hide it, otherwise it will remain at the edge
			gpuSkulpt.hideCursor();
		}
	}

	let activateDisturb = false;
	let isSculpting = false;
	let isDisturbing = false;
	let mouseDownButton = -1;  //firefox hack (unable to detect RMB during mousemove event)
	function window_onMouseDown(event) {

		if (event.altKey) {

			//detect intersection and show cursor
			detectIntersectionAndShowSculptCursor(event, terrainMesh);
			if (intersectPoint) {
				//do actual sculpting if clicked
				if (event.button === 0) {  //LMB
					isSculpting = true;
					let type = options.sculptAmount > 0 ? SKULPT.ADD : SKULPT.REMOVE;
					sculptTerrain(type, intersectPoint, options.sculptAmount);
				}
				mouseDownButton = event.button;
			}
		} else {
			// for water
			if (activateDisturb) {
				//detect intersection
				intersectPoint = detectIntersection(event, waterMesh);
				if (intersectPoint) {
					isDisturbing = true;
					if (event.button === 0) {  //LMB
						gpuWater.source(intersectPoint,
							options.waterSourceAmount,
							options.waterSourceSizeX,
							options.waterSourceSizeY);
					}
				}
				mouseDownButton = event.button;
			}
		}
	}

	function window_onMouseMove(event) {

		event.preventDefault();

		if (event.altKey) {
			//detect intersection and show cursor
			detectIntersectionAndShowSculptCursor(event, terrainMesh);
			if (intersectPoint && isSculpting) {
				if (mouseDownButton === 0) {  //LMB
					let type = options.sculptAmount > 0 ? SKULPT.ADD : SKULPT.REMOVE;
					sculptTerrain(type, intersectPoint, options.sculptAmount);
				}
			}
		} else {
			//for water
			if (activateDisturb && isDisturbing) {
				//detect intersection
				intersectPoint = detectIntersection(event, waterMesh);
				if (intersectPoint) {
					if (mouseDownButton === 0) {  //LMB
						gpuWater.source(intersectPoint,
							options.waterSourceAmount,
							options.waterSourceSizeX,
							options.waterSourceSizeY);
					}
				}
			}
		}

	}

	function window_onMouseUp(event) {
		isSculpting = false;
		isDisturbing = false;
		mouseDownButton = -1;
	}

	function window_onResize(event) {
		//update camera projection
		camera.aspect = window.innerWidth / (window.innerHeight);
		camera.updateProjectionMatrix();
		//update renderer size
		renderer.setSize(window.innerWidth, window.innerHeight);
	}

	function window_onKeyDown(event) {
		if (event.keyCode === waterActivateKeyCode) {
			activateDisturb = true; //for water
		}
		else if (event.code === objectControlEnableKeyCode) {
			controls.enabled = true;
		};
	}

	function window_onKeyUp(event) {
		if (event.keyCode === 18) { //alt or option(mac)
			gpuSkulpt.hideCursor(); //for sculpting
		}
		else if (event.keyCode === waterActivateKeyCode) {
			activateDisturb = false; //for water
		}
		else if (event.code === objectControlEnableKeyCode) {
			controls.enabled = false;
		};
	}

	window.addEventListener('resize', window_onResize, false);
	window.addEventListener('keydown', window_onKeyDown, false);
	window.addEventListener('keyup', window_onKeyUp, false);

	//call window resize once during init to force correct aspect ratio
	window_onResize();

	//attach events to the canvas so that we can get the relative mouse coordinates inside it
	canvas.addEventListener('mousedown', window_onMouseDown, false);
	canvas.addEventListener('mousemove', window_onMouseMove, false);
	canvas.addEventListener('mouseup', window_onMouseUp, false);
	canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); }, false);
}


function filterTerrainImageAndGenerateHeight(data) {
	gpuSkulpt.loadFromImageData(data, options.terrainHeight);
}

function sculptTerrain(type, position, amount) {
	gpuSkulpt.sculpt(type, position, amount);
}

function loadImage(opt) {
	imageLoader.load(opt).then((data) => {
		options.terrainPreblur = opt.preblur;
		options.terrainHeight = opt.height;
		filterTerrainImageAndGenerateHeight(data);
	});
}

function setupGui() {
	let gui = new dat.GUI({width: 300});

	gui.add(options, 'skyBoxTexture', Object.keys(skyBoxTextures))
		.name('Background texture')
		.listen()
		.onChange(function(value) {
			loadSkyBox(skyBoxTextures[value]);
		})

	//Terrain folder
	let terrainFolder = gui.addFolder('Terrain');
	terrainFolder.open();

	terrainFolder.add(options, 'terrainTexture', Object.keys(terrainTextures))
	.name('Terrain texture')
	.listen()
	.onChange(function(value) {
		new THREE.TextureLoader().load(terrainTextures[value], function ( texture ) {
			gpuSkulpt.setTexture(texture);
		});
	})

	terrainFolder
		.add(options, 'terrainImage', Object.keys(terrainImageSettings))
		.name('Image')
		.onChange(function (value) {
			loadImage(terrainImageSettings[value]);
		})

	terrainFolder
		.add(options, 'terrainPreblur', 0, 10)
		.name('Pre-Blur')
		.listen()
		.onChange(function (value) {
			imageLoader.changePreBlur(value);
			filterTerrainImageAndGenerateHeight(imageLoader.getData());
		})

	terrainFolder
		.add(options, 'terrainHeight', 0, TERRAIN_SIZE)
		.name('Height')
		.listen()
		.onChange(function (value) {
			gpuSkulpt.loadFromImageData(imageLoader.getData(), options.terrainHeight);
		})

	//Sculpt folder
	let sculptFolder = gui.addFolder('Sculpt');
	sculptFolder.open();

	sculptFolder.add(options, 'sculptSize', 0.1, 10.0)
		.name('Size')
		.listen()
		.onChange(function (value) {
			gpuSkulpt.setBrushSize(value);
		});
		
		sculptFolder.add(options, 'sculptAmount', -0.2, 0.2)
		.step(0.01)
		.name('Amount')
		.listen()
		.onChange(function (value) {
			gpuSkulpt.setBrushAmount(value);
		});
		
		sculptFolder
		.add(options, 'sculptClearSculpts')
		.name('Clear Sculpts');
		
	//Water folder
	let waterFolder = gui.addFolder('Water');
	waterFolder.open();
		
	waterFolder.add(options, 'waterFloodVolRate', -10, 10)
		.name('Flood Vol Rate')
		.step(0.1)
		.listen()

	waterFolder.add(options, 'waterResetFloodRate')
		.name('Reset Flood Rate');

	waterFolder.add(options, 'waterSourceSizeX', 0.1, 0.5)
		.name('Source Size X')
		.listen()
		.onChange(function(value) {
			options.waterSourceSizeY = Math.min(options.waterSourceSizeY, 0.6 - value)
		})

	waterFolder.add(options, 'waterSourceSizeY', 0.1, 0.5)
		.name('Source Size Y')
		.listen()
		.onChange(function(value) {
			options.waterSourceSizeX = Math.min(options.waterSourceSizeX, 0.6 - value)
		})

	waterFolder.add(options, 'waterSourceAmount', -0.2, 0.2)
		.name('Source Amount')
		.listen()
		
}


function loop() {
	let dt = clock.getDelta();  //have to call this before getElapsedTime()
	// //update and render
	renderer.autoClear = false;
	renderer.clear();
	gpuSkulpt.update();
	gpuWater.update(dt);
	renderer.render(scene, camera);
	//change water height based on flood levels
	gpuWater.flood(options.waterFloodVolRate * dt);
	requestAnimationFrame(loop);
}

initRenderer();
initCamera();
loadImage(terrainImageSettings[options.terrainImage]);
initTerrain();
initWater();
loadSkyBox(skyBoxTextures[options.skyBoxTexture]);
setupEvents();
setupGui();

loop();

