import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..');

const modelsSrcDir = path.join(repoRoot, '3DModels');
const x3dSrcDir = path.join(repoRoot, 'Resources', 'mission-viz', 'X3Dom');

const publicModelsDir = path.join(appRoot, 'public', 'models');
const publicTexturesDir = path.join(appRoot, 'public', 'textures');

fs.mkdirSync(publicModelsDir, { recursive: true });
fs.mkdirSync(publicTexturesDir, { recursive: true });

// 1. Non-destructively stage .glb models via symlinks (or copy fallback)
const glbFiles = [
  'earth.glb',
  'cloud.glb',
  'moon.glb',
  'mars_the_red_planet_free.glb',
  'sun.glb',
];

for (const filename of glbFiles) {
  const srcPath = path.join(modelsSrcDir, filename);
  const destPath = path.join(publicModelsDir, filename);
  if (!fs.existsSync(srcPath)) {
    const stat = fs.lstatSync(destPath, { throwIfNoEntry: false });
    if (stat && stat.isSymbolicLink() && !fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
      console.log(`[stage-assets] Removed dangling symlink public/models/${filename}`);
    }
    continue;
  }
  try {
    if (fs.lstatSync(destPath, { throwIfNoEntry: false })) {
      fs.unlinkSync(destPath);
    }
    fs.copyFileSync(srcPath, destPath);
    console.log(`[stage-assets] Copied ${filename} -> public/models/${filename}`);
  } catch {
    console.warn(`[stage-assets] Could not stage ${filename}`);
  }
}

// 2. Non-destructively copy NASA equirectangular textures from Resources/mission-viz/X3Dom
const textureFiles = ['EarthImage.jpg', 'Moon_Flat.jpg'];
for (const tex of textureFiles) {
  const srcPath = path.join(x3dSrcDir, tex);
  const destPath = path.join(publicTexturesDir, tex);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`[stage-assets] Staged texture ${tex} -> public/textures/${tex}`);
  }
}

// 3. Extract TrianaSatellite.x3d into a compact Three.js-ready JSON mesh descriptor
const trianaX3dPath = path.join(x3dSrcDir, 'TrianaSatellite.x3d');
if (fs.existsSync(trianaX3dPath)) {
  const xml = fs.readFileSync(trianaX3dPath, 'utf8');
  const shapeRegex = /<Shape[\s\S]*?<\/Shape>/gi;
  const shapes = xml.match(shapeRegex) || [];
  const extractedGroups = [];

  const sharedPointMatch = xml.match(/point=["']([^"']+)["']/i);
  const sharedPoints = sharedPointMatch
    ? sharedPointMatch[1]
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .filter((n) => !Number.isNaN(n))
        .map((n) => Number(n.toFixed(4)))
    : [];

  for (let i = 0; i < shapes.length; i++) {
    const block = shapes[i];
    const diffuseMatch = block.match(/diffuseColor=["']([^"']+)["']/i);
    const specularMatch = block.match(/specularColor=["']([^"']+)["']/i);
    const coordIndexMatch = block.match(/coordIndex=["']([^"']+)["']/i);

    if (!coordIndexMatch) continue;

    const diffuse = diffuseMatch
      ? diffuseMatch[1].trim().split(/\s+/).map(Number)
      : [0.75, 0.78, 0.82];
    const specular = specularMatch
      ? specularMatch[1].trim().split(/\s+/).map(Number)
      : [0.3, 0.3, 0.3];

    const rawIndices = coordIndexMatch[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => !Number.isNaN(n));

    // Triangulate polygons delimited by -1
    const triangles = [];
    let poly = [];
    for (const idx of rawIndices) {
      if (idx === -1) {
        if (poly.length >= 3) {
          for (let k = 1; k < poly.length - 1; k++) {
            triangles.push(poly[0], poly[k], poly[k + 1]);
          }
        }
        poly = [];
      } else {
        poly.push(idx);
      }
    }

    extractedGroups.push({
      id: `triana-part-${i}`,
      diffuse,
      specular,
      triangleCount: Math.floor(triangles.length / 3),
      indices: triangles,
    });
  }

  const outJsonPath = path.join(publicModelsDir, 'triana-spacecraft.json');
  fs.writeFileSync(
    outJsonPath,
    JSON.stringify({
      name: 'NASA GSFC Triana / DSCOVR Spacecraft Mesh',
      license: 'MIT / NASA Public Domain',
      source: 'Resources/mission-viz/X3Dom/TrianaSatellite.x3d',
      vertexCount: Math.floor(sharedPoints.length / 3),
      sharedPositions: sharedPoints,
      groups: extractedGroups,
    })
  );
  console.log(
    `[stage-assets] Converted TrianaSatellite.x3d (${extractedGroups.length} mesh groups) -> public/models/triana-spacecraft.json`
  );
}
