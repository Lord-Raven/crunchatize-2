import { Stage } from "./Stage";
import { findMostSimilarStat, Stat } from "./Stat";
import { Item } from "./Item";

function buildSection(name: string, body: string) {
    return `### ${name}:\n${body.trim()}\n\n`;
}

function buildStatPrompt(stage: Stage): string {
    const baseCharacter = Object.values(stage.characters)[0];
    return (
        buildSection('FLAVOR TEXT', stage.replaceTags((baseCharacter.personality + ' ' + baseCharacter.description + '\n' + baseCharacter.scenario), {user: stage.player.name, char: baseCharacter.name})) +
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
            `These stats will be applied to other characters beyond those found in the FLAVOR TEXT, so they should suit a spectrum of activities. ` +
            `This essential, preparatory response includes four to eight lines, each following this format: "Name - Brief description of what the attribute governs, potentially including example actions that fall under this domain." ` +
            `Simply define these attributes and promptly end your response.\n`) +
        '### Future Instruction:');
}

export async function generateStats(stage: Stage) {

    const statRegex = /^(?:\d+\.\s*)?\s*([\w\s]+)[-|:]\s*(.+)$/gm
    let tries = 3;
    while (Object.values(stage.stats).length < 4 && tries > 0) {
        let textResponse = await stage.generator.textGen({
            prompt: buildStatPrompt(stage),
            max_tokens: 250,
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
    let addedInventory = [...stage.inventory];
    let moddedInventory = [...stage.inventory];
    let removedInventory = [...stage.inventory];
    console.log(`length: ${stage.inventory.length}`);
    
    addedInventory.push(new Item('Newly Acquired Item', 'Some Stat', Math.floor(Math.random() * 5) - 2));
    if (moddedInventory.length > 0) {
        moddedInventory[0].bonus += 1;
        removedInventory.slice(0, 1);
    }
    
    return buildSection('Example Statblock (Gaining an Item)', buildStatBlock(stage, stage.health, addedInventory)) +
        (moddedInventory.length > 0 ? (
            buildSection('Example Statblock (Modifying an Item)', buildStatBlock(stage, stage.health, moddedInventory)) +
            buildSection('Example Statblock (Removal)', buildStatBlock(stage, stage.health, removedInventory))) : '') +
        buildSection('Example Statblock (Health Loss)', buildStatBlock(stage, stage.health - 3, [...stage.inventory, new Item('Gaping Wound', 'Some Stat', -2)])) +
        (stage.health < stage.maxHealth ? (
            buildSection('Example Statblock (Health Gain)', buildStatBlock(stage, stage.health + 1, [...stage.inventory, new Item('Cool Scar', 'Some Stat', 1)]))) : '');
    };
    
function buildStatBlock(stage: Stage, health: number, inventory: Item[]) {
    return `---\n${stage.player.name} - Health: ${health}/${stage.maxHealth}\n${inventory.length > 0 ? inventory.map(item => item.print()).join(' ') : ''}`
};

export function buildResponsePrompt(stage: Stage, instruction: string) {
    return buildSection('Current Instruction', `{{user}} has chosen the following action:\n${instruction}`);
};

export function buildResponsePromptCombined(stage: Stage, instruction: string) {
    return buildSampleStatBlocks(stage) +
            buildSection('Stats', Object.values(stage.stats).map(stat => `${stat.name} - ${stat.description}`).join('\n')) +
            buildSection('Current Instruction', `This response has two critical goals: first, narrate one or two paragraphs organically describing {{user}}'s actions and the reactions of the world around them; second, conclude the response with a formalized statblock.\n\n` +
            `${instruction}\n\nEnd the response by functionally outputting the current statblock below, making logical updates, if needed, to implicitly reflect changes to {{user}}'s status, based on events in {{user}}'s input and this response: ` +
            `updated health; newly acquired, lost, persistent, or modified equipment for {{user}}; and newly imposed, removed, continuous, or updated status effects that impact {{user}}'s stats. ` +
            `In contrast with the initial, narrative portion of the response, which is illustrative and natural, the statblock is mechanical and formatted. ` +
            `All listed equipment or status effects follow the same format, with a name, relevant stat (from the stats list), and modifier between -3 and +3, indicating a penalty (negative) or bonus (positive) toward the selected stat. ` +
            `When adding or modifying items or status effects, choose a single stat and modifier that best illustrate the impact of that item or effect, and always follow this strict format: Name (Stat +/-x).`) +
            buildSection('Current Statblock', buildStatBlock(stage, stage.health, stage.inventory));
};

function buildStatBlockPrompt(stage: Stage) {
    return  buildSampleStatBlocks(stage) +
            buildSection('Stats', Object.values(stage.stats).map(stat => `${stat.name} - ${stat.description}`).join('\n')) +
            buildSection('Input: {{user}}', stage.lastInput) +
            buildSection('Response: {{char}}', stage.lastResponse) +
            buildSection('Current Statblock', buildStatBlock(stage, stage.health, stage.inventory)) +
            buildSection('Current Instruction', `You are performing critical post-processing work for a roleplaying game. Instead of narrating, you will use this planning response to ` +
            `output the current statblock, making logical updates, if needed, to implicitly reflect changes to {{user}}'s status, based on events in {{user}}'s input and this response: ` +
            `updated health; newly acquired, lost, persistent, or modified equipment for {{user}}; and newly imposed, removed, continuous, or updated status effects that impact {{user}}'s stats. ` +
            `In contrast with the initial, narrative portion of the response, which is illustrative and natural, the statblock is mechanical and formatted. ` +
            `All listed equipment or status effects follow the same format, with a name, relevant stat (from the stats list), and modifier between -3 and +3, indicating a penalty (negative) or bonus (positive) toward the selected stat. ` +
            `When adding or modifying items or status effects, choose a single stat and modifier that best illustrate the impact of that item or effect, and always follow this strict format: Name (Stat +/-x).\n\n` +
            '### Future Instruction:');
}

export async function generateStatBlock(stage: Stage) {
    

    let tries = 3;
    let success = false;
    while (!success && tries > 0) {
        let textResponse = await stage.generator.textGen({
            prompt: buildStatBlockPrompt(stage),
            max_tokens: 200,
            min_tokens: 50
        });
        if (textResponse && textResponse.result) {
            
            const statBlockPattern = /(Health:\s*(\d+)\/(\d+))(.*)/s;
            const match = textResponse.result.match(statBlockPattern);
            
            if (match && match[1] && match[2] && match[4]) {
                success = true;
                console.log(`Found a stat block:`);
                console.log(match);
                stage.health = parseInt(match[2]);
                stage.maxHealth = parseInt(match[3]);

                // Clean up inventory:
                const itemString = match[4].replace(/<br>|\\n|`/gs, ' ');
                console.log(`Cleaned up inventory: ${itemString}`)
                const previousInventory = [...stage.inventory];
                stage.inventory = [];
                const itemPattern = /([\w\s-]+)\s*\(([^)]+)\)/g;
                let itemMatch;
                while ((itemMatch = itemPattern.exec(itemString)) !== null) {
                    console.log(itemMatch);
                    if (itemMatch[1] && itemMatch[2]) {
                        const name = itemMatch[1];
                        const statFirst = itemMatch[2].match(/(\w+)\s*([+-]\d+)/);
                        const statLast = itemMatch[2].match(/([+-]\d+)\s*(\w+)/);
                        console.log(`${statFirst}\n${statLast}`);
                        const bonus = statFirst ? parseInt(statFirst[2]) : (statLast ? parseInt(statLast[1]) : null);
                        const stat = statFirst ? findMostSimilarStat(statFirst[1], stage.stats) : (statLast ? findMostSimilarStat(statLast[2], stage.stats) : null);
                        if (name && stat && bonus) {
                            console.log(`New item: ${name}, ${stat}, ${bonus}`);
                            stage.inventory.push(new Item(name, stat.name, bonus));
                        } else {
                            console.log('Failed to parse an item; revert');
                            stage.inventory = previousInventory;
                            success = false;
                            break;
                        }
                    }
                }
            }
        }
        
        tries--;
    }
    if (!success) {
        console.log('Failed to generate an updated statblock.');
    }

}
