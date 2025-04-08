import {ReactElement} from "react";
import {StageBase, StageResponse, InitialData, Message, Character, User} from "@chub-ai/stages-ts";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";
import {Action} from "./Action";
import {Stat, findMostSimilarStat} from "./Stat"
import {Item} from "./Item"
import {Outcome, Result, ResultDescription} from "./Outcome";
import {env, pipeline} from '@xenova/transformers';
import {Client} from "@gradio/client";

type MessageStateType = any;

type ConfigType = any;

type InitStateType = any;

type ChatStateType = any;

/*
  nvm use 21.7.1
  yarn install (if dependencies have changed)
  yarn dev --host --mode staging
*/

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {
    
    readonly defaultStat: number = 0;
    readonly levelThresholds: number[] = [2, 5, 8, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

    // message-level variables
    maxHealth: number = 10;
    health: number = 10;
    inventory: Item[] = [];
    experience: number = 0;
    statUses: {[stat in Stat]: number} = this.clearStatMap();
    stats: {[stat in Stat]: number} = this.clearStatMap();
    lastOutcome: Outcome|null = null;
    lastOutcomePrompt: string = '';
    buildResponsePrompt: (instruction: string) => string = (instruction: string) => {return `${this.buildSampleStatBlocks()}\n\n` +
        `### Stats: Might, Grace, Skill, Brains, Wits, Charm, Heart, Luck\n\n` +
        `### Current Instruction:\nThis response has two critical goals: first, narrate no more than one or two paragraphs describing {{user}}'s actions and the reactions of the world around them; second, end the response by outputting a formatted statblock.\n\n` +
        `${instruction}\n\nEnd the response by including the current statblock below, making logical updates as-needed to convey changes to {{user}}'s status based on events in the input and response: ` +
        `updated health; new, removed, or modified equipment; and new, removed, or modified status effects. ` +
        `All listed equipment or statuse effects have a designated stat and a modifier between -3 and +3, indicating a penalty or bonus toward the selected stat. Follow this strict format: Name (+/-x Stat).\n\n` +
        `### Current Statblock:\n${this.buildStatBlock(this.health, this.inventory)}\n`;
    };

    buildSampleStatBlocks: () => string = () => {
        let addedInventory = [...this.inventory];
        let moddedInventory = [...this.inventory];
        let removedInventory = [...this.inventory];
        console.log(`length: ${this.inventory.length}`);

        addedInventory.push(new Item('Newly Acquired Item', Object.values(Stat)[Math.floor(Math.random() * Object.values(Stat).length)], Math.floor(Math.random() * 5) - 2));
        if (moddedInventory.length > 0) {
            moddedInventory[0].bonus += 1;
            removedInventory.slice(0, 1);
        }

        return `### Example Statblock (Addition):\n${this.buildStatBlock(this.health, addedInventory)}` +
            (moddedInventory.length > 0 ? (`\n\n### Example Statblock (Modification):\n${this.buildStatBlock(this.health, moddedInventory)}\n\n### Example Statblock (Removal):\n${this.buildStatBlock(this.health, removedInventory)}`) : '') +
            `\n\n### Example Statblock (Health Loss):\n${this.buildStatBlock(this.health - 3, [...this.inventory, new Item('Gaping Wound', Stat.Heart, -2)])}` +
            (this.health < this.maxHealth ? (`\n\n### Example Statblock (Health Gain):\n${this.buildStatBlock(this.health + 1, [...this.inventory, new Item('Cool Scar', Stat.Charm, 1)])}`) : '');
    };

    buildStatBlock: (health: number, inventory: Item[]) => string = (health, inventory) => {
        return `---\nHealth: ${health}/${this.maxHealth}\n${inventory.length > 0 ? inventory.map(item => item.print()).join(' ') : ''}`
    };
            

    // other
    client: any;
    fallbackPipelinePromise: Promise<any> | null = null;
    fallbackPipeline: any = null;
    fallbackMode: boolean;
    player: User;
    characters: {[key: string]: Character};

    constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {
        super(data);
        const {
            characters,
            users,
            messageState,
        } = data;
        this.setStateFromMessageState(messageState);
        this.player = users[Object.keys(users)[0]];
        this.characters = characters;

        this.fallbackMode = false;
        this.fallbackPipeline = null;
        env.allowRemoteModels = false;
    }

    clearStatMap() {
        return {
            [Stat.Might]: 0,
            [Stat.Grace]: 0,
            [Stat.Skill]: 0,
            [Stat.Brains]: 0,
            [Stat.Wits]: 0,
            [Stat.Charm]: 0,
            [Stat.Heart]: 0,
            [Stat.Luck]: 0
        };
    }

    async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {

        try {
            this.fallbackPipelinePromise = this.getPipeline();
        } catch (exception: any) {
            console.error(`Error loading pipeline: ${exception}`);
        }

        try {
            this.client = await Client.connect("Ravenok/statosphere-backend", {hf_token: import.meta.env.VITE_HF_API_KEY});
        } catch (error) {
            console.error(`Error connecting to backend pipeline; will resort to local inference.`);
            this.fallbackMode = true;
        }

        console.log('Finished loading stage.');

        return {
            success: true,
            error: null,
            initState: null,
            chatState: null,
        };
    }

    async getPipeline() {
        return pipeline("zero-shot-classification", "Xenova/mobilebert-uncased-mnli");
    }

    async setState(state: MessageStateType): Promise<void> {
        this.setStateFromMessageState(state);
    }

    async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        const {
            content,
            promptForId
        } = userMessage;

        let errorMessage: string|null = null;
        let takenAction: Action|null = null;
        let finalContent: string|undefined = content;

        if (finalContent) {
            let sequence = this.replaceTags(content,
                {"user": this.player.name, "char": promptForId ? this.characters[promptForId].name : ''});

            const statMapping:{[key: string]: string} = {
                'hit, wrestle': 'Might',
                'lift, throw, climb': 'Might',
                'endure, intimidate': 'Might',
                'jump, dodge, balance, dance, fall, land, sneak': 'Grace',
                'aim, shoot': 'Skill',
                'craft, lock-pick, pickpocket, repair': 'Skill',
                'recall, memorize, solve, strategize, debate': 'Brains',
                'adapt, quip, spot, trick, hide': 'Wits',
                'persuade, lie, entice, perform': 'Charm',
                'resist, recover, empathize, comfort': 'Heart',
                'gamble, hope, discover, guess': 'Luck',
                'chat, rest, wait, idle': 'None'};
            let topStat: Stat|null = null;
            const statHypothesis = 'The narrator is attempting to do one of the following: {}, or something similar.'
            const statPromise = this.query({sequence: sequence, candidate_labels: Object.keys(statMapping), hypothesis_template: statHypothesis, multi_label: true });

            const difficultyMapping:{[key: string]: number} = {
                '1 (simple and safe)': 1000,
                '2 (straightforward or fiddly)': 1,
                '3 (complex or tricky)': 0,
                '4 (challenging and risky)': -1,
                '5 (arduous and dangerous)': -2,
                '6 (virtually impossible)': -3};
            let difficultyRating:number = 0;
            const difficultyHypothesis = 'On a scale of 1-6, the difficulty of the narrator\'s actions is {}.';
            let difficultyResponse = await this.query({sequence: sequence, candidate_labels: Object.keys(difficultyMapping), hypothesis_template: difficultyHypothesis, multi_label: true });
            console.log(`Difficulty modifier selected: ${difficultyMapping[difficultyResponse.labels[0]]}`);
            if (difficultyResponse && difficultyResponse.labels[0]) {
                difficultyRating = difficultyMapping[difficultyResponse.labels[0]];
            }

            let statResponse = await statPromise;
            console.log(`Stat selected: ${(statResponse.scores[0] > 0.3 ? statMapping[statResponse.labels[0]] : 'None')}`);
            if (statResponse && statResponse.labels && statResponse.scores[0] > 0.3 && statMapping[statResponse.labels[0]] != 'None') {
                topStat = Stat[statMapping[statResponse.labels[0]] as keyof typeof Stat];
            }

            if (topStat && difficultyRating < 1000) {
                takenAction = new Action(finalContent, topStat, difficultyRating, this.stats[topStat]);
            } else {
                takenAction = new Action(finalContent, null, 0, 0);
            }
        }

        if (takenAction) {
            this.setLastOutcome(takenAction.determineSuccess());
            finalContent = this.lastOutcome?.getDescription();

            if (takenAction.stat) {
                this.statUses[takenAction.stat]++;
            }

            if (this.lastOutcome && [Result.Failure, Result.CriticalSuccess].includes(this.lastOutcome.result)) {
                this.experience++;
                let level = this.getLevel();
                if (this.experience == this.levelThresholds[level]) {
                    const maxCount = Math.max(...Object.values(this.statUses));
                    const maxStats = Object.keys(this.statUses)
                            .filter((stat) => this.statUses[stat as Stat] === maxCount)
                            .map((stat) => stat as Stat);
                    let chosenStat = maxStats[Math.floor(Math.random() * maxStats.length)];
                    this.stats[chosenStat]++;

                    finalContent += `\n##Welcome to level ${level + 2}!##\n#_${chosenStat}_ up!#`;

                    this.statUses = this.clearStatMap();
                } else {
                    finalContent += `\n###You've learned from this experience...###`
                }
            }
        }

        return {
            stageDirections: `\n${this.replaceTags(this.buildResponsePrompt(this.lastOutcomePrompt),{
                "user": this.player.name,
                "char": promptForId ? this.characters[promptForId].name : ''
            })}\n`,
            messageState: this.buildMessageState(),
            modifiedMessage: finalContent,
            systemMessage: null,
            error: errorMessage,
            chatState: null,
        };
    }

    getLevel(): number {
        return Object.values(this.stats).reduce((acc, val) => acc + val, 0)
    }

    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {

        let {
            content
        } = botMessage;

        let statBlock = '';
        

        const statBlockPattern = /(Health:\s*(\d+)\/(\d+))(.*)/s;
        const match = content.match(statBlockPattern);
        
        if (match) {
            console.log(`Found a stat block: ${match}`);
            if (match[1] && match[2]) {
                console.log(`Found some health: ${match[1]}/${match[2]}`);
                this.health = parseInt(match[2]);
                this.maxHealth = parseInt(match[3]);
            }
            if (match[4]) {
                console.log(`Found some inventory: ${match[4]}`);
                // Clean it up:
                const itemString = match[4].replace(/<br>|\\n|`/gs, ' ');
                console.log(`Cleaned up inventory: ${itemString}`)
                const previousInventory = [...this.inventory];
                this.inventory = [];
                const itemPattern = /([\w\s-]+)\s*\(([+-]\d+)\s*(\w+)\)/gs;
                let itemMatch;
                while ((itemMatch = itemPattern.exec(itemString)) !== null) {
                    const name = itemMatch[1];
                    const bonus = parseInt(itemMatch[2], 10);
                    const stat = findMostSimilarStat(itemMatch[3]);
                    if (name && stat && bonus) {
                        console.log(`New item: ${name}, ${stat}, ${bonus}`);
                        this.inventory.push(new Item(name, stat, bonus));
                    } else {
                        console.log('Failed to parse an item; revert');
                        this.inventory = previousInventory;
                        break;
                    }
                }
            }
        }
        // Remove content after --- (hopefully, it's a stat block)
        if (content.indexOf("---") > 0) {
            content = content.substring(0, content.indexOf("---")).trim(); 
        }   

        this.lastOutcomePrompt = '';

        return {
            stageDirections: null,
            messageState: this.buildMessageState(),
            modifiedMessage: content,
            error: null,
            systemMessage: `---\n` +
                //`\`{{user}} - Level ${this.getLevel() + 1} (${this.experience}/${this.levelThresholds[this.getLevel()]})\`<br>` +
                //`\`${Object.keys(Stat).map(key => `${key}: ${this.stats[key as Stat]}`).join(' | ')}\`<br>` +
                `\`Health: ${this.health}/${this.maxHealth}\`<br>` +
                `\`${this.inventory.length > 0 ? this.inventory.map(item => item.print()).join(' ') : ` `}\``,
            chatState: null
        };
    }

    setStateFromMessageState(messageState: MessageStateType) {
        this.stats = this.clearStatMap();
        if (messageState != null) {
            for (let stat in Stat) {
                this.stats[stat as Stat] = messageState[stat] ?? this.defaultStat;
                this.statUses[stat as Stat] = messageState[`use_${stat}`] ?? 0;
            }
            this.lastOutcome = messageState['lastOutcome'] ? this.convertOutcome(messageState['lastOutcome']) : null;
            this.lastOutcomePrompt = messageState['lastOutcomePrompt'] ?? '';
            this.experience = messageState['experience'] ?? 0;
            this.health = messageState['health'] ?? 10;
            this.maxHealth = messageState['maxHealth'] ?? 10;
            this.inventory = [];
            for (let item of messageState['inventory'] ?? []) {
                this.inventory.push(new Item(item.name, item.stat, item.bonus));
            }
        }
    }

    convertOutcome(input: any): Outcome {
        return new Outcome(input['dieResult1'], input['dieResult2'], this.convertAction(input['action']));
    }

    convertAction(input: any): Action {
        return new Action(input['description'], input['stat'] as Stat, input['difficultyModifier'], input['skillModifier'])
    }

    buildMessageState(): any {
        let messageState: {[key: string]: any} = {};
        for (let stat in Stat) {
            messageState[stat] = this.stats[stat as Stat] ?? this.defaultStat;
            messageState[`use_${stat}`] = this.statUses[stat as Stat] ?? 0;
        }
        messageState['lastOutcome'] = this.lastOutcome ?? null;
        messageState['lastOutcomePrompt'] = this.lastOutcomePrompt ?? '';
        messageState['experience'] = this.experience ?? 0;
        messageState['health'] = this.health ?? 10;
        messageState['maxHealth'] = this.maxHealth ?? 10;
        messageState['inventory'] = this.inventory ?? [];

        return messageState;
    }

    setLastOutcome(outcome: Outcome|null) {
        this.lastOutcome = outcome;
        this.lastOutcomePrompt = '';
        if (this.lastOutcome) {
            this.lastOutcomePrompt += `For the narrative portion of the response, {{user}} has chosen the following action: ${this.lastOutcome.action.description}\n`;
            this.lastOutcomePrompt += `${ResultDescription[this.lastOutcome.result]}\n`
        }
    }

    replaceTags(source: string, replacements: {[name: string]: string}) {
        return source.replace(/{{([A-z]*)}}/g, (match) => {
            return replacements[match.substring(2, match.length - 2)];
        });
    }

    async query(data: any) {
        let result: any = null;
        if (this.client && !this.fallbackMode) {
            try {
                const response = await this.client.predict("/predict", {data_string: JSON.stringify(data)});
                result = JSON.parse(`${response.data[0]}`);
            } catch(e) {
                console.log(e);
            }
        }
        if (!result) {
            if (!this.fallbackMode) {
                console.log('Falling back to local zero-shot pipeline.');
                this.fallbackMode = true;
                Client.connect("Ravenok/statosphere-backend", {hf_token: import.meta.env.VITE_HF_API_KEY}).then(client => {this.fallbackMode = false; this.client = client}).catch(err => console.log(err));
            }
            if (this.fallbackPipeline == null) {
                this.fallbackPipeline = this.fallbackPipelinePromise ? await this.fallbackPipelinePromise : await this.getPipeline();
            }
            result = await this.fallbackPipeline(data.sequence, data.candidate_labels, { hypothesis_template: data.hypothesis_template, multi_label: data.multi_label });
        }
        console.log({sequence: data.sequence, hypothesisTemplate: data.hypothesis_template, labels: result.labels, scores: result.scores});
        return result;
    }

    render(): ReactElement {
        return <></>;
    }

}
