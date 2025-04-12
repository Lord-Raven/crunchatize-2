export class Stat {
    constructor(public name: string, public description: string) { }
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

export function findMostSimilarStat(target: string, stats: {[key: string]: Stat}): Stat | null {
    let mostSimilarStat: Stat | null = null;
    let minDistance = Infinity;

    for (const stat of Object.values(stats)) {
        const distance = levenshteinDistance(target.toLowerCase(), stat.name.toLowerCase());
        if (distance < minDistance) {
            minDistance = distance;
            mostSimilarStat = stat;
        }
    }
    return mostSimilarStat;
}
