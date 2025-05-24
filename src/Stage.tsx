import {ReactElement} from "react";
import {StageBase, StageResponse, InitialData, Message, Character, User} from "@chub-ai/stages-ts";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";
import {Action} from "./Action";
import {Stat} from "./Stat"
import {Item} from "./Item"
import {Outcome, Result} from "./Outcome";
import { buildResponsePrompt, determineStatAndDifficulty, generateMeters, generateStatBlock, generateStats } from "./Generation";
import { Meter } from "./Meter";

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
    maxHealth: number;
    health: number;
    inventory: Item[];
    experience: number;
    statUses: {[key: string]: number};
    statScores: {[key: string]: number};
}

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {
    
    readonly defaultStat: number = 0;
    readonly levelThresholds: number[] = [2, 5, 8, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
    readonly defaultUserState: UserState = {
        maxHealth: 10,
        health: 10,
        inventory: [],
        experience: 0,
        statUses: {},
        statScores: {}
    }

    // chat-level variables
    stats: {[key: string]: Stat};
    meters: {[key: string]: Meter};

    // message-level variables
    userStates: {[key: string]: UserState} = {};
    history: string[];
    lastSpeaker: string;

    // other
    client: any;
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
        this.history = [];
        this.lastSpeaker = '';
        this.loadMessageState(messageState);

        if (chatState) {
            this.stats = chatState.stats;
            this.meters = chatState.meters;
            console.log('Loaded from chatState:');
            console.log(this.stats);
            console.log(this.meters);
        } else {
            this.stats = {};
            this.meters = {};
        }
    }

    async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {

        console.log('Finished loading Crunchatize 2.');

        return {
            success: true,
            error: null,
            initState: null,
            chatState: {stats: this.stats, meters: this.meters},
        };
    }

    async setState(state: MessageStateType): Promise<void> {
        console.log('setState() with:');
        console.log(state);
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
        let userState = this.getUserState(anonymizedId);

        this.history.push(`### Input ${this.users[anonymizedId].name}: ${content}`);
        if (this.history.length > 10) {
            this.history.slice(this.history.length - 10);
        }
        this.lastSpeaker = anonymizedId;

        if (Object.values(this.stats).length == 0) {
            console.log('Generate stats');
            await generateStats(this);
        }

//        if (Object.values(this.meters).length == 0) {
            console.log('Generate meters');
            await generateMeters(this);
//        }

        if (finalContent) {
            const match = await determineStatAndDifficulty(this);
            if (match) {
                takenAction = new Action(finalContent, Object.values(this.stats).find(stat => stat.name.trim().toLowerCase() == match[1].trim().toLowerCase()) ?? null, Number.parseInt(match[2].trim()), userState);
            } else {
                takenAction = new Action(finalContent, null, 0, userState);
            }
        }

        const outcome: Outcome = takenAction ? takenAction.determineSuccess() : new Outcome(0, 0, new Action(finalContent, null, 0, userState));
        finalContent = outcome.getDescription();

        if (takenAction && takenAction.stat != null) {
            userState.statUses[takenAction.stat.name] = (userState.statUses[takenAction.stat.name] ?? 0) + 1;
        }

        if ([Result.Failure, Result.CriticalSuccess].includes(outcome.result)) {
            userState.experience++;
            let level = this.getLevel(userState);
            if (userState.experience == this.levelThresholds[level]) {
                const maxCount = Math.max(...Object.values(userState.statUses));
                const maxStats = Object.keys(userState.statUses)
                        .filter((stat) => userState.statUses[stat] === maxCount)
                        .map((stat) => stat);
                let chosenStat = maxStats[Math.floor(Math.random() * maxStats.length)];

                finalContent += `\n##Welcome to level ${level + 2}!##\n#_${chosenStat}_ up!#`;

                userState.statUses = {};
            } else {
                finalContent += `\n###${this.users[anonymizedId].name} has learned from this experience.###`
            }
        }

        return {
            stageDirections: `\n${this.replaceTags(buildResponsePrompt(this, anonymizedId, outcome),{
                "user": this.users[anonymizedId].name,
                "char": promptForId ? this.characters[promptForId].name : ''
            })}\n`,
            messageState: this.buildMessageState(),
            modifiedMessage: finalContent,
            systemMessage: null,
            error: errorMessage,
            chatState: {stats: this.stats, meters: this.meters},
        };
    }

    getUserState(anonymizedId: string): UserState {
        if (!this.userStates[anonymizedId] && anonymizedId.trim() != '') {
            this.userStates[anonymizedId] = {...this.defaultUserState};
        }
        return this.userStates[anonymizedId] ?? this.defaultUserState;
    }

    getLevel(userState: UserState): number {
        return Object.values(userState.statScores).reduce((acc, val) => acc + val, 0)
    }

    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {

        let {
            anonymizedId,
            content
        } = botMessage;

        this.messenger.updateEnvironment({input_enabled: false});
        this.history.push(`### Response ${this.characters[anonymizedId].name}: ${content}`);
        console.log(this.history);
        if (this.history.length > 10) {
            this.history.slice(this.history.length - 10);
        }

        // Remove initial --- from start of response (some LLMs like to do this):
        if (content.indexOf("---") == 0) {
            content = content.substring(3);
        }
        // Remove content after --- (hopefully, it's a stat block)
        if (content.indexOf("---") > 0) {
            content = content.substring(0, content.indexOf("---")).trim(); 
        }

        await generateStatBlock(this);

        this.messenger.updateEnvironment({input_enabled: true});

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
            chatState: {stats: this.stats, meters: this.meters}
        };
    }

    loadMessageState(messageState: MessageStateType) {
        if (messageState != null) {
            console.log('loadMessageState');
            this.userStates = {...messageState.userStates};
            this.history = messageState.history ?? [];
            this.lastSpeaker = messageState.lastSpeaker ?? '';
        }
    }

    buildMessageState(): any {
        return {userStates: {...this.userStates},
                history: this.history,
                lastSpeaker: this.lastSpeaker};
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

    render(): ReactElement {
        return <></>;
    }

}
