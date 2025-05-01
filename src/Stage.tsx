import {ReactElement} from "react";
import {StageBase, StageResponse, InitialData, Message, Character, User} from "@chub-ai/stages-ts";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";
import {Action} from "./Action";
import {Stat, findMostSimilarStat} from "./Stat"
import {Item} from "./Item"
import {Outcome, Result, ResultDescription} from "./Outcome";
import {env, pipeline} from '@xenova/transformers';
import {Client} from "@gradio/client";
import { buildResponsePrompt, generateStatBlock, generateStats } from "./Generation";

type MessageStateType = any;

type ConfigType = any;

type InitStateType = any;

type ChatStateType = any;

/*
  nvm use 21.7.1
  yarn install (if dependencies have changed)
  yarn dev --host --mode staging
*/

export interface UserState {
    name: string;
    maxHealth: number;
    health: number;
    inventory: Item[];
    experience: number;
}

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {
    
    readonly defaultStat: number = 0;
    readonly levelThresholds: number[] = [2, 5, 8, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
    readonly defaultUserState: UserState = {
        name: '',
        maxHealth: 10,
        health: 10,
        inventory: [],
        experience: 0,
    }

    // chat-level variables
    stats: {[key: string]: Stat};
    lastInput: string;
    lastResponse: string;

    // message-level variables
    userStates: {[key: string]: UserState} = {};

    // other
    client: any;
    fallbackPipelinePromise: Promise<any> | null = null;
    fallbackPipeline: any = null;
    fallbackMode: boolean;
    users: {[key: string]: User};
    characters: {[key: string]: Character};

    constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {
        super(data);
        const {
            characters,
            users,
            messageState,
            chatState
        } = data;
        console.log(users);
        console.log(characters);
        this.users = users;
        this.characters = characters;
        this.lastInput = '';
        this.lastResponse = '';
        this.loadMessageState(messageState);

        if (chatState) {
            this.stats = chatState.stats;
            console.log('Loaded stats from chatState:');
            console.log(this.stats);
        } else {
            this.stats = {};
        }

        this.fallbackMode = false;
        this.fallbackPipeline = null;
        env.allowRemoteModels = false;
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
            chatState: {stats: this.stats},
        };
    }

    async getPipeline() {
        return pipeline("zero-shot-classification", "Xenova/mobilebert-uncased-mnli");
    }

    async setState(state: MessageStateType): Promise<void> {
        this.loadMessageState(state);
    }

    async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        const {
            anonymizedId,
            content,
            promptForId
        } = userMessage;

        let errorMessage: string|null = null;
        let takenAction: Action|null = null;
        let finalContent: string|undefined = content;
        let inputString = content;
        let userState = this.getUserState(anonymizedId);

        this.lastInput = content;

        if (Object.values(this.stats).length == 0) {
            console.log('Generate stats');
            await generateStats(this);
        }

        if (finalContent) {
            let sequence = this.replaceTags(content,
                {"user": this.users[anonymizedId].name, "char": promptForId ? this.characters[promptForId].name : ''});

            const statMapping:{[key: string]: string} = Object.values(this.stats).reduce((acc, stat) => {acc[`${stat.name}: ${stat.description}`] = stat.name; return acc;}, {} as {[key: string]: string});
            let topStat: Stat|null = null;
            const statHypothesis = `The narrator's actions or dialog involve {}.`
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
            console.log(`Stat selected: ${(statResponse.scores[0] > 0.1 ? statMapping[statResponse.labels[0]] : 'None')}`);
            if (statResponse && statResponse.labels && statResponse.scores[0] > 0.1 && statMapping[statResponse.labels[0]] != 'None') {
                topStat = this.stats[statMapping[statResponse.labels[0]]];
                console.log(`topStat: ${topStat.name}`);
            }

            if (topStat && difficultyRating < 1000) {
                takenAction = new Action(finalContent, topStat, difficultyRating, userState.inventory);
            } else {
                takenAction = new Action(finalContent, null, 0, userState.inventory);
            }
        }

        if (takenAction) {
            const outcome = takenAction.determineSuccess();
            finalContent = outcome.getDescription();

            if ([Result.Failure, Result.CriticalSuccess].includes(outcome.result)) {
                userState.experience++;
                let level = this.getLevel();
                if (userState.experience == this.levelThresholds[level]) {
                    /*const maxCount = Math.max(...Object.values(this.statUses));
                    const maxStats = Object.keys(this.statUses)
                            .filter((stat) => this.statUses[stat as Stat] === maxCount)
                            .map((stat) => stat as Stat);
                    let chosenStat = maxStats[Math.floor(Math.random() * maxStats.length)];

                    finalContent += `\n##Welcome to level ${level + 2}!##\n#_${chosenStat}_ up!#`;

                    this.statUses = this.clearStatMap();*/
                } else {
                    finalContent += `\n###You've learned from this experience...###`
                }
            }
        }

        return {
            stageDirections: `\n${this.replaceTags(buildResponsePrompt(this, inputString),{
                "user": this.users[anonymizedId].name,
                "char": promptForId ? this.characters[promptForId].name : ''
            })}\n`,
            messageState: this.buildMessageState(),
            modifiedMessage: finalContent,
            systemMessage: null,
            error: errorMessage,
            chatState: {stats: this.stats},
        };
    }

    getUserState(anonymizedId: string): UserState {
        if (!this.userStates[anonymizedId] && anonymizedId.trim() != '') {
            this.userStates[anonymizedId] = {...this.defaultUserState, name: this.users[anonymizedId].name};
        }
        return this.userStates[anonymizedId] ?? this.defaultUserState;
    }

    getLevel(): number {
        return 0; // Object.values(this.statScores).reduce((acc, val) => acc + val, 0)
    }

    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {

        let {
            content
        } = botMessage;

        this.lastResponse = content;

        // Remove initial --- from start of response (some LLMs like to do this):
        if (content.indexOf("---") == 0) {
            content = content.substring(3);
        }
        // Remove content after --- (hopefully, it's a stat block)
        if (content.indexOf("---") > 0) {
            content = content.substring(0, content.indexOf("---")).trim(); 
        }

        await generateStatBlock(this);

        return {
            stageDirections: null,
            messageState: this.buildMessageState(),
            modifiedMessage: content,
            error: null,
            systemMessage: '---\n```\n' +
                Object.values(this.users).map(user => {
                    let userState = this.getUserState(user.anonymizedId);
                    return `${user.name} - Health: ${userState.health}/${userState.maxHealth}\n` +
                        `${userState.inventory.length > 0 ? userState.inventory.map(item => item.print()).join(' ') : ' '}\n`;
                }).join('\n') +
                '```',
            chatState: {stats: this.stats}
        };
    }

    loadMessageState(messageState: MessageStateType) {
        if (messageState != null) {
            this.userStates = {...messageState.userStates};
            this.lastInput = messageState.lastInput ?? '';
            this.lastResponse = messageState.lastResponse ?? '';
        }
    }

    buildMessageState(): any {
        return {userStates: {...this.userStates},
                lastInput: this.lastInput,
                lastResponse: this.lastResponse};
        /*    lastOutcome: this.lastOutcome ?? null,
            lastOutcomePrompt: this.lastOutcomePrompt ?? '',
            lastInput: this.lastInput ?? '',
            lastResponse: this.lastResponse ?? '',
            experience: this.experience ?? 0,
            health: this.health ?? 10,
            maxHealth: this.maxHealth ?? 10,
            inventory: this.inventory ?? []
        };*/
    }

    convertOutcome(input: any): Outcome {
        return new Outcome(input['dieResult1'], input['dieResult2'], this.convertAction(input['action']));
    }

    convertAction(input: any): Action {
        return new Action(input['description'], input['stat'] as Stat, input['difficultyModifier'], input['skillModifier'])
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
