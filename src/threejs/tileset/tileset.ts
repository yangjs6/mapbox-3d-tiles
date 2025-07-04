import { TilesRenderer } from '3d-tiles-renderer';
import {
    DebugTilesPlugin,
    UnloadTilesPlugin,
    ImplicitTilingPlugin,
    ColorMode,
    // GLTFExtensionsPlugin,
} from '3d-tiles-renderer/plugins';

import { GLTFExtensionsPlugin } from './plugins/GLTFExtensionsPlugin';
import { TilesCachePlugin } from './plugins/TilesCachePlugin';
import { UrlParamsPlugin } from './plugins/UrlParamsPlugin';

import { LngLatLike } from 'mapbox-gl';
import { WebGLRenderer, PerspectiveCamera, Box3, Vector3, Matrix4, Group, Sphere } from 'three';

import ThreejsUtils from '../threejs-utils';
import { LoaderUtils } from '../utils/LoaderUtils';
import { GLTFGaussianSplattingExtension } from '../splats/GLTFGaussianSplattingExtension';
import { SceneObject } from '../object/scene-object';
import ThreejsSceneLayer from '../threejs-scene';

// color modes
const NONE = 0;
const SCREEN_ERROR = 1;
const GEOMETRIC_ERROR = 2;
const DISTANCE = 3;
const DEPTH = 4;
const RELATIVE_DEPTH = 5;
const IS_LEAF = 6;
const RANDOM_COLOR = 7;
const RANDOM_NODE_COLOR = 8;
const CUSTOM_COLOR = 9;
const LOAD_ORDER = 10;

const ColorModes = Object.freeze({
    NONE,
    SCREEN_ERROR,
    GEOMETRIC_ERROR,
    DISTANCE,
    DEPTH,
    RELATIVE_DEPTH,
    IS_LEAF,
    RANDOM_COLOR,
    RANDOM_NODE_COLOR,
    CUSTOM_COLOR,
    LOAD_ORDER,
});

export type TilesetDebugParams = {
    enableDebug: boolean;
    displayBoxBounds: boolean;
    displaySphereBounds: boolean;
    displayRegionBounds: boolean;
    colorMode: number;
};

export type TilesetDisplayParams = {
    errorTarget: number;
    errorThreshold: number;
    displayActiveTiles: boolean;
    autoDisableRendererCulling: boolean;
    maxDepth: number;
    optimizeRaycast: boolean;
};

export type TilesetOptions = {
    id: string;
    url: string;

    dracoLoaderPath?: string;
    ktx2LoaderPath?: string;

    debug?: TilesetDebugParams;
    display?: TilesetDisplayParams;
};

export default class Tileset extends SceneObject {
    group: Group | undefined;
    tiles: TilesRenderer | undefined;
    options: TilesetOptions;

    static getColorModes() {
        return ColorModes;
    }

    private centerLngLat: LngLatLike | undefined;

    constructor(options: TilesetOptions) {
        super();

        this.options = options;
        this.group = undefined;
        this.tiles = undefined;
        this.centerLngLat = undefined;
    }

    override addToScene(scene: ThreejsSceneLayer): this {
        const renderer = scene.getWebGLRenderer();
        const camera = scene.getCamera();

        const rootGroup = new Group();
        this.add(rootGroup);

        const dracoLoader = LoaderUtils.getDracoLoader(this.options.dracoLoaderPath);
        const ktxLoader = LoaderUtils.getKtxLoader(this.options.ktx2LoaderPath);
        ktxLoader.detectSupport(renderer);

        const tiles = new TilesRenderer(this.options.url);
        tiles.registerPlugin(new DebugTilesPlugin());
        tiles.registerPlugin(new UnloadTilesPlugin());
        tiles.registerPlugin(new TilesCachePlugin());
        tiles.registerPlugin(new UrlParamsPlugin());
        tiles.registerPlugin(new ImplicitTilingPlugin());
        tiles.registerPlugin(
            new GLTFExtensionsPlugin({
                rtc: true,
                autoDispose: false,
                dracoLoader,
                ktxLoader,
                plugins: [(parser) => new GLTFGaussianSplattingExtension(parser, camera)],
            }),
        );

        tiles.fetchOptions.mode = 'cors';
        tiles.autoDisableRendererCulling = true;

        tiles.setCamera(camera);
        tiles.setResolutionFromRenderer(camera, renderer);

        rootGroup.add(tiles.group);

        this.centerLngLat = undefined;
        tiles.addEventListener('load-tile-set', () => {
            this.updateTilesetTransform();
        });

        this.tiles = tiles;
        this.group = rootGroup;

        if (this.options.debug) {
            this.setDebugParams(this.options.debug);
        }

        if (this.options.display) {
            this.setDisplayParams(this.options.display);
        }

        return super.addToScene(scene);
    }

    override removeFromScene(): this {
        if (this.group && this.tiles) {
            this.group.remove(this.tiles.group);
            this.tiles.dispose();
            this.remove(this.group);
        }
        this.group = undefined;
        this.tiles = undefined;
        return super.removeFromScene();
    }

    override updateSceneTime(time: number, delta: number) {
        const tiles = this.tiles;
        if (!tiles) {
            return;
        }
        tiles.update();
    }

    getCenterLngLat(): LngLatLike {
        return this.centerLngLat || { lat: 0, lon: 0 };
    }

    updateTilesetTransform() {
        const rootGroup = this.group;
        const tiles = this.tiles;

        if (!rootGroup || !tiles || !tiles.root) {
            return;
        }
        const refCenter = this._scene.getRefCenter();

        // update tiles center

        let box = new Box3();
        let sphere = new Sphere();
        let center = new Vector3();
        if (tiles.getBoundingBox(box)) {
            box.getCenter(center);
        } else if (tiles.getBoundingSphere(sphere)) {
            center = sphere.center;
        } else {
            return;
        }

        let centerLngLat = { lat: 0, lon: 0, height: 0 };
        centerLngLat = tiles.ellipsoid.getPositionToCartographic(center, centerLngLat);

        const modelMatrix = tiles.ellipsoid.getEastNorthUpFrame(centerLngLat.lat, centerLngLat.lon, new Matrix4());

        const fromFixedFrameMatrix = tiles.ellipsoid.getEastNorthUpFrame(ThreejsUtils.degToRad(refCenter[1]), ThreejsUtils.degToRad(refCenter[0]), new Matrix4());

        const toFixedFrameMatrix = fromFixedFrameMatrix.invert();
        const refMatrix = toFixedFrameMatrix.multiply(modelMatrix);
        // refMatrix.decompose(
        //   rootGroup.position,
        //   rootGroup.quaternion,
        //   rootGroup.scale
        // );
        // rootGroup.matrix.copy(refMatrix);
        // // rootGroup.matrixAutoUpdate = false;

        const tileCenterScenePosition = this._scene.toScenePosition([ThreejsUtils.radToDeg(centerLngLat.lon), ThreejsUtils.radToDeg(centerLngLat.lat)]);
        rootGroup.position.set(tileCenterScenePosition.x, tileCenterScenePosition.y, tileCenterScenePosition.z);

        const modelMatrixInvert = modelMatrix.clone().invert();
        modelMatrixInvert.decompose(tiles.group.position, tiles.group.quaternion, tiles.group.scale);

        tiles.group.matrix.copy(modelMatrixInvert);
        // tiles.group.matrixAutoUpdate = false;

        this.centerLngLat = {
            lon: ThreejsUtils.radToDeg(centerLngLat.lon),
            lat: ThreejsUtils.radToDeg(centerLngLat.lat),
        };
    }

    setDebugParams(debugParams: TilesetDebugParams) {
        if (!this.tiles) {
            return;
        }
        const plugin = this.tiles.getPluginByName('DEBUG_TILES_PLUGIN') as DebugTilesPlugin;
        if (!plugin) {
            return;
        }

        const params = { ...this.options.debug, ...debugParams };

        if (params.enableDebug !== undefined) plugin.enabled = debugParams.enableDebug;
        if (params.displayBoxBounds !== undefined) plugin.displayBoxBounds = debugParams.displayBoxBounds;
        if (params.displaySphereBounds !== undefined) plugin.displaySphereBounds = debugParams.displaySphereBounds;
        if (params.displayRegionBounds !== undefined) plugin.displayRegionBounds = debugParams.displayRegionBounds;
        if (params.colorMode !== undefined) plugin.colorMode = debugParams.colorMode as ColorMode;

        this.options.debug = params;
    }

    setDisplayParams(displayParams: TilesetDisplayParams) {
        if (!this.tiles) {
            return;
        }

        const tiles: TilesRenderer = this.tiles;
        const params = { ...this.options.display, ...displayParams };

        if (params.errorTarget !== undefined) tiles.errorTarget = params.errorTarget;
        if (params.errorThreshold !== undefined) tiles.errorThreshold = params.errorThreshold;
        if (params.displayActiveTiles !== undefined) tiles.displayActiveTiles = params.displayActiveTiles;
        if (params.autoDisableRendererCulling !== undefined) tiles.autoDisableRendererCulling = params.autoDisableRendererCulling;
        if (params.maxDepth !== undefined) tiles.maxDepth = params.maxDepth;
        if (params.optimizeRaycast !== undefined) tiles.optimizeRaycast = params.optimizeRaycast;

        this.options.display = params;
    }
}
