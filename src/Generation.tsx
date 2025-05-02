import { Stage, UserState } from "./Stage";
import { findMostSimilarStat, Stat } from "./Stat";
import { Item } from "./Item";
import { Outcome, ResultDescription } from "./Outcome";

function buildSection(name: string, body: string) {
    return `### ${name.toUpperCase()}:\n${body.trim()}\n\n`;
}

function buildStatPrompt(stage: Stage): string {
    const baseUser = Object.values(stage.users)[0];
    const baseCharacter = Object.values(stage.characters)[0];
    return (
        buildSection('FLAVOR TEXT', stage.replaceTags((baseCharacter.personality + ' ' + baseCharacter.description + '\n' + baseCharacter.scenario), {user: baseUser.name, char: baseCharacter.name})) +
        buildSection('Example Response', '\n' +
            `Might - Physical power and endurance. Smash, lift, weather, intimidate\n` +
            `Grace - Agility and composure. Dodge, balance, dance, land\n` +
            `Skill - Sleight and craftmanship. Picklock, craft, shoot, fix, pickpocket\n` +
            `Brains - Knowledge and judgment. Solve, deduce, recall, plan\n` +
            `Wits - Instinct and awareness. React, notice, quip, trick\n` +
            `Charm - Allure and Influence. Persuade, inspire, deceive, entertain, impress\n` +
            `Heart - Determination and empathy. Resist, recover, connect, encourage, comfort\n` +
            `Luck - Spirit and fortune. Gamble, discover, coincide, hope\n`) +
        buildSection('Example Response', '\n' +
            `Strength - Represents physical power and the ability to lift, carry, or break objects. It governs melee combat and brute force tasks.\n` +
            `Dexterity - Measures agility, reflexes, and precision, crucial for ranged attacks, stealth, and quick movements.\n` +
            `Constitution - Reflects endurance, health, and resilience, affecting stamina and the ability to withstand injuries or exhaustion.\n` +
            `Intelligence - Denotes mental acuity, logic, and knowledge. It's key for problem-solving, learning, and spellcasting in some systems.\n` +
            `Wisdom - Represents insight, perception, and decision-making, often tied to intuition and spiritual understanding.\n` +
            `Charisma - Embodies charm, persuasion, and leadership, influencing how characters interact socially and inspire others.\n`) +
        buildSection('Example Response', '\n' +
            `Body - Represents physical strength, toughness, and endurance, often dictating how much damage a character can take or deliver in physical confrontations.\n` +
            `Reflexes - Measures agility, coordination, and reaction speed, crucial for dodging, aiming, or performing quick actions under pressure.\n` +
            `Tech - Denotes a character's aptitude with technology and mechanical skills, including the ability to repair, modify, or use advanced equipment.\n` +
            `Smarts - Reflects intelligence, problem-solving capability, and resourcefulness, influencing success in analytical and knowledge-based challenges.\n` +
            `Cool - Embodies composure, confidence, and social savvy, affecting the ability to stay calm under pressure and influence others effectively.\n`) +
        buildSection('Example Response', '\n' +
            `Brawn - Represents sheer physical strength and power, essential for feats of brute force and overcoming physical obstacles.\n` +
            `Vigor - Reflects energy, stamina, and vitality, determining endurance and the ability to persist in strenuous activities.\n` +
            `Finesse - Captures precision, grace, and dexterity, vital for delicate or agile movements and tasks requiring subtle control.\n` +
            `Mind - Denotes intellectual capacity, critical thinking, and analytical skills, influencing problem-solving and strategic decisions.\n` +
            `Spirit - Embodies willpower, emotional resilience, and connection to deeper forces, playing a role in determination and mystical abilities.\n`) +
        buildSection('Example Response', '\n' +
            `Control - Reflects discipline, precision, and mastery over actions, enabling focused execution of complex or delicate tasks.\n` +
            `Daring - Represents boldness, courage, and the willingness to take risks, critical for overcoming fear and facing challenges head-on.\n` +
            `Fitness - Measures physical capability, endurance, and overall health, influencing agility, strength, and stamina in demanding situations.\n` +
            `Insight - Denotes perception, understanding, and the ability to read between the lines, vital for interpreting situations and grasping subtleties.\n` +
            `Presence - Embodies charisma, influence, and the strength of personality, affecting social interactions and the ability to inspire or persuade others.\n` +
            `Reason - Represents logical thinking, analysis, and problem-solving skills, crucial for making sound decisions based on evidence and intellect.\n`) +
        buildSection('Current Instruction',
            `You are doing critical prep work for a new roleplaying game. Instead of narrating, you will first use this planning response to review the FLAVOR TEXT and invent four to eight comprehensive core attributes and their descriptions. ` +
            `Use the FLAVOR TEXT as inspirational material as you name and describe a handful of RPG attributes that suit the vibe of the setting, ensuring that each stat covers a distinct area of character development or gameplay. ` +
            `These stats will be applied to other characters beyond those found in the FLAVOR TEXT, so they should suit a spectrum of strengths and activities. ` +
            `This essential, preparatory response includes four to eight lines, each following this format: "Name - Brief description of what the attribute governs, potentially including example actions that fall under this domain." ` +
            `Simply define these attributes and promptly end your response.\n`) +
        '### FUTURE INSTRUCTION:');
}

export async function generateStats(stage: Stage) {

    const statRegex =   /^(?:\d+\.\s*)?\s*([\w\s-]+?)(?:[-:]\s)(.+)$/gm
    let tries = 3;
    while (Object.values(stage.stats).length < 4 && tries > 0) {
        let textResponse = await stage.generator.textGen({
            prompt: buildStatPrompt(stage),
            max_tokens: 300,
            min_tokens: 100
        });
        if (textResponse && textResponse.result) {
            stage.stats = {};
            let statMatch = null;
            while ((statMatch = statRegex.exec(textResponse.result)) !== null) {
                if (statMatch[1] && statMatch[2]) {
                    stage.stats[statMatch[1].trim()] = new Stat(statMatch[1].trim(), statMatch[2].trim());
                }
            }
        }
        
        tries--;
    }

    if (Object.values(stage.stats).length < 4) {
        stage.stats = {};
        console.log(`Failed to generate stats.`);
    } else {
        console.log(`Generated stats:`);
        console.log(stage.stats);    
    }
}


function buildSampleStatBlocks(stage: Stage) {
    const id = Object.keys(stage.users)[0];
    let userState = stage.getUserState(id);
    let addedInventory = [...userState.inventory];
    let moddedInventory = [...userState.inventory];
    let removedInventory = [...userState.inventory];
    
    addedInventory.push(new Item('Newly Acquired Item', 'Some Stat', Math.floor(Math.random() * 5) - 2));
    if (moddedInventory.length > 0) {
        moddedInventory[0].bonus += 1;
        removedInventory.slice(0, 1);
    }
    
    return buildSection('Example Response (Gaining an Item)', buildStatBlock(stage, id, 0, addedInventory)) +
        (moddedInventory.length > 0 ? (
            buildSection('Example Response (Modifying an Item)', buildStatBlock(stage, id, 0, moddedInventory)) +
            buildSection('Example Response (Removal)', buildStatBlock(stage, id, 0, removedInventory))) : '') +
        buildSection('Example Statblock (Health Loss)', buildStatBlock(stage, id, -3, [...userState.inventory, new Item('Gaping Wound', 'Some Stat', -2)])) +
        (userState.health < userState.maxHealth ? (
            buildSection('Example Response (Health Gain)', buildStatBlock(stage, id, 1, [...userState.inventory, new Item('Cool Scar', 'Some Stat', 1)]))) : '');
};
    
function buildStatBlock(stage: Stage, targetId: string, healthMod: number, inventoryOverride: Item[]|null) {
    return '---\n' +
            Object.keys(stage.users).map(anonymizedId => buildUserState(stage, anonymizedId, targetId == anonymizedId ? healthMod : 0, (inventoryOverride && targetId == anonymizedId) ? inventoryOverride : stage.userStates[anonymizedId].inventory)).join('\n') +
            '\n---';
};

function buildUserState(stage: Stage, anonymizedId: string, healthMod: number, inventory: Item[]) {
    const userState = stage.getUserState(anonymizedId);
    return `${stage.users[anonymizedId].name} - Health: ${userState.health + healthMod}/${userState.maxHealth}\n${inventory.map(item => item.print()).join(' ')}`;
}

export function buildResponsePrompt(stage: Stage, anonymizedId: string, outcome: Outcome) {
    const userState = stage.getUserState(anonymizedId);
    const relevantInventory = userState.inventory.filter(item => item.stat && item.stat == outcome.action.stat?.name);
    const inventoryString = relevantInventory.length > 0 ? `${stage.users[anonymizedId].name} has the following relevant item(s) or status effect(s) that could be incorporated into this moment: ${relevantInventory.map(item => item.print()).join(', ')}.` : `${stage.users[anonymizedId].name} does not have any particularly relevant items or status effects to consider in this situation.`;
    return buildSection('Current Instruction', `${stage.users[anonymizedId].name} has chosen the following action:\n${outcome.action}\n${ResultDescription[outcome.result]}\n${inventoryString}\n`);
};


function buildHistory(history: string[]) {
    return '\n' + history.join('\n\n');
}

function buildStatBlockPrompt(stage: Stage, anonymizedId: string) {
    let mainCharacters = Object.keys(stage.users).map(id => stage.users[id].name).join(', ')
    let affectedCharacters = `{{user}}'s`;
    if (Object.keys(stage.users).length > 1) {
        affectedCharacters += ` (and ${Object.keys(stage.users).filter(id => id != anonymizedId).map(id => stage.users[id].name).join(', ')})`;
    }
    return  `This is a roleplaying narrative for which you will be methodically assessing and updating statblocks for the main character(s): ${mainCharacters}. Each main character has health and a list of significant items or status effects that benefit or penalize the STATS listed below.\n\n` +
            buildSection('Stats', Object.values(stage.stats).map(stat => `${stat.name} - ${stat.description}`).join('\n')) +
            buildSection('Inventory Rules', 'Each main character has an "inventory" of listed items or status effects. Each item has a name, followed by a parenthetical stat and bonus or penalty. The format is quite strict: Name (Stat +x) or Name (Stat -x).' +
                'The inventory should only contain significant items/effects with a single bonus/penalty each. If nothing significant currently applies, the inventory is simply left blank.') +
            buildSection('Sample Statblocks', buildSampleStatBlocks(stage)) +
            buildSection('Chat History', buildHistory(stage.history)) +
            buildSection('Current Statblock', buildStatBlock(stage, '', 0, null)) +
            buildSection('Current Instruction', `You are doing critical prep work for a roleplaying game. Instead of narrating, you will use this planning response to ` +
            `output the CURRENT STATBLOCK, making logical updates--if needed--to implicitly reflect changes to ${affectedCharacters} status and inventory, based on events in {{user}}'s input and {{char}}'s response: ` +
            `updated health; newly acquired, lost, persistent, or modified equipment for {{user}}; and newly imposed, removed, continuous, or updated status effects that impact {{user}}'s stats. ` +
            `This responsorial statblock is unannotated, mechanical, and precicely structured. ` +
            `All listed equipment or status effects follow the same format, with a name, relevant stat (from the STATS list), and modifier between -3 and +3, indicating a penalty (negative) or bonus (positive) toward the selected stat. ` +
            `When adding or modifying items or status effects, choose a single stat and modifier that best convey the impact that that item or effect might have on {{user}}'s stats. ` +
            `Always employ this strict format for items and status effects: Name (Stat +/-x).\n\n`) +
            '### FUTURE INSTRUCTION:';
}

export async function generateStatBlock(stage: Stage) {
    
    let tries = 3;
    let someSuccess = false;
    while (!someSuccess && tries > 0) {
        let textResponse = await stage.generator.textGen({
            prompt: buildStatBlockPrompt(stage, stage.lastSpeaker),

            max_tokens: 100 + (200 * Object.keys(stage.users).length),
            min_tokens: 50
        });
        if (textResponse && textResponse.result) {
            
            textResponse.result = textResponse.result.replace(/\-\-\-/g, '\n---\n');
            console.log(`Result: ${textResponse.result}`);
    
            const statBlocks: string[] = [];
            for (const line of textResponse.result.split("\n")) {
                console.log(line);
                if (line.trim() === '') {
                    console.log('trimmed to empty');
                    continue;
                } else if (line.trim().includes("---")) {
                    if (statBlocks.length == 0) {
                        console.log('--- encountered; continue');
                        continue;
                    } else {
                        console.log('--- encountered; return');
                        break;
                    }
                } else if (line.includes(" - Health: ")) {
                    console.log('Start block');
                    statBlocks.push(line);
                } else if (statBlocks.length > 0) {
                    console.log('Adding to block');
                    statBlocks[statBlocks.length - 1] = statBlocks[statBlocks.length - 1] + '\n' + line;
                }
            }
            console.log(statBlocks);

            for (let statBlock of statBlocks) {
                let success = false;
                const statBlockPattern = /^(.+?) - Health:\s*(\d+)\/(\d+)\s*(.*)/s;
                const match = statBlock.match(statBlockPattern);
                console.log(match);

                if (match && match[1] && match[2] && match[3] && match[4]) {
                    console.log(`Statblock is complete enough to try processing; looking for ID for ${match[1]}`);

                    const anonymizedId = Object.keys(stage.users).find(anonymizedId => stage.users[anonymizedId].name.toLowerCase().trim() == match[1].toLowerCase().trim());

                    if (anonymizedId) {
                        const userState: UserState = {...stage.getUserState(anonymizedId ?? '')} as UserState;

                        success = true;
                        console.log(`Matched a user: ${anonymizedId}/${stage.users[anonymizedId].name}`);
                        userState.health = parseInt(match[2]);
                        userState.maxHealth = parseInt(match[3]);

                        // Clean up inventory:
                        const itemString = match[4].replace(/<br>|\\n|`/gs, ' ');
                        console.log(`Cleaned up inventory: ${itemString}`)
                        const previousInventory = [...userState.inventory];
                        userState.inventory = [];
                        const itemPattern = /([\w\s-]+)\s*\(([^)]+)\)/g;
                        let itemMatch;
                        while ((itemMatch = itemPattern.exec(itemString)) !== null) {
                            console.log(itemMatch);
                            if (itemMatch[1] && itemMatch[2]) {
                                const name = itemMatch[1].trim();
                                const statFirst = itemMatch[2].match(/(\w+)\s*([+-]\d+)/);
                                const statLast = itemMatch[2].match(/([+-]\d+)\s*(\w+)/);
                                console.log(`${statFirst}\n${statLast}`);
                                const bonus = statFirst ? parseInt(statFirst[2]) : (statLast ? parseInt(statLast[1]) : null);
                                const stat = statFirst ? findMostSimilarStat(statFirst[1], stage.stats) : (statLast ? findMostSimilarStat(statLast[2], stage.stats) : null);
                                if (name && stat && bonus) {
                                    console.log(`New item: ${name}, ${stat}, ${bonus}`);
                                    userState.inventory.push(new Item(name, stat.name, bonus));
                                } else {
                                    console.log('Failed to parse an item; revert');
                                    userState.inventory = previousInventory;
                                    success = false;
                                    break;
                                }
                            }
                        }
                        if (success) {
                            stage.userStates[anonymizedId] = userState;
                            someSuccess = true;
                        }
                    }
                }
            }
        }
        
        tries--;
    }
    if (!someSuccess) {
        console.log('Failed to generate any updated statblock.');
    }
}

function escapeRegex(input: string) {
    return input.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export async function determineStatAndDifficulty(stage: Stage) {
    
    const statRegex = new RegExp(`(${Object.keys(stage.stats).map(escapeRegex).join('|')})\\s*([+-]\\d+)`, 'gi');
    console.log(statRegex);
    let tries = 3;
    while (tries > 0) {
        let textResponse = await stage.generator.textGen({
            prompt: 
                `This is a roleplaying game for which you are mechanically assessing a player's current actions.\n\n` +
                buildSection('Stats', Object.values(stage.stats).map(stat => `${stat.name} - ${stat.description}`).join('\n')) +
                buildSection('Chat History', buildHistory(stage.history)) +
                buildSection('Sample Output', `${Object.values(stage.stats)[Math.floor(Math.random() * Object.keys(stage.stats).length)].name} -3: ${stage.users[stage.lastSpeaker].name}'s actions are roughly aligned with this stat but they seem very challenging and outright risky.`) +
                buildSection('Sample Output', `${Object.values(stage.stats)[Math.floor(Math.random() * Object.keys(stage.stats).length)].name} +0: This stat suits ${stage.users[stage.lastSpeaker].name}'s course of action, and the task feels straightforward.`) +
                buildSection('Sample Output', `${Object.values(stage.stats)[Math.floor(Math.random() * Object.keys(stage.stats).length)].name} +1: I have selected this stat because it best fits the situation. ${stage.users[stage.lastSpeaker].name}'s actions should also be relatively easy.`) +
                buildSection('Sample Output', `None: ${stage.users[stage.lastSpeaker].name} is simply answering a question honestly here; there is no risk or stat to associate to this course of action.`) +
                buildSection('Current Instruction', `Consider ${stage.users[stage.lastSpeaker].name}'s last input:\n"${stage.history[stage.history.length - 1]}"\n` +
                    `Use this preparatory response to evaluate whether the actions or dialog presented in this input could require a skill check governed by one of the STATS above. ` +
                    `Begin this response by outputting the most relevant STAT and a difficulty modifier between -4 and +2. ` +
                    `The difficulty modifier should be based upon the apparent challenge or risk of the task being attempted and not upon ${stage.users[stage.lastSpeaker].name}'s personal advantages or disadvantages (these will be factored in later). ` +
                    `If the input does not present any challenge, risk, or significant action, simply output "None."`
                ) +
                '### FUTURE INSTRUCTION:',
            max_tokens: 60,
            min_tokens: 50
        });
        if (textResponse && textResponse.result) {
            const match = textResponse.result.match(statRegex);
            console.log(match);
            if (match && match[1] && match[2]) {
                return match;
            } else if (textResponse.result.toLocaleLowerCase().includes("none")) {
                return null;
            }
        }
        tries--;
    }
}