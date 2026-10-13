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
        bud.src = "/bud.png";
        half.src = "/half.png";
        bloom.src = "/bloom.png";

        const size = 24;
        const gap = 30;
        const flowers: { x: number; y: number; s: number; angle: number; b: number } [] = [];
        for (let y=0; y < canvas.height; y += gap) {
            for(let x=0; x < canvas.width; x += gap) {
                flowers.push({
                    x: x + (Math.random() - 0.5) * gap * 0.6,
                    y: y + (Math.random() - 0.5) * gap * 0.6,
                    s: size * (0.8 + Math.random() * 0.4),
                    angle: Math.random() * Math.PI * 2,
                    b:0,
                });
            }
        }
        let mouseX = -1000;
        let mouseY = -1000;
        let frameId = 0;
        
        const handleMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            mouseX = e.clientX- rect.left;
            mouseY = e.clientY - rect.top;
        };
        const handleLeave = () => {
            mouseX = -1000;
            mouseY = -1000;
        }
        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (const f of flowers) {
                ctx.save();
                ctx.translate(f.x, f.y);
                ctx.rotate(f.angle);
                const dist = Math.hypot(f.x - mouseX, f.y - mouseY);
                const target = Math.max(0, 1 - dist / 100);
                const speed = target>f.b ? 0.15 : 0.04;
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
            if (loaded === 3) draw();
        };
        bud.onload = onImageLoad;
        half.onload = onImageLoad;
        bloom.onload = onImageLoad;

        canvas.addEventListener("mousemove", handleMove);
        canvas.addEventListener("mouseleave", handleLeave);

        return () => {
            cancelAnimationFrame(frameId);
            canvas.removeEventListener("mousemove", handleMove);
            canvas.removeEventListener("mouseleave", handleLeave);
        };
    }, []);

    return <canvas ref={canvasRef} className = "w-full h-[500px]" />;
}