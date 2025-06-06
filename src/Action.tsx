import { Item } from "./Item";
import {Outcome} from "./Outcome";
import { UserState } from "./Stage";
import {Stat} from "./Stat";

export class Action {
    description: string;
    stat: Stat|null;
    difficultyModifier: number;
    skillModifiers: {[key: string]: number};

    constructor(description: string, stat: Stat|null, difficultyModifier: number, userState: UserState) {
        this.description = description;
        this.stat = stat;
        this.difficultyModifier = difficultyModifier;
        this.skillModifiers = userState.inventory ? userState.inventory.filter(item => stat && item.stat == stat.name).reduce<{[key: string]: number}>((acc, item) => {acc[item.name] = item.bonus; return acc;}, {}) : {};
        if (stat && userState.statScores[stat.name] && userState.statScores[stat.name] > 0) {
            this.skillModifiers["Skill"] = userState.statScores[stat.name];
        }
    }

    // Method to simulate a dice roll
    diceRoll(): number {
        return Math.floor(Math.random() * 6) + 1;
    }

    // Method to determine success, partial success, or failure
    determineSuccess(): Outcome {
        const dieResult1: number = this.diceRoll();
        const dieResult2: number = this.diceRoll();
        return new Outcome(dieResult1, dieResult2, this);
    }
}