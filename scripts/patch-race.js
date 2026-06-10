const fs = require('fs');
const path = require('path');

const multiRaceFile = path.join(__dirname, '../components/MultiplayerRace.tsx');
let multiContent = fs.readFileSync(multiRaceFile, 'utf8');

multiContent = multiContent.replace(
  'import { drawFlame, drawCyberCruiser, drawCyberUFO, drawCyberJet, shade, hexA }',
  'import { drawFlame, drawCyberCruiser, drawCyberUFO, drawCyberJet, drawCyberInterceptor, drawNeonSpeeder, drawCyberDrone, shade, hexA }'
);

multiContent = multiContent.replace(
  `        const skin = (cfg && cfg.selectedSkin) ? cfg.selectedSkin : 'default';

        drawFlame(ctx, r.thrust, color, t, r.seed, boost);

        if (skin === 'ufo') {
           drawCyberUFO(ctx, color, r.thrust, t, t*2.5, 64);
        } else if (skin === 'plane') {
           drawCyberJet(ctx, color, r.thrust);
        } else {
           drawCyberCruiser(ctx, color, r.isMe, r.tilt);
        }`,
  `        const skin = (cfg && cfg.selectedSkin) ? cfg.selectedSkin : 'default';
        const flameColor = (cfg && cfg.flameColor) ? cfg.flameColor : null;

        drawFlame(ctx, r.thrust, color, flameColor, t, r.seed, boost);

        if (skin === 'ufo') {
           drawCyberUFO(ctx, color, r.thrust, t, t*2.5, 64);
        } else if (skin === 'plane') {
           drawCyberJet(ctx, color, r.thrust);
        } else if (skin === 'interceptor') {
           drawCyberInterceptor(ctx, color, r.isMe, r.tilt);
        } else if (skin === 'speeder') {
           drawNeonSpeeder(ctx, color, r.thrust);
        } else if (skin === 'drone') {
           drawCyberDrone(ctx, color, t);
        } else {
           drawCyberCruiser(ctx, color, r.isMe, r.tilt);
        }`
);

fs.writeFileSync(multiRaceFile, multiContent);

const modelRaceFile = path.join(__dirname, '../components/ModelRace.tsx');
let modelContent = fs.readFileSync(modelRaceFile, 'utf8');

modelContent = modelContent.replace(
  'import { drawFlame, drawCyberUFO, drawCyberCruiser, hexA, shade, TAU }',
  'import { drawFlame, drawCyberUFO, drawCyberCruiser, drawCyberJet, drawCyberInterceptor, drawNeonSpeeder, drawCyberDrone, hexA, shade, TAU }'
);

modelContent = modelContent.replace(
  'ctx.save(); ctx.translate(r.x, y); drawFlame(ctx, r.thrust, r.color, t, r.seed, r.burstTimer / BURST_FRAMES); drawShip(ctx, r, t, uCfg || null, i); ctx.restore();',
  'const flameColor = uCfg ? uCfg.flameColor : null;\n        ctx.save(); ctx.translate(r.x, y); drawFlame(ctx, r.thrust, r.color, flameColor, t, r.seed, r.burstTimer / BURST_FRAMES); drawShip(ctx, r, t, uCfg || null, i); ctx.restore();'
);

modelContent = modelContent.replace(
  `    if (skinId === 'ufo') { drawCyberUFO(ctx, r.color, r.thrust, t, r.roll, SHIP_SIZE); } 
    else { ctx.save(); ctx.scale(0.55, 0.55); ctx.scale(1, Math.cos(r.roll)); drawCyberCruiser(ctx, r.color, true); ctx.restore(); }`,
  `    if (skinId === 'ufo') { drawCyberUFO(ctx, r.color, r.thrust, t, r.roll, SHIP_SIZE); } 
    else if (skinId === 'plane') { drawCyberJet(ctx, r.color, r.thrust); }
    else if (skinId === 'interceptor') { ctx.save(); ctx.scale(0.55, 0.55); ctx.scale(1, Math.cos(r.roll)); drawCyberInterceptor(ctx, r.color, true); ctx.restore(); }
    else if (skinId === 'speeder') { drawNeonSpeeder(ctx, r.color, r.thrust); }
    else if (skinId === 'drone') { drawCyberDrone(ctx, r.color, t); }
    else { ctx.save(); ctx.scale(0.55, 0.55); ctx.scale(1, Math.cos(r.roll)); drawCyberCruiser(ctx, r.color, true); ctx.restore(); }`
);

fs.writeFileSync(modelRaceFile, modelContent);
console.log('Patched Multi and Model Race files');
