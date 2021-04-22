import { GameRoot } from "../game/root";
import { clearBufferBacklog, freeCanvas, getBufferStats, makeOffscreenBuffer } from "./buffer_utils";
import { createLogger } from "./logging";
import { round1Digit } from "./utils";

/**
 * @typedef {{
 *  canvas: HTMLCanvasElement,
 *  context: CanvasRenderingContext2D,
 *  lastUse: number,
 * }} CacheEntry
 */

const logger = createLogger("buffers");

const bufferGcDurationSeconds = 0.5;

export class BufferMaintainer {
    /**
     * @param {GameRoot} root
     */
    constructor(root) {
        this.root = root;

        /** @type {Map<string, Map<string, CacheEntry>>} */
        this.cache = new Map();

        this.iterationIndex = 1;
        this.lastIteration = 0;

        this.root.signals.gameFrameStarted.add(this.update, this);
        localBufferProvider = this;
    }

    /**
     * Returns the buffer stats
     */
    getStats() {
        let stats = {
            rootKeys: 0,
            subKeys: 0,
            vramBytes: 0,
        };
        this.cache.forEach((subCache, key) => {
            ++stats.rootKeys;

            subCache.forEach((cacheEntry, subKey) => {
                ++stats.subKeys;

                const canvas = cacheEntry.canvas;
                stats.vramBytes += canvas.width * canvas.height * 4;
            });
        });

        return stats;
    }

    /**
     * Goes to the next buffer iteration, clearing all buffers which were not used
     * for a few iterations
     */
    garbargeCollect() {
        let totalKeys = 0;
        let deletedKeys = 0;
        const minIteration = this.iterationIndex;

        this.cache.forEach((subCache, key) => {
            let unusedSubKeys = [];

            // Filter sub cache
            subCache.forEach((cacheEntry, subKey) => {
                if (cacheEntry.lastUse < minIteration) {
                    unusedSubKeys.push(subKey);
                    freeCanvas(cacheEntry.canvas);
                    ++deletedKeys;
                } else {
                    ++totalKeys;
                }
            });

            // Delete unused sub keys
            for (let i = 0; i < unusedSubKeys.length; ++i) {
                subCache.delete(unusedSubKeys[i]);
            }
        });

        // Make sure our backlog never gets too big
        clearBufferBacklog();

        // if (G_IS_DEV) {
        //     const bufferStats = getBufferStats();
        //     const mbUsed = round1Digit(bufferStats.vramUsage / (1024 * 1024));
        //     logger.log(
        //         "GC: Remove",
        //         (deletedKeys + "").padStart(4),
        //         ", Remain",
        //         (totalKeys + "").padStart(4),
        //         "(",
        //         (bufferStats.bufferCount + "").padStart(4),
        //         "total",
        //         ")",

        //         "(",
        //         (bufferStats.backlogSize + "").padStart(4),
        //         "backlog",
        //         ")",

        //         "VRAM:",
        //         mbUsed,
        //         "MB"
        //     );
        // }

        ++this.iterationIndex;
    }

    update() {
        const now = this.root.time.realtimeNow();
        if (now - this.lastIteration > bufferGcDurationSeconds) {
            this.lastIteration = now;
            this.garbargeCollect();
        }
    }

    /**
     * @param {object} param0
     * @param {string} param0.key
     * @param {string} param0.subKey
     * @param {number} param0.w
     * @param {number} param0.h
     * @param {number} param0.dpi
     * @param {function(HTMLCanvasElement, CanvasRenderingContext2D, number, number, number, object?) : void} param0.redrawMethod
     * @param {object=} param0.additionalParams
     * @returns {HTMLCanvasElement}
     *
     */
    getForKey({ key, subKey, w, h, dpi, redrawMethod, additionalParams }) {
        // First, create parent key
        let parent = this.cache.get(key);
        if (!parent) {
            parent = new Map();
            this.cache.set(key, parent);
        }

        // Now search for sub key
        const cacheHit = parent.get(subKey);
        if (cacheHit) {
            cacheHit.lastUse = this.iterationIndex;
            return cacheHit.canvas;
        }

        // Need to generate new buffer
        const effectiveWidth = w * dpi;
        const effectiveHeight = h * dpi;

        const [canvas, context] = makeOffscreenBuffer(effectiveWidth, effectiveHeight, {
            reusable: true,
            label: "buffer-" + key + "/" + subKey,
            smooth: true,
        });

        redrawMethod(canvas, context, w, h, dpi, additionalParams);

        parent.set(subKey, {
            canvas,
            context,
            lastUse: this.iterationIndex,
        });
        return canvas;
    }

    // TODO let's reuse the cache system here, and similar to what we did with fullArgs, only cache if it's used several times
    static DrawImageOpto() {
        // TODO get DPI, this is actually important
    }

    /**
     * Similar to getForKey but with less parameters, and no callback
     * @param {object} param0
     * @param {string} param0.key
     * @param {string} param0.subKey
     * @param {number} param0.w
     * @param {number} param0.h
     * @returns {[HTMLCanvasElement, CanvasRenderingContext2D bool]}
     *
     */
    getCachedOrCreate({ key, subKey, w, h, redrawMethod }) {
        // First, create parent key
        let parent = this.cache.get(key);
        if (!parent) {
            parent = new Map();
            this.cache.set(key, parent);
        }

        // Now search for sub key
        const cacheHit = parent.get(subKey);
        if (cacheHit) {
            cacheHit.lastUse = this.iterationIndex;
            return [cacheHit.canvas, cacheHit.context, true];
        }

        const [canvas, context] = makeOffscreenBuffer(w, h, {
            reusable: true,
            label: "buffer-" + key + "/" + subKey,
            smooth: false,
        });

        redrawMethod(canvas, context);

        parent.set(subKey, {
            canvas,
            context,
            lastUse: this.iterationIndex,
        });
        return [canvas, context, false];
    }
}

/** @type {BufferMaintainer} */
let localBufferProvider;

/** @type {Map<string, string>} */
let drawImageUtilKeys = new Map();

const drawUtilParentKey = "drawImageUtilBuffers";

let nextKey = 100000;

export function drawImageUtil(destContext, img, adx, ady, adWidth, adHeight, ...args) {
    if (arguments.length > 7) {
        drawImageUtilFullArgs(...arguments);
        return;
    }

    destContext.drawImage(img, Math.round(adx), Math.round(ady), Math.round(adWidth), Math.round(adHeight));

    return;

    const [dx, dy, dWidth, dHeight] = [
        Math.round(adx),
        Math.round(ady),
        Math.round(adWidth),
        Math.round(adHeight),
    ];

    if (!localBufferProvider) {
        console.warn(
            "BufferMainter has not been initialized, drawImageUtil will not be optimized during this drawImage call"
        );
        destContext.drawImage(img, dx, dy, dWidth, dHeight);
        return;
    }

    const argKey = img.label + dWidth + dHeight;

    let bufferKey = drawImageUtilKeys.get(argKey);
    if (!bufferKey) {
        bufferKey = nextKey++ + "#";
        drawImageUtilKeys.set(argKey, bufferKey);
    }

    const [canvas, context, wasCached] = localBufferProvider.getCachedOrCreate({
        key: drawUtilParentKey,
        subKey: bufferKey,
        w: dWidth,
        h: dHeight,
        redrawMethod: (canvas, context) => {
            context.drawImage(img, 0, 0, dWidth, dHeight);
        },
    });

    destContext.drawImage(canvas, dx, dy);
}

const usesInit = 5;
const usesAdd = 10;
const usesRemove = 0;

/**
 * @typedef {{
 *  key: string,
 *  uses: number
 * }} FullArgsCacheEntry
 */
/**
 * @type {Map<string, lastUse>}
 */
let drawFullArgsCache = new Map();

async function sortCache() {
    await new Promise((resolve, reject) => {
        let arr = drawFullArgsCache.entries();
        for (let i = arr.length; arr >= 0; --i) {
            let [key, val] = arr[i];
            val.lastUse--;
            if (val.lastUse <= usesRemove) {
                drawFullArgsCache.delete(key);
                drawImageUtilKeys.delete(val.key);
            }
        }
    });
    setTimeout(15000, sortCache);
}
setTimeout(15000, sortCache);

function drawImageUtilFullArgs(destContext, img, asx, asy, asWidth, asHeight, adx, ady, adWidth, adHeight) {
    destContext.drawImage(
        img,
        Math.round(asx),
        Math.round(asy),
        Math.round(asWidth),
        Math.round(asHeight),
        Math.round(adx),
        Math.round(ady),
        Math.round(adWidth),
        Math.round(adHeight)
    );
    return;

    // prettier-ignore
    let [sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight] = [
        Math.round(asx), Math.round(asy), Math.round(asWidth), Math.round(asHeight), Math.round(adx), Math.round(ady), Math.round(adWidth), Math.round(adHeight)
    ];
    //console.log(arguments);
    //console.log([sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight]);

    if (!localBufferProvider) {
        console.warn(
            "BufferMainter has not been initialized, drawImageUtil will not be optimized during this drawImage call"
        );
        destContext.drawImage(img, asx, asy, asWidth, asHeight, adx, ady, adWidth, adHeight);
        return;
    }

    const argKey = img.label + sx + sy + sWidth + sHeight + dWidth + dHeight;

    let cacheEntry = drawFullArgsCache.get(argKey);
    if (!cacheEntry) {
        cacheEntry = {
            key: argKey,
            lastUse: usesInit,
        };
        drawFullArgsCache.set(argKey, cacheEntry);
    }
    if (cacheEntry.uses++ < usesAdd) {
        destContext.drawImage(img, asx, asy, asWidth, asHeight, adx, ady, adWidth, adHeight);
        return;
    }

    let bufferKey = drawFullArgsCache.get(argKey);
    if (!bufferKey) {
        console.log(arguments);
        console.log(img.label);
        console.log([sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight]);
        console.log(argKey);
        bufferKey = nextKey++ + "#";
        drawImageUtilKeys.set(argKey, bufferKey);
    }

    const [canvas, context, wasCached] = localBufferProvider.getCachedOrCreate({
        key: drawUtilParentKey,
        subKey: bufferKey,
        w: dWidth,
        h: dHeight,
        redrawMethod: (canvas, context) => {
            context.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, dWidth, dHeight);
        },
    });

    destContext.drawImage(canvas, dx, dy);
}
