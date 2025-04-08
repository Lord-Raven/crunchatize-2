import { Stat } from "./Stat";

export class Item {
    name: string;
    stat: Stat;
    bonus: number;

    constructor(name: string, stat: Stat, bonus: number) {
        this.name = name;
        this.stat = stat;
        this.bonus = bonus;
    }

    print() {
        return `${this.name} (${this.bonus >= 0 ? `+${this.bonus}` : this.bonus} ${this.stat})`
    }
}