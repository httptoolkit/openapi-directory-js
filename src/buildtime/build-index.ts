import * as _ from 'lodash';
import { TrieData, isLeafValue } from "../runtime/trie";

export function buildTrie(map: { [key: string]: string | string[] }): TrieData {
    return optimizeTrie(buildNaiveTrie(map));
}

// Build a simple naive trie. One level per char, string nodes at the leaves,
// and '' keys for leaf nodes half way down paths.
export function buildNaiveTrie(map: { [key: string]: string | string[] }): TrieData {
    const root = <TrieData>{};

    // For each key, make a new level for each char in the key (or use an existing
    // level), and place the leaf when we get to the end of the key.

    _.forEach(map, (value, key) => {
        let trie: TrieData = root;
        _.forEach(key, (char, i) => {
            let nextStep = trie[char];

            if (i === key.length - 1) {
                // We're done - write our value into trie[char]

                if (isLeafValue(nextStep)) {
                    throw new Error('Duplicate key'); // Should really never happen
                } else if (typeof nextStep === 'object') {
                    // We're half way down another key - add an empty branch
                    nextStep[''] = value;
                } else {
                    // We're a fresh leaf at the end of a branch
                    trie[char] = value;
                }
            } else {
                // We have more to go - iterate into trie[char]

                if (isLeafValue(nextStep)) {
                    // We're at what is currently a leaf value
                    // Transform it into a node with '' for the value.
                    nextStep = { '': nextStep };
                    trie[char] = nextStep;
                } else if (typeof nextStep === 'undefined') {
                    // We're adding a new branch to the trie
                    nextStep = {};
                    trie[char] = nextStep;
                }

                trie = nextStep;
            }
        });
    });

    return root;
}

// Compress the trie. Any node with only one child can be combined
// with the child node instead. This results in keys of >1 char, but
// all keys in any given object still always have the same length,
// except for terminated strings.
export function optimizeTrie(trie: TrieData): TrieData {
    if (_.isString(trie)) return trie;

    const keys = Object.keys(trie);

    if (keys.length === 0) return trie;

    if (keys.length === 1) {
        const [key] = keys;
        const child = trie[key]!;

        if (isLeafValue(child)) return trie;

        // Don't combine if our child has a leaf node attached - this would break
        // search (en route leaf nodes need to always be under '' keys)
        if (!child['']) {
            // Return the only child, with every key prefixed with this key
            const newChild = optimizeTrie(
                _.mapKeys(child, (_value, childKey) => key + childKey)
            );

            return newChild;
        }
    }

    if (keys.length === 2 && _.includes(keys, '')) {
        const [key] = keys.filter(k => k !== '');
        const child = trie[key]!;

        const childKeys = Object.keys(child);
        if (!isLeafValue(child) && childKeys.length === 1 && childKeys[0] !== '') {
            // If child has only one key and it's not '', pull it up.
            return optimizeTrie({
                '': trie[''],
                [key + childKeys[0]]: child[childKeys[0]]
            });
        }
    }

    // Recursive DFS through the child values to optimize them in turn
    return _.mapValues(trie, (child) => {
        if (isLeafValue(child)) return child;
        else return optimizeTrie(child!);
    });
}