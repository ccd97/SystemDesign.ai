import { convertToExcalidrawElements } from "@excalidraw/excalidraw";

export type AddTextOptions = {
  text: string;
  x?: number;
  y?: number;
  width?: number;
  fontSize?: number;
  fontFamily?: number;
  theme?: "light" | "dark";
};

function wrapText(text: string, maxCharsPerLine: number): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine && currentLine.length + 1 + word.length > maxCharsPerLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.join("\n");
}

export function createTextElement(options: AddTextOptions): Record<string, unknown> {
  const fontSize = options.fontSize ?? 28;
  const charsPerLine = Math.floor((options.width ?? 800) / (fontSize * 0.55));
  const wrapped = wrapText(options.text, charsPerLine);
  const strokeColor = options.theme === "light" ? "#1e1e1e" : "#ffffff";

  const elements = convertToExcalidrawElements(
    [
      {
        type: "text",
        text: wrapped,
        x: options.x ?? 100,
        y: options.y ?? 100,
        fontSize,
        fontFamily: (options.fontFamily ?? 1) as 1 | 2 | 3 | 4,
        textAlign: "left",
        verticalAlign: "top",
        strokeColor,
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        roundness: null,
        containerId: null,
        originalText: wrapped,
        autoResize: true,
        lineHeight: 1.25 as unknown as number & { _brand: "unitlessLineHeight" },
      },
    ],
    { regenerateIds: false },
  );
  return elements[0] as Record<string, unknown>;
}
