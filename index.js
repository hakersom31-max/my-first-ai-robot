const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const GoalFollow = goals.GoalFollow;
const { GoogleGenAI } = require('@google/genai');
const express = require('express');

const app = express();
app.get('/', (req, res) => {
  res.send('Bot is Alive and Running 24/7!');
});
app.listen(3000);

const GEMINI_API_KEY = 'AIzaSyDTOAz60BoYleAtvqouzdZLylQ7qQdFOko'; 
const SERVER_HOST = 'MrPro431.aternos.me';                  
const SERVER_PORT = 39135;                        
const BOT_NAME = 'MrPro2.0';                 

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
let deathLocation = null; 

const bot = mineflayer.createBot({
  host: SERVER_HOST,
  port: SERVER_PORT,
  username: BOT_NAME
});

bot.loadPlugin(pathfinder);

bot.once('spawn', () => {
  bot.chat(Hello! I am ${bot.username}, an AI Companion. Ask me anything!);
  startExploring();
});

bot.on('death', () => {
  deathLocation = bot.entity.position.clone();
  bot.chat('Oh no, I died! Respawning and coming back to my last location soon...');
});

bot.on('spawn', () => {
  if (deathLocation) {
    setTimeout(() => {
      bot.chat('Heading back to the place where I died!');
      const defaultMove = new Movements(bot);
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new goals.GoalXZ(deathLocation.x, deathLocation.z));
    }, 2000);
  }
});

function startExploring() {
  setInterval(() => {
    if (!bot.pathfinder.isMoving()) {
      const rx = (Math.random() - 0.5) * 30;
      const rz = (Math.random() - 0.5) * 30;
      const defaultMove = new Movements(bot);
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new goals.GoalXZ(bot.entity.position.x + rx, bot.entity.position.z + rz));
    }
  }, 12000);
}

bot.on('physicTick', () => {
  const target = bot.nearestEntity((entity) => {
    if (!entity) return false;
    const isHostile = entity.type === 'hostile' || ['zombie', 'skeleton', 'spider', 'creeper'].includes(entity.name);
    
    if (entity.type === 'mob' || entity.type === 'animal') {
      const blockBelow = bot.blockAt(entity.position.offset(0, -1, 0));
      const blockAround = bot.blockAt(entity.position);
      const isInsideFarm = blockBelow?.name.includes('fence') || 
                           blockAround?.name.includes('fence') || 
                           blockBelow?.name.includes('planks') || 
                           blockBelow?.name.includes('stone_bricks');
      return !isInsideFarm;
    }
    return isHostile;
  });

  if (target && bot.entity.position.distanceTo(target.position) < 4) {
    bot.attack(target);
  }
});

bot.on('entityHurt', (entity) => {
  if (entity === bot.entity) {
    const attacker = bot.nearestEntity((e) => e.type === 'player' || e.type === 'hostile');
    if (attacker) {
      bot.chat(Hey ${attacker.username || attacker.name}! Take this!);
      bot.lookAt(attacker.position, true, () => {
        bot.attack(attacker);
      });
    }
  }
});

async function buildSimpleHouse(startPos) {
  bot.chat('Starting to build a small protective shelter for you!');
  const movements = new Movements(bot);
  bot.pathfinder.setMovements(movements);
  const blockType = bot.registry.itemsByName['cobblestone'] || bot.registry.itemsByName['dirt'];
  
  if (!bot.inventory.findInventoryItem(blockType.id)) {
    bot.chat("I don't have enough blocks to build!");
    return;
  }

  for (let x = -1; x <= 1; x++) {
    for (let z = -1; z <= 1; z++) {
      if (x === 0 && z === 0) continue;
      for (let y = 0; y < 2; y++) {
        const targetPos = startPos.offset(x, y, z);
        if (bot.blockAt(targetPos).name === 'air') {
          try {
            await bot.pathfinder.goto(new goals.GoalLookAtBlock(targetPos, bot.world));
            const referenceBlock = bot.blockAt(targetPos.offset(0, -1, 0));
            await bot.equip(blockType.id, 'hand');
            await bot.placeBlock(referenceBlock, new vec3(0, 1, 0));
          } catch (err) {
            console.log('Placement failed:', err);
          }
        }
      }
    }
  }
  bot.chat('Your structure is ready!');
}

bot.on('chat', async (username, message) => {
  if (username === bot.username) return;
  const msg = message.toLowerCase();

  if (msg === 'build house' || msg === 'ঘর বানাও') {
    const player = bot.players[username]?.entity;
    if (player) {
      bot.pathfinder.setGoal(null);
      await buildSimpleHouse(player.position.floored());
    } else {
      bot.chat('I cannot see you! Please come closer.');
    }
    return;
  }

  if (msg === 'come' || msg === 'follow me' || msg === 'এখানে এসো') {
    deathLocation = null; 
    const player = bot.players[username]?.entity;
    if (player) {
      bot.chat('Understood, coming to your location!');
      const defaultMove = new Movements(bot);
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalFollow(player, 1));
    } else {
      bot.chat('I cannot find you!');
    }
    return;
  }
  
  if (msg === 'stop' || msg === 'থেমে যাও') {
    deathLocation = null; 
    bot.chat('Stopping all actions and staying here.');
    bot.pathfinder.setGoal(null);
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: You are a helpful Minecraft Robot named ${BOT_NAME}. A player named ${username} said: "${message}". Reply to them in short and clean English (max 15 words) as a gamer friend.,
    });
    const aiReply = response.text.trim();
    bot.chat(aiReply);
  } catch (error) {
    console.error('Gemini Error:', error);
  }
});
