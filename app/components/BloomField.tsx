"use client";

import { useEffect, useRef } from "react";

type Sprite = { img: HTMLImageElement | HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number };

// Where one sprite lives inside the atlas, plus its proportions (the longer side is 1).
type Cell = { sx: number; sy: number; sw: number; sh: number; w: number; h: number };

type Flower = {
    x: number; // where it settles (its place in the portrait)
    y: number;
    sx: number; // where it starts when the page loads
    sy: number;
    s: number; // size when it is a bud
    o: number; // opacity when it is a bud
    cos: number;
    sin: number;
    b: number; // hover bloom, 0 (bud) to 1 (bloom)
    delay: number; // stagger so the flowers don't all move at once (ms)
};

// Color of the buds the portrait settles into. Change this one line to try another green.
const BUD_COLOR = "#00A86B";

// Load animation timeline (ms): flowers fade in scattered, drift into the portrait, then close into buds.
const FADE_IN = 700;
const TRAVEL_START = 400;
const TRAVEL_TIME = 1800;
const BUD_START = 2000;
const BUD_TIME = 1600;
const STAGGER = 800;
const INTRO_END = BUD_START + BUD_TIME + STAGGER;

// Hover: how quickly flowers open and close (per millisecond, so it feels the same at any frame rate).
const OPEN_RATE = 0.0097;
const CLOSE_RATE = 0.00245;

// Atlas: the three flower images shrunk onto one small canvas. Drawing from a single small image
// is much faster than drawing from three big ones, which is what keeps ~10,000 flowers smooth.
const CELL = 64;
const PAD = 2;
const STRIDE = CELL + PAD * 2;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// The PNGs have lots of empty padding. Crop to the painted part so "size" means the visible flower.
const trim = (img: HTMLImageElement): Sprite => {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const cx = c.getContext("2d", { willReadFrequently: true });
    if (!cx) return { img, sx: 0, sy: 0, sw: img.width, sh: img.height };
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
    for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
            if (d[(y * c.width + x) * 4 + 3] > 20) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < minX) return { img, sx: 0, sy: 0, sw: img.width, sh: img.height };
    return { img, sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1 };
};

// Repaint a sprite in another color while keeping its painted shading: each pixel's brightness
// relative to the sprite's average is applied to the new color, so the average color becomes `hex`.
const recolor = (sp: Sprite, hex: string): Sprite => {
    const c = document.createElement("canvas");
    c.width = sp.sw;
    c.height = sp.sh;
    const cx = c.getContext("2d", { willReadFrequently: true });
    if (!cx) return sp;
    cx.drawImage(sp.img, sp.sx, sp.sy, sp.sw, sp.sh, 0, 0, sp.sw, sp.sh);
    const image = cx.getImageData(0, 0, c.width, c.height);
    const d = image.data;
    const target = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

    let sum = 0;
    let count = 0;
    for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 20) continue;
        sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        count++;
    }
    const avg = count ? sum / count : 1;
    for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 20) continue;
        const k = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / avg;
        d[i] = Math.min(255, target[0] * k);
        d[i + 1] = Math.min(255, target[1] * k);
        d[i + 2] = Math.min(255, target[2] * k);
    }
    cx.putImageData(image, 0, 0);
    return { img: c, sx: 0, sy: 0, sw: sp.sw, sh: sp.sh };
};

const buildAtlas = (sprites: Sprite[]): { atlas: HTMLCanvasElement; cells: Cell[] } | null => {
    const atlas = document.createElement("canvas");
    atlas.width = STRIDE * sprites.length;
    atlas.height = STRIDE;
    const cx = atlas.getContext("2d");
    if (!cx) return null;
    cx.imageSmoothingQuality = "high";
    const cells = sprites.map((sp, i) => {
        const m = Math.max(sp.sw, sp.sh);
        const w = sp.sw / m;
        const h = sp.sh / m;
        const dw = Math.max(1, Math.round(w * CELL));
        const dh = Math.max(1, Math.round(h * CELL));
        const ox = i * STRIDE + PAD;
        cx.drawImage(sp.img, sp.sx, sp.sy, sp.sw, sp.sh, ox, PAD, dw, dh);
        return { sx: ox, sy: PAD, sw: dw, sh: dh, w, h };
    });
    return { atlas, cells };
};

export default function BloomField() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Work in CSS pixels, but give the canvas dpr times more real pixels so it stays sharp on Retina screens.
        const dpr = window.devicePixelRatio || 1;
        const W = canvas.clientWidth;
        const H = canvas.clientHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const bud = new Image();
        const half = new Image();
        const bloom = new Image();
        const potrait = new Image();
        bud.src = "/bud.png";
        half.src = "/half.png";
        bloom.src = "/bloom.png";
        potrait.src = "/potrait.png";

        // Everything scales with the canvas height, so a smaller portrait keeps the same level of detail.
        const k = H / 700;
        const size = 5.5 * k;
        const gap = 6 * k;
        const hoverRadius = 100 * k;
        const flowers: Flower[] = [];

        let atlas: HTMLCanvasElement;
        let budCell: Cell;
        let halfCell: Cell;
        let bloomCell: Cell;
        let base: HTMLCanvasElement | null = null; // every flower, settled as a bud, drawn once

        const buildFlowers = () => {
            const off = document.createElement("canvas");
            off.width = W;
            off.height = H;
            const offCtx = off.getContext("2d", { willReadFrequently: true });
            if (!offCtx) return;

            // 0.9 leaves a little breathing space around the portrait so the hair and shoulders don't touch the edge.
            const fit = Math.min(W / potrait.width, H / potrait.height) * 0.9;
            const w = potrait.width * fit;
            const h = potrait.height * fit;
            offCtx.drawImage(potrait, (W - w) / 2, (H - h) / 2, w, h);
            const pixels = offCtx.getImageData(0, 0, W, H).data;

            // The photo is a dark face-lit portrait on black clothes and hair, so raw brightness alone loses
            // everything but the face. Every visible pixel gets a flower (that draws the silhouette),
            // and brightness only decides how big and strong it is.
            const cells: { x: number; y: number; br: number }[] = [];
            for (let y = 0; y < H; y += gap) {
                for (let x = 0; x < W; x += gap) {
                    const i = (Math.floor(y) * W + Math.floor(x)) * 4;
                    if (pixels[i + 3] < 128) continue;
                    cells.push({ x, y, br: (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3 });
                }
            }
            if (cells.length === 0) return;

            // Stretch using the 2nd and 98th percentile so a few specks don't squash the contrast,
            // then lift the shadows with a gamma curve so hair and clothing still show some shape.
            const sorted = cells.map((c) => c.br).sort((a, b) => a - b);
            const lo = sorted[Math.floor(sorted.length * 0.02)];
            const hi = sorted[Math.floor(sorted.length * 0.98)];

            for (const c of cells) {
                const lightness = Math.pow(clamp01((c.br - lo) / (hi - lo || 1)), 0.65);
                const angle = Math.random() * Math.PI * 2;
                flowers.push({
                    x: c.x + (Math.random() - 0.5) * gap * 0.5,
                    y: c.y + (Math.random() - 0.5) * gap * 0.5,
                    sx: Math.random() * W,
                    sy: Math.random() * H,
                    s: size * (0.3 + lightness),
                    o: 0.18 + lightness * 0.82,
                    cos: Math.cos(angle),
                    sin: Math.sin(angle),
                    b: 0,
                    delay: Math.random() * STAGGER,
                });
            }
        };

        let mouseX = -1000;
        let mouseY = -1000;
        let frameId = 0;
        let startTime = 0;
        let lastTime = 0;
        let lastHadActive = false;
        let cancelled = false;

        const handleMove = (e: MouseEvent) => {
            // offsetX/Y are already relative to the canvas, so no layout measuring on every mouse event.
            mouseX = e.offsetX;
            mouseY = e.offsetY;
        };
        const handleLeave = () => {
            mouseX = -1000;
            mouseY = -1000;
        };

        // Draw one sprite from the atlas.
        const put = (c: CanvasRenderingContext2D, cell: Cell, f: Flower, x: number, y: number, size: number, alpha: number) => {
            if (alpha <= 0.004) return;
            c.globalAlpha = alpha;
            c.setTransform(dpr * f.cos, dpr * f.sin, -dpr * f.sin, dpr * f.cos, dpr * x, dpr * y);
            const dw = cell.w * size;
            const dh = cell.h * size;
            c.drawImage(atlas, cell.sx, cell.sy, cell.sw, cell.sh, -dw / 2, -dh / 2, dw, dh);
        };

        // Draw a flower at any point between bud (open = 0), half open (0.5) and full bloom (1).
        // The next stage fades in over the current one, so there is never a sudden swap.
        const drawFlower = (c: CanvasRenderingContext2D, f: Flower, x: number, y: number, size: number, open: number, alpha: number) => {
            const stage = open * 2;
            if (stage < 0.02) {
                put(c, budCell, f, x, y, size, alpha);
            } else if (stage < 1) {
                put(c, budCell, f, x, y, size, alpha * clamp01((1 - stage) / 0.15));
                put(c, halfCell, f, x, y, size, alpha * stage);
            } else if (stage < 1.98) {
                put(c, halfCell, f, x, y, size, alpha * clamp01((2 - stage) / 0.15));
                put(c, bloomCell, f, x, y, size, alpha * (stage - 1));
            } else {
                put(c, bloomCell, f, x, y, size, alpha);
            }
        };

        // Flowers near the cursor open; they close again slowly once it moves away.
        const updateHover = (dt: number): Flower[] => {
            const r2 = hoverRadius * hoverRadius;
            const up = 1 - Math.exp(-dt * OPEN_RATE);
            const down = 1 - Math.exp(-dt * CLOSE_RATE);
            const active: Flower[] = [];
            for (const f of flowers) {
                let target = 0;
                if (mouseX >= 0) {
                    const dx = f.x - mouseX;
                    const dy = f.y - mouseY;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < r2) target = 1 - Math.sqrt(d2) / hoverRadius;
                }
                if (target === 0 && f.b < 0.002) {
                    f.b = 0;
                    continue;
                }
                f.b += (target - f.b) * (target > f.b ? up : down);
                if (f.b > 0.02) active.push(f);
            }
            return active;
        };

        const clear = () => {
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = 1;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        };

        // While the page loads, every flower moves, so every flower is drawn each frame.
        const drawIntro = (t: number, dt: number) => {
            updateHover(dt);
            clear();
            const fade = easeInOut(clamp01(t / FADE_IN));
            for (const f of flowers) {
                const travel = easeInOut(clamp01((t - TRAVEL_START - f.delay) / TRAVEL_TIME));
                const x = f.sx + (f.x - f.sx) * travel;
                const y = f.sy + (f.y - f.sy) * travel;
                const intro = 1 - easeInOut(clamp01((t - BUD_START - f.delay) / BUD_TIME)); // 1 = open flower, 0 = bud
                const open = Math.max(f.b, intro);
                const alpha = (f.o + (1 - f.o) * intro * 0.5) * fade;
                // While scattered, flowers are drawn a little larger so they read as flowers, not specks.
                drawFlower(ctx, f, x, y, f.s * (1 + f.b) + intro * 3, open, alpha);
            }
            ctx.globalAlpha = 1;
        };

        // Once settled, the portrait is one saved picture. Only flowers the cursor is touching are redrawn on top.
        const buildBase = () => {
            const c = document.createElement("canvas");
            c.width = canvas.width;
            c.height = canvas.height;
            const cx = c.getContext("2d");
            if (!cx) return null;
            for (const f of flowers) put(cx, budCell, f, f.x, f.y, f.s, f.o);
            return c;
        };

        // The settled picture is put back one small tile at a time, and only where open flowers were or are.
        const TILE = 48; // CSS px
        const tilesX = Math.ceil(W / TILE);
        const tilesY = Math.ceil(H / TILE);
        const stamp = new Int32Array(tilesX * tilesY); // last frame each tile was touched, to avoid doing one twice
        let frameNo = 0;
        let prevTiles: number[] = []; // tiles that had open flowers in the previous frame

        const restore = (tile: number) => {
            const tx = tile % tilesX;
            const ty = Math.floor(tile / tilesX);
            const x0 = Math.round(tx * TILE * dpr);
            const y0 = Math.round(ty * TILE * dpr);
            const w = Math.min(canvas.width, Math.round((tx + 1) * TILE * dpr)) - x0;
            const h = Math.min(canvas.height, Math.round((ty + 1) * TILE * dpr)) - y0;
            ctx.clearRect(x0, y0, w, h);
            if (base) ctx.drawImage(base, x0, y0, w, h, x0, y0, w, h);
        };

        const drawSettled = (dt: number, full: boolean) => {
            const active = updateHover(dt);
            frameNo++;
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = 1;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            if (full) ctx.clearRect(0, 0, canvas.width, canvas.height); // otherwise only touched tiles are redrawn

            // Which tiles do the open flowers touch? (A bloom can spill a little past its own tile.)
            const cur: number[] = [];
            for (const f of active) {
                const m = f.s * 1.5 + 2;
                const tx0 = Math.max(0, Math.floor((f.x - m) / TILE));
                const tx1 = Math.min(tilesX - 1, Math.floor((f.x + m) / TILE));
                const ty0 = Math.max(0, Math.floor((f.y - m) / TILE));
                const ty1 = Math.min(tilesY - 1, Math.floor((f.y + m) / TILE));
                for (let ty = ty0; ty <= ty1; ty++) {
                    for (let tx = tx0; tx <= tx1; tx++) {
                        const i = ty * tilesX + tx;
                        if (stamp[i] !== frameNo) {
                            stamp[i] = frameNo;
                            cur.push(i);
                        }
                    }
                }
            }

            if (full) {
                if (base) ctx.drawImage(base, 0, 0);
            } else {
                for (const i of cur) restore(i);
                for (const i of prevTiles) if (stamp[i] !== frameNo) restore(i);
            }

            // Open flowers fade in over the resting bud, which the half-open flower covers.
            for (const f of active) {
                const stage = f.b * 2;
                const size = f.s * (1 + f.b);
                if (stage < 1) {
                    put(ctx, halfCell, f, f.x, f.y, size, f.o * stage);
                } else {
                    put(ctx, halfCell, f, f.x, f.y, size, f.o * clamp01((2 - stage) / 0.15));
                    put(ctx, bloomCell, f, f.x, f.y, size, f.o * (stage - 1));
                }
            }
            ctx.globalAlpha = 1;
            prevTiles = cur;
            lastHadActive = active.length > 0;
        };

        const loop = (now: number) => {
            frameId = requestAnimationFrame(loop);
            const dt = Math.min(50, now - (lastTime || now));
            lastTime = now;
            const t = reduceMotion ? INTRO_END : now - startTime;

            if (t < INTRO_END) {
                drawIntro(t, dt);
                return;
            }
            if (!base) {
                base = buildBase();
                drawSettled(dt, true);
                return;
            }
            // Settled, nobody hovering, nothing still closing: there is nothing to redraw.
            if (mouseX < 0 && !lastHadActive) return;
            drawSettled(dt, false);
        };

        let loaded = 0;
        const onImageLoad = () => {
            loaded++;
            if (loaded === 4 && !cancelled) {
                const sprites = [recolor(trim(bud), BUD_COLOR), trim(half), trim(bloom)];
                const built = buildAtlas(sprites);
                if (!built) return;
                atlas = built.atlas;
                [budCell, halfCell, bloomCell] = built.cells;
                buildFlowers();
                startTime = performance.now();
                frameId = requestAnimationFrame(loop);
            }
        };
        bud.onload = onImageLoad;
        half.onload = onImageLoad;
        bloom.onload = onImageLoad;
        potrait.onload = onImageLoad;

        canvas.addEventListener("mousemove", handleMove);
        canvas.addEventListener("mouseleave", handleLeave);

        return () => {
            cancelled = true;
            cancelAnimationFrame(frameId);
            canvas.removeEventListener("mousemove", handleMove);
            canvas.removeEventListener("mouseleave", handleLeave);
        };
    }, []);

    return <canvas ref={canvasRef} className="w-full h-[340px] md:h-[460px]" />;
}
