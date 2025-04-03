export enum Stat {
    Might = 'Might',
    Grace = 'Grace',
    Skill = 'Skill',
    Brains = 'Brains',
    Wits = 'Wits',
    Charm = 'Charm',
    Heart = 'Heart',
    Luck = 'Luck'
}

function levenshteinDistance(a: string, b: string): number {
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

    for (let i = 0; i <= a.length; i++) {
        for (let j = 0; j <= b.length; j++) {
            if (i === 0) {
                matrix[i][j] = j;
            } else if (j === 0) {
                matrix[i][j] = i;
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
                );
            }
        }
    }

    return matrix[a.length][b.length];
}

export function findMostSimilarStat(stat: string): Stat | null {
    let mostSimilarStat: Stat | null = null;
    let minDistance = Infinity;

    for (const enumValue of Object.values(Stat)) {
        const distance = levenshteinDistance(stat, enumValue);
        if (distance < minDistance) {
            minDistance = distance;
            mostSimilarStat = enumValue as Stat;
        }
    }
    return mostSimilarStat;
}

export const StatDescription: {[stat in Stat]: string} = {
    [Stat.Might]: 'Physical power and endurance. Smash, lift, weather, intimidate.',
    [Stat.Grace]: 'Agility and composure. Dodge, balance, dance, land.',
    [Stat.Skill]: 'Sleight and craftmanship. Picklock, craft, shoot, fix, pickpocket.',
    [Stat.Brains]: 'Knowledge and judgment. Solve, deduce, recall, plan.',
    [Stat.Wits]: 'Instinct and awareness. React, notice, quip, trick.',
    [Stat.Charm]: 'Allure and Influence. Persuade, inspire, deceive, entertain, impress.',
    [Stat.Heart]: 'Determination and empathy. Resist, recover, connect, encourage, comfort.',
    [Stat.Luck]: 'Spirit and fortune. Gamble, discover, coincide, hope.'
}