const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../components/MultiplayerRace.tsx');
let content = fs.readFileSync(file, 'utf8');

// Add imports
if (!content.includes('getRocketConfig')) {
  content = content.replace(
    'import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";',
    'import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";\nimport { getRocketConfig } from "@/lib/rocket-config";\nimport { drawFlame, drawCyberCruiser, drawCyberUFO, drawCyberJet, shade, hexA } from "@/lib/rocket-renderer";'
  );
}

// Remove shade function
content = content.replace(/function shade\([\s\S]*?return `rgb\(\$\{r\},\$\{g\},\$\{b\}\)`;\n}\n/, '');

// Remove hexA function
content = content.replace(/function hexA\([\s\S]*?return `rgba\(\$\{n >> 16\},\$\{\(n >> 8\) & 255\},\$\{n & 255\},\$\{a\}\)`;\n}\n/, '');

// Remove plumeCone function
content = content.replace(/  function plumeCone\([\s\S]*?ctx\.fill\(\);\n  }\n/, '');

// Remove drawFlame function
content = content.replace(/  function drawFlame\([\s\S]*?ctx\.restore\(\);\n  }\n/, '');

// Remove drawRocketBody function
content = content.replace(/  \/\/ Rocket: render player as an aggressive CYBER battlecruiser[\s\S]*?function drawRocketBody\([\s\S]*?ctx\.restore\(\);\n  }\n/, '');

// Now fix the calls in frame()
content = content.replace(
  '        drawFlame(ctx, r.thrust, r.color, t, r.seed, boost);\n        drawRocketBody(ctx, r.color, r.name, r.isMe, r.tilt);',
  `        const cfg = typeof window !== "undefined" && r.isMe ? getRocketConfig() : null;
        const color = (cfg && cfg.selectedColor) ? cfg.selectedColor : r.color;
        const skin = (cfg && cfg.selectedSkin) ? cfg.selectedSkin : 'default';

        drawFlame(ctx, r.thrust, color, t, r.seed, boost);

        if (skin === 'ufo') {
           drawCyberUFO(ctx, color, r.thrust, t, t*2.5, 64);
        } else if (skin === 'plane') {
           drawCyberJet(ctx, color, r.thrust);
        } else {
           drawCyberCruiser(ctx, color, r.isMe, r.tilt);
        }`
);

fs.writeFileSync(file, content);
console.log('Refactored MultiplayerRace.tsx');
