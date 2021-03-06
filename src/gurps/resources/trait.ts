import { Data, Entity } from "@app/entity";
import { Character, CharacterData } from "./character";
export interface TraitModifierData {
  type: "trait modifier";
  enabled: boolean;
  name: string;
  cost: number;
  costType: TraitModifierType;
  levels: number;
  hasLevels: boolean;
  affects: TraitModifierAffects;
}
export enum ControlRating {
  CannotResist = "none",
  ResistRarely = 6,
  ResistFairlyOften = 9,
  ResistQuiteOften = 12,
  ResistAlmostAlway = 15,
  NoneRequired = "n/a",
}
export enum TraitModifierType {
  Percentage = "percentage",
  Points = "points",
  Multiplier = "multiplier",
}
export enum TraitModifierAffects {
  Base = "base only",
  Levels = "levels only",
  Total = "total",
}
export enum TraitType {
  Mental = "Mental",
  Physical = "Physical",
  Social = "Social",
  Exotic = "Exotic",
}
export interface TraitData extends Data {
  version__: typeof Trait["version"];
  type: typeof Trait["type"];
  basePoints: number;
  hasLevels: boolean;
  levels: number;
  pointsPerLevel: number;
  allowHalfLevel: boolean;
  hasHalfLevel: boolean;
  roundDown: boolean;
  controlRating: ControlRating;
  types: TraitType[];
  modifiers: TraitModifierData[];
}

export class Trait extends Entity<CharacterData, TraitData> {
  static version = 1 as const;
  static type = "trait" as const;
  character: Character;
  constructor(character, trait, ...args) {
    super(character, trait, ...args);
    this.character =
      character instanceof Character ? character : new Character(character);
  }
  get children() {
    return (
      this.getValue()
        ?.children?.map(({ id }) => this.character.embedded[id])
        ?.filter((e): e is Trait => e instanceof Trait) ?? []
    );
  }
  getAdjustedPoints(): number {
    return this.children.reduce((total, trait) => {
      return total + trait.getAdjustedPoints();
    }, calculateTraitCost(this.getValue()));
  }
  getTraitType() {
    return getTraitType(this.getValue());
  }
  process() {
    const pd = {
      adjustedPoints: this.getAdjustedPoints(),
      traitType: this.getTraitType(),
    };
    return { ...super.process(), ...pd };
  }
}

export function calculateTraitCost({
  basePoints = 0,
  hasLevels = false,
  levels = 0,
  hasHalfLevel = false,
  roundDown = false,
  controlRating = ControlRating.NoneRequired,
  pointsPerLevel = 0,
  children = [],
}: TraitData) {
  let baseEnh = 0;
  let levelEnh = 0;
  let baseLim = 0;
  let levelLim = 0;
  let multiplier = getControlRatingMultipland(controlRating);
  const modifiers = children?.filter((e) => e && e.type === "trait modifier");
  for (const modifier of modifiers) {
    const {
      enabled = false,
      costType = TraitModifierType.Points,
      affects = TraitModifierAffects.Total,
      cost = 0,
      levels = 1,
      hasLevels = false,
    } = modifier;
    if (enabled) {
      let mod = hasLevels && levels > 0 ? cost * levels : cost;
      switch (costType) {
        case TraitModifierType.Percentage:
        default:
          switch (affects) {
            case TraitModifierAffects.Total:
            default:
              if (mod < 0) {
                baseLim += mod;
                levelLim += mod;
              } else {
                baseEnh += mod;
                levelEnh += mod;
              }
              break;
            case TraitModifierAffects.Base:
              if (mod < 0) {
                baseLim += mod;
              } else {
                baseEnh += mod;
              }
              break;
            case TraitModifierAffects.Levels:
              if (mod < 0) {
                levelLim += mod;
              } else {
                levelEnh += mod;
              }
              break;
          }
          break;
        case TraitModifierType.Points:
          switch (affects) {
            case TraitModifierAffects.Total:
            case TraitModifierAffects.Base:
            default:
              basePoints += mod;
              break;
            case TraitModifierAffects.Levels:
              pointsPerLevel += mod;
              break;
          }
          break;
        case TraitModifierType.Multiplier:
          multiplier *= mod;
          break;
      }
    }
  }

  let modifiedBasePoints = basePoints;

  let leveledPoints = hasLevels
    ? pointsPerLevel * (levels + (hasHalfLevel ? 0.5 : 0)) || 0
    : 0;
  if (baseEnh !== 0 || baseLim !== 0 || levelEnh !== 0 || levelLim !== 0) {
    if (false) {
      //TODO multiplicative modifiers
    } else {
      let baseMod = Math.max(baseEnh + baseLim, -80);
      let levelMod = Math.max(levelEnh + levelLim, -80);

      modifiedBasePoints =
        baseMod === levelMod
          ? modifyPoints(modifiedBasePoints + leveledPoints, baseMod)
          : modifyPoints(modifiedBasePoints, baseMod) +
            modifyPoints(leveledPoints, levelMod);
    }
  } else {
    modifiedBasePoints += leveledPoints;
  }
  return (
    applyRounding(modifiedBasePoints * multiplier, Boolean(roundDown)) || 0
  );
}

function getControlRatingMultipland(cr: ControlRating) {
  switch (cr) {
    case ControlRating.CannotResist:
      return 2.5;
    case ControlRating.ResistRarely:
      return 2;
    case ControlRating.ResistFairlyOften:
      return 1.5;
    case ControlRating.ResistQuiteOften:
      return 1;
    case ControlRating.ResistAlmostAlway:
      return 0.5;
    default:
      return 1;
  }
}

export function modifyPoints(points: number, modifier: number) {
  return points + calculateModifierPoints(points, modifier);
}
export function calculateModifierPoints(points: number, modifier: number) {
  return points * (modifier / 100);
}
export function applyRounding(value: number, roundCostDown: boolean) {
  return roundCostDown ? Math.floor(value) : Math.ceil(value);
}

export interface TraitModifier {
  enabled: boolean;
  cost: number;
  costType: TraitModifierType;
  levels: number;
  affects: TraitModifierAffects;
  hasLevels: boolean;
}

export enum TraitCategory {
  Advantage = "advantage",
  Perk = "perk",
  Disadavantage = "disadvantage",
  Quirk = "quirk",
  Feature = "feature",
  Racial = "racial",
  Meta = "meta",
  Language = "language",
  Culture = "culture",
  Never = -1,
}

export function isAdvantage(trait: TraitData) {
  return (
    trait.basePoints > 1 ||
    trait.pointsPerLevel > 1 ||
    calculateTraitCost(trait) > 1
  );
}
export function isPerk(trait: TraitData) {
  return (
    (trait.basePoints === 1 || !trait.basePoints) &&
    (trait.hasLevels && trait.levels > Number.NEGATIVE_INFINITY
      ? trait.pointsPerLevel === 1
      : true) &&
    calculateTraitCost(trait) !== 0
  );
}
export function isDisadvantage(trait: TraitData) {
  return (
    trait.basePoints < -1 ||
    trait.pointsPerLevel < -1 ||
    calculateTraitCost(trait) < -1
  );
}
export function isQuirk(trait: TraitData) {
  return (
    (trait.basePoints === -1 || !trait.basePoints) &&
    (trait.hasLevels && trait.levels > Number.NEGATIVE_INFINITY
      ? trait.pointsPerLevel === -1
      : true) &&
    calculateTraitCost(trait) !== 0
  );
}
export function isFeature(trait: TraitData) {
  return (
    !trait.basePoints &&
    !trait.pointsPerLevel &&
    calculateTraitCost(trait) === 0
  );
}

export function getCategory(tags: string[]) {
  const categories = tags?.join(" ") ?? "";
  if (/meta/i.test(categories)) return TraitCategory.Meta;
  if (/racial/i.test(categories)) return TraitCategory.Racial;
  if (/quirk/i.test(categories)) return TraitCategory.Quirk;
  if (/disadvantage/i.test(categories)) return TraitCategory.Disadavantage;
  if (/perk/i.test(categories)) return TraitCategory.Perk;
  if (/advantage/i.test(categories)) return TraitCategory.Advantage;
  if (/feature/i.test(categories)) return TraitCategory.Feature;
  return -1;
}

export function getContainerType(traits: TraitData[]) {
  let racial = false;
  let perk = false;
  let advantage = false;
  let quirk = false;
  let disadvantage = false;
  let feature = false;

  // iterate once over the children and gather the information we need to determine the type
  let types = traits.map((child) => {
    let type = getTraitType(child);
    switch (type) {
      case TraitCategory.Racial:
        racial = true;
        break;
      case TraitCategory.Perk:
        perk = true;
        break;
      case TraitCategory.Advantage:
        advantage = true;
        break;
      case TraitCategory.Quirk:
        quirk = true;
        break;
      case TraitCategory.Disadavantage:
        disadvantage = true;
        break;
      case TraitCategory.Feature:
        feature = true;
        break;
    }
    return type;
  });

  // no need to check for all conditions, they couldn't show up if the previous one returns
  if (!types.some((type) => type !== TraitCategory.Racial))
    return TraitCategory.Racial;
  if (!types.some((type) => type !== TraitCategory.Advantage))
    return TraitCategory.Advantage;
  if (!types.some((type) => type !== TraitCategory.Perk))
    return TraitCategory.Perk;
  if (!types.some((type) => type !== TraitCategory.Disadavantage))
    return TraitCategory.Disadavantage;
  if (!types.some((type) => type !== TraitCategory.Quirk))
    return TraitCategory.Quirk;
  if (!types.some((type) => type !== TraitCategory.Feature))
    return TraitCategory.Feature;

  // if we don't have a homogenous container put it into meta traits
  if (!advantage && !perk && (disadvantage || quirk))
    return TraitCategory.Disadavantage;
  if (!disadvantage && !quirk && (advantage || perk))
    return TraitCategory.Advantage;
  return TraitCategory.Meta;
}

export function getTraitType(trait: TraitData) {
  if (!trait) return TraitCategory.Never;
  const { categories } = trait;
  //const children = (trait?.children?.trait ?? []) as TraitData[]
  const children: TraitData[] =
    trait?.children?.filter((d): d is TraitData => d.type === "trait") ?? [];
  let type = getCategory(categories);
  if (children.length > 0) {
    return getContainerType(children);
  }
  if (type !== TraitCategory.Never) return type;
  const advantage = isAdvantage(trait);
  const perk = isPerk(trait);
  const disadvantage = isDisadvantage(trait);
  const quirk = isQuirk(trait);
  const feature = isFeature(trait);
  if (disadvantage) return TraitCategory.Disadavantage;
  if (quirk) return TraitCategory.Quirk;
  if (advantage) return TraitCategory.Advantage;
  if (perk) return TraitCategory.Perk;
  if (feature) return TraitCategory.Feature;
  type = TraitCategory.Meta;
  return type;
}

export function split(traits: TraitData[]) {
  if (!traits) return {};
  const splits = {
    [TraitCategory.Advantage]: traits.filter(
      (trait) => getTraitType(trait) === TraitCategory.Advantage
    ),
    [TraitCategory.Disadavantage]: traits.filter(
      (trait) => getTraitType(trait) === TraitCategory.Disadavantage
    ),
    [TraitCategory.Racial]: traits.filter(
      (trait) => getTraitType(trait) === TraitCategory.Racial
    ),
    [TraitCategory.Meta]: traits.filter(
      (trait) => getTraitType(trait) === TraitCategory.Meta
    ),
    [TraitCategory.Perk]: traits.filter(
      (trait) => getTraitType(trait) === TraitCategory.Perk
    ),
    [TraitCategory.Quirk]: traits.filter(
      (trait) => getTraitType(trait) === TraitCategory.Quirk
    ),
    [TraitCategory.Feature]: traits.filter(
      (trait) => getTraitType(trait) === TraitCategory.Feature
    ),
  };
  return removeDuplicates(splits);
}

export function sumTraitArray(traits: TraitData[]) {
  return (
    traits?.reduce((total, trait) => calculateTraitCost(trait) + total, 0) ?? 0
  );
}

/**
 * Reducing Algorithm to remove duplicates from derived lists. Any item that appears
 * in the list later on, based on the order of the keys. Things earlier in the lists will
 * be overridden by things later in the list. Be sure to account for that when using this function.
 * @param lists A series of lists to remove the duplicates from
 */
export function removeDuplicates<T extends { id: string }>(lists: {
  [key: string]: T[];
}) {
  const checked = new Set();
  return Object.entries(lists).reduce((prev, [type, list]) => {
    checked.add(type);
    const checkAgainst = Object.entries(lists)
      .filter(([key1, list]) => {
        type !== key1 && !checked.has(key1);
      })
      .flatMap((values) => values[1])
      .map((list) => list.id);
    let newCollection = list.filter((item) => !checkAgainst.includes(item.id));
    prev[type] = newCollection;
    return prev;
  }, {} as Record<string, T[]>);
}
