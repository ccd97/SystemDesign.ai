#!/usr/bin/env python3
"""
Create the app icon from hand-authored drawing primitives.

The icon follows the app UI instead of the previous glossy/liquid material:
dark shadcn-style surfaces, a single clear recording accent, and a minimal
canvas glyph that stays legible at small sizes.
"""

from __future__ import annotations

import math
import os
import struct
import zlib
from typing import Callable, Iterable

SIZE = 1024
SCALE = 2
W = SIZE * SCALE
H = SIZE * SCALE

pixels = bytearray(W * H * 4)

Color = tuple[int, int, int, int]
Point = tuple[float, float]

BACKGROUND: Color = (18, 18, 19, 255)
CARD: Color = (32, 32, 36, 255)
CARD_DARK: Color = (24, 24, 27, 255)
BORDER: Color = (69, 69, 78, 255)
BORDER_SOFT: Color = (69, 69, 78, 128)
FOREGROUND: Color = (232, 232, 236, 255)
MUTED: Color = (190, 190, 200, 255)
ACCENT: Color = (113, 106, 221, 255)
RECORDING: Color = (250, 82, 82, 255)


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def mix(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * clamp(t))


def mix_color(a: Color, b: Color, t: float) -> Color:
    return (
        mix(a[0], b[0], t),
        mix(a[1], b[1], t),
        mix(a[2], b[2], t),
        mix(a[3], b[3], t),
    )


def with_alpha(color: Color, alpha: int) -> Color:
    return (color[0], color[1], color[2], alpha)


def blend_pixel(x: int, y: int, color: Color) -> None:
    if x < 0 or x >= W or y < 0 or y >= H:
        return

    sr, sg, sb, sa = color
    if sa <= 0:
        return

    i = (y * W + x) * 4
    dr, dg, db, da = pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]

    src_a = sa / 255.0
    dst_a = da / 255.0
    out_a = src_a + dst_a * (1 - src_a)
    if out_a <= 0:
        return

    pixels[i] = round((sr * src_a + dr * dst_a * (1 - src_a)) / out_a)
    pixels[i + 1] = round((sg * src_a + dg * dst_a * (1 - src_a)) / out_a)
    pixels[i + 2] = round((sb * src_a + db * dst_a * (1 - src_a)) / out_a)
    pixels[i + 3] = round(out_a * 255)


def logical_bounds(x0: float, y0: float, x1: float, y1: float) -> tuple[int, int, int, int]:
    return (
        max(0, math.floor(x0 * SCALE)),
        max(0, math.floor(y0 * SCALE)),
        min(W, math.ceil(x1 * SCALE)),
        min(H, math.ceil(y1 * SCALE)),
    )


def coverage_from_sdf(distance: float) -> float:
    return clamp(0.5 - distance)


def fill_sdf(
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    distance_at: Callable[[float, float], float],
    color_at: Callable[[float, float], Color],
) -> None:
    bx0, by0, bx1, by1 = logical_bounds(x0, y0, x1, y1)
    for yy in range(by0, by1):
        y = yy / SCALE
        for xx in range(bx0, bx1):
            x = xx / SCALE
            coverage = coverage_from_sdf(distance_at(x, y))
            if coverage <= 0:
                continue
            r, g, b, a = color_at(x, y)
            blend_pixel(xx, yy, (r, g, b, round(a * coverage)))


def superellipse_value(x: float, y: float, cx: float, cy: float, rx: float, ry: float, n: float = 5.0) -> float:
    return abs((x - cx) / rx) ** n + abs((y - cy) / ry) ** n


def fill_superellipse(
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    color_at: Callable[[float, float], Color],
    n: float = 5.0,
) -> None:
    def distance_at(x: float, y: float) -> float:
        value = superellipse_value(x, y, cx, cy, rx, ry, n)
        return (value - 1) * min(rx, ry) / n

    fill_sdf(cx - rx - 2, cy - ry - 2, cx + rx + 2, cy + ry + 2, distance_at, color_at)


def stroke_superellipse(cx: float, cy: float, rx: float, ry: float, width: float, color: Color, n: float = 5.0) -> None:
    def distance_at(x: float, y: float) -> float:
        outer = superellipse_value(x, y, cx, cy, rx, ry, n)
        inner = superellipse_value(x, y, cx, cy, rx - width, ry - width, n)
        outer_distance = (outer - 1) * min(rx, ry) / n
        inner_distance = (1 - inner) * min(rx - width, ry - width) / n
        return max(outer_distance, inner_distance)

    fill_sdf(cx - rx - 2, cy - ry - 2, cx + rx + 2, cy + ry + 2, distance_at, lambda _x, _y: color)


def rounded_rect_sdf(x: float, y: float, cx: float, cy: float, w: float, h: float, r: float) -> float:
    qx = abs(x - cx) - (w / 2 - r)
    qy = abs(y - cy) - (h / 2 - r)
    outside = math.hypot(max(qx, 0), max(qy, 0))
    inside = min(max(qx, qy), 0)
    return outside + inside - r


def rounded_rect(
    cx: float,
    cy: float,
    w: float,
    h: float,
    r: float,
    fill: Color,
    stroke: Color,
    stroke_width: float,
) -> None:
    def fill_distance(x: float, y: float) -> float:
        return rounded_rect_sdf(x, y, cx, cy, w, h, r)

    if fill[3] > 0:
        fill_sdf(cx - w / 2 - 2, cy - h / 2 - 2, cx + w / 2 + 2, cy + h / 2 + 2, fill_distance, lambda _x, _y: fill)

    if stroke[3] <= 0 or stroke_width <= 0:
        return

    def stroke_distance(x: float, y: float) -> float:
        d = rounded_rect_sdf(x, y, cx, cy, w, h, r)
        return max(d, -d - stroke_width)

    fill_sdf(
        cx - w / 2 - 3,
        cy - h / 2 - 3,
        cx + w / 2 + 3,
        cy + h / 2 + 3,
        stroke_distance,
        lambda _x, _y: stroke,
    )


def fill_circle(cx: float, cy: float, radius: float, color: Color) -> None:
    def distance_at(x: float, y: float) -> float:
        return math.hypot(x - cx, y - cy) - radius

    fill_sdf(cx - radius - 2, cy - radius - 2, cx + radius + 2, cy + radius + 2, distance_at, lambda _x, _y: color)


def stroke_circle(cx: float, cy: float, radius: float, width: float, color: Color) -> None:
    def distance_at(x: float, y: float) -> float:
        return abs(math.hypot(x - cx, y - cy) - radius) - width / 2

    fill_sdf(
        cx - radius - width,
        cy - radius - width,
        cx + radius + width,
        cy + radius + width,
        distance_at,
        lambda _x, _y: color,
    )


def distance_to_segment(px: float, py: float, a: Point, b: Point) -> float:
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return math.hypot(px - ax, py - ay)
    t = clamp(((px - ax) * dx + (py - ay) * dy) / length_sq)
    x, y = ax + t * dx, ay + t * dy
    return math.hypot(px - x, py - y)


def draw_line(points: Iterable[Point], radius: float, color: Color) -> None:
    pts = list(points)
    for a, b in zip(pts, pts[1:]):
        x0, y0 = min(a[0], b[0]) - radius - 2, min(a[1], b[1]) - radius - 2
        x1, y1 = max(a[0], b[0]) + radius + 2, max(a[1], b[1]) + radius + 2

        def distance_at(x: float, y: float) -> float:
            return distance_to_segment(x, y, a, b) - radius

        fill_sdf(x0, y0, x1, y1, distance_at, lambda _x, _y: color)


def point_in_polygon(x: float, y: float, pts: list[Point]) -> bool:
    inside = False
    j = len(pts) - 1
    for i, point in enumerate(pts):
        xi, yi = point
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def polygon(pts: list[Point], fill: Color, stroke: Color, stroke_width: float) -> None:
    min_x = min(p[0] for p in pts) - stroke_width - 3
    max_x = max(p[0] for p in pts) + stroke_width + 3
    min_y = min(p[1] for p in pts) - stroke_width - 3
    max_y = max(p[1] for p in pts) + stroke_width + 3
    bx0, by0, bx1, by1 = logical_bounds(min_x, min_y, max_x, max_y)

    for yy in range(by0, by1):
        y = yy / SCALE
        for xx in range(bx0, bx1):
            x = xx / SCALE
            inside = point_in_polygon(x, y, pts)
            dist = min(distance_to_segment(x, y, pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts)))

            if inside and fill[3] > 0:
                blend_pixel(xx, yy, fill)
            if stroke[3] > 0 and dist <= stroke_width:
                edge = clamp(stroke_width - dist + 0.5)
                blend_pixel(xx, yy, (stroke[0], stroke[1], stroke[2], round(stroke[3] * edge)))


def draw_base() -> None:
    fill_superellipse(512, 546, 400, 374, lambda _x, _y: (0, 0, 0, 82), 5.0)

    def tile_color(_x: float, y: float) -> Color:
        vertical = clamp((y - 120) / 780)
        return mix_color(CARD, CARD_DARK, vertical)

    fill_superellipse(512, 512, 392, 392, tile_color, 5.0)
    stroke_superellipse(512, 512, 392, 392, 7, BORDER, 5.0)
    stroke_superellipse(512, 512, 366, 366, 2.5, with_alpha(FOREGROUND, 24), 5.0)


def draw_canvas_card() -> None:
    rounded_rect(512, 512, 520, 520, 92, with_alpha(BACKGROUND, 196), with_alpha(BORDER, 118), 6)


def draw_flow_mark() -> None:
    polygon([(512, 330), (694, 512), (512, 694), (330, 512)], CARD_DARK, FOREGROUND, 18)
    polygon([(512, 430), (594, 512), (512, 594), (430, 512)], with_alpha(FOREGROUND, 0), with_alpha(ACCENT, 190), 8)


def draw_recording_dot() -> None:
    fill_circle(670, 354, 54, with_alpha(RECORDING, 34))
    stroke_circle(670, 354, 49, 10, with_alpha(BACKGROUND, 230))
    fill_circle(670, 354, 36, RECORDING)
    stroke_circle(670, 354, 36, 3, with_alpha(FOREGROUND, 104))


def png_chunk(name: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + name + data + struct.pack(">I", zlib.crc32(name + data) & 0xFFFFFFFF)


def downsample_2x() -> bytearray:
    out = bytearray(SIZE * SIZE * 4)
    for y in range(SIZE):
        for x in range(SIZE):
            sum_a = 0
            sum_r = 0
            sum_g = 0
            sum_b = 0
            for yy in (y * 2, y * 2 + 1):
                for xx in (x * 2, x * 2 + 1):
                    i = (yy * W + xx) * 4
                    a = pixels[i + 3]
                    sum_a += a
                    sum_r += pixels[i] * a
                    sum_g += pixels[i + 1] * a
                    sum_b += pixels[i + 2] * a
            o = (y * SIZE + x) * 4
            avg_a = round(sum_a / 4)
            out[o + 3] = avg_a
            if sum_a:
                out[o] = round(sum_r / sum_a)
                out[o + 1] = round(sum_g / sum_a)
                out[o + 2] = round(sum_b / sum_a)
    return out


def write_png(path: str, width: int, height: int, rgba: bytearray) -> None:
    raw = bytearray()
    row_bytes = width * 4
    for y in range(height):
        raw.append(0)
        start = y * row_bytes
        raw.extend(rgba[start : start + row_bytes])

    with open(path, "wb") as file:
        file.write(b"\x89PNG\r\n\x1a\n")
        file.write(png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)))
        file.write(png_chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        file.write(png_chunk(b"IEND", b""))


def main() -> None:
    os.makedirs("build", exist_ok=True)
    draw_base()
    draw_canvas_card()
    draw_flow_mark()
    draw_recording_dot()

    icon = downsample_2x()
    write_png("build/icon.png", SIZE, SIZE, icon)
    write_png("build/icon-source.png", SIZE, SIZE, icon)
    print("Wrote build/icon.png and build/icon-source.png")


if __name__ == "__main__":
    main()
