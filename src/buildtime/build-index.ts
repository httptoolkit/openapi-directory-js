import * as _ from 'lodash';
import { TrieData } from "../runtime/trie";

export function buildApiIndex(rootPath: string) {
    // Loop over every spec in rootPath
    // Get their base paths
    // Build a trie from the base paths
    // Compress the trie
}

export function buildTrie(map: { [key: string]: string }): TrieData {
    return optimizeTrie(buildNaiveTrie(map));
}

// Build a simple naive trie. One level per char, string nodes at the leaves,
// and '' keys for leaf nodes half way down paths.
export function buildNaiveTrie(map: { [key: string]: string }): TrieData {
    const root = <TrieData>{};

    _.forEach(map, (value, key) => {
        let trie: TrieData = root;
        _.forEach(key, (char, i) => {
            let nextStep = trie[char];

            if (i === key.length - 1) {
                // We're done - write our value into trie[char]

                if (_.isString(nextStep)) {
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

                if (typeof nextStep === 'string') {
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
        const child = trie[key];

        if (_.isString(child)) return trie;

        // Return the only child, with every key prefixed with this key
        const newChild = optimizeTrie(
            _.mapKeys(child, (_value, childKey) => key + childKey)
        );

        return newChild;
    } else {
        // DFS through the child values
        return _.mapValues(trie, (child) => {
            if (_.isString(child)) return child;
            else return optimizeTrie(child!);
        });
    }
}