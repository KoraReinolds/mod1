import { OrbitControls } from "./jsm/controls/OrbitControls.js";
import ImageLoader from "./ImageLoader.js";
import SKULPT from "./js/skulpt/skulpt.js";
import * as THREE from "../../../build/three.module.js";

const TERRAIN_RES = 256;
const TERRAIN_SIZE = 6;
const PROXY_TERRAIN_RES = 64;
const POINTS = [ [10, 10, 10], [10, 5, 5] ];
let terrainImageSettings = { /// значения heightmap
    'points': { preblur: 3, height: 5, points: POINTS, },
    'image_1': { src: 'images/igms_679104,4595950,680128,4596974_512.jpg', preblur: 3, height: 0.3, },
    'image_2': { src: 'images/igms_693432,4598934,694456,4599958_512.jpg', preblur: 2, height: 0.3, }
};
let terrainTextures = [ /// значения текстур
  './textures/grass.jpg',
  './textures/SandBig.jpg',
]
let options = {
    terrainImage: Object.keys(terrainImageSettings)[0],
    terrainPreblur: 1.0,
    terrainHeight: 1.0,
};
let terrainGeom, terrainMesh, renderer, camera, gpuSkulpt, controls, gpuWater;
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

}

function initTerrain() {
    terrainGeom = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_RES - 1, TERRAIN_RES - 1);
    terrainGeom.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    terrainMesh = new THREE.Mesh(terrainGeom, null);
    gpuSkulpt = new SKULPT({
        renderer: renderer,
        mesh: terrainMesh,
        size: TERRAIN_SIZE,
        res: TERRAIN_RES,
        proxyRes: PROXY_TERRAIN_RES,
    });
    new THREE.TextureLoader().load(terrainTextures[0], function ( texture ) {
        gpuSkulpt.setTexture(texture);
    });
    terrainMesh.castShadow = true;
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
};

function setupEvents() {
    let canvas = renderer.domElement;
    let intersectPoint = new THREE.Vector3();
    let objectControlEnableKeyCode = 'KeyQ';
    let waterActivateKeyCode = 32;
    
    function detectIntersectionAndShowSculptCursor(event) {
        
        function detectIntersection(event) {

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
            let intersects = getIntersects( onClickPosition, scene.children );
            if ( intersects.length > 0 && intersects[0] ) {
                return intersects[0].point;
            }
            return null;
        }
        
        //detect intersection and show cursor
        intersectPoint = detectIntersection(event);
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
            detectIntersectionAndShowSculptCursor(event);
            if (intersectPoint) {
                //do actual sculpting if clicked
                if (event.button === 0) {  //LMB
                    isSculpting = true;
                    sculptTerrain(SKULPT.ADD, intersectPoint, options.sculptAmount);
                } else if (event.button === 2) {  //RMB
                    isSculpting = true;
                    sculptTerrain(SKULPT.REMOVE, intersectPoint, options.sculptAmount);
                }
                mouseDownButton = event.button;
            }

        } else {
            // for water
            if (activateDisturb) {
                //detect intersection
                intersectPoint = detectIntersection(event);
                // if (intersectPoint) {
                //     isDisturbing = true;
                //     if (event.button === 0) {  //LMB
                //         gpuWater.source(intersectPoint, options.waterSourceAmount, options.waterSourceRadius);
                //     } else if (event.button === 1) {  //MMB
                //         gpuWater.disturb(intersectPoint, WATER_DISTURB_AMOUNT, WATER_DISTURB_RADIUS);
                //     } else if (event.button === 2) {  //RMB
                //         gpuWater.source(intersectPoint, -options.waterSinkAmount, options.waterSinkRadius);
                //     }
                // }
                // mouseDownButton = event.button;
            }
        }
    }

    function window_onMouseMove(event) {

        event.preventDefault();

        if (event.altKey) {
            //detect intersection and show cursor
            detectIntersectionAndShowSculptCursor(event);
            if (intersectPoint && isSculpting) {
                if (mouseDownButton === 0) {  //LMB
                    sculptTerrain(SKULPT.ADD, intersectPoint, options.sculptAmount);
                } else if (mouseDownButton === 2) {  //RMB
                    sculptTerrain(SKULPT.REMOVE, intersectPoint, options.sculptAmount);
                }
            }
        } else {

            //for water
            if (activateDisturb && isDisturbing) {

                //detect intersection
                intersectPoint = detectIntersection(event);
                // if (intersectPoint) {
                //     if (mouseDownButton === 0) {  //LMB
                //         gpuWater.source(intersectPoint, options.waterSourceAmount, options.waterSourceRadius);
                //     } else if (mouseDownButton === 1) {  //MMB
                //         gpuWater.disturb(intersectPoint, WATER_DISTURB_AMOUNT, WATER_DISTURB_RADIUS);
                //     } else if (mouseDownButton === 2) {  //LMB
                //         gpuWater.source(intersectPoint, -options.waterSinkAmount, options.waterSinkRadius);
                //     }
                // }

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
        if (event.keyCode === waterActivateKeyCode) { //space
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
        else if (event.keyCode === waterActivateKeyCode) { //space
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
        options.terrainPreblur = opt.preBlur;
        options.terrainHeight = opt.height;
        filterTerrainImageAndGenerateHeight(data);
    });
}
function loop() {
    let dt = clock.getDelta();  //have to call this before getElapsedTime()
    // if (options.waveActive) {
    //     gpuWater.disturb(new THREE.Vector3(0.5, 0.0, 0.5), WATER_DISTURB_AMOUNT, WATER_DISTURB_RADIUS);
    // }
    // //update and render
    renderer.autoClear = false;
    renderer.clear();
    gpuSkulpt.update();
    renderer.render(scene, camera);

    // //change water height based on flood levels
    // dWaterVol = options.waterFloodVolRate * dt;
    // gpuWater.flood(dWaterVol);

    requestAnimationFrame(loop);
}

initRenderer();
initCamera();
loadImage(terrainImageSettings[options.terrainImage]);
initTerrain();
initWater();
setupEvents()
loop();

