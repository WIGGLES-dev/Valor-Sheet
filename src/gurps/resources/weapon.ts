import {
    SkillDefault,
    Skill,
    Character,
    Resource,
    Data,
} from "@internal";
import { combineLatest, Observable } from "rxjs";
import { map, takeWhile } from "rxjs/operators";
import { GResource } from "src/sheet/resource";
import { staticImplements } from "src/utils/decorators";

export enum BaseDamage {
    Swing = "sw",
    Thrust = "thr"
}
export enum DamageType {
    Impaling = "imp",
    Crushing = "cr",
    Cutting = "cut",
    Fatigue = "fat",
    Toxic = "tox"
}
export type Weapons = RangedWeaponData | MeleeWeaponData
export interface WeaponKeys {
    usage?: string
    damage?: string
    damageType?: DamageType
    info?: string[]
    strengthRequirement?: string
    attackBonus?: number
    defaults: SkillDefault[]
}
export interface MeleeWeaponData extends WeaponKeys, Data {
    version: 1
    type: "melee weapon"
    parryBonus: number
    blockBonus: number
    reach: string,
}
export interface RangedWeaponData extends WeaponKeys, Data {
    version: 1
    type: "ranged weapon"
    accuracy: string
    range: string
    rateOfFire: string
    shots: string
    recoil: number
    bulk: string
}

export abstract class Weapon<K extends WeaponKeys & Data = WeaponKeys & Data> extends Resource<K> {
    constructor(identity: Weapon<K>["identity"]) {
        super(identity);
    }
    selectHighestDefault$ = Skill.prototype.selectHighestDefault$
    get bestAttackLevel$(): Observable<number> {
        return this.selectHighestDefault$()
    }
}

@staticImplements<GResource<MeleeWeapon>>()
export class MeleeWeapon extends Weapon<MeleeWeaponData> {
    static version = 1 as const
    static type = "melee weapon" as const
    constructor(identity: MeleeWeapon["identity"]) {
        super(identity);

    }
    get parryLevel$() {
        return combineLatest([
            this.bestAttackLevel$,
            this.selectKeys()
        ]).pipe(
            map(([level, keys]) => level / 2 + 3 + (keys.parryBonus || null))
        )
    }
    get blockLevel$() {
        return combineLatest([
            this.bestAttackLevel$,
            this.selectKeys()
        ]).pipe(
            map(([level, keys]) => level / 2 + 3 + (keys.blockBonus || null))
        )
    }
}

@staticImplements<GResource<RangedWeapon>>()
export class RangedWeapon extends Weapon<RangedWeaponData> {
    static version = 1 as const
    static type = "ranged weapon" as const
    constructor(identity: RangedWeapon["identity"]) {
        super(identity);
    }
}