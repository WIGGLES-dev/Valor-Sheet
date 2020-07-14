import { List, ListItem } from "./misc/list";
import { Modifier, Modifiable } from "./misc/modifier";
import { Character, Featurable } from "./character";
import { Feature, FeatureType } from "./misc/feature";
import { Skill } from "./skill";
import { Trait } from "./trait";
import { objectify, json } from "../utils/json_utils";

export class ItemList extends List<Item> {
    class = Item

    constructor(character: Character) {
        super(character);
    }
}


export class Item extends ListItem<Item> {
    tag = "equipment"

    description: string
    equipped: boolean
    techLevel: string
    legalityClass: string
    quantity: number
    weight: number
    value: number
    containedWeightReduction: string

    modifiers: Set<EquipmentModifier<Item>>

    constructor(list: List<Item>) {
        super(list);
        this.modifiers = new Set();
    }

    private childrenWeight(): number | null {
        return 0
    }
    private childrenValue(): number | null {
        return 0
    }

    extendedWeight() {
        const adjustedWeight = this.adjustedWeight();
        const multiplyBy = this.containedBy && this.containedBy.containedWeightReduction ? 1 - Modifier.extractValue(this.containedBy.containedWeightReduction) / 100 : 1;

        if (this.isContainer()) {
            return (this.childrenWeight() + adjustedWeight) * multiplyBy;
        } else {
            return adjustedWeight * this.quantity
        }
    }

    extendedValue() {
        const adjustedValue = this.adjustedValue();

        if (this.isContainer()) {
            return this.childrenValue() + adjustedValue
        } else {
            return adjustedValue * this.quantity
        }
    }

    getModifiers() { }

    adjustedValue() {
        let modifiers = this.modifiers;
        let value = this.value;
        let cost = Item.processNonCFStep(EquipmentModifierValueType.originalCost, value, modifiers);
        let cf = 0;
        let count = 0;

        this.modifiers.forEach(modifier => {
            if (modifier.enabled && modifier.costType === EquipmentModifierValueType.baseCost) {
                let adj = modifier.cost;
                let mvt = EquipmentModifier.determineCostType(modifier.cost);
                let amt = Modifier.extractValue(adj);

                if (mvt === EquipmentModifierCostValueType.multiplier) {
                    amt -= 1;
                }
                cf += amt;
                count++
            }
        });
        if (cf !== 0) {
            if (cf < EquipmentModifier.minCF) {
                cf = EquipmentModifier.minCF;
            }
            cost *= (cf + 1);
        }
        cost = Item.processNonCFStep(EquipmentModifierValueType.finalBaseCost, cost, modifiers)
        cost = Item.processNonCFStep(EquipmentModifierValueType.finalCost, cost, modifiers);

        return cost > 0 ? cost : 0;
    }

    private static processNonCFStep(costType: EquipmentModifierValueType, value: number, modifiers: Set<EquipmentModifier<Item>>) {
        let percentages = 0;
        let additions = 0;
        let cost = value;

        modifiers.forEach(modifier => {
            if (modifier.enabled && modifier.costType === costType) {
                let adj = modifier.cost;
                let mvt = EquipmentModifier.determineCostType(modifier.cost);
                let amt = Modifier.extractValue(adj);
                console.log(amt, modifier.name, mvt);
                switch (mvt) {
                    case EquipmentModifierCostValueType.addition:
                        additions += amt;
                        break
                    case EquipmentModifierCostValueType.percentage:
                        percentages += amt;
                        break
                    case EquipmentModifierCostValueType.multiplier:
                        cost *= amt;
                        break
                }
            }
        });
        cost += additions;
        if (percentages !== 0) {
            cost += (value * (percentages / 100));
        }
        return cost
    }

    adjustedWeight() {
        let modifiers = this.modifiers;
        let weight = this.weight;

        let percentages = 0;
        let original = this.weight;

        modifiers.forEach(modifier => {
            if (modifier.enabled && modifier.weightType === EquipmentModifierWeightType.originalWeight) {
                let adj = modifier.weight;
                let mvt = EquipmentModifier.determineWeightType(modifier.weight)
                let amt = Modifier.extractValue(adj);
                if (mvt === EquipmentModifierWeightValueType.addition) {
                    weight += amt;
                } else {
                    percentages += amt;
                }
            }
        });

        if (percentages !== 0) {
            original = original *= (percentages / 100);
        }

        weight = Item.processMultiplyAddWeightStep(EquipmentModifierWeightType.baseWeight, weight, modifiers);
        weight = Item.processMultiplyAddWeightStep(EquipmentModifierWeightType.finalBaseWeight, weight, modifiers);
        weight = Item.processMultiplyAddWeightStep(EquipmentModifierWeightType.finalWeight, weight, modifiers);

        if (weight < 0) {
            weight = 0;
        }

        return weight
    }

    private static processMultiplyAddWeightStep(weightType: EquipmentModifierWeightType, weight: number, modifiers: Set<EquipmentModifier<Item>>) {
        let sum = 0;
        modifiers.forEach(modifier => {
            if (modifier.enabled && modifier.weightType === weightType) {
                let adj = modifier.weight;
                let mvt = EquipmentModifier.determineWeightType(adj);
                let fraction = 0;
                switch (mvt) {
                    case EquipmentModifierWeightValueType.multiplier:
                        weight = weight * fraction;
                        break
                    case EquipmentModifierWeightValueType.percentageMultiplier:
                        weight = weight * (fraction / 100);
                        break
                    case EquipmentModifierWeightValueType.addition:
                        weight += fraction;
                    default:
                }
            }
        });
        weight += sum;
        return weight
    }

    toR20() {
        return {
            key: "repeating_item",
            row_id: this.r20rowID,
            data: {
                name: this.description,
                tl: this.techLevel,
                ref: this.reference,
                legality_class: this.legalityClass,
                count: this.quantity,
                cost: this.value,
                weight: this.weight,
                costtotal: this.extendedValue(),
                weighttotal: this.extendedWeight(),
                notes: this.notes
            }
        }
    }
    toJSON() {
        return {}
    }
    loadJSON(object: string | json) {
        object = objectify(object);
        super.loadJSON(object);
        function mapItem(object: json, item: Item) {
            object?.modifiers?.forEach((modifier: json) => item.modifiers.add(new EquipmentModifier(item).loadJSON(modifier)));
            item.description = object.description;
            item.equipped = object.equipped;
            item.quantity = object.quantity;
            item.value = object.value;
            item.techLevel = object.tech_level;
            item.legalityClass = object.legality_class;
        }
        function loadSubElements(object: json, parent: Item) {
            object.children.forEach((object: json) => {
                const subElement = parent.list.addListItem().loadJSON(object);
                subElement.containedBy = parent;
                parent.children.add(subElement);
            });
            return parent
        }
        mapItem(object, this);
        if (object.type.includes("_container")) {
            this.canContainChildren = true;
            loadSubElements(object, this);
        }
        return this
    }
}

class EquipmentModifier<T extends Modifiable> extends Modifier<T> {
    static nodeName = "eqp_modifier"
    static minCF = -0.8

    cost: string
    costType: EquipmentModifierValueType
    weight: string
    weightType: EquipmentModifierWeightType

    constructor(item: T) {
        super(item);
    }

    static determineWeightType(type: string) {
        type = type.trim();
        if (type.endsWith("%")) {
            if (type.startsWith("x")) {
                return EquipmentModifierWeightValueType.percentageMultiplier
            }
            return EquipmentModifierWeightValueType.percentageAdder
        }
        if (type.startsWith("x") || type.endsWith("x")) {
            return EquipmentModifierWeightValueType.multiplier
        }
        return EquipmentModifierWeightValueType.addition
    }
    static determineCostType(type: string) {
        type = type.trim();
        if (type.endsWith("cf")) {
            return EquipmentModifierCostValueType.cf
        }
        if (type.endsWith("%")) {
            return EquipmentModifierCostValueType.percentage
        }
        if (type.startsWith("x") || type.endsWith("x")) {
            return EquipmentModifierCostValueType.multiplier
        }
        return EquipmentModifierCostValueType.addition
    }

    toJSON() {

    }
    loadJSON(object: string | json) {
        object = objectify(object);
        super.loadJSON(object);
        this.cost = object.cost;
        this.weight = object.weight;
        this.costType = object.cost_type;
        this.weightType = object.weightType;
        return this
    }
}

enum EquipmentModifierWeightType {
    originalWeight = "to original weight",
    baseWeight = "to base weight",
    finalBaseWeight = "to final base weight",
    finalWeight = "to final weight",
}

enum EquipmentModifierWeightValueType {
    addition = "+",
    percentageAdder = "%",
    percentageMultiplier = 1,
    multiplier = 0
}

enum EquipmentModifierValueType {
    originalCost = "to original cost",
    baseCost = "to base cost",
    finalBaseCost = "to final base cost",
    finalCost = "to final cost",
}

enum EquipmentModifierCostValueType {
    addition = "+",
    percentage = "%",
    multiplier = "x",
    cf = "cf"
}
