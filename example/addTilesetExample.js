import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { GUI } from './lil-gui.module.min.js';
import { ThreejsSceneLayer, Tileset } from 'mapbox-3d-tiles';

// Set your Mapbox token here or via environment variable
const MAPBOX_TOKEN = 'pk.eyJ1IjoiamsyNzY5OTM4NTciLCJhIjoiY2x0bW5ubHViMWVnaDJtcDZlYW92aWt2eCJ9.mBXt-vny9iFy4lzC0g1gbw';

const displayPamams = {
    errorTarget: 6,
    //   errorThreshold: 60,
    maxDepth: 15,
    displayActiveTiles: false,
    autoDisableRendererCulling: true,
};

const debugParams = {
    enableDebug: true,
    displayBoxBounds: false,
    displaySphereBounds: false,
    displayRegionBounds: false,
    colorMode: 0,
};

const exampleParams = {
    reload: reloadTiles,
};

var map = null;
var scene = null;
var tileset = null;

const center = [118.91083364082562,32.116922266350315];

// 方法1：使用本地文件， new URL(relative, base) 提前计算成绝对路径
const relativePath = './data/splat-3dtiles/NNU_2_opt/tileset.json';
const tilesetUrl = new URL(relativePath, window.location.href).href;
// 方法2：使用文件服务， 需要将数据发布到服务器上，并修改url
// const tilesetUrl = 'http://localhost:8804/splat-3dtiles/NNU_2_opt/tileset.json'

const tilesetOptions = {    
    id: 'test-model1',
    url: tilesetUrl,
    isGaussianSplatting: true, // 默认为 false，如果模型有3DGS效果，请设置为 true
    maxGaussianSplatingCount: 4096 * 4096, // 当数据量大时，可调高到 8192 * 8192
    downloadMaxJobs: 4,
    parseMaxJobs: 1,
};


init();
addGUI();

animate();

function init() {
    const refCenter = center;

    map = window.map = new mapboxgl.Map({
        container: 'map',
        center: center,
        zoom: 15,
        bearing: 0,
        pitch: 0,
        style: 'mapbox://styles/mapbox/streets-v10',
        accessToken: MAPBOX_TOKEN,
    });

    map.on('load', function () {
        new mapboxgl.Marker({
            color: 'red',
        })
            .setLngLat(center)
            .addTo(map);

        scene = new ThreejsSceneLayer({
            id: 'test-scene',
            refCenter: refCenter,
        });

        map.addLayer(scene);

        reloadTiles();
    });
}

function addGUI() {
    // GUI
    const gui = new GUI();
    gui.width = 300;

    const tileOptions = gui.addFolder('Tiles Options');
    tileOptions.add(displayPamams, 'displayActiveTiles');
    tileOptions.add(displayPamams, 'autoDisableRendererCulling');
    tileOptions.add(displayPamams, 'errorTarget').min(0).max(50);
    tileOptions.add(displayPamams, 'maxDepth').min(1).max(100);
    tileOptions.open();

    const debug = gui.addFolder('Debug Options');
    debug.add(debugParams, 'enableDebug');
    debug.add(debugParams, 'displayBoxBounds');
    debug.add(debugParams, 'displaySphereBounds');
    debug.add(debugParams, 'displayRegionBounds');
    debug.add(debugParams, 'colorMode', Tileset.getColorModes());
    debug.open();

    gui.add(exampleParams, 'reload');
    gui.open();
}

function animate() {
    requestAnimationFrame(animate);
    if (tileset) {
        tileset.setDebugParams(debugParams);
        tileset.setDisplayParams(displayPamams);
    }
}

function reloadTiles() {
    if (tileset) {
        tileset.remove();
    }

    tileset = scene.addTileset(tilesetOptions);

    tileset.position.set(0,0,-30);
}
