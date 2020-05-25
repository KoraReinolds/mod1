import { OrbitControls } from './jsm/controls/OrbitControls.js';
import Water from './Water.js';
import SurfaceMaterial from './SurfaceMaterial.js';
import HeightMap from './HeightMap.js';
import SurfaceGeometry from './SurfaceGeometry.js';
import {
  WebGLRenderer,
  ImageLoader,
  Scene,
  PerspectiveCamera,
  DirectionalLight,
  AmbientLight,
  Mesh,
  CubeTextureLoader,
} from "../../../build/three.module.js";

function init({ width, height, y, data }) {
  const canvas = document.querySelector('#c');
  const renderer = new WebGLRenderer({canvas});
  const size = Math.max( width, height );
  let surf;
  let camera;
  let controls;
  let waterCoords = [];
  const scene = new Scene();
  let points = [
    [10, 10, 10],
    [10, 5, 10],
  ];

  function initCamera() {
    const aspect = 2;
    const near = 0.1;
    const far = size * 5;
    const fov = 45;
    camera = new PerspectiveCamera(fov, aspect, near, far);
    camera.position.set(size * 2, size * 2, size * 2);
  }
  
  function initOrbitControls() {
    controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  function initLight(...pos) {
    const color = 0xFFFFFF;
    const intensity = 1;
    const light = new DirectionalLight(color, intensity);
    light.position.set(...pos);
    scene.add(light);
    const ambientLight = new AmbientLight( 0x404040 );
    scene.add( ambientLight );
  }

  function initSurface() {
    // const surfGeometry = new HeightMap({ x: width, y, z: height, data });
    const surfGeometry = new SurfaceGeometry({ points, size });
    surfGeometry.setHeight();
    surf = new Mesh(
      surfGeometry,
      new SurfaceMaterial(),
    );
    scene.add(surf);
  }

  function initWater() {
    const water = new Water(surf.geometry.map);
    scene.add(water);
  }

  function initSkyBox() {
    const cubeTextureLoader = new CubeTextureLoader();
    cubeTextureLoader.setPath( 'textures/cube/Park2/' );
  
    const cubeTexture = cubeTextureLoader.load( [
      "px.jpg", "nx.jpg",
      "py.jpg", "ny.jpg",
      "pz.jpg", "nz.jpg"
    ] );
  
    scene.background = cubeTexture;
  }

  initCamera();
  initOrbitControls();
  initLight(-1, 2, 4);
  initSkyBox();
  initSurface();
  initWater();

  function resizeRendererToDisplaySize(renderer) {
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
      renderer.setSize(width, height, false);
    }
    return needResize;

  }

  function render() {
    if (resizeRendererToDisplaySize(renderer)) {
      const canvas = renderer.domElement;
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    }
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
  
}

const imgLoader = new ImageLoader();
const src = './textures/hm/hm1.png';
// const src = './textures/hm/hm5.jpg';
imgLoader.load( src, function(image) {

    const { width, height } = image;
    const scaleHeight = 32;
    const scaleWidth = Math.floor(height * scaleHeight / width);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.canvas.width = image.width = scaleWidth;
    ctx.canvas.height = image.height = scaleHeight;
    ctx.drawImage(image, 0, 0, scaleWidth, scaleHeight);
    const {data} = ctx.getImageData(0, 0, scaleWidth, scaleHeight);

    init({ width: scaleWidth, height: scaleHeight, y: scaleWidth / 4, data });
  }
);


