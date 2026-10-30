"use client";

import { useEffect, useRef } from "react";

type Sprite = { img: HTMLImageElement; sx: number; sy: number; sw: number; sh: number };

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

// Load animation timeline (ms): flowers fade in scattered, drift into the portrait, then close into buds.
const FADE_IN = 700;
const TRAVEL_START = 400;
const TRAVEL_TIME = 1800;
const BUD_START = 2000;
const BUD_TIME = 1200;
const STAGGER = 700;
const INTRO_END = BUD_START + BUD_TIME + STAGGER;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// The PNGs have lots of empty padding. Crop to the painted part so "size" means the visible flower.
const trim = (img: HTMLImageElement): Sprite => {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const cx = c.getContext("2d");
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

        let budSprite: Sprite;
        let halfSprite: Sprite;
        let bloomSprite: Sprite;

        const size = 5.5;
        const gap = 6;
        const flowers: Flower[] = [];

        const buildFlowers = () => {
            const off = document.createElement("canvas");
            off.width = W;
            off.height = H;
            const offCtx = off.getContext("2d", { willReadFrequently: true });
            if (!offCtx) return;

            const fit = Math.min(W / potrait.width, H / potrait.height);
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
        let cancelled = false;

        const handleMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            mouseX = e.clientX - rect.left;
            mouseY = e.clientY - rect.top;
        };
        const handleLeave = () => {
            mouseX = -1000;
            mouseY = -1000;
        };

        const drawSprite = (sp: Sprite, x: number, y: number, size: number, cos: number, sin: number) => {
            const m = Math.max(sp.sw, sp.sh);
            const dw = (sp.sw / m) * size;
            const dh = (sp.sh / m) * size;
            ctx.setTransform(dpr * cos, dpr * sin, -dpr * sin, dpr * cos, dpr * x, dpr * y);
            ctx.drawImage(sp.img, sp.sx, sp.sy, sp.sw, sp.sh, -dw / 2, -dh / 2, dw, dh);
        };

        const loop = (now: number) => {
            frameId = requestAnimationFrame(loop);
            const t = reduceMotion ? INTRO_END : now - startTime;
            const introDone = t >= INTRO_END;

            // Once everything has settled and nobody is hovering, there is nothing to redraw.
            if (introDone && mouseX < 0 && !flowers.some((f) => f.b > 0.002)) return;

            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const fade = introDone ? 1 : easeInOut(clamp01(t / FADE_IN));

            for (const f of flowers) {
                // Hover: flowers near the cursor open, then close again slowly.
                const dist = Math.hypot(f.x - mouseX, f.y - mouseY);
                const target = Math.max(0, 1 - dist / 100);
                f.b += (target - f.b) * (target > f.b ? 0.15 : 0.04);

                // Intro: 1 = fully open flower, 0 = bud.
                let intro = 0;
                let x = f.x;
                let y = f.y;
                if (!introDone) {
                    const travel = easeInOut(clamp01((t - TRAVEL_START - f.delay) / TRAVEL_TIME));
                    x = f.sx + (f.x - f.sx) * travel;
                    y = f.sy + (f.y - f.sy) * travel;
                    intro = 1 - easeInOut(clamp01((t - BUD_START - f.delay) / BUD_TIME));
                }

                const open = Math.max(f.b, intro);
                ctx.globalAlpha = (f.o + (1 - f.o) * intro * 0.5) * fade;

                let sprite = budSprite;
                if (open > 0.6) sprite = bloomSprite;
                else if (open > 0.25) sprite = halfSprite;

                // While scattered, flowers are drawn a little larger so they read as flowers, not specks.
                const s = f.s * (1 + f.b) + intro * 3;
                drawSprite(sprite, x, y, s, f.cos, f.sin);
            }
            ctx.globalAlpha = 1;
        };

        let loaded = 0;
        const onImageLoad = () => {
            loaded++;
            if (loaded === 4 && !cancelled) {
                budSprite = trim(bud);
                halfSprite = trim(half);
                bloomSprite = trim(bloom);
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

    return <canvas ref={canvasRef} className="w-full h-[420px] md:h-[700px]" />;
}
