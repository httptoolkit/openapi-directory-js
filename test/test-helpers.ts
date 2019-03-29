import * as _ from 'lodash';
import { TrieData } from '../src/runtime/trie';

// Some messy but convenient helpers, to make defining test data a bit
// friendlier than trying to do so by building maps from array entries
// data by hand.
interface ObjInput {
    [key: string]: string | string[];
}
export function objToInput(object: ObjInput) {
    return new Map(
        (
            Object.entries(object)
            .map(([key, value]) => [[key], value])
        ) as Array<[Array<string>, string | string[]]>
    );
}

interface ObjTrie {
    [key: string]: string | string[] | ObjTrie;
}
export function objToTrie(object: string): string;
export function objToTrie(object: string[]): string[];
export function objToTrie(object: ObjTrie): TrieData;
export function objToTrie(object: ObjTrie | string | string[]): TrieData | string | string[];
export function objToTrie(object: ObjTrie | string | string[]): TrieData | string | string[] {
    if (_.isArray(object) || _.isString(object)) return object;

    return new Map(
        (
            Object.entries(object)
            .map(([key, value]) => [key, objToTrie(value)])
        ) as Array<[string, string | string[]]>
    );
}

type TrieInputEntry = [Array<string | RegExp>, string | string[]];
type TrieEntry = [string | RegExp, string | string[] | TrieData];
export function t(entries: Array<TrieInputEntry>): Map<
    Array<string | RegExp>,
    string | string[]
>;
export function t(entries: Array<TrieEntry>): TrieData;
export function t(entries: Array<TrieEntry | TrieInputEntry>) {
    return new Map<any, any>(entries);
}