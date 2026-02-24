export const SPELL_DB = {
  "spells": [
    {
      "name": "Accio",
      "pronunciation_accepted": ["AK-ee-oh", "ak-see-oh", "accio", "a key oh"],
      "type": "utility",
      "color": 0xaaaaaa,
      "effect": "pull"
    },
    {
      "name": "Avada Kedavra",
      "pronunciation_accepted": ["ah-VAH-dah keh-DAV-rah", "avada kedavra", "abracadabra"],
      "type": "curse",
      "color": 0x00ff00,
      "effect": "kill",
      "speed": 25
    },
    {
      "name": "Bombarda",
      "pronunciation_accepted": ["bom-BAR-dah", "bombarda"],
      "type": "spell",
      "color": 0xffaa00,
      "effect": "explosion",
      "radius": 3
    },
    {
      "name": "Confringo",
      "pronunciation_accepted": ["con-FRING-oh", "confringo"],
      "type": "spell",
      "color": 0xff4400,
      "effect": "explosion",
      "radius": 4
    },
    {
      "name": "Crucio",
      "pronunciation_accepted": ["KROO-see-oh", "crucio"],
      "type": "curse",
      "color": 0xff0000,
      "effect": "stun",
      "duration": 5
    },
    {
      "name": "Expelliarmus",
      "pronunciation_accepted": ["ex-pel-ee-AR-mus", "expelliarmus"],
      "type": "spell",
      "color": 0xff0000,
      "effect": "disarm",
      "speed": 20
    },
    {
      "name": "Flipendo",
      "pronunciation_accepted": ["flih-PEN-doh", "flipendo"],
      "type": "spell",
      "color": 0x0088ff,
      "effect": "knockback",
      "force": 20
    },
    {
      "name": "Incendio",
      "pronunciation_accepted": ["in-SEN-dee-oh", "incendio"],
      "type": "spell",
      "color": 0xff8800,
      "effect": "fire"
    },
    {
      "name": "Lumos",
      "pronunciation_accepted": ["LOO-mos", "lumos"],
      "type": "utility",
      "effect": "light_on"
    },
    {
      "name": "Nox",
      "pronunciation_accepted": ["noks", "nox", "knocks"],
      "type": "utility",
      "effect": "light_off"
    },
    {
      "name": "Petrificus Totalus",
      "pronunciation_accepted": ["peh-TRIH-fih-kus TOH-tah-lus", "petrificus totalus"],
      "type": "curse",
      "color": 0xffffff,
      "effect": "freeze",
      "duration": 5
    },
    {
      "name": "Protego",
      "pronunciation_accepted": ["proh-TAY-goh", "protego", "potato"],
      "type": "utility",
      "effect": "shield",
      "duration": 3
    },
    {
      "name": "Stupefy",
      "pronunciation_accepted": ["STOO-peh-fy", "stupefy"],
      "type": "spell",
      "color": 0xff0000,
      "effect": "stun",
      "duration": 3
    },
    {
      "name": "Wingardium Leviosa",
      "pronunciation_accepted": ["win-GAR-dee-um lev-ee-OH-sah", "wingardium leviosa"],
      "type": "spell",
      "color": 0xaa88ff,
      "effect": "levitate"
    }
  ]
};

// Helper to match voice input to spell
export function matchSpell(transcript) {
    const t = transcript.toLowerCase().trim();
    // Direct match or partial
    return SPELL_DB.spells.find(s => 
        s.name.toLowerCase() === t || 
        s.pronunciation_accepted.some(p => t.includes(p.toLowerCase()))
    );
}