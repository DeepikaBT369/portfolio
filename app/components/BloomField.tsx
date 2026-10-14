"use client";

import { useEffect, useRef } from "react";

export default function BloomField() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        const bud = new Image();
        const half = new Image();
        const bloom = new Image();
        const potrait = new Image();
        bud.src = "/bud.png";
        half.src = "/half.png";
        bloom.src = "/bloom.png";
        potrait.src = "/potrait.png"

        const size = 9;
        const gap = 7;
        const Flowers: { x: number; y: number; s: number; angle: number; b: number; o: number }[] = [];
        const buildFlowers = () => {
            const off = document.createElement("canvas");
            off.width = canvas.width;
            off.height = canvas.height;
            const offCtx = off.getContext("2d");
            if (!offCtx) return;

            const fit = Math.min(canvas.width / potrait.width, canvas.height / potrait.height);
            const w = potrait.width * fit;
            const h = potrait.height * fit;
            offCtx.drawImage(potrait, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);

            const pixels = offCtx.getImageData(0, 0, canvas.width, canvas.height).data;
            
            let minB = 255;
            let maxB = 0;
            for (let i = 0; i<pixels.length; i += 4){
                if (pixels[i+3] < 128) continue;
                const b = (pixels[i] + pixels[i+1] + pixels[i+2])/3;
                if (b<minB) minB = b;
                if (b>maxB) maxB = b;
                }
            for(let y = 0; y< canvas.height; y += gap) {
                for (let x = 0; x< canvas.width; x += gap){
                    const i = (y * canvas.width + x) * 4;
                    const alpha = pixels[i+3];
                    if (alpha < 128) continue;

                    const brightness = (pixels[i] + pixels[i+1]+pixels[i+2]) / 3;
                    const lightness = (brightness - minB) / (maxB - minB||1);
                    if (lightness<0.08) continue;
                    

                    Flowers.push({
                        x: x + (Math.random() - 0.5) * gap * 0.6,
                        y: y + (Math.random() - 0.5) * gap * 0.6,
                        s: size * (0.35 + lightness * 1.2),
                        o: 0.2 + lightness * 0.8,
                        angle: Math.random() * Math.PI * 2,
                        b: 0,
                    });
                }
            }
        };
        let mouseX = -1000;
        let mouseY = -1000;
        let frameId = 0;
        
        const handleMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            mouseX = e.clientX - rect.left;
            mouseY = e.clientY - rect.top;
        };
        const handleLeave = () => {
            mouseX = -1000;
            mouseY = -1000;
        }
        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (const f of Flowers) {
                ctx.save();
                ctx.translate(f.x, f.y);
                ctx.rotate(f.angle);

                const dist = Math.hypot(f.x - mouseX, f.y - mouseY);
                const target = Math.max(0, 1 - dist / 100);
                const speed = target > f.b ? 0.15 : 0.04;
                f.b += (target - f.b) * speed;

                let img = bud;
                if (f.b > 0.6) img = bloom;
                else if (f.b > 0.25) img = half;

                const s = f.s * (1 + f.b);
                ctx.drawImage(img, -s / 2, -s / 2, s, s);
                ctx.restore();
            }
            frameId = requestAnimationFrame(draw);
        };
        let loaded = 0;
        const onImageLoad = () => {
            loaded++;
            if (loaded === 4) {
                buildFlowers();
                draw();
            }
        };
        bud.onload = onImageLoad;
        half.onload = onImageLoad;
        bloom.onload = onImageLoad;
        potrait.onload = onImageLoad;

        canvas.addEventListener("mousemove", handleMove);
        canvas.addEventListener("mouseleave", handleLeave);

        return () => {
            cancelAnimationFrame(frameId);
            canvas.removeEventListener("mousemove", handleMove);
            canvas.removeEventListener("mouseleave", handleLeave);
        };
    }, []);

    return <canvas ref={canvasRef} className = "w-full h-[700px]" />;
}