import * as THREE from 'three';
import {TrackballControls} from 'three/examples/jsm/controls/TrackballControls';
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader';

import {addOctreeToThree} from './ThreeOctree2';

let camera, scene, renderer;
let controls, stats;
let tracker;
let octree;
let objects = [];
let objectsSearch = [];
let totalFaces = 0;
let simpleMeshCount = 500;
let radius = 50;
let radiusMax = radius * 10;
let radiusMaxHalf = radiusMax * 0.5;
let radiusSearch = radius * 0.75;
let baseColor = 0x333333;
let foundColor = 0x12C0E3;
let intersectColor = 0x00D66B;
let clock = new THREE.Clock();
let searchDelay = 1;
let searchInterval = 0;
let useOctree = true;

let mouse = new THREE.Vector2();
let intersected;

init();
animate();


function init() {
  // add octree feature to three by Jaeyoon Jeong
  addOctreeToThree(THREE);

  // standard three scene, camera, renderer
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
      75, window.innerWidth / window.innerHeight, 1, radius * 100);
  camera.position.z = radius * 10;
  scene.add(camera);
  renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  // create octree
  octree = new THREE.Octree({
    // uncomment below to see the octree (may kill the fps)
    // scene: scene,
    // when undeferred = true, objects are inserted immediately
    // instead of being deferred until next octree.update() call
    // this may decrease performance as it forces a matrix update
    undeferred: false,
    // set the max depth of tree
    depthMax: Infinity,
    // max number of objects before nodes split or merge
    objectsThreshold: 8,
    // percent between 0 and 1 that nodes will overlap each other
    // helps insert objects that lie over more than one node
    overlapPct: 0.15
  });

  // lights
  let ambient = new THREE.AmbientLight(0x101010);
  scene.add(ambient);
  let directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(1, 1, 2).normalize();
  scene.add(directionalLight);
  // create all objects
  let simpleGeometry = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < simpleMeshCount - 1; i++) {
    totalFaces += simpleGeometry.faces.length;
    let simpleMaterial = new THREE.MeshBasicMaterial();
    simpleMaterial.color.setHex(baseColor);
    modifyOctree(simpleGeometry, simpleMaterial, false, true, true, true);
  }
  // let loader = new THREE.JSONLoader();
  let loader = new STLLoader();
  loader.load('/lucy.stl', function(geometry) {
    let geo = null;
    if (geometry.isBufferGeometry) {
      geo = new THREE.Geometry();
      geo = geo.fromBufferGeometry(geometry);
      geo.mergeVertices();
    } else {
      geo = geometry;
    }

    geo.computeVertexNormals();

    totalFaces += geo.faces.length;
    let material = new THREE.MeshPhongMaterial(
        {color: 0x030303, specular: 0x030303, shininess: 30});
    modifyOctree(geo, material, true);
  });


  // camera controls
  controls = new TrackballControls(camera);
  controls.rotateSpeed = 1.0;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.8;
  controls.noZoom = false;
  controls.noPan = false;
  controls.staticMoving = true;
  controls.dynamicDampingFactor = 0.3;
  // info
  let info = document.createElement('div');
  info.style.position = 'absolute';
  info.style.top = '0';
  info.style.width = '100%';
  info.style.textAlign = 'center';
  info.style.padding = '10px';
  info.style.background = '#FFFFFF';
  info.innerHTML =
      '<a href="http://threejs.org" target="_blank">three.js</a> webgl - octree (raycasting performance) - by <a href="http://github.com/collinhover/threeoctree" target="_blank">collinhover</a><br><small style="opacity:0.5">Lucy model from <a href="http://graphics.stanford.edu/data/3Dscanrep/">Stanford 3d scanning repository</a>(decimated with <a href="http://meshlab.sourceforge.net/">Meshlab</a>)</small>';
  document.body.appendChild(info);

  // stats
  stats = new Stats();
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.top = '0';
  stats.domElement.style.left = '0';
  stats.domElement.style.zIndex = 100;
  document.body.appendChild(stats.domElement);

  // bottom container
  let container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.bottom = '0';
  container.style.width = '100%';
  container.style.textAlign = 'center';
  document.body.appendChild(container);

  // tracker
  tracker = document.createElement('div');
  tracker.style.width = '100%';
  tracker.style.padding = '10px';
  tracker.style.background = '#FFFFFF';
  container.appendChild(tracker);

  // octree use toggle
  let toggle = document.createElement('div');
  toggle.style.position = 'absolute';
  toggle.style.bottom = '100%';
  toggle.style.width = '100%';
  toggle.style.padding = '10px';
  toggle.style.background = '#FFFFFF';
  container.appendChild(toggle);
  let checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.name = 'octreeToggle';
  checkbox.value = 'value';
  checkbox.id = 'octreeToggle';
  checkbox.checked = true;

  let label = document.createElement('label')
  label.htmlFor = 'octreeToggle';
  label.appendChild(document.createTextNode('Use Octree'));
  toggle.appendChild(checkbox);
  toggle.appendChild(label);
  // events
  checkbox.addEventListener('click', toggleOctree, false);
  renderer.domElement.addEventListener('mousemove', onDocumentMouseMove, false);
  window.addEventListener('resize', onWindowResize, false);
}

function toggleOctree() {
  useOctree = !useOctree;
}

function animate() {
  // note: three.js includes requestAnimationFrame shim
  requestAnimationFrame(animate);
  render();
  stats.update();
}

function render() {
  controls.update();
  renderer.render(scene, camera);
  // update octree post render
  // this ensures any objects being added
  // have already had their matrices updated
  octree.update();
}

function modifyOctree(
    geometry, material, useFaces, randomPosition?, randomRotation?, randomScale?
) {
  let mesh;
  if (geometry) {
    // create new object
    mesh = new THREE.Mesh(geometry, material);
    // give new object a random position, rotation, and scale
    if (randomPosition) {
      mesh.position.set(
          Math.random() * radiusMax - radiusMaxHalf,
          Math.random() * radiusMax - radiusMaxHalf,
          Math.random() * radiusMax - radiusMaxHalf);
    }
    if (randomRotation) {
      mesh.rotation.set(
          Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI,
          Math.random() * 2 * Math.PI);
    }
    if (randomScale) {
      mesh.scale.x = mesh.scale.y = mesh.scale.z =
          Math.random() * radius * 0.1 + radius * 0.05;
    }
    // add new object to octree and scene
    // NOTE: octree object insertion is deferred until after the next render
    // cycle
    octree.add(mesh, {useFaces: useFaces});
    scene.add(mesh);
    // store object
    objects.push(mesh);
    /*
    // octree details to console
    console.log( '
    ============================================================================================================');
    console.log( ' OCTREE: ', octree );
    console.log( ' ... depth ', octree.depth, ' vs depth end?',
    octree.depthEnd() ); console.log( ' ... num nodes: ', octree.nodeCountEnd()
    ); console.log( ' ... total objects: ', octree.objectCountEnd(), ' vs tree
    objects length: ', octree.objects.length ); console.log( '
    ============================================================================================================');
    console.log( ' ');
    // print full octree structure to console
    octree.toConsole();
    */
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onDocumentMouseMove(event) {
  // event.preventDefault();
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  let vector = new THREE.Vector3(mouse.x, mouse.y, 0.5);


  let raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  let octreeObjects;
  let numObjects;
  let numFaces = 0;
  let intersections;
  if (useOctree) {
    octreeObjects = octree.search(
        raycaster.ray.origin, raycaster.far, true, raycaster.ray.direction);
    intersections = raycaster.intersectOctreeObjects(octreeObjects);
    numObjects = octreeObjects.length;
    for (let i = 0, il = numObjects; i < il; i++) {
      numFaces += octreeObjects[i].faces.length;
    }
  } else {
    intersections = raycaster.intersectObjects(objects);
    numObjects = objects.length;
    numFaces = totalFaces;
  }
  if (intersections.length > 0) {
    if (intersected != intersections[0].object) {
      if (intersected) intersected.material.color.setHex(baseColor);
      intersected = intersections[0].object;
      intersected.material.color.setHex(intersectColor);
    }
    document.body.style.cursor = 'pointer';
  } else if (intersected) {
    intersected.material.color.setHex(baseColor);
    intersected = null;
    document.body.style.cursor = 'auto';
  }
  // update tracker
  tracker.innerHTML = (useOctree ? 'Octree search' : 'Search without octree') +
      ' using infinite ray from camera found [ ' + numObjects + ' / ' +
      objects.length + ' ] objects, [ ' + numFaces + ' / ' + totalFaces +
      ' ] faces, and [ ' + intersections.length + ' ] intersections.';
}
