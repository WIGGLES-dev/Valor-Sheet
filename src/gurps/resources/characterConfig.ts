import type { AttributeData, AttributeLevel, HitLocationData } from "@app/gurps/resources/character";
export interface Config {
    equipment: {
        locations: string[]
    }
    ui: {
        rolling: boolean
        attributeOrder: string[]
        poolOrder: string[]
    }
    rulesets: {
        useMultiplicativeModifiers: boolean
        useKnowingYourOwnStrength: boolean
        useReducedSwingDamage: boolean
        useNoSchoolGrognardReducedSwingDamage: boolean
    }
    attributes: Record<string, AttributeData>
    locations: Record<string, HitLocationData>
}
interface ParsedHitLocationData extends HitLocationData {
    location: string
    subLocations: string[]
    genericLocation: string
}
export function parseHitLocations(locations: Record<string, HitLocationData>) {
    const hitLocations = Object.entries(locations).reduce(
        (locations, [location, data]) => {
            let toCreate = [{
                location,
                subLocations: data.subLocations || []
            }];
            if (data.has instanceof Array) {
                toCreate = data.has?.map(specifier => ({
                    location: `${specifier} ${location}`,
                    subLocations: data.subLocations?.map(
                        location => `${specifier} ${location}`
                    )
                }))
            }
            const newLocations = toCreate.map(({ location, subLocations }) => {
                return Object.assign({}, data, {
                    location,
                    subLocations,
                    genericLocation: location,
                })
            })
            newLocations.forEach(data => {
                locations[data.location] = data
            });
            return locations
        }, {} as Record<string, ParsedHitLocationData>)
    return hitLocations
}