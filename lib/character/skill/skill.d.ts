import { Signature, Character } from "../character";
import { List, ListItem } from "../misc/list";
import { Default } from "../misc/default";
export declare class SkillList extends List<Skill> {
    populator: typeof Skill;
    constructor(character: Character);
}
export declare abstract class SkillLike<T extends SkillLike<T>> extends ListItem<T> {
    abstract type: "skill" | "skill_container" | "spell" | "spell_container" | "technique";
    name: string;
    difficulty: Difficulty;
    points: number;
    specialization: string;
    abstract defaults: Set<SkillDefault<SkillLike<any>>>;
    abstract defaultedFrom: SkillDefault<SkillLike<any>>;
    abstract signature: Signature;
    abstract encumbrancePenaltyMultiple: number;
    hasLevels: boolean;
    constructor(list: List<T>);
    abstract getBonus(): number;
    getLevel(): number;
    getBaseRelativeLevel(): 0 | -1 | -2 | -3;
    static getBaseRelativeLevel(difficulty: Difficulty): 0 | -1 | -2 | -3;
    static calculateRelativeLevel(points: number, relativeLevel: number): number;
    calculateLevel(): number;
    static getBestDefaultWithPoints<T extends SkillLike<T>>(character: Character, skill: T, defaults: Set<SkillDefault<T>>): SkillDefault<T>;
    static getBestDefault<T extends SkillLike<T>>(character: Character, defaults: Set<SkillDefault<T>>): SkillDefault<T>;
    canSwapDefaults(skill: SkillLike<T>, defaults: Set<SkillDefault<T>>): boolean;
    hasDefaultTo(skill: SkillLike<T>, defaults: Set<SkillDefault<T>>): boolean;
    swapDefault(skill: SkillLike<T>, defaults: Set<SkillDefault<T>>): number;
}
export declare class Skill extends SkillLike<Skill> {
    version: number;
    tag: string;
    type: "skill" | "skill_container";
    signature: Signature;
    techLevel: string;
    defaults: Set<SkillDefault<SkillLike<any>>>;
    defaultedFrom: SkillDefault<SkillLike<any>>;
    encumbrancePenaltyMultiple: number;
    isTechnique: boolean;
    constructor(list: List<Skill>, isTechnique?: boolean);
    isActive(): boolean;
    childrenPoints(): number;
    getBonus(): any;
    toString(): string;
    addDefault(): SkillDefault<Skill>;
    toR20(): {
        key: string;
        row_id: string;
        data: {
            name: string;
            base: string | number;
            difficulty: string | number;
            bonus: any;
            points: number;
            wildcard_skill_points: number;
            use_wildcard_points: number;
            use_normal_points: number;
            skill_points: number;
            ref: string;
            notes: string;
        };
    };
}
export declare class SkillDefault<T extends SkillLike<any>> extends Default<T> {
    tag: string;
    level: number;
    adjustedLevel: number;
    points: number;
    constructor(skill: T);
    isSkillBased(): boolean;
    getSkillsNamedFrom(list: List<T>): {
        skills: T[];
        highest: T;
    };
    save(): any;
    load(data: any): any;
}
export declare enum Difficulty {
    easy = "E",
    average = "A",
    hard = "H",
    very_hard = "VH",
    wildcard = "W"
}