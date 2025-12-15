#!/usr/bin/env python3
"""
Generate dice favicons for multiplayer backgammon.
Creates PNG favicons in various sizes using pure Pillow (no cairo).

Requirements:
    pip install pillow

Usage:
    python generate_favicons.py
"""

import os
from PIL import Image, ImageDraw


def draw_dice(size):
    """Draw two overlapping dice both showing 6."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Scale factor (canvas is 64x64 base)
    s = size / 64
    
    # Die dimensions
    die_size = int(36 * s)
    corner_radius = int(5 * s)
    dot_radius = max(1, int(3 * s))
    
    # White die (back) - slightly offset up-left
    white_x, white_y = int(2 * s), int(2 * s)
    
    # Red die (front) - overlapping, offset down-right
    red_x, red_y = int(26 * s), int(26 * s)
    
    # Draw white die (showing 6) - behind
    draw.rounded_rectangle(
        [white_x, white_y, white_x + die_size, white_y + die_size],
        radius=corner_radius,
        fill='#f0f0f0',
        outline='#aaaaaa',
        width=max(1, int(s))
    )
    
    # White die dots (6 pattern - two columns of 3)
    # Die center is at white_x + die_size/2, white_y + die_size/2
    # Dots at 25% and 75% horizontally, 25%, 50%, 75% vertically
    w_cx = white_x + die_size / 2
    w_cy = white_y + die_size / 2
    dot_offset_x = die_size * 0.25
    dot_offset_y = die_size * 0.28
    
    white_dots = [
        (w_cx - dot_offset_x, w_cy - dot_offset_y),  # left top
        (w_cx + dot_offset_x, w_cy - dot_offset_y),  # right top
        (w_cx - dot_offset_x, w_cy),                  # left middle
        (w_cx + dot_offset_x, w_cy),                  # right middle
        (w_cx - dot_offset_x, w_cy + dot_offset_y),  # left bottom
        (w_cx + dot_offset_x, w_cy + dot_offset_y),  # right bottom
    ]
    for cx, cy in white_dots:
        draw.ellipse(
            [cx - dot_radius, cy - dot_radius, cx + dot_radius, cy + dot_radius],
            fill='#222222'
        )
    
    # Draw red die (showing 6) - in front
    draw.rounded_rectangle(
        [red_x, red_y, red_x + die_size, red_y + die_size],
        radius=corner_radius,
        fill='#c62828',
        outline='#8e0000',
        width=max(1, int(s))
    )
    
    # Red die dots (6 pattern)
    r_cx = red_x + die_size / 2
    r_cy = red_y + die_size / 2
    
    red_dots = [
        (r_cx - dot_offset_x, r_cy - dot_offset_y),  # left top
        (r_cx + dot_offset_x, r_cy - dot_offset_y),  # right top
        (r_cx - dot_offset_x, r_cy),                  # left middle
        (r_cx + dot_offset_x, r_cy),                  # right middle
        (r_cx - dot_offset_x, r_cy + dot_offset_y),  # left bottom
        (r_cx + dot_offset_x, r_cy + dot_offset_y),  # right bottom
    ]
    for cx, cy in red_dots:
        draw.ellipse(
            [cx - dot_radius, cy - dot_radius, cx + dot_radius, cy + dot_radius],
            fill='#ffffff'
        )
    
    return img


def create_svg():
    """Create an SVG version of the dice favicon - two overlapping dice both showing 6."""
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="dice1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f5f5f5"/>
      <stop offset="100%" style="stop-color:#e0e0e0"/>
    </linearGradient>
    <linearGradient id="dice2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#c62828"/>
      <stop offset="100%" style="stop-color:#8e0000"/>
    </linearGradient>
  </defs>
  
  <!-- White die (showing 6) - back -->
  <rect x="2" y="2" width="36" height="36" rx="5" fill="url(#dice1)" stroke="#aaa" stroke-width="1"/>
  <circle cx="11" cy="10" r="3" fill="#222"/>
  <circle cx="29" cy="10" r="3" fill="#222"/>
  <circle cx="11" cy="20" r="3" fill="#222"/>
  <circle cx="29" cy="20" r="3" fill="#222"/>
  <circle cx="11" cy="30" r="3" fill="#222"/>
  <circle cx="29" cy="30" r="3" fill="#222"/>
  
  <!-- Red die (showing 6) - front -->
  <rect x="26" y="26" width="36" height="36" rx="5" fill="url(#dice2)" stroke="#8e0000" stroke-width="1"/>
  <circle cx="35" cy="34" r="3" fill="#fff"/>
  <circle cx="53" cy="34" r="3" fill="#fff"/>
  <circle cx="35" cy="44" r="3" fill="#fff"/>
  <circle cx="53" cy="44" r="3" fill="#fff"/>
  <circle cx="35" cy="54" r="3" fill="#fff"/>
  <circle cx="53" cy="54" r="3" fill="#fff"/>
</svg>'''


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Save SVG
    svg_path = os.path.join(script_dir, 'favicon.svg')
    with open(svg_path, 'w') as f:
        f.write(create_svg())
    print(f"Created: {svg_path}")
    
    # Generate PNG versions
    sizes = [
        ('favicon-16x16.png', 16),
        ('favicon-32x32.png', 32),
        ('apple-touch-icon.png', 180),
        ('android-chrome-192x192.png', 192),
        ('android-chrome-512x512.png', 512),
    ]
    
    for filename, size in sizes:
        img = draw_dice(size)
        output_path = os.path.join(script_dir, filename)
        img.save(output_path, 'PNG')
        print(f"Created: {output_path}")
    
    # Create favicon.ico (multi-size ICO)
    ico_sizes = [16, 32, 48]
    images = [draw_dice(s) for s in ico_sizes]
    
    ico_path = os.path.join(script_dir, 'favicon.ico')
    images[0].save(
        ico_path,
        format='ICO',
        sizes=[(s, s) for s in ico_sizes],
        append_images=images[1:]
    )
    print(f"Created: {ico_path}")
    
    print("\nAll favicons generated successfully!")


if __name__ == '__main__':
    main()
