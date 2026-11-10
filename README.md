# USM and RL Sharpening for Safelight

A [Safelight](https://github.com/anthonyreimche/SafeLight) extension that
sharpens lightness (L* of CIE Lab) after the tone and colour edits, by one of
two methods: an unsharp mask, or Richardson-Lucy deconvolution. A contrast
mask mixes the result in, so flat areas and noise stay as they were, and the
flattest areas can be blurred a little instead. Colour (a* and b*) is left
alone.

## Controls

- **Enabled**: the switch (the panel is titled USM & RL Sharpening). Off is
  where a photo starts, so an untouched photo costs nothing. No Amount is a
  no-op for both methods, which is why this one is a switch.
- **Contrast threshold** (0 to 200, default 20): how much local contrast a
  spot needs before it is sharpened. Below it, sharpening fades out; 0
  sharpens everywhere.
- **Blur radius** (0.2 to 2, default 0.2, off below 0.25): blurs the areas the
  contrast threshold leaves out, by this radius.
- **Method**: *Unsharp mask* or *RL deconvolution*.

Unsharp mask:

- **Radius** (0.3 to 3, default 0.5): the size of the detail sharpened.
- **Threshold**, four points in lightness units of 0 to 2000 (of 32768):
  sharpening fades in between **Fade-in start** and **Fade-in end** (20 and
  80), is full up to **Fade-out start** (1200) and fades out by **Fade-out
  end** (2000). Small differences are noise, the largest are edges that need
  no help. 0, 0, 2000, 2000 sharpens every difference.
- **Amount** (1 to 1000 %, default 200).
- **Sharpen only edges**: sharpens an edge-preserving smoothed copy instead
  of the photo, so texture and noise between edges stay as they were. **Edge
  detection radius** (0.5 to 2.5) is the smoothing's size and **Edge
  tolerance** (10 to 10000) how large a step still counts as texture.
- **Halo control**: holds each sharpened pixel near the range of its
  neighbourhood; **Halo amount** (1 to 100, default 85) is how hard. Pixels
  within two of the frame's edge are not sharpened while it is on.

RL deconvolution:

- **Radius** (0.4 to 2.5, default 0.75): the blur the deconvolution undoes.
- **Amount** (0 to 100 %, default 100): how much of the result is mixed in.
- **Damping** (0 to 100, default 0): holds back where the photo is already
  close to the estimate, which keeps noise down.
- **Iterations** (5 to 100, default 30): more sharpens further, at more cost.

The panel also works inside a mask, so the sharpening can be local.

## Notes

- Radii are in pixels of the photo. In Develop, at a render resolution below
  the photo's own size, every radius shrinks with it, as it would in a
  preview of the original tool; very small radii then switch off (below 0.25
  px). Judge fine sharpening at 100 % or in an export.
- Cost: one draw for the lightness, three for the contrast mask, two to six
  for the unsharp mask (one to four more for edges only), two to four per
  deconvolution iteration and one or two for the result. No draw reads more
  than 56 texels per pixel; 100
  iterations at radius 2.5 is about 400 draws. On a recent desktop GPU at a
  4096-pixel render, each draw costs about half a millisecond.
- It runs in the display phase in linear Rec. 709, unclipped, after Sharpen
  Edges and Sharpen Microcontrast.
- Precision: the result matches the original tool's arithmetic to about a
  tenth of an L* on most pixels; the GPU's half-float buffers leave up to
  about half an L* on the worst pixels of a 100-iteration deconvolution, and
  up to about 3 L* where the graphics driver rounds half floats toward zero
  (Direct3D on Windows).

## Development

```
npm run check       # typecheck, build dist/, unit tests
npm run test:gpu    # the shaders on the real renderer (needs a SafeLight checkout)
npm run update-types
```

`test/reference/rtref.ts` is a float32 transcription of the original
algorithm; a fixture beside it holds the original program's output on a small
scene, and `rtref.test.ts` holds the transcription to it.
`approximations.test.ts` measures what the GPU's stand-ins cost (the recursive
blur drawn as a FIR, half-float state). The GPU spec holds the shaders to the
transcription. Source headers carry the credits and the licence is
GPL-3.0-or-later.
