"use client";

// Full-screen drawing board using Pointer Events for mouse, touch, and stylus input.
import { useCallback, useEffect, useRef, useState } from "react";
import { ToolHeader } from "./ToolHeader";
import { LiveToolBanner, useLiveToolConfig } from "./useLiveToolConfig";

type DrawTool = "pen" | "eraser";

interface Point {
  x: number;
  y: number;
}

export function WhiteboardCanvas() {
  const liveTool = useLiveToolConfig("/whiteboard");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const lastPointRef = useRef<Point | null>(null);
  const isDrawingRef = useRef(false);
  const [tool, setTool] = useState<DrawTool>("pen");
  const [snapshotStatus, setSnapshotStatus] = useState("");

  const getCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const previous = document.createElement("canvas");
    previous.width = canvas.width;
    previous.height = canvas.height;
    previous.getContext("2d")?.drawImage(canvas, 0, 0);

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.fillStyle = "white";
    context.fillRect(0, 0, rect.width, rect.height);

    if (previous.width > 0 && previous.height > 0) {
      context.drawImage(previous, 0, 0, rect.width, rect.height);
    }
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [resizeCanvas]);

  const drawToPoint = useCallback(
    (point: Point) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      const lastPoint = lastPointRef.current;

      if (!context || !lastPoint) {
        return;
      }

      context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      context.strokeStyle = "#111827";
      context.lineWidth = tool === "eraser" ? 30 : 5;
      context.beginPath();
      context.moveTo(lastPoint.x, lastPoint.y);
      context.lineTo(point.x, point.y);
      context.stroke();
      lastPointRef.current = point;
    },
    [tool],
  );

  const startDrawing = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      isDrawingRef.current = true;
      lastPointRef.current = getCanvasPoint(event);
    },
    [getCanvasPoint],
  );

  const continueDrawing = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) {
        return;
      }

      drawToPoint(getCanvasPoint(event));
    },
    [drawToPoint, getCanvasPoint],
  );

  const stopDrawing = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  const clearBoard = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    context.globalCompositeOperation = "source-over";
    context.fillStyle = "white";
    context.fillRect(0, 0, rect.width, rect.height);
    setSnapshotStatus("");
  }, []);

  const createWhiteSnapshot = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return null;
    }

    const snapshot = document.createElement("canvas");
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;

    const context = snapshot.getContext("2d");

    if (!context) {
      return null;
    }

    context.fillStyle = "white";
    context.fillRect(0, 0, snapshot.width, snapshot.height);
    context.drawImage(canvas, 0, 0);

    return snapshot;
  }, []);

  const saveSnapshot = useCallback(() => {
    const snapshot = createWhiteSnapshot();

    if (!snapshot) {
      setSnapshotStatus("Nothing to save yet.");
      return;
    }

    window.localStorage.setItem("big-dog-board-whiteboard-snapshot", snapshot.toDataURL("image/png"));
    window.localStorage.setItem("big-dog-board-whiteboard-saved-at", new Date().toLocaleString());
    setSnapshotStatus("Saved on this browser.");
  }, [createWhiteSnapshot]);

  const restoreSnapshot = useCallback(() => {
    const savedImage = window.localStorage.getItem("big-dog-board-whiteboard-snapshot");

    if (!savedImage) {
      setSnapshotStatus("No saved board yet.");
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const image = new Image();
    image.addEventListener("load", () => {
      const rect = canvas.getBoundingClientRect();
      context.globalCompositeOperation = "source-over";
      context.fillStyle = "white";
      context.fillRect(0, 0, rect.width, rect.height);
      context.drawImage(image, 0, 0, rect.width, rect.height);
      setSnapshotStatus("Restored saved board.");
    });
    image.src = savedImage;
  }, []);

  const exportSnapshot = useCallback(() => {
    const snapshot = createWhiteSnapshot();

    if (!snapshot) {
      setSnapshotStatus("Nothing to export yet.");
      return;
    }

    const link = document.createElement("a");
    link.href = snapshot.toDataURL("image/png");
    link.download = `big-dog-board-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
    setSnapshotStatus("Exported PNG.");
  }, [createWhiteSnapshot]);

  const importImage = useCallback((file: File | undefined) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!file || !canvas || !context) {
      return;
    }

    const image = new Image();
    const url = URL.createObjectURL(file);

    image.addEventListener("load", () => {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min((rect.width * 0.92) / image.width, (rect.height * 0.92) / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;
      const x = (rect.width - width) / 2;
      const y = (rect.height - height) / 2;
      context.globalCompositeOperation = "source-over";
      context.drawImage(image, x, y, width, height);
      URL.revokeObjectURL(url);
      setSnapshotStatus("Imported image.");
    });

    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      setSnapshotStatus("Image could not be imported.");
    });

    image.src = url;
  }, []);

  return (
    <>
      <ToolHeader title="Whiteboard">
        <button
          className={`tool-button ${tool === "pen" ? "active" : ""}`}
          onClick={() => setTool("pen")}
          type="button"
        >
          Pen
        </button>
        <button
          className={`tool-button ${tool === "eraser" ? "active" : ""}`}
          onClick={() => setTool("eraser")}
          type="button"
        >
          Eraser
        </button>
        <button className="tool-button danger" onClick={clearBoard} type="button">
          Clear
        </button>
        <button className="tool-button" onClick={saveSnapshot} type="button">
          Save
        </button>
        <button className="tool-button" onClick={restoreSnapshot} type="button">
          Restore
        </button>
        <button className="tool-button" onClick={() => imageInputRef.current?.click()} type="button">
          Import Image
        </button>
        <input
          ref={imageInputRef}
          accept="image/*"
          hidden
          type="file"
          onChange={(event) => {
            importImage(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <button className="tool-button" onClick={exportSnapshot} type="button">
          Export PNG
        </button>
        {snapshotStatus && <span className="status-pill">{snapshotStatus}</span>}
      </ToolHeader>

      <main className="board-shell whiteboard-shell">
        <LiveToolBanner tool={liveTool} />
        <section className="whiteboard-area" aria-label="Drawing canvas">
          <canvas
            ref={canvasRef}
            className="whiteboard-canvas"
            onPointerCancel={stopDrawing}
            onPointerDown={startDrawing}
            onPointerLeave={stopDrawing}
            onPointerMove={continueDrawing}
            onPointerUp={stopDrawing}
          />
        </section>
      </main>
    </>
  );
}
