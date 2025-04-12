import { Stat } from "./Stat";

export class Item {
    name: string;
    stat: string;
    bonus: number;

    constructor(name: string, stat: string, bonus: number) {
        this.name = name;
        this.stat = stat;
        this.bonus = bonus;
    }

    print() {
        return `${this.name} (${this.stat} ${this.bonus >= 0 ? `+${this.bonus}` : this.bonus})`
    }
}