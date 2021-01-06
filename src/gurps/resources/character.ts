import { combineLatest, from, merge, Observable } from "rxjs";
import { catchError, filter, map, mergeAll, mergeMap, mergeScan, pluck, reduce, startWith, switchMap, toArray } from "rxjs/operators";
import {
    Resource,
    MeleeWeapon,
    RangedWeapon,
    Config,
    AttributeLevel,
    Attribute,
    parseHitLocations,
    HitLocation,
    Gurps,
    Skill,
    Trait,
    Technique,
    Spell,
    split,
    sumTraitArray,
    Equipment,
    TraitCategory,
    Data,
    matchArray,
    each,
    log,
    GResource,
} from "@internal";
import { staticImplements } from "src/utils/decorators";
export interface CharacterData extends Data {
    version: typeof Character["version"]
    type: typeof Character["type"]
    config: Config
    pointTotal: number
    notes: string
    profile: ProfileData
    hitLocationDamage: Record<string, number>,
    attributeLevels: Record<string, AttributeLevel>
}
export interface ProfileData {
    birthPlace?: string
    birthday?: string
    status?: string
    wealth?: string
    income?: string
    expenses?: string
    base?: string
    affiliation?: string
    family?: string
    name?: string
    nickName?: string
    sex?: string
    gender?: string
    race?: string
    handedness?: string
    reaction?: string
    appearanceFeatures?: string
    voice?: string
    age?: string
    appearance?: Appearance
    eyes?: string
    skin?: string
    hair?: string
    facialHair?: string
    build?: string
    weight?: string
    height?: string
    religion?: string
    education?: string
    citizenship?: string
    orientation?: string
    other?: string
    sizeModifier: number
    portrait: string
    cropped?: string
}
export enum Appearance {
    Horrific,
    Monstrous,
    Hideous,
    Unattractive,
    Average,
    Attractive,
    Handsome_Beautiful,
    Very_Handsome_Beautiful,
    Transcendent
}

@staticImplements<GResource<Character>>()
export class Character extends Resource<CharacterData> {
    static type = "character"
    static version = 1
    constructor(identity: Character["identity"]) {
        super(identity);
    }
    selectRangedWeapons() {
        return this.selectChildren({
            type: 'rangedWeapon',
            caster: RangedWeapon,
            maxDepth: Number.POSITIVE_INFINITY
        })
    }
    selectMeleeWeapons() {
        return this.selectChildren({
            type: 'meleeWeapon',
            caster: MeleeWeapon,
            maxDepth: Number.POSITIVE_INFINITY
        })
    }
    selectWeapons() { }
    selectCarriedWeight() {
        return this.selectChildren({
            type: 'equipment',
            caster: Equipment,
            activeOnly: true
        }).pipe(
            mergeMap(each(item => item.selectExtendedWeight())),
            mergeScan((t, w) => w.pipe(map(o => o + t)), 0),
            startWith(0)
        )
    }
    selectEncumbranceLevel() {
        return combineLatest([
            this.selectBasicLift(),
            this.selectCarriedWeight()
        ])
            .pipe(map(([bl, weight]) => Gurps.encumbranceLevel(bl, weight)))
    }

    selectAttributes() {
        const attributes$ = this.sub('config').sub('attributes');
        const attributeLevels$ = this.sub('attributeLevels');
        const bonuses$ = this.selectAllFeatures()
            .pipe(
                matchArray({
                    type: 'attribute bonus'
                })
            );
        return combineLatest([
            attributes$,
            bonuses$,

            attributeLevels$
        ]).pipe(
            map(([attributes, bonuses]) =>
                Object.entries(attributes || {})
                    .reduce((collection, [signature, data]) => {
                        const finalBonus = bonuses
                            ?.filter(b => b['attribute'] === signature)
                            ?.map(f => f['amount'])
                            ?.reduce((t, b) => t + b, 0)
                            ?? 0;
                        collection[signature] = new Attribute(this, data, signature, collection, finalBonus)
                        return collection
                    }, {} as Record<string, Attribute>)
            )
        )
    }
    selectAttribute(key: string) {
        return this.selectAttributes()
            .pipe(
                pluck(key)
            )
    }
    get orderedAttributes$(): Observable<Attribute[]> {
        const order$ = this.sub('config').sub('ui').sub('attributeOrder');
        return combineLatest([
            order$,
            this.selectAttributes()
        ]).pipe(
            map(([order, collection]) => order
                .map(attr => collection[attr])
                .filter(i => i)
            )
        )
    }
    get orderedPools$() {
        return combineLatest([
            this.selectKeys().pipe(
                pluck("config", "ui", "poolOrder")
            ),
            this.selectAttributes()
        ]).pipe(
            map(([order, collection]) => order
                .map(attr => collection[attr])
                .filter(i => i)
            )
        )
    }
    selectHitLocations(): Observable<Record<string, HitLocation>> {
        const locations$ = this.sub('config').sub('locations').pipe(map(parseHitLocations));
        const hitPoints$ = this.selectAttribute('hit points').pipe(map(hp => hp?.calculateLevel() ?? 10));
        const damageTaken$ = this.sub('hitLocationDamage');
        return combineLatest([
            locations$,
            hitPoints$,
            this.selectAllFeatures().pipe(
                matchArray({
                    type: "armor bonus"
                })
            ),
            damageTaken$
        ]).pipe(
            map(([locations, hitPoints, bonuses]) => Object.entries(locations)
                .reduce((locations, [location, data]) => {
                    const armorBonus = bonuses
                        ?.filter(f => f['location'] === location)
                        ?.map(b => b['amount'])
                        ?.reduce((t, b) => t + b, 0)
                        ?? 0;
                    locations[location] = new HitLocation(this, data, location, locations, {
                        armorBonus,
                        hitPoints
                    })
                    return locations
                }, {} as Record<string, HitLocation>)
            )
        )
    }
    selectHitLocation(key: string) {
        return this.selectHitLocations()
            .pipe(
                pluck(key)
            )
    }
    get hitLocations$() { return this.selectHitLocations() }
    get swingDamage$() {
        return this
            .selectAttribute("striking strength")
            .pipe(
                map(attribute =>
                    Gurps.getSwingDamage(
                        attribute
                            ?.calculateLevel()
                        ?? 10)
                )
            )
    }
    get thrustDamage$() {
        return this
            .selectAttribute("striking strength")
            .pipe(
                map(attribute =>
                    Gurps.getThrustDamage(
                        attribute
                            ?.calculateLevel()
                        ?? 10)
                )
            )
    }
    selectBasicLift() {
        return this
            .selectAttribute("lifting strength")
            .pipe(
                map(attribute =>
                    Gurps
                        .basicLift(
                            attribute
                                ?.calculateLevel()
                            ?? 10
                        ))
            )
    }
    get pointTotal$() {
        const sumSkillLike = (src: Observable<(Skill | Technique | Spell)[]>) => src.pipe(
            map(each(s => s.getKeys())),
            map(each(s => s.points)),
            map(n => n.reduce((t, p) => t + p, 0))
        )
        return combineLatest([
            this.keys$,
            this.selectAttributes() as Observable<Record<string, Attribute>>,
            this.selectChildren({ type: "trait", caster: Trait }).pipe(map(split)),
            this.selectChildren({ type: "skill", caster: Skill }).pipe(sumSkillLike),
            this.selectChildren({ type: "technique", caster: Technique }).pipe(sumSkillLike),
            this.selectChildren({ type: "spell", caster: Spell }).pipe(sumSkillLike)
        ]).pipe(
            map(([data, attributes, traits, skills, techniques, spells]) => {
                const total = data.pointTotal;
                const attributePoints = Object.values(attributes).reduce(
                    (points, attribute) => points + (attribute.pointsSpent() || 0), 0
                );
                const racialPoints = sumTraitArray(traits[TraitCategory.Racial]);
                const advantages = sumTraitArray(traits[TraitCategory.Advantage]);
                const perks = sumTraitArray(traits[TraitCategory.Perk]);
                const disadvantages = sumTraitArray(traits[TraitCategory.Disadavantage]);
                const quirks = sumTraitArray(traits[TraitCategory.Quirk]);
                const spent =
                    + attributePoints
                    + racialPoints
                    + advantages
                    + perks
                    + disadvantages
                    + quirks
                    + skills
                    + techniques
                    + spells;
                return {
                    attributePoints,
                    racialPoints,
                    advantages,
                    perks,
                    disadvantages,
                    quirks,
                    skills,
                    techniques,
                    spells,
                    spent,
                    total,
                    unspent: total - spent
                }
            })
        )
    }
}