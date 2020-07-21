import { List, ListItem } from "./misc/list";
import { Attribute } from "./attribute";
import { SkillList } from "./skill";
import { TraitList } from "./trait";
import { Equipment, EquipmentList } from "./equipment";
import { FeatureList } from "./misc/feature";
import { Profile } from "./profile";
import { SpellList } from "./spell";
import { exportR20 } from "@utils/2R20";
import { json, objectify } from "@utils/json_utils";
import { Weapon } from "./weapon";
import { FeatureType } from "@gcs/gcs";
import { Serializer } from "./serialization/serializer";
import { GCSJSON } from "./serialization/gcs_json";

abstract class Sheet {
    serializer: Serializer

    constructor(serializer: Serializer) {
        this.serializer = serializer;
    }

    abstract load(sheet: Sheet, data: any): Sheet
}

export interface Featurable extends ListItem<any> {
    hasLevels: boolean
    getLevel: () => number
}

export class Character extends Sheet {
    gCalcID: string

    ST: Attribute
    DX: Attribute
    IQ: Attribute
    HT: Attribute
    Will: Attribute
    Speed: Attribute
    Move: Attribute
    Per: Attribute
    HP: Attribute
    FP: Attribute

    missingHP: number
    missingFP: number

    profile: Profile
    skillList: SkillList
    equipmentList: EquipmentList
    otherEquipmentList: EquipmentList
    traitList: TraitList
    spellList: SpellList

    featureList: FeatureList

    constructor(serializer: Serializer = new GCSJSON()) {
        super(serializer);
        this.profile = new Profile();
        this.equipmentList = new EquipmentList(this);
        this.otherEquipmentList = new EquipmentList(this);
        this.skillList = new SkillList(this);
        this.traitList = new TraitList(this);
        this.spellList = new SpellList(this);
        this.ST = new Attribute(
            Signature.ST,
            this,
            10,
            { defaultLevel: 10 }
        );
        this.DX = new Attribute(
            Signature.DX,
            this,
            20,
            { defaultLevel: 10 }
        );
        this.IQ = new Attribute(
            Signature.IQ,
            this,
            20,
            { defaultLevel: 10 }
        );
        this.HT = new Attribute(
            Signature.HT,
            this,
            10,
            { defaultLevel: 10 }
        );
        this.Will = new Attribute(
            Signature.Will,
            this,
            5,
            { basedOn: () => this.IQ.calculateLevel() }
        );
        this.Speed = new Attribute(
            Signature.Speed,
            this,
            20,
            { basedOn: () => (this.DX.calculateLevel() + this.HT.calculateLevel()) / 4 }
        );
        this.Move = new Attribute(
            Signature.Move,
            this,
            5,
            { basedOn: () => Math.floor(this.Speed.calculateLevel()) }
        );
        this.Per = new Attribute(
            Signature.Per,
            this,
            5,
            { basedOn: () => this.IQ.calculateLevel() }
        );
        this.HP = new Attribute(
            Signature.HP,
            this,
            2,
            { basedOn: () => this.ST.calculateLevel() }
        );
        this.FP = new Attribute(
            Signature.FP,
            this,
            3,
            { basedOn: () => this.HT.calculateLevel() }
        );
        this.featureList = new FeatureList();
    }

    totalAttributesCost() {
        return Object.values(this).reduce((prev, cur) => {
            if (cur instanceof Attribute) {
                return prev + cur.pointsSpent()
            } else {
                return prev
            }
        }, 0)
    }

    attributes(attribute: Signature) {
        switch (attribute) {
            case Signature.HP: return this.HP.calculateLevel()
            case Signature.FP: return this.FP.calculateLevel()
            case Signature.ST: return this.ST.calculateLevel()
            case Signature.DX: return this.DX.calculateLevel()
            case Signature.IQ: return this.IQ.calculateLevel()
            case Signature.HT: return this.HT.calculateLevel()
            case Signature.Per: return this.Per.calculateLevel()
            case Signature.Will: return this.Will.calculateLevel()
            case Signature.Base: return 10
            case Signature.Speed: return this.Speed.calculateLevel()
            case Signature.Move: return this.Move.calculateLevel()
        }
    }

    pointTotals() {
        const racialPoints = this.traitList.sumRacials();
        const attributePoints = this.totalAttributesCost();
        const advantages = this.traitList.sumAdvantages();
        const disadvantages = this.traitList.sumDisadvantages();
        const quirks = this.traitList.sumQuirks();
        const skills = this.traitList.sumQuirks();
        const spells = 0;

        return {
            racialPoints,
            attributePoints,
            advantages,
            disadvantages,
            quirks,
            skills,
            spells,
            total: racialPoints + attributePoints + advantages + disadvantages + quirks + skills + spells
        }
    }

    allItems(): Equipment[] {
        return [].concat.apply([],
            [
                this.equipmentList.iter(),
                this.otherEquipmentList.iter()
            ])
    }
    basicLift() {
        const ST = this.ST.calculateLevel();
        return Math.round(ST * ST / 5)
    }
    encumbranceLevel() {
        const basicLift = this.basicLift();
        const carriedWeight = this.carriedWeight(this.equipmentList);
        if (carriedWeight < basicLift) {
            return 0
        } else if (carriedWeight < basicLift * 2) {
            return -1
        } else if (carriedWeight < basicLift * 3) {
            return -2
        } else if (carriedWeight < basicLift * 6) {
            return -3
        } else if (carriedWeight < basicLift * 10) {
            return -4
        }
    }

    encumberedMove() {
        return this.Move.calculateLevel() + this.encumbranceLevel()
    }
    carriedWeight(list: List<Equipment>) {
        return list.iterTop().reduce((prev, cur) => {
            return prev + cur.extendedWeight()
        }, 0)
    }
    carriedValue(list: List<Equipment>) {
        return list.iterTop().reduce((prev, cur) => {
            return prev + cur.extendedValue()
        }, 0)
    }

    dodgeScore() { return Math.floor(this.Speed.calculateLevel() + Attribute.bonusReducer(this, Signature.Dodge) + 3) }
    encumberedDodgeScore() {
        switch (this.encumbranceLevel()) {
            case 0:
                return this.dodgeScore()
            case -1:
                return Math.floor(this.dodgeScore() * .8)
            case -2:
                return Math.floor(this.dodgeScore() * .6)
            case -3:
                return Math.floor(this.dodgeScore() * .4)
            case -4:
                return Math.floor(this.dodgeScore() * .2)
        }
    }
    load(data: any) {
        return this.serializer.load(this, data)
    }
    toR20() {
        return exportR20(this)
    }
}

export enum Signature {
    ST = "ST",
    DX = "DX",
    IQ = "IQ",
    HT = "HT",
    FP = "FP",
    HP = "HP",
    Per = "Per",
    Will = "Will",
    Base = 10,
    Quint = "QT",
    Speed = "Speed",
    Move = "Move",
    Vision = "Vision",
    Hearing = "Hearing",
    TasteSmell = "Taste Smell",
    Touch = "Touch",
    Dodge = "dodge"
}