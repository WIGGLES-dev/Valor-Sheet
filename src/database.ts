import "dexie-observable";
import { Dexie } from 'dexie';
import { IDatabaseChange, DatabaseChangeType } from 'dexie-observable/api';
import { State, Change, KeyFunc, change } from "rxdeep";
import { Subject, Observer, Observable } from 'rxjs';
import { debounce, debounceTime, distinct, distinctUntilChanged, filter, last, map, mergeMap, skip, switchMap, takeUntil, tap, throttleTime } from "rxjs/operators";
import { diff } from "deep-object-diff";
export const db = new Dexie('Valor');
const stores = {
    'index': 'id,type'
};
db.version(1).stores(stores);
export const changes$ = new Subject<IDatabaseChange[]>();
db.on("changes", changes => changes$.next(changes));
export async function fetchRecord<T extends Record<string, any>>(tableName: string, key: string) {
    let state: State<T>;
    const table = db.table<T>(tableName);
    const initial = await table.get(key);
    const downstream: Subject<Change<T>> = new Subject();
    const writes: Subject<T> = new Subject();
    const upstream = {
        async next(change) {
            const stamped = stamp(change.value);
            change.value = stamped;
            downstream.next(change);
            writes.next(change.value);
        },
        error(err) { },
        complete() { }
    }
    state = new State<T>(
        initial,
        downstream.pipe(
            distinct(c => c?.value?.__meta__?.lastEdit),
            debounceTime(70),
        ),
        upstream
    );
    writes.pipe(
        debounceTime(250),
        takeUntil(state.pipe(last())),
    ).subscribe((value) => update(tableName, key, value))
    changes$.pipe(
        mergeMap(changes => changes.filter(change => change.table === tableName && change.key === key)),
        map(c => {
            if (c.type === DatabaseChangeType.Create) {
                return {
                    value: c.obj
                }
            }
            else if (c.type === DatabaseChangeType.Update) {
                return {
                    value: c.obj
                }
            } else if (c.type === DatabaseChangeType.Delete) {
                return {
                    value: undefined
                }
            }
        }),
        filter(c => c?.value?.__meta__?.lastEdit > state.value?.__meta__?.lastEdit),
        takeUntil(state.pipe(last()))
    ).subscribe(downstream);
    return state;
}
export function stamp(value) {
    const timestamp = Date.now();
    const createdOn = value?.__meta__?.createdOn ?? timestamp;
    return Object.assign(
        {},
        value,
        {
            __meta__: {
                ...value.__meta__,
                lastEdit: timestamp,
                createdOn,
            }
        }
    )
}
export function isFresh(a, b): boolean {
    return true
}
export async function update(table, key, value) {
    return await db.table(table).update(key, value)
}
export async function fetchTable<T>(tableName: string, keyfunc: KeyFunc<T> = v => v && v["id"]) {
    let state: State<T[]>;
    const table = db.table<T>(tableName);
    const initial = await table.toArray();
    const downstream: Subject<Change<T[]>> = new Subject();
    const upstream: Observer<Change<T[]>> = {
        async next(change) {
            table.bulkPut(change.value);
        },
        error() { },
        complete() { }
    }
    state = new State(initial, downstream, upstream);
    changes$.pipe(
        mergeMap(async changes => {
            const ctv = await table.toArray();
            let ntv = [...ctv || []];
            const ca = changes.filter(change => change.table === tableName);
            for (const c of ca) {
                if (c.type === DatabaseChangeType.Create) {
                    ntv.push(c.obj);
                } else if (c.type === DatabaseChangeType.Delete) {
                    ntv = ntv.filter(record => keyfunc(record) !== c.key)
                } else if (c.type === DatabaseChangeType.Update) {
                    const i = ntv.findIndex(record => keyfunc(record) === c.key);
                    if (keyfunc(ntv[i]) === c.key) ntv[i] = c.obj;
                }
            }
            return { value: ctv };
        }),
        takeUntil(state.pipe(last()))
    ).subscribe(downstream);
    return state.keyed(keyfunc)
}