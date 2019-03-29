import * as _ from 'lodash';
import { TrieData, isLeafValue, TrieValue } from "../runtime/trie";

type TrieInput = Map<
    Array<string | RegExp>,
    string | string[]
>;

export function buildTrie(map: TrieInput): TrieData {
    return optimizeTrie(buildNaiveTrie(map));
}

// Build a simple naive trie. One level per char, string nodes at the leaves,
// and '' keys for leaf nodes half way down paths.
export function buildNaiveTrie(map: TrieInput): TrieData {
    const root = <TrieData>new Map();

    // For each key, make a new level for each char in the key (or use an existing
    // level), and place the leaf when we get to the end of the key.

    for (let [keys, value] of map) {
        let trie: TrieData = root;

        const keyChunks = _.flatMap<string | RegExp, string | RegExp>(keys, (key) => {
            if (_.isRegExp(key)) return key;
            else return key.split('');
        });
        _.forEach(keyChunks, (chunk, i) => {
            let nextStep = chunk instanceof RegExp ?
                trie.get(_.find([...trie.keys()], k => _.isEqual(chunk, k))!) :
                trie.get(chunk);

            let isLastChunk = i === keyChunks.length - 1;

            if (isLastChunk) {
                // We're done - write our value into trie[char]

                if (isLeafValue(nextStep)) {
                    throw new Error('Duplicate key'); // Should really never happen
                } else if (typeof nextStep === 'object') {
                    // We're half way down another key - add an empty branch
                    nextStep.set('', value);
                } else {
                    // We're a fresh leaf at the end of a branch
                    trie.set(chunk, value);
                }
            } else {
                // We have more to go - iterate into trie[char]

                if (isLeafValue(nextStep)) {
                    // We're at what is currently a leaf value
                    // Transform it into a node with '' for the value.
                    nextStep = new Map([['', nextStep]]);
                    trie.set(chunk, nextStep);
                } else if (typeof nextStep === 'undefined') {
                    // We're adding a new branch to the trie
                    nextStep = new Map();
                    trie.set(chunk, nextStep);
                }

                trie = nextStep;
            }
        });
    }

    return root;
}

// Compress the trie. Any node with only one child can be combined
// with the child node instead. This results in keys of >1 char, but
// all keys in any given object still always have the same length,
// except for terminated strings.
export function optimizeTrie(trie: TrieData): TrieData {
    if (_.isString(trie)) return trie;

    const keys = [...trie.keys()].filter(k => k !== '');

    if (keys.length === 0) return trie;

    if (keys.length === 1) {
        // If this level has one string key, combine it with the level below
        const [key] = keys;
        const child = trie.get(key)!;

        // If the child is a final value, we can't combine this key with it, and we're done
        // TODO: Could optimize further here, and pull the child up in this case?
        // (Only if trie.size === 1 too). Seems unnecessary for now, a little risky.
        if (isLeafValue(child)) return trie;

        if (
            // Don't combine if our child has a leaf node attached - this would break
            // search (en route leaf nodes need to always be under '' keys)
            !child.get('') &&
            // If this key or any child key is a regex, we don't try to combine the
            // keys together. It's possible to do so, but a little messy,
            // not strictly necessary, and hurts runtime perf (testing up to N regexes
            // is worse than testing 1 regex + 1 string hash lookup).
            !_.isRegExp(keys[0]) &&
            !_.some([...child.keys()], k => _.isRegExp(k))
        ) {
            // Replace this node with the only child, with every key prefixed with this key
            const collapsedChild = mapMap(child, (childKey, value) =>
                // We know keys are strings because we checked above
                [key + (childKey as string), value]
            );
            // We might still have an en-route leaf node at this level - don't lose it.
            if (trie.get('')) collapsedChild.set('', trie.get(''));
            // Then we reoptimize this same level again (we might be able to to collapse further)
            return optimizeTrie(collapsedChild);
        }
    }

    // Recursive DFS through the child values to optimize them in turn
    return mapMap(trie, (key, child): [string | RegExp, TrieValue] => {
        if (isLeafValue(child)) return [key, child];
        else return [key, optimizeTrie(child!)];
    });
}

function mapMap<K, V, K2, V2>(
    map: Map<K, V>,
    mapping: (a: K, b: V) => [K2, V2]
): Map<K2, V2> {
    return new Map(
        Array.from(map, ([k, v]) => mapping(k, v))
    );
}