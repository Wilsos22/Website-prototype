"use client";

// Draggable algebra tiles with expression-building, duplicate, delete, and snap-to-grid controls.
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ToolHeader } from "./ToolHeader";
import { LiveToolBanner, useLiveToolConfig } from "./useLiveToolConfig";

type TileKind = "unit" | "x" | "x2";
type TileSign = "positive" | "negative";

interface AlgebraTile {
  id: string;
  value: string;
  kind: TileKind;
  sign: TileSign;
  label: string;
  color: string;
  x: number;
  y: number;
}

interface Polynomial {
  terms: Record<string, number>;
}

interface ParsedTerm {
  color: string;
  count: number;
  key: string;
  kind: TileKind;
  label: string;
  sign: TileSign;
  sortOrder: number;
}

interface ParseResult {
  error?: string;
  polynomial?: Polynomial;
}

interface ParsedSide {
  error?: string;
  terms: ParsedTerm[];
}

const positiveConstantColor = "#159a8c";
const negativeColor = "#d95555";
const xSquaredColor = "#6f5fbf";
const variableColors = [
  "#245caa",
  "#d89028",
  "#4b7f52",
  "#7b5bc7",
  "#0f7c9b",
  "#a34f86",
  "#657a1f",
  "#b35b2d",
];

const tileTemplates: Omit<AlgebraTile, "id" | "x" | "y">[] = [
  {
    value: "+1",
    kind: "unit",
    sign: "positive",
    label: "+1",
    color: positiveConstantColor,
  },
  { value: "-1", kind: "unit", sign: "negative", label: "-1", color: negativeColor },
  { value: "+x", kind: "x", sign: "positive", label: "+x", color: variableColor("x") },
  { value: "-x", kind: "x", sign: "negative", label: "-x", color: negativeColor },
  { value: "+x2", kind: "x2", sign: "positive", label: "+x²", color: xSquaredColor },
  { value: "-x2", kind: "x2", sign: "negative", label: "-x²", color: negativeColor },
];

const initialTiles: AlgebraTile[] = tileTemplates.map((template, index) => ({
  ...template,
  id: `${template.value}-starter`,
  x: 28 + index * 92,
  y: 34,
}));

const gridSize = 40;
const generatedTileStartY = 128;
const groupGap = 34;
const sidePadding = 38;
const equalsGap = 96;

function snap(value: number): number {
  return Math.round(value / gridSize) * gridSize;
}

function emptyPolynomial(): Polynomial {
  return { terms: {} };
}

function singleTermPolynomial(key: string, coefficient: number): Polynomial {
  return { terms: { [key]: coefficient } };
}

function addPolynomials(left: Polynomial, right: Polynomial): Polynomial {
  const terms = { ...left.terms };

  for (const [key, coefficient] of Object.entries(right.terms)) {
    terms[key] = (terms[key] ?? 0) + coefficient;

    if (terms[key] === 0) {
      delete terms[key];
    }
  }

  return { terms };
}

function scalePolynomial(polynomial: Polynomial, scalar: number): Polynomial {
  const terms: Record<string, number> = {};

  for (const [key, coefficient] of Object.entries(polynomial.terms)) {
    const nextCoefficient = coefficient * scalar;

    if (nextCoefficient !== 0) {
      terms[key] = nextCoefficient;
    }
  }

  return { terms };
}

function multiplyTermKeys(leftKey: string, rightKey: string): string | null {
  if (leftKey === "unit") {
    return rightKey;
  }

  if (rightKey === "unit") {
    return leftKey;
  }

  if (leftKey === "x" && rightKey === "x") {
    return "x2";
  }

  return null;
}

function multiplyPolynomials(left: Polynomial, right: Polynomial): ParseResult {
  const product = emptyPolynomial();

  for (const [leftKey, leftCoefficient] of Object.entries(left.terms)) {
    for (const [rightKey, rightCoefficient] of Object.entries(right.terms)) {
      const productKey = multiplyTermKeys(leftKey, rightKey);

      if (!productKey) {
        return {
          error: "Only x² is supported for squared variables.",
        };
      }

      const nextTerm = singleTermPolynomial(productKey, leftCoefficient * rightCoefficient);
      Object.assign(product, addPolynomials(product, nextTerm));
    }
  }

  return { polynomial: product };
}

function variableColor(variable: string): string {
  const colorIndex = (variable.charCodeAt(0) - 97 + variableColors.length) % variableColors.length;
  return variableColors[colorIndex];
}

function labelForTerm(key: string, coefficient: number): string {
  const prefix = coefficient >= 0 ? "+" : "-";

  if (key === "unit") {
    return `${prefix}1`;
  }

  if (key === "x2") {
    return `${prefix}x²`;
  }

  return `${prefix}${key}`;
}

function kindForTerm(key: string): TileKind {
  if (key === "unit") {
    return "unit";
  }

  if (key === "x2") {
    return "x2";
  }

  return "x";
}

function colorForTerm(key: string, coefficient: number): string {
  if (coefficient < 0) {
    return negativeColor;
  }

  if (key === "unit") {
    return positiveConstantColor;
  }

  if (key === "x2") {
    return xSquaredColor;
  }

  return variableColor(key);
}

function sortOrderForTerm(key: string, coefficient: number): number {
  const signOffset = coefficient < 0 ? 100 : 0;

  if (key === "x2") {
    return signOffset;
  }

  if (key === "unit") {
    return signOffset + 80;
  }

  return signOffset + 10 + key.charCodeAt(0) - 97;
}

class ExpressionParser {
  private error = "";
  private index = 0;

  constructor(private readonly input: string) {}

  parse(): ParseResult {
    const expression = this.parseExpression();

    if (!expression) {
      return { error: this.error || "Check the expression format." };
    }

    if (this.index < this.input.length) {
      return { error: "Check the expression format." };
    }

    return { polynomial: expression };
  }

  private parseExpression(): Polynomial | null {
    let result = this.parseTerm();

    if (!result) {
      return null;
    }

    while (this.peek() === "+" || this.peek() === "-") {
      const operator = this.consume();
      const nextTerm = this.parseTerm();

      if (!nextTerm) {
        return null;
      }

      result = addPolynomials(result, operator === "-" ? scalePolynomial(nextTerm, -1) : nextTerm);
    }

    return result;
  }

  private parseTerm(): Polynomial | null {
    let result = this.parseFactor();

    if (!result) {
      return null;
    }

    while (this.peek() === "*" || this.isFactorStart(this.peek())) {
      if (this.peek() === "*") {
        this.consume();
      }

      const nextFactor = this.parseFactor();

      if (!nextFactor) {
        return null;
      }

      const product = multiplyPolynomials(result, nextFactor);

      if (!product.polynomial) {
        this.error = product.error ?? "Only whole-number linear variables are supported.";
        return null;
      }

      result = product.polynomial;
    }

    return result;
  }

  private parseFactor(): Polynomial | null {
    if (this.peek() === "+") {
      this.consume();
      return this.parseFactor();
    }

    if (this.peek() === "-") {
      this.consume();
      const factor = this.parseFactor();
      return factor ? scalePolynomial(factor, -1) : null;
    }

    if (this.peek() === "(") {
      this.consume();
      const expression = this.parseExpression();

      if (!expression || this.consume() !== ")") {
        this.error = "Check the parentheses.";
        return null;
      }

      return expression;
    }

    if (/\d/.test(this.peek())) {
      return singleTermPolynomial("unit", this.parseNumber());
    }

    if (/[a-z]/.test(this.peek())) {
      const variable = this.consume();

      if (this.input.slice(this.index, this.index + 2) === "^2") {
        this.index += 2;

        if (variable !== "x") {
          this.error = "Only x² is supported for squared variables.";
          return null;
        }

        return singleTermPolynomial("x2", 1);
      }

      return singleTermPolynomial(variable, 1);
    }

    return null;
  }

  private parseNumber(): number {
    let numberText = "";

    while (/\d/.test(this.peek())) {
      numberText += this.consume();
    }

    return Number(numberText);
  }

  private isFactorStart(character: string): boolean {
    return character === "(" || /[a-z0-9]/.test(character);
  }

  private peek(): string {
    return this.input[this.index] ?? "";
  }

  private consume(): string {
    const character = this.peek();
    this.index += 1;
    return character;
  }
}

function parseExpressionSide(side: string): ParsedSide {
  const normalizedSide = side
    .replaceAll("−", "-")
    .replaceAll("²", "^2")
    .replace(/\s/g, "")
    .toLowerCase();

  if (!normalizedSide) {
    return { terms: [] };
  }

  const parsed = new ExpressionParser(normalizedSide).parse();

  if (!parsed.polynomial) {
    return {
      error: parsed.error ?? "Use whole-number terms.",
      terms: [],
    };
  }

  const terms: ParsedTerm[] = Object.entries(parsed.polynomial.terms)
    .filter(([, coefficient]) => coefficient !== 0)
    .map(([key, coefficient]) => ({
      color: colorForTerm(key, coefficient),
      count: Math.abs(coefficient),
      key,
      kind: kindForTerm(key),
      label: labelForTerm(key, coefficient),
      sign: (coefficient >= 0 ? "positive" : "negative") as TileSign,
      sortOrder: sortOrderForTerm(key, coefficient),
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return { terms };
}

function stepForKind(kind: TileKind): { column: number; row: number } {
  if (kind === "x2") {
    return { column: 144, row: 136 };
  }

  if (kind === "x") {
    return { column: 84, row: 154 };
  }

  return { column: 72, row: 70 };
}

function buildGroupedTilesForSide(
  terms: ParsedTerm[],
  startX: number,
  sideWidth: number,
  sideName: string,
): AlgebraTile[] {
  let baseY = generatedTileStartY;
  let groupX = startX;
  const tiles: AlgebraTile[] = [];
  const maxX = startX + sideWidth;

  for (const term of terms) {
    const steps = stepForKind(term.kind);
    const columnCount = Math.ceil(term.count / 3);
    const groupWidth = Math.max(steps.column, columnCount * steps.column);

    if (groupX > startX && groupX + groupWidth > maxX) {
      groupX = startX;
      baseY += 500;
    }

    for (let index = 0; index < term.count; index += 1) {
      const column = Math.floor(index / 3);
      const row = index % 3;

      tiles.push({
        color: term.color,
        id: `${sideName}-${term.key}-${index}-${crypto.randomUUID()}`,
        kind: term.kind,
        label: term.label,
        sign: term.sign,
        value: term.label,
        x: groupX + column * steps.column,
        y: baseY + row * steps.row,
      });
    }

    groupX += groupWidth + groupGap;
  }

  return tiles;
}

function countTiles(side: ParsedSide): number {
  return side.terms.reduce((sum, term) => sum + term.count, 0);
}

export function AlgebraTilesBoard() {
  const liveTool = useLiveToolConfig("/algebra-tiles");
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [tiles, setTiles] = useState<AlgebraTile[]>(initialTiles);
  const [selectedTileId, setSelectedTileId] = useState(initialTiles[0]?.id ?? "");
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [expressionInput, setExpressionInput] = useState("");
  const [modeledExpression, setModeledExpression] = useState("");
  const [expressionStatus, setExpressionStatus] = useState("");
  const showEqualsSign = modeledExpression.includes("=");

  const addTile = useCallback((template: Omit<AlgebraTile, "id" | "x" | "y">) => {
    setTiles((currentTiles) => {
      const offset = currentTiles.length % 8;

      return [
        ...currentTiles,
        {
          ...template,
          id: `${template.value}-${crypto.randomUUID()}`,
          x: 34 + offset * 48,
          y: 210 + offset * 18,
        },
      ];
    });
  }, []);

  const moveTile = useCallback(
    (id: string, x: number, y: number) => {
      setTiles((currentTiles) =>
        currentTiles.map((tile) =>
          tile.id === id
            ? {
                ...tile,
                x: snapToGrid ? snap(Math.max(0, x)) : Math.max(0, x),
                y: snapToGrid ? snap(Math.max(0, y)) : Math.max(0, y),
              }
            : tile,
        ),
      );
    },
    [snapToGrid],
  );

  const duplicateSelectedTile = useCallback(() => {
    setTiles((currentTiles) => {
      const selectedTile = currentTiles.find((tile) => tile.id === selectedTileId);

      if (!selectedTile) {
        return currentTiles;
      }

      const nextTile = {
        ...selectedTile,
        id: `${selectedTile.value}-${crypto.randomUUID()}`,
        x: selectedTile.x + 36,
        y: selectedTile.y + 36,
      };

      setSelectedTileId(nextTile.id);
      return [...currentTiles, nextTile];
    });
  }, [selectedTileId]);

  const deleteSelectedTile = useCallback(() => {
    setTiles((currentTiles) => {
      const nextTiles = currentTiles.filter((tile) => tile.id !== selectedTileId);
      setSelectedTileId(nextTiles[0]?.id ?? "");
      return nextTiles;
    });
  }, [selectedTileId]);

  const snapAllTiles = useCallback(() => {
    setTiles((currentTiles) =>
      currentTiles.map((tile) => ({
        ...tile,
        x: snap(tile.x),
        y: snap(tile.y),
      })),
    );
  }, []);

  const buildTilesFromExpression = useCallback(
    (rawExpression: string) => {
      const expression = rawExpression.trim();
      const boardWidth = boardRef.current?.getBoundingClientRect().width ?? 960;
      const sides = expression.split("=");

      if (!expression) {
        setExpressionStatus("Enter an expression.");
        return;
      }

      if (sides.length > 2) {
        setExpressionStatus("Use one equals sign.");
        return;
      }

      const parsedSides = sides.map((side) => parseExpressionSide(side));
      const firstError = parsedSides.find((side) => side.error)?.error;

      if (firstError) {
        setExpressionStatus(firstError);
        return;
      }

      const totalTiles = parsedSides.reduce((tileCount, side) => tileCount + countTiles(side), 0);

      if (totalTiles === 0) {
        setExpressionStatus("No tiles to build.");
        return;
      }

      if (totalTiles > 60) {
        setExpressionStatus("Try 60 tiles or fewer.");
        return;
      }

      const isEquation = parsedSides.length === 2;
      const sideWidth = isEquation ? boardWidth / 2 - equalsGap : boardWidth - sidePadding * 2;
      const leftTiles = buildGroupedTilesForSide(
        parsedSides[0]?.terms ?? [],
        sidePadding,
        sideWidth,
        "left",
      );
      const rightTiles = isEquation
        ? buildGroupedTilesForSide(
            parsedSides[1]?.terms ?? [],
            boardWidth / 2 + equalsGap / 2,
            sideWidth,
            "right",
          )
        : [];
      const nextTiles = [...leftTiles, ...rightTiles];

      setTiles(nextTiles);
      setSelectedTileId(nextTiles[0]?.id ?? "");
      setModeledExpression(expression);
      setExpressionStatus("Built with tiles.");
    },
    [],
  );

  const buildExpressionTiles = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      buildTilesFromExpression(expressionInput);
    },
    [buildTilesFromExpression, expressionInput],
  );

  useEffect(() => {
    if (!liveTool || liveTool.route !== "/algebra-tiles") return;
    setExpressionInput(liveTool.config.expression);
    buildTilesFromExpression(liveTool.config.expression);
  }, [buildTilesFromExpression, liveTool?.id]);

  const resetTiles = useCallback(() => {
    setTiles(initialTiles);
    setSelectedTileId(initialTiles[0]?.id ?? "");
    setModeledExpression("");
    setExpressionStatus("");
  }, []);

  const startDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, tile: AlgebraTile) => {
      const board = boardRef.current;
      if (!board) {
        return;
      }

      const boardRect = board.getBoundingClientRect();
      event.currentTarget.setPointerCapture(event.pointerId);
      setSelectedTileId(tile.id);
      dragRef.current = {
        id: tile.id,
        offsetX: event.clientX - boardRect.left - tile.x,
        offsetY: event.clientY - boardRect.top - tile.y,
      };
    },
    [],
  );

  const continueDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const board = boardRef.current;
      const drag = dragRef.current;

      if (!board || !drag) {
        return;
      }

      const boardRect = board.getBoundingClientRect();
      const x = event.clientX - boardRect.left - drag.offsetX;
      const y = event.clientY - boardRect.top - drag.offsetY;
      moveTile(drag.id, Math.max(0, x), Math.max(0, y));
    },
    [moveTile],
  );

  const stopDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragRef.current = null;
  }, []);

  return (
    <>
      <ToolHeader title="Algebra Tiles">
        <button
          className="small-button"
          disabled={!selectedTileId}
          onClick={duplicateSelectedTile}
          type="button"
        >
          Duplicate
        </button>
        <button
          className="small-button danger"
          disabled={!selectedTileId}
          onClick={deleteSelectedTile}
          type="button"
        >
          Delete
        </button>
        <button
          className={`small-button ${snapToGrid ? "active" : ""}`}
          onClick={() => setSnapToGrid((currentValue) => !currentValue)}
          type="button"
        >
          Snap Grid
        </button>
        <button className="small-button" onClick={snapAllTiles} type="button">
          Snap All
        </button>
        {tileTemplates.map((template) => (
          <button
            key={template.value}
            className="small-button"
            onClick={() => addTile(template)}
            type="button"
          >
            Add {template.label}
          </button>
        ))}
      </ToolHeader>

      <main className="board-shell algebra-shell">
        <LiveToolBanner tool={liveTool} />
        <form className="expression-panel" onSubmit={buildExpressionTiles}>
          <label className="field expression-field">
            Expression
            <input
              className="text-input"
              onChange={(event) => setExpressionInput(event.target.value)}
              placeholder="2(x + 3) = x - 1"
              value={expressionInput}
            />
          </label>
          <button className="small-button primary" type="submit">
            Build Tiles
          </button>
          <button className="small-button" onClick={resetTiles} type="button">
            Reset Tiles
          </button>
          {expressionStatus && <span className="status-pill">{expressionStatus}</span>}
        </form>
        <section
          ref={boardRef}
          className="manipulative-board"
          aria-label="Algebra tile workspace"
          onPointerCancel={stopDrag}
          onPointerMove={continueDrag}
          onPointerUp={stopDrag}
        >
          {modeledExpression && <div className="equation-display">{modeledExpression}</div>}
          {showEqualsSign && (
            <div className="tile-equals-sign" aria-hidden="true">
              =
            </div>
          )}
          {tiles.map((tile) => (
            <div
              key={tile.id}
              aria-label={`${tile.label} algebra tile`}
              className={`tile ${tile.kind} ${tile.sign} ${
                selectedTileId === tile.id ? "selected" : ""
              }`}
              onPointerDown={(event) => startDrag(event, tile)}
              style={{ background: tile.color, left: tile.x, top: tile.y }}
              tabIndex={0}
            >
              {tile.label}
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
