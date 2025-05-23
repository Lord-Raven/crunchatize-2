import {Action} from "./Action";

export enum Result {
    Failure = 'Failure',
    MixedSuccess = 'Mixed Success',
    CompleteSuccess = 'Complete Success',
    CriticalSuccess = 'Critical Success',
    None = 'No Roll Needed'
}

export const ResultDescription: {[result in Result]: string} = {
    [Result.Failure]: `{{user}} will fail to achieve their goal and will actively sour or worsen their situation. Describe {{user}}'s actions and outcomes in your own words as you continue to propel the narrative.`,
    [Result.MixedSuccess]: `{{user}} may achieve their goal, but in an inferior way or at some cost. Describe {{user}}'s actions and outcomes in your own words as you continue to propel the narrative.`,
    [Result.CompleteSuccess]: `{{user}} will successfully achieve what they were attempting and improve their situation. Describe {{user}}'s actions and outcomes in your own words as you continue to propel the narrative.`,
    [Result.CriticalSuccess]: `{{user}} will resoundingly achieve what they were attempting, dramatically improving their situation in incredible fashion or with better-than-dreamed-of results. Describe {{user}}'s actions and outcomes in your own words as you continue to propel the narrative.`,
    [Result.None]: `This is a risk-free action. Describe {{user}}'s actions and dialog in your own words as you continue to propel the narrative.`
}

export const ResultSpan: {[result in Result]: (input: string) => string} = {
    [Result.Failure]: (input: string) => `<span style='color: red;'>${input}</span>`,
    [Result.MixedSuccess]: (input: string) => `<span style='color: darkorange;'>${input}</span>`,
    [Result.CompleteSuccess]: (input: string) => `<span style='color: mediumseagreen;'>${input}</span>`,
    [Result.CriticalSuccess]: (input: string) => `<span style='color: #b9f2ff;''>${input}</span>`,
    [Result.None]: (input: string) => input,
}

const emojiDice: {[key: number]: string} = {
    1: ResultSpan[Result.Failure]('\u2680 1'),
    2: ResultSpan[Result.MixedSuccess]('\u2681 2'),
    3: ResultSpan[Result.MixedSuccess]('\u2682 3'),
    4: ResultSpan[Result.CompleteSuccess]('\u2683 4'),
    5: ResultSpan[Result.CompleteSuccess]('\u2684 5'),
    6: ResultSpan[Result.CriticalSuccess]('\u2685 6')
}

export class Outcome {
    result: Result;
    dieResult1: number;
    dieResult2: number;
    action: Action;
    total: number;

    constructor(dieResult1: number, dieResult2: number, action: Action) {
        const total = dieResult1 + dieResult2 + action.difficultyModifier + Object.values(action.skillModifiers).reduce((acc, curr) => acc + curr, 0);
        this.result = (!action.stat ? Result.None : (dieResult1 + dieResult2 == 12 ? Result.CriticalSuccess : (total >= 10 ? Result.CompleteSuccess : (total >= 7 ? Result.MixedSuccess : Result.Failure))));

        this.dieResult1 = dieResult1;
        this.dieResult2 = dieResult2;
        this.action = action;
        this.total = total;
    }

    getDieEmoji(side: number): string {
        return emojiDice[side];
    }

    getDifficultyColor(modifier: number): string {
        const modString = `${Math.abs(modifier)}`;
        switch(modifier) {
            case 1:
                return `${modifier >= 0 ? ' + ' : ' - '}${ResultSpan[Result.CriticalSuccess](modString)}`;
            case 0:
                return `${modifier >= 0 ? ' + ' : ' - '}${ResultSpan[Result.CompleteSuccess](modString)}`;
            case -1:
                return `${modifier >= 0 ? ' + ' : ' - '}${ResultSpan[Result.MixedSuccess](modString)}`;
            default:
                return `${modifier >= 0 ? ' + ' : ' - '}${ResultSpan[Result.Failure](modString)}`;
        }
    }

    getDescription(): string {
        const newlineRegex = /\n/m;

        if (this.action.stat) {
            let returnValue = `###${`(${this.action.stat.name}) ${this.action.description}`.replace(newlineRegex, '###\n###')}###\n` +
                `#${this.getDieEmoji(this.dieResult1)} + ${this.getDieEmoji(this.dieResult2)}${this.getDifficultyColor(this.action.difficultyModifier)}<sup><sub><sup>(difficulty)</sup></sub></sup>` +
                Object.keys(this.action.skillModifiers).map(key => this.action.skillModifiers[key] > 0 ? 
                    ` + ${ResultSpan[Result.CompleteSuccess](`${this.action.skillModifiers[key]}`)}<sup><sub><sup>(${key})</sup></sub></sup>` : 
                    (this.action.skillModifiers[key] < 0 ? ` - ${ResultSpan[Result.Failure](`${Math.abs(this.action.skillModifiers[key])}`)}<sup><sub><sup>(${key})</sup></sub></sup>` : '')).join('') +
                ` = ${ResultSpan[this.result](`${this.total} (${this.result})`)}#`
            console.log(`${returnValue}`);
            return returnValue;
        } else {
            return `###(No Check) ${this.action.description}###`;
        }
    }
}